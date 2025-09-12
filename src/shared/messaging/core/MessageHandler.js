
import browser from 'webextension-polyfill';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageFormat } from './MessagingCore.js';

const logger = getScopedLogger(LOG_COMPONENTS.MESSAGING, 'MessageHandler');

class MessageHandler {
  constructor() {
    this.handlers = new Map();
    this.isListenerActive = false;
    this.pendingResponses = new Map();
  }

  registerHandler(action, handler) {
    if (this.handlers.has(action)) {
      logger.warn(`Handler for action '${action}' is already registered. Overwriting.`);
    }
    this.handlers.set(action, handler);
    logger.debug(`Handler registered for action: ${action}`);
  }

  unregisterHandler(action) {
    if (this.handlers.has(action)) {
      this.handlers.delete(action);
      logger.debug(`Handler for action '${action}' unregistered.`);
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
      logger.warn('Received message without action.');
      return false;
    }

    // Normalize message format if needed
    const normalizedMessage = this._normalizeMessage(message);
    
    const { action, messageId } = normalizedMessage;
    const handler = this.handlers.get(action);

    if (handler) {
      logger.debug(`Handler found for action: ${action}`);
      const result = handler(normalizedMessage, sender, sendResponse);

      if (result instanceof Promise) {
        logger.debug(`Promise-based handler for ${action}. Waiting for resolution.`);
        // Store the sendResponse function to be called when the promise resolves
        this.pendingResponses.set(messageId, sendResponse);
        result
          .then(response => {
            logger.debug(`Handler ${action} resolved with:`, response);
            this._sendResponse(messageId, response);
          })
          .catch(error => {
            logger.error(`Error in promise-based handler for ${action}:`, error);
            const errorResponse = MessageFormat.createErrorResponse(error, messageId);
            this._sendResponse(messageId, errorResponse);
          });
        // Return true to indicate that the response will be sent asynchronously
        return true;
      } else {
        logger.debug(`Synchronous handler for ${action}. Sending response immediately.`);
        try {
          sendResponse(result);
        } catch (error) {
          logger.warn(`Failed to send synchronous response for ${action}:`, error);
        }
        return false;
      }
    } else {
      logger.debug(`No handler registered for action: ${action}. Available handlers:`, Array.from(this.handlers.keys()));
      // No handler, so we don't need to keep the message channel open
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
    logger.debug(`Sending response for messageId ${messageId}:`, response);
    if (sendResponse) {
      try {
        sendResponse(response);
      } catch (error) {
        logger.warn(`Failed to send response for messageId ${messageId}:`, error.message);
      }
      this.pendingResponses.delete(messageId);
    } else {
      logger.debug(`No pending response found for messageId: ${messageId}`);
    }
  }

  listen() {
    if (this.isListenerActive) {
      logger.warn('Message listener is already active.');
      return;
    }
    
    // Bind the handler to preserve 'this' context
    this._boundHandleMessage = this._handleMessage.bind(this);
    browser.runtime.onMessage.addListener(this._boundHandleMessage);
    this.isListenerActive = true;
    logger.debug('Message listener activated.');
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
    logger.debug('Message listener deactivated.');
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
