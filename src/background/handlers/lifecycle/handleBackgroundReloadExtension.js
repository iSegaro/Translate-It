// src/background/handlers/lifecycle/handleBackgroundReloadExtension.js
import { getBrowserAPI } from '../../../utils/browser-unified.js';
import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';

const errorHandler = new ErrorHandler();

/**
 * Handles the 'BACKGROUND_RELOAD_EXTENSION' message action.
 * This triggers a complete extension reload (usually for development purposes).
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - True if sendResponse will be called asynchronously.
 */
export async function handleBackgroundReloadExtension(message, sender, sendResponse) {
  console.log('[Handler:BACKGROUND_RELOAD_EXTENSION] Processing extension reload request:', message);
  
  try {
    const Browser = await getBrowserAPI();
    
    console.warn('🔄 [BACKGROUND_RELOAD_EXTENSION] Triggering complete extension reload');
    
    // Send response before reload to ensure it gets delivered
    sendResponse({ 
      success: true, 
      message: 'Extension reload initiated',
      timestamp: Date.now()
    });
    
    // Small delay to ensure response is sent
    setTimeout(async () => {
      try {
        // Reload the extension runtime
        await Browser.runtime.reload();
      } catch (reloadError) {
        console.error('❌ [BACKGROUND_RELOAD_EXTENSION] Reload failed:', reloadError);
        errorHandler.handle(reloadError, {
          type: ErrorTypes.LIFECYCLE,
          context: "handleBackgroundReloadExtension-reload",
          messageData: message
        });
      }
    }, 100);
    
    return true;
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.LIFECYCLE,
      context: "handleBackgroundReloadExtension",
      messageData: message
    });
    sendResponse({ success: false, error: error.message || 'Extension reload failed' });
    return false;
  }
}