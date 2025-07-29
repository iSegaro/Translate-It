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
 * @returns {Promise<Object>} - Promise that resolves with the response object.
 */
export async function handleActivateSelectElementMode(message, sender) {
  console.log('[Handler:activateSelectElementMode] Processing element selection activation:', message.data);
  
  try {
    const { tabId } = message.data || {};
    let targetTabId = tabId || sender.tab?.id;
    
    // If no tabId available (e.g., from sidepanel), get current active tab
    if (!targetTabId) {
      console.log('[Handler:activateSelectElementMode] No tab ID from sender, finding active tab...');
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs.length > 0) {
        targetTabId = tabs[0].id;
        console.log(`[Handler:activateSelectElementMode] Found active tab: ${targetTabId}`);
      }
    }
    
    if (!targetTabId) {
      throw new Error('Could not determine target tab for element selection');
    }
    
    // Send message to content script to activate/deactivate selection mode
    const isActivating = message.data === true || message.data?.activate === true;
    const action = isActivating ? 'ACTIVATE_ELEMENT_SELECTION' : 'DEACTIVATE_ELEMENT_SELECTION';
    
    console.log(`[Handler:activateSelectElementMode] Sending ${action} to tab ${targetTabId}`);
    
    const response = await browser.tabs.sendMessage(targetTabId, {
      action: action,
      data: {
        mode: isActivating ? 'select' : 'normal',
        activate: isActivating,
        timestamp: Date.now()
      }
    });
    
    const statusText = isActivating ? 'activated' : 'deactivated';
    console.log(`✅ [activateSelectElementMode] Element selection mode ${statusText} in tab ${targetTabId}`);
    
    return { 
      success: true, 
      message: `Element selection mode ${statusText}`,
      tabId: targetTabId,
      activated: isActivating,
      response
    };
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.ELEMENT_SELECTION,
      context: "handleActivateSelectElementMode",
      messageData: message
    });
    return { success: false, error: error.message || 'Element selection activation failed' };
  }
}