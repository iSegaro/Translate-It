import { setStateForTab } from './selectElementStateManager.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import browser from 'webextension-polyfill';
import { MessageFormat, MessagingContexts } from '@/shared/messaging/core/MessagingCore.js';
import { generateBackgroundMessageId } from '@/utils/messaging/messageId.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'handleSetSelectElementState');

/**
 * Handle setting select element state for a tab
 */
export async function handleSetSelectElementState(message, sender) {
  const activate = message?.data?.activate === true;
  const tabId = sender?.tab?.id || message?.data?.tabId;

  logger.operation('handleSetSelectElementState called', {
    activate,
    tabId,
    from: sender?.tab?.id ? 'content' : 'internal',
  });

  if (!tabId) {
    return { success: false, error: 'No tabId available' };
  }

  try {
    setStateForTab(tabId, activate);

    // 🆕 BROADCAST STATE CHANGE TO ALL FRAMES IN THE TAB
    // This ensures all SelectElementManager instances are synchronized
    if (!activate) { // Only broadcast deactivation to prevent activation loops
      try {
        // Use the same message format as handleActivateSelectElementMode for consistency
        const broadcastMessage = MessageFormat.create(
          MessageActions.DEACTIVATE_SELECT_ELEMENT_MODE,
          {
            mode: 'normal',
            activate: false,
            fromBackground: true
          },
          MessagingContexts.CONTENT
        );
        
        // Send to main frame and all iframe content scripts
        await browser.tabs.sendMessage(tabId, broadcastMessage);
        logger.operation('Broadcasted deactivation to all frames in tab:', { tabId, activate });
      } catch (broadcastError) {
        logger.warn('Failed to broadcast deactivation to tab frames:', broadcastError);
      }
    }

    return { success: true, tabId, active: activate };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
}