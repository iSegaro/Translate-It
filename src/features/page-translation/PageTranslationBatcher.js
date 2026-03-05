import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { MessageFormat, MessageContexts } from '@/shared/messaging/core/MessagingCore.js';
import { TranslationMode } from '@/shared/config/config.js';
import { getTranslationApiAsync, getTargetLanguageAsync } from '@/config.js';
import { AUTO_DETECT_VALUE } from '@/shared/config/constants.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';
import { NOTIFICATION_TIME } from '@/shared/config/constants.js';
import { PageTranslationHelper } from './PageTranslationHelper.js';
import { RTL_LANGUAGES, TEXT_TAGS, DEFAULT_PAGE_TRANSLATION_SETTINGS } from './PageTranslationConstants.js';

export class PageTranslationBatcher {
  constructor(logger) {
    this.logger = logger;
    this.queue = [];
    this.batchTimer = null;
    this.translatedCount = 0;
    this.activeFlushes = 0;
    this.fatalErrorOccurred = false;
    this.isFirstBatch = true;
    this.isTranslated = false;
    this.translationSessionId = null;
    this.sessionContext = null;
    
    this.settings = { ...DEFAULT_PAGE_TRANSLATION_SETTINGS };
  }

  setSettings(settings) {
    this.settings = { ...this.settings, ...settings };
  }

  setTranslationState(isTranslated, sessionId, sessionContext = null) {
    this.isTranslated = isTranslated;
    this.translationSessionId = sessionId;
    this.sessionContext = sessionContext;
    if (!isTranslated) {
      this.stop();
    }
  }

  reset() {
    this.stop();
    this.translatedCount = 0;
    this.fatalErrorOccurred = false;
    this.translationSessionId = null;
    this.sessionContext = null;
  }

  stop() {
    this.isTranslated = false;
    this.sessionContext = null;
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    if (this.queue.length > 0) {
      const itemsToReject = [...this.queue];
      this.queue = [];
      itemsToReject.forEach(item => {
        try { item.resolve(item.text); } catch (_) {}
      });
    }
    this.activeFlushes = 0;
    this.isFirstBatch = true;
  }

  /**
   * Pure enqueue without node tracking.
   * Rely on domtranslator's internal scheduling for efficiency.
   */
  async enqueue(text, context = null) {
    // If context is provided, it must match the current session context
    if (context && context !== this.sessionContext) {
      return text;
    }

    if (!this.isTranslated || this.fatalErrorOccurred || !text || !text.trim()) {
      return text;
    }
    
    if (!PageTranslationHelper.shouldTranslate(text)) {
      return text;
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ text: text.trim(), resolve, reject, context });

      if (this.queue.length >= this.settings.chunkSize) {
        this.flush();
      } else {
        if (this.batchTimer) clearTimeout(this.batchTimer);
        const debounceDelay = this.isFirstBatch ? 800 : 2000;
        this.batchTimer = setTimeout(() => this.flush(), debounceDelay);
      }
    });
  }

  async flush() {
    if (!this.isTranslated || this.queue.length === 0) {
      if (!this.isTranslated && this.queue.length > 0) {
        this.stop(); // Ensure cleanup if we have items but are not translating
      }
      return;
    }
    
    if (this.activeFlushes >= (this.settings.maxConcurrentFlushes || 1)) {
      if (!this.batchTimer && this.isTranslated) {
        this.batchTimer = setTimeout(() => this.flush(), 500);
      }
      return;
    }

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    const flushContext = this.sessionContext;
    this.activeFlushes++;
    let currentBatch = [];

    try {
      // RE-CHECK: Ensure we are still translating before starting heavy work
      if (!this.isTranslated) return;

      const config = await this._getBatchConfig();
      // ... rest of the code logic remains similar but with more checks ...
      let itemsToProcess = 0;
      let currentChars = 0;
      for (const item of this.queue) {
        if (item.context && item.context !== flushContext) break;
        const itemLen = item.text.length;
        if (itemsToProcess >= config.chunkSize || (currentChars + itemLen > config.maxChars && itemsToProcess > 0)) break;
        currentChars += itemLen;
        itemsToProcess++;
      }
      
      currentBatch = this.queue.splice(0, itemsToProcess);

      if (currentBatch.length === 0 || !this.isTranslated || (flushContext && flushContext !== this.sessionContext)) {
        return;
      }

      this.isFirstBatch = false;
      const textsToTranslate = currentBatch.map(item => ({ text: item.text }));
      
      const batchMessage = MessageFormat.create(
        MessageActions.PAGE_TRANSLATE_BATCH,
        {
          text: JSON.stringify(textsToTranslate),
          provider: config.providerRegistryId,
          sourceLanguage: AUTO_DETECT_VALUE, 
          targetLanguage: config.targetLanguage,
          mode: TranslationMode.Page,
          options: { rawJsonPayload: true },
          sessionId: this.translationSessionId
        },
        MessageContexts.CONTENT
      );

      // FINAL CHECK: Before making the network call
      if (!this.isTranslated) {
        throw new Error('Session stopped');
      }

      const result = await sendRegularMessage(batchMessage, { timeout: 60000 });

      // After async call, verify context still matches
      if (!this.isTranslated || (flushContext && flushContext !== this.sessionContext)) {
        throw new Error('Session changed or stopped');
      }

      if (!result?.success) throw new Error(result?.error || 'Batch translation failed');

      const translatedTexts = JSON.parse(result.translatedText);
      
      currentBatch.forEach((item, index) => {
        item.resolve(translatedTexts[index]?.text || translatedTexts[index] || item.text);
        this.translatedCount++;
      });

      this._reportProgress();
    } catch (error) {
      if (error.message !== 'Session changed or stopped' && error.message !== 'Session stopped') {
        this._handleBatchError(error, currentBatch);
      } else {
        currentBatch.forEach(item => { try { item.resolve(item.text); } catch (_) {} });
      }
    } finally {
      this.activeFlushes--;
      if (this.queue.length > 0 && this.isTranslated) {
        if (this.batchTimer) clearTimeout(this.batchTimer);
        this.batchTimer = setTimeout(() => this.flush(), 50);
      } else if (!this.isTranslated && this.queue.length > 0) {
        // Force cleanup of leftover items if session stopped while processing
        this.stop();
      }
    }
  }

  async _getBatchConfig() {
    const providerRegistryId = await getTranslationApiAsync();
    const targetLanguage = await getTargetLanguageAsync();
    const { registryIdToName, isProviderType, ProviderTypes } = await import('@/features/translation/providers/ProviderConstants.js');
    const { CONFIG: globalConfig } = await import('@/shared/config/config.js');
    const providerName = registryIdToName(providerRegistryId);
    const isAI = isProviderType(providerName, ProviderTypes.AI);

    return {
      providerRegistryId,
      targetLanguage,
      chunkSize: this.settings.chunkSize,
      maxChars: isAI ? globalConfig.WHOLE_PAGE_AI_MAX_CHARS : globalConfig.WHOLE_PAGE_MAX_CHARS
    };
  }

  _handleBatchError(error, batch) {
    if (this.fatalErrorOccurred) return;
    const errorType = matchErrorToType(error);
    if ([ErrorTypes.QUOTA_EXCEEDED, ErrorTypes.RATE_LIMIT_REACHED].includes(errorType)) {
      this.fatalErrorOccurred = true;
      pageEventBus.emit('page-translation-fatal-error', { error, errorType });
    } else {
      ErrorHandler.getInstance().handle(error, {
        type: ErrorTypes.PAGE_TRANSLATION_STOPPED,
        context: 'page-translation',
        showToast: true,
        duration: NOTIFICATION_TIME.ERROR
      });
    }
    batch.forEach(item => { try { item.resolve(item.text); } catch (_) {} });
    pageEventBus.emit(MessageActions.PAGE_TRANSLATE_ERROR, { error: error.message || String(error), errorType, isFatal: false });
  }

  _reportProgress() {
    pageEventBus.emit(MessageActions.PAGE_TRANSLATE_PROGRESS, { translated: this.translatedCount, progress: -1 });
  }
}
