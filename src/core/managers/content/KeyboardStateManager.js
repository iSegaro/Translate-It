/**
 iimport { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';port { getScopedLogger } from '@/shared/logging/logger.js'; KeyboardStateManager - Centralized keyboard state tracking
 * Manages key press states for better keyboard shortcut handling
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

export class KeyboardStateManager {
  constructor() {
    this.keyStates = new Map();
    this.listeners = new Map();
    this.initialized = false;
    
    // Initialize logger
  this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'KeyboardStateManager');
    
    // Commonly tracked keys
    this.TRACKED_KEYS = {
      CTRL: ['Control', 'Meta'],
      ALT: ['Alt'],
      SHIFT: ['Shift'],
      ESCAPE: ['Escape']
    };
    
    // Bind methods for event listeners
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    
    this.logger.init('KeyboardStateManager initialized');
  }

  /**
   * Initialize keyboard state tracking
   */
  initialize() {
    if (this.initialized) {
      this.logger.debug('Already initialized, skipping');
      return;
    }

    // Setup global keyboard listeners
    document.addEventListener('keydown', this.handleKeyDown, { capture: true });
    document.addEventListener('keyup', this.handleKeyUp, { capture: true });
    
    // Initialize key states
    this.resetAllStates();
    
    this.initialized = true;
    this.logger.debug('Initialized successfully');
  }

  /**
   * Handle keydown events
   * @param {KeyboardEvent} event - Keyboard event
   */
  handleKeyDown(event) {
    if (!this.initialized) return;

    // Update general key states
    this.keyStates.set(event.key, true);
    this.keyStates.set(event.code, true);

    // Update modifier key states
    if (this.isCtrlKey(event.key)) {
      this.keyStates.set('ctrl', true);
      this.keyStates.set('ctrlPressed', true);
    }
    
    if (event.altKey) {
      this.keyStates.set('alt', true);
      this.keyStates.set('altPressed', true);
    }
    
    if (event.shiftKey) {
      this.keyStates.set('shift', true);
      this.keyStates.set('shiftPressed', true);
    }

    // Track specific key combinations
    if (event.ctrlKey || event.metaKey) {
      this.keyStates.set('ctrlKeyPressed', true);
    }

    // Notify listeners
    this.notifyListeners('keydown', {
      key: event.key,
      code: event.code,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      event: event
    });
  }

  /**
   * Handle keyup events
   * @param {KeyboardEvent} event - Keyboard event
   */
  handleKeyUp(event) {
    if (!this.initialized) return;

    // Update general key states
    this.keyStates.set(event.key, false);
    this.keyStates.set(event.code, false);

    // Handle Ctrl/Meta key release with delay for better mouseup integration
    if (this.isCtrlKey(event.key)) {
      // Small delay to ensure mouseup events are processed first
      setTimeout(() => {
        this.keyStates.set('ctrl', false);
        this.keyStates.set('ctrlPressed', false);
        this.keyStates.set('ctrlKeyPressed', false);
      }, 50);
    }
    
    if (event.key === 'Alt') {
      this.keyStates.set('alt', false);
      this.keyStates.set('altPressed', false);
    }
    
    if (event.key === 'Shift') {
      this.keyStates.set('shift', false);
      this.keyStates.set('shiftPressed', false);
    }

    // Notify listeners
    this.notifyListeners('keyup', {
      key: event.key,
      code: event.code,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      event: event
    });
  }

  /**
   * Check if key is Ctrl or Meta key
   * @param {string} key - Key name
   * @returns {boolean} Whether key is Ctrl/Meta
   */
  isCtrlKey(key) {
    return key === 'Control' || key === 'Meta';
  }

  /**
   * Check if Ctrl/Meta key is currently pressed
   * @returns {boolean} Ctrl key state
   */
  isCtrlPressed() {
    return this.keyStates.get('ctrlPressed') || 
           this.keyStates.get('ctrlKeyPressed') || 
           false;
  }

  /**
   * Check if Alt key is currently pressed
   * @returns {boolean} Alt key state
   */
  isAltPressed() {
    return this.keyStates.get('altPressed') || false;
  }

  /**
   * Check if Shift key is currently pressed
   * @returns {boolean} Shift key state
   */
  isShiftPressed() {
    return this.keyStates.get('shiftPressed') || false;
  }

  /**
   * Check if specific key is currently pressed
   * @param {string} key - Key to check
   * @returns {boolean} Key state
   */
  isKeyPressed(key) {
    return this.keyStates.get(key) || false;
  }

  /**
   * Get current key state
   * @param {string} key - Key to get state for
   * @returns {boolean|undefined} Key state
   */
  getKeyState(key) {
    return this.keyStates.get(key);
  }

  /**
   * Set key state manually (useful for testing or special cases)
   * @param {string} key - Key name
   * @param {boolean} state - Key state
   */
  setKeyState(key, state) {
    this.keyStates.set(key, state);
    this.logger.debug(`Manual key state update: ${key} = ${state}`);
  }

  /**
   * Reset all key states
   */
  resetAllStates() {
    this.keyStates.clear();
    
    // Initialize common states
    this.keyStates.set('ctrl', false);
    this.keyStates.set('alt', false);
    this.keyStates.set('shift', false);
    this.keyStates.set('ctrlPressed', false);
    this.keyStates.set('altPressed', false);
    this.keyStates.set('shiftPressed', false);
    this.keyStates.set('ctrlKeyPressed', false);
    
    // Remove verbose log - this is called frequently
    this.logger.debug('All key states reset');
  }

  /**
   * Add listener for keyboard state changes
   * @param {string} eventType - Event type (keydown, keyup)
   * @param {Function} callback - Callback function
   * @returns {Function} Removal function
   */
  addListener(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    
    this.listeners.get(eventType).add(callback);
    
    // Return removal function
    return () => {
      this.removeListener(eventType, callback);
    };
  }

  /**
   * Remove listener
   * @param {string} eventType - Event type
   * @param {Function} callback - Callback to remove
   */
  removeListener(eventType, callback) {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Notify all listeners of keyboard state changes
   * @param {string} eventType - Event type
   * @param {Object} data - Event data
   */
  notifyListeners(eventType, data) {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          this.logger.error('Error in listener callback:', error);
        }
      });
    }
  }

  /**
   * Get all current key states (for debugging)
   * @returns {Object} All key states
   */
  getAllStates() {
    const states = {};
    for (const [key, value] of this.keyStates.entries()) {
      states[key] = value;
    }
    return states;
  }

  /**
   * Get keyboard state manager info
   * @returns {Object} Manager information
   */
  getInfo() {
    return {
      initialized: this.initialized,
      trackedKeysCount: this.keyStates.size,
      listenersCount: Array.from(this.listeners.values()).reduce((sum, set) => sum + set.size, 0),
      currentStates: this.getAllStates(),
      ctrlPressed: this.isCtrlPressed(),
      altPressed: this.isAltPressed(),
      shiftPressed: this.isShiftPressed()
    };
  }

  /**
   * Cleanup resources and event listeners
   */
  cleanup() {
    // Remove event listeners
    if (this.initialized) {
      document.removeEventListener('keydown', this.handleKeyDown, { capture: true });
      document.removeEventListener('keyup', this.handleKeyUp, { capture: true });
    }
    
    // Clear states and listeners
    this.keyStates.clear();
    this.listeners.clear();
    this.initialized = false;
    
    this.logger.debug('Cleaned up');
  }
}