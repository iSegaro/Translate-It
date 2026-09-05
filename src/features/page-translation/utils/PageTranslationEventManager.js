import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import { TranslationMode } from '@/config.js';
import ExtensionContextManager from '@/core/extensionContext.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { isStructuredTranslationError } from '@/shared/messaging/core/MessagingCore.js';
import { getPageTranslationErrorPresentation } from './PageTranslationErrorPresenter.js';

/**
 * PageTranslationEventManager - Specialized class to handle external events
 * (PageEventBus, Storage) for the PageTranslationManager.
 */
export class PageTranslationEventManager {
  /**
   * Initialize event management.
   * @param {PageTranslationManager} manager - The parent manager instance.
   */
  constructor(manager) {
    this.manager = manager;
    this.logger = manager.logger;
    this._init();
  }

  _init() {
    this._setupStorageListeners();
    this._setupPageEventBusListeners();
  }

  _setupStorageListeners() {
    // Listen for provider changes to reset any existing fatal error states
    storageManager.on('change:TRANSLATION_API', ({ newValue, oldValue }) => {
      if (newValue !== oldValue) {
        this.logger.info('Global TRANSLATION_API changed, resetting error state');
        this.manager.resetError();
      }
    });

    storageManager.on('change:MODE_PROVIDERS', ({ newValue, oldValue }) => {
      const newPageProvider = newValue?.[TranslationMode.Page];
      const oldPageProvider = oldValue?.[TranslationMode.Page];

      if (newPageProvider !== oldPageProvider) {
        this.logger.info('Mode-specific provider for PAGE changed, resetting error state');
        this.manager.resetError();
      }
    });

    // Listen for scroll stop delay changes
    storageManager.on('change:WHOLE_PAGE_SCROLL_STOP_DELAY', ({ newValue }) => {
      this.logger.debug('WHOLE_PAGE_SCROLL_STOP_DELAY changed in storage:', newValue);
      if (this.manager.settings) {
        this.manager.settings.scrollStopDelay = Number(newValue) || 500;
        
        // Update scroll tracker if it's active
        if (this.manager.scrollTracker) {
          this.manager.scrollTracker.updateDelay(newValue);
        }
      }
    });

    // Listen for mode changes (Fluid vs On Stop)
    storageManager.on('change:WHOLE_PAGE_TRANSLATE_AFTER_SCROLL_STOP', ({ newValue }) => {
      this.logger.info('WHOLE_PAGE_TRANSLATE_AFTER_SCROLL_STOP changed in storage:', newValue);
      if (this.manager.settings) {
        this.manager.settings.translateAfterScrollStop = !!newValue;
        
        // Update scroll tracker - it should now be active in BOTH modes
        // to ensure visibility-driven flushes for already-enqueued items.
        if (this.manager.isTranslating || this.manager.isAutoTranslating) {
          this.manager.scrollTracker.start(this.manager.settings.scrollStopDelay);
        }
      }
    });
  }

  _setupPageEventBusListeners() {
    const bus = window.pageEventBus;
    if (!bus || window._translateItPageTranslationListenersSet) return;

    this.logger.info('Setting up GLOBAL PageEventBus listeners for PageTranslationManager');

    // Aggregate completion is canonical presentation because child-only failures
    // have no top-frame local completion event. Use retained structured cause when available.
    bus.on(MessageActions.PAGE_TRANSLATE_COMPLETE, (data) => {
      if (
        data?.isAggregated
        && data.isTranslating === false
        && data.isAutoTranslating === false
        && data.translatedCount === 0
        && data.failedCount > 0
      ) {
        const presentationDetail = isStructuredTranslationError(data.errorDetails)
          ? data
          : {
              error: Object.assign(new Error('Translation failed'), {
                type: ErrorTypes.TRANSLATION_FAILED,
              }),
              errorType: ErrorTypes.TRANSLATION_FAILED,
            };

        void getPageTranslationErrorPresentation(presentationDetail).then((displayError) => {
          if (!displayError) return;
          return ErrorHandler.getInstance().handle(displayError, {
            type: displayError.type || ErrorTypes.TRANSLATION_FAILED,
            context: 'page-translation-zero-result',
            showToast: true,
          });
        }).catch(err => this.logger.warn('ErrorHandler failed for zero-result page translation:', err));
      }
    });

    // 2. Error Handling
    bus.on(MessageActions.PAGE_TRANSLATE_RESET_ERROR, (data) => {
      if (!data?.isInternal) this.manager.resetError();
    });

    bus.on('page-translation-internal-error', async (data) => {
      if (data.isFatal || ExtensionContextManager.isContextError(data.error)) return;

      this.logger.debug('Non-fatal page translation error received', data.error);

      const presentationPromise = getPageTranslationErrorPresentation({
        error: data.error,
        errorDetails: data.errorDetails,
        errorType: data.errorType,
      });

      const displayError = await presentationPromise;
      if (displayError) this.logger.debug('Non-fatal page translation failure kept silent', displayError.type);
    });

    window._translateItPageTranslationListenersSet = true;
  }
}
