// src/background/handlers/screen-capture/handleProcessAreaCaptureImage.js
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'handleProcessAreaCaptureImage');

const errorHandler = new ErrorHandler();

/**
 * Handles the 'processAreaCaptureImage' message action.
 * This processes the captured image from area selection.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - True if sendResponse will be called asynchronously.
 */
export async function handleProcessAreaCaptureImage(message, sender, sendResponse) {
  logger.debug('[Handler:processAreaCaptureImage] Processing captured image:', message.data);
  
  try {
    const backgroundService = globalThis.backgroundService;
    
    if (!backgroundService) {
      throw new Error("Background service not initialized.");
    }
    
    const { imageData, coordinates, autoTranslate = false, tabId } = message.data || {};
    const targetTabId = tabId || sender.tab?.id;
    
    if (!imageData) {
      throw new Error('Image data is required for processing');
    }
    
    // Process the captured image via background service
    const processResult = await backgroundService.processAreaCaptureImage({
      imageData,
      coordinates,
      autoTranslate,
      tabId: targetTabId,
      sender
    });
    
    logger.debug(`✅ [processAreaCaptureImage] Image processed successfully for tab ${targetTabId}`);
    
    sendResponse({ 
      success: true, 
      message: 'Area capture image processed successfully',
      data: processResult,
      tabId: targetTabId
    });
    return true;
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.SCREEN_CAPTURE,
      context: "handleProcessAreaCaptureImage",
      messageData: message
    });
    sendResponse({ success: false, error: error.message || 'Image processing failed' });
    return false;
  }
}