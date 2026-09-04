import {
  beginRetainedSessionRecovery,
  clearRetainedSessionRecovery,
  discoverAndReconcileActiveFrames,
  getActivationAttemptToken,
  getActiveSessionRevision,
  getCurrentGeneration,
  getRetainedSessionRecoveryRecord,
  getStateForTab,
  isDeactivationPending,
  isRetainedSessionRecoveryCurrent,
  reconcileStaleOwnershipForRead,
  RETAINED_SESSION_DISCOVERY_TIMEOUT_MS,
  setRetainedSessionRecoveryPromise,
} from './selectElementStateManager.js';
import { handleActivateSelectElementMode } from './handleActivateSelectElementMode.js';
import browser from 'webextension-polyfill';

const RETAINED_SESSION_RECOVERY_TIMEOUT_MS = 350;

async function awaitWithSoftDeadline(promise, deadlineAt) {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) return;
  let timer;
  try {
    await Promise.race([
      promise.catch(() => {}),
      new Promise((resolve) => {
        timer = setTimeout(resolve, remaining);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

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

  let state = getStateForTab(tabId);
  if (state.active) {
    try {
      await reconcileStaleOwnershipForRead(tabId);
      state = getStateForTab(tabId);
    } catch {
      // Fail closed: keep previous active state on reconciliation error
    }
  } else {
    const deadlineAt = Date.now() + RETAINED_SESSION_RECOVERY_TIMEOUT_MS;
    try {
      const existing = getRetainedSessionRecoveryRecord(tabId);
      if (existing?.promise) {
        await awaitWithSoftDeadline(existing.promise, deadlineAt);
        state = getStateForTab(tabId);
      } else {
        const token = beginRetainedSessionRecovery(tabId);
        if (token === null) {
          const raced = getRetainedSessionRecoveryRecord(tabId);
          if (raced?.promise) {
            await awaitWithSoftDeadline(raced.promise, deadlineAt);
          }
          state = getStateForTab(tabId);
        } else {
          const expectedRevision = getActiveSessionRevision(tabId);
          const expectedGeneration = getCurrentGeneration(tabId);

          const recoveryPromise = (async () => {
            const discoveryDeadline = Math.min(deadlineAt, Date.now() + RETAINED_SESSION_DISCOVERY_TIMEOUT_MS);
            const discovery = await discoverAndReconcileActiveFrames(tabId, {
              deadlineAt: discoveryDeadline,
            });
            if (discovery.status !== 'known' || discovery.activeFrames.length === 0) return;
            if (!isRetainedSessionRecoveryCurrent(tabId, token)) return;
            if (getStateForTab(tabId).active !== false) return;
            if (getActiveSessionRevision(tabId) !== expectedRevision) return;
            if (getCurrentGeneration(tabId) !== expectedGeneration) return;
            if (getActivationAttemptToken(tabId) != null) return;
            if (isDeactivationPending(tabId)) return;
            await handleActivateSelectElementMode(
              { data: { tabId, active: true } },
              sender,
              { recoveryToken: token, expectedRevision, expectedGeneration },
            );
          })();

          setRetainedSessionRecoveryPromise(tabId, token, recoveryPromise);
          void recoveryPromise.then(
            () => clearRetainedSessionRecovery(tabId, token),
            () => clearRetainedSessionRecovery(tabId, token),
          );
          await awaitWithSoftDeadline(recoveryPromise, deadlineAt);
          state = getStateForTab(tabId);
        }
      }
    } catch {
      // Fail closed: retained content is not authority until strict re-authorization succeeds.
    }
  }
  return { success: true, tabId, active: !!state.active, updatedAt: state.updatedAt };
}
