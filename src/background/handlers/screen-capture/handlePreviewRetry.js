// src/background/handlers/screen-capture/handlePreviewRetry.js
import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';
import { createLogger } from '@/utils/core/logger.js';

const logger = createLogger('Core', 'handlePreviewRetry');

const errorHandler = new ErrorHandler();

/**
 * Handles the 'previewRetry' message action.
 * This processes user request to retry capture.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - True if sendResponse will be called asynchronously.
 */
export async function handlePreviewRetry(message, sender, sendResponse) {
  logger.debug('[Handler:previewRetry] Processing preview retry:', message.data);
  
  try {
    const backgroundService = globalThis.backgroundService;
    
    if (!backgroundService) {
      throw new Error("Background service not initialized.");
    }
    
    const { captureId, retryOptions, tabId } = message.data || {};
    const targetTabId = tabId || sender.tab?.id;
    
    // Handle preview retry via background service
    const retryResult = await backgroundService.retryCapturePreview({
      captureId,
      retryOptions,
      tabId: targetTabId,
      sender
    });
    
    logger.debug(`✅ [previewRetry] Preview retry initiated for tab ${targetTabId}`);
    
    sendResponse({ 
      success: true, 
      message: 'Capture preview retry initiated',
      data: retryResult,
      tabId: targetTabId
    });
    return true;
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.SCREEN_CAPTURE,
      context: "handlePreviewRetry",
      messageData: message
    });
    sendResponse({ success: false, error: error.message || 'Preview retry failed' });
    return false;
  }
}