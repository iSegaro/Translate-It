import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { ActionReasons } from '@/shared/messaging/core/MessagingCore.js';
import { 
  getWholePageLazyLoadingAsync, 
  getWholePageAutoTranslateOnDOMChangesAsync, 
  getWholePageRootMarginAsync, 
  getWholePageExcludedSelectorsAsync, 
  getWholePageAttributesToTranslateAsync, 
  getWholePageShowOriginalOnHoverAsync, 
  getWholePageTranslateAfterScrollStopAsync,
  getTranslationApiAsync, 
  getTargetLanguageAsync,
  getModeProvidersAsync,
  TranslationMode
} from '@/config.js';

import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import ExtensionContextManager from '@/core/extensionContext.js';
import { NOTIFICATION_TIME } from '@/shared/config/constants.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { ToastIntegration } from '@/shared/toast/ToastIntegration.js';
import { getTranslationString } from '@/utils/i18n/i18n.js';
import { delay } from '@/core/helpers.js';
import { ProviderRegistryIds } from '@/features/translation/providers/ProviderConstants.js';
import { isSilentError } from '@/shared/error-management/ErrorMatcher.js';


// Internal components
import { PageTranslationHelper } from './PageTranslationHelper.js';
import { PageTranslationScheduler } from './PageTranslationScheduler.js';
import { PageTranslationBridge } from './PageTranslationBridge.js';
import { PageTranslationHoverManager } from './PageTranslationHoverManager.js';
import { PageTranslationScrollTracker } from './utils/PageTranslationScrollTracker.js';
import { PAGE_TRANSLATION_TIMING } from './PageTranslationConstants.js';
import NotificationManager from '@/core/managers/core/NotificationManager.js';

export class PageTranslationManager extends ResourceTracker {
  constructor() {
    super('page-translation-manager');
    this.logger = getScopedLogger(LOG_COMPONENTS.PAGE_TRANSLATION, 'Manager');
    
    this.toastIntegration = new ToastIntegration(pageEventBus);
    this.notificationManager = new NotificationManager();

    this.isActive = false;
    this.isTranslating = false;
    this.isTranslated = false;
    this.isAutoTranslating = false;
    this.currentUrl = null;
    this.abortController = null;
    this.translationMessageId = null;
    this.sessionContext = null;
    this.isFatalErrorHandling = false;
    this._isCancelling = false;
    
    this.scheduler = new PageTranslationScheduler();
    this.bridge = new PageTranslationBridge();
    this.hoverManager = new PageTranslationHoverManager();
    this.scrollTracker = new PageTranslationScrollTracker(
      () => {
        this.logger.debug('Scroll stop detected, signaling scheduler');
        this.scheduler.signalScrollStop();
      },
      () => {
        this.logger.debug('Scroll start detected, signaling scheduler');
        this.scheduler.signalScrollStart();
      }
    );

    this.settings = {};
    this._listenersInitialized = false;
    
    // Bind handlers to this instance for reliable removal
    this._handlers = {
      progress: (data) => {
        // High-frequency event: send to background but skip logging if possible
        sendRegularMessage({ 
          action: MessageActions.PAGE_TRANSLATE_PROGRESS, 
          data, 
          context: 'page-translation-progress-forward' 
        }, { silent: true }).catch(() => {});
      },
      fatalError: ({ error, errorType, localizedMessage }) => this._handleFatalError(error, errorType, localizedMessage),
      translate: (options) => {
        this.logger.info('Page translation requested via PageEventBus');
        this.translatePage(options || {}).catch(err => {
          this.logger.error('Failed to translate page from PageEventBus:', err);
        });
      },
      restore: () => {
        this.logger.info('Page restore requested via PageEventBus');
        this.restorePage().catch(() => {});
      },
      cancel: () => {
        this.logger.info('Page translation cancel requested via PageEventBus');
        this.cancelTranslation();
      },
      stopConflicts: (data) => {
        if ((this.isTranslating || this.isTranslated) && data?.source !== 'page-translation') {
          this.logger.info('Stopping/Restoring Page Translation due to conflicting feature:', data?.source);
          this.restorePage();
        }
      }
    };

    this._setupPageEventBusListeners();
    this._setupStorageListeners();
  }

  _setupStorageListeners() {
    // 1. Listen for global TRANSLATION_API changes
    storageManager.on('change:TRANSLATION_API', ({ newValue, oldValue }) => {
      if (newValue !== oldValue) {
        this.logger.info('Global TRANSLATION_API changed, resetting error state');
        this.resetError();
      }
    });

    // 2. Listen for MODE_PROVIDERS changes
    storageManager.on('change:MODE_PROVIDERS', ({ newValue, oldValue }) => {
      // TranslationMode.Page matches MessageContexts.PAGE_TRANSLATION_BATCH
      const newPageProvider = newValue?.[TranslationMode.Page];
      const oldPageProvider = oldValue?.[TranslationMode.Page];

      if (newPageProvider !== oldPageProvider) {
        this.logger.info('Mode-specific provider for PAGE changed, resetting error state');
        this.resetError();
      }
    });
  }

  _setupPageEventBusListeners() {
    const bus = window.pageEventBus;
    if (!bus) return;

    // Use a unique global flag to prevent multiple registrations in the same page
    if (window._translateItPageTranslationListenersSet) {
      this.logger.debug('Listeners already registered globally, skipping');
      return;
    }

    this.logger.info('Setting up GLOBAL PageEventBus listeners for PageTranslationManager');

    // Listen for progress from scheduler and forward to background
    bus.on(MessageActions.PAGE_TRANSLATE_PROGRESS, (data) => {
      // Use silent option to prevent high-frequency logging in UnifiedMessaging
      sendRegularMessage({ 
        action: MessageActions.PAGE_TRANSLATE_PROGRESS, 
        data, 
        context: 'page-translation-progress-forward' 
      }, { silent: true }).catch(() => {});
    });

    // Listen for fatal errors from scheduler (Circuit Breaker)
    bus.on('page-translation-fatal-error', ({ error, errorType, localizedMessage }) => 
      this._handleFatalError(error, errorType, localizedMessage));

    // Listen for activation from PageEventBus (Mobile Dashboard)
    bus.on(MessageActions.PAGE_TRANSLATE, (options) => {
      this.logger.info('Page translation requested via PageEventBus');
      this.translatePage(options || {}).catch(err => {
        this.logger.error('Failed to translate page from PageEventBus:', err);
      });
    });

    bus.on(MessageActions.PAGE_RESTORE, () => {
      this.logger.info('Page restore requested via PageEventBus');
      this.restorePage().catch(() => {});
    });

    bus.on(MessageActions.PAGE_TRANSLATE_CANCELLED, () => {
      this.logger.info('Page translation cancel requested via PageEventBus');
      this.cancelTranslation();
    });

    bus.on(MessageActions.PAGE_TRANSLATE_STOP_AUTO, () => {
      this.logger.info('Page stop auto-translation/pass requested via PageEventBus');
      this.stopAutoTranslation().catch(() => {});
    });

    bus.on(MessageActions.PAGE_TRANSLATE_RESET_ERROR, (data) => {
      // Prevent infinite loop: ignore events that we broadcasted ourselves
      if (data?.isInternal) return;

      this.logger.info('Page translation error reset requested via PageEventBus');
      this.resetError();
    });

    // Listen for internal errors from scheduler to handle broadcasting and UI feedback
    bus.on('page-translation-internal-error', (data) => {
      if (data.isFatal) {
        // Fatal errors are already handled via 'page-translation-fatal-error' listener
        return;
      }

      // Check if this error is related to extension context invalidation
      if (ExtensionContextManager.isContextError(data.error)) {
        // Context errors are handled by their origin or the fatal-error handler
        return;
      }

      this.logger.debug('Non-fatal page translation error received', data.error);

      // Handle UI feedback for non-fatal errors
      ErrorHandler.getInstance().handle(data.error, {
        context: data.context || 'page-translation',
        showToast: true
      }).catch(err => this.logger.warn('ErrorHandler failed for non-fatal error:', err));

      // Broadcast to update UI (red dot) and other extension parts
      this._broadcastEvent(MessageActions.PAGE_TRANSLATE_ERROR, {
        error: data.error?.message || String(data.error),
        errorType: data.errorType,
        isFatal: false
      });
    });

    bus.on(MessageActions.PAGE_TRANSLATE_COMPLETE, (data) => {
      this.logger.info('Page translation complete event received in Manager');
      this.isTranslating = false;
      this.isTranslated = true;
      
      // Forward to background - also silent to reduce noise
      sendRegularMessage({ 
        action: MessageActions.PAGE_TRANSLATE_COMPLETE, 
        data: {
          ...data,
          url: this.currentUrl,
          isAutoTranslating: this.isAutoTranslating,
          sessionId: this.translationMessageId // Include sessionId for stats report
        }, 
        context: 'page-translation-complete-forward' 
      }, { silent: true }).catch(() => {});
    });

    // Listen for conflicting features (like Select Element Mode)
    bus.on('STOP_CONFLICTING_FEATURES', (data) => {
      if ((this.isTranslating || this.isTranslated) && data?.source !== 'page-translation') {
        this.logger.info('Stopping/Restoring Page Translation due to conflicting feature:', data?.source);
        this.restorePage(); // Fully restore if conflict happens
      }
    });

    window._translateItPageTranslationListenersSet = true;
    this._listenersInitialized = true;
  }

  async activate() {
    if (this.isActive) return true;
    try {
      await this.toastIntegration.initialize();
      await this._loadSettings();
      this.scheduler.setSettings(this.settings);
      
      if (this.settings.showOriginalOnHover) {
        this.hoverManager.initialize();
      }
      
      this.isActive = true;
      this.logger.init('PageTranslationManager activated');
      return true;
    } catch (error) {
      this.logger.error('Activation failed', error);
      return false;
    }
  }

  async deactivate() {
    if (!this.isActive) return;
    await this.cleanup();
    this.isActive = false;
  }

  async translatePage(options = {}) {
    // 1. Check for URL change - ALWAYS reset for a clean slate in SPAs
    if (this.currentUrl !== window.location.href) {
      this.resetLocalState();
      this.currentUrl = window.location.href;
    }

    if (this.isTranslating || (this.isTranslated && !options.isAuto)) return { success: false, reason: ActionReasons.BUSY_OR_DONE };
    if (!PageTranslationHelper.isSuitableForTranslation(this.logger)) return { success: false, reason: ActionReasons.NOT_SUITABLE };

    // Emit event to stop conflicting features (e.g., Select Element Mode)
    pageEventBus.emit('STOP_CONFLICTING_FEATURES', { source: 'page-translation' });

    this.isTranslating = true;
    this.abortController = new AbortController();
    this.translationMessageId = `page-translate-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    this.sessionContext = Symbol('translation-session');

    // Reset scheduler for a fresh session
    this.scheduler.reset();

    try {
      await this._loadSettings(options);

      this._broadcastEvent(MessageActions.PAGE_TRANSLATE_START, { 
        url: this.currentUrl, 
        messageId: this.translationMessageId,
        isAutoTranslating: !!this.settings.autoTranslateOnDOMChanges
      });

      this.isTranslated = false;
      this.isTranslating = true;
      this.isAutoTranslating = !!this.settings.autoTranslateOnDOMChanges;

      this.scheduler.setSettings(this.settings);

      // Update hover manager based on current settings
      if (this.settings.showOriginalOnHover) {
        this.hoverManager.initialize();
      } else {
        this.hoverManager.destroy();
      }

      // Start scroll tracker if enabled
      if (this.settings.translateAfterScrollStop) {
        this.scrollTracker.start();
      } else {
        this.scrollTracker.stop();
      }

      // Show warning for Lingva provider in Whole Page Translation
      if (this.settings.translationApi === ProviderRegistryIds.LINGVA) {
        const warningMessage = await getTranslationString('LINGVA_WPT_WARNING');
        this.notificationManager.show(
          warningMessage || 'Lingva may have issues with long texts during page translation.',
          'warning',
          NOTIFICATION_TIME.WARNING_PROVIDER
        );
      } else if (this.settings.translationApi === ProviderRegistryIds.BING) {
        const warningMessage = await getTranslationString('BING_WPT_WARNING');
        this.notificationManager.show(
          warningMessage || 'Bing may have issues with long texts during page translation.',
          'warning',
          NOTIFICATION_TIME.WARNING_PROVIDER
        );
      }

      this.scheduler.setTranslationState(true, this.translationMessageId, this.sessionContext);

      // Initialize bridge with fresh context and standard callback
      await this.bridge.initialize(
        this.settings, 
        (text, context, score, node) => this.scheduler.enqueue(text, context, score, node),
        this.sessionContext
      );
      
      this.bridge.translate(document.documentElement);
      
      // We are now officially translating. 
      // We do NOT set isTranslating = false or broadcast COMPLETE here anymore, 
      // because domtranslator discovery/scheduler is asynchronous and just started.
      // Note: we don't set isTranslated = true yet, as no content has been processed.
      this.isTranslated = false;
      this.isTranslating = true;
      this.isAutoTranslating = !!this.settings.autoTranslateOnDOMChanges;

      return { success: true, url: this.currentUrl, messageId: this.translationMessageId };
    } catch (error) {
      if (isSilentError(error)) {
        this.logger.debug('translatePage: Silent error caught', error.message);
        this.isTranslating = false;
        return { success: false, reason: ActionReasons.SILENT_ERROR };
      }
      
      this.logger.error('translatePage failed', error);
      this.isTranslating = false;
      this.isAutoTranslating = false;
      this._broadcastEvent(MessageActions.PAGE_TRANSLATE_ERROR, { error: error.message });
      throw error;
    }
  }

  async restorePage() {
    this._cleanupSession();
    try {
      // 0. Stop scroll tracker
      this.scrollTracker.stop();

      // 1. First stop batcher to prevent loop during library's restore
      this.scheduler.setTranslationState(false);
      this.isTranslated = false;
      this.isAutoTranslating = false;

      // 2. Use standard library restore
      this.bridge.restore(document.documentElement);
      
      // 3. Deep clean any remaining markers
      PageTranslationHelper.deepCleanDOM();

      // 4. Complete reset
      this.resetLocalState();

      // Small delay for DOM to stabilize
      await delay(PAGE_TRANSLATION_TIMING.DOM_STABILIZATION_DELAY);

      const resultData = { url: this.currentUrl, restoredCount: 0 };
      this._broadcastEvent(MessageActions.PAGE_RESTORE_COMPLETE, resultData);
      return { success: true, ...resultData };
    } catch (error) {
      this.logger.error('Restore failed', error);
      this._broadcastEvent(MessageActions.PAGE_RESTORE_ERROR, { error: error.message });
      throw error;
    }
  }

  resetError() {
    this.isFatalErrorHandling = false;
    this._broadcastEvent(MessageActions.PAGE_TRANSLATE_RESET_ERROR, { isInternal: true });
  }

  resetLocalState() {
    this.isTranslated = false;
    this.isTranslating = false;
    this.isAutoTranslating = false;
    this.isFatalErrorHandling = false; // Reset flag
    this.sessionContext = null;
    this.scheduler.reset();
    this.bridge.cleanup();
  }

  /**
   * Stop auto-translation (persistence) or current pass without restoring
   */
  async stopAutoTranslation() {
    // Allow stopping if either we are in initial pass OR auto-translating changes
    if (!this.isAutoTranslating && !this.isTranslating) {
      return { success: false, reason: ActionReasons.NOT_AUTO_TRANSLATING };
    }

    try {
      this.logger.info('Stopping page translation/persistence without restoring');
      
      this.scrollTracker.stop();
      this.bridge.stopPersistence();
      this.isAutoTranslating = false;
      this.isTranslating = false;
      this.isTranslated = this.scheduler.translatedCount > 0;
      
      // Stop the scheduler from processing more batches
      this.scheduler.setTranslationState(false);

      const resultData = {
        url: this.currentUrl, 
        translatedCount: this.scheduler.translatedCount,
        isTranslated: this.isTranslated, 
        isAutoTranslating: false
      };
      
      this._broadcastEvent(MessageActions.PAGE_AUTO_RESTORE_COMPLETE, resultData);
      return { success: true, ...resultData };
    } catch (error) {
      this.logger.error('Failed to stop auto-translation', error);
      return { success: false, error: error.message };
    }
  }

  cancelTranslation() {
    if (this._isCancelling) return;
    this._isCancelling = true;

    try {
      this._cleanupSession();
      this.restorePage(); // Use full restore for cancel
      
      if (this.abortController) {
        this.abortController.abort();
        this._broadcastEvent(MessageActions.PAGE_TRANSLATE_CANCELLED, {
          sessionId: this.translationMessageId
        });
      }
    } finally {
      this._isCancelling = false;
    }
  }

  _handleFatalError(error, errorType, localizedMessage = null) {
    if (this.isFatalErrorHandling) return;
    this.isFatalErrorHandling = true;

    const isContextError = ExtensionContextManager.isContextError(error);

    // Use centralized context error detection to avoid orange/red logs
    if (isContextError) {
      ExtensionContextManager.handleContextError(error, 'page-translation-fatal');
    } else {
      this.logger.warn('Fatal error. Stopping page translation.', error.message);
    }

    // IMPORTANT: Even for context errors, we must force-reset internal flags 
    // to ensure the UI (which lives in the same page) doesn't get stuck.
    this.isTranslating = false;
    this.isAutoTranslating = false;
    this.isFatalErrorHandling = false;

    // Check if cancellation is already handled to avoid loop
    if (!this._isCancelling) {
      this.cancelTranslation();
    }

    // Use centralized ErrorHandler to manage notification and logging
    ErrorHandler.getInstance().handle(error, {
      type: errorType || ErrorTypes.TRANSLATION_FAILED,
      context: 'page-translation-fatal',
      showToast: !isContextError // Don't show toast for context errors
    }).catch(err => {
      this.logger.error('ErrorHandler failed in _handleFatalError:', err);
    });

    // Don't broadcast UI error for context errors to keep it silent
    if (!isContextError) {
      this._broadcastEvent(MessageActions.PAGE_TRANSLATE_ERROR, {
        error: localizedMessage || error.message || String(error),
        errorType: errorType || ErrorTypes.TRANSLATION_FAILED,
        isFatal: true
      });
    } else {
      // For context errors, we still need to broadcast a local state update 
      // via PageEventBus to ensure local UI components (like FAB) exit the "Translating" state.
      // This is crucial because sendMessage (inside _broadcastEvent) will fail.
      pageEventBus.emit(MessageActions.PAGE_TRANSLATE_PROGRESS, {
        status: 'idle',
        isTranslating: false,
        percent: 0,
        isInternal: true
      });
    }
  }
  async _loadSettings(options = {}) {
    // Load all settings in parallel using an object-based approach to ensure data integrity
    const settingsData = await Promise.all([
      getWholePageRootMarginAsync(),
      getModeProvidersAsync(),
      getTranslationApiAsync(),
      getTargetLanguageAsync(),
      getWholePageLazyLoadingAsync(),
      getWholePageAutoTranslateOnDOMChangesAsync(),
      getWholePageExcludedSelectorsAsync(),
      getWholePageAttributesToTranslateAsync(),
      getWholePageShowOriginalOnHoverAsync(),
      getWholePageTranslateAfterScrollStopAsync()
    ]);

    const [
      rawRootMargin,
      modeProviders,
      globalTranslationApi,
      targetLanguage,
      lazyLoading,
      autoTranslateOnDOMChanges,
      excludedSelectors,
      attributesToTranslate,
      showOriginalOnHover,
      translateAfterScrollStop
    ] = settingsData;

    const formattedRootMargin = rawRootMargin ? (String(rawRootMargin).match(/px|%|em|rem|vh|vw$/) ? String(rawRootMargin) : `${rawRootMargin}px`) : '10px';

    // Get mode-specific provider if not explicitly provided in options
    let effectiveProvider = options.provider;
    if (!effectiveProvider) {
      effectiveProvider = modeProviders?.[TranslationMode.Page] || globalTranslationApi;
    }

    this.settings = {
      translationApi: effectiveProvider,
      targetLanguage: options.targetLanguage || targetLanguage,
      lazyLoading: !!lazyLoading,
      rootMargin: formattedRootMargin,
      autoTranslateOnDOMChanges: !!autoTranslateOnDOMChanges,
      excludedSelectors: excludedSelectors,
      attributesToTranslate: attributesToTranslate,
      showOriginalOnHover: !!showOriginalOnHover,
      translateAfterScrollStop: !!translateAfterScrollStop
    };

    this.logger.debug('Page Translation Settings Loaded:', {
      provider: this.settings.translationApi,
      onStop: this.settings.translateAfterScrollStop,
      lazy: this.settings.lazyLoading
    });

    const { CONFIG } = await import('@/shared/config/config.js');
    Object.assign(this.settings, {
      chunkSize: CONFIG.WHOLE_PAGE_CHUNK_SIZE,
      maxConcurrentFlushes: CONFIG.WHOLE_PAGE_MAX_CONCURRENT_REQUESTS
    });
  }

  _cleanupSession() {
    if (this.translationMessageId) {
      sendRegularMessage({
        action: MessageActions.CANCEL_SESSION,
        data: { sessionId: this.translationMessageId }
      }).catch(() => {});
      this.translationMessageId = null;
    }
  }

  async _broadcastEvent(action, data = {}) {
    try {
      pageEventBus.emit(action, data);
      sendRegularMessage({ action, data, context: 'page-translation-broadcast' }, { silent: true }).catch(() => {});
    } catch {
      // Silent error
    }
  }

  getStatus() {
    // We no longer reset on URL change here because the background script 
    // and translatePage(isAuto) handle the state transition across navigations.
    if (this.currentUrl && this.currentUrl !== window.location.href) {
      this.currentUrl = window.location.href;
    }

    return {
      isActive: this.isActive,
      isTranslating: this.isTranslating,
      isTranslated: this.isTranslated,
      isAutoTranslating: this.isAutoTranslating,
      translatedCount: this.scheduler.translatedCount,
      currentUrl: this.currentUrl,
      settings: this.settings,
    };
  }

  async cleanup() {
    this.cancelTranslation();
    if (this.isTranslated) await this.restorePage();
    this.isAutoTranslating = false;
    this.scrollTracker.destroy();
    this.bridge.cleanup();
    this.scheduler.reset();
    if (this.hoverManager) {
      this.hoverManager.destroy();
    }
    if (this.toastIntegration) {
      this.toastIntegration.shutdown();
    }
    super.cleanup();
  }
}

export const pageTranslationManager = new PageTranslationManager();
