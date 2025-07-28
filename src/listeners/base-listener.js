// src/listeners/base-listener.js
// Base class for cross-browser event listeners

import browser from 'webextension-polyfill';

/**
 * Base Event Listener class
 * Provides common functionality for all extension event listeners
 */
export class BaseListener {
  constructor(eventType, eventName, listenerName) {
    this.eventType = eventType; // 'runtime', 'tabs', 'contextMenus', etc.
    this.eventName = eventName; // 'onMessage', 'onInstalled', etc.
    this.listenerName = listenerName; // Human-readable name for debugging
    this.browser = null;
    this.handlers = [];
    this.isRegistered = false;
    this.initialized = false;
  }

  /**
   * Initialize the listener
   */
  async initialize() {
    if (this.initialized) return;

    try {
      this.browser = browser;

      this.initialized = true;
      console.log(`🎧 Initialized ${this.listenerName} listener`);

    } catch (error) {
      console.error(`❌ Failed to initialize ${this.listenerName} listener:`, error);
      throw error;
    }
  }

  /**
   * Add a handler function
   * @param {Function} handler - Handler function
   * @param {string} name - Handler name for debugging
   */
  addHandler(handler, name = 'unnamed') {
    if (typeof handler !== 'function') {
      throw new Error('Handler must be a function');
    }

    this.handlers.push({
      fn: handler,
      name: name,
      addedAt: Date.now()
    });

    console.log(`➕ Added handler "${name}" to ${this.listenerName}`);
  }

  /**
   * Remove a handler by name
   * @param {string} name - Handler name to remove
   */
  removeHandler(name) {
    const index = this.handlers.findIndex(h => h.name === name);
    if (index !== -1) {
      this.handlers.splice(index, 1);
      console.log(`➖ Removed handler "${name}" from ${this.listenerName}`);
      return true;
    }
    return false;
  }

  /**
   * Register the listener with the browser API
   */
  async register() {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.isRegistered) {
      console.log(`🔄 ${this.listenerName} listener already registered`);
      return;
    }

    try {
      const eventTarget = this.browser[this.eventType];
      if (!eventTarget) {
        throw new Error(`browser API ${this.eventType} not available`);
      }

      const eventObject = eventTarget[this.eventName];
      if (!eventObject) {
        throw new Error(`Event ${this.eventName} not available on ${this.eventType}`);
      }

      // Add the main event listener
      eventObject.addListener(this.handleEvent.bind(this));
      this.isRegistered = true;

      console.log(`✅ Registered ${this.listenerName} listener`);

    } catch (error) {
      console.error(`❌ Failed to register ${this.listenerName} listener:`, error);
      throw error;
    }
  }

  /**
   * Main event handler that calls all registered handlers
   * @param {...any} args - Event arguments
   */
  async handleEvent(...args) {
    if (this.handlers.length === 0) {
      console.debug(`📭 No handlers registered for ${this.listenerName}`);
      return;
    }

    console.debug(`📨 ${this.listenerName} event received, calling ${this.handlers.length} handlers`);

    const results = [];
    const errors = [];

    for (const handler of this.handlers) {
      try {
        const startTime = performance.now();
        
        // Call handler with proper error isolation
        const result = await this.callHandlerSafely(handler, args);
        
        const duration = performance.now() - startTime;
        
        results.push({
          handler: handler.name,
          result: result,
          duration: duration,
          success: true
        });

        console.debug(`✅ Handler "${handler.name}" completed in ${duration.toFixed(2)}ms`);

      } catch (error) {
        const errorInfo = {
          handler: handler.name,
          error: error.message,
          stack: error.stack,
          success: false
        };

        errors.push(errorInfo);
        console.error(`❌ Handler "${handler.name}" failed:`, error);

        // Continue with other handlers despite this failure
      }
    }

    // Log summary
    if (errors.length > 0) {
      console.warn(`⚠️ ${this.listenerName} completed with ${errors.length}/${this.handlers.length} errors`);
    } else {
      console.debug(`✅ ${this.listenerName} completed successfully`);
    }

    // For runtime.onMessage, return the actual result from the first successful handler
    // instead of metadata, as browser expects the actual response value
    if (this.eventName === 'onMessage' && results.length > 0 && results[0].result !== undefined) {
      return results[0].result;
    }

    // For other events, return metadata as usual
    return {
      results,
      errors,
      totalHandlers: this.handlers.length,
      successCount: results.length,
      errorCount: errors.length
    };
  }

  /**
   * Call a handler with proper error isolation
   * @private
   */
  async callHandlerSafely(handler, args) {
    try {
      // Detect if handler returns a promise
      const result = handler.fn(...args);
      
      if (result && typeof result.then === 'function') {
        // Handler is async or returns a promise
        return await Promise.race([
          result,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Handler timeout')), 10000)
          )
        ]);
      } else {
        // Handler is synchronous
        return result;
      }

    } catch (error) {
      // Wrap and re-throw with additional context
      const wrappedError = new Error(`Handler "${handler.name}" failed: ${error.message}`);
      wrappedError.originalError = error;
      wrappedError.handlerName = handler.name;
      throw wrappedError;
    }
  }

  /**
   * Unregister the listener
   */
  async unregister() {
    if (!this.isRegistered) {
      return;
    }

    try {
      const eventTarget = this.browser[this.eventType];
      const eventObject = eventTarget?.[this.eventName];
      
      if (eventObject && eventObject.removeListener) {
        eventObject.removeListener(this.handleEvent.bind(this));
      }

      this.isRegistered = false;
      console.log(`🚫 Unregistered ${this.listenerName} listener`);

    } catch (error) {
      console.error(`❌ Failed to unregister ${this.listenerName} listener:`, error);
    }
  }

  /**
   * Check if listener is available in current browser
   * @returns {boolean}
   */
  isAvailable() {
    try {
      return this.initialized && 
             this.browser && 
             this.browser[this.eventType] && 
             this.browser[this.eventType][this.eventName];
    } catch {
      return false;
    }
  }

  /**
   * Get listener statistics
   * @returns {Object}
   */
  getStats() {
    return {
      listenerName: this.listenerName,
      eventType: this.eventType,
      eventName: this.eventName,
      initialized: this.initialized,
      isRegistered: this.isRegistered,
      handlerCount: this.handlers.length,
      handlers: this.handlers.map(h => ({
        name: h.name,
        addedAt: h.addedAt
      })),
      isAvailable: this.isAvailable()
    };
  }

  /**
   * Get debug information
   * @returns {Object}
   */
  getDebugInfo() {
    return {
      ...this.getStats(),
      browser: this.browser,
      browserAPI: !!this.browser,
      eventAvailable: this.isAvailable()
    };
  }

  /**
   * Clear all handlers
   */
  clearHandlers() {
    const count = this.handlers.length;
    this.handlers = [];
    console.log(`🧹 Cleared ${count} handlers from ${this.listenerName}`);
  }

  /**
   * Cleanup and shutdown the listener
   */
  async cleanup() {
    console.log(`🧹 Cleaning up ${this.listenerName} listener`);
    
    await this.unregister();
    this.clearHandlers();
    
    this.initialized = false;
    this.browser = null;
  }
}

/**
 * Create a specialized listener class
 * @param {string} eventType - browser API type (runtime, tabs, etc.)
 * @param {string} eventName - Event name (onMessage, onInstalled, etc.)
 * @param {string} listenerName - Human-readable name
 * @returns {Class} Specialized listener class
 */
export function createListener(eventType, eventName, listenerName) {
  return class extends BaseListener {
    constructor() {
      super(eventType, eventName, listenerName);
    }

    // Add any specialized methods here if needed
  };
}

/**
 * Utility function to create and register multiple listeners
 * @param {Array} listenerConfigs - Array of listener configurations
 * @returns {Promise<Array>} Array of created listeners
 */
export async function createAndRegisterListeners(listenerConfigs) {
  const listeners = [];
  const errors = [];

  for (const config of listenerConfigs) {
    try {
      const ListenerClass = createListener(
        config.eventType,
        config.eventName,
        config.listenerName
      );
      
      const listener = new ListenerClass();
      
      // Add handlers if provided
      if (config.handlers) {
        config.handlers.forEach(handler => {
          listener.addHandler(handler.fn, handler.name);
        });
      }
      
      // Register the listener
      await listener.register();
      listeners.push(listener);
      
      console.log(`✅ Created and registered ${config.listenerName}`);

    } catch (error) {
      console.error(`❌ Failed to create listener ${config.listenerName}:`, error);
      errors.push({
        config: config,
        error: error
      });
    }
  }

  if (errors.length > 0) {
    console.warn(`⚠️ ${errors.length}/${listenerConfigs.length} listeners failed to initialize`);
  }

  return {
    listeners,
    errors,
    successCount: listeners.length,
    errorCount: errors.length
  };
}