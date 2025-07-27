// src/background/handlers/text-selection/handleGetSelectedText.js
import { getBrowserAPI } from '../../../utils/browser-unified.js';
import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';

const errorHandler = new ErrorHandler();

/**
 * Handles the 'getSelectedText' message action.
 * This retrieves selected text from a tab.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - True if sendResponse will be called asynchronously.
 */
export async function handleGetSelectedText(message, sender, sendResponse) {
  console.log('[Handler:getSelectedText] Processing text selection request:', message.data);
  
  try {
    const Browser = await getBrowserAPI();
    const { tabId } = message.data || {};
    const targetTabId = tabId || sender.tab?.id;
    
    if (!targetTabId) {
      throw new Error('Tab ID is required for text selection');
    }
    
    // Send message to content script to get selected text
    const response = await Browser.tabs.sendMessage(targetTabId, {
      action: 'GET_SELECTED_TEXT',
      data: {
        timestamp: Date.now()
      }
    });
    
    const selectedText = response?.selectedText || '';
    
    console.log(`✅ [getSelectedText] Selected text retrieved from tab ${targetTabId}: "${selectedText.substring(0, 50)}..."`);
    
    sendResponse({ 
      success: true, 
      message: 'Selected text retrieved successfully',
      data: {
        selectedText,
        hasSelection: selectedText.length > 0,
        tabId: targetTabId
      }
    });
    return true;
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.TEXT_SELECTION,
      context: "handleGetSelectedText",
      messageData: message
    });
    sendResponse({ 
      success: false, 
      error: error.message || 'Text selection retrieval failed',
      data: { selectedText: '', hasSelection: false }
    });
    return false;
  }
}