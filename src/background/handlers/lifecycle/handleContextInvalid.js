// src/background/handlers/lifecycle/handleContextInvalid.js
import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';
import { createLogger } from '@/utils/core/logger.js';

const logger = createLogger('Core', 'handleContextInvalid');

const errorHandler = new ErrorHandler();

/**
 * Handles the 'CONTEXT_INVALID' message action.
 * This is triggered when content scripts detect an invalid extension context.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - True if sendResponse will be called asynchronously.
 */
export async function handleContextInvalid(message, sender, sendResponse) {
  logger.debug('[Handler:CONTEXT_INVALID] Processing context invalid notification:', message);
  
  try {
    // Log the context invalidation
    logger.warn('🔄 [CONTEXT_INVALID] Content script context became invalid, cleanup may be needed');
    
    // Notify that context is invalid and cleanup should occur
    const backgroundService = globalThis.backgroundService;
    if (backgroundService) {
      // Trigger any necessary cleanup for the invalid context
      await backgroundService.handleContextInvalidation(sender.tab?.id);
    }
    
    sendResponse({ 
      success: true, 
      message: 'Context invalidation acknowledged',
      shouldReload: true 
    });
    return true;
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.LIFECYCLE,
      context: "handleContextInvalid",
      messageData: message
    });
    sendResponse({ success: false, error: error.message || 'Context invalidation handling failed' });
    return false;
  }
}