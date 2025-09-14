import { setStateForTab } from './selectElementStateManager.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import browser from 'webextension-polyfill';
import { MessageFormat, MessagingContexts } from '@/shared/messaging/core/MessagingCore.js';
import { generateBackgroundMessageId } from '@/utils/messaging/messageId.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'handleDeactivateSelectElementMode');

/**
 * Handle deactivate select element mode for a tab
 */
export async function handleDeactivateSelectElementMode(message, sender) {
  const tabId = sender?.tab?.id || message?.data?.tabId;

  logger.operation('handleDeactivateSelectElementMode called', {
    tabId,
    from: sender?.tab?.id ? 'content' : 'internal',
  });

  if (!tabId) {
    return { success: false, error: 'No tabId available' };
  }

  try {
    // Set state to inactive
    setStateForTab(tabId, false);

    // Broadcast deactivation to all frames in the tab
    try {
      const broadcastMessage = MessageFormat.create(
        MessageActions.DEACTIVATE_SELECT_ELEMENT_MODE,
        {
          mode: 'normal',
          activate: false,
          fromBackground: true,
          // Mark this as an explicit deactivation request
          isExplicitDeactivation: true
        },
        MessagingContexts.CONTENT
      );

      // Send to main frame and all iframe content scripts
      await browser.tabs.sendMessage(tabId, broadcastMessage);
      logger.operation('Broadcasted explicit deactivation to all frames in tab:', { tabId });
    } catch (broadcastError) {
      logger.warn('Failed to broadcast deactivation to tab frames:', broadcastError);
    }

    return { success: true, tabId, active: false };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
}