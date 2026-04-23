// src/background/handlers/lifecycle/handleRestartContentScript.js
import browser from 'webextension-polyfill';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { injectContentScriptsForTab } from '@/core/background/handlers/common/contentScriptInjector.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'handleRestartContentScript');

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
  logger.debug('Processing content script restart:', message);
  
  try {
    const tabId = message.tabId || sender.tab?.id;
    
    if (!tabId) {
      throw new Error('No tab ID provided for content script restart');
    }
    
    logger.debug(`Restarting content script for tab ${tabId}`);
    
    // Reinject the top-frame entry plus all current iframe entries in the tab.
    const injectionResult = await injectContentScriptsForTab(tabId);

    // Reinject CSS if needed
    await browser.scripting.insertCSS({
      target: { tabId },
      files: ['translate-it.css']
    });
    
    logger.debug(`Content script restarted successfully for tab ${tabId}`);
    
    sendResponse({ 
      success: true, 
      message: `Content script restarted for tab ${tabId}`,
      tabId,
      iframeInjectedCount: injectionResult.iframeInjectedCount,
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
