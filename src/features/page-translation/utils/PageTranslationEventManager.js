import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import { TranslationMode } from '@/config.js';
import ExtensionContextManager from '@/core/extensionContext.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';

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

    // 1. Progress & Completion Forwarding (Forward to background for UI updates)
    bus.on(MessageActions.PAGE_TRANSLATE_PROGRESS, (data) => {
      sendRegularMessage({ 
        action: MessageActions.PAGE_TRANSLATE_PROGRESS, 
        data, 
        context: 'page-translation-progress-forward' 
      }, { silent: true }).catch(() => {});
    });

    bus.on(MessageActions.PAGE_TRANSLATE_COMPLETE, (data) => {
      this.manager.isTranslating = false;
      this.manager.isTranslated = true;
      
      sendRegularMessage({ 
        action: MessageActions.PAGE_TRANSLATE_COMPLETE, 
        data: {
          ...data,
          url: this.manager.currentUrl,
          isAutoTranslating: this.manager.isAutoTranslating,
          sessionId: this.manager.translationMessageId
        }, 
        context: 'page-translation-complete-forward' 
      }, { silent: true }).catch(() => {});
    });

    // 2. Lifecycle Commands (Translate, Restore, Stop, Cancel)
    bus.on(MessageActions.PAGE_TRANSLATE, (options) => {
      this.manager.translatePage(options || {}).catch(err => {
        this.logger.error('Failed to translate page from PageEventBus:', err);
      });
    });

    bus.on(MessageActions.PAGE_RESTORE, () => {
      this.manager.restorePage().catch(() => {});
    });

    bus.on(MessageActions.PAGE_TRANSLATE_CANCELLED, () => {
      this.manager.cancelTranslation();
    });

    bus.on(MessageActions.PAGE_TRANSLATE_STOP_AUTO, () => {
      this.manager.stopAutoTranslation().catch(() => {});
    });

    // 3. Error Handling
    bus.on(MessageActions.PAGE_TRANSLATE_RESET_ERROR, (data) => {
      if (!data?.isInternal) this.manager.resetError();
    });

    bus.on(MessageActions.PAGE_TRANSLATE_IDLE, (data) => {
      if (this.manager.isTranslating) {
        this.manager.isTranslating = false;
        this.manager.isTranslated = data.translatedCount > 0;
        
        this.manager._broadcastEvent(MessageActions.PAGE_TRANSLATE_PROGRESS, {
          status: 'idle',
          isTranslating: false,
          isAutoTranslating: this.manager.isAutoTranslating,
          isTranslated: this.manager.isTranslated,
          translatedCount: data.translatedCount,
          totalCount: data.totalCount
        });
      }
    });

    bus.on('page-translation-fatal-error', ({ error, errorType, localizedMessage }) => 
      this.manager._handleFatalError(error, errorType, localizedMessage));

    bus.on('page-translation-internal-error', (data) => {
      if (data.isFatal || ExtensionContextManager.isContextError(data.error)) return;

      this.logger.debug('Non-fatal page translation error received', data.error);

      ErrorHandler.getInstance().handle(data.error, {
        context: data.context || 'page-translation',
        showToast: true
      }).catch(err => this.logger.warn('ErrorHandler failed for non-fatal error:', err));

      this.manager._broadcastEvent(MessageActions.PAGE_TRANSLATE_ERROR, {
        error: data.error?.message || String(data.error),
        errorType: data.errorType,
        isFatal: false
      });
    });

    // 4. Conflict Resolution
    bus.on('STOP_CONFLICTING_FEATURES', (data) => {
      if ((this.manager.isTranslating || this.manager.isTranslated) && data?.source !== 'page-translation') {
        this.logger.info('Stopping/Restoring Page Translation due to conflicting feature:', data?.source);
        this.manager.restorePage();
      }
    });

    window._translateItPageTranslationListenersSet = true;
  }
}
