/**
 * MessagingCore - Unified messaging system core
 * Combines MessagingStandards factory with EnhancedUnifiedMessenger functionality
 * Provides context-specific messengers with standardized message formats
 */

import { EnhancedUnifiedMessenger } from '../../core/EnhancedUnifiedMessenger.js';
import { MessageActions } from './MessageActions.js';
import { createLogger } from '../../utils/core/logger.js';

const DEFAULT_COMPONENT = 'Messaging';

/**
 * Standard message format interface
 */
export class MessageFormat {
  /**
   * Create a standardized message format
   * @param {string} action - Message action
   * @param {*} data - Message data
   * @param {string} context - Sender context
   * @param {Object} options - Additional options
   * @returns {Object} Standardized message object
   */
  static create(action, data, context, options = {}) {
    return {
      action,
      data,
      context,
      messageId:
        options.messageId ||
        `${context}-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
      timestamp: Date.now(),
      version: "2.0",
      ...options,
    };
  }

  /**
   * Validate message format
   * @param {Object} message - Message to validate
   * @returns {boolean} True if message is valid
   */
  static validate(message) {
    if (!message || typeof message !== "object") {
      const logger = createLogger(DEFAULT_COMPONENT, 'Format');
      logger.warn('Invalid message type or null', message);
      return false;
    }

    const isValid = Boolean(
      message.action &&
        typeof message.action === "string" &&
        message.context &&
        typeof message.context === "string" &&
        message.messageId &&
        typeof message.messageId === "string"
    );

    if (!isValid) {
      const logger = createLogger(DEFAULT_COMPONENT, 'Format');
      logger.warn('Validation failed for message', {
        message,
        actionValid: message.action && typeof message.action === "string",
        contextValid: message.context && typeof message.context === "string",
        messageIdValid: message.messageId && typeof message.messageId === "string"
      });
    }

    return isValid;
  }

  /**
   * Create success response format
   * @param {*} data - Response data
   * @param {string} originalMessageId - Original message ID
   * @param {Object} options - Additional options
   * @returns {Object} Success response object
   */
  static createSuccessResponse(data, originalMessageId, options = {}) {
    return {
      success: true,
      data,
      messageId: originalMessageId,
      timestamp: Date.now(),
      ...options,
    };
  }

  /**
   * Create error response format
   * @param {string|Error} error - Error message or Error object
   * @param {string} originalMessageId - Original message ID
   * @param {Object} options - Additional options
   * @returns {Object} Error response object
   */
  static createErrorResponse(error, originalMessageId, options = {}) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorType = error?.type || "UNKNOWN_ERROR";
    const statusCode = error?.statusCode || 500;

    return {
      success: false,
      error: {
        message: errorMessage,
        type: errorType,
        statusCode,
      },
      messageId: originalMessageId,
      timestamp: Date.now(),
      ...options,
    };
  }
}

/**
 * Context definitions for different extension contexts
 */
export class MessageContexts {
  static POPUP = "popup";
  static SIDEPANEL = "sidepanel";
  static OPTIONS = "options";
  static BACKGROUND = "background";
  static SELECT_ELEMENT = "select_element";
  static CONTENT = "content";
  static OFFSCREEN = "offscreen";
  static EVENT_HANDLER = "event-handler";
  static TTS_MANAGER = "tts-manager";
  static CAPTURE_MANAGER = "capture-manager";
  static SELECTION_MANAGER = "selection-manager";
  
  // Additional contexts for specialized services
  static TTS_MANAGER_BACKGROUND = "tts-manager-background";
  static API_PROVIDER = "api-provider";
  static TRANSLATION_SERVICE = "translation-service";
  static TTS_SMART = "tts-smart";
  static BACKGROUND_WARMUP = "background-warmup";
  static VUE_GENERIC = "vue-generic";

  /**
   * Get all available contexts
   * @returns {Array<string>} Array of context names
   */
  static getAllContexts() {
    return [
      this.POPUP,
      this.SIDEPANEL,
      this.OPTIONS,
      this.BACKGROUND,
      this.SELECT_ELEMENT,
      this.CONTENT,
      this.OFFSCREEN,
      this.EVENT_HANDLER,
      this.TTS_MANAGER,
      this.CAPTURE_MANAGER,
      this.SELECTION_MANAGER,
      this.TTS_MANAGER_BACKGROUND,
      this.API_PROVIDER,
      this.TRANSLATION_SERVICE,
      this.TTS_SMART,
      this.BACKGROUND_WARMUP,
      this.VUE_GENERIC,
    ];
  }

  /**
   * Validate context name
   * @param {string} context - Context to validate
   * @returns {boolean} True if context is valid
   */
  static isValidContext(context) {
    return this.getAllContexts().includes(context);
  }
}

/**
 * MessagingCore - Main factory and management class
 * Combines the factory pattern from MessagingStandards with unified messaging capabilities
 */
export class MessagingCore {
  /**
   * Singleton instances storage
   * @private
   */
  static instances = new Map();

  /**
   * Message interceptors for logging and debugging
   * @private
   */
  static interceptors = {
    request: [],
    response: [],
  };

  /**
   * Get or create messenger instance for specific context
   * @param {string} context - Context identifier
   * @returns {EnhancedUnifiedMessenger} Messenger instance
   */
  static getMessenger(context) {
    // Validate context
    if (!MessageContexts.isValidContext(context)) {
      const logger = createLogger(DEFAULT_COMPONENT, 'Core');
      logger.warn(`Unknown context: ${context}, using as-is`);
    }

    // Get or create instance
    if (!this.instances.has(context)) {
      const messenger = new EnhancedUnifiedMessenger(context);
      this.instances.set(context, messenger);

      const logger = createLogger(DEFAULT_COMPONENT, 'Core');
      logger.debug(`Created new messenger for context: ${context}`);
    }

    return this.instances.get(context);
  }

  /**
   * Create standardized message format
   * @param {string} action - Message action
   * @param {*} data - Message data
   * @param {string} context - Sender context
   * @param {Object} options - Additional options
   * @returns {Object} Standardized message
   */
  static standardMessageFormat(action, data, context, options = {}) {
    // Validate inputs
    if (!action || typeof action !== "string") {
      throw new Error("Action is required and must be a string");
    }

    if (!context || typeof context !== "string") {
      throw new Error("Context is required and must be a string");
    }

    return MessageFormat.create(action, data, context, options);
  }

  /**
   * Generate unique message ID
   * @param {string} context - Context identifier
   * @returns {string} Unique message ID
   */
  static generateMessageId(context) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${context}-${timestamp}-${random}`;
  }

  /**
   * Add request interceptor
   * @param {Function} interceptor - Interceptor function
   */
  static addRequestInterceptor(interceptor) {
    if (typeof interceptor === "function") {
      this.interceptors.request.push(interceptor);
    }
  }

  /**
   * Add response interceptor
   * @param {Function} interceptor - Interceptor function
   */
  static addResponseInterceptor(interceptor) {
    if (typeof interceptor === "function") {
      this.interceptors.response.push(interceptor);
    }
  }

  /**
   * Clear all messenger instances
   * Useful for testing and cleanup
   */
  static clearInstances() {
    this.instances.clear();
    const logger = createLogger(DEFAULT_COMPONENT, 'Core');
    logger.operation('All messenger instances cleared');
  }

  /**
   * Get all active messenger contexts
   * @returns {Array<string>} Array of active contexts
   */
  static getActiveContexts() {
    return Array.from(this.instances.keys());
  }

  /**
   * Get messenger statistics
   * @returns {Object} Statistics object
   */
  static getStatistics() {
    const stats = {
      totalInstances: this.instances.size,
      activeContexts: this.getActiveContexts(),
      requestInterceptors: this.interceptors.request.length,
      responseInterceptors: this.interceptors.response.length,
    };

    // Get individual messenger info
    stats.messengers = {};
    for (const [context, messenger] of this.instances) {
      stats.messengers[context] = messenger.getInfo();
    }

    return stats;
  }

  /**
   * Test connectivity for all active messengers
   * @returns {Promise<Object>} Test results
   */
  static async testAllMessengers() {
    const results = {};

    for (const [context, messenger] of this.instances) {
      try {
        results[context] = await messenger.testSpecializedMessengers();
      } catch (error) {
        results[context] = {
          success: false,
          error: error.message,
          context,
        };
      }
    }

    return {
      success: Object.values(results).every((r) => r.success),
      results,
      timestamp: Date.now(),
    };
  }

  /**
   * Create pre-configured messengers for common contexts
   * @returns {Object} Object with pre-configured messengers
   */
  static createCommonMessengers() {
    return {
      popup: this.getMessenger(MessageContexts.POPUP),
      sidepanel: this.getMessenger(MessageContexts.SIDEPANEL),
      options: this.getMessenger(MessageContexts.OPTIONS),
      select_element: this.getMessenger(MessageContexts.SELECT_ELEMENT),
      content: this.getMessenger(MessageContexts.CONTENT),
      background: this.getMessenger(MessageContexts.BACKGROUND),
      eventHandler: this.getMessenger(MessageContexts.EVENT_HANDLER),
    };
  }

  /**
   * Setup development mode logging
   * Adds request/response interceptors for debugging
   */
  static setupDevelopmentLogging() {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    // Request logging
    this.addRequestInterceptor((message, context) => {
      console.group(`[MessagingCore:${context}] 📤 Request`);
      logger.debug("Action:", message.action);
      logger.debug("Data:", message.data);
      logger.debug("MessageId:", message.messageId);
      console.groupEnd();
    });

    // Response logging
    this.addResponseInterceptor((response, context, originalMessage) => {
      console.group(`[MessagingCore:${context}] 📥 Response`);
      logger.debug("Original Action:", originalMessage?.action);
      logger.debug("Success:", response?.success);
      logger.debug("Data:", response?.data);
      logger.debug("Error:", response?.error);
      console.groupEnd();
    });

    const logger = createLogger(DEFAULT_COMPONENT, 'Core');
    logger.init('Development logging enabled');
  }
}

// Export constants for easy access
export { MessageContexts as Contexts };
export { MessageActions as Actions };

// Maintain backward compatibility
export const MessagingStandards = MessagingCore;
export const MessagingContexts = MessageContexts;

export default MessagingCore;