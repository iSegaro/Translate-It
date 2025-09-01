// src/background/handlers/screen-capture/handleResultClosed.js
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'handleResultClosed');

const errorHandler = new ErrorHandler();

/**
 * Handles the 'resultClosed' message action.
 * This processes closing of capture result UI.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - True if sendResponse will be called asynchronously.
 */
export async function handleResultClosed(message, sender, sendResponse) {
  logger.debug('[Handler:resultClosed] Processing result close:', message.data);
  
  try {
    const backgroundService = globalThis.backgroundService;
    
    if (!backgroundService) {
      throw new Error("Background service not initialized.");
    }
    
    const { resultId, tabId } = message.data || {};
    const targetTabId = tabId || sender.tab?.id;
    
    // Handle result closure via background service
    await backgroundService.handleCaptureResultClosed({
      resultId,
      tabId: targetTabId,
      sender
    });
    
    logger.debug(`✅ [resultClosed] Capture result closed and cleaned up for tab ${targetTabId}`);
    
    sendResponse({ 
      success: true, 
      message: 'Capture result closed successfully',
      tabId: targetTabId
    });
    return true;
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.SCREEN_CAPTURE,
      context: "handleResultClosed",
      messageData: message
    });
    sendResponse({ success: false, error: error.message || 'Result closure failed' });
    return false;
  }
}