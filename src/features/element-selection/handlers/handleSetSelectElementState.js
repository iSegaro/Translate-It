import { setStateForTab } from './selectElementStateManager.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import browser from 'webextension-polyfill';
import { MessagingContexts } from '@/shared/messaging/core/MessagingCore.js';
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

  if (!tabId) {
    return { success: false, error: 'No tabId available' };
  }

  try {
    setStateForTab(tabId, activate);

    

    return { success: true, tabId, active: activate };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
}