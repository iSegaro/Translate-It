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
import { MessageActions } from '../messaging/core/MessageActions.js';

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

      // Get current component log levels from storage
      const componentLogLevels = await this.getComponentLogLevelsFromStorage();

      // Apply to logging system
      await this.applyDebugMode(debugMode);
      await this.applyComponentLogLevels(componentLogLevels);

      // Set up listeners for real-time updates
      this.setupStorageListener();

      this.isInitialized = true;

      logger.info('Initialized successfully', {
        context: this.context,
        debugMode,
        componentLogLevelsCount: Object.keys(componentLogLevels).length
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
      logger.warn('storageManager not available, trying fallback for DEBUG_MODE');
    }

    try {
      // Fallback to browser.storage
      if (typeof browser !== 'undefined' && browser.storage?.local) {
        const result = await browser.storage.local.get({ DEBUG_MODE: false });
        return Boolean(result.DEBUG_MODE);
      }
    } catch {
      logger.warn('browser.storage not available for DEBUG_MODE');
    }

    // Fallback to default value
    return false;
  }

  /**
   * Get COMPONENT_LOG_LEVELS from storage with fallback
   * @returns {Promise<Object>}
   */
  async getComponentLogLevelsFromStorage() {
    try {
      const { storageManager } = await import('@/shared/storage/core/StorageCore.js');

      if (storageManager && typeof storageManager.get === 'function') {
        const result = await storageManager.get({ COMPONENT_LOG_LEVELS: {} });
        return result.COMPONENT_LOG_LEVELS || {};
      }
    } catch {
      logger.warn('storageManager not available, trying fallback for COMPONENT_LOG_LEVELS');
    }

    try {
      if (typeof browser !== 'undefined' && browser.storage?.local) {
        const result = await browser.storage.local.get({ COMPONENT_LOG_LEVELS: {} });
        return result.COMPONENT_LOG_LEVELS || {};
      }
    } catch {
      logger.warn('browser.storage not available for COMPONENT_LOG_LEVELS');
    }

    return {};
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
        logger.debug('Updated GlobalDebugState (debugOverride):', debugMode);
      } catch (error) {
        logger.warn('Could not update GlobalDebugState (debugOverride):', error);
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
   * Apply component log levels to logging system
   * @param {Object} levels - Component log levels object
   */
  async applyComponentLogLevels(levels) {
    if (!levels || typeof levels !== 'object') return;

    try {
      const { setComponentLogLevel } = await import('./GlobalDebugState.js');
      
      Object.entries(levels).forEach(([component, level]) => {
        setComponentLogLevel(component, level);
      });
      
      logger.debug('Updated GlobalDebugState (componentLogLevels):', Object.keys(levels).length);
    } catch (error) {
      logger.warn('Could not update GlobalDebugState (componentLogLevels):', error);
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
            if (changes.COMPONENT_LOG_LEVELS !== undefined) {
              this.handleStorageChange({ COMPONENT_LOG_LEVELS: { newValue: changes.COMPONENT_LOG_LEVELS } });
            }
          });
        }
      }).catch(() => {
        // Silently fall back to browser.storage
      });

      // Also set up browser.storage listener as backup
      if (typeof browser !== 'undefined' && browser.storage?.onChanged) {
        this.storageListener = (changes, areaName) => {
          if (areaName === 'local') {
            if (changes.DEBUG_MODE !== undefined || changes.COMPONENT_LOG_LEVELS !== undefined) {
              this.handleStorageChange(changes);
            }
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
   * @deprecated Use getHandlerMappings() with centralized MessageHandler instead
   */
  setupMessageListener() {
    // Logic moved to getHandlerMappings for centralized MessageHandler
  }

  /**
   * Get handler mappings for centralized MessageHandler
   * @returns {Object} Handler mappings for debug/logging actions
   */
  getHandlerMappings() {
    return {
      [MessageActions.DEBUG_MODE_CHANGED]: (message) => {
        this.handleDebugModeChange(message.data.debugMode);
        return { success: true };
      },
      [MessageActions.COMPONENT_LOG_LEVELS_CHANGED]: (message) => {
        this.handleComponentLogLevelsChange(message.data.levels);
        return { success: true };
      }
    };
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

    if (changes.COMPONENT_LOG_LEVELS) {
      this.handleComponentLogLevelsChange(changes.COMPONENT_LOG_LEVELS.newValue);
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
        this.broadcastChange(MessageActions.DEBUG_MODE_CHANGED, { debugMode: newDebugMode });
      }
    }
  }

  /**
   * Handle component log levels change
   * @param {Object} levels - New component log levels object
   */
  handleComponentLogLevelsChange(levels) {
    logger.info('Component log levels changed', {
      count: levels ? Object.keys(levels).length : 0,
      context: this.context
    });

    this.applyComponentLogLevels(levels);

    if (this.context !== 'background') {
      this.broadcastChange(MessageActions.COMPONENT_LOG_LEVELS_CHANGED, { levels });
    }
  }

  /**
   * Broadcast change to other contexts
   * @param {string} action - Action name
   * @param {Object} data - Message data
   */
  broadcastChange(action, data) {
    try {
      if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) {
        browser.runtime.sendMessage({
          action,
          data
        }).catch(() => {
          // Silently ignore errors - some contexts might not be available
        });
      }
    } catch {
      // Silently ignore broadcast errors
    }
  }

  /**
   * Broadcast debug mode change to other contexts
   * @deprecated Use broadcastChange instead
   * @param {boolean} debugMode - Debug mode value to broadcast
   */
  broadcastDebugModeChange(debugMode) {
    this.broadcastChange(MessageActions.DEBUG_MODE_CHANGED, { debugMode });
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

export { DebugModeBridge };
export { debugModeBridge };
export default debugModeBridge;