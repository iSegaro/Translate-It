// src/background/handlers/translation/handleRevertTranslation.js
import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';

const errorHandler = new ErrorHandler();

/**
 * Handles the 'revertTranslation' message action.
 * This reverts a translation on a webpage to its original text.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - True if sendResponse will be called asynchronously.
 */
export async function handleRevertTranslation(message, sender, sendResponse) {
  console.log('[Handler:revertTranslation] Processing translation revert request:', message.data);
  
  try {
    const backgroundService = globalThis.backgroundService;
    if (!backgroundService) {
      throw new Error("Background service not initialized.");
    }
    
    const { elementId, tabId } = message.data || {};
    const targetTabId = tabId || sender.tab?.id;
    
    if (!targetTabId) {
      throw new Error('Tab ID is required for translation revert');
    }
    
    // Handle translation revert via background service
    await backgroundService.revertTranslation({
      elementId,
      tabId: targetTabId
    });
    
    console.log(`✅ [revertTranslation] Translation reverted successfully for tab ${targetTabId}`);
    
    sendResponse({ 
      success: true, 
      message: 'Translation reverted successfully',
      tabId: targetTabId,
      elementId
    });
    return true;
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.TRANSLATION,
      context: "handleRevertTranslation",
      messageData: message
    });
    sendResponse({ success: false, error: error.message || 'Translation revert failed' });
    return false;
  }
}