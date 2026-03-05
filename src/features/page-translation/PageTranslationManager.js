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
import { PageTranslationBatcher } from './PageTranslationBatcher.js';
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
    
    this.batcher = new PageTranslationBatcher(this.logger);
    this.bridge = new PageTranslationBridge(this.logger);

    this.settings = {};
    
    // Listen for progress from batcher and forward to background
    pageEventBus.on(MessageActions.PAGE_TRANSLATE_PROGRESS, (data) => {
      sendRegularMessage({ 
        action: MessageActions.PAGE_TRANSLATE_PROGRESS, 
        data, 
        context: 'page-translation-progress-forward' 
      }).catch(() => {});
    });

    // Listen for fatal errors from batcher (Circuit Breaker)
    pageEventBus.on('page-translation-fatal-error', ({ error, errorType }) => this._handleFatalError(error, errorType));
  }

  async activate() {
    if (this.isActive) return true;
    try {
      await this.toastIntegration.initialize();
      await this._loadSettings();
      this.batcher.setSettings(this.settings);
      
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

  async translatePage() {
    // 1. Check for URL change first in SPAs
    if (this.currentUrl !== window.location.href) {
      this.resetLocalState();
      this.currentUrl = window.location.href;
    }

    if (this.isTranslating || this.isTranslated) return { success: false, reason: 'busy_or_done' };
    if (!PageTranslationHelper.isSuitableForTranslation(this.logger)) return { success: false, reason: 'not_suitable' };

    this.isTranslating = true;
    this.abortController = new AbortController();
    this.translationMessageId = `page-translate-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    this.sessionContext = Symbol('translation-session');

    try {
      this._broadcastEvent(MessageActions.PAGE_TRANSLATE_START, { url: this.currentUrl, messageId: this.translationMessageId });
      
      await this._loadSettings();
      this.batcher.setSettings(this.settings);
      this.batcher.setTranslationState(true, this.translationMessageId, this.sessionContext);

      // Initialize bridge with fresh context and standard callback
      await this.bridge.initialize(
        this.settings, 
        (text, context) => this.batcher.enqueue(text, context),
        this.sessionContext
      );
      
      this.bridge.translate(document.documentElement);
      
      this.isTranslated = true;
      this.isTranslating = false;
      
      if (this.settings.autoTranslateOnDOMChanges) {
        this.isAutoTranslating = true;
      }
      
      const resultData = { 
        url: this.currentUrl, 
        translatedCount: this.batcher.translatedCount,
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
      this.batcher.setTranslationState(false);
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
    this.batcher.reset();
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

      const resultData = {
        url: this.currentUrl, 
        translatedCount: this.batcher.translatedCount,
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
    // Check for URL change on every status request
    if (this.currentUrl && this.currentUrl !== window.location.href) {
      this.logger.debug('URL change detected in getStatus, resetting status');
      this.resetLocalState();
      this.currentUrl = window.location.href;
    }

    return {
      isActive: this.isActive,
      isTranslating: this.isTranslating,
      isTranslated: this.isTranslated,
      isAutoTranslating: this.isAutoTranslating,
      translatedCount: this.batcher.translatedCount,
      currentUrl: this.currentUrl,
      settings: this.settings,
    };
  }

  async cleanup() {
    this.cancelTranslation();
    if (this.isTranslated) await this.restorePage();
    this.isAutoTranslating = false;
    this.bridge.cleanup();
    this.batcher.reset();
    if (this.toastIntegration) {
      this.toastIntegration.shutdown();
    }
    super.cleanup();
  }
}

export const pageTranslationManager = new PageTranslationManager();
