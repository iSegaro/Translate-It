/**
 * Shortcut Manager - Modular keyboard shortcut system for content scripts
 * Handles ESC, Ctrl+/, and other shortcuts in an organized manner
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { KeyboardStateManager } from '../KeyboardStateManager.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';

export class ShortcutManager extends ResourceTracker {
  constructor() {
    super('shortcut-manager')
    this.shortcuts = new Map();
    this.listeners = new Map();
    this.initialized = false;
    this.globalListener = null;
    this.keyboardStateManager = null;
    this.ctrlSlashShortcut = null;
    this.logger = getScopedLogger(LOG_COMPONENTS.SHORTCUTS, 'ShortcutManager');
  }

  /**
   * Initialize the shortcut manager
   * @param {Object} dependencies - Required dependencies for shortcuts
   */
  async initialize(dependencies = {}) {
    if (this.initialized) {
      this.logger.warn('Already initialized');
      return;
    }

    // Initialize KeyboardStateManager
    this.keyboardStateManager = new KeyboardStateManager();
    this.keyboardStateManager.initialize();

    // Track KeyboardStateManager for automatic cleanup
    this.trackResource('keyboardStateManager', () => {
      if (this.keyboardStateManager) {
        this.keyboardStateManager.cleanup();
        this.keyboardStateManager = null;
      }
    });

    // Setup global keyboard listener
    this.setupGlobalListener();

    // Register default shortcuts
    await this.registerDefaultShortcuts();

    // Initialize shortcuts with dependencies
    if (dependencies.featureManager) {
      await this.initializeShortcuts(dependencies);
    }

    this.initialized = true;
    this.logger.init('Shortcut manager initialized');
  }

  /**
   * Setup global keyboard event listener
   */
  setupGlobalListener() {
    this.globalListener = this.handleKeyboardEvent.bind(this);

    // Use ResourceTracker to track the event listener for automatic cleanup
    this.addEventListener(document, 'keydown', this.globalListener);

    this.logger.debug('Global keyboard listener setup');
  }

  /**
   * Register default shortcuts
   */
  async registerDefaultShortcuts() {
    // Import shortcut handlers
    const { RevertShortcut } = await import('./RevertShortcut.js');
    const { FieldShortcutManager } = await import('@/features/text-field-interaction/managers/FieldShortcutManager.js');
    
    // Register ESC shortcut for revert
    this.registerShortcut('Escape', new RevertShortcut());
    
    // Register Ctrl+/ shortcut for translation (will be updated dynamically)
    const ctrlSlashShortcut = new FieldShortcutManager();
    this.registerShortcut('Ctrl+/', ctrlSlashShortcut);

    // Store reference for initialization later
    this.ctrlSlashShortcut = ctrlSlashShortcut;

    // Setup dynamic shortcut updates
    this.setupDynamicShortcutUpdates(this.ctrlSlashShortcut);

    // Track ctrlSlashShortcut for automatic cleanup
    this.trackResource('ctrlSlashShortcut', () => {
      if (this.ctrlSlashShortcut) {
        this.ctrlSlashShortcut.cleanup();
        this.ctrlSlashShortcut = null;
      }
    });

    this.logger.debug('Default shortcuts registered');
  }

  /**
   * Initialize shortcuts with required dependencies
   * @param {Object} dependencies - Dependencies for shortcuts
   */
  async initializeShortcuts(dependencies) {
    // Initialize CtrlSlashShortcut with dependencies
    if (this.ctrlSlashShortcut) {
      this.ctrlSlashShortcut.initialize({
        featureManager: dependencies.featureManager
      });
      this.logger.debug('FieldShortcutManager initialized with dependencies');
    }

    // Setup dynamic shortcut updates
    this.setupDynamicShortcutUpdates(this.ctrlSlashShortcut);

    // Initialize settings listener for dynamic shortcuts
    await this.initializeDynamicShortcuts();

    this.logger.debug('All shortcuts initialized with dependencies');
  }

  /**
   * Initialize dynamic shortcuts from settings
   */
  async initializeDynamicShortcuts() {
    try {
      const { settingsManager } = await import('@/shared/managers/SettingsManager.js');

      // Subscribe to shortcut changes
      this._settingsUnsubscribe = settingsManager.onChange('TEXT_FIELD_SHORTCUT', async (newShortcut) => {
        try {
          if (this.ctrlSlashShortcut) {
            // Update the FieldShortcutManager's shortcut
            if (typeof this.ctrlSlashShortcut.updateShortcut === 'function') {
              this.ctrlSlashShortcut.updateShortcut();
            }

            this.logger.debug(`Text field shortcut updated to: ${newShortcut || 'Ctrl+/'}`);
          }
        } catch (error) {
          this.logger.error('Failed to update text field shortcut:', error);
        }
      });

      // Initial setup
      const currentShortcut = settingsManager.get('TEXT_FIELD_SHORTCUT', 'Ctrl+/');
      this.logger.debug(`Initial text field shortcut: ${currentShortcut}`);

    } catch (error) {
      this.logger.error('Failed to initialize dynamic shortcuts:', error);
    }
  }

  /**
   * Setup dynamic shortcut updates
   * @param {Object} fieldShortcutManager - FieldShortcutManager instance
   */
  setupDynamicShortcutUpdates(fieldShortcutManager) {
    // Store reference for future use
    this.fieldShortcutManager = fieldShortcutManager;
  }

  /**
   * Get current field shortcut from settings
   * @returns {string} Current shortcut
   */
  async getCurrentFieldShortcut() {
    try {
      const { settingsManager } = await import('@/shared/managers/SettingsManager.js');
      return settingsManager.get('TEXT_FIELD_SHORTCUT', 'Ctrl+/');
    } catch (error) {
      return 'Ctrl+/';
    }
  }

  /**
   * Register a shortcut handler
   * @param {string} key - Key combination (e.g., 'Escape', 'Ctrl+/', 'Alt+t')
   * @param {Object} handler - Shortcut handler instance
   */
  registerShortcut(key, handler) {
    if (this.shortcuts.has(key)) {
      this.logger.warn(`Overwriting shortcut for key: ${key}`);
    }

    this.shortcuts.set(key, handler);
    this.logger.debug(`Registered shortcut for: ${key}`);
  }

  /**
   * Unregister a shortcut
   * @param {string} key - Key combination
   */
  unregisterShortcut(key) {
    if (this.shortcuts.has(key)) {
      this.shortcuts.delete(key);
      this.logger.debug(`Unregistered shortcut for: ${key}`);
    }
  }

  /**
   * Handle keyboard events
   * @param {KeyboardEvent} event - Keyboard event
   */
  async handleKeyboardEvent(event) {
    if (!this.initialized) return;

    // Build key combination string
    const keyCombo = this.buildKeyCombo(event);

    // If empty key combo (modifier only), ignore
    if (!keyCombo) return;

    // Check if we have a handler for this key combination
    const handler = this.shortcuts.get(keyCombo);
    if (!handler) return;

    this.logger.debug(`Processing shortcut: ${keyCombo}`);

    try {
      // Check if shortcut should be executed (conditions)
      const shouldExecute = await handler.shouldExecute(event);
      if (!shouldExecute) {
        this.logger.debug(`Shortcut ${keyCombo} conditions not met`);
        return;
      }

      // Prevent default behavior
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      // Execute shortcut
      const result = await handler.execute(event);
      
      this.logger.debug(`Shortcut ${keyCombo} executed`, result);
      
    } catch (error) {
      this.logger.error(`Error executing shortcut ${keyCombo}`, error);
    }
  }

  /**
   * Build key combination string from event
   * @param {KeyboardEvent} event - Keyboard event
   * @returns {string} Key combination string
   */
  buildKeyCombo(event) {
    const parts = [];

    if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');

    // Add the main key (but ignore modifier keys by themselves)
    if (event.key && !['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
      parts.push(event.key);
    } else if (event.code && !['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(event.code)) {
      parts.push(event.code);
    }

    // If only modifier keys are present, return empty string (no match)
    if (parts.length === 1 && ['Ctrl', 'Alt', 'Shift'].includes(parts[0])) {
      return '';
    }

    return parts.join('+');
  }

  /**
   * Get registered shortcuts info
   * @returns {Object} Shortcuts info
   */
  getShortcutsInfo() {
    const shortcuts = {};
    
    for (const [key, handler] of this.shortcuts.entries()) {
      shortcuts[key] = {
        type: handler.constructor.name,
        description: handler.getDescription ? handler.getDescription() : 'No description'
      };
    }
    
    return {
      initialized: this.initialized,
      shortcutCount: this.shortcuts.size,
      shortcuts
    };
  }

  /**
   * Cleanup shortcut manager
   */
  cleanup() {
    // Clear shortcuts
    this.shortcuts.clear();
    this.listeners.clear();
    this.initialized = false;

    this.logger.operation('Cleaned up');

    // ResourceTracker will automatically cleanup tracked resources (event listeners, KeyboardStateManager, ctrlSlashShortcut)
    super.cleanup();
  }
}

// Export singleton instance
export const shortcutManager = new ShortcutManager();