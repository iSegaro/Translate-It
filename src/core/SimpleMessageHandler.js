/**
 * @deprecated This file is deprecated and replaced by MessageHandler.js
 * Simple Message Handler - Promise-based cross-browser implementation.
 * Uses webextension-polyfill Promise API for seamless Chrome/Firefox compatibility.
 * Enhanced with context-aware routing for MessagingStandards integration
 * 
 * MIGRATION NOTE: All functionality has been moved to @/shared/messaging/core/MessageHandler.js
 * This file is kept for backward compatibility and will be removed in future versions.
 */
import browser from "webextension-polyfill";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageContexts } from '@/shared/messaging/core/MessagingCore.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'SimpleMessageHandler');

class SimpleMessageHandler {
  constructor() {
    this.handlers = new Map();
    this.contextHandlers = new Map(); // New: Context-specific handlers
    this.initialized = false;
    this.routingEnabled = true; // New: Enable/disable context routing
  }

  /**
   * Initializes the message handler and registers the listener.
   * This is the core of the cross-browser compatibility.
   */
  initialize() {
    if (this.initialized) {
      logger.debug("Simple Message Handler is already initialized.");
      return;
    }

    logger.debug("🎧 [SimpleMessageHandler] Initializing Simple Message Handler...");

    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      const action = message?.action || message?.type;
      if (!action) {
        logger.warn("[SimpleMessageHandler] Message without action received.", message);
        return false; // No action, no response expected.
      }

      const handler = this.getHandlerForMessage(action, message?.context);

      if (handler) {
        logger.debug(`[SimpleMessageHandler] Handler found for ${action}, invoking.`);
        
        const promise = Promise.resolve(handler(message, sender));

        promise.then(response => {
          logger.debug(`[SimpleMessageHandler] Handler for ${action} succeeded, sending response.`);
          try {
            sendResponse(response);
          } catch (e) {
            logger.warn(`[SimpleMessageHandler] Could not send response for ${action}: ${e.message}`);
          }
        }).catch(error => {
          logger.error(`[SimpleMessageHandler] Handler for ${action} failed:`, error);
          try {
            sendResponse({ success: false, error: error.message || 'Handler error' });
          } catch (e) {
            logger.warn(`[SimpleMessageHandler] Could not send error response for ${action}: ${e.message}`);
          }
        });

        return true; // Indicate that the response will be sent asynchronously.
      } else {
        logger.debug(`[SimpleMessageHandler] No handler for action: ${action}`);
        return false; // No handler, no response expected.
      }
    });

    this.initialized = true;
    logger.debug("✅ Simple Message Handler initialized successfully.");
  }

  /**
   * Enhanced handler registration with context support
   * Gets the appropriate handler for a message based on action and context
   * @param {string} action - Message action
   * @param {string} context - Message context
   * @returns {Function|null} Handler function or null
   */
  getHandlerForMessage(action, context) {
    if (!this.routingEnabled || !context) {
      // Fallback to traditional action-only routing
      return this.handlers.get(action);
    }

    // Check for context-specific handler first
    const contextKey = `${context}:${action}`;
    if (this.contextHandlers.has(contextKey)) {
      logger.debug(`[SimpleMessageHandler] Using context-specific handler: ${contextKey}`);
      return this.contextHandlers.get(contextKey);
    }

    // Check for context-generic handler
    const contextGenericKey = `${context}:*`;
    if (this.contextHandlers.has(contextGenericKey)) {
      logger.debug(`[SimpleMessageHandler] Using context-generic handler: ${contextGenericKey}`);
      return this.contextHandlers.get(contextGenericKey);
    }

    // Fallback to traditional action-only handler
    return this.handlers.get(action);
  }

  /**
   * Register a context-specific handler
   * @param {string} context - Context identifier
   * @param {string} action - Action identifier ('*' for all actions in context)
   * @param {Function} handlerFn - Handler function
   */
  registerContextHandler(context, action, handlerFn) {
    const contextKey = `${context}:${action}`;
    
    if (this.contextHandlers.has(contextKey)) {
      logger.warn(`[SimpleMessageHandler] Overwriting context handler: "${contextKey}"`);
    }
    
    this.contextHandlers.set(contextKey, handlerFn);
    logger.debug(`✅ SimpleMessageHandler: Registered context handler for "${contextKey}"`);
  }

  /**
   * Route messages to appropriate handlers based on context
   * @param {Object} message - Incoming message
   * @param {Object} sender - Message sender info
   * @returns {Promise} Handler result
   */
  async routeMessage(message, sender) {
    const context = message?.context;

    // Enhanced routing logic for specific contexts
    switch (context) {
      case MessageContexts.POPUP:
        return this.handlePopupMessage(message, sender);
      case MessageContexts.SIDEPANEL:
        return this.handleSidepanelMessage(message, sender);
      case MessageContexts.CONTENT:
        return this.handleContentMessage(message, sender);
      case MessageContexts.OFFSCREEN:
        return this.handleOffscreenMessage(message, sender);
      case MessageContexts.OPTIONS:
        return this.handleOptionsMessage(message, sender);
      case MessageContexts.EVENT_HANDLER:
        return this.handleEventHandlerMessage(message, sender);
      default:
        return this.handleGenericMessage(message, sender);
    }
  }

  /**
   * Handle popup context messages
   * @param {Object} message - Message object
   * @param {Object} sender - Sender info
   * @returns {Promise} Handler result
   */
  async handlePopupMessage(message, sender) {
    const handler = this.getHandlerForMessage(message.action, MessageContexts.POPUP);
    if (handler) {
      return handler(message, sender);
    }
    throw new Error(`No handler for popup action: ${message.action}`);
  }

  /**
   * Handle sidepanel context messages
   * @param {Object} message - Message object
   * @param {Object} sender - Sender info
   * @returns {Promise} Handler result
   */
  async handleSidepanelMessage(message, sender) {
    const handler = this.getHandlerForMessage(message.action, MessageContexts.SIDEPANEL);
    if (handler) {
      return handler(message, sender);
    }
    throw new Error(`No handler for sidepanel action: ${message.action}`);
  }

  /**
   * Handle content script context messages
   * @param {Object} message - Message object
   * @param {Object} sender - Sender info
   * @returns {Promise} Handler result
   */
  async handleContentMessage(message, sender) {
    const handler = this.getHandlerForMessage(message.action, MessageContexts.CONTENT);
    if (handler) {
      return handler(message, sender);
    }
    throw new Error(`No handler for content action: ${message.action}`);
  }

  /**
   * Handle offscreen context messages
   * @param {Object} message - Message object
   * @param {Object} sender - Sender info
   * @returns {Promise} Handler result
   */
  async handleOffscreenMessage(message, sender) {
    const handler = this.getHandlerForMessage(message.action, MessageContexts.OFFSCREEN);
    if (handler) {
      return handler(message, sender);
    }
    throw new Error(`No handler for offscreen action: ${message.action}`);
  }

  /**
   * Handle options page context messages
   * @param {Object} message - Message object
   * @param {Object} sender - Sender info
   * @returns {Promise} Handler result
   */
  async handleOptionsMessage(message, sender) {
    const handler = this.getHandlerForMessage(message.action, MessageContexts.OPTIONS);
    if (handler) {
      return handler(message, sender);
    }
    throw new Error(`No handler for options action: ${message.action}`);
  }

  /**
   * Handle event handler context messages
   * @param {Object} message - Message object
   * @param {Object} sender - Sender info
   * @returns {Promise} Handler result
   */
  async handleEventHandlerMessage(message, sender) {
    const handler = this.getHandlerForMessage(message.action, MessageContexts.EVENT_HANDLER);
    if (handler) {
      return handler(message, sender);
    }
    throw new Error(`No handler for event-handler action: ${message.action}`);
  }

  /**
   * Handle generic messages (fallback)
   * @param {Object} message - Message object
   * @param {Object} sender - Sender info
   * @returns {Promise} Handler result
   */
  async handleGenericMessage(message, sender) {
    const handler = this.handlers.get(message.action);
    if (handler) {
      return handler(message, sender);
    }
    throw new Error(`No handler for generic action: ${message.action}`);
  }

  /**
   * Registers a handler function for a specific message action.
   * @param {string} action - The name of the action to handle.
   * @param {Function} handlerFn - The async function to execute for this action.
   */
  registerHandler(action, handlerFn) {
    if (this.handlers.has(action)) {
      logger.warn(
        `[SimpleMessageHandler] Overwriting handler for action: "${action}".`,
      );
    }
    this.handlers.set(action, handlerFn);
    logger.debug(`Registered handler for "${action}"`);
  }

  /**
   * Enable or disable context-aware routing
   * @param {boolean} enabled - Whether to enable context routing
   */
  setContextRouting(enabled) {
    this.routingEnabled = enabled;
    logger.debug(`[SimpleMessageHandler] Context routing ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get handler statistics
   * @returns {Object} Statistics about registered handlers
   */
  getStats() {
    return {
      totalHandlers: this.handlers.size,
      contextHandlers: this.contextHandlers.size,
      routingEnabled: this.routingEnabled,
      initialized: this.initialized,
      handlers: Array.from(this.handlers.keys()),
      contextHandlerKeys: Array.from(this.contextHandlers.keys())
    };
  }

  /**
   * Clear all handlers (useful for testing)
   */
  clearHandlers() {
    this.handlers.clear();
    this.contextHandlers.clear();
    logger.debug('[SimpleMessageHandler] All handlers cleared');
  }
}

// Export a singleton instance.
export const simpleMessageHandler = new SimpleMessageHandler();