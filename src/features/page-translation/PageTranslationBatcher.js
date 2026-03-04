import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
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
    this.translationMessageId = null;
    this._nodeTrackingQueue = new Map(); // text -> Array of Nodes
    
    this.settings = { ...DEFAULT_PAGE_TRANSLATION_SETTINGS };
  }

  setSettings(settings) {
    this.settings = { ...this.settings, ...settings };
  }

  setTranslationState(isTranslated, messageId) {
    this.isTranslated = isTranslated;
    this.translationMessageId = messageId;
    if (!isTranslated) {
      this.stop();
    }
  }

  reset() {
    this.stop();
    this.translatedCount = 0;
    this.fatalErrorOccurred = false;
  }

  /**
   * Fully stop the batcher and clear all pending items
   */
  stop() {
    this.isTranslated = false;
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    // Resolve all pending items with their original text
    if (this.queue.length > 0) {
      this.logger.debug(`Stopping batcher, resolving ${this.queue.length} pending items`);
      while (this.queue.length > 0) {
        const item = this.queue.shift();
        try {
          item.resolve(item.text);
        } catch (_) {}
      }
    }
    
    this.activeFlushes = 0;
    this.isFirstBatch = true;
    this._nodeTrackingQueue.clear();
  }

  trackNode(text, node) {
    const normalized = PageTranslationHelper.normalizeText(text);
    if (normalized) {
      const queue = this._nodeTrackingQueue.get(normalized) || [];
      queue.push(node);
      this._nodeTrackingQueue.set(normalized, queue);
    }
  }

  async enqueue(text) {
    if (this.fatalErrorOccurred || !text || !text.trim() || !this.isTranslated) return text;
    
    if (!PageTranslationHelper.shouldTranslate(text)) return text;

    const normalizedText = PageTranslationHelper.normalizeText(text);
    const nodeQueue = this._nodeTrackingQueue.get(normalizedText);
    const node = (nodeQueue && nodeQueue.length > 0) ? nodeQueue.shift() : null;

    if (!node) {
      this.logger.warn('Could not find tracked node for text:', normalizedText.substring(0, 30));
      return text;
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ text: text.trim(), node, resolve, reject });

      // Immediate flush only if we reached a full chunk size
      if (this.queue.length >= this.settings.chunkSize) {
        this.flush();
      } else {
        // Otherwise use a more generous debounce to group dynamic updates (especially for SPAs like X)
        if (this.batchTimer) clearTimeout(this.batchTimer);
        const debounceDelay = this.isFirstBatch ? 1500 : 3000; // Increased delay
        this.batchTimer = setTimeout(() => this.flush(), debounceDelay);
      }
    });
  }

  _prioritizeQueue() {
    if (this.queue.length === 0) return 0;
    const visibleItems = [];
    const nonVisibleItems = [];
    const marginValue = parseInt(this.settings.rootMargin || '300', 10);

    for (const item of this.queue) {
      if (PageTranslationHelper.isInViewportWithMargin(item.node, marginValue)) {
        visibleItems.push(item);
      } else {
        nonVisibleItems.push(item);
      }
    }
    
    if (visibleItems.length > 0) {
      this.queue = [...visibleItems, ...nonVisibleItems];
    }
    return visibleItems.length;
  }

  async flush() {
    if (!this.isTranslated) {
      this.stop();
      return;
    }

    if (this.queue.length === 0) return;
    
    if (this.activeFlushes >= (this.settings.maxConcurrentFlushes || 1)) {
      if (!this.batchTimer && this.isTranslated) {
        this.batchTimer = setTimeout(() => this.flush(), 1000);
      }
      return;
    }

    if (this.batchTimer) clearTimeout(this.batchTimer);
    
    const visibleCount = this._prioritizeQueue();
    if (this.settings.lazyLoading && visibleCount === 0 && this.isFirstBatch === false) {
      // If not first batch and nothing visible, wait for next trigger
      return;
    }

    this.activeFlushes++;
    let currentBatch = [];

    try {
      if (!this.isTranslated) throw new Error('Stopped');

      const config = await this._getBatchConfig();
      const maxToExtract = this.settings.lazyLoading ? Math.max(visibleCount, config.chunkSize) : Infinity;
      currentBatch = this._extractBatch(config, maxToExtract);

      if (currentBatch.length === 0 || !this.isTranslated) {
        this.activeFlushes--;
        return;
      }

      this.isFirstBatch = false;
      const textsToTranslate = currentBatch.map(item => ({ text: item.text }));
      
      const result = await sendRegularMessage({
        action: MessageActions.PAGE_TRANSLATE_BATCH,
        messageId: this.translationMessageId,
        data: {
          text: JSON.stringify(textsToTranslate),
          provider: config.providerRegistryId,
          sourceLanguage: AUTO_DETECT_VALUE, 
          targetLanguage: config.targetLanguage,
          mode: TranslationMode.Page,
          options: { rawJsonPayload: true },
        },
        context: 'page-translation',
      }, { timeout: 60000 });

      if (!this.isTranslated) throw new Error('Translation stopped during request');
      if (!result?.success) throw new Error(result?.error || 'Batch translation failed');

      const translatedTexts = JSON.parse(result.translatedText);
      this._applyBatchResults(currentBatch, translatedTexts, config.targetLanguage);
      this._reportProgress();
    } catch (error) {
      this._handleBatchError(error, currentBatch);
    } finally {
      this.activeFlushes--;
      if (!this.isTranslated) {
        this.reset();
        return;
      }
      if (this.queue.length > 0 && this.isTranslated) {
        if (this.batchTimer) clearTimeout(this.batchTimer);
        this.batchTimer = setTimeout(() => this.flush(), 50);
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

  _extractBatch(config, maxToExtract) {
    let itemsToProcess = 0;
    let currentChars = 0;

    for (const item of this.queue) {
      if (itemsToProcess >= maxToExtract) break;
      const itemLen = item.text.length;
      if (itemsToProcess >= config.chunkSize || (currentChars + itemLen > config.maxChars && itemsToProcess > 0)) break;
      currentChars += itemLen;
      itemsToProcess++;
    }

    return itemsToProcess === 0 ? [] : this.queue.splice(0, itemsToProcess);
  }

  _applyBatchResults(batch, translatedTexts, targetLanguage) {
    batch.forEach((item, index) => {
      const translated = translatedTexts[index]?.text || translatedTexts[index] || item.text;
      if (item.node && RTL_LANGUAGES.has(targetLanguage)) {
        const element = item.node.nodeType === Node.TEXT_NODE ? item.node.parentElement : item.node.ownerElement;
        if (element && !element.hasAttribute('data-page-translated')) {
          if ((element.children.length === 0 && TEXT_TAGS.has(element.tagName)) || 
              (item.node.nodeType === Node.ATTRIBUTE_NODE && (item.node.name === 'placeholder' || item.node.name === 'title'))) {
            element.setAttribute('dir', 'rtl');
          }
          element.setAttribute('data-page-translated', 'true');
        }
      }
      item.resolve(translated);
      this.translatedCount++;
    });
  }

  _handleBatchError(error, batch) {
    if (this.fatalErrorOccurred) return;
    const errorType = matchErrorToType(error);
    const errorMsg = (error.message || String(error)).toLowerCase();
    
    const isQuotaError = [ErrorTypes.QUOTA_EXCEEDED, ErrorTypes.DEEPL_QUOTA_EXCEEDED, ErrorTypes.RATE_LIMIT_REACHED, ErrorTypes.INSUFFICIENT_BALANCE].includes(errorType) || 
                         errorMsg.includes("quota") || errorMsg.includes("limit") || errorMsg.includes("429");

    if (isQuotaError) {
      this.fatalErrorOccurred = true;
      pageEventBus.emit('page-translation-fatal-error', { error, errorType });
      batch.forEach(item => { try { item.resolve(item.text); } catch (_) {} });
      return;
    }

    ErrorHandler.getInstance().handle(error, {
      type: ErrorTypes.PAGE_TRANSLATION_STOPPED,
      context: 'page-translation',
      showToast: true,
      duration: NOTIFICATION_TIME.ERROR
    });

    batch.forEach(item => { try { item.resolve(item.text); } catch (_) {} });
    pageEventBus.emit(MessageActions.PAGE_TRANSLATE_ERROR, { error: error.message || String(error), errorType, isFatal: false });
  }

  _reportProgress() {
    pageEventBus.emit(MessageActions.PAGE_TRANSLATE_PROGRESS, { translated: this.translatedCount, progress: -1 });
  }
}
