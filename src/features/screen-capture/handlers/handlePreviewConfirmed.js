// src/background/handlers/screen-capture/handlePreviewConfirmed.js
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'handlePreviewConfirmed');

const errorHandler = new ErrorHandler();

/**
 * Handles the 'previewConfirmed' message action.
 * This processes user confirmation of capture preview.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - True if sendResponse will be called asynchronously.
 */
export async function handlePreviewConfirmed(message, sender, sendResponse) {
  logger.debug('[Handler:previewConfirmed] Processing preview confirmation:', message.data);
  
  try {
    const backgroundService = globalThis.backgroundService;
    
    if (!backgroundService) {
      throw new Error("Background service not initialized.");
    }
    
    const { captureData, tabId } = message.data || {};
    const targetTabId = tabId || sender.tab?.id;
    
    if (!captureData) {
      throw new Error('Capture data is required for preview confirmation');
    }
    
    // Process confirmed preview via background service
    const result = await backgroundService.processCapturePreviewConfirmed({
      captureData,
      tabId: targetTabId,
      sender
    });
    
    logger.debug(`✅ [previewConfirmed] Preview confirmed and processed for tab ${targetTabId}`);
    
    sendResponse({ 
      success: true, 
      message: 'Capture preview confirmed and processed',
      data: result,
      tabId: targetTabId
    });
    return true;
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.SCREEN_CAPTURE,
      context: "handlePreviewConfirmed",
      messageData: message
    });
    sendResponse({ success: false, error: error.message || 'Preview confirmation failed' });
    return false;
  }
}