// src/background/handlers/lifecycle/handleExtensionReloaded.js
import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';

const errorHandler = new ErrorHandler();

/**
 * Handles the 'EXTENSION_RELOADED' message action.
 * This is triggered when the extension has been reloaded and content scripts need to reinitialize.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - True if sendResponse will be called asynchronously.
 */
export async function handleExtensionReloaded(message, sender, sendResponse) {
  console.log('[Handler:EXTENSION_RELOADED] Processing extension reload notification:', message);
  
  try {
    // Log the extension reload
    console.log('🔄 [EXTENSION_RELOADED] Extension has been reloaded, reinitializing systems');
    
    const backgroundService = globalThis.backgroundService;
    if (backgroundService) {
      // Reinitialize any necessary services after reload
      await backgroundService.handleExtensionReload();
      
      // Update any cached data or states
      await backgroundService.refreshContextMenus();
    }
    
    sendResponse({ 
      success: true, 
      message: 'Extension reload handled successfully',
      timestamp: Date.now()
    });
    return true;
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.LIFECYCLE,
      context: "handleExtensionReloaded",
      messageData: message
    });
    sendResponse({ success: false, error: error.message || 'Extension reload handling failed' });
    return false;
  }
}