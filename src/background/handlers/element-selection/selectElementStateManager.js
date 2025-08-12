import browser from 'webextension-polyfill';
import { MessageActions } from '@/messaging/core/MessageActions.js';
import { MessagingContexts, MessageFormat } from '@/messaging/core/MessagingCore.js';
import { generateBackgroundMessageId } from '@/utils/messaging/messageId.js';

// In-memory per-tab select element state
const selectElementStateByTab = new Map();

function setStateForTab(tabId, active) {
  if (!tabId) return;
  selectElementStateByTab.set(tabId, { active: !!active, updatedAt: Date.now() });

  // Notify interested parties via runtime message (background -> tabs)
  try {
    // Broadcast state change using standardized message envelope so receivers can validate
    const message = MessageFormat.create(
      MessageActions.SELECT_ELEMENT_STATE_CHANGED,
      { tabId, active },
      MessagingContexts.BACKGROUND
    );
    browser.runtime.sendMessage(message).catch(() => {});
  } catch {
    // ignore
  }
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

    // When the active tab changes, deactivate select mode for the previously active tab
    if (browser.tabs.onActivated) {
      browser.tabs.onActivated.addListener(async (activeInfo) => {
        try {
          const newTabId = activeInfo.tabId;
          // If previous tab had active select mode, deactivate it
          if (_lastActiveTabId && _lastActiveTabId !== newTabId) {
            const prevState = selectElementStateByTab.get(_lastActiveTabId);
            if (prevState && prevState.active) {
              // notify content script in that tab to deactivate
              try {
                const message = MessageFormat.create(
                  MessageActions.DEACTIVATE_SELECT_ELEMENT_MODE,
                  {},
                  MessagingContexts.BACKGROUND
                );
                await browser.tabs.sendMessage(_lastActiveTabId, message);
              } catch (e) {
                // ignore if sendMessage fails
              }
              // clear in-memory state
              setStateForTab(_lastActiveTabId, false);
            }
          }
        } catch {
          // ignore
        } finally {
          _lastActiveTabId = activeInfo.tabId;
        }
      });
    }

    // When window focus changes, only clear active selections when the window truly lost focus
    // (windowId === -1) to avoid deactivating when the user interacts with extension UI
    if (browser.windows && browser.windows.onFocusChanged) {
      browser.windows.onFocusChanged.addListener(async (windowId) => {
        try {
          // Only deactivate when there is no focused window (user switched away from browser)
          if (windowId === -1) {
            for (const [tabId, state] of selectElementStateByTab.entries()) {
              if (state && state.active) {
                try {
                  const message = MessageFormat.create(
                    MessageActions.DEACTIVATE_SELECT_ELEMENT_MODE,
                    {},
                    MessagingContexts.BACKGROUND
                  );
                  await browser.tabs.sendMessage(Number(tabId), message);
                } catch {
                  // ignore
                }
                setStateForTab(Number(tabId), false);
              }
            }
          }
        } catch {
          // ignore
        }
      });
    }
  }
} catch {
  // ignore in environments without tabs/windows
}

export { setStateForTab, getStateForTab, clearStateForTab };
