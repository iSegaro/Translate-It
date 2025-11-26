/**
 * DebugModeBridge - Bridge between DEBUG_MODE setting and logging system
 *
 * This service connects the user's DEBUG_MODE preference to the logging system's
 * debugOverride flag and synchronizes changes across all extension contexts.
 *
 * Features:
 * - Reads DEBUG_MODE from storage and applies it to logging system
 * - Listens for storage changes and updates logging in real-time
 * - Cross-context synchronization using browser runtime messaging
 * - Context detection and appropriate initialization
 * - Graceful error handling and fallbacks
 */

import { safeConsole } from './SafeConsole.js';
import { getScopedLogger } from './logger.js';
import { LOG_COMPONENTS } from './logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'DebugModeBridge');

/**
 * DebugModeBridge class manages the connection between DEBUG_MODE setting
 * and the logging system across all extension contexts
 */
class DebugModeBridge {
  constructor() {
    this.isInitialized = false;
    this.currentDebugMode = false;
    this.context = this.detectContext();
    this.storageListener = null;
    this.messageListener = null;
  }

  /**
   * Detect the current context (background, content script, popup, options)
   * @returns {string} Context name
   */
  detectContext() {
    try {
      // Check if we're in background script
      if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest()) {
        if (typeof window !== 'undefined' && !window.location?.href) {
          return 'background';
        }
      }

      // Check if we're in content script
      if (typeof window !== 'undefined' && window.location?.href &&
          !window.location.href.startsWith('chrome-extension://') &&
          !window.location.href.startsWith('moz-extension://')) {
        return 'content';
      }

      // Check if we're in popup
      if (typeof window !== 'undefined' && window.location?.href) {
        const url = window.location.href;
        if (url.includes('/popup.html') || url.includes('popup/')) {
          return 'popup';
        }
        if (url.includes('/options.html') || url.includes('options/')) {
          return 'options';
        }
        if (url.includes('/sidepanel.html') || url.includes('sidepanel/')) {
          return 'sidepanel';
        }
      }

      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Initialize the DebugModeBridge
   * @returns {Promise<boolean>} Whether initialization was successful
   */
  async initialize() {
    if (this.isInitialized) {
      return true;
    }

    try {
      // Get current debug mode from storage
      const debugMode = await this.getDebugModeFromStorage();
      this.currentDebugMode = debugMode;

      // Apply to logging system
      await this.applyDebugMode(debugMode);

      // Set up listeners for real-time updates
      this.setupStorageListener();
      this.setupMessageListener();

      this.isInitialized = true;

      logger.info('Initialized successfully', {
        context: this.context,
        debugMode
      });

      return true;
    } catch (error) {
      logger.error('Initialization failed:', error);
      return false;
    }
  }

  /**
   * Get DEBUG_MODE from storage with fallback
   * @returns {Promise<boolean>}
   */
  async getDebugModeFromStorage() {
    try {
      // Try to get from storageManager first
      const { storageManager } = await import('@/shared/storage/core/StorageCore.js');

      if (storageManager && typeof storageManager.get === 'function') {
        const result = await storageManager.get({ DEBUG_MODE: false });
        return Boolean(result.DEBUG_MODE);
      }
    } catch {
      logger.warn('storageManager not available, trying fallback');
    }

    try {
      // Fallback to browser.storage
      if (typeof browser !== 'undefined' && browser.storage?.local) {
        const result = await browser.storage.local.get({ DEBUG_MODE: false });
        return Boolean(result.DEBUG_MODE);
      }
    } catch {
      logger.warn('browser.storage not available');
    }

    // Fallback to default value
    return false;
  }

  /**
   * Apply debug mode to logging system
   * @param {boolean} debugMode - Whether to enable debug mode
   */
  async applyDebugMode(debugMode) {
    try {
      // Update SafeConsole
      safeConsole.setEnabled(debugMode);

      // Update logging system's debug override
      try {
        const { setGlobalDebugOverride } = await import('./GlobalDebugState.js');
        setGlobalDebugOverride(debugMode);
        logger.debug('Updated GlobalDebugState:', debugMode);
      } catch (error) {
        logger.warn('Could not update GlobalDebugState:', error);
      }

      // Update ErrorHandler debug mode
      try {
        const { ErrorHandler } = await import('@/shared/error-management/ErrorHandler.js');
        const errorHandler = ErrorHandler.getInstance();
        if (errorHandler && typeof errorHandler.setDebugMode === 'function') {
          errorHandler.setDebugMode(debugMode);
          logger.debug('Updated ErrorHandler:', debugMode);
        }
      } catch (error) {
        logger.warn('Could not update ErrorHandler:', error);
      }

      this.currentDebugMode = debugMode;
    } catch (error) {
      logger.error('Failed to apply debug mode:', error);
    }
  }

  /**
   * Set up storage change listener
   */
  setupStorageListener() {
    try {
      // Try storageManager events first
      import('@/shared/storage/core/StorageCore.js').then(({ storageManager }) => {
        if (storageManager && typeof storageManager.on === 'function') {
          storageManager.on('change', (changes) => {
            if (changes.DEBUG_MODE !== undefined) {
              this.handleStorageChange({ DEBUG_MODE: { newValue: changes.DEBUG_MODE } });
            }
          });
        }
      }).catch(() => {
        // Silently fall back to browser.storage
      });

      // Also set up browser.storage listener as backup
      if (typeof browser !== 'undefined' && browser.storage?.onChanged) {
        this.storageListener = (changes, areaName) => {
          if (areaName === 'local' && changes.DEBUG_MODE !== undefined) {
            this.handleStorageChange(changes);
          }
        };
        browser.storage.onChanged.addListener(this.storageListener);
      }
    } catch (error) {
      logger.warn('Could not setup storage listener:', error);
    }
  }

  /**
   * Set up message listener for cross-context sync
   */
  setupMessageListener() {
    try {
      if (typeof browser !== 'undefined' && browser.runtime?.onMessage) {
        this.messageListener = (message, sender, sendResponse) => {
          if (message.action === 'DEBUG_MODE_CHANGED') {
            this.handleDebugModeChange(message.data.debugMode);
            sendResponse({ success: true });
          }
        };
        browser.runtime.onMessage.addListener(this.messageListener);
      }
    } catch (error) {
      logger.warn('Could not setup message listener:', error);
    }
  }

  /**
   * Handle storage changes
   * @param {Object} changes - Storage changes object
   */
  handleStorageChange(changes) {
    if (changes.DEBUG_MODE && changes.DEBUG_MODE.newValue !== this.currentDebugMode) {
      const newDebugMode = Boolean(changes.DEBUG_MODE.newValue);
      this.handleDebugModeChange(newDebugMode);
    }
  }

  /**
   * Handle debug mode change
   * @param {boolean} newDebugMode - New debug mode value
   */
  handleDebugModeChange(newDebugMode) {
    if (newDebugMode !== this.currentDebugMode) {
      logger.info('Debug mode changed', {
        from: this.currentDebugMode,
        to: newDebugMode,
        context: this.context
      });

      this.currentDebugMode = newDebugMode;
      this.applyDebugMode(newDebugMode);

      // Broadcast to other contexts (except background script to avoid loops)
      if (this.context !== 'background') {
        this.broadcastDebugModeChange(newDebugMode);
      }
    }
  }

  /**
   * Broadcast debug mode change to other contexts
   * @param {boolean} debugMode - Debug mode value to broadcast
   */
  broadcastDebugModeChange(debugMode) {
    try {
      if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) {
        browser.runtime.sendMessage({
          action: 'DEBUG_MODE_CHANGED',
          data: { debugMode }
        }).catch(() => {
          // Silently ignore errors - some contexts might not be available
        });
      }
    } catch {
      // Silently ignore broadcast errors
    }
  }

  /**
   * Get current debug mode
   * @returns {boolean} Current debug mode state
   */
  getCurrentDebugMode() {
    return this.currentDebugMode;
  }

  /**
   * Force refresh debug mode from storage
   * @returns {Promise<boolean>} Current debug mode after refresh
   */
  async refresh() {
    try {
      const debugMode = await this.getDebugModeFromStorage();
      if (debugMode !== this.currentDebugMode) {
        await this.applyDebugMode(debugMode);
      }
      return debugMode;
    } catch (error) {
      logger.error('Failed to refresh debug mode:', error);
      return this.currentDebugMode;
    }
  }

  /**
   * Cleanup listeners and resources
   */
  cleanup() {
    try {
      // Remove storage listener
      if (this.storageListener && typeof browser !== 'undefined' && browser.storage?.onChanged) {
        browser.storage.onChanged.removeListener(this.storageListener);
        this.storageListener = null;
      }

      // Remove message listener
      if (this.messageListener && typeof browser !== 'undefined' && browser.runtime?.onMessage) {
        browser.runtime.onMessage.removeListener(this.messageListener);
        this.messageListener = null;
      }

      this.isInitialized = false;
      logger.debug('Cleanup completed');
    } catch (error) {
      logger.warn('Error during cleanup:', error);
    }
  }
}

// Create singleton instance
const debugModeBridge = new DebugModeBridge();

// Auto-initialize when module is imported
debugModeBridge.initialize().catch((error) => {
  logger.error('Auto-initialization failed:', error);
});

export { DebugModeBridge };
export { debugModeBridge };
export default debugModeBridge;