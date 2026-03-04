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
    this.isAutoTranslating = false; // Persistent translation state (NEW)
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
    // 1. Check for URL change first in SPAs
    if (this.currentUrl !== window.location.href) {
      this.logger.debug('URL change detected in translatePage, resetting state');
      this.isTranslated = false;
      this.isAutoTranslating = false;
      this.batcher.reset();
      this.currentUrl = window.location.href;
    }

    if (this.isTranslating || this.isTranslated) return { success: false, reason: 'busy_or_done' };
    if (!PageTranslationHelper.isSuitableForTranslation(this.logger)) return { success: false, reason: 'not_suitable' };

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
        // If library thinks it is already translated (internal state), we try to force it
        if (libError.message?.includes('already been translated')) {
          this.logger.debug('Library reported already translated, re-triggering for safety');
          if (this.bridge.domTranslator) this.bridge.domTranslator.translate(document.documentElement);
        } else {
          throw libError;
        }
      }
      
      this.isTranslated = true;
      this.isTranslating = false;
      
      // Handle auto-translation state (NEW)
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
      this.isTranslating = false;
      this.isAutoTranslating = false;
      this._broadcastEvent(MessageActions.PAGE_TRANSLATE_ERROR, { error: error.message });
      throw error;
    }
  }

  async restorePage() {
    this._cleanupSession();
    try {
      this.bridge.restore(document.documentElement);
      
      // CRITICAL: Reset everything so we can translate again on the same URL
      this.isTranslated = false;
      this.isTranslating = false;
      this.isAutoTranslating = false;
      this.batcher.reset(); // Clear counts and tracking
      this.batcher.setTranslationState(false);
      
      const translatedElements = document.querySelectorAll('[data-page-translated]');
      translatedElements.forEach(el => {
        el.removeAttribute('dir');
        el.removeAttribute('data-page-translated');
        el.removeAttribute('data-translate-dir');
      });

      const resultData = { url: this.currentUrl, restoredCount: 0 };
      this._broadcastEvent(MessageActions.PAGE_RESTORE_COMPLETE, resultData);
      return { success: true, ...resultData };
    } catch (error) {
      this._broadcastEvent(MessageActions.PAGE_RESTORE_ERROR, { error: error.message });
      throw error;
    }
  }

  /**
   * Stop auto-translation (persistence) without restoring
   */
  async stopAutoTranslation() {
    if (!this.isAutoTranslating) return { success: false, reason: 'not_auto_translating' };

    try {
      this.bridge.stopPersistence();
      this.batcher.stop(); // Stop batcher queue (NEW)
      this.isAutoTranslating = false;

      const resultData = {
        url: this.currentUrl, 
        translatedCount: this.batcher.translatedCount,
        isTranslated: this.isTranslated,
        isAutoTranslating: false
      };
      // We notify UI to change icon to Restore
      this._broadcastEvent(MessageActions.PAGE_AUTO_RESTORE_COMPLETE, resultData);
      return { success: true, ...resultData };
    } catch (error) {
      this.logger.error('Failed to stop auto-translation', error);
      return { success: false, error: error.message };
    }
  }

  cancelTranslation() {
    this._cleanupSession();
    this.bridge.restore(document.documentElement);
    
    // Reset flags always when cancelling
    this.isTranslating = false;
    this.isAutoTranslating = false;
    this.batcher.setTranslationState(false);

    if (this.abortController) {
      this.abortController.abort();
      this._broadcastEvent(MessageActions.PAGE_TRANSLATE_CANCELLED);
    }
  }

  _handleFatalError(error, errorType) {
    this.logger.info('[CIRCUIT BREAKER] Fatal error. Stopping page translation.');
    this.cancelTranslation();
    this.isTranslated = false;
    this.isAutoTranslating = false;
    
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
    // Check for URL change on every status request
    if (this.currentUrl && this.currentUrl !== window.location.href) {
      this.logger.debug('URL change detected in getStatus, resetting status');
      this.isTranslated = false;
      this.isAutoTranslating = false;
      this.batcher.reset();
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
    super.cleanup();
  }
}

export const pageTranslationManager = new PageTranslationManager();
