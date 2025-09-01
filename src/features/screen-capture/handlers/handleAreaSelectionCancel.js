// src/background/handlers/screen-capture/handleAreaSelectionCancel.js
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'handleAreaSelectionCancel');

const errorHandler = new ErrorHandler();

/**
 * Handles the 'areaSelectionCancel' message action.
 * This processes cancellation of area selection.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - True if sendResponse will be called asynchronously.
 */
export async function handleAreaSelectionCancel(message, sender, sendResponse) {
  logger.debug('[Handler:areaSelectionCancel] Processing area selection cancellation:', message.data);
  
  try {
    const backgroundService = globalThis.backgroundService;
    
    if (!backgroundService) {
      throw new Error("Background service not initialized.");
    }
    
    const { selectionId, tabId } = message.data || {};
    const targetTabId = tabId || sender.tab?.id;
    
    // Handle area selection cancellation via background service
    await backgroundService.handleAreaSelectionCancel({
      selectionId,
      tabId: targetTabId,
      sender
    });
    
    logger.debug(`✅ [areaSelectionCancel] Area selection cancelled and cleaned up for tab ${targetTabId}`);
    
    sendResponse({ 
      success: true, 
      message: 'Area selection cancelled successfully',
      tabId: targetTabId
    });
    return true;
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.SCREEN_CAPTURE,
      context: "handleAreaSelectionCancel",
      messageData: message
    });
    sendResponse({ success: false, error: error.message || 'Area selection cancellation failed' });
    return false;
  }
}