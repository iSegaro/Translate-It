// src/core/content-scripts/InteractionCoordinator.js
/**
 * InteractionCoordinator - Manages the lifecycle of global event listeners
 * based on user settings and page exclusion rules.
 * 
 * Optimized Version:
 * - Listens for Keyboard (Shortcut/ESC) if enabled in settings OR if a feature needs ESC (Select Element/Revert).
 * - Handles contextmenu for smart pre-loading of Select Element feature.
 * - Ensures immediate execution of actions upon first trigger.
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { settingsManager } from '@/shared/managers/SettingsManager.js';
import { ExclusionChecker } from '@/features/exclusion/core/ExclusionChecker.js';
import { checkUrlExclusionAsync } from '@/features/exclusion/utils/exclusion-utils.js';
import { pageEventBus } from '@/core/PageEventBus.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'InteractionCoordinator');

class InteractionCoordinator {
  constructor() {
    this.activeListeners = new Map();
    this.isInitialized = false;
    this.isPageExcluded = false;
    this.exclusionChecker = ExclusionChecker.getInstance();
    
    // Cache frame detection for better performance and clean code
    this.isTopFrame = window === window.top;
    
    // Optimization flag: Only care about ESC if there's potentially something to revert/cancel
    this.revertMightBeNeeded = false;
    
    // Bind handlers to maintain context
    this.handlers = {
      textSelection: this._handleTextSelection.bind(this),
      shortcut: this._handleKeyboardInteraction.bind(this),
      textFieldIcon: this._handleTextFieldFocus.bind(this),
      selectElement: this._handleContextMenu.bind(this),
      scroll: this._handleScroll.bind(this)
    };
  }

  /**
   * Initialize the coordinator and setup initial listeners
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      this.isPageExcluded = await checkUrlExclusionAsync();
      
      // Setup settings change listeners
      const sync = () => this.sync();
      settingsManager.onChange('EXTENSION_ENABLED', sync);
      settingsManager.onChange('TRANSLATE_ON_TEXT_SELECTION', sync);
      settingsManager.onChange('SHOW_DESKTOP_FAB', sync);
      settingsManager.onChange('TRANSLATE_WITH_SELECT_ELEMENT', sync);
      settingsManager.onChange('ENABLE_SHORTCUT_FOR_TEXT_FIELDS', sync);
      settingsManager.onChange('EXCLUDED_SITES', () => this.refreshExclusionAndSync());

      // Setup internal event listeners
      this._setupInternalTriggers();

      await this.sync();
      this.isInitialized = true;
      logger.debug('InteractionCoordinator initialized');
    } catch (error) {
      logger.error('Failed to initialize InteractionCoordinator:', error);
    }
  }

  /**
   * Setup internal triggers to enable Keyboard listener on-demand
   * @private
   */
  _setupInternalTriggers() {
    const enableAndSync = (reason) => {
      if (!this.revertMightBeNeeded) {
        this.revertMightBeNeeded = true;
        logger.debug(`${reason} detected, syncing listeners to enable ESC`);
        this.sync();
      }
    };

    pageEventBus.on('select-mode-activated', () => enableAndSync('Select mode'));
    pageEventBus.on('ELEMENT_TRANSLATIONS_AVAILABLE', () => enableAndSync('Translations'));
    pageEventBus.on('element-translations-available', () => enableAndSync('Translations'));
  }

  async refreshExclusionAndSync() {
    this.isPageExcluded = await checkUrlExclusionAsync();
    await this.sync();
  }

  /**
   * Synchronize all listeners with current settings and internal state
   */
  async sync() {
    const isEnabled = settingsManager.isExtensionEnabled() && !this.isPageExcluded;

    // 1. Text Selection Listener
    const canSelect = isEnabled && this.exclusionChecker.isFeatureEnabled('textSelection');
    this._manageListener('textSelection', 'mouseup', this.handlers.textSelection, canSelect);

    // 2. Keyboard Shortcut Listener (Shortcut enabled OR Revert/ESC needed)
    const canShortcut = isEnabled && (this.exclusionChecker.isFeatureEnabled('shortcut') || this.revertMightBeNeeded);
    this._manageListener('shortcut', 'keydown', this.handlers.shortcut, canShortcut, window);

    // 3. Text Field Focus Listener
    const canTextFields = isEnabled && this.exclusionChecker.isFeatureEnabled('textFieldIcon');
    this._manageListener('textFieldIcon', 'focusin', this.handlers.textFieldIcon, canTextFields);

    // 4. Select Element Pre-load (Context Menu)
    const canSelectElement = isEnabled && this.exclusionChecker.isFeatureEnabled('selectElement');
    this._manageListener('selectElement', 'contextmenu', this.handlers.selectElement, canSelectElement);

    // 5. Scroll Listener
    this._manageListener('scroll', 'scroll', this.handlers.scroll, isEnabled);

    // Notify other components that listeners have been synchronized
    pageEventBus.emit('sync-interaction-listeners');
  }

  /**
   * Internal helper to attach/detach listeners
   * @private
   */
  _manageListener(key, eventType, handler, shouldBeActive, target = document) {
    const isActive = this.activeListeners.has(key);

    if (shouldBeActive && !isActive) {
      target.addEventListener(eventType, handler, { passive: eventType !== 'keydown' });
      this.activeListeners.set(key, { eventType, handler, target });
      logger.info(`Attached ${eventType} listener for ${key}`);
    } else if (!shouldBeActive && isActive) {
      const { eventType: oldType, handler: oldHandler, target: oldTarget } = this.activeListeners.get(key);
      oldTarget.removeEventListener(oldType, oldHandler);
      this.activeListeners.delete(key);
      logger.info(`Detached ${eventType} listener for ${key}`);
    }
  }

  async _deactivateFeature(featureName) {
    try {
      const { getFeatureManager } = await import('./chunks/lazy-features.js');
      const fm = getFeatureManager();
      if (fm && fm.isFeatureActive(featureName)) await fm.deactivateFeature(featureName);
    } catch { /* ignore */ }
  }

  // --- Event Handlers ---

  async _handleTextSelection() {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();
    
    if (selectedText) {
      // Ensure UI is ready immediately on selection
      if (this.isTopFrame && window.translateItContentCore?.loadFeatureFromMain) {
        window.translateItContentCore.loadFeatureFromMain('vue', 'INTERACTIVE');
      }

      const { activateFeature } = await import('./chunks/lazy-features.js');
      await activateFeature('textSelection');

      if (this.isTopFrame) {
        // In top frame, we can activate windowsManager directly
        await activateFeature('windowsManager');
      } else {
        // In iframe, we notify top frame about the selection so it can show the UI
        try {
          window.top.postMessage({
            type: 'TRANSLATE_IT_TEXT_SELECTION_DETECTED',
            source: 'translate-it-iframe',
            data: {
              text: selectedText,
              // We'll let windowsManager in main frame handle the positioning
              // but we can pass hint that it's from iframe
              fromIframe: true
            }
          }, '*');
        } catch { /* ignore cross-origin */ }
      }
    }
  }

  async _handleKeyboardInteraction(event) {
    const isMainShortcut = event.ctrlKey && event.key === '/';
    const isEscape = event.key === 'Escape' || event.code === 'Escape';
    
    // Check if we should handle this event
    const shouldHandle = isMainShortcut || (isEscape && (this.revertMightBeNeeded || window.isTranslationInProgress));
    if (!shouldHandle) return;

    // Ensure UI is ready immediately on shortcut
    if (this.isTopFrame && window.translateItContentCore?.loadFeatureFromMain) {
      window.translateItContentCore.loadFeatureFromMain('vue', 'INTERACTIVE');
    }

    const { loadFeature } = await import('./chunks/lazy-features.js');
    if (isMainShortcut) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
    // Load required features
    const handlerInstance = await loadFeature('shortcut', isEscape);

    // Only load windowsManager if it's the main shortcut (for showing UI)
    if (isMainShortcut) {
      await loadFeature('windowsManager');
    }

    if (handlerInstance) {
      if (isEscape) {
        const { shortcutManager } = await import('@/core/managers/content/shortcuts/ShortcutManager.js');
        if (shortcutManager.initialized) shortcutManager.handleKeyboardEvent(event);
      } else if (isMainShortcut && typeof handlerInstance.handleTranslationShortcut === 'function') {
        handlerInstance.handleTranslationShortcut();
      }
    }
  }

  async _handleTextFieldFocus(event) {
    if (this._isEditableElement(event.target)) {
      const { loadFeature } = await import('./chunks/lazy-features.js');
      await loadFeature('textFieldIcon');
    }
  }

  async _handleContextMenu() {
    // Double-check if allowed before loading
    if (this.exclusionChecker.isFeatureEnabled('selectElement')) {
      // Ensure UI is ready immediately
      if (this.isTopFrame && window.translateItContentCore?.loadFeatureFromMain) {
        window.translateItContentCore.loadFeatureFromMain('vue', 'INTERACTIVE');
      }

      const { loadFeature } = await import('./chunks/lazy-features.js');
      await loadFeature('selectElement');
    }
  }

  _handleScroll() {}

  _isEditableElement(element) {
    return element && (element.isContentEditable || element.tagName === 'TEXTAREA' || 
           (element.tagName === 'INPUT' && ['text', 'search', 'email', 'url', 'tel'].includes(element.type)));
  }

  cleanup() {
    for (const { eventType, handler, target } of this.activeListeners.values()) {
      target.removeEventListener(eventType, handler);
    }
    this.activeListeners.clear();
    this.isInitialized = false;
  }
}

export const interactionCoordinator = new InteractionCoordinator();
export default interactionCoordinator;