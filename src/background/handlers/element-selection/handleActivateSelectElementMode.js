// src/background/handlers/element-selection/handleActivateSelectElementMode.js
import browser from 'webextension-polyfill';
import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';

const errorHandler = new ErrorHandler();

/**
 * Handles the 'activateSelectElementMode' message action.
 * This activates element selection mode in a specific tab.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - True if sendResponse will be called asynchronously.
 */
export async function handleActivateSelectElementMode(message, sender, sendResponse) {
  console.log('[Handler:activateSelectElementMode] Processing element selection activation:', message.data);
  
  try {
    const { tabId } = message.data || {};
    const targetTabId = tabId || sender.tab?.id;
    
    if (!targetTabId) {
      throw new Error('Tab ID is required for element selection mode');
    }
    
    // Send message to content script to activate selection mode
    const response = await browser.tabs.sendMessage(targetTabId, {
      action: 'ACTIVATE_ELEMENT_SELECTION',
      data: {
        mode: 'select',
        timestamp: Date.now()
      }
    });
    
    console.log(`✅ [activateSelectElementMode] Element selection mode activated in tab ${targetTabId}`);
    
    sendResponse({ 
      success: true, 
      message: 'Element selection mode activated',
      tabId: targetTabId,
      response
    });
    return true;
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.ELEMENT_SELECTION,
      context: "handleActivateSelectElementMode",
      messageData: message
    });
    sendResponse({ success: false, error: error.message || 'Element selection activation failed' });
    return false;
  }
}