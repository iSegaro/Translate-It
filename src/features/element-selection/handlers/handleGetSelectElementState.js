import { getStateForTab } from './selectElementStateManager.js';
import browser from 'webextension-polyfill';

/**
 * Handle getting select element state for a tab
 * For Content-originated requests, sender.tab.id is authoritative.
 * For trusted extension/internal requests without sender tab, explicit data.tabId is allowed.
 */
export async function handleGetSelectElementState(message, sender) {
  const senderTabId = sender?.tab?.id;
  const payloadTabId = message?.data?.tabId;
  let tabId = null;

  if (Number.isInteger(senderTabId)) {
    tabId = senderTabId;
  } else if (Number.isInteger(payloadTabId)) {
    tabId = payloadTabId;
  }

  if (!tabId) {
    // Fallback: try to query active tab
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs.length) tabId = tabs[0].id;
    } catch {
      // ignore
    }
  }

  if (!tabId) {
    return { success: false, error: 'Could not determine tabId' };
  }

  const state = getStateForTab(tabId);
  return { success: true, tabId, active: !!state.active, updatedAt: state.updatedAt };
}
