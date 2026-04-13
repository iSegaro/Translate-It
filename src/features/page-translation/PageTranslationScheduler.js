import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { MessageFormat, MessageContexts, ActionReasons } from '@/shared/messaging/core/MessagingCore.js';
import { TranslationMode, CONFIG } from '@/shared/config/config.js';
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
import { PageTranslationFluidFilter } from './utils/PageTranslationFluidFilter.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { registryIdToName, isProviderType, ProviderTypes } from '@/features/translation/providers/ProviderConstants.js';

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
    this.highPriorityCount = 0;
    this.isWaitingForVisibility = false; // flag to track idle state
    
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
    this.highPriorityCount = 0;
    this.isWaitingForVisibility = false;
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
    this.isScrolling = false;
    this.isWaitingForVisibility = false;
    
    // CRITICAL: Notify background to abort any pending batch for this session
    if (wasTranslating && this.translationSessionId) {
      sendRegularMessage({
        action: MessageActions.CANCEL_TRANSLATION,
        data: { 
          messageId: this.translationSessionId,
          reason: ActionReasons.USER_STOPPED_PAGE_TRANSLATION
        }
      }).catch(() => {});
    }

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    if (this.queue.length > 0) {
      const itemsToReject = [...this.queue];
      this.queue = [];
      this.highPriorityCount = 0;
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

    const isHighPriority = score >= this.settings.priorityThreshold;

    return new Promise((resolve, reject) => {
      this.queue.push({ 
        text: text.trim(), 
        score: score || 0, 
        isHighPriority,
        resolve, 
        reject, 
        context,
        node
      });

      if (isHighPriority) {
        this.highPriorityCount++;
      }

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
    
    // If we are waiting for a scroll stop, clear any pending automatic timers
    // to ensure we strictly wait for the next stop.
    if (this.settings.translateAfterScrollStop && this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
  }

  /**
   * Smart scheduling based on priority.
   * High priority (Viewport) triggers faster flushes.
   */
  _scheduleFlush(score) {
    if (this.activeFlushes >= (this.settings.maxConcurrentFlushes || 1)) return;

    // 1. EMERGENCY FLUSH (Memory Safety)
    // If total queue is massive (e.g. 1000+), flush regardless of state to prevent memory issues.
    if (this.queue.length >= 1000) {
      this.logger.debug('Queue reached emergency limit (1000). Forcing flush.');
      this.flush();
      return;
    }

    // 2. CAPACITY FLUSH (Efficiency)
    // If we have enough HIGH PRIORITY items to fill a full API request (chunkSize),
    // we flush immediately UNLESS we are currently scrolling/active and in "On Stop" mode.
    // Exception: Always allow the very first batch to flush when full to ensure initial visibility.
    if (this.highPriorityCount >= (this.settings.chunkSize || 250)) {
      const shouldWait = this.settings.translateAfterScrollStop && this.isScrolling && !this.isFirstBatch;
      
      if (!shouldWait) {
        this.logger.debug('High-priority items reached capacity. Forcing immediate flush.');
        this.flush();
        return;
      }
    }

    // 3. ON-STOP MODE CONTROL
    // IF in "On Stop" mode AND currently busy (scrolling or dynamic activity): 
    // DO NOT schedule automatic timed flushes EXCEPT for the very first batch.
    if (this.settings.translateAfterScrollStop && this.isScrolling && !this.isFirstBatch) {
      return;
    }

    const isHighPriority = score >= this.settings.priorityThreshold;
    
    // If we have a full chunk, flush immediately (for non-scroll-stop mode)
    if (!this.settings.translateAfterScrollStop && this.queue.length >= this.settings.chunkSize) {
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

    try {
      // Process batches in a loop as long as there are items and we are still translating
      while (this.queue.length > 0 && this.isTranslated && flushContext === this.sessionContext) {
        const config = await this._getBatchConfig();
        let currentBatch = [];

        // 1. SELECT BATCH: Use specialized filters based on the mode
        if (this.settings.translateAfterScrollStop) {
          const result = PageTranslationQueueFilter.process(this.queue, config);
          currentBatch = result.batchItems;
          this.queue = result.remainingItems;

          // HANDLE EJECTED ITEMS: These were too far, so we remove them from the 
          // scheduler's responsibility by resolving them with original text.
          if (result.purgedCount > 0) {
            result.ejectedItems.forEach(item => {
              if (item.isHighPriority) {
                this.highPriorityCount = Math.max(0, this.highPriorityCount - 1);
              }
              try { item.resolve(item.text); } catch { /* ignore */ }
            });
          }
        } else {
          const result = PageTranslationFluidFilter.process(this.queue, config);
          currentBatch = result.batchItems;
          this.queue = result.remainingItems;
        }

        if (currentBatch.length === 0) {
          this.logger.debug('No visible content in queue, stopping flush loop');
          this.isWaitingForVisibility = true; // No visible content found
          break;
        }

        // Update high priority count based on removed items
        const removedHighPriority = currentBatch.filter(item => item.isHighPriority).length;
        this.highPriorityCount = Math.max(0, this.highPriorityCount - removedHighPriority);
        this.isWaitingForVisibility = false; // We found something to translate

        // 2. EXECUTE BATCH: Process the selected items
        this.isFirstBatch = false;
        await this._executeBatchRequest(currentBatch, config, flushContext);

        // 3. YIELD: Give event loop a breath if there's more work
        if (this.queue.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
    } catch (error) {
      this.logger.debug('Critical error in scheduler flush loop:', error.message);
    } finally {
      this.activeFlushes--;
      this._checkCompletion();
    }
  }

  /**
   * Internal method to handle the actual translation request and resolution.
   */
  async _executeBatchRequest(batch, config, flushContext) {
    const textsToTranslate = batch.map(item => ({ text: item.text }));
    
    const batchMessage = MessageFormat.create(
      MessageActions.PAGE_TRANSLATE_BATCH,
      {
        text: JSON.stringify(textsToTranslate),
        provider: config.providerRegistryId,
        sourceLanguage: AUTO_DETECT_VALUE, 
        targetLanguage: config.targetLanguage,
        mode: TranslationMode.Page,
        contextMetadata: this.settings.aiContextTranslationEnabled ? { pageTitle: document.title } : null,
        options: { rawJsonPayload: true },
        sessionId: this.translationSessionId 
      },
      MessageContexts.CONTENT
    );

    try {
      if (!this.isTranslated) throw new Error('Session stopped');

      const result = await ExtensionContextManager.safeSendMessage(batchMessage, 'page-translation-batch');

      // Validation after async call
      if (!this.isTranslated || (flushContext && flushContext !== this.sessionContext)) {
        batch.forEach(item => { try { item.resolve(item.text); } catch { /* ignore */ } });
        return;
      }

      if (!result?.success) {
        const rawErrorMessage = result?.error || '';
        const batchError = ((!result && !ExtensionContextManager.isValidSync()) || ExtensionContextManager.isContextError(rawErrorMessage))
          ? new Error(rawErrorMessage || 'Extension context invalidated')
          : new Error(rawErrorMessage || 'Batch translation failed');

        await this._handleBatchError(batchError, batch);
        return;
      }

      // Resolve successfully translated items
      const translatedTexts = JSON.parse(result.translatedText);
      batch.forEach((item, index) => {
        const translatedItem = translatedTexts[index];
        const translatedText = (typeof translatedItem === 'object' && translatedItem !== null) 
          ? (translatedItem.text || translatedItem.t || JSON.stringify(translatedItem))
          : translatedItem;
          
        item.resolve(translatedText || item.text);
        this.translatedCount++;
      });

      this._reportProgress();
    } catch (error) {
      await this._handleBatchError(error, batch);
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
    
    const providerName = registryIdToName(providerRegistryId);
    const isAI = isProviderType(providerName, ProviderTypes.AI);

    return {
      providerRegistryId,
      targetLanguage,
      chunkSize: this.settings.chunkSize,
      lazyLoading: this.settings.lazyLoading,
      maxChars: isAI ? CONFIG.WHOLE_PAGE_AI_MAX_CHARS : CONFIG.WHOLE_PAGE_MAX_CHARS
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
        totalCount: this.totalTasks,
        isAutoTranslating: !!this.settings.autoTranslateOnDOMChanges
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
   * Check if translation is complete or temporarily idle (waiting for more visible content)
   */
  _checkCompletion() {
    // Small delay to ensure no more immediate tasks are coming
    this.trackTimeout(() => {
      if (!this.isTranslated || this.activeFlushes > 0) return;

      // Case 1: Pure Completion (Everything in queue is done)
      if (this.queue.length === 0 && this.totalTasks > 0 && this.translatedCount >= this.totalTasks) {
        // If auto-translating, we are never "truly" complete, just idle/watching
        if (this.settings.autoTranslateOnDOMChanges) {
          this.logger.debug('Scheduler detected completion of current queue in Auto mode, signaling idle');
          pageEventBus.emit(MessageActions.PAGE_TRANSLATE_IDLE, {
            translatedCount: this.translatedCount,
            totalCount: this.totalTasks,
            isAutoTranslating: true
          });
        } else {
          this.logger.info('Scheduler detected total completion', { 
            translated: this.translatedCount, 
            total: this.totalTasks 
          });
          pageEventBus.emit(MessageActions.PAGE_TRANSLATE_COMPLETE, {
            translatedCount: this.translatedCount,
            totalCount: this.totalTasks,
            isAutoTranslating: false
          });
        }
        this.isWaitingForVisibility = false;
        return;
      }

      // Case 2: Partial Completion / Idle (Visible content done, but more invisible items exist)
      // This is triggered if the last flush attempt found NO visible content.
      if (this.isWaitingForVisibility && this.translatedCount > 0) {
        this.logger.debug('Scheduler entering idle state (Visible content processed)');
        pageEventBus.emit(MessageActions.PAGE_TRANSLATE_IDLE, {
          translatedCount: this.translatedCount,
          totalCount: this.totalTasks,
          isAutoTranslating: !!this.settings.autoTranslateOnDOMChanges
        });
      }
    }, 500);
  }
}
