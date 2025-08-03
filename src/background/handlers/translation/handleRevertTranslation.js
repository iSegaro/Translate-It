// src/background/handlers/translation/handleRevertTranslation.js
import browser from 'webextension-polyfill';
import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';
import { MessageActions } from '../../../messaging/core/MessageActions.js';

const errorHandler = new ErrorHandler();

/**
 * Handles the 'revertTranslation' message action.
 * This reverts a translation on a webpage to its original text.
 * Supports both Vue-based (new) and legacy (old) translation systems.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - True if sendResponse will be called asynchronously.
 */
export async function handleRevertTranslation(message, sender, sendResponse) {
  console.log('[Handler:revertTranslation] Processing translation revert request:', message.data);
  
  try {
    let targetTabId = message.data?.tabId || sender.tab?.id;
    
    // If no tab ID available (e.g., from sidepanel), get active tab
    if (!targetTabId) {
      console.log('[Handler:revertTranslation] No tab ID in message, getting active tab');
      const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id) {
        targetTabId = activeTab.id;
        console.log('[Handler:revertTranslation] Using active tab ID:', targetTabId);
      } else {
        throw new Error('Unable to determine target tab for translation revert');
      }
    }
    
    // Send revert message to content script - let it decide which system to use
    const contentScriptResponse = await browser.tabs.sendMessage(targetTabId, {
      action: MessageActions.REVERT_SELECT_ELEMENT_MODE,
      context: 'revert-handler',
      messageId: `revert-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
      data: {
        ...message.data,
        fromBackground: true
      }
    });
    
    if (contentScriptResponse?.success) {
      console.log(`✅ [revertTranslation] Translation reverted successfully for tab ${targetTabId}:`, contentScriptResponse);
      
      sendResponse({ 
        success: true, 
        message: contentScriptResponse.message || 'Translation reverted successfully',
        tabId: targetTabId,
        revertedCount: contentScriptResponse.revertedCount || 0,
        system: contentScriptResponse.system || 'unknown'
      });
    } else {
      throw new Error(contentScriptResponse?.error || 'Content script revert failed');
    }
    
    return true;
  } catch (error) {
    console.error('[Handler:revertTranslation] Error:', error);
    
    errorHandler.handle(error, {
      type: ErrorTypes.TRANSLATION,
      context: "handleRevertTranslation",
      messageData: message
    });
    
    sendResponse({ 
      success: false, 
      error: error.message || 'Translation revert failed' 
    });
    return false;
  }
}