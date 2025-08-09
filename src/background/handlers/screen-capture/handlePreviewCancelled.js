// src/background/handlers/screen-capture/handlePreviewCancelled.js
import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';
import { createLogger } from '@/utils/core/logger.js';

const logger = createLogger('Core', 'handlePreviewCancelled');

const errorHandler = new ErrorHandler();

/**
 * Handles the 'previewCancelled' message action.
 * This processes user cancellation of capture preview.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - True if sendResponse will be called asynchronously.
 */
export async function handlePreviewCancelled(message, sender, sendResponse) {
  logger.debug('[Handler:previewCancelled] Processing preview cancellation:', message.data);
  
  try {
    const backgroundService = globalThis.backgroundService;
    
    if (!backgroundService) {
      throw new Error("Background service not initialized.");
    }
    
    const { captureId, tabId } = message.data || {};
    const targetTabId = tabId || sender.tab?.id;
    
    // Handle preview cancellation via background service
    await backgroundService.handleCapturePreviewCancelled({
      captureId,
      tabId: targetTabId,
      sender
    });
    
    logger.debug(`✅ [previewCancelled] Preview cancelled and cleaned up for tab ${targetTabId}`);
    
    sendResponse({ 
      success: true, 
      message: 'Capture preview cancelled successfully',
      tabId: targetTabId
    });
    return true;
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.SCREEN_CAPTURE,
      context: "handlePreviewCancelled",
      messageData: message
    });
    sendResponse({ success: false, error: error.message || 'Preview cancellation failed' });
    return false;
  }
}