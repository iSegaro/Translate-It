import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import browser from 'webextension-polyfill';
import ExtensionContextManager from '@/core/extensionContext.js';

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'handleVueBridge');

/**
 * Handle Vue Bridge related messages by forwarding to content scripts
 */
export async function handleVueBridge(message, sender) {
  try {
    logger.debug('Handling Vue Bridge message:', message.action);
    
    const vueBridgeActions = [
      'CREATE_VUE_MICRO_APP',
      'DESTROY_VUE_MICRO_APP', 
      'START_SCREEN_CAPTURE',
      'SHOW_CAPTURE_PREVIEW'
    ];
    
    if (!vueBridgeActions.includes(message.action)) {
      return { success: false, error: 'Unknown Vue Bridge action' };
    }
    
    // Get the tab to send message to (use sender tab if available)
    let tabId = sender?.tab?.id;
    if (!tabId) {
      // Get active tab if sender tab not available
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tabs.length) {
        return { success: false, error: 'No active tab found' };
      }
      tabId = tabs[0].id;
    }
    
    try {
      // Forward the message to the content script
      const response = await browser.tabs.sendMessage(tabId, message);
      return response || { success: true };
    } catch (sendError) {
      // Use centralized context error detection
      if (ExtensionContextManager.isContextError(sendError)) {
        ExtensionContextManager.handleContextError(sendError, 'vue-bridge');
      } else {
        logger.warn('Error sending Vue Bridge message to content script:', sendError);
      }
      return { success: false, error: 'Content script not available' };
    }
  } catch (error) {
    logger.error('Error handling Vue Bridge message:', error);
    return { success: false, error: error.message };
  }
}