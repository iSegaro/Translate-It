// src/background/handlers/lifecycle/handleRestartContentScript.js
import browser from 'webextension-polyfill';
import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';

const errorHandler = new ErrorHandler();

/**
 * Handles the 'restart_content_script' message action.
 * This triggers reinjection of content scripts into a specific tab.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - True if sendResponse will be called asynchronously.
 */
export async function handleRestartContentScript(message, sender, sendResponse) {
  console.log('[Handler:restart_content_script] Processing content script restart:', message);
  
  try {
    const tabId = message.tabId || sender.tab?.id;
    
    if (!tabId) {
      throw new Error('No tab ID provided for content script restart');
    }
    
    console.log(`🔄 [restart_content_script] Restarting content script for tab ${tabId}`);
    
    // Execute content script reinjection
    await browser.scripting.executeScript({
      target: { tabId },
      files: ['/content-scripts/main.js'] // Main content script entry point
    });
    
    // Reinject CSS if needed
    await browser.scripting.insertCSS({
      target: { tabId },
      files: ['/styles/content.css']
    });
    
    console.log(`✅ [restart_content_script] Content script restarted successfully for tab ${tabId}`);
    
    sendResponse({ 
      success: true, 
      message: `Content script restarted for tab ${tabId}`,
      tabId 
    });
    return true;
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.LIFECYCLE,
      context: "handleRestartContentScript",
      messageData: message
    });
    sendResponse({ success: false, error: error.message || 'Content script restart failed' });
    return false;
  }
}