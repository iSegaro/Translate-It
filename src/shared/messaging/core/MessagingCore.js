/**
 * MessagingCore - Simplified messaging utilities
 * Provides standardized message formats and utilities for browser extension messaging
 * Refactored to use direct browser.runtime.sendMessage pattern
 */

import { MessageActions } from './MessageActions.js';
import { MessageContexts, ActionReasons } from './MessagingConstants.js';
import { ErrorMatcher } from '@/shared/error-management/ErrorMatcher.js';

/**
 * Message Format Utility
 * Provides methods for creating and validating message objects
 */
export const MessageFormat = {
  /**
   * Create a standard message object
   * @param {string} action - Message action from MessageActions
   * @param {Object} data - Payload data
   * @param {string} context - Execution context from MessageContexts
   * @param {string|null} messageId - Optional message ID
   * @returns {Object} Formatted message object
   */
  create(action, data = {}, context = MessageContexts.CONTENT, messageId = null) {
    return {
      action,
      data,
      context,
      messageId: messageId || `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: Date.now()
    };
  },

  /**
   * Create a standard error response
   * @param {Error|Object|string} error - Error object or message
   * @param {string|null} messageId - Original message ID
   * @param {Object} options - Additional context/data to include
   * @returns {Object} Error response object
   */
  createErrorResponse(error, messageId = null, options = {}) {
    let errorData;
    const errorType = ErrorMatcher.matchErrorToType(error);
    
    if (error instanceof Error) {
      errorData = {
        message: error.message,
        type: error.type || errorType,
        statusCode: error.statusCode,
        ...options
      };
    } else if (error && typeof error === 'object') {
      errorData = {
        message: error.message || error.error || 'Unknown error',
        type: error.type || errorType,
        ...error,
        ...options
      };
    } else {
      errorData = {
        message: String(error),
        type: errorType,
        ...options
      };
    }

    return {
      success: false,
      error: errorData,
      messageId,
      timestamp: Date.now()
    };
  },

  /**
   * Validate a message object
   * @param {Object} message - Message to validate
   * @returns {boolean} True if message is valid
   */
  validate(message) {
    if (!message || typeof message !== 'object') return false;
    if (!message.action) return false;
    return true;
  }
};

/**
 * Unique ID generator for messages
 * @returns {string} Unique message ID
 */
export function generateMessageId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `msg-${timestamp}-${random}`;
}

// Export constants for easy access
export { MessageContexts, ActionReasons };
export { MessageContexts as Contexts };
export { MessageActions as Actions };
export { MessageActions };

// Maintain backward compatibility
export const MessagingContexts = MessageContexts;
