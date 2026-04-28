import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { ActionReasons } from '@/shared/messaging/core/MessagingCore.js';

import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import ExtensionContextManager from '@/core/extensionContext.js';
import { NOTIFICATION_TIME } from '@/shared/config/constants.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { ToastIntegration } from '@/shared/toast/ToastIntegration.js';
import { getTranslationString } from '@/utils/i18n/i18n.js';
import { shouldShowProviderWarning } from '@/shared/utils/warning-manager.js';
import { delay } from '@/core/helpers.js';
import { ProviderRegistryIds } from '@/features/translation/providers/ProviderConstants.js';
import { isSilentError } from '@/shared/error-management/ErrorMatcher.js';

// Internal components
import { PageTranslationHelper } from './PageTranslationHelper.js';
import { PageTranslationScheduler } from './PageTranslationScheduler.js';
import { PageTranslationBridge } from './PageTranslationBridge.js';
import { hoverPreviewManager } from '@/features/shared/hover-preview/HoverPreviewManager.js';
import { PageTranslationScrollTracker } from './utils/PageTranslationScrollTracker.js';
import { PAGE_TRANSLATION_TIMING } from './PageTranslationConstants.js';
import NotificationManager from '@/core/managers/core/NotificationManager.js';

// Modularized utilities
import { PageTranslationSettingsLoader } from './utils/PageTranslationSettingsLoader.js';
import { PageTranslationEventManager } from './utils/PageTranslationEventManager.js';

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
    this.hoverManager = hoverPreviewManager;
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
    
    // Modularize event management
    this.eventManager = new PageTranslationEventManager(this);
  }

  async activate() {
    if (this.isActive) return true;
    try {
      await this.toastIntegration.initialize();
      this.settings = await PageTranslationSettingsLoader.load();
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

    // Inject layout fixes to the host page
    this._injectLayoutFix();

    // Emit event to stop conflicting features (e.g., Select Element Mode)
    pageEventBus.emit('STOP_CONFLICTING_FEATURES', { source: 'page-translation' });

    this.isTranslating = true;
    this.abortController = new AbortController();
    this.translationMessageId = `page-translate-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    this.sessionContext = Symbol('translation-session');

    // Reset scheduler for a fresh session
    this.scheduler.reset();

    try {
      this.settings = await PageTranslationSettingsLoader.load(options);

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

      // Start scroll tracker to ensure visibility-driven flushes for already-enqueued items.
      // This is critical for catching nodes skipped during fast scrolling.
      this.scrollTracker.start(this.settings.scrollStopDelay);

      // Show warning for Lingva provider in Whole Page Translation
      if (this.settings.translationApi === ProviderRegistryIds.LINGVA) {
        if (await shouldShowProviderWarning('Lingva')) {
          const warningMessage = await getTranslationString('LINGVA_WPT_WARNING');
          this.notificationManager.show(
            warningMessage || 'Lingva may have issues with long texts during page translation.',
            'warning',
            NOTIFICATION_TIME.WARNING_PROVIDER
          );
        }
      } else if (this.settings.translationApi === ProviderRegistryIds.BING) {
        if (await shouldShowProviderWarning('Bing')) {
          const warningMessage = await getTranslationString('BING_WPT_WARNING');
          this.notificationManager.show(
            warningMessage || 'Bing may have issues with long texts during page translation.',
            'warning',
            NOTIFICATION_TIME.WARNING_PROVIDER
          );
        }
      }

      this.scheduler.setTranslationState(true, this.translationMessageId, this.sessionContext);

      // Initialize bridge with fresh context and standard callback
      await this.bridge.initialize(
        this.settings, 
        (text, context, score, node) => {
          // If we were idle, switch back to translating state
          if (this.isAutoTranslating && !this.isTranslating) {
            this.isTranslating = true;
            this._broadcastEvent(MessageActions.PAGE_TRANSLATE_PROGRESS, {
              status: 'translating',
              isTranslating: true,
              isAutoTranslating: true
            });
          }

          // If we are in "On Stop" mode, notify activity to reset the timer
          if (this.settings.translateAfterScrollStop) {
            this.scrollTracker.notifyActivity();
          }
          return this.scheduler.enqueue(text, context, score, node);
        },
        this.sessionContext
      );
      
      // CRITICAL: Translate only document.body to prevent scroll jumps and HEAD-tag interference.
      // Translating documentElement causes jumps to top on sites with complex scrollers (like Twitter).
      this.bridge.translate(document.body);
      
      this.isTranslated = false;
      this.isTranslating = true;
      this.isAutoTranslating = !!this.settings.autoTranslateOnDOMChanges;

      return { 
        success: true, 
        url: this.currentUrl, 
        messageId: this.translationMessageId,
        isAutoTranslating: this.isAutoTranslating 
      };
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
    this._removeLayoutFix();
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

      // 4. Get the count before resetting
      const restoredCount = this.scheduler.translatedCount || 0;

      // 5. Complete reset
      this.resetLocalState();

      // Small delay for DOM to stabilize
      await delay(PAGE_TRANSLATION_TIMING.DOM_STABILIZATION_DELAY);

      const resultData = { url: this.currentUrl, restoredCount };
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
    this._removeLayoutFix();
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

    this.isTranslating = false;
    this.isAutoTranslating = false;
    this.isFatalErrorHandling = false;

    // CRITICAL: Stop further translation without restoring the page.
    // This ensures already translated parts remain visible.
    this.stopAutoTranslation().catch(() => {});

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
    }

    // ALWAYS broadcast local state update via PageEventBus to ensure UI (FAB, Sidepanel) 
    // resets its state even on non-silent fatal errors.
    pageEventBus.emit(MessageActions.PAGE_TRANSLATE_PROGRESS, {
      status: 'idle',
      isTranslating: false,
      percent: 0,
      isInternal: true
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

  /**
   * Injects minimal CSS fixes to ensure layout stability during translation.
   * 
   * Strategy: "Non-Intrusive Protection"
   * 1. Uses 'overflow-x: clip' to prevent horizontal scrollbars without triggering scroll resets.
   * 2. Uses 'max-width: 100%' to keep the body within viewport bounds (fixes Wikipedia FAB drift).
   * 3. Neutralizes 'transform/filter' on body to protect 'position: fixed' elements (Toasts, FAB).
   * 4. Strictly avoids touching the <html> tag to prevent the browser from jumping to the top.
   * 
   * @private
   */
  _injectLayoutFix() {
    try {
      // Mark both html and body for maximum specificity without triggering scroll jumps
      document.documentElement.classList.add('ti-translation-active');

      if (!document.getElementById('ti-translation-layout-fix')) {
        const style = document.createElement('style');
        style.id = 'ti-translation-layout-fix';
        style.textContent = `
          /**
           * UNIVERSAL LAYOUT STABILITY FIX
           */
          html.ti-translation-active body {
            /* Basic protection for all devices */
            overflow-x: clip !important;
          }

          /**
           * MOBILE & TOUCH SPECIFIC FIX
           * We use containment on mobile/tablet or touch devices to solve persistent 
           * horizontal scrollbars (like on Wikipedia) without causing layout jumps 
           * on desktop (like Twitter).
           * Since UI Host is attached to <html>, containment on <body> won't break 
           * the fixed position of the FAB/Sheet.
           */
          @media (max-width: 1024px), (pointer: coarse) {
            html.ti-translation-active body {
              contain: paint !important;
              max-width: 100% !important;
            }
          }
        `;
        document.head.appendChild(style);
      }
    } catch (e) {
      this.logger.debug('Failed to inject layout fix:', e);
    }
  }

  /**
   * Removes layout fixes and cleans up the DOM after translation is restored or stopped.
   * @private
   */
  _removeLayoutFix() {
    try {
      document.documentElement.classList.remove('ti-translation-active');
      const style = document.getElementById('ti-translation-layout-fix');
      if (style) style.remove();
    } catch (e) {
      this.logger.debug('Failed to remove layout fix:', e);
    }
  }

  async _broadcastEvent(action, data = {}) {
    try {
      const isTopFrame = window.self === window.top;

      // Always emit to pageEventBus (both main frame and iframes)
      // This ensures content app receives messages from all frames
      pageEventBus.emit(action, data);

      // Only broadcast to background from the main frame (top-level window)
      // This prevents duplicate messages from iframes to other contexts
      if (isTopFrame) {
        sendRegularMessage({ action, data, context: 'page-translation-broadcast' }, { silent: true }).catch(() => {});
      } else {
        // IFrame: Send to Main Frame for aggregation
        this.logger.debug(`IFrame sending event to main frame: ${action}`, data);
        try {
          window.top.postMessage({
            type: 'TRANSLATE_IT_PAGE_EVENT',
            action,
            data: {
              ...data,
              frameUrl: window.location.href
            },
            source: 'translate-it-iframe'
          }, '*');
          this.logger.debug(`IFrame successfully sent event to main frame`);
        } catch (e) {
          this.logger.warn('IFrame failed to send event to main frame:', e);
        }
      }
    } catch (error) {
      this.logger.debug('Broadcast event failed - iframe or background unavailable:', error);
    }
  }

  getStatus() {
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
