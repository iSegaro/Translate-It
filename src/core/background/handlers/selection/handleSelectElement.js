import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import browser from 'webextension-polyfill';

const logger = getScopedLogger(LOG_COMPONENTS.SELECTION, 'handleSelectElement');

/**
 * Handle select element related messages by forwarding to content scripts
 */
export async function handleSelectElement(message, sender) {
  try {
    logger.debug('Handling select element message:', message.action);
    
    const selectElementActions = [
      MessageActions.ACTIVATE_SELECT_ELEMENT_MODE,
      MessageActions.SET_SELECT_ELEMENT_STATE,
      MessageActions.GET_SELECT_ELEMENT_STATE,
      MessageActions.CANCEL_SELECT_ELEMENT_TRANSLATION
    ];
    
    if (!selectElementActions.includes(message.action)) {
      return { success: false, error: 'Unknown select element action' };
    }
    
    // Get the active tab
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) {
      return { success: false, error: 'No active tab found' };
    }
    
    const tab = tabs[0];
    
    try {
      // Forward the message to the content script
      const response = await browser.tabs.sendMessage(tab.id, message);
      return response || { success: true };
    } catch (error) {
      logger.error('Error sending message to content script:', error);
      return { success: false, error: 'Content script not available' };
    }
  } catch (error) {
    logger.error('Error handling select element message:', error);
    return { success: false, error: error.message };
  }
}