// PageTranslationManager - Orchestrates whole page translation
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { getWholePageLazyLoadingAsync, getWholePageAutoTranslateOnDOMChangesAsync, getWholePageRootMarginAsync, getWholePageExcludedSelectorsAsync, getWholePageAttributesToTranslateAsync } from '@/config.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import NotificationManager from '@/core/managers/core/NotificationManager.js';

// Internal components
import { PageTranslationHelper } from './PageTranslationHelper.js';
import { PageTranslationBatcher } from './PageTranslationBatcher.js';
import { PageTranslationBridge } from './PageTranslationBridge.js';

export class PageTranslationManager extends ResourceTracker {
  constructor() {
    super('page-translation-manager');
    this.logger = getScopedLogger(LOG_COMPONENTS.PAGE_TRANSLATION, 'PageTranslationManager');
    
    this.baseNotifier = new NotificationManager();
    this.notificationManager = null;

    this.isActive = false;
    this.isTranslating = false;
    this.isTranslated = false;
    this.currentUrl = null;
    this.abortController = null;
    this.translationMessageId = null;
    
    this.batcher = new PageTranslationBatcher(this.logger);
    this.bridge = new PageTranslationBridge(this.logger);

    this.settings = {};
    
    // Listen for fatal errors from batcher (Circuit Breaker)
    pageEventBus.on('page-translation-fatal-error', ({ error, errorType }) => this._handleFatalError(error, errorType));
  }

  async activate() {
    if (this.isActive) return true;
    try {
      if (!this.notificationManager) {
        const { getSelectElementNotificationManager } = await import('@/features/element-selection/SelectElementNotificationManager.js');
        this.notificationManager = await getSelectElementNotificationManager(this.baseNotifier);
      }
      await this._loadSettings();
      this.batcher.setSettings(this.settings);
      
      await this.bridge.initialize(
        this.settings, 
        (text) => this.batcher.enqueue(text),
        (text, node) => this.batcher.trackNode(text, node)
      );

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
    if (this.isTranslating || this.isTranslated) return { success: false, reason: 'busy_or_done' };
    if (!PageTranslationHelper.isSuitableForTranslation(this.logger)) return { success: false, reason: 'not_suitable' };

    if (this.currentUrl !== window.location.href) {
      this.isTranslated = false;
      this.batcher.reset();
      this.currentUrl = window.location.href;
    }

    this.isTranslating = true;
    this.abortController = new AbortController();
    this.translationMessageId = `page-translate-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    try {
      this._broadcastEvent(MessageActions.PAGE_TRANSLATE_START, { url: this.currentUrl, messageId: this.translationMessageId });
      await this._loadSettings();
      this.batcher.setSettings(this.settings);
      this.batcher.setTranslationState(true, this.translationMessageId);

      if (!this.bridge.domTranslator) await this.activate();
      
      try {
        this.bridge.translate(document.documentElement);
      } catch (libError) {
        if (!libError.message?.includes('already been translated')) throw libError;
      }
      
      this.isTranslated = true;
      this.isTranslating = false;
      this._broadcastEvent(MessageActions.PAGE_TRANSLATE_COMPLETE, { url: this.currentUrl });
      return { success: true };
    } catch (error) {
      this.isTranslating = false;
      this._broadcastEvent(MessageActions.PAGE_TRANSLATE_ERROR, { error: error.message });
      throw error;
    }
  }

  async restorePage() {
    this._cleanupSession();
    try {
      this.bridge.restore(document.documentElement);
      this.isTranslated = false;
      this.isTranslating = false;
      this.batcher.setTranslationState(false);
      
      const translatedElements = document.querySelectorAll('[data-page-translated]');
      translatedElements.forEach(el => {
        el.removeAttribute('dir');
        el.removeAttribute('data-page-translated');
        el.removeAttribute('data-translate-dir');
      });

      this._broadcastEvent(MessageActions.PAGE_RESTORE_COMPLETE, { url: this.currentUrl });
      return { success: true };
    } catch (error) {
      this._broadcastEvent(MessageActions.PAGE_RESTORE_ERROR, { error: error.message });
      throw error;
    }
  }

  cancelTranslation() {
    this._cleanupSession();
    this.bridge.restore(document.documentElement);
    if (this.abortController) {
      this.abortController.abort();
      this.isTranslating = false;
      this._broadcastEvent(MessageActions.PAGE_TRANSLATE_CANCELLED);
    }
  }

  _handleFatalError(error, errorType) {
    this.logger.info('[CIRCUIT BREAKER] Fatal error. Stopping page translation.');
    this.cancelTranslation();
    this.isTranslated = false;
    this.batcher.setTranslationState(false);
    
    pageEventBus.emit('show-notification', {
      type: 'error',
      message: browser.i18n.getMessage('error_rate_limit_reached') || 'Rate limit reached.',
      duration: 10000
    });

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
    return {
      isActive: this.isActive,
      isTranslating: this.isTranslating,
      isTranslated: this.isTranslated,
      translatedCount: this.batcher.translatedCount,
      currentUrl: this.currentUrl,
      settings: this.settings,
    };
  }

  async cleanup() {
    this.cancelTranslation();
    if (this.isTranslated) await this.restorePage();
    this.bridge.cleanup();
    this.batcher.reset();
    super.cleanup();
  }
}

export const pageTranslationManager = new PageTranslationManager();
