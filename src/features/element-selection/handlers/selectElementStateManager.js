import browser from 'webextension-polyfill';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { MessagingContexts, MessageFormat } from '@/shared/messaging/core/MessagingCore.js';
// import { tabPermissionChecker } from '@/core/tabPermissions.js';

// In-memory per-tab select element state
const selectElementStateByTab = new Map();
// A new background module instance establishes a new Select Element authority epoch.
const backgroundActivationEpoch = (() => {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    // Fall through to the local opaque fallback.
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
})();
// Each frame keeps its own accepted activation generation.
const selectElementParticipantsByTab = new Map();
// Latest accepted generation; older frame ownership may remain during reactivation.
const currentGenerationByTab = new Map();
const nextActivationGenerationByTab = new Map();
const activationAttemptsByTab = new Map();
const currentActivationAttemptByTab = new Map();
// Legacy activation ACKs cannot establish authority but must remain cleanable.
const compatibilityFramesByTab = new Map();
// Sent activation requests without conclusive settlement remain cleanup debt.
const provisionalCleanupFramesByTab = new Map();

function createActivationGeneration(tabId) {
  if (!Number.isInteger(tabId)) return null;

  // Candidate remains non-authoritative until strict frame ACK registration.
  const generation = Math.max(
    nextActivationGenerationByTab.get(tabId) || 0,
    getCurrentGeneration(tabId) || 0,
  ) + 1;
  nextActivationGenerationByTab.set(tabId, generation);
  const attempt = { generation, token: {}, provisionalFrameIds: new Set() };
  let attempts = activationAttemptsByTab.get(tabId);
  if (!attempts) {
    attempts = new Map();
    activationAttemptsByTab.set(tabId, attempts);
  }
  attempts.set(generation, attempt);
  currentActivationAttemptByTab.set(tabId, attempt);
  return generation;
}

function getCurrentGeneration(tabId) {
  return currentGenerationByTab.get(tabId);
}

function getActivationEpoch() {
  return backgroundActivationEpoch;
}

function getActivationAttemptToken(tabId) {
  return currentActivationAttemptByTab.get(tabId)?.token;
}

function isActivationAttemptCurrent(tabId, generation, token) {
  const attempt = currentActivationAttemptByTab.get(tabId);
  return attempt?.generation === generation && attempt.token === token;
}

function recordActivationAttemptFrames(tabId, generation, frameIds) {
  const attempt = activationAttemptsByTab.get(tabId)?.get(generation);
  if (!attempt || currentActivationAttemptByTab.get(tabId) !== attempt) return false;

  for (const frameId of frameIds || []) {
    if (Number.isInteger(frameId) && frameId >= 0) {
      attempt.provisionalFrameIds.add(frameId);
    }
  }
  return true;
}

function toInvalidatedAttempt(attempt) {
  return {
    generation: attempt.generation,
    frameIds: [...attempt.provisionalFrameIds],
  };
}

function retainProvisionalCleanupFrame(tabId, frameId, generation) {
  if (!Number.isInteger(frameId) || frameId < 0 || !Number.isInteger(generation)) return;
  let frames = provisionalCleanupFramesByTab.get(tabId);
  if (!frames) {
    frames = new Map();
    provisionalCleanupFramesByTab.set(tabId, frames);
  }
  let generations = frames.get(frameId);
  if (!generations) {
    generations = new Set();
    frames.set(frameId, generations);
  }
  generations.add(generation);
}

function retainAttemptProvisionalFrames(tabId, attempt) {
  for (const frameId of attempt.provisionalFrameIds) {
    retainProvisionalCleanupFrame(tabId, frameId, attempt.generation);
  }
}

function settleActivationAttemptFrame(tabId, generation, frameId) {
  activationAttemptsByTab.get(tabId)?.get(generation)?.provisionalFrameIds.delete(frameId);
  removeProvisionalCleanupFrame(tabId, frameId, generation);
}

function getProvisionalCleanupFrames(tabId) {
  return [...(provisionalCleanupFramesByTab.get(tabId) || [])].flatMap(([frameId, generations]) => (
    [...generations].map(generation => ({ frameId, generation }))
  ));
}

function removeProvisionalCleanupFrame(tabId, frameId, generation) {
  const frames = provisionalCleanupFramesByTab.get(tabId);
  const generations = frames?.get(frameId);
  if (!generations?.delete(generation)) return false;
  if (generations.size === 0) frames.delete(frameId);
  if (frames.size === 0) provisionalCleanupFramesByTab.delete(tabId);
  return true;
}

function removeProvisionalCleanupFramesForFrame(tabId, frameId) {
  const frames = provisionalCleanupFramesByTab.get(tabId);
  if (!frames?.delete(frameId)) return false;
  if (frames.size === 0) provisionalCleanupFramesByTab.delete(tabId);
  return true;
}

function clearProvisionalCleanupFrames(tabId) {
  provisionalCleanupFramesByTab.delete(tabId);
}

function invalidateOlderActivationAttempts(tabId, generation) {
  const attempts = activationAttemptsByTab.get(tabId);
  if (!attempts) return [];

  const invalidated = [];
  for (const [attemptGeneration, attempt] of attempts) {
    if (attemptGeneration < generation) {
      invalidated.push(toInvalidatedAttempt(attempt));
      retainAttemptProvisionalFrames(tabId, attempt);
      attempts.delete(attemptGeneration);
    }
  }
  if (attempts.size === 0) activationAttemptsByTab.delete(tabId);
  return invalidated;
}

function invalidateActivationAttempts(tabId) {
  const attempts = activationAttemptsByTab.get(tabId);
  const invalidated = attempts ? [...attempts.values()].map(attempt => {
    retainAttemptProvisionalFrames(tabId, attempt);
    return toInvalidatedAttempt(attempt);
  }) : [];
  activationAttemptsByTab.delete(tabId);
  currentActivationAttemptByTab.delete(tabId);
  return invalidated;
}

function completeActivationAttempt(tabId, generation, token) {
  const attempts = activationAttemptsByTab.get(tabId);
  const attempt = attempts?.get(generation);
  if (!attempt || attempt.token !== token) return false;

  retainAttemptProvisionalFrames(tabId, attempt);
  attempts.delete(generation);
  if (currentActivationAttemptByTab.get(tabId) === attempt) {
    currentActivationAttemptByTab.delete(tabId);
  }
  if (attempts.size === 0) activationAttemptsByTab.delete(tabId);
  return true;
}

function retainCompatibilityFrames(tabId, generation, frameIds) {
  let frames = compatibilityFramesByTab.get(tabId);
  if (!frames) {
    frames = new Map();
    compatibilityFramesByTab.set(tabId, frames);
  }
  const participants = selectElementParticipantsByTab.get(tabId);
  for (const frameId of frameIds || []) {
    if (Number.isInteger(frameId) && frameId >= 0) {
      if (participants?.has(frameId)) continue;
      frames.set(frameId, generation);
      removeProvisionalCleanupFrame(tabId, frameId, generation);
    }
  }
}

function getCompatibilityFrames(tabId) {
  return new Map(compatibilityFramesByTab.get(tabId) || []);
}

function removeCompatibilityFrame(tabId, frameId) {
  const frames = compatibilityFramesByTab.get(tabId);
  if (!frames?.delete(frameId)) return false;
  if (frames.size === 0) compatibilityFramesByTab.delete(tabId);
  return true;
}

function clearCompatibilityFrames(tabId) {
  compatibilityFramesByTab.delete(tabId);
}

async function compensateInvalidatedActivationAttempts(tabId, invalidatedAttempts = []) {
  if (!browser.tabs?.sendMessage) return [];

  const requests = new Map();
  for (const attempt of invalidatedAttempts) {
    for (const frameId of attempt.frameIds || []) {
      requests.set(`${frameId}:${attempt.generation}`, {
        frameId,
        generation: attempt.generation,
      });
    }
  }

  return Promise.all([...requests.values()].map(async ({ frameId, generation }) => {
    try {
      const response = await Promise.resolve().then(() => browser.tabs.sendMessage(
        tabId,
        MessageFormat.create(
          MessageActions.DEACTIVATE_SELECT_ELEMENT_MODE,
          {
            mode: 'normal',
            active: false,
            fromBackground: true,
            activationEpoch: backgroundActivationEpoch,
            activationGeneration: generation,
            isExplicitDeactivation: true,
          },
          MessagingContexts.CONTENT,
        ),
        { frameId },
      ));
      const settled = response?.success === true
        && response?.cleanupCompleted === true
        && response?.activated === false;
      if (settled) removeProvisionalCleanupFrame(tabId, frameId, generation);
      return {
        generation,
        frameId,
        settled,
        response,
      };
    } catch (error) {
      return { generation, frameId, settled: false, error };
    }
  }));
}

function registerParticipant(tabId, frameId, generation) {
  if (
    !Number.isInteger(tabId)
    || !Number.isInteger(frameId)
    || frameId < 0
    || !Number.isInteger(generation)
  ) {
    return false;
  }
  if (!isActivationAttemptCurrent(tabId, generation, getActivationAttemptToken(tabId))) {
    return false;
  }

  let participants = selectElementParticipantsByTab.get(tabId);
  const currentGeneration = getCurrentGeneration(tabId);
  if (!participants) {
    participants = new Map();
    selectElementParticipantsByTab.set(tabId, participants);
  }

  if (currentGeneration === undefined || generation > currentGeneration) {
    nextActivationGenerationByTab.set(
      tabId,
      Math.max(nextActivationGenerationByTab.get(tabId) || 0, generation),
    );
    currentGenerationByTab.set(tabId, generation);
  } else if (currentGeneration !== generation) {
    return false;
  }

  participants.set(frameId, generation);
  removeCompatibilityFrame(tabId, frameId);
  removeProvisionalCleanupFramesForFrame(tabId, frameId);
  return true;
}

function removeParticipant(tabId, frameId, generation) {
  const participants = selectElementParticipantsByTab.get(tabId);
  if (!participants || !participants.has(frameId)) return false;
  if (
    !Number.isInteger(generation)
    || participants.get(frameId) !== generation
  ) {
    return false;
  }

  participants.delete(frameId);
  return true;
}

function getParticipants(tabId) {
  return new Map(selectElementParticipantsByTab.get(tabId) || []);
}

function clearParticipants(tabId) {
  selectElementParticipantsByTab.get(tabId)?.clear();
}

function clearTabParticipants(tabId) {
  selectElementParticipantsByTab.delete(tabId);
  currentGenerationByTab.delete(tabId);
  nextActivationGenerationByTab.delete(tabId);
  invalidateActivationAttempts(tabId);
  clearCompatibilityFrames(tabId);
  clearProvisionalCleanupFrames(tabId);
}

function retireFrameCleanupOwnership(tabId, frameId) {
  for (const attempt of activationAttemptsByTab.get(tabId)?.values() || []) {
    attempt.provisionalFrameIds.delete(frameId);
  }
  removeCompatibilityFrame(tabId, frameId);
  removeProvisionalCleanupFramesForFrame(tabId, frameId);
}

function setStateForTab(tabId, active) {
  if (!tabId) return;
  const canonicalActive = active === true;
  const currentState = selectElementStateByTab.get(tabId);
  if (currentState?.active === canonicalActive) return;

  selectElementStateByTab.set(tabId, { active: canonicalActive, updatedAt: Date.now() });

  // Notify all parts of the extension about the state change
  (async () => {
    try {
      const message = MessageFormat.create(
        MessageActions.SELECT_ELEMENT_STATE_CHANGED,
        { tabId, active: canonicalActive },
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
        clearTabParticipants(tabId);
        if (_lastActiveTabId === tabId) _lastActiveTabId = null;
      });
    }

    // When the active tab changes, update the last active tab ID
    if (browser.tabs.onActivated) {
      browser.tabs.onActivated.addListener((activeInfo) => {
        _lastActiveTabId = activeInfo.tabId;
      });
    }

    if (browser.webNavigation?.onCommitted) {
      browser.webNavigation.onCommitted.addListener(({ tabId, frameId }) => {
        if (!Number.isInteger(tabId) || !Number.isInteger(frameId)) return;

        retireFrameCleanupOwnership(tabId, frameId);
        const invalidatedAttempts = invalidateActivationAttempts(tabId);
        if (frameId === 0) {
          clearCompatibilityFrames(tabId);
          clearProvisionalCleanupFrames(tabId);
        } else {
          void compensateInvalidatedActivationAttempts(tabId, invalidatedAttempts);
        }
        // onCommitted has no activation generation. Event ordering assumes
        // retirement is observed before replacement-frame activation ACK.
        if (frameId === 0) {
          clearParticipants(tabId);
        } else {
          const participantGeneration = getParticipants(tabId).get(frameId);
          if (participantGeneration !== undefined) {
            removeParticipant(tabId, frameId, participantGeneration);
          }
        }

        if (getParticipants(tabId).size === 0 && getStateForTab(tabId).active) {
          setStateForTab(tabId, false);
        }
      });
    }

    // Window focus changes no longer deactivate Select Element mode
  }
} catch {
  // ignore in environments without tabs/windows
}

export {
  setStateForTab,
  getStateForTab,
  clearStateForTab,
  createActivationGeneration,
  getCurrentGeneration,
  getActivationEpoch,
  getActivationAttemptToken,
  isActivationAttemptCurrent,
  recordActivationAttemptFrames,
  invalidateOlderActivationAttempts,
  invalidateActivationAttempts,
  completeActivationAttempt,
  compensateInvalidatedActivationAttempts,
  retainCompatibilityFrames,
  getCompatibilityFrames,
  removeCompatibilityFrame,
  clearCompatibilityFrames,
  settleActivationAttemptFrame,
  getProvisionalCleanupFrames,
  removeProvisionalCleanupFrame,
  clearProvisionalCleanupFrames,
  registerParticipant,
  removeParticipant,
  getParticipants,
  clearParticipants,
};
