import browser from 'webextension-polyfill';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { MessagingContexts, MessageFormat } from '@/shared/messaging/core/MessagingCore.js';
// import { tabPermissionChecker } from '@/core/tabPermissions.js';

// In-memory per-tab select element state
const selectElementStateByTab = new Map();

function setStateForTab(tabId, active) {
  if (!tabId) return;
  selectElementStateByTab.set(tabId, { active: !!active, updatedAt: Date.now() });

  // Notify all parts of the extension about the state change
  (async () => {
    try {
      const message = MessageFormat.create(
        MessageActions.SELECT_ELEMENT_STATE_CHANGED,
        { tabId, active },
        MessagingContexts.BACKGROUND
      );
      // Use runtime.sendMessage to broadcast to all parts of the extension (sidepanel, content scripts, etc.)
      await browser.runtime.sendMessage(message);
        } catch {
      // Ignore errors if no listeners are available
    }
  })();
}

function getStateForTab(tabId) {
  if (!tabId) return { active: false };
  const entry = selectElementStateByTab.get(tabId);
  return { active: !!(entry && entry.active), updatedAt: entry?.updatedAt };
}

function clearStateForTab(tabId) {
  if (!tabId) return;
  selectElementStateByTab.delete(tabId);
}

// Track last active tab so we can deactivate select-mode when the user switches
let _lastActiveTabId = null;

try {
  if (browser && browser.tabs) {
    // Keep track of tab removal
    if (browser.tabs.onRemoved) {
      browser.tabs.onRemoved.addListener((tabId) => {
        clearStateForTab(tabId);
        if (_lastActiveTabId === tabId) _lastActiveTabId = null;
      });
    }

    // When the active tab changes, update the last active tab ID
    if (browser.tabs.onActivated) {
      browser.tabs.onActivated.addListener((activeInfo) => {
        _lastActiveTabId = activeInfo.tabId;
      });
    }

    // Window focus changes no longer deactivate Select Element mode
  }
} catch {
  // ignore in environments without tabs/windows
}

export { setStateForTab, getStateForTab, clearStateForTab };
