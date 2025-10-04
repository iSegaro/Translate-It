
import browser from 'webextension-polyfill';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageFormat } from './MessagingCore.js';

// Lazy logger initialization to avoid TDZ issues
let logger = null;
function getLogger() {
  if (!logger) {
    try {
      logger = getScopedLogger(LOG_COMPONENTS.MESSAGING, 'MessageHandler');
      // Ensure logger is not null
      if (!logger) {
        logger = {
          debug: () => {},
          warn: () => {},
          error: () => {},
          info: () => {},
          init: () => {}
        };
      }
    } catch (error) {
      // Fallback to noop logger
      logger = {
        debug: () => {},
        warn: () => {},
        error: () => {},
        info: () => {},
        init: () => {}
      };
    }
  }
  return logger;
}

class MessageHandler {
  constructor() {
    this.handlers = new Map();
    this.isListenerActive = false;
    this.pendingResponses = new Map();
    this._pendingRegistrations = [];
    this._registrationTimeout = null;
  }

  registerHandler(action, handler) {
    if (this.handlers.has(action)) {
      getLogger().warn(`Handler for action '${action}' is already registered. Overwriting.`);
    }
    this.handlers.set(action, handler);

    // Collect registrations for batched logging
    this._pendingRegistrations.push(action);

    // Schedule batched logging
    if (!this._registrationTimeout) {
      this._registrationTimeout = setTimeout(() => {
        const count = this._pendingRegistrations.length;
        if (count > 1) {
          getLogger().debug(`🔧 ${count} handlers registered: ${this._pendingRegistrations.join(', ')}`);
        } else {
          getLogger().debug(`Handler registered for action: ${this._pendingRegistrations[0]}`);
        }
        this._pendingRegistrations = [];
        this._registrationTimeout = null;
      }, 50); // Batch within 50ms
    }
  }

  unregisterHandler(action) {
    if (this.handlers.has(action)) {
      this.handlers.delete(action);
      getLogger().debug(`Handler for action '${action}' unregistered.`);
    }
  }

  /**
   * Get handler for specific action (backward compatibility)
   * @param {string} action - Action name
   * @returns {Function|null} Handler function or null
   */
  getHandlerForMessage(action) {
    return this.handlers.get(action) || null;
  }

  _handleMessage(message, sender, sendResponse) {
    // Allow messages with just action (for backward compatibility)
    if (!message || !message.action) {
      getLogger().warn('Received message without action.');
      return false;
    }

    // Normalize message format if needed
    const normalizedMessage = this._normalizeMessage(message);

    const { action, messageId } = normalizedMessage;
    const handler = this.handlers.get(action);

    if (handler) {
      getLogger().debug(`Handler found for action: ${action}`);


      const result = handler(normalizedMessage, sender, sendResponse);

      if (result instanceof Promise) {
        getLogger().debug(`Promise-based handler for ${action}. Waiting for resolution.`);
        // Store the sendResponse function to be called when the promise resolves
        this.pendingResponses.set(messageId, sendResponse);
        result
          .then(response => {
            getLogger().debug(`Handler ${action} resolved with:`, response);
            this._sendResponse(messageId, response);
          })
          .catch(error => {
            getLogger().error(`Error in promise-based handler for ${action}:`, error);
            const errorResponse = MessageFormat.createErrorResponse(error, messageId);
            this._sendResponse(messageId, errorResponse);
          });
        // Return true to indicate that the response will be sent asynchronously
        return true;
      } else if (result === true) {
        // Handler indicates it will send response asynchronously
        getLogger().debug(`Async response handler for ${action}`);
        return true;
      } else {
        getLogger().debug(`Synchronous handler for ${action}. Sending response immediately.`);
        try {
          if (sendResponse && result !== undefined) {
            sendResponse(result);
          }
        } catch (error) {
          getLogger().warn(`Failed to send synchronous response for ${action}:`, error);
        }
        return false;
      }
    } else {
      getLogger().debug(`No handler registered for action: ${action}. Available handlers:`, Array.from(this.handlers.keys()));
      // No handler, so we don't need to keep the message channel open
      // Return false to allow other listeners to handle the message
      return false;
    }
  }

  _normalizeMessage(message) {
    // If message is already in correct format, return as-is
    if (message.messageId && message.context) {
      return message;
    }

    // Create normalized message with missing fields
    return {
      ...message,
      messageId: message.messageId || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      context: message.context || 'unknown',
      timestamp: message.timestamp || Date.now()
    };
  }

  _sendResponse(messageId, response) {
    const sendResponse = this.pendingResponses.get(messageId);
    getLogger().debug(`Sending response for messageId ${messageId}:`, response);
    if (sendResponse) {
      try {
        sendResponse(response);
      } catch (error) {
        getLogger().warn(`Failed to send response for messageId ${messageId}:`, error.message);
      }
      this.pendingResponses.delete(messageId);
    } else {
      getLogger().debug(`No pending response found for messageId: ${messageId}`);
    }
  }

  listen() {
    if (this.isListenerActive) {
      getLogger().warn('Message listener is already active.');
      return;
    }
    
    // Bind the handler to preserve 'this' context
    this._boundHandleMessage = this._handleMessage.bind(this);
    browser.runtime.onMessage.addListener(this._boundHandleMessage);
    this.isListenerActive = true;
    getLogger().debug('Message listener activated.');
  }

  /**
   * Remove message listener
   */
  stopListening() {
    if (!this.isListenerActive) {
      return;
    }
    
    if (this._boundHandleMessage) {
      browser.runtime.onMessage.removeListener(this._boundHandleMessage);
      this._boundHandleMessage = null;
    }
    
    this.isListenerActive = false;
    getLogger().debug('Message listener deactivated.');
  }
}

// Export the MessageHandler class and create context-specific instances
export { MessageHandler };

// Export context-specific instances
let _instance = null;
export const messageHandler = {
  get instance() {
    if (!_instance) {
      _instance = new MessageHandler();
    }
    return _instance;
  }
};

// Helper to create new instances for different contexts
export function createMessageHandler() {
  return new MessageHandler();
}
