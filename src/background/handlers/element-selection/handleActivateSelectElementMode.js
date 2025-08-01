// src/background/handlers/element-selection/handleActivateSelectElementMode.js
import browser from 'webextension-polyfill';
import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';
import { MessageFormat, MessagingContexts } from '../../../core/MessagingStandards.js';
import { MessageActions } from '../../../core/MessageActions.js';

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
    // Determine if activating or deactivating based on message.data
    let isActivating;
    let modeForContentScript = 'normal';

    console.log(`[Handler:activateSelectElementMode] Message data: ${JSON.stringify(message, null, 2)}`);

    if (typeof message.data === 'boolean') {
      isActivating = message.data;
      modeForContentScript = isActivating ? 'select' : 'normal';
    } else if (typeof message === 'object' && message.action === MessageActions.ACTIVATE_SELECT_ELEMENT_MODE) {
      isActivating = true;
      modeForContentScript = 'select';
    } else if (typeof message === 'object' && message.action === MessageActions.DEACTIVATE_SELECT_ELEMENT_MODE) {
      isActivating = false;
      modeForContentScript = 'normal';
    // } else if (typeof message.data === 'string') {
    //   isActivating = (message.data !== 'deactivate' && message.data !== 'normal');
    //   modeForContentScript = message.data; // Use the string as mode (e.g., 'translate')
    // } else if (typeof message.data === 'object' && message.data !== null) {
    //   isActivating = message.data.activate === true || message.data.mode === 'select' || message.data.mode === MessageActions.TRANSLATE;
    //   modeForContentScript = message.data.mode || (isActivating ? 'select' : 'normal');
    } else {
      isActivating = false; // Default to deactivating if data is unclear
    }

    const action = isActivating ? MessageActions.ACTIVATE_SELECT_ELEMENT_MODE : MessageActions.DEACTIVATE_SELECT_ELEMENT_MODE;
    
    console.log(`[Handler:activateSelectElementMode] Sending ${action} to tab ${targetTabId} with mode: ${modeForContentScript}`);
    
    const contentMessage = MessageFormat.create(
      action,
      {
        mode: modeForContentScript,
        activate: isActivating,
      },
      MessagingContexts.CONTENT // Context for content script
    );

    const response = await browser.tabs.sendMessage(targetTabId, contentMessage);
    
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