import { MessageFormat, MessagingContexts } from '../core/MessagingCore.js'
import { MessageActions } from '../core/MessageActions.js'
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { sendMessage as sendUnifiedMessage } from '../core/UnifiedMessaging.js'
import ExtensionContextManager from '@/core/extensionContext.js'
const logger = getScopedLogger(LOG_COMPONENTS.MESSAGING, 'useMessaging');


/**
 * Provides a standardized interface for messaging within Vue components.
 * Now uses UnifiedMessaging for optimal performance and simplicity.
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
   * Send a message using unified messaging system
   * @param {Object} message - Message object (should use MessageFormat.create)
   * @param {Object} options - Optional parameters
   * @returns {Promise} Response promise
   */
  const sendMessage = async (message, options = {}) => {
    try {
      // Use unified messaging for optimal performance
      return await sendUnifiedMessage(message, options);
    } catch (error) {
      // Handle context errors silently (they're expected when extension reloads)
      if (ExtensionContextManager.isContextError(error)) {
        logger.debug('sendMessage failed due to extension context invalidated (expected during extension reload):', error.message);
      } else {
        logger.error('sendMessage failed via UnifiedMessaging:', error);
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
    // Fire-and-forget via unified messaging
    sendUnifiedMessage(message, options).catch(error => {
      // Handle context errors silently, log other errors
      if (ExtensionContextManager.isContextError(error)) {
        logger.debug(`[useMessaging:${context}] Fire-and-forget failed due to extension context invalidated (expected):`, error.message);
      } else {
        logger.debug(`[useMessaging:${context}] Fire-and-forget failed:`, error);
      }
    });
  };

  return {
    sendMessage,
    createMessage,
    sendFireAndForget,
    
    // Constants for convenience
    MessageActions,
    MessagingContexts,
  }
}

// Export messaging function for non-Vue modules
export { sendUnifiedMessage as sendMessage }
