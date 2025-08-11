import { setStateForTab } from './selectElementStateManager.js';
import { MessageActions } from '@/messaging/core/MessageActions.js';
import browser from 'webextension-polyfill';
import { MessagingContexts } from '@/messaging/core/MessagingCore.js';
import { generateBackgroundMessageId } from '@/utils/messaging/messageId.js';
import { createLogger } from '@/utils/core/logger.js';

const logger = createLogger('Core', 'handleSetSelectElementState');

/**
 * Handle setting select element state for a tab
 */
export async function handleSetSelectElementState(message, sender) {
  const activate = message?.data?.activate === true;
  const tabId = sender?.tab?.id || message?.data?.tabId;

  if (!tabId) {
    return { success: false, error: 'No tabId available' };
  }

  try {
    setStateForTab(tabId, activate);

    // Also instruct the content script in that tab to activate/deactivate immediately
    // Avoid echoing back to the same sender tab (prevents activation/deactivation loops)
    try {
      const action = activate ? MessageActions.ACTIVATE_SELECT_ELEMENT_MODE : MessageActions.DEACTIVATE_SELECT_ELEMENT_MODE;
      const isSameTabAsSender = sender && sender.tab && Number(sender.tab.id) === Number(tabId);
      if (!isSameTabAsSender) {
        // Use standardized message format so listeners can validate context and messageId
        await browser.tabs.sendMessage(Number(tabId), {
          action,
          context: MessagingContexts.BACKGROUND,
          messageId: generateBackgroundMessageId('selectElementMode')
        });
      } else {
        // Skip sending to originating tab to avoid echoing the request back
        logger.debug('[handleSetSelectElementState] Skipping tabs.sendMessage to originating tab to prevent echo', tabId);
      }
    } catch {
      // ignore send errors (tab may not have listener)
    }

    return { success: true, tabId, active: activate };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
}