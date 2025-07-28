// src/background/handlers/sidepanel/handleOpenSidePanel.js
import browser from 'webextension-polyfill';
import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';

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
  console.log('[Handler:OPEN_SIDE_PANEL] Processing side panel open request:', message.data);
  
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
      // Fallback: open options page in new tab
      await browser.tabs.create({
        url: browser.runtime.getURL('/pages/sidepanel.html'),
        active: true
      });
    }
    
    console.log(`✅ [OPEN_SIDE_PANEL] Side panel opened successfully`);
    
    sendResponse({ 
      success: true, 
      message: 'Side panel opened successfully',
      tabId: targetTabId,
      windowId: targetWindowId
    });
    return true;
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.SIDE_PANEL,
      context: "handleOpenSidePanel",
      messageData: message
    });
    sendResponse({ success: false, error: error.message || 'Side panel opening failed' });
    return false;
  }
}