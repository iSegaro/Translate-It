import browser from "webextension-polyfill";
import { MessageFormat, MessagingContexts } from '../core/MessagingCore.js'
import { MessageActions } from '../core/MessageActions.js'
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
import { sendReliable } from '@/messaging/core/ReliableMessaging.js'
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
   * Send a message using browser.runtime.sendMessage
   * @param {Object} message - Message object (should use MessageFormat.create)
   * @returns {Promise} Response promise
   */
  const sendMessage = async (message) => {
    try {
      // Prefer the reliable messenger which implements retries and port fallback
      return await sendReliable(message);
    } catch (error) {
      logger.error('sendMessage failed via sendReliable:', error);
      // Do not fallback to direct runtime.sendMessage here to avoid duplicating
      // unreliable behavior; surface the error to callers so they can decide.
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
    // Fire-and-forget via reliable messenger
    sendReliable(message).catch(error => {
      // Silently ignore send errors for fire-and-forget
      console.debug(`[useMessaging:${context}] Fire-and-forget failed (reliable):`, error);
    });
  };

  return {
    sendMessage,
    sendReliable,
    createMessage,
    sendFireAndForget,
    
    // Constants for convenience
    MessageActions,
    MessagingContexts,
  }
}

// Export sendReliable for non-Vue modules (already imported at top)
export { sendReliable }
