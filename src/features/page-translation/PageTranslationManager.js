import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { getWholePageLazyLoadingAsync, getWholePageAutoTranslateOnDOMChangesAsync, getWholePageRootMarginAsync, getWholePageExcludedSelectorsAsync, getWholePageAttributesToTranslateAsync } from '@/config.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { ToastIntegration } from '@/shared/toast/ToastIntegration.js';

// Internal components
import { PageTranslationHelper } from './PageTranslationHelper.js';
import { PageTranslationScheduler } from './PageTranslationScheduler.js';
import { PageTranslationBridge } from './PageTranslationBridge.js';

export class PageTranslationManager extends ResourceTracker {
  constructor() {
    super('page-translation-manager');
    this.logger = getScopedLogger(LOG_COMPONENTS.PAGE_TRANSLATION, 'PageTranslationManager');
    
    this.toastIntegration = new ToastIntegration(pageEventBus);

    this.isActive = false;
    this.isTranslating = false;
    this.isTranslated = false;
    this.isAutoTranslating = false;
    this.currentUrl = null;
    this.abortController = null;
    this.translationMessageId = null;
    this.sessionContext = null;
    
    this.scheduler = new PageTranslationScheduler(this.logger);
    this.bridge = new PageTranslationBridge(this.logger);

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
    pageEventBus.on('page-translation-fatal-error', ({ error, errorType }) => this._handleFatalError(error, errorType));
  }

  async activate() {
    if (this.isActive) return true;
    try {
      await this.toastIntegration.initialize();
      await this._loadSettings();
      this.scheduler.setSettings(this.settings);
      
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

    this.isTranslating = true;
    this.abortController = new AbortController();
    this.translationMessageId = `page-translate-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    this.sessionContext = Symbol('translation-session');

    try {
      this._broadcastEvent(MessageActions.PAGE_TRANSLATE_START, { url: this.currentUrl, messageId: this.translationMessageId });
      
      await this._loadSettings();
      this.scheduler.setSettings(this.settings);
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
      
      // 3. Complete reset
      this.resetLocalState();

      // Small delay for DOM to stabilize
      await new Promise(r => setTimeout(r, 50));

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

  _handleFatalError(error, errorType) {
    this.logger.info('[CIRCUIT BREAKER] Fatal error. Stopping page translation.');
    this.cancelTranslation();
    
    const message = browser.i18n.getMessage('error_rate_limit_reached') || 'Rate limit reached.';
    this.toastIntegration.showError(message, { duration: 10000 });

    this._broadcastEvent(MessageActions.PAGE_TRANSLATE_ERROR, { 
      error: error.message || String(error), 
      errorType,
      isFatal: true 
    });
  }

  async _loadSettings() {
    this.settings = {
      lazyLoading: await getWholePageLazyLoadingAsync(),
      rootMargin: await getWholePageRootMarginAsync() || '300px',
      autoTranslateOnDOMChanges: await getWholePageAutoTranslateOnDOMChangesAsync(),
      excludedSelectors: await getWholePageExcludedSelectorsAsync(),
      attributesToTranslate: await getWholePageAttributesToTranslateAsync()
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
    } catch (_) {}
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
    if (this.toastIntegration) {
      this.toastIntegration.shutdown();
    }
    super.cleanup();
  }
}

export const pageTranslationManager = new PageTranslationManager();
