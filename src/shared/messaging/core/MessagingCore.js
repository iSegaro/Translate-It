/**
 * MessagingCore - Simplified messaging utilities
 * Provides standardized message formats and utilities for browser extension messaging
 * Refactored to use direct browser.runtime.sendMessage pattern
 */

import { MessageActions } from './MessageActions.js';
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.MESSAGING, 'MessagingCore');


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
 * Messaging utility functions
 */

/**
 * Generate unique message ID
 * @param {string} context - Context identifier
 * @returns {string} Unique message ID
 */
export function generateMessageId(context) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `${context}-${timestamp}-${random}`;
}

// Export constants for easy access
export { MessageContexts as Contexts };
export { MessageActions as Actions };
export { MessageActions };

// Maintain backward compatibility
export const MessagingContexts = MessageContexts;