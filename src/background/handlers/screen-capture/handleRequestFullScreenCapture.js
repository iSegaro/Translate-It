// src/background/handlers/screen-capture/handleRequestFullScreenCapture.js
import browser from 'webextension-polyfill';
import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';

const errorHandler = new ErrorHandler();

/**
 * Handles the 'requestFullScreenCapture' message action.
 * This requests permission and initiates full screen capture.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - True if sendResponse will be called asynchronously.
 */
export async function handleRequestFullScreenCapture(message, sender, sendResponse) {
  console.log('[Handler:requestFullScreenCapture] Processing full screen capture request:', message.data);
  
  try {
    const backgroundService = globalThis.backgroundService;
    
    if (!backgroundService) {
      throw new Error("Background service not initialized.");
    }
    
    const { tabId } = message.data || {};
    const targetTabId = tabId || sender.tab?.id;
    
    if (!targetTabId) {
      throw new Error('Tab ID is required for screen capture request');
    }
    
    // Request capture permissions first
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { mediaSource: 'screen' },
        audio: false
      });
    } catch (permissionError) {
      throw new Error('Screen capture permission denied by user');
    }
    
    // Process the capture via background service
    const captureResult = await backgroundService.processScreenCapture({
      stream,
      tabId: targetTabId,
      sender
    });
    
    // Clean up the stream
    stream.getTracks().forEach(track => track.stop());
    
    console.log(`✅ [requestFullScreenCapture] Screen capture completed for tab ${targetTabId}`);
    
    sendResponse({ 
      success: true, 
      message: 'Screen capture completed successfully',
      data: captureResult,
      tabId: targetTabId
    });
    return true;
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.SCREEN_CAPTURE,
      context: "handleRequestFullScreenCapture",
      messageData: message
    });
    sendResponse({ success: false, error: error.message || 'Screen capture request failed' });
    return false;
  }
}