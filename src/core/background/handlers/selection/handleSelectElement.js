import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import browser from 'webextension-polyfill';
import ExtensionContextManager from '@/core/extensionContext.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { getSelectElementActivationErrorMessage } from '@/features/element-selection/utils/activationError.js';

const logger = getScopedLogger(LOG_COMPONENTS.SELECTION, 'handleSelectElement');

/**
 * Handle select element related messages by forwarding to content scripts
 */
export async function handleSelectElement(message) {
  try {
    logger.debug('Handling select element message:', message.action);
    
        
    // Only forward certain actions to content scripts
    // SET_SELECT_ELEMENT_STATE should be handled directly by background
    const forwardActions = [
      MessageActions.ACTIVATE_SELECT_ELEMENT_MODE,
      MessageActions.GET_SELECT_ELEMENT_STATE,
      MessageActions.CANCEL_SELECT_ELEMENT_TRANSLATION
    ];

    if (!forwardActions.includes(message.action)) {
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
      if (message.action === MessageActions.ACTIVATE_SELECT_ELEMENT_MODE && response?.success === false) {
        const safeMessage = await getSelectElementActivationErrorMessage();
        return {
          ...response,
          message: safeMessage,
          error: safeMessage,
          errorType: response.errorType || ErrorTypes.SELECT_ELEMENT,
        };
      }
      return response || { success: true };
    } catch (sendError) {
      // Use centralized context error detection
      if (ExtensionContextManager.isContextError(sendError)) {
        ExtensionContextManager.handleContextError(sendError, 'select-element-handler');
      } else {
        logger.warn('Error sending select element message to content script:', sendError);
      }
      return { success: false, error: 'Content script not available' };
    }
  } catch (error) {
    logger.error('Error handling select element message:', error);
    if (message.action === MessageActions.ACTIVATE_SELECT_ELEMENT_MODE) {
      const safeMessage = await getSelectElementActivationErrorMessage();
      return { success: false, message: safeMessage, error: safeMessage, errorType: ErrorTypes.SELECT_ELEMENT };
    }
    return { success: false, error: error.message };
  }
}
