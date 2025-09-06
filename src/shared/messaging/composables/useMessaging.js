import { MessageFormat, MessagingContexts } from '../core/MessagingCore.js'
import { MessageActions } from '../core/MessageActions.js'
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { sendReliable } from '../core/ReliableMessaging.js'
import { sendSmart } from '../core/SmartMessaging.js'
import { isContextError } from '@/core/extensionContext.js'
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js'
const logger = getScopedLogger(LOG_COMPONENTS.MESSAGING, 'useMessaging');


/**
 * Provides a standardized interface for messaging within Vue components.
 * Now uses direct browser.runtime.sendMessage for better performance and simplicity.
 *
 * @param {string} context - The messaging context (e.g., 'popup', 'sidepanel').
 * @returns {object} Simplified messaging utilities
 * 
 * @example
 * ```javascript
 * const { sendMessage, createMessage } = useMessaging('popup');
 * 
 * // Create a message
 * const message = createMessage(MessageActions.TRANSLATE, { text: 'Hello' });
 * 
 * // Send message
 * const response = await sendMessage(message);
 * ```
 */
export function useMessaging(context) {
  /**
   * Send a message using smart routing (direct for fast actions, port for slow actions)
   * @param {Object} message - Message object (should use MessageFormat.create)
   * @param {Object} options - Optional parameters for smart messaging
   * @returns {Promise} Response promise
   */
  const sendMessage = async (message, options = {}) => {
    try {
      // Use smart messaging for optimal performance
      return await sendSmart(message, options);
    } catch (error) {
      // Handle back/forward cache disconnects gracefully
      if (error.type === ErrorTypes.PAGE_MOVED_TO_CACHE || error.message?.includes('Page moved to back/forward cache')) {
        logger.debug('sendMessage: Page moved to back/forward cache, operation cancelled gracefully');
        return { success: false, error: 'Page moved to cache', cancelled: true };
      }
      
      // Handle context errors silently (they're expected when extension reloads)
      if (isContextError(error)) {
        logger.debug('sendMessage failed due to extension context invalidated (expected during extension reload):', error.message);
      } else {
        logger.error('sendMessage failed via sendSmart:', error);
      }
      throw error;
    }
  };

  /**
   * Create a standardized message
   * @param {string} action - Message action
   * @param {*} data - Message data
   * @param {Object} options - Additional options
   * @returns {Object} Standardized message
   */
  const createMessage = (action, data, options = {}) => {
    return MessageFormat.create(action, data, context, options);
  };

  /**
   * Send a message with fire-and-forget pattern
   * @param {string} action - Message action
   * @param {*} data - Message data
   * @param {Object} options - Additional options
   */
  const sendFireAndForget = (action, data, options = {}) => {
    const message = createMessage(action, data, options);
    // Fire-and-forget via smart messenger
    sendSmart(message, options).catch(error => {
      // Handle context errors silently, log other errors
      if (isContextError(error)) {
        logger.debug(`[useMessaging:${context}] Fire-and-forget failed due to extension context invalidated (expected):`, error.message);
      } else {
        logger.debug(`[useMessaging:${context}] Fire-and-forget failed (smart):`, error);
      }
    });
  };

  return {
    sendMessage,
    sendReliable, // Keep for backward compatibility
    sendSmart,    // New smart messaging
    createMessage,
    sendFireAndForget,
    
    // Constants for convenience
    MessageActions,
    MessagingContexts,
  }
}

// Export messaging functions for non-Vue modules
export { sendReliable, sendSmart }
