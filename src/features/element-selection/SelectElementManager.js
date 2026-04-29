// SelectElementManager - Specialized Manager for Select Element
// Single responsibility: Manage Select Element mode lifecycle and interactions

import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { pageEventBus, WINDOWS_MANAGER_EVENTS } from '@/core/PageEventBus.js';
import { sendMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import ExtensionContextManager from '@/core/extensionContext.js';
import { isFatalError, isCancellationError } from '@/shared/error-management/ErrorMatcher.js';
import { getSettingsAsync } from '@/shared/config/config.js';
import { NOTIFICATION_TIME, TRANSLATION_STATUS } from '@/shared/config/constants.js';
import { getTranslationString } from '@/utils/i18n/i18n.js';
import { shouldShowProviderWarning } from '@/shared/utils/warning-manager.js';
import { ProviderRegistryIds } from '@/features/translation/providers/ProviderConstants.js';
import { deviceDetector } from '@/utils/browser/compatibility.js';

// Hover manager for original text preview
import { hoverPreviewManager } from '@/features/shared/hover-preview/HoverPreviewManager.js';
import { getSelectElementShowOriginalOnHoverAsync } from '@/shared/config/config.js';

// Import CSS as inline string
import selectionStyles from './SelectElement.scss?inline';

// Import new simplified services
import { DomTranslatorAdapter } from './core/DomTranslatorAdapter.js';
import { ElementSelector } from './core/ElementSelector.js';
import { extractTextFromElement, isValidTextElement } from './utils/elementHelpers.js';

// Import notification manager
import { getSelectElementNotificationManager } from './SelectElementNotificationManager.js';

/**
 * SelectElementManager - Coordinates the interactive Select Element mode.
 * Uses a specialized DomTranslatorAdapter optimized for AI/DeepL context and token efficiency.
 */
class SelectElementManager extends ResourceTracker {
  constructor() {
    super('select-element-manager');

    // Core state
    this.isActive = false;
    this.isProcessingClick = false;
    this.isInitialized = false;
    this.instanceId = Math.random().toString(36).substring(7);
    this.isTopFrame = window === window.top;

    // Logger
    this.logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'SelectElementManager');

    // New simplified services
    this.domTranslatorAdapter = new DomTranslatorAdapter();
    this.elementSelector = new ElementSelector();

    // Store instance globally for cross-component detection
    window.selectElementManagerInstance = this;

    // Track services
    this.trackResource('dom-translator-adapter', () => {
      if (this.domTranslatorAdapter) {
        this.domTranslatorAdapter.cleanup?.();
        this.domTranslatorAdapter = null;
      }
    }, { isCritical: true });

    this.trackResource('element-selector', () => {
      if (this.elementSelector) {
        this.elementSelector.cleanup?.();
        this.elementSelector = null;
      }
    }, { isCritical: true });

    this.notificationManager = null;
    this.baseNotificationManager = null;
    this.contextWatchdogInterval = null;

    // Event handlers (bound)
    this.handleMouseOver = this.handleMouseOver.bind(this);
    this.handleMouseOut = this.handleMouseOut.bind(this);
    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleInteraction = this.handleInteraction.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);

    window.selectElementHandlingESC = false;
  }

  /**
   * Initialize the manager and all services
   */
  async initialize() {
    if (this.isInitialized) return;
    try {
      const [NotificationManagerModule] = await Promise.all([
        import('@/core/managers/core/NotificationManager.js'),
        this.domTranslatorAdapter.initialize(),
        this.elementSelector.initialize()
      ]);

      const baseNotificationManager = new NotificationManagerModule.default();
      this.baseNotificationManager = baseNotificationManager;
      this.notificationManager = await getSelectElementNotificationManager(baseNotificationManager);

      this.setupKeyboardListeners();
      this.setupCancelListener();
      this.setupCrossFrameCommunication();

      // Initialize hover manager for original text preview if enabled
      getSelectElementShowOriginalOnHoverAsync().then(enabled => {
        if (enabled) {
          hoverPreviewManager.initialize();
          this.logger.debug('Hover manager initialized via SelectElementManager');
        }
      });

      this.addEventListener(pageEventBus, MessageActions.ACTIVATE_SELECT_ELEMENT_MODE, (data) => {
        this.activateSelectElementMode(data || {}).catch(() => {});
      });

      this.addEventListener(pageEventBus, 'STOP_CONFLICTING_FEATURES', (data) => {
        if (this.isActive && data?.source !== 'select-element') {
          this.deactivate({ silent: true, reason: 'conflict' });
        }
      });

      this.isInitialized = true;
    } catch (error) {
      this.logger.warn('Error initializing SelectElementManager:', error);
      throw error;
    }
  }

  async activate() {
    if (this.isInitialized) return true;
    try {
      await this.initialize();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Activate Select Element mode
   */
  async activateSelectElementMode(options = {}) {
    if (this.isActive) return { isActive: this.isActive, instanceId: this.instanceId };

    await this._ensureStylesInjected();
    
    // Add activation attribute for global CSS styles (navigation prevention/cursor)
    document.documentElement.setAttribute('data-translate-it-select-mode', 'true');
    this._startContextWatchdog();

    const activationOptions = { targetLanguage: options.targetLanguage || null, ...options };
    pageEventBus.emit('STOP_CONFLICTING_FEATURES', { source: 'select-element' });

    try {
      this.isActive = true;
      this.isProcessingClick = false;
      this.hasInitialMovementOccurred = false; 
      this.currentOptions = activationOptions; 

      if (this.elementSelector) this.elementSelector.clearHighlight();
      this.setupEventListeners();

      // Ensure hover manager is initialized if enabled
      getSelectElementShowOriginalOnHoverAsync().then(enabled => {
        if (enabled) hoverPreviewManager.initialize();
      });

      const servicesAvailable = await this._ensureServicesAvailable();
      if (!servicesAvailable) throw new Error('Services initialization failed');

      // CRITICAL: Re-check if still active after async operations
      if (!this.isActive) return { isActive: false };

      this.elementSelector.activate();

      if (this.isTopFrame) {
        this.showNotification();
        const [settings, bingWarning, lingvaWarning] = await Promise.all([
          getSettingsAsync(),
          getTranslationString('BING_WPT_WARNING'),
          getTranslationString('LINGVA_WPT_WARNING')
        ]);

        // RE-CHECK again after another set of async calls
        if (!this.isActive) {
          this.dismissNotification();
          return { isActive: false };
        }

        const activeProvider = activationOptions.provider || settings.TRANSLATION_API;
        if (activeProvider === ProviderRegistryIds.BING) {
          if (await shouldShowProviderWarning('Bing')) {
            this.baseNotificationManager.show(
              bingWarning || 'Bing may have issues. Try another provider.',
              'warning',
              NOTIFICATION_TIME.WARNING_PROVIDER,
              { id: 'bing-warning' }
            );
          }
        } else if (activeProvider === ProviderRegistryIds.LINGVA) {
          if (await shouldShowProviderWarning('Lingva')) {
            this.baseNotificationManager.show(
              lingvaWarning || 'Lingva may have issues. Try another provider.',
              'warning',
              NOTIFICATION_TIME.WARNING_PROVIDER,
              { id: 'lingva-warning' }
            );
          }
        }
      }

      await this.notifyBackgroundActivation();
      this.activationTime = Date.now();
      pageEventBus.emit('select-mode-activated');

      return { isActive: this.isActive, instanceId: this.instanceId };
    } catch (error) {
      this.logger.warn('Error activating SelectElementManager:', error);
      this.isActive = false;
      this.emergencyCleanup();
      throw error;
    }
  }

  /**
   * Deactivate Select Element mode
   */
  async deactivate(options = {}) {
    if (!this.isActive) return;

    try {
      const {
        reason = 'manual', // 'success', 'error', 'cancel', 'manual', 'conflict'
        fromBackground = false,
        silent = false,
        preserveTranslations = options.preserveTranslations !== undefined
          ? options.preserveTranslations
          : true // Default: preserve translations in Select Element mode even on error
      } = options;

      this.logger.debug(`Deactivating SelectElementManager (Reason: ${reason})`, { ...options, preserveTranslations });

      this.isActive = false;
      this.activationTime = 0;
      
      // STOP watchdog and REMOVE interaction-blocking attribute immediately (Safety first)
      this._stopContextWatchdog();
      document.documentElement.removeAttribute('data-translate-it-select-mode');

      // Only cancel if we are actually in the middle of a translation
      if (reason === 'cancel' || reason === 'manual') {
        this.domTranslatorAdapter.cancelTranslation({ silent });
      }

      this.removeEventListeners();
      this.elementSelector.deactivate();

      // Always dismiss selection notifications during deactivation
      if (this.isTopFrame) {
        this.dismissNotification();
      }

      if (!preserveTranslations && this.domTranslatorAdapter.hasTranslation()) {
        await this.domTranslatorAdapter.revertTranslation();
      }

      if (!fromBackground) await this.notifyBackgroundDeactivation();
      pageEventBus.emit('select-mode-deactivated');

    } catch (error) {
      this.logger.error('Critical error deactivating SelectElementManager:', error);
      
      // Integrate with the centralized error system for unexpected manager failures
      if (!ExtensionContextManager.isContextError(error)) {
        // Log correctly
      } else {
        ExtensionContextManager.handleContextError(error, 'element-selection-deactivate');
      }
      
      this.emergencyCleanup();
    } finally {
      // Final guard for the UI lock
      document.documentElement.removeAttribute('data-translate-it-select-mode');
    }
  }

  async forceDeactivate() {
    return this.deactivate({ preserveTranslations: false, silent: true, reason: 'cancel' });
  }

  setupEventListeners() {
    if (this.isActive) {
      window.addEventListener('mouseover', this.handleMouseOver, true);
      window.addEventListener('mouseout', this.handleMouseOut, true);
      window.addEventListener('touchstart', this.handleTouchStart, { capture: true, passive: false });
      window.addEventListener('touchmove', this.handleTouchMove, { capture: true, passive: false });
      window.addEventListener('touchend', this.handleTouchEnd, { capture: true, passive: false });

      const interactionEvents = ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'contextmenu', 'dragstart'];
      interactionEvents.forEach(eventType => {
        window.addEventListener(eventType, this.handleInteraction, { capture: true, passive: false });
      });

      window.addEventListener('keydown', this.handleKeyDown, true);

      if (this.isTopFrame) {
        this.iframeMessageHandler = (event) => {
          if (event.data?.type === 'translate-it-deactivate-select-element') {
            this.deactivate({ fromIframe: true, reason: 'manual' }).catch(() => {});
          }
        };
        window.addEventListener('message', this.iframeMessageHandler);
      }
    }
  }

  removeEventListeners() {
    window.removeEventListener('mouseover', this.handleMouseOver, true);
    window.removeEventListener('mouseout', this.handleMouseOut, true);
    window.removeEventListener('touchstart', this.handleTouchStart, { capture: true, passive: false });
    window.removeEventListener('touchmove', this.handleTouchMove, { capture: true, passive: false });
    window.removeEventListener('touchend', this.handleTouchEnd, { capture: true, passive: false });
    
    const interactionEvents = ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'contextmenu', 'dragstart'];
    interactionEvents.forEach(eventType => {
      window.removeEventListener(eventType, this.handleInteraction, { capture: true, passive: false });
    });

    window.removeEventListener('keydown', this.handleKeyDown, true);
    if (this.isTopFrame && this.iframeMessageHandler) {
      window.removeEventListener('message', this.iframeMessageHandler);
      this.iframeMessageHandler = null;
    }
  }

  isCooldownActive() { return Date.now() - (this.activationTime || 0) < 500; }

  handleMouseOver(event) {
    if (!this.isActive || this.isProcessingClick || this.isCooldownActive()) return;
    const currentX = event.clientX;
    const currentY = event.clientY;
    if (this.lastMouseX !== undefined && (this.lastMouseX !== currentX || this.lastMouseY !== currentY)) {
      if (!this.hasInitialMovementOccurred) this.hasInitialMovementOccurred = true;
    }
    this.lastMouseX = currentX;
    this.lastMouseY = currentY;
    if (!this.hasInitialMovementOccurred) return;
    if (this.elementSelector && this.elementSelector.isOurElement(event.target)) return;
    this.elementSelector.handleMouseOver(event.target);
  }

  handleTouchStart(event) {
    if (!this.isActive || this.isProcessingClick || this.isCooldownActive()) return;
    if (this.elementSelector && this.elementSelector.isOurElement(event.touches[0].target)) return;
    event.preventDefault();
  }

  handleTouchMove(event) {
    if (!this.isActive || this.isProcessingClick || this.isCooldownActive()) return;
    if (!this.hasInitialMovementOccurred) this.hasInitialMovementOccurred = true;
    event.preventDefault();
    const touch = event.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!target || (this.elementSelector && this.elementSelector.isOurElement(target))) return;
    this.elementSelector.handleMouseOver(target);
  }

  handleTouchEnd(event) {
    if (!this.isActive || this.isProcessingClick) return;
    const highlighted = this.elementSelector.getHighlightedElement();
    if (highlighted) this.handleClick(event).catch(() => {});
  }

  handleMouseOut(event) {
    if (!this.isActive || this.isProcessingClick) return;
    if (this.elementSelector && this.elementSelector.isOurElement(event.target)) return;
    this.elementSelector.handleMouseOut(event.target);
  }

  handleInteraction(event) {
    if (!this.isActive || this.isCooldownActive()) return;
    const path = event.composedPath ? event.composedPath() : [event.target];
    if (path.some(el => this.elementSelector && this.elementSelector.isOurElement(el))) return;

    const isScrollRelatedTouch = event.type.startsWith('touch') || event.type.startsWith('pointer');
    if (this.isProcessingClick && isScrollRelatedTouch) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const isTriggerEvent = event.type === 'click' || (event.type === 'touchend' && deviceDetector.isMobile());
    if (isTriggerEvent && !this.isProcessingClick) {
      this.handleClick(event).catch(() => {});
    }
  }

  handleKeyDown(event) {
    if (!this.isActive) return;
    if (event.key === 'Escape' && !window.selectElementHandlingESC) {
      window.selectElementHandlingESC = true;
      setTimeout(() => { window.selectElementHandlingESC = false; }, 100);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.deactivate({ fromCancel: true, silent: false, reason: 'cancel' });
    }
  }

  async handleClick(event) {
    if (this.isProcessingClick) return;
    try {
      this.isProcessingClick = true;
      const elementToTranslate = this.elementSelector.getHighlightedElement() || event.target;
      if (!isValidTextElement(elementToTranslate)) return;

      const text = extractTextFromElement(elementToTranslate);
      if (text && text.trim()) {
        // 1. Stop highlighting logic
        this.elementSelector.deactivate();
        
        // 2. Restore page interaction immediately (Unlock cursor and links)
        this._unlockPageInteraction();
        
        // 3. Notify background that selection phase is finished
        await this.notifyBackgroundDeactivation();

        // 4. Start the translation process
        await this.startTranslation(elementToTranslate, this.currentOptions);
      }
    } catch (error) {
      this.logger.warn('Error handling element click:', error);
    } finally {
      this.isProcessingClick = false;
    }
  }

  /**
   * Unlock page interaction immediately after selection
   * Restores cursor, pointer events, and stops the safety watchdog
   * @private
   */
  _unlockPageInteraction() {
    this.logger.debug('Restoring page interaction after selection');
    document.documentElement.removeAttribute('data-translate-it-select-mode');
    this._stopContextWatchdog();
    this.removeEventListeners();
  }

  async startTranslation(targetElement, options = {}) {
    try {
      if (!this.isActive) return;
      if (this.isTopFrame) this.updateNotificationForTranslation();

      const result = await this.domTranslatorAdapter.translateElement(targetElement, {
        ...this.currentOptions,
        ...options,
        onProgress: async () => {
          // Emit both for backward compatibility and Coordinator discovery
          pageEventBus.emit(WINDOWS_MANAGER_EVENTS.ELEMENT_TRANSLATIONS_AVAILABLE);
          pageEventBus.emit('ELEMENT_TRANSLATIONS_AVAILABLE');

          // CRITICAL: Notify top frame about iframe translations so Desktop FAB can show Revert button
          if (!this.isTopFrame) {
            try {
              window.top.postMessage({ 
                type: WINDOWS_MANAGER_EVENTS.ELEMENT_TRANSLATIONS_AVAILABLE,
                source: 'translate-it-iframe' 
              }, '*');
            } catch { /* ignore cross-origin errors */ }
          }
        }
      });

      if (result && result.success) {
        pageEventBus.emit('hide-translation', { element: targetElement });
        pageEventBus.emit('ELEMENT_TRANSLATIONS_AVAILABLE'); // Notify that revert is now possible
        this.performPostTranslationCleanup({ reason: 'success' });
      } else if (result && result.cancelled) {
        this.deactivate({ reason: 'cancel', silent: true });
      } else {
        this.performPostTranslationCleanup({ reason: 'success' }); // Fallback to success if result exists but structure is weird
      }
    } catch (error) {
      const isCancellation = isCancellationError(error);

      if (isCancellation) {
        this.logger.debug('Select Element translation cancelled:', error.message);
      } else {
        this.logger.warn('Select Element translation failed:', error);
      }
      
      if (ExtensionContextManager.isContextError(error)) {
        ExtensionContextManager.handleContextError(error, 'element-selection');
      }

      if (isFatalError(error) && !isCancellation) {
        this.deactivate({ preserveTranslations: true, reason: 'error' });
      } else {
        this.performPostTranslationCleanup({ reason: isCancellation ? 'cancel' : 'error' });
      }
    }
  }

  performPostTranslationCleanup(options = {}) {
    const reason = options.reason || 'success';
    // In Select Element mode, we want to preserve partial translations even on error
    const preserveTranslations = true;

    if (!this.isTopFrame) {
      try {
        // Notify top frame that this iframe has finished its selection/translation
        // This will trigger a global deactivation to clean up all other iframes
        window.top.postMessage({
          type: 'translate-it-deactivate-select-element',
          source: 'iframe-translation-complete',
          instanceId: this.instanceId
        }, '*');
      } catch { /* ignore */ }

      // Also locally deactivate to ensure clean state
      this.deactivate({ preserveTranslations, reason, fromBackground: true }).catch(() => {});
    } else if (this.isActive) {
      this.deactivate({ preserveTranslations, reason }).catch(() => {});
    } else {
      // Safety guard: ensure notification is dismissed in top frame even if already inactive
      this.dismissNotification();
    }
    this.isProcessingClick = false;
  }

  async revertTranslations() {
    window.isTranslationInProgress = false;
    const revertedCount = await this.domTranslatorAdapter.revertTranslation();
    pageEventBus.emit(WINDOWS_MANAGER_EVENTS.ELEMENT_TRANSLATIONS_CLEARED);
    return revertedCount;
  }

  showNotification() {
    pageEventBus.emit('show-select-element-notification', {
      managerId: this.instanceId,
      actions: {
        cancel: () => this.deactivate({ fromNotification: true, reason: 'cancel' }),
        revert: () => this.revertTranslations(),
      },
    });
  }

  updateNotificationForTranslation() {
    pageEventBus.emit('update-select-element-notification', { status: TRANSLATION_STATUS.TRANSLATING });
  }

  dismissNotification() {
    pageEventBus.emit('dismiss-select-element-notification', { managerId: this.instanceId, isCancelAction: true });
  }

  setupKeyboardListeners() {}

  setupCancelListener() {
    this.addEventListener(pageEventBus, 'cancel-select-element-mode', () => {
      if (this.isActive) this.deactivate({ fromCancel: true, silent: true, reason: 'cancel' });
    });
  }

  setupCrossFrameCommunication() {
    this.addEventListener(window, 'message', (event) => {
      // Respond to global deactivation signals
      if (event.data?.type === 'DEACTIVATE_ALL_SELECT_MANAGERS') {
        this.deactivate({ fromBackground: true, reason: 'manual' });
      }
    });
  }

  async notifyBackgroundActivation() {
    try {
      if (this._isNotifyingBackground) return;
      this._isNotifyingBackground = true;
      await sendMessage({ action: MessageActions.SET_SELECT_ELEMENT_STATE, data: { active: true } });
    } catch { /* ignore */ } finally { this._isNotifyingBackground = false; }
  }

  async notifyBackgroundDeactivation() {
    try { await sendMessage({ action: MessageActions.SET_SELECT_ELEMENT_STATE, data: { active: false } }); } catch { /* ignore */ }
  }

  /**
   * Emergency cleanup for critical situations (e.g. extension context invalid)
   * Restores page interaction immediately.
   */
  emergencyCleanup() {
    this._stopContextWatchdog();
    document.documentElement.removeAttribute('data-translate-it-select-mode');
    this.isActive = false;
    this.forceCleanup();
  }

  /**
   * Monitor extension context to prevent stuck UI on extension reload/update
   * Only runs while the mode is active.
   * @private
   */
  _startContextWatchdog() {
    this._stopContextWatchdog();
    this.contextWatchdogInterval = setInterval(() => {
      if (this.isActive && !ExtensionContextManager.isValidSync()) {
        this.logger.warn('Extension context invalidated while in select mode. Performing emergency cleanup...');
        this.emergencyCleanup();
      }
    }, 2000); // Check every 2 seconds - balanced for performance and safety
  }

  /**
   * Stop the context watchdog interval
   * @private
   */
  _stopContextWatchdog() {
    if (this.contextWatchdogInterval) {
      clearInterval(this.contextWatchdogInterval);
      this.contextWatchdogInterval = null;
    }
  }

  async _ensureServicesAvailable() {
    try {
      if (!this.domTranslatorAdapter) {
        this.domTranslatorAdapter = new DomTranslatorAdapter();
        await this.domTranslatorAdapter.initialize();
      }
      if (!this.elementSelector) {
        this.elementSelector = new ElementSelector();
        await this.elementSelector.initialize();
      }
      return true;
    } catch { return false; }
  }

  /**
   * Ensure necessary CSS styles are injected for element selection
   * Only runs in main frame and uses the content core singleton
   * @private
   */
  async _ensureStylesInjected() {
    if (!this.isTopFrame) return;

    const contentCore = window.translateItContentCore;
    if (contentCore && typeof contentCore.injectMainDOMStyles === 'function') {
      await contentCore.injectMainDOMStyles(selectionStyles, 'translate-it-select-mode-styles');
    }
  }

  isSelectElementActive() { return this.isActive; }
  getStatus() { return { serviceActive: this.isActive, isProcessingClick: this.isProcessingClick, isInitialized: this.isInitialized, instanceId: this.instanceId, isTopFrame: this.isTopFrame }; }
  forceCleanup() {
    try {
      this.removeEventListeners();
      this.elementSelector.deactivate();
      if (this.isTopFrame) this.dismissNotification();
    } catch { /* ignore */ }
  }

  async cleanup() {
    if (this.isActive) await this.deactivate({ reason: 'manual' });
    this.notificationManager = null;
    this.baseNotificationManager = null;
    super.cleanup();
  }
}

export { SelectElementManager };
