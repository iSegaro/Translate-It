import { getStateForTab } from './selectElementStateManager.js';
import browser from 'webextension-polyfill';

/**
 * Handle getting select element state for a tab
 */
export async function handleGetSelectElementState(message, sender) {
  const requestedTabId = message?.data?.tabId;
  let tabId = requestedTabId;

  if (!tabId) {
    // Try to find sender.tab or active tab if not provided
    tabId = sender?.tab?.id;
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

