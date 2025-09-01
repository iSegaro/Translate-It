// src/background/handlers/screen-capture/handleStartAreaCapture.js
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'handleStartAreaCapture');

const errorHandler = new ErrorHandler();

/**
 * Handles the 'startAreaCapture' message action.
 * This initiates area selection for screen capture.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - True if sendResponse will be called asynchronously.
 */
export async function handleStartAreaCapture(message, sender, sendResponse) {
  logger.debug('[Handler:startAreaCapture] Processing area capture start:', message.data);
  
  try {
    const backgroundService = globalThis.backgroundService;
    
    if (!backgroundService) {
      throw new Error("Background service not initialized.");
    }
    
    const { tabId, autoTranslate = false } = message.data || {};
    const targetTabId = tabId || sender.tab?.id;
    
    if (!targetTabId) {
      throw new Error('Tab ID is required for area capture');
    }
    
    // Start area capture via background service
    const captureResult = await backgroundService.startAreaCapture({
      tabId: targetTabId,
      autoTranslate,
      sender
    });
    
    logger.debug(`✅ [startAreaCapture] Area capture started for tab ${targetTabId}`);
    
    sendResponse({ 
      success: true, 
      message: 'Area capture started successfully',
      data: captureResult,
      tabId: targetTabId
    });
    return true;
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.SCREEN_CAPTURE,
      context: "handleStartAreaCapture",
      messageData: message
    });
    sendResponse({ success: false, error: error.message || 'Area capture start failed' });
    return false;
  }
}