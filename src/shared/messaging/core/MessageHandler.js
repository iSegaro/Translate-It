
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

  _handleMessage(message, sender, sendResponse) {
    if (!MessageFormat.validate(message)) {
      logger.warn('Received an invalid message format.');
      return false;
    }

    const { action, messageId } = message;
    const handler = this.handlers.get(action);

    if (handler) {
      logger.debug(`Handler found for action: ${action}`);
      const result = handler(message, sender);

      if (result instanceof Promise) {
        logger.debug(`Promise-based handler for ${action}. Waiting for resolution.`);
        // Store the sendResponse function to be called when the promise resolves
        this.pendingResponses.set(messageId, sendResponse);
        result
          .then(response => {
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
        sendResponse(result);
        return false;
      }
    } else {
      logger.debug(`No handler registered for action: ${action}. Ignoring.`);
      // No handler, so we don't need to keep the message channel open
      return false;
    }
  }

  _sendResponse(messageId, response) {
    const sendResponse = this.pendingResponses.get(messageId);
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
    browser.runtime.onMessage.addListener(this._handleMessage.bind(this));
    this.isListenerActive = true;
    logger.debug('Message listener activated.');
  }
}

// Export a singleton instance
export const messageHandler = new MessageHandler();
