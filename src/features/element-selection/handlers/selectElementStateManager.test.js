import { describe, it, expect, vi, beforeEach } from 'vitest';
import browser from 'webextension-polyfill';

// Mock webextension-polyfill
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      sendMessage: vi.fn(() => Promise.resolve())
    },
    tabs: {
      sendMessage: vi.fn(() => Promise.resolve({ success: true })),
      onRemoved: { addListener: vi.fn() },
      onActivated: { addListener: vi.fn() }
    },
    webNavigation: {
      onCommitted: { addListener: vi.fn() }
    }
  }
}));

// Mock Messaging dependencies
vi.mock('@/shared/messaging/core/MessageActions.js', () => ({
  MessageActions: {
    DEACTIVATE_SELECT_ELEMENT_MODE: 'DEACTIVATE_SELECT_ELEMENT_MODE',
    SELECT_ELEMENT_STATE_CHANGED: 'selectElementStateChanged'
  }
}));

vi.mock('@/shared/messaging/core/MessagingCore.js', () => ({
  MessagingContexts: { BACKGROUND: 'BACKGROUND', CONTENT: 'CONTENT' },
  MessageFormat: {
    create: vi.fn((action, data, context) => ({ action, data, context }))
  }
}));

import {
  setStateForTab,
  getStateForTab,
  clearStateForTab,
  createActivationGeneration,
  getActivationEpoch,
  getActivationAttemptToken,
  getCurrentGeneration,
  beginRetainedSessionRecovery,
  getRetainedSessionRecoveryRecord,
  isRetainedSessionRecoveryCurrent,
  setRetainedSessionRecoveryPromise,
  clearRetainedSessionRecovery,
  invalidateRetainedSessionRecovery,
  invalidateActivationAttempts,
  invalidateOlderActivationAttempts,
  compensateInvalidatedActivationAttempts,
  completeActivationAttempt,
  retainCompatibilityFrames,
  getCompatibilityFrames,
  getProvisionalCleanupFrames,
  recordActivationAttemptFrames,
  registerParticipant,
  settleActivationAttemptFrame,
  removeParticipant,
  getParticipants,
  clearParticipants,
  isActivationAttemptCurrent,
} from './selectElementStateManager.js';

const onRemovedListener = browser.tabs.onRemoved.addListener.mock.calls[0][0];
const onCommittedListener = browser.webNavigation.onCommitted.addListener.mock.calls[0][0];

describe('selectElementStateManager', () => {
    it('should register listeners on load', () => {
      expect(browser.tabs.onRemoved.addListener).toHaveBeenCalled();
      expect(browser.tabs.onActivated.addListener).toHaveBeenCalled();
      expect(browser.webNavigation.onCommitted.addListener).toHaveBeenCalled();
    });

  it('exposes one opaque epoch for this background module lifetime', () => {
      expect(getActivationEpoch()).toEqual(expect.any(String));
      expect(getActivationEpoch()).toBe(getActivationEpoch());
    });

    it('invalidates retained recovery by identity across lifecycle changes', () => {
      const tabId = 117;
      const token = beginRetainedSessionRecovery(tabId);
      const promise = Promise.resolve();

      expect(token).toEqual(expect.any(Number));
      expect(setRetainedSessionRecoveryPromise(tabId, token, promise)).toBe(true);
      expect(getRetainedSessionRecoveryRecord(tabId)).toEqual({ token, promise });
      expect(isRetainedSessionRecoveryCurrent(tabId, token)).toBe(true);

      invalidateRetainedSessionRecovery(tabId);
      expect(isRetainedSessionRecoveryCurrent(tabId, token)).toBe(false);
      expect(clearRetainedSessionRecovery(tabId, token)).toBe(false);

      const replacementToken = beginRetainedSessionRecovery(tabId);
      expect(replacementToken).toBeGreaterThan(token);
      expect(clearRetainedSessionRecovery(tabId, token)).toBe(false);
      expect(isRetainedSessionRecoveryCurrent(tabId, replacementToken)).toBe(true);
    });

    it('invalidates retained recovery on top navigation and tab removal', () => {
      const navigationTabId = 118;
      const removalTabId = 119;
      const navigationToken = beginRetainedSessionRecovery(navigationTabId);
      const removalToken = beginRetainedSessionRecovery(removalTabId);

      onCommittedListener({ tabId: navigationTabId, frameId: 0, documentId: 'new-document' });
      onRemovedListener(removalTabId);

      expect(isRetainedSessionRecoveryCurrent(navigationTabId, navigationToken)).toBe(false);
      expect(isRetainedSessionRecoveryCurrent(removalTabId, removalToken)).toBe(false);
    });

  describe('Core Functionality', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should set and get state for a tab', () => {
      const tabId = 123;
      setStateForTab(tabId, true);
      
      const state = getStateForTab(tabId);
      expect(state.active).toBe(true);
      expect(state.updatedAt).toBeDefined();
    });

    it('should broadcast message when state changes', async () => {
      const tabId = 456;
      setStateForTab(tabId, true);
      
      // We need to wait for the async IIFE inside setStateForTab
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(browser.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        action: 'selectElementStateChanged',
        data: { tabId, active: true }
      }));
    });

    it('does not publish repeated same-state writes', async () => {
      const tabId = 461;

      setStateForTab(tabId, true);
      setStateForTab(tabId, true);
      await Promise.resolve();

      expect(browser.runtime.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('publishes real state transitions', async () => {
      const tabId = 462;

      setStateForTab(tabId, true);
      setStateForTab(tabId, false);
      await Promise.resolve();

      expect(getStateForTab(tabId).active).toBe(false);
      expect(browser.runtime.sendMessage).toHaveBeenCalledTimes(2);
      expect(browser.runtime.sendMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({
        action: 'selectElementStateChanged',
        data: { tabId, active: false }
      }));
    });

    it('should return default state for unknown tab', () => {
      const state = getStateForTab(999);
      expect(state.active).toBe(false);
    });

    it('should clear state for a tab', () => {
      const tabId = 789;
      setStateForTab(tabId, true);
      clearStateForTab(tabId);
      
      const state = getStateForTab(tabId);
      expect(state.active).toBe(false);
    });

    it('should handle falsy tabId in set/get/clear', () => {
      // Should not throw
      setStateForTab(null, true);
      expect(getStateForTab(null)).toEqual({ active: false });
      clearStateForTab(undefined);
    });

    it('should clear state when tab is removed', () => {
      const tabId = 101;
      setStateForTab(tabId, true);
      registerParticipant(tabId, 2, createActivationGeneration(tabId));
      
      onRemovedListener(tabId);

      expect(getStateForTab(tabId).active).toBe(false);
      expect(getParticipants(tabId)).toEqual(new Map());
    });

    it('should register, snapshot, remove, and clear frame participants', () => {
      const tabId = 102;
      const generation = createActivationGeneration(tabId);

      registerParticipant(tabId, 0, generation);
      registerParticipant(tabId, 3, generation);
      registerParticipant(tabId, 3, generation);

      expect(getParticipants(tabId)).toEqual(new Map([[0, generation], [3, generation]]));
      removeParticipant(tabId, 0, generation);
      expect(getParticipants(tabId)).toEqual(new Map([[3, generation]]));
      clearParticipants(tabId);
      expect(getParticipants(tabId)).toEqual(new Map());
      expect(getCurrentGeneration(tabId)).toBe(generation);
    });

    it('returns participant snapshots with copy semantics', () => {
      const tabId = 103;
      const generation = createActivationGeneration(tabId);
      registerParticipant(tabId, 0, generation);

      const snapshot = getParticipants(tabId);
      snapshot.delete(0);

      expect(getParticipants(tabId)).toEqual(new Map([[0, generation]]));
    });

    it('rejects stale generation removal', () => {
      const tabId = 104;
      const generationOne = createActivationGeneration(tabId);
      registerParticipant(tabId, 0, generationOne);
      const generationTwo = createActivationGeneration(tabId);
      registerParticipant(tabId, 0, generationTwo);

      expect(removeParticipant(tabId, 0, generationOne)).toBe(false);
      expect(getParticipants(tabId)).toEqual(new Map([[0, generationTwo]]));
    });

    it('retains older frame ownership during partial reactivation', () => {
      const tabId = 110;
      const generationOne = createActivationGeneration(tabId);
      registerParticipant(tabId, 0, generationOne);
      registerParticipant(tabId, 3, generationOne);
      const generationTwo = createActivationGeneration(tabId);

      registerParticipant(tabId, 0, generationTwo);

      expect(getCurrentGeneration(tabId)).toBe(generationTwo);
      expect(getParticipants(tabId)).toEqual(new Map([
        [0, generationTwo],
        [3, generationOne],
      ]));
    });

    it('keeps current ownership when activation attempt gets no accepted participant', () => {
      const tabId = 109;
      const currentGeneration = createActivationGeneration(tabId);
      registerParticipant(tabId, 0, currentGeneration);
      const rejectedAttemptGeneration = createActivationGeneration(tabId);

      expect(getCurrentGeneration(tabId)).toBe(currentGeneration);
      expect(rejectedAttemptGeneration).toBeGreaterThan(currentGeneration);
      expect(getParticipants(tabId)).toEqual(new Map([[0, currentGeneration]]));
    });

    it('invalidates only older activation attempts and permits newer ones', () => {
      const tabId = 112;
      const firstGeneration = createActivationGeneration(tabId);
      const firstToken = getActivationAttemptToken(tabId);

      expect(isActivationAttemptCurrent(tabId, firstGeneration, firstToken)).toBe(true);

      invalidateActivationAttempts(tabId);

      expect(isActivationAttemptCurrent(tabId, firstGeneration, firstToken)).toBe(false);
      expect(registerParticipant(tabId, 0, firstGeneration)).toBe(false);

      const secondGeneration = createActivationGeneration(tabId);
      const secondToken = getActivationAttemptToken(tabId);

      expect(secondGeneration).toBeGreaterThan(firstGeneration);
      expect(isActivationAttemptCurrent(tabId, firstGeneration, firstToken)).toBe(false);
      expect(isActivationAttemptCurrent(tabId, secondGeneration, secondToken)).toBe(true);
    });

    it('retains provisional frame delivery until activation attempt disposal', () => {
      const tabId = 113;
      const generationOne = createActivationGeneration(tabId);
      const firstToken = getActivationAttemptToken(tabId);
      recordActivationAttemptFrames(tabId, generationOne, [0, 3]);
      const generationTwo = createActivationGeneration(tabId);

      const invalidated = invalidateOlderActivationAttempts(tabId, generationTwo);

      expect(invalidated).toEqual([{ generation: generationOne, frameIds: [0, 3] }]);
      expect(isActivationAttemptCurrent(tabId, generationOne, firstToken)).toBe(false);
      expect(getActivationAttemptToken(tabId)).toBeDefined();
    });

    it('compensates invalidated provisional frames with generation-scoped cleanup', async () => {
      const tabId = 114;
      const generation = createActivationGeneration(tabId);
      recordActivationAttemptFrames(tabId, generation, [0, 3]);
      const invalidated = invalidateActivationAttempts(tabId);
      browser.tabs.sendMessage.mockResolvedValue({
        success: true,
        cleanupCompleted: true,
        activated: false,
      });

      const results = await compensateInvalidatedActivationAttempts(tabId, invalidated);

      expect(results).toEqual([
        expect.objectContaining({ generation, frameId: 0, settled: true }),
        expect.objectContaining({ generation, frameId: 3, settled: true }),
      ]);
      expect(getProvisionalCleanupFrames(tabId)).toEqual([]);
      expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(2);
      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
        tabId,
        expect.objectContaining({
          action: 'DEACTIVATE_SELECT_ELEMENT_MODE',
          data: expect.objectContaining({
            activationEpoch: getActivationEpoch(),
            activationGeneration: generation,
            fromBackground: true,
            isExplicitDeactivation: true,
          }),
        }),
        { frameId: 0 },
      );
      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
        tabId,
        expect.anything(),
        { frameId: 3 },
      );
    });

    it('reports a non-strict provisional cleanup ACK as unresolved', async () => {
      const tabId = 119;
      const generation = createActivationGeneration(tabId);
      recordActivationAttemptFrames(tabId, generation, [0]);
      browser.tabs.sendMessage.mockResolvedValue({ success: true, activated: false });

      const results = await compensateInvalidatedActivationAttempts(
        tabId,
        invalidateActivationAttempts(tabId),
      );

      expect(results).toEqual([
        expect.objectContaining({ generation, frameId: 0, settled: false }),
      ]);
      expect(getProvisionalCleanupFrames(tabId)).toEqual([{ frameId: 0, generation }]);
    });

    it('retires top-frame provisional ownership on navigation', () => {
      const tabId = 115;
      const generation = createActivationGeneration(tabId);
      recordActivationAttemptFrames(tabId, generation, [0]);

      onCommittedListener({ tabId, frameId: 0 });

      expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
      expect(getActivationAttemptToken(tabId)).toBeUndefined();
    });

    it('replaces compatibility cleanup ownership with strict participant authority', () => {
      const tabId = 117;
      const generation = createActivationGeneration(tabId);

      retainCompatibilityFrames(tabId, generation, [0]);
      expect(getCompatibilityFrames(tabId)).toEqual(new Map([[0, generation]]));

      expect(registerParticipant(tabId, 0, generation)).toBe(true);
      expect(getCompatibilityFrames(tabId)).toEqual(new Map());
      expect(getParticipants(tabId)).toEqual(new Map([[0, generation]]));
    });

    it('retires compatibility ownership for a committed child frame', () => {
      const tabId = 118;
      const generation = createActivationGeneration(tabId);
      retainCompatibilityFrames(tabId, generation, [5]);

      onCommittedListener({ tabId, frameId: 5 });

      expect(getCompatibilityFrames(tabId)).toEqual(new Map());
    });

    it('disposes provisional tracking after an activation attempt completes', () => {
      const tabId = 116;
      const generation = createActivationGeneration(tabId);
      const token = getActivationAttemptToken(tabId);
      recordActivationAttemptFrames(tabId, generation, [0, 3]);

      expect(completeActivationAttempt(tabId, generation, token)).toBe(true);
      expect(invalidateActivationAttempts(tabId)).toEqual([]);
      expect(getActivationAttemptToken(tabId)).toBeUndefined();
    });

    it('retains unresolved dispatched frames after successful partial activation', () => {
      const tabId = 120;
      const generation = createActivationGeneration(tabId);
      const token = getActivationAttemptToken(tabId);
      recordActivationAttemptFrames(tabId, generation, [0, 3]);

      expect(registerParticipant(tabId, 0, generation)).toBe(true);
      settleActivationAttemptFrame(tabId, generation, 0);
      expect(completeActivationAttempt(tabId, generation, token)).toBe(true);

      expect(getParticipants(tabId)).toEqual(new Map([[0, generation]]));
      expect(getProvisionalCleanupFrames(tabId)).toEqual([{ frameId: 3, generation }]);
    });

    it('does not retain a frame settled before activation attempt completion', () => {
      const tabId = 1201;
      const generation = createActivationGeneration(tabId);
      const token = getActivationAttemptToken(tabId);
      recordActivationAttemptFrames(tabId, generation, [3]);
      settleActivationAttemptFrame(tabId, generation, 3);

      completeActivationAttempt(tabId, generation, token);

      expect(getProvisionalCleanupFrames(tabId)).toEqual([]);
    });

    it('settles persistent provisional debt after its attempt is invalidated', () => {
      const tabId = 1202;
      const generation = createActivationGeneration(tabId);
      recordActivationAttemptFrames(tabId, generation, [3]);

      invalidateActivationAttempts(tabId);
      expect(getProvisionalCleanupFrames(tabId)).toEqual([{ frameId: 3, generation }]);

      settleActivationAttemptFrame(tabId, generation, 3);

      expect(getProvisionalCleanupFrames(tabId)).toEqual([]);
      expect(getActivationAttemptToken(tabId)).toBeUndefined();
    });

    it('settles only the matching provisional generation', () => {
      const tabId = 1203;
      const generationOne = createActivationGeneration(tabId);
      const tokenOne = getActivationAttemptToken(tabId);
      recordActivationAttemptFrames(tabId, generationOne, [3]);
      completeActivationAttempt(tabId, generationOne, tokenOne);
      const generationTwo = createActivationGeneration(tabId);
      const tokenTwo = getActivationAttemptToken(tabId);
      recordActivationAttemptFrames(tabId, generationTwo, [3]);
      completeActivationAttempt(tabId, generationTwo, tokenTwo);

      settleActivationAttemptFrame(tabId, generationOne, 3);

      expect(getProvisionalCleanupFrames(tabId)).toEqual([
        { frameId: 3, generation: generationTwo },
      ]);
    });

    it('keeps newer participant authority after late old-generation settlement', () => {
      const tabId = 1204;
      const generationOne = createActivationGeneration(tabId);
      const tokenOne = getActivationAttemptToken(tabId);
      recordActivationAttemptFrames(tabId, generationOne, [3]);
      completeActivationAttempt(tabId, generationOne, tokenOne);
      const generationTwo = createActivationGeneration(tabId);

      registerParticipant(tabId, 3, generationTwo);
      settleActivationAttemptFrame(tabId, generationOne, 3);

      expect(getParticipants(tabId)).toEqual(new Map([[3, generationTwo]]));
    });

    it('transfers compatibility activation out of provisional ownership', () => {
      const tabId = 121;
      const generation = createActivationGeneration(tabId);
      const token = getActivationAttemptToken(tabId);
      recordActivationAttemptFrames(tabId, generation, [0]);
      retainCompatibilityFrames(tabId, generation, [0]);
      settleActivationAttemptFrame(tabId, generation, 0);

      completeActivationAttempt(tabId, generation, token);

      expect(getCompatibilityFrames(tabId)).toEqual(new Map([[0, generation]]));
      expect(getProvisionalCleanupFrames(tabId)).toEqual([]);
    });

    it('retains older document cleanup debt beside newer strict authority', () => {
      const tabId = 122;
      const generationOne = createActivationGeneration(tabId);
      const tokenOne = getActivationAttemptToken(tabId);
      recordActivationAttemptFrames(tabId, generationOne, [3]);
      completeActivationAttempt(tabId, generationOne, tokenOne);
      const generationTwo = createActivationGeneration(tabId);

      expect(registerParticipant(tabId, 3, generationTwo)).toBe(true);

      expect(getParticipants(tabId)).toEqual(new Map([[3, generationTwo]]));
      expect(getProvisionalCleanupFrames(tabId)).toEqual([{ frameId: 3, generation: generationOne }]);
    });

    it('retires persisted provisional cleanup on frame navigation and tab removal', () => {
      const tabId = 1230;
      const generation = createActivationGeneration(tabId);
      const token = getActivationAttemptToken(tabId);
      recordActivationAttemptFrames(tabId, generation, [3, 5]);
      completeActivationAttempt(tabId, generation, token);

      onCommittedListener({ tabId, frameId: 3 });
      expect(getProvisionalCleanupFrames(tabId)).toEqual([{ frameId: 5, generation }]);

      onRemovedListener(tabId);
      expect(getProvisionalCleanupFrames(tabId)).toEqual([]);
    });

    it('retires only committed frame participant', () => {
      const tabId = 105;
      const generation = createActivationGeneration(tabId);
      registerParticipant(tabId, 0, generation);
      registerParticipant(tabId, 5, generation);

      onCommittedListener({ tabId, frameId: 5 });

      expect(getParticipants(tabId)).toEqual(new Map([[0, generation]]));
    });

    it('keeps active state when committed subframe is not final participant', () => {
      const tabId = 106;
      const generation = createActivationGeneration(tabId);
      registerParticipant(tabId, 0, generation);
      registerParticipant(tabId, 5, generation);
      setStateForTab(tabId, true);

      onCommittedListener({ tabId, frameId: 5 });

      expect(getParticipants(tabId)).toEqual(new Map([[0, generation]]));
      expect(getStateForTab(tabId).active).toBe(true);
    });

    it('retires mixed-generation frame ownership by frame generation', () => {
      const tabId = 111;
      const generationOne = createActivationGeneration(tabId);
      registerParticipant(tabId, 0, generationOne);
      registerParticipant(tabId, 3, generationOne);
      const generationTwo = createActivationGeneration(tabId);
      registerParticipant(tabId, 0, generationTwo);
      setStateForTab(tabId, true);

      onCommittedListener({ tabId, frameId: 3 });

      expect(getParticipants(tabId)).toEqual(new Map([[0, generationTwo]]));
      expect(getStateForTab(tabId).active).toBe(true);
    });

    it('reconciles inactive state when committed subframe is final participant', () => {
      const tabId = 107;
      const generation = createActivationGeneration(tabId);
      registerParticipant(tabId, 5, generation);
      setStateForTab(tabId, true);

      onCommittedListener({ tabId, frameId: 5 });

      expect(getParticipants(tabId)).toEqual(new Map());
      expect(getStateForTab(tabId).active).toBe(false);
    });

    it('retires all participants and reconciles state on committed top-frame navigation', () => {
      const tabId = 108;
      const generation = createActivationGeneration(tabId);
      registerParticipant(tabId, 0, generation);
      registerParticipant(tabId, 5, generation);
      setStateForTab(tabId, true);

      onCommittedListener({ tabId, frameId: 0 });

      expect(getParticipants(tabId)).toEqual(new Map());
      expect(getStateForTab(tabId).active).toBe(false);
    });
  });
});
