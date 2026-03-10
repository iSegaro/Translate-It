import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { MessageFormat, MessageContexts } from '@/shared/messaging/core/MessagingCore.js';
import { TranslationMode } from '@/shared/config/config.js';
import { getTranslationApiAsync, getTargetLanguageAsync } from '@/config.js';
import { AUTO_DETECT_VALUE } from '@/shared/config/constants.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';
import ExtensionContextManager from '@/core/extensionContext.js';
import { PageTranslationHelper } from './PageTranslationHelper.js';
import { DEFAULT_PAGE_TRANSLATION_SETTINGS } from './PageTranslationConstants.js';

/**
 * PageTranslationScheduler - Optimized translation scheduler inspired by AnyLang.
 * Handles batching, prioritization (Viewport first), and fault tolerance.
 */
export class PageTranslationScheduler {
  constructor(logger) {
    this.logger = logger;
    this.queue = []; // Tasks: { text, score, resolve, reject, context }
    this.batchTimer = null;
    this.translatedCount = 0;
    this.activeFlushes = 0;
    this.fatalErrorOccurred = false;
    this.isFirstBatch = true;
    this.isTranslated = false;
    this.translationSessionId = null;
    this.sessionContext = null;
    this.errorHandler = ErrorHandler.getInstance();
    
    this.settings = { 
      ...DEFAULT_PAGE_TRANSLATION_SETTINGS,
      poolDelay: 150, // Time to wait for collecting more items (AnyLang style)
      priorityThreshold: 1, // Any score >= this is considered high priority (Viewport)
    };
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
   * Enqueue a text for translation with a given priority (score).
   * @param {string} text - Text to translate
   * @param {any} context - Session context validation
   * @param {number} score - Priority score from domtranslator (greater = more important)
   */
  async enqueue(text, context = null, score = 0) {
    // 1. Session & State Validation
    if (context && context !== this.sessionContext) return text;
    if (!this.isTranslated || this.fatalErrorOccurred || !text || !text.trim()) return text;
    if (!PageTranslationHelper.shouldTranslate(text)) return text;

    return new Promise((resolve, reject) => {
      this.queue.push({ 
        text: text.trim(), 
        score: score || 0, 
        resolve, 
        reject, 
        context 
      });

      this._scheduleFlush(score);
    });
  }

  /**
   * Smart scheduling based on priority.
   * High priority (Viewport) triggers faster flushes.
   */
  _scheduleFlush(score) {
    if (this.activeFlushes >= (this.settings.maxConcurrentFlushes || 1)) return;

    const isHighPriority = score >= this.settings.priorityThreshold;
    
    // If we have a full chunk, flush immediately
    if (this.queue.length >= this.settings.chunkSize) {
      this.flush();
      return;
    }

    // Adaptive delay: 
    // - Very first batch is slightly delayed to collect initial content.
    // - High priority items (Viewport) trigger faster processing (50ms).
    // - Low priority items use the standard pool delay (150ms-300ms).
    const delay = this.isFirstBatch ? 500 : (isHighPriority ? 50 : this.settings.poolDelay);

    if (this.batchTimer) {
      // If a high-priority item comes in, we might want to speed up the existing timer
      if (isHighPriority && this.batchTimerDelay > 100) {
        clearTimeout(this.batchTimer);
        this.batchTimer = null;
      } else {
        return; // Already scheduled
      }
    }

    this.batchTimerDelay = delay;
    this.batchTimer = setTimeout(() => this.flush(), delay);
  }

  async flush() {
    if (!this.isTranslated || this.queue.length === 0) {
      if (!this.isTranslated && this.queue.length > 0) this.stop();
      return;
    }
    
    // Respect concurrency limits
    if (this.activeFlushes >= (this.settings.maxConcurrentFlushes || 1)) {
      if (!this.batchTimer && this.isTranslated) {
        this.batchTimer = setTimeout(() => this.flush(), 200);
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
      if (!this.isTranslated) return;

      const config = await this._getBatchConfig();
      
      // 1. Sort queue by score (DESC) to ensure high priority items are picked first
      this.queue.sort((a, b) => b.score - a.score);

      // 2. Select items for this batch
      let itemsToProcess = 0;
      let currentChars = 0;
      for (const item of this.queue) {
        if (item.context && item.context !== flushContext) break;
        const itemLen = item.text.length;
        
        // Respect chunk size and character limits
        if (itemsToProcess >= config.chunkSize) break;
        if (currentChars + itemLen > config.maxChars && itemsToProcess > 0) break;
        
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

      if (!this.isTranslated) throw new Error('Session stopped');

      const result = await ExtensionContextManager.safeSendMessage(batchMessage, 'page-translation-batch');

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
      const msg = error.message;
      if (msg !== 'Session changed or stopped' && msg !== 'Session stopped') {
        await this._handleBatchError(error, currentBatch);
      } else {
        currentBatch.forEach(item => { try { item.resolve(item.text); } catch (_) {} });
      }
    } finally {
      this.activeFlushes--;
      if (this.queue.length > 0 && this.isTranslated) {
        this.flush(); // Immediate subsequent flush for remaining items
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

  async _handleBatchError(error, batch) {
    if (this.fatalErrorOccurred) return;

    // Get error info including localized message and type
    const errorInfo = await this.errorHandler.getErrorForUI(error, 'page-translation-batch');
    const errorType = errorInfo.type;

    const fatalErrorTypes = [
      ErrorTypes.QUOTA_EXCEEDED, 
      ErrorTypes.RATE_LIMIT_REACHED, 
      ErrorTypes.API_KEY_INVALID,
      ErrorTypes.API_KEY_MISSING,
      ErrorTypes.API_URL_MISSING,
      ErrorTypes.MODEL_MISSING,
      ErrorTypes.INSUFFICIENT_BALANCE,
      ErrorTypes.FORBIDDEN_ERROR,
      ErrorTypes.DEEPL_QUOTA_EXCEEDED,
      ErrorTypes.GEMINI_QUOTA_REGION
    ];

    const isFatal = fatalErrorTypes.includes(errorType);

    // Handle error via centralized handler
    // If it's fatal, we suppress the generic toast because the Manager will show a specific one
    await this.errorHandler.handle(error, {
      context: 'page-translation-batch',
      showToast: !isFatal,
      silent: false
    });

    if (isFatal) {
      this.fatalErrorOccurred = true;
      pageEventBus.emit('page-translation-fatal-error', { 
        error, 
        errorType, 
        localizedMessage: errorInfo.message 
      });
    }

    batch.forEach(item => { try { item.resolve(item.text); } catch (_) {} });
    pageEventBus.emit(MessageActions.PAGE_TRANSLATE_ERROR, { 
      error: error.message || String(error), 
      errorType, 
      isFatal: isFatal 
    });
  }

  _reportProgress() {
    pageEventBus.emit(MessageActions.PAGE_TRANSLATE_PROGRESS, { translated: this.translatedCount, progress: -1 });
  }
}
