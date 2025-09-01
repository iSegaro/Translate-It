import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import { getScopedLogger } from "@/utils/core/logger.js";
import { LOG_COMPONENTS } from "@/utils/core/logConstants.js";

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'triggerSidebarFromContent');

/**
 * Handle sidebar trigger from content script
 * This is used specifically for Firefox which requires proper user gesture context
 * @param {Object} message - The message object
 * @param {MessageSender} sender - The message sender
 * @param {Function} sendResponse - Response callback
 */
export const handleTriggerSidebarFromContent = async (message, sender, sendResponse) => {
  logger.debug(`[TRIGGER_SIDEBAR_FROM_CONTENT] Processing request from tab: ${sender.tab?.id}`);
  
  try {
    if (browser.sidebarAction) {
      // Firefox: Open sidebar directly - this should work in background context
      await browser.sidebarAction.open();
      logger.debug(`✅ [TRIGGER_SIDEBAR_FROM_CONTENT] Firefox sidebar opened successfully`);
    } else if (browser.sidePanel && sender.tab?.id) {
      // Chrome fallback: open side panel for specific tab
      await browser.sidePanel.open({ tabId: sender.tab.id });
      logger.debug(`✅ [TRIGGER_SIDEBAR_FROM_CONTENT] Chrome sidePanel opened successfully`);
    } else {
      throw new Error('No suitable sidebar API available');
    }
    
    sendResponse({ 
      success: true,
      timestamp: Date.now()
    });
    
  } catch (error) {
    logger.error(`❌ [TRIGGER_SIDEBAR_FROM_CONTENT] Error opening sidebar:`, error);
    
    sendResponse({ 
      success: false, 
      error: error.message,
      timestamp: Date.now()
    });
  }
  
  return true; // Keep message channel open for async response
};

// Export metadata for auto-registration
export const triggerSidebarFromContentHandler = {
  action: MessageActions.TRIGGER_SIDEBAR_FROM_CONTENT,
  handler: handleTriggerSidebarFromContent,
  description: "Trigger sidebar opening from content script context",
  context: ["background"]
};
