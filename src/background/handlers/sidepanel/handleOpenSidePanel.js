// src/background/handlers/sidepanel/handleOpenSidePanel.js
import browser from 'webextension-polyfill';
import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'handleOpenSidePanel');

const errorHandler = new ErrorHandler();

/**
 * Handles the 'OPEN_SIDE_PANEL' message action.
 * This opens the browser side panel for the extension.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - True if sendResponse will be called asynchronously.
 */
export async function handleOpenSidePanel(message, sender, sendResponse) {
  logger.debug('[Handler:OPEN_SIDE_PANEL] Processing side panel open request:', message.data);
  
  try {
    const { tabId, windowId } = message.data || {};
    const targetTabId = tabId || sender.tab?.id;
    const targetWindowId = windowId || sender.tab?.windowId;
    
    // Check if sidePanel API is available (Chrome)
    if (browser.sidePanel) {
      // Use Chrome's native side panel
      if (targetTabId) {
        await browser.sidePanel.open({ tabId: targetTabId });
      } else if (targetWindowId) {
        await browser.sidePanel.open({ windowId: targetWindowId });
      } else {
        await browser.sidePanel.open({});
      }
    } else if (browser.sidebarAction) {
      // Use Firefox's sidebar action
      await browser.sidebarAction.open();
    } else {
      // Fallback: open sidepanel page in new tab
      await browser.tabs.create({
        url: browser.runtime.getURL('/html/sidepanel.html'),
        active: true
      });
    }
    
    logger.debug(`✅ [OPEN_SIDE_PANEL] Side panel opened successfully`);
    
    sendResponse({ 
      success: true, 
      message: 'Side panel opened successfully',
      tabId: targetTabId,
      windowId: targetWindowId
    });
    return true;
  } catch (error) {
    logger.error('[Handler:OPEN_SIDE_PANEL] Side panel opening failed:', error);
    errorHandler.handle(error, {
      type: ErrorTypes.UI,
      context: "handleOpenSidePanel",
      messageData: message
    });
    sendResponse({ success: false, error: error.message || 'Side panel opening failed' });
    return false;
  }
}