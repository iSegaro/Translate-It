// src/background/handlers/screen-capture/handleCaptureError.js
import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';

const errorHandler = new ErrorHandler();

/**
 * Handles the 'captureError' message action.
 * This processes capture errors and cleanup.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - True if sendResponse will be called asynchronously.
 */
export async function handleCaptureError(message, sender, sendResponse) {
  console.log('[Handler:captureError] Processing capture error:', message.data);
  
  try {
    const backgroundService = globalThis.backgroundService;
    
    if (!backgroundService) {
      throw new Error("Background service not initialized.");
    }
    
    const { error: captureError, captureId, tabId } = message.data || {};
    const targetTabId = tabId || sender.tab?.id;
    
    // Handle capture error via background service
    await backgroundService.handleCaptureError({
      error: captureError,
      captureId,
      tabId: targetTabId,
      sender
    });
    
    // Log the capture error through error handler
    if (captureError) {
      errorHandler.handle(new Error(captureError), {
        type: ErrorTypes.SCREEN_CAPTURE,
        context: "handleCaptureError-reported",
        messageData: message
      });
    }
    
    console.log(`✅ [captureError] Capture error handled and cleaned up for tab ${targetTabId}`);
    
    sendResponse({ 
      success: true, 
      message: 'Capture error handled successfully',
      tabId: targetTabId
    });
    return true;
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.SCREEN_CAPTURE,
      context: "handleCaptureError",
      messageData: message
    });
    sendResponse({ success: false, error: error.message || 'Capture error handling failed' });
    return false;
  }
}