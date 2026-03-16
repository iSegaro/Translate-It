import { getScopedLogger } from '@/shared/logging/logger.js';
import browser from 'webextension-polyfill';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { getWholePageLazyLoadingAsync, getWholePageAutoTranslateOnDOMChangesAsync, getWholePageRootMarginAsync, getWholePageExcludedSelectorsAsync, getWholePageAttributesToTranslateAsync, getWholePageShowOriginalOnHoverAsync, getTranslationApiAsync, getTargetLanguageAsync } from '@/config.js';
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
import { PAGE_TRANSLATION_TIMING } from './PageTranslationConstants.js';
import NotificationManager from '@/core/managers/core/NotificationManager.js';

export class PageTranslationManager extends ResourceTracker {
  constructor() {
    super('page-translation-manager');
    this.logger = getScopedLogger(LOG_COMPONENTS.PAGE_TRANSLATION, 'PageTranslationManager');
    
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
    
    this.scheduler = new PageTranslationScheduler(this.logger);
    this.bridge = new PageTranslationBridge(this.logger);
    this.hoverManager = new PageTranslationHoverManager();

    this.settings = {};
    
    // Listen for progress from scheduler and forward to background
    pageEventBus.on(MessageActions.PAGE_TRANSLATE_PROGRESS, (data) => {
      sendRegularMessage({ 
        action: MessageActions.PAGE_TRANSLATE_PROGRESS, 
        data, 
        context: 'page-translation-progress-forward' 
      }).catch(() => {});
    });

    // Listen for fatal errors from scheduler (Circuit Breaker)
    pageEventBus.on('page-translation-fatal-error', ({ error, errorType, localizedMessage }) => 
      this._handleFatalError(error, errorType, localizedMessage));

    // Listen for conflicting features (like Select Element Mode)
    pageEventBus.on('STOP_CONFLICTING_FEATURES', (data) => {
      if ((this.isTranslating || this.isTranslated) && data?.source !== 'page-translation') {
        this.logger.info('Stopping/Restoring Page Translation due to conflicting feature:', data?.source);
        this.restorePage(); // Fully restore if conflict happens
      }
    });
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

    if (this.isTranslating || (this.isTranslated && !options.isAuto)) return { success: false, reason: 'busy_or_done' };
    if (!PageTranslationHelper.isSuitableForTranslation(this.logger)) return { success: false, reason: 'not_suitable' };

    // Emit event to stop conflicting features (e.g., Select Element Mode)
    pageEventBus.emit('STOP_CONFLICTING_FEATURES', { source: 'page-translation' });

    this.isTranslating = true;
    this.abortController = new AbortController();
    this.translationMessageId = `page-translate-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    this.sessionContext = Symbol('translation-session');

    try {
      this._broadcastEvent(MessageActions.PAGE_TRANSLATE_START, { url: this.currentUrl, messageId: this.translationMessageId });
      
      await this._loadSettings(options);

      // Pass updated settings to scheduler (includes targetLanguage, provider)
      this.scheduler.setSettings(this.settings);

      // Update hover manager based on current settings
      if (this.settings.showOriginalOnHover) {
        this.hoverManager.initialize();
      } else {
        this.hoverManager.destroy();
      }

      // Show warning for Lingva provider in Whole Page Translation
      if (this.settings.translationApi === ProviderRegistryIds.LINGVA) {
        const warningMessage = await getTranslationString('LINGVA_WPT_WARNING');
        this.notificationManager.show(
          warningMessage || 'Lingva may have issues with long texts during page translation.',
          'warning',
          PAGE_TRANSLATION_TIMING.WARNING_DURATION
        );
      } else if (this.settings.translationApi === ProviderRegistryIds.BING) {
        const warningMessage = await getTranslationString('BING_WPT_WARNING');
        this.notificationManager.show(
          warningMessage || 'Bing may have issues with long texts during page translation.',
          'warning',
          PAGE_TRANSLATION_TIMING.WARNING_DURATION
        );
      }

      this.scheduler.setTranslationState(true, this.translationMessageId, this.sessionContext);

      // Initialize bridge with fresh context and standard callback
      await this.bridge.initialize(
        this.settings, 
        (text, context, score) => this.scheduler.enqueue(text, context, score),
        this.sessionContext
      );
      
      this.bridge.translate(document.documentElement);
      
      this.isTranslated = true;
      this.isTranslating = false;
      
      // Force auto-translating if requested or if setting is enabled
      if (this.settings.autoTranslateOnDOMChanges || options.isAuto) {
        this.isAutoTranslating = true;
      }
      
      const resultData = { 
        url: this.currentUrl, 
        translatedCount: this.scheduler.translatedCount,
        isAutoTranslating: this.isAutoTranslating,
        isTranslated: this.isTranslated
      };
      
      this._broadcastEvent(MessageActions.PAGE_TRANSLATE_COMPLETE, resultData);
      return { success: true, ...resultData };
    } catch (error) {
      if (isSilentError(error)) {
        this.logger.debug('translatePage: Silent error caught', error.message);
        this.isTranslating = false;
        return { success: false, reason: 'silent_error' };
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
   * Stop auto-translation (persistence) without restoring
   */
  async stopAutoTranslation() {
    if (!this.isAutoTranslating) return { success: false, reason: 'not_auto_translating' };

    try {
      this.bridge.stopPersistence();
      this.isAutoTranslating = false;
      this.isTranslated = true; // KEEP TRUE: The page IS still translated!
      
      // Notify batcher to stop and clear any pending timers/queues
      // This stops the background loop but we keep the manager's isTranslated=true
      this.scheduler.setTranslationState(false);

      const resultData = {
        url: this.currentUrl, 
        translatedCount: this.scheduler.translatedCount,
        isTranslated: true, // Tell background/UI we are still in translated state
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
    this._cleanupSession();
    this.restorePage(); // Use full restore for cancel
    
    if (this.abortController) {
      this.abortController.abort();
      this._broadcastEvent(MessageActions.PAGE_TRANSLATE_CANCELLED);
    }
  }

  _handleFatalError(error, errorType, localizedMessage = null) {
    if (this.isFatalErrorHandling) return;
    this.isFatalErrorHandling = true;

    this.logger.error('Fatal error. Stopping page translation.', error);
    this.cancelTranslation();
    
    // Get localized message for "Whole-page translation stopped"
    const stopMessage = browser.i18n.getMessage('ERRORS_PAGE_TRANSLATION_STOPPED') || '$1';
    
    // Use the provided localized message from scheduler if available, fallback to error message
    const displayError = localizedMessage || error.message || String(error);
    const finalMessage = stopMessage.replace('{error}', displayError).replace('$1', displayError);

    this.notificationManager.show(
      finalMessage,
      'warning',
      PAGE_TRANSLATION_TIMING.FATAL_ERROR_DURATION
    );

    this._broadcastEvent(MessageActions.PAGE_TRANSLATE_ERROR, { 
      error: displayError, 
      errorType,
      isFatal: true 
    });
  }

  async _loadSettings(options = {}) {
    const rawRootMargin = await getWholePageRootMarginAsync();
    const formattedRootMargin = rawRootMargin ? (String(rawRootMargin).match(/px|%|em|rem|vh|vw$/) ? String(rawRootMargin) : `${rawRootMargin}px`) : '10px';

    this.settings = {
      translationApi: await getTranslationApiAsync(),
      targetLanguage: options.targetLanguage || await getTargetLanguageAsync(),
      lazyLoading: await getWholePageLazyLoadingAsync(),
      rootMargin: formattedRootMargin,
      autoTranslateOnDOMChanges: await getWholePageAutoTranslateOnDOMChangesAsync(),
      excludedSelectors: await getWholePageExcludedSelectorsAsync(),
      attributesToTranslate: await getWholePageAttributesToTranslateAsync(),
      showOriginalOnHover: await getWholePageShowOriginalOnHoverAsync()
    };
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
      sendRegularMessage({ action, data, context: 'page-translation-broadcast' }).catch(() => {});
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
