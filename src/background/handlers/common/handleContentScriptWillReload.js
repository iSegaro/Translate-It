// src/background/handlers/common/handleContentScriptWillReload.js
import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';

const errorHandler = new ErrorHandler();

/**
 * Handles the 'CONTENT_SCRIPT_WILL_RELOAD' message action.
 * This is a notification from content scripts that they are about to reload.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - True if sendResponse will be called asynchronously.
 */
export async function handleContentScriptWillReload(message, sender, sendResponse) {
  console.log('[Handler:CONTENT_SCRIPT_WILL_RELOAD] Processing content script reload notification:', message);
  
  try {
    const tabId = sender.tab?.id;
    const frameId = sender.frameId;
    
    console.log(`🔄 [CONTENT_SCRIPT_WILL_RELOAD] Content script will reload in tab ${tabId}, frame ${frameId}`);
    
    const backgroundService = globalThis.backgroundService;
    if (backgroundService) {
      // Clean up any tab-specific state or listeners
      await backgroundService.cleanupTabState(tabId, frameId);
    }
    
    // Acknowledge the reload notification
    sendResponse({ 
      success: true, 
      message: 'Content script reload acknowledged',
      tabId,
      frameId,
      timestamp: Date.now()
    });
    return true;
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.LIFECYCLE,
      context: "handleContentScriptWillReload",
      messageData: message
    });
    sendResponse({ success: false, error: error.message || 'Content script reload notification failed' });
    return false;
  }
}