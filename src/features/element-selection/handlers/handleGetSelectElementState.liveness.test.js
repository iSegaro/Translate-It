import { describe, it, expect, vi, beforeEach } from 'vitest';
import browser from 'webextension-polyfill';

vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      query: vi.fn(() => Promise.resolve([])),
      sendMessage: vi.fn(() => Promise.resolve({ success: true })),
      onRemoved: { addListener: vi.fn() },
      onActivated: { addListener: vi.fn() },
    },
    runtime: {
      sendMessage: vi.fn(() => Promise.resolve()),
    },
    webNavigation: {
      getAllFrames: vi.fn(() => Promise.resolve([])),
      onCommitted: { addListener: vi.fn() },
    },
    scripting: {
      executeScript: vi.fn(() => Promise.resolve([])),
    },
  },
}));

vi.mock('@/shared/messaging/core/MessageActions.js', () => ({
  MessageActions: {
    DEACTIVATE_SELECT_ELEMENT_MODE: 'DEACTIVATE_SELECT_ELEMENT_MODE',
    SELECT_ELEMENT_STATE_CHANGED: 'selectElementStateChanged',
    ACTIVATE_SELECT_ELEMENT_MODE: 'ACTIVATE_SELECT_ELEMENT_MODE',
    GET_SELECT_ELEMENT_FRAME_STATE: 'GET_SELECT_ELEMENT_FRAME_STATE',
  },
}));

vi.mock('@/shared/messaging/core/MessagingCore.js', () => ({
  MessagingContexts: { BACKGROUND: 'BACKGROUND', CONTENT: 'CONTENT' },
  MessageFormat: {
    create: vi.fn((action, data, context) => ({ action, data, context })),
  },
}));

import { handleGetSelectElementState } from './handleGetSelectElementState.js';
import {
  setStateForTab,
  getStateForTab,
  createActivationGeneration,
  registerParticipant,
  retainCompatibilityFrames,
  getCompatibilityFrames,
  getProvisionalCleanupFrames,
  recordActivationAttemptFrames,
  completeActivationAttempt,
  getActivationAttemptToken,
  getParticipants,
  clearTabParticipants,
  clearStateForTab,
  getActiveSessionRevision,
  RECONCILE_LIVENESS_TIMEOUT_MS,
  getOwnershipRevision,
  removeCompatibilityFrame,
  removeParticipant,
} from './selectElementStateManager.js';

const TAB = 9001;

function resetTab() {
  clearTabParticipants(TAB);
  clearStateForTab(TAB);
}

describe('handleGetSelectElementState liveness reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTab();
    browser.webNavigation.getAllFrames.mockReset();
    browser.webNavigation.getAllFrames.mockResolvedValue([]);
  });

  it('T1 sole detached strict participant becomes inactive', async () => {
    const gen = createActivationGeneration(TAB);
    registerParticipant(TAB, 4, gen, 'A');
    setStateForTab(TAB, true);
    expect(getStateForTab(TAB).active).toBe(true);
    expect(getParticipants(TAB).size).toBe(1);

    // Live snapshot after detach: only top frame 0 remains
    browser.webNavigation.getAllFrames.mockResolvedValue([{ frameId: 0, documentId: 'top-doc' }]);

    const res = await handleGetSelectElementState({ data: { tabId: TAB } }, {});
    expect(res.success).toBe(true);
    expect(res.active).toBe(false);
    expect(getStateForTab(TAB).active).toBe(false);
    expect(getParticipants(TAB).size).toBe(0);
  });

  it('T2 other live participant remains keeps active', async () => {
    const gen = createActivationGeneration(TAB);
    registerParticipant(TAB, 0, gen, 'top-doc');
    registerParticipant(TAB, 4, gen, 'A');
    setStateForTab(TAB, true);

    // Live: top 0 still live, child 4 gone
    browser.webNavigation.getAllFrames.mockResolvedValue([
      { frameId: 0, documentId: 'top-doc' },
    ]);

    const res = await handleGetSelectElementState({ data: { tabId: TAB } }, {});
    expect(res.active).toBe(true);
    expect(getStateForTab(TAB).active).toBe(true);
    // stale 4 removed, 0 kept
    expect(getParticipants(TAB).has(0)).toBe(true);
    expect(getParticipants(TAB).has(4)).toBe(false);
  });

  it('T3 document replacement A stale when live is B', async () => {
    const gen = createActivationGeneration(TAB);
    registerParticipant(TAB, 4, gen, 'A');
    setStateForTab(TAB, true);

    browser.webNavigation.getAllFrames.mockResolvedValue([
      { frameId: 0, documentId: 'top-doc' },
      { frameId: 4, documentId: 'B' },
    ]);

    const res = await handleGetSelectElementState({ data: { tabId: TAB } }, {});
    expect(res.active).toBe(false);
    expect(getParticipants(TAB).size).toBe(0);
  });

  it('T3b document replacement keeps live when same doc', async () => {
    const gen = createActivationGeneration(TAB);
    registerParticipant(TAB, 4, gen, 'A');
    setStateForTab(TAB, true);

    browser.webNavigation.getAllFrames.mockResolvedValue([
      { frameId: 4, documentId: 'A' },
    ]);

    const res = await handleGetSelectElementState({ data: { tabId: TAB } }, {});
    expect(res.active).toBe(true);
    expect(getParticipants(TAB).has(4)).toBe(true);
  });

  it('T4 liveness API failure keeps active and ownership', async () => {
    const gen = createActivationGeneration(TAB);
    registerParticipant(TAB, 4, gen, 'A');
    setStateForTab(TAB, true);

    browser.webNavigation.getAllFrames.mockRejectedValue(new Error('unavailable'));

    const res = await handleGetSelectElementState({ data: { tabId: TAB } }, {});
    expect(res.active).toBe(true);
    expect(getStateForTab(TAB).active).toBe(true);
    expect(getParticipants(TAB).has(4)).toBe(true);
  });

  it('T4b invalid snapshot keeps active', async () => {
    const gen = createActivationGeneration(TAB);
    registerParticipant(TAB, 4, gen, 'A');
    setStateForTab(TAB, true);

    browser.webNavigation.getAllFrames.mockResolvedValue(null);

    const res = await handleGetSelectElementState({ data: { tabId: TAB } }, {});
    expect(res.active).toBe(true);
  });

  it('T5 compatibility detached clears active when no other ownership', async () => {
    const gen = createActivationGeneration(TAB);
    retainCompatibilityFrames(TAB, gen, [4]);
    setStateForTab(TAB, true);

    browser.webNavigation.getAllFrames.mockResolvedValue([{ frameId: 0, documentId: 'top' }]);

    const res = await handleGetSelectElementState({ data: { tabId: TAB } }, {});
    expect(res.active).toBe(false);
    expect(getCompatibilityFrames(TAB).size).toBe(0);
  });

  it('T5b compatibility live keeps active', async () => {
    const gen = createActivationGeneration(TAB);
    retainCompatibilityFrames(TAB, gen, [4]);
    setStateForTab(TAB, true);

    browser.webNavigation.getAllFrames.mockResolvedValue([
      { frameId: 4, documentId: 'any' },
    ]);

    const res = await handleGetSelectElementState({ data: { tabId: TAB } }, {});
    expect(res.active).toBe(true);
    expect(getCompatibilityFrames(TAB).has(4)).toBe(true);
  });

  it('T6 provisional stale cleared but uncertain keeps active', async () => {
    const gen = createActivationGeneration(TAB);
    recordActivationAttemptFrames(TAB, gen, [4]);
    const token = getActivationAttemptToken(TAB);
    completeActivationAttempt(TAB, gen, token);
    // provisional now has frame 4 gen
    expect(getProvisionalCleanupFrames(TAB).length).toBe(1);
    setStateForTab(TAB, true);

    // Case A: provisional frame gone -> should retire and clear active (no other ownership)
    browser.webNavigation.getAllFrames.mockResolvedValue([{ frameId: 0, documentId: 'top' }]);
    let res = await handleGetSelectElementState({ data: { tabId: TAB } }, {});
    expect(res.active).toBe(false);
    expect(getProvisionalCleanupFrames(TAB).length).toBe(0);

    // reset for case B
    resetTab();
    const gen2 = createActivationGeneration(TAB);
    recordActivationAttemptFrames(TAB, gen2, [4]);
    const token2 = getActivationAttemptToken(TAB);
    completeActivationAttempt(TAB, gen2, token2);
    setStateForTab(TAB, true);
    browser.webNavigation.getAllFrames.mockResolvedValue([
      { frameId: 4, documentId: 'doc-4' },
      { frameId: 0, documentId: 'top' },
    ]);
    res = await handleGetSelectElementState({ data: { tabId: TAB } }, {});
    expect(res.active).toBe(true);
    expect(getProvisionalCleanupFrames(TAB).length).toBe(1);
  });

  it('T6b provisional document replacement considered stale', async () => {
    const gen = createActivationGeneration(TAB);
    recordActivationAttemptFrames(TAB, gen, [{ frameId: 4, documentId: 'A' }]);
    const token = getActivationAttemptToken(TAB);
    completeActivationAttempt(TAB, gen, token);
    setStateForTab(TAB, true);

    browser.webNavigation.getAllFrames.mockResolvedValue([
      { frameId: 4, documentId: 'B' },
    ]);

    const res = await handleGetSelectElementState({ data: { tabId: TAB } }, {});
    expect(res.active).toBe(false);
  });

  it('T7 concurrent authority change prevents clearing new session', async () => {
    const gen1 = createActivationGeneration(TAB);
    registerParticipant(TAB, 4, gen1, 'A');
    setStateForTab(TAB, true);
    const capturedRevision = getActiveSessionRevision(TAB);
    expect(capturedRevision).toBeGreaterThan(0);

    // Controlled getAllFrames promise
    let resolveFrames;
    const framesPromise = new Promise(resolve => { resolveFrames = resolve; });
    browser.webNavigation.getAllFrames.mockReturnValue(framesPromise);

    const pending = handleGetSelectElementState({ data: { tabId: TAB } }, {});

    // Concurrent new authority appears before frames resolve
    const gen2 = createActivationGeneration(TAB);
    registerParticipant(TAB, 9, gen2, 'B');
    // setState already true, but bump revision by toggling false->true? Already true, so setState won't bump.
    // Force a revision bump via clear and re-set or via direct call that bumps: setStateForTab false then true
    // Instead simulate new session by invalidating and creating new generation that already bumps via create? Need revision bump.
    // Revision is bumped on setState transition. Do a false->true cycle to bump revision.
    setStateForTab(TAB, false);
    setStateForTab(TAB, true);
    // Now revision changed
    const newRevision = getActiveSessionRevision(TAB);
    expect(newRevision).not.toBe(capturedRevision);

    // Also ensure new participant still exists after the intermediate clear? clearTabParticipants would be called on tab removal only, not here.
    // Our intermediate false->true cleared? setState false doesn't clear participants, but our manual false->true left participant 9.
    // Re-register participant for new generation since clear didn't happen, but we already registered 9 with gen2 before toggle, now generation changed to gen3?
    // Simpler: after toggle, re-register to ensure live ownership.
    const gen3 = createActivationGeneration(TAB);
    registerParticipant(TAB, 9, gen3, 'B');
    setStateForTab(TAB, true);

    // Resolve with snapshot that shows only top 0 (old 4 gone, new 9 not in snapshot because snapshot taken before it existed)
    resolveFrames([{ frameId: 0, documentId: 'top' }]);

    const res = await pending;
    // New ownership 9/B appeared, reconciliation must abort (ownershipRevision changed) and not prune
    expect(res.active).toBe(true);
    expect(getStateForTab(TAB).active).toBe(true);
    expect(getParticipants(TAB).has(9)).toBe(true);
    // Stale 4 remains because reconciliation aborted fail-closed
    expect(getParticipants(TAB).has(4)).toBe(true);
  });

  it('T7b no concurrent change clears stale sole participant', async () => {
    const gen = createActivationGeneration(TAB);
    registerParticipant(TAB, 4, gen, 'A');
    setStateForTab(TAB, true);

    let resolveFrames;
    const p = new Promise(r => { resolveFrames = r; });
    browser.webNavigation.getAllFrames.mockReturnValue(p);
    const pending = handleGetSelectElementState({ data: { tabId: TAB } }, {});
    resolveFrames([{ frameId: 0, documentId: 'top' }]);
    const res = await pending;
    expect(res.active).toBe(false);
  });

  it('does not reconcile when active false', async () => {
    setStateForTab(TAB, false);
    browser.webNavigation.getAllFrames.mockClear();
    const res = await handleGetSelectElementState({ data: { tabId: TAB } }, {});
    expect(res.active).toBe(false);
    expect(browser.webNavigation.getAllFrames).not.toHaveBeenCalled();
  });

  it('handles missing documentId conservatively', async () => {
    const gen = createActivationGeneration(TAB);
    registerParticipant(TAB, 4, gen, null);
    setStateForTab(TAB, true);

    // Live frame 4 exists but without documentId in snapshot (e.g., old API) -> should keep (cannot prove stale)
    browser.webNavigation.getAllFrames.mockResolvedValue([{ frameId: 4 }]);
    let res = await handleGetSelectElementState({ data: { tabId: TAB } }, {});
    expect(res.active).toBe(true);

    // Now live has no 4 at all -> stale
    browser.webNavigation.getAllFrames.mockResolvedValue([{ frameId: 0 }]);
    res = await handleGetSelectElementState({ data: { tabId: TAB } }, {});
    expect(res.active).toBe(false);
  });

  it('handles webNavigation unavailable fail closed', async () => {
    const gen = createActivationGeneration(TAB);
    registerParticipant(TAB, 4, gen, 'A');
    setStateForTab(TAB, true);

    const original = browser.webNavigation;
    // @ts-ignore
    browser.webNavigation = undefined;
    const res = await handleGetSelectElementState({ data: { tabId: TAB } }, {});
    expect(res.active).toBe(true);
    browser.webNavigation = original;
  });

  it('timeout keeps active, ownership and no timer leak when getAllFrames never settles', async () => {
    vi.useFakeTimers();
    try {
      const gen = createActivationGeneration(TAB);
      registerParticipant(TAB, 4, gen, 'A');
      setStateForTab(TAB, true);
      browser.webNavigation.getAllFrames.mockReturnValue(new Promise(() => {}));

      const pending = handleGetSelectElementState({ data: { tabId: TAB } }, {});
      await vi.advanceTimersByTimeAsync(RECONCILE_LIVENESS_TIMEOUT_MS + 50);
      const res = await pending;
      expect(res.active).toBe(true);
      expect(getStateForTab(TAB).active).toBe(true);
      expect(getParticipants(TAB).has(4)).toBe(true);
      expect(vi.getTimerCount()).toBe(0);

      // Late result after timeout must not mutate
      // Simulate late getAllFrames resolving with empty snapshot that would have cleared
      // No direct way to resolve the never promise, but verify no pending timers and state stable
      await Promise.resolve();
      expect(getParticipants(TAB).has(4)).toBe(true);
    } finally {
      vi.useRealTimers();
      // Ensure mock reset for next tests (beforeEach will handle)
      browser.webNavigation.getAllFrames.mockReset();
      browser.webNavigation.getAllFrames.mockResolvedValue([]);
    }
  });

  it('late getAllFrames result after timeout does not clear new ownership', async () => {
    vi.useFakeTimers();
    try {
      const gen = createActivationGeneration(TAB);
      registerParticipant(TAB, 4, gen, 'A');
      setStateForTab(TAB, true);

      let resolveFrames;
      const framesPromise = new Promise(resolve => { resolveFrames = resolve; });
      browser.webNavigation.getAllFrames.mockReturnValue(framesPromise);

      const pending = handleGetSelectElementState({ data: { tabId: TAB } }, {});
      await vi.advanceTimersByTimeAsync(RECONCILE_LIVENESS_TIMEOUT_MS + 50);
      const res = await pending;
      expect(res.active).toBe(true);
      expect(getParticipants(TAB).has(4)).toBe(true);

      // Late resolve with snapshot that would have cleared stale 4 if it had been considered
      resolveFrames([{ frameId: 0, documentId: 'top' }]);
      await Promise.resolve();
      await Promise.resolve();
      // Ownership must remain because reconciliation already returned
      expect(getParticipants(TAB).has(4)).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
      browser.webNavigation.getAllFrames.mockReset();
      browser.webNavigation.getAllFrames.mockResolvedValue([]);
    }
  });

  it('same-session FRAME_READY registers 9/B under same generation G without revision change', async () => {
    const gen = createActivationGeneration(TAB);
    // Keep activation attempt alive for same-generation join
    recordActivationAttemptFrames(TAB, gen, [4]);
    expect(registerParticipant(TAB, 4, gen, 'A')).toBe(true);
    setStateForTab(TAB, true);
    expect(getStateForTab(TAB).active).toBe(true);
    expect(getParticipants(TAB).has(4)).toBe(true);
    const beforeRevision = getActiveSessionRevision(TAB);
    const beforeGen = gen;

    let resolveFrames;
    const framesPromise = new Promise(resolve => { resolveFrames = resolve; });
    browser.webNavigation.getAllFrames.mockReturnValue(framesPromise);

    const pending = handleGetSelectElementState({ data: { tabId: TAB } }, {});

    // Same-session join: new participant 9/B under SAME generation G via existing attempt path
    // Do not create new generation or toggle state
    expect(registerParticipant(TAB, 9, gen, 'B')).toBe(true);
    expect(getParticipants(TAB).has(9)).toBe(true);
    expect(getActiveSessionRevision(TAB)).toBe(beforeRevision);
    expect(beforeGen).toBe(gen);

    // Snapshot does not contain 9 (taken before 9 existed logically) and 4 is gone
    resolveFrames([{ frameId: 0, documentId: 'top' }]);

    const res = await pending;
    expect(res.active).toBe(true);
    expect(getStateForTab(TAB).active).toBe(true);
    // With ownershipRevision guard, stale 4/A is not pruned when new ownership appears (fail-closed)
    expect(getParticipants(TAB).has(4)).toBe(true);
    // New 9/B must remain despite same-session and missing from snapshot
    expect(getParticipants(TAB).has(9)).toBe(true);
    // Revision unchanged proves test did not rely on false->true toggling
    expect(getActiveSessionRevision(TAB)).toBe(beforeRevision);
  });

  it('R1 same-key compatibility replacement aborts stale reconciliation', async () => {
    const gen = createActivationGeneration(TAB);
    retainCompatibilityFrames(TAB, gen, [4]);
    setStateForTab(TAB, true);
    expect(getCompatibilityFrames(TAB).has(4)).toBe(true);
    const beforeOwnership = getOwnershipRevision(TAB);

    let resolveFrames;
    const framesPromise = new Promise(resolve => { resolveFrames = resolve; });
    browser.webNavigation.getAllFrames.mockReturnValue(framesPromise);

    const pending = handleGetSelectElementState({ data: { tabId: TAB } }, {});

    // Same-key replacement: remove and re-add same frame 4/G
    expect(removeCompatibilityFrame(TAB, 4)).toBe(true);
    expect(getOwnershipRevision(TAB)).not.toBe(beforeOwnership);
    retainCompatibilityFrames(TAB, gen, [4]);
    expect(getCompatibilityFrames(TAB).has(4)).toBe(true);
    const afterOwnership = getOwnershipRevision(TAB);
    expect(afterOwnership).not.toBe(beforeOwnership);

    // Stale snapshot without 4 would have deleted compat if not for revision guard
    resolveFrames([{ frameId: 0, documentId: 'top' }]);

    const res = await pending;
    expect(res.active).toBe(true);
    expect(getStateForTab(TAB).active).toBe(true);
    expect(getCompatibilityFrames(TAB).has(4)).toBe(true);
  });

  it('R2 same-key strict participant without documentId aborts', async () => {
    const gen = createActivationGeneration(TAB);
    recordActivationAttemptFrames(TAB, gen, [4]);
    expect(registerParticipant(TAB, 4, gen, null)).toBe(true);
    setStateForTab(TAB, true);
    expect(getParticipants(TAB).has(4)).toBe(true);
    const beforeOwnership = getOwnershipRevision(TAB);
    const beforeRevision = getActiveSessionRevision(TAB);

    let resolveFrames;
    const framesPromise = new Promise(resolve => { resolveFrames = resolve; });
    browser.webNavigation.getAllFrames.mockReturnValue(framesPromise);

    const pending = handleGetSelectElementState({ data: { tabId: TAB } }, {});

    // Same-key replacement: remove and re-add same 4/G/null under same generation
    expect(removeParticipant(TAB, 4, gen, null)).toBe(true);
    expect(registerParticipant(TAB, 4, gen, null)).toBe(true);
    expect(getOwnershipRevision(TAB)).not.toBe(beforeOwnership);
    expect(getActiveSessionRevision(TAB)).toBe(beforeRevision);

    resolveFrames([{ frameId: 0, documentId: 'top' }]);

    const res = await pending;
    expect(res.active).toBe(true);
    expect(getParticipants(TAB).has(4)).toBe(true);
  });

  it('R3 normal no-race detach still clears', async () => {
    const gen = createActivationGeneration(TAB);
    registerParticipant(TAB, 4, gen, 'A');
    setStateForTab(TAB, true);
    browser.webNavigation.getAllFrames.mockResolvedValue([{ frameId: 0, documentId: 'top' }]);

    const res = await handleGetSelectElementState({ data: { tabId: TAB } }, {});
    expect(res.active).toBe(false);
    expect(getStateForTab(TAB).active).toBe(false);
    expect(getParticipants(TAB).size).toBe(0);
  });

  it('R4 ownership revision never reuses a value after tab clear and recreation', () => {
    const firstGeneration = createActivationGeneration(TAB);
    registerParticipant(TAB, 4, firstGeneration, 'A');
    const capturedRevision = getOwnershipRevision(TAB);

    clearTabParticipants(TAB);
    const secondGeneration = createActivationGeneration(TAB);
    registerParticipant(TAB, 4, secondGeneration, 'A');

    expect(getOwnershipRevision(TAB)).toBeGreaterThan(capturedRevision);
  });

  it('R5 reconciliation prune advances ownership revision', async () => {
    const gen = createActivationGeneration(TAB);
    registerParticipant(TAB, 4, gen, 'A');
    setStateForTab(TAB, true);
    const beforePrune = getOwnershipRevision(TAB);
    browser.webNavigation.getAllFrames.mockResolvedValue([{ frameId: 0, documentId: 'top' }]);

    const res = await handleGetSelectElementState({ data: { tabId: TAB } }, {});

    expect(res.active).toBe(false);
    expect(getOwnershipRevision(TAB)).toBeGreaterThan(beforePrune);
  });
});
