import { setStateForTab } from './selectElementStateManager.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import browser from 'webextension-polyfill';
import { MessageFormat, MessagingContexts } from '@/shared/messaging/core/MessagingCore.js';
// import { generateBackgroundMessageId } from '@/utils/messaging/messageId.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'handleSetSelectElementState');

/**
 * Handle setting select element state for a tab
 */
export async function handleSetSelectElementState(message, sender) {
  const activate = message?.data?.activate === true;
  const tabId = sender?.tab?.id || message?.data?.tabId;
  const frameId = sender?.frameId;

  logger.operation('handleSetSelectElementState called', {
    activate,
    tabId,
    frameId,
    from: sender?.tab?.id ? 'content' : 'internal',
  });

  if (!tabId) {
    return { success: false, error: 'No tabId available' };
  }

  try {
    setStateForTab(tabId, activate);

    // 🆕 BROADCAST STATE CHANGE TO ALL FRAMES IN THE TAB
    // Only broadcast deactivation when it's an explicit deactivation request
    // Don't broadcast when frames are reporting their state after activation
    if (!activate && message?.data?.isExplicitDeactivation) {
      try {
        // Use the same message format as handleActivateSelectElementMode for consistency
        const broadcastMessage = MessageFormat.create(
          MessageActions.DEACTIVATE_SELECT_ELEMENT_MODE,
          {
            mode: 'normal',
            activate: false,
            fromBackground: true,
            // This is an explicit deactivation request (e.g., user clicked deactivate)
            isExplicitDeactivation: true
          },
          MessagingContexts.CONTENT
        );

        // Send to all frames in the tab
        await browser.tabs.sendMessage(tabId, broadcastMessage);
        logger.operation('Broadcasted explicit deactivation to all frames in tab:', { tabId });
      } catch (broadcastError) {
        logger.warn('Failed to broadcast deactivation to tab frames:', broadcastError);
      }
    }

    return { success: true, tabId, active: activate };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
}