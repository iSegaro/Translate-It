// src/background/handlers/element-selection/handleApplyTranslationToActiveElement.js
import browser from 'webextension-polyfill';
import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';

const errorHandler = new ErrorHandler();

/**
 * Handles the 'applyTranslationToActiveElement' message action.
 * This applies a translation to the currently active element.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - True if sendResponse will be called asynchronously.
 */
export async function handleApplyTranslationToActiveElement(message, sender, sendResponse) {
  console.log('[Handler:applyTranslationToActiveElement] Processing translation application:', message.data);
  
  try {
    const { translatedText, elementId, tabId } = message.data || {};
    const targetTabId = tabId || sender.tab?.id;
    
    if (!translatedText) {
      throw new Error('Translated text is required for element translation');
    }
    
    if (!targetTabId) {
      throw new Error('Tab ID is required for element translation');
    }
    
    // Send message to content script to apply translation
    const response = await browser.tabs.sendMessage(targetTabId, {
      action: 'APPLY_TRANSLATION_TO_ELEMENT',
      data: {
        translatedText,
        elementId,
        timestamp: Date.now()
      }
    });
    
    console.log(`✅ [applyTranslationToActiveElement] Translation applied to element in tab ${targetTabId}`);
    
    sendResponse({ 
      success: true, 
      message: 'Translation applied to active element',
      tabId: targetTabId,
      elementId,
      response
    });
    return true;
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.ELEMENT_SELECTION,
      context: "handleApplyTranslationToActiveElement",
      messageData: message
    });
    sendResponse({ success: false, error: error.message || 'Translation application failed' });
    return false;
  }
}