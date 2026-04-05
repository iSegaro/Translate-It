import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { MessageFormat, MessageContexts, ActionReasons } from '@/shared/messaging/core/MessagingCore.js';
import { TranslationMode } from '@/shared/config/config.js';
import { getTranslationApiAsync, getTargetLanguageAsync } from '@/config.js';
import { AUTO_DETECT_VALUE } from '@/shared/config/constants.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { isFatalError, matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import ExtensionContextManager from '@/core/extensionContext.js';
import { PageTranslationHelper } from './PageTranslationHelper.js';
import { DEFAULT_PAGE_TRANSLATION_SETTINGS, PAGE_TRANSLATION_TIMING } from './PageTranslationConstants.js';
import { PageTranslationQueueFilter } from './utils/PageTranslationQueueFilter.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';

/**
 * PageTranslationScheduler - Optimized translation scheduler inspired by AnyLang.
 * Handles batching, prioritization (Viewport first), and fault tolerance.
 */
export class PageTranslationScheduler extends ResourceTracker {
  constructor() {
    super('page-translation-scheduler');
    this.logger = getScopedLogger(LOG_COMPONENTS.PAGE_TRANSLATION, 'Scheduler');
    this.queue = []; // Tasks: { text, score, resolve, reject, context, node }
    this.batchTimer = null;
    this.translatedCount = 0;
    this.totalTasks = 0;
    this.activeFlushes = 0;
    this.fatalErrorOccurred = false;
    this.isFirstBatch = true;
    this.isTranslated = false;
    this.translationSessionId = null;
    this.sessionContext = null;
    this.isScrolling = false;
    
    this.settings = { 
      ...DEFAULT_PAGE_TRANSLATION_SETTINGS,
      poolDelay: 150, // Time to wait for collecting more items (AnyLang style)
      priorityThreshold: 1, // Any score >= this is considered high priority (Viewport)
    };

    // Throttling state for progress reporting
    this._lastReportTime = 0;
    this._reportInterval = 300; // ms
    this._reportPending = false;

    // Register queue for automatic memory management via ResourceTracker
    this.trackResource('translation-queue', () => {
      if (this.queue.length > 0) {
        this.logger.debug('Cleaning up queue via ResourceTracker', this.queue.length);
        this.queue = [];
      }
    });
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
    this.totalTasks = 0;
    this.fatalErrorOccurred = false;
    this.translationSessionId = null;
    this.sessionContext = null;
    this._lastReportTime = 0;
    this._reportPending = false;
  }

  stop() {
    const wasTranslating = this.isTranslated;
    this.isTranslated = false;
    this.sessionContext = null;
    this._reportPending = false;
    
    // CRITICAL: Notify background to abort any pending batch for this session
    if (wasTranslating && this.translationSessionId) {
      import('@/shared/messaging/core/UnifiedMessaging.js').then(({ sendRegularMessage }) => {
        sendRegularMessage({
          action: MessageActions.CANCEL_TRANSLATION,
          data: { 
            messageId: this.translationSessionId,
            reason: ActionReasons.USER_STOPPED_PAGE_TRANSLATION
          }
        }).catch(() => {});
      });
    }

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    if (this.queue.length > 0) {
      const itemsToReject = [...this.queue];
      this.queue = [];
      itemsToReject.forEach(item => {
        try { item.resolve(item.text); } catch {
          // Ignore resolution errors
        }
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
   * @param {Node} node - Associated DOM node for visibility check
   */
  async enqueue(text, context = null, score = 0, node = null) {
    // 1. Session & State Validation
    if (context && context !== this.sessionContext) return text;
    if (!this.isTranslated || this.fatalErrorOccurred || !text || !text.trim()) return text;
    if (!PageTranslationHelper.shouldTranslate(text)) return text;

    this.totalTasks++;
    this._reportProgress();

    return new Promise((resolve, reject) => {
      this.queue.push({ 
        text: text.trim(), 
        score: score || 0, 
        resolve, 
        reject, 
        context,
        node
      });

      this._scheduleFlush(score);
    });
  }

  /**
   * External signal that scrolling has stopped.
   * Only used when WHOLE_PAGE_TRANSLATE_AFTER_SCROLL_STOP is enabled.
   */
  signalScrollStop() {
    this.isScrolling = false;
    if (this.settings.translateAfterScrollStop) {
      this.logger.debug('Signal: Scroll Stop. Queue size:', this.queue.length);
      this.flush();
    }
  }

  /**
   * External signal that scrolling has started.
   */
  signalScrollStart() {
    this.isScrolling = true;
    // If a timer was running (e.g. from dynamic content), we might want to cancel it 
    // to strictly wait for scroll stop, but let's keep it fluid unless requested.
  }

  /**
   * Smart scheduling based on priority.
   * High priority (Viewport) triggers faster flushes.
   */
  _scheduleFlush(score) {
    if (this.activeFlushes >= (this.settings.maxConcurrentFlushes || 1)) return;

    // IF in "On Stop" mode AND currently scrolling: DO NOT schedule automatic flushes
    // EXCEPT for the very first batch to ensure initial Viewport is translated.
    // IF NOT scrolling (e.g. user opened a menu): allow standard timers.
    if (this.settings.translateAfterScrollStop && this.isScrolling && !this.isFirstBatch) {
      return;
    }

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
    const delay = this.isFirstBatch 
      ? PAGE_TRANSLATION_TIMING.FIRST_BATCH_DELAY 
      : (isHighPriority ? PAGE_TRANSLATION_TIMING.HIGH_PRIORITY_DELAY : (this.settings.poolDelay || PAGE_TRANSLATION_TIMING.STANDARD_LOAD_DELAY));

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
    this.batchTimer = this.trackTimeout(() => this.flush(), delay);
  }

  async flush() {
    if (!this.isTranslated || this.queue.length === 0) {
      if (!this.isTranslated && this.queue.length > 0) this.stop();
      return;
    }
    
    // Respect concurrency limits
    if (this.activeFlushes >= (this.settings.maxConcurrentFlushes || 1)) {
      if (!this.batchTimer && this.isTranslated) {
        this.batchTimer = this.trackTimeout(() => this.flush(), PAGE_TRANSLATION_TIMING.CONCURRENCY_RETRY_DELAY);
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
      // Process batches in a loop as long as there are items and we are still translating
      while (this.queue.length > 0 && this.isTranslated && flushContext === this.sessionContext) {
        const config = await this._getBatchConfig();
        
        if (this.settings.translateAfterScrollStop) {
          const { batchItems, remainingItems } = PageTranslationQueueFilter.process(this.queue, config.chunkSize);
          
          // 1. Set current batch
          currentBatch = batchItems;
          
          // 2. Update queue with remaining items (including off-screen ones)
          this.queue = remainingItems;

          if (currentBatch.length === 0) {
            this.logger.debug('No visible content in queue, stopping flush');
            break;
          }
        } else {
          // ORIGINAL "FLUID" LOGIC
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

          if (currentBatch.length === 0) {
            // If we couldn't pick any items (e.g. context mismatch), break to avoid infinite loop
            break;
          }
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
          // Resolve items with original text if session stopped/changed
          currentBatch.forEach(item => { try { item.resolve(item.text); } catch { /* ignore */ } });
          break;
        }

        if (!result?.success) {
          // Check if failure is due to invalidated context to preserve original error
          let batchError;
          const rawErrorMessage = result?.error || '';
          
          if ((!result && !ExtensionContextManager.isValidSync()) || ExtensionContextManager.isContextError(rawErrorMessage)) {
            batchError = new Error(rawErrorMessage || 'Extension context invalidated');
          } else {
            batchError = new Error(rawErrorMessage || 'Batch translation failed');
          }

          await this._handleBatchError(batchError, currentBatch);
          // Stop processing more batches after an error to prevent error cascading
          break;
        }

        const translatedTexts = JSON.parse(result.translatedText);
        
        currentBatch.forEach((item, index) => {
          item.resolve(translatedTexts[index]?.text || translatedTexts[index] || item.text);
          this.translatedCount++;
        });

        this._reportProgress();

        // Check if we are done with all current tasks
        if (this.queue.length === 0 && this.activeFlushes === 1) {
          this._checkCompletion();
        }

        // Yield to event loop between batches if there are many items
        if (this.queue.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
    } catch (error) {
      this.logger.debug('Critical error in scheduler flush loop:', error.message);
      await this._handleBatchError(error, typeof currentBatch !== 'undefined' ? currentBatch : []);
    } finally {
      this.activeFlushes--;
    }
  }

  async _getBatchConfig() {
    // Priority: this.settings (from Manager) -> defaults
    if (!this.settings.translationApi) {
      this.settings.translationApi = await getTranslationApiAsync();
    }
    if (!this.settings.targetLanguage) {
      this.settings.targetLanguage = await getTargetLanguageAsync();
    }

    const providerRegistryId = this.settings.translationApi;
    const targetLanguage = this.settings.targetLanguage;
    
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

    // Preserve original error identity as per guidelines
    const errorType = matchErrorToType(error);
    const isFatal = isFatalError(errorType);

    if (isFatal) {
      this.fatalErrorOccurred = true;
    }

    // Resolve current batch items with original text to unblock domtranslator
    batch.forEach(item => { 
      try { item.resolve(item.text); } catch { /* ignore */ } 
    });

    // Emit internal event for the Manager to handle feedback and broadcasting
    pageEventBus.emit('page-translation-internal-error', { 
      error, 
      errorType, 
      isFatal: isFatal,
      context: 'page-translation-batch'
    });

    // Also emit specific fatal event for the Manager's circuit breaker
    if (isFatal) {
      pageEventBus.emit('page-translation-fatal-error', { 
        error, 
        errorType
      });
    }
  }

  _reportProgress(force = false) {
    const now = Date.now();
    const timeSinceLastReport = now - this._lastReportTime;

    if (force || timeSinceLastReport >= this._reportInterval) {
      this._lastReportTime = now;
      this._reportPending = false;
      pageEventBus.emit(MessageActions.PAGE_TRANSLATE_PROGRESS, { 
        translatedCount: this.translatedCount, 
        totalCount: this.totalTasks
      });
      return;
    }

    if (!this._reportPending) {
      this._reportPending = true;
      this.trackTimeout(() => {
        if (this._reportPending) {
          this._reportProgress(true);
        }
      }, this._reportInterval - timeSinceLastReport);
    }
  }

  /**
   * Check if translation is complete and emit event
   */
  _checkCompletion() {
    // Small delay to ensure no more immediate tasks are coming
    this.trackTimeout(() => {
      if (this.isTranslated && this.queue.length === 0 && this.activeFlushes === 0) {
        if (this.totalTasks > 0 && this.translatedCount >= this.totalTasks) {
          this.logger.info('Scheduler detected completion', { 
            translated: this.translatedCount, 
            total: this.totalTasks 
          });
          pageEventBus.emit(MessageActions.PAGE_TRANSLATE_COMPLETE, {
            translatedCount: this.translatedCount,
            totalCount: this.totalTasks
          });
        }
      }
    }, 500);
  }
}
