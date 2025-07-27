// src/background/handlers/screen-capture/handleStartFullScreenCapture.js
import { getBrowserAPI } from '../../../utils/browser-unified.js';
import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';

const errorHandler = new ErrorHandler();

/**
 * Handles the 'startFullScreenCapture' message action.
 * This initiates full screen capture.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - True if sendResponse will be called asynchronously.
 */
export async function handleStartFullScreenCapture(message, sender, sendResponse) {
  console.log('[Handler:startFullScreenCapture] Processing full screen capture:', message.data);
  
  try {
    const Browser = await getBrowserAPI();
    const backgroundService = globalThis.backgroundService;
    
    if (!backgroundService) {
      throw new Error("Background service not initialized.");
    }
    
    const { tabId, autoTranslate = false } = message.data || {};
    const targetTabId = tabId || sender.tab?.id;
    
    if (!targetTabId) {
      throw new Error('Tab ID is required for full screen capture');
    }
    
    // Start full screen capture via background service
    const captureResult = await backgroundService.startFullScreenCapture({
      tabId: targetTabId,
      autoTranslate,
      sender
    });
    
    console.log(`✅ [startFullScreenCapture] Full screen capture started for tab ${targetTabId}`);
    
    sendResponse({ 
      success: true, 
      message: 'Full screen capture started successfully',
      data: captureResult,
      tabId: targetTabId
    });
    return true;
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.SCREEN_CAPTURE,
      context: "handleStartFullScreenCapture",
      messageData: message
    });
    sendResponse({ success: false, error: error.message || 'Full screen capture start failed' });
    return false;
  }
}