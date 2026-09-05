import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  state: { active: false, updatedAt: 1 },
  activeSessionRevision: 0,
  currentGeneration: undefined,
  activationAttemptToken: undefined,
  deactivationPending: false,
  nextToken: 1,
  map: new Map(),
}));

vi.mock('./selectElementStateManager.js', () => ({
  RETAINED_SESSION_DISCOVERY_TIMEOUT_MS: 150,
  discoverAndReconcileActiveFrames: vi.fn(),
  getActiveSessionRevision: vi.fn(() => mockState.activeSessionRevision),
  getActivationAttemptToken: vi.fn(() => mockState.activationAttemptToken),
  getCurrentGeneration: vi.fn(() => mockState.currentGeneration),
  getRetainedSessionRecoveryRecord: vi.fn((tabId) => mockState.map.get(tabId) || null),
  beginRetainedSessionRecovery: vi.fn((tabId) => {
    if (!Number.isInteger(tabId)) return null;
    if (mockState.map.has(tabId)) return null;
    const token = mockState.nextToken++;
    mockState.map.set(tabId, { token, promise: null });
    return token;
  }),
  isRetainedSessionRecoveryCurrent: vi.fn((tabId, token) => {
    const rec = mockState.map.get(tabId);
    return !!rec && rec.token === token;
  }),
  setRetainedSessionRecoveryPromise: vi.fn((tabId, token, promise) => {
    const rec = mockState.map.get(tabId);
    if (!rec || rec.token !== token) return false;
    rec.promise = promise;
    return true;
  }),
  clearRetainedSessionRecovery: vi.fn((tabId, token) => {
    const rec = mockState.map.get(tabId);
    if (!rec) return false;
    if (token && typeof token === 'object' && rec.promise === token) {
      mockState.map.delete(tabId);
      return true;
    }
    if (rec.token !== token) return false;
    mockState.map.delete(tabId);
    return true;
  }),
  invalidateRetainedSessionRecovery: vi.fn((tabId) => mockState.map.delete(tabId)),
  getStateForTab: vi.fn(() => mockState.state),
  isDeactivationPending: vi.fn(() => mockState.deactivationPending),
  reconcileStaleOwnershipForRead: vi.fn(),
}));

vi.mock('./handleActivateSelectElementMode.js', () => ({
  handleActivateSelectElementMode: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({
  default: { tabs: { query: vi.fn() } },
}));

import { handleActivateSelectElementMode } from './handleActivateSelectElementMode.js';
import { handleGetSelectElementState } from './handleGetSelectElementState.js';
import { discoverAndReconcileActiveFrames } from './selectElementStateManager.js';

const TAB = 9010;

describe('handleGetSelectElementState retained-session recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.state.active = false;
    mockState.state.updatedAt = 1;
    mockState.activeSessionRevision = 0;
    mockState.currentGeneration = undefined;
    mockState.activationAttemptToken = undefined;
    mockState.deactivationPending = false;
    mockState.map.clear();
    mockState.nextToken = 1;
    discoverAndReconcileActiveFrames.mockResolvedValue({ status: 'known', activeFrames: [] });
    handleActivateSelectElementMode.mockResolvedValue({ success: false, activated: false });
  });

  it('F3/R1 re-authorizes retained content through normal activation within budget', async () => {
    discoverAndReconcileActiveFrames.mockResolvedValue({ status: 'known', activeFrames: [{ frameId: 0 }] });
    handleActivateSelectElementMode.mockImplementation(async (message, sender, options) => {
      expect(message.data).toEqual({ tabId: TAB, active: true });
      expect(options).toMatchObject({ recoveryToken: expect.any(Number) });
      expect(message.data).not.toHaveProperty('recoveryDeadlineAt');
      mockState.state.active = true;
      mockState.state.updatedAt = 2;
      return { success: true, activated: true };
    });

    await expect(handleGetSelectElementState({ data: { tabId: TAB } }, {})).resolves.toMatchObject({ active: true });
    expect(handleActivateSelectElementMode).toHaveBeenCalledTimes(1);
    expect(discoverAndReconcileActiveFrames).toHaveBeenCalledTimes(1);
  });

  it('R2 remains inactive when no retained content is active', async () => {
    await expect(handleGetSelectElementState({ data: { tabId: TAB } }, {})).resolves.toMatchObject({ active: false });
    expect(handleActivateSelectElementMode).not.toHaveBeenCalled();
  });

  it('R3 fails closed when retained-content discovery is unknown', async () => {
    discoverAndReconcileActiveFrames.mockResolvedValue({ status: 'unknown', activeFrames: [{ frameId: 0 }] });

    await expect(handleGetSelectElementState({ data: { tabId: TAB } }, {})).resolves.toMatchObject({ active: false });
    expect(handleActivateSelectElementMode).not.toHaveBeenCalled();
  });

  it('R4 remains inactive when normal activation has no strict authority result', async () => {
    discoverAndReconcileActiveFrames.mockResolvedValue({ status: 'known', activeFrames: [{ frameId: 0 }] });

    await expect(handleGetSelectElementState({ data: { tabId: TAB } }, {})).resolves.toMatchObject({ active: false });
    expect(handleActivateSelectElementMode).toHaveBeenCalledTimes(1);
    // activation returned false, state stays inactive
    expect(mockState.state.active).toBe(false);
  });

  it('F1 activation exceeds GET budget but later succeeds and converges', async () => {
    vi.useFakeTimers();
    try {
      discoverAndReconcileActiveFrames.mockResolvedValue({ status: 'known', activeFrames: [{ frameId: 0 }] });
      let resolveActivation;
      const activationPromise = new Promise(resolve => {
        resolveActivation = resolve;
      });
      handleActivateSelectElementMode.mockReturnValue(activationPromise);
      activationPromise.catch(() => {});

      const pendingGet = handleGetSelectElementState({ data: { tabId: TAB } }, {});

      await vi.advanceTimersByTimeAsync(400);

      const firstResult = await pendingGet;
      expect(firstResult).toMatchObject({ active: false });
      expect(handleActivateSelectElementMode).toHaveBeenCalledTimes(1);
      const rec = mockState.map.get(TAB);
      expect(rec?.promise).toBeDefined();
      expect(rec?.promise).toBeInstanceOf(Promise);

      mockState.state.active = true;
      mockState.state.updatedAt = 2;
      resolveActivation({ success: true, activated: true });
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockState.state.active).toBe(true);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      expect(mockState.map.has(TAB)).toBe(false);

      mockState.state.active = true;
      await expect(handleGetSelectElementState({ data: { tabId: TAB } }, {})).resolves.toMatchObject({ active: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('F2 concurrent GETs reuse one recovery', async () => {
    discoverAndReconcileActiveFrames.mockResolvedValue({ status: 'known', activeFrames: [{ frameId: 0 }] });
    let resolveActivation;
    const activationPromise = new Promise(resolve => {
      resolveActivation = resolve;
    });
    handleActivateSelectElementMode.mockReturnValue(activationPromise);

    const first = handleGetSelectElementState({ data: { tabId: TAB } }, {});
    await Promise.resolve();
    await Promise.resolve();
    expect(handleActivateSelectElementMode).toHaveBeenCalledTimes(1);
    const rec = mockState.map.get(TAB);
    expect(rec?.promise).toBeDefined();

    const second = handleGetSelectElementState({ data: { tabId: TAB } }, {});
    await Promise.resolve();

    expect(handleActivateSelectElementMode).toHaveBeenCalledTimes(1);

    mockState.state.active = true;
    resolveActivation({ success: true, activated: true });

    const [r1, r2] = await Promise.all([first, second]);
    expect([r1.active, r2.active].some(v => v === true)).toBe(true);
  });

  it('R6 does not start recovery when activation attempt already pending', async () => {
    let resolveDiscovery;
    discoverAndReconcileActiveFrames.mockReturnValue(new Promise(resolve => { resolveDiscovery = resolve; }));

    const pending = handleGetSelectElementState({ data: { tabId: TAB } }, {});
    await vi.waitFor(() => expect(resolveDiscovery).toEqual(expect.any(Function)));
    mockState.activationAttemptToken = {};
    resolveDiscovery({ status: 'known', activeFrames: [{ frameId: 0 }] });

    await expect(pending).resolves.toMatchObject({ active: false });
    expect(handleActivateSelectElementMode).not.toHaveBeenCalled();
  });

  it('R7 does not resurrect state after concurrent deactivation', async () => {
    let resolveDiscovery;
    discoverAndReconcileActiveFrames.mockReturnValue(new Promise(resolve => { resolveDiscovery = resolve; }));

    const pending = handleGetSelectElementState({ data: { tabId: TAB } }, {});
    await vi.waitFor(() => expect(resolveDiscovery).toEqual(expect.any(Function)));
    mockState.deactivationPending = true;
    resolveDiscovery({ status: 'known', activeFrames: [{ frameId: 0 }] });

    await expect(pending).resolves.toMatchObject({ active: false });
    expect(handleActivateSelectElementMode).not.toHaveBeenCalled();
  });

  it('F7 does not leak recovery control fields into content activation', async () => {
    discoverAndReconcileActiveFrames.mockResolvedValue({ status: 'known', activeFrames: [{ frameId: 0 }] });
    handleActivateSelectElementMode.mockImplementation(async (message, sender, options) => {
      expect(message.data).not.toHaveProperty('recoveryDeadlineAt');
      expect(message.data).not.toHaveProperty('isRecovery');
      expect(options?.recoveryToken).toEqual(expect.any(Number));
      return { success: false, activated: false };
    });

    await handleGetSelectElementState({ data: { tabId: TAB } }, {});
    expect(handleActivateSelectElementMode).toHaveBeenCalledWith(
      expect.objectContaining({ data: { tabId: TAB, active: true } }),
      expect.anything(),
      expect.objectContaining({ recoveryToken: expect.any(Number) }),
    );
  });

  it('explicit deactivation invalidates pending recovery before generation', async () => {
    let resolveDiscovery;
    discoverAndReconcileActiveFrames.mockReturnValue(new Promise(resolve => { resolveDiscovery = resolve; }));

    const pending = handleGetSelectElementState({ data: { tabId: TAB } }, {});
    await vi.waitFor(() => expect(resolveDiscovery).toEqual(expect.any(Function)));
    // Simulate explicit deactivate invalidating recovery
    mockState.map.clear();
    resolveDiscovery({ status: 'known', activeFrames: [{ frameId: 0 }] });

    await expect(pending).resolves.toMatchObject({ active: false });
    expect(handleActivateSelectElementMode).not.toHaveBeenCalled();
  });

  it('top navigation invalidates pending recovery', async () => {
    let resolveDiscovery;
    discoverAndReconcileActiveFrames.mockReturnValue(new Promise(resolve => { resolveDiscovery = resolve; }));

    const pending = handleGetSelectElementState({ data: { tabId: TAB } }, {});
    await vi.waitFor(() => expect(resolveDiscovery).toEqual(expect.any(Function)));
    mockState.map.clear(); // navigation invalidated
    resolveDiscovery({ status: 'known', activeFrames: [{ frameId: 0 }] });

    await expect(pending).resolves.toMatchObject({ active: false });
    expect(handleActivateSelectElementMode).not.toHaveBeenCalled();
  });

  it('explicit activate race invalidates recovery', async () => {
    let resolveDiscovery;
    discoverAndReconcileActiveFrames.mockReturnValue(new Promise(resolve => { resolveDiscovery = resolve; }));

    const pending = handleGetSelectElementState({ data: { tabId: TAB } }, {});
    await vi.waitFor(() => expect(resolveDiscovery).toEqual(expect.any(Function)));
    // Explicit user activate would invalidate and create its own generation; simulate by clearing and setting attempt token
    mockState.map.clear();
    mockState.activationAttemptToken = {};
    resolveDiscovery({ status: 'known', activeFrames: [{ frameId: 0 }] });

    await expect(pending).resolves.toMatchObject({ active: false });
    expect(handleActivateSelectElementMode).not.toHaveBeenCalled();
  });
});
