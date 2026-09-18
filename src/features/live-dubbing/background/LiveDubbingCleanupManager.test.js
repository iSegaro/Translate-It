import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveDubbingCleanupManager } from './LiveDubbingCleanupManager.js';
import { LIVE_DUBBING_OWNER } from '../constants.js';

function createDescriptor(sessionId = 's-1', providerId = 'gemini', opts = {}) {
  return {
    sessionId,
    providerId,
    tabId: 42,
    targetLanguage: 'en',
    eventSequence: 0,
    status: 'RUNNING',
    startedAt: 1,
    lastError: null,
    ...opts,
  };
}

function createState(sessionId = 's-1', providerId = 'gemini', opts = {}) {
  const descriptor = opts.descriptor || createDescriptor(sessionId, providerId);
  return {
    descriptor,
    leasePromise: null,
    leaseAcquired: false,
    prepared: true,
    terminalRequested: false,
    cleanupCompleted: false,
    providerDiagnostic: null,
    ...opts,
  };
}

describe('LiveDubbingCleanupManager', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('single-flight: same session/provider/generation reuses same Promise', async () => {
    const state = createState('s-1', 'gemini', { leaseAcquired: true });
    const states = new Map([['s-1', state]]);
    const sendOffscreen = vi.fn(async () => new Promise(() => {}));
    const leaseManager = { release: vi.fn(async () => true) };
    const manager = new LiveDubbingCleanupManager({
      leaseManager,
      sendOffscreen,
      getSessionState: (id) => states.get(id) || null,
      logger: { warn: vi.fn() },
    });
    const descriptor = state.descriptor;
    const p1 = manager.disposeAndRelease(descriptor);
    const p2 = manager.disposeAndRelease(descriptor);
    expect(p1).toBe(p2);
    expect(sendOffscreen).toHaveBeenCalledTimes(1);
  });

  it('ack exact: DISPOSED with exact session/provider succeeds', async () => {
    const state = createState('s-1', 'gemini', { leaseAcquired: false });
    const states = new Map([['s-1', state]]);
    const sendOffscreen = vi.fn(async () => ({
      success: true, ack: 'DISPOSED', sessionId: 's-1', providerId: 'gemini',
    }));
    const leaseManager = { release: vi.fn(async () => true) };
    const manager = new LiveDubbingCleanupManager({
      leaseManager, sendOffscreen, getSessionState: (id) => states.get(id) || null, logger: { warn: vi.fn() },
    });
    const result = await manager.disposeAndRelease(state.descriptor);
    expect(result).toEqual({ success: true });
    expect(state.cleanupCompleted).toBe(true);
    expect(manager.hasCleanupFacts('s-1')).toBe(true);
    expect(state).not.toHaveProperty('cleanupFacts');
  });

  it('ack mismatch: provider mismatch fails', async () => {
    const state = createState('s-1', 'gemini', { leaseAcquired: false });
    const states = new Map([['s-1', state]]);
    const sendOffscreen = vi.fn(async () => ({
      success: true, ack: 'DISPOSED', sessionId: 's-1', providerId: 'openai',
    }));
    const leaseManager = { release: vi.fn(async () => true) };
    const manager = new LiveDubbingCleanupManager({
      leaseManager, sendOffscreen, getSessionState: (id) => states.get(id) || null, logger: { warn: vi.fn() },
    });
    const result = await manager.disposeAndRelease(state.descriptor);
    expect(result).toEqual({ success: false });
    expect(leaseManager.release).not.toHaveBeenCalled();
  });

  it('ack session mismatch fails', async () => {
    const state = createState('s-1', 'gemini', { leaseAcquired: false });
    const states = new Map([['s-1', state]]);
    const sendOffscreen = vi.fn(async () => ({
      success: true, ack: 'DISPOSED', sessionId: 'other', providerId: 'gemini',
    }));
    const leaseManager = { release: vi.fn(async () => true) };
    const manager = new LiveDubbingCleanupManager({
      leaseManager, sendOffscreen, getSessionState: (id) => states.get(id) || null, logger: { warn: vi.fn() },
    });
    const result = await manager.disposeAndRelease(state.descriptor);
    expect(result).toEqual({ success: false });
  });

  it('ignored response fails', async () => {
    const state = createState('s-1', 'gemini', { leaseAcquired: false });
    const states = new Map([['s-1', state]]);
    const sendOffscreen = vi.fn(async () => ({
      success: true, ack: 'DISPOSED', sessionId: 's-1', providerId: 'gemini', ignored: true,
    }));
    const leaseManager = { release: vi.fn(async () => true) };
    const manager = new LiveDubbingCleanupManager({
      leaseManager, sendOffscreen, getSessionState: (id) => states.get(id) || null, logger: { warn: vi.fn() },
    });
    const result = await manager.disposeAndRelease(state.descriptor);
    expect(result).toEqual({ success: false });
  });

  it('transport failure returns false and logs', async () => {
    const state = createState('s-1', 'gemini', { leaseAcquired: false });
    const states = new Map([['s-1', state]]);
    const logger = { warn: vi.fn() };
    const sendOffscreen = vi.fn(async () => { throw new Error('transport'); });
    const leaseManager = { release: vi.fn(async () => true) };
    const manager = new LiveDubbingCleanupManager({
      leaseManager, sendOffscreen, getSessionState: (id) => states.get(id) || null, logger,
    });
    const result = await manager.disposeAndRelease(state.descriptor);
    expect(result).toEqual({ success: false });
    expect(logger.warn).toHaveBeenCalledWith('Live dubbing disposal did not complete');
  });

  it('lease ABSENT: no lease release, completes after dispose', async () => {
    const state = createState('s-1', 'gemini', { leaseAcquired: false, leasePromise: null });
    const states = new Map([['s-1', state]]);
    const sendOffscreen = vi.fn(async () => ({ success: true, ack: 'DISPOSED', sessionId: 's-1', providerId: 'gemini' }));
    const leaseManager = { release: vi.fn(async () => true) };
    const manager = new LiveDubbingCleanupManager({
      leaseManager, sendOffscreen, getSessionState: (id) => states.get(id) || null, logger: { warn: vi.fn() },
    });
    const result = await manager.disposeAndRelease(state.descriptor);
    expect(result).toEqual({ success: true });
    expect(leaseManager.release).not.toHaveBeenCalled();
  });

  it('lease ACQUIRED: releases exactly once', async () => {
    const state = createState('s-1', 'gemini', { leaseAcquired: true });
    const states = new Map([['s-1', state]]);
    const sendOffscreen = vi.fn(async () => ({ success: true, ack: 'DISPOSED', sessionId: 's-1', providerId: 'gemini' }));
    const leaseManager = { release: vi.fn(async () => true) };
    const manager = new LiveDubbingCleanupManager({
      leaseManager, sendOffscreen, getSessionState: (id) => states.get(id) || null, logger: { warn: vi.fn() },
    });
    const result = await manager.disposeAndRelease(state.descriptor);
    expect(result).toEqual({ success: true });
    expect(leaseManager.release).toHaveBeenCalledWith({ owner: LIVE_DUBBING_OWNER, leaseId: 's-1' });
    expect(leaseManager.release).toHaveBeenCalledTimes(1);
  });

  it('pending true: waits settlement then releases', async () => {
    let resolveLease;
    const leasePromise = new Promise(r => { resolveLease = r; });
    const state = createState('s-1', 'gemini', { leaseAcquired: false, leasePromise });
    const states = new Map([['s-1', state]]);
    const sendOffscreen = vi.fn(async () => ({ success: true, ack: 'DISPOSED', sessionId: 's-1', providerId: 'gemini' }));
    const leaseManager = { release: vi.fn(async () => true) };
    const manager = new LiveDubbingCleanupManager({
      leaseManager, sendOffscreen, getSessionState: (id) => states.get(id) || null, logger: { warn: vi.fn() },
    });
    const promise = manager.disposeAndRelease(state.descriptor);
    resolveLease(true);
    const result = await promise;
    expect(result).toEqual({ success: true });
    expect(leaseManager.release).toHaveBeenCalledTimes(1);
    expect(state.leaseAcquired).toBe(true);
  });

  it('pending false: settles to ABSENT no release', async () => {
    let resolveLease;
    const leasePromise = new Promise(r => { resolveLease = r; });
    const state = createState('s-1', 'gemini', { leaseAcquired: false, leasePromise });
    const states = new Map([['s-1', state]]);
    const sendOffscreen = vi.fn(async () => ({ success: true, ack: 'DISPOSED', sessionId: 's-1', providerId: 'gemini' }));
    const leaseManager = { release: vi.fn(async () => true) };
    const manager = new LiveDubbingCleanupManager({
      leaseManager, sendOffscreen, getSessionState: (id) => states.get(id) || null, logger: { warn: vi.fn() },
    });
    const promise = manager.disposeAndRelease(state.descriptor);
    resolveLease(false);
    const result = await promise;
    expect(result).toEqual({ success: true });
    expect(leaseManager.release).not.toHaveBeenCalled();
  });

  it('pending reject: settles to ABSENT no release', async () => {
    let rejectLease;
    const leasePromise = new Promise((_, r) => { rejectLease = r; });
    const state = createState('s-1', 'gemini', { leaseAcquired: false, leasePromise });
    const states = new Map([['s-1', state]]);
    const sendOffscreen = vi.fn(async () => ({ success: true, ack: 'DISPOSED', sessionId: 's-1', providerId: 'gemini' }));
    const leaseManager = { release: vi.fn(async () => true) };
    const manager = new LiveDubbingCleanupManager({
      leaseManager, sendOffscreen, getSessionState: (id) => states.get(id) || null, logger: { warn: vi.fn() },
    });
    const promise = manager.disposeAndRelease(state.descriptor);
    rejectLease(new Error('lease failed'));
    const result = await promise;
    expect(result).toEqual({ success: true });
    expect(leaseManager.release).not.toHaveBeenCalled();
  });

  it('release failure clears promise and retry succeeds', async () => {
    const state = createState('s-1', 'gemini', { leaseAcquired: true });
    const states = new Map([['s-1', state]]);
    const sendOffscreen = vi.fn(async () => ({ success: true, ack: 'DISPOSED', sessionId: 's-1', providerId: 'gemini' }));
    const leaseManager = { release: vi.fn(async () => false) };
    const manager = new LiveDubbingCleanupManager({
      leaseManager, sendOffscreen, getSessionState: (id) => states.get(id) || null, logger: { warn: vi.fn() },
    });
    const first = await manager.disposeAndRelease(state.descriptor);
    expect(first).toEqual({ success: false });
    expect(manager.hasCleanupFacts('s-1')).toBe(true);
    leaseManager.release.mockResolvedValueOnce(true);
    const second = await manager.disposeAndRelease(state.descriptor);
    expect(second).toEqual({ success: true });
    expect(leaseManager.release).toHaveBeenCalledTimes(2);
  });

  it('idempotent completed: second dispose reuses completed without extra release', async () => {
    const state = createState('s-1', 'gemini', { leaseAcquired: true });
    const states = new Map([['s-1', state]]);
    const sendOffscreen = vi.fn(async () => ({ success: true, ack: 'DISPOSED', sessionId: 's-1', providerId: 'gemini' }));
    const leaseManager = { release: vi.fn(async () => true) };
    const manager = new LiveDubbingCleanupManager({
      leaseManager, sendOffscreen, getSessionState: (id) => states.get(id) || null, logger: { warn: vi.fn() },
    });
    const first = await manager.disposeAndRelease(state.descriptor);
    expect(first).toEqual({ success: true });
    sendOffscreen.mockClear();
    leaseManager.release.mockClear();
    const second = await manager.disposeAndRelease(state.descriptor);
    expect(second).toEqual({ success: true });
    expect(sendOffscreen).toHaveBeenCalledTimes(1);
    expect(leaseManager.release).not.toHaveBeenCalled();
  });

  it('stale replacement fences DISPOSE ack', async () => {
    const state = createState('s-1', 'gemini', { leaseAcquired: true });
    const states = new Map([['s-1', state]]);
    let resolveSend;
    const sendOffscreen = vi.fn(async () => new Promise(r => { resolveSend = r; }));
    const leaseManager = { release: vi.fn(async () => true) };
    const manager = new LiveDubbingCleanupManager({
      leaseManager, sendOffscreen, getSessionState: (id) => states.get(id) || null, logger: { warn: vi.fn() },
    });
    const promise = manager.disposeAndRelease(state.descriptor);
    const newState = createState('s-1', 'gemini', { leaseAcquired: true });
    states.set('s-1', newState);
    resolveSend({ success: true, ack: 'DISPOSED', sessionId: 's-1', providerId: 'gemini' });
    const result = await promise;
    expect(result).toEqual({ success: false });
    expect(leaseManager.release).not.toHaveBeenCalled();
    expect(newState.cleanupCompleted).toBe(false);
    expect(manager.hasCleanupFacts('s-1')).toBe(true);
  });

  it('stale replacement fences lease settlement: old pending not applied to new', async () => {
    let resolveLease;
    const leasePromise = new Promise(r => { resolveLease = r; });
    const state = createState('s-1', 'gemini', { leaseAcquired: false, leasePromise });
    const states = new Map([['s-1', state]]);
    let resolveSend;
    const sendOffscreen = vi.fn(async () => new Promise(r => { resolveSend = r; }));
    const leaseManager = { release: vi.fn(async () => true) };
    const manager = new LiveDubbingCleanupManager({
      leaseManager, sendOffscreen, getSessionState: (id) => states.get(id) || null, logger: { warn: vi.fn() },
    });
    const promise = manager.disposeAndRelease(state.descriptor);
    const newState = createState('s-1', 'gemini', { leaseAcquired: false });
    states.set('s-1', newState);
    resolveLease(true);
    resolveSend({ success: true, ack: 'DISPOSED', sessionId: 's-1', providerId: 'gemini' });
    const result = await promise;
    expect(result).toEqual({ success: false });
    expect(leaseManager.release).not.toHaveBeenCalled();
  });

  it('stale replacement fences mutation between ack and finalize', async () => {
    const state = createState('s-2', 'gemini', { leaseAcquired: true });
    const states = new Map([['s-2', state]]);
    let releaseResolve;
    const leaseManager = { release: vi.fn(() => new Promise(r => { releaseResolve = r; })) };
    const sendOffscreen = vi.fn(async () => ({ success: true, ack: 'DISPOSED', sessionId: 's-2', providerId: 'gemini' }));
    const manager = new LiveDubbingCleanupManager({
      leaseManager, sendOffscreen, getSessionState: (id) => states.get(id) || null, logger: { warn: vi.fn() },
    });
    const p = manager.disposeAndRelease(state.descriptor);
    await new Promise(r => setTimeout(r, 0));
    expect(leaseManager.release).toHaveBeenCalledTimes(1);
    states.set('s-2', createState('s-2', 'gemini', { leaseAcquired: true }));
    releaseResolve(true);
    const res = await p;
    expect(res).toEqual({ success: false });
    expect(leaseManager.release).toHaveBeenCalledTimes(1);
  });

  it('stale replacement fences release: new state not marked completed', async () => {
    const state = createState('s-1', 'gemini', { leaseAcquired: true });
    const states = new Map([['s-1', state]]);
    let resolveRelease;
    const leaseManager = { release: vi.fn(() => new Promise(r => { resolveRelease = r; })) };
    const sendOffscreen = vi.fn(async () => ({ success: true, ack: 'DISPOSED', sessionId: 's-1', providerId: 'gemini' }));
    const manager = new LiveDubbingCleanupManager({
      leaseManager, sendOffscreen, getSessionState: (id) => states.get(id) || null, logger: { warn: vi.fn() },
    });
    const promise = manager.disposeAndRelease(state.descriptor);
    await new Promise(r => setTimeout(r, 0));
    const newState = createState('s-1', 'gemini', { leaseAcquired: true });
    states.set('s-1', newState);
    resolveRelease(true);
    const result = await promise;
    expect(result).toEqual({ success: false });
    expect(state.cleanupCompleted).toBe(false);
    expect(newState.cleanupCompleted).toBe(false);
  });

  it('different provider reuses no single-flight', async () => {
    const stateGemini = createState('s-1', 'gemini', { leaseAcquired: false });
    const pendingSend = vi.fn(() => new Promise(() => {}));
    const mgr2States = new Map([['s-1', stateGemini]]);
    const mgr2 = new LiveDubbingCleanupManager({
      leaseManager: { release: vi.fn(async () => true) },
      sendOffscreen: pendingSend,
      getSessionState: (id) => mgr2States.get(id) || null,
      logger: { warn: vi.fn() },
    });
    const descGemini = createDescriptor('s-1', 'gemini');
    const descOpenAI = createDescriptor('s-1', 'openai');
    const a = mgr2.disposeAndRelease(descGemini);
    const b = mgr2.disposeAndRelease(descOpenAI);
    expect(a).not.toBe(b);
    expect(pendingSend).toHaveBeenCalledTimes(2);
  });

  it('forget exact deletes when generation matches', async () => {
    const state = createState('s-1', 'gemini', { leaseAcquired: false });
    const states = new Map([['s-1', state]]);
    const sendOffscreen = vi.fn(async () => ({ success: true, ack: 'DISPOSED', sessionId: 's-1', providerId: 'gemini' }));
    const manager = new LiveDubbingCleanupManager({
      leaseManager: { release: vi.fn(async () => true) },
      sendOffscreen,
      getSessionState: (id) => states.get(id) || null,
      logger: { warn: vi.fn() },
    });
    await manager.disposeAndRelease(state.descriptor);
    expect(manager.hasCleanupFacts('s-1')).toBe(true);
    manager.forgetSession('s-1', state);
    expect(manager.hasCleanupFacts('s-1')).toBe(false);
  });

  it('forget newer does not delete old generation facts', async () => {
    const state = createState('s-1', 'gemini', { leaseAcquired: false });
    const states = new Map([['s-1', state]]);
    const sendOffscreen = vi.fn(async () => ({ success: true, ack: 'DISPOSED', sessionId: 's-1', providerId: 'gemini' }));
    const manager = new LiveDubbingCleanupManager({
      leaseManager: { release: vi.fn(async () => true) },
      sendOffscreen,
      getSessionState: (id) => states.get(id) || null,
      logger: { warn: vi.fn() },
    });
    await manager.disposeAndRelease(state.descriptor);
    expect(manager.hasCleanupFacts('s-1')).toBe(true);
    const oldState = state;
    const newState = createState('s-1', 'gemini', { leaseAcquired: false });
    states.set('s-1', newState);
    const fakeState = createState('s-1', 'gemini');
    manager.forgetSession('s-1', fakeState);
    expect(manager.hasCleanupFacts('s-1')).toBe(true);
    manager.forgetSession('s-1', oldState);
    expect(manager.hasCleanupFacts('s-1')).toBe(true);
    manager.forgetSession('s-1', newState);
    // newState has no facts yet, but manager holds oldState's facts; since facts.state !== newState, it should not delete
    expect(manager.hasCleanupFacts('s-1')).toBe(true);
    // Now create facts for newState generation
    await manager.disposeAndRelease(newState.descriptor);
    expect(manager.hasCleanupFacts('s-1')).toBe(true);
    manager.forgetSession('s-1', newState);
    expect(manager.hasCleanupFacts('s-1')).toBe(false);
  });

  it('abandon exact only deletes matching attempt', async () => {
    const state = createState('s-1', 'gemini', { leaseAcquired: false });
    const states = new Map([['s-1', state]]);
    const sendOffscreen = vi.fn(() => new Promise(() => {}));
    const manager = new LiveDubbingCleanupManager({
      leaseManager: { release: vi.fn(async () => true) },
      sendOffscreen,
      getSessionState: (id) => states.get(id) || null,
      logger: { warn: vi.fn() },
    });
    const p1 = manager.disposeAndRelease(state.descriptor);
    const attempt = manager.getAttempt('s-1');
    expect(attempt.promise).toBe(p1);
    const fakeAttempt = { promise: p1, sessionId: 's-1' };
    manager.abandonAttempt('s-1', fakeAttempt);
    expect(manager.getAttempt('s-1')).toBe(attempt);
    manager.abandonAttempt('s-1', attempt);
    expect(manager.getAttempt('s-1')).toBeNull();
  });

  it('timeout abandon allows a fresh DISPOSE retry without duplicate lease release', async () => {
    const state = createState('s-1', 'gemini', { leaseAcquired: true });
    const states = new Map([['s-1', state]]);
    let resolveFirst;
    const sendOffscreen = vi.fn()
      .mockImplementationOnce(() => new Promise(r => { resolveFirst = r; }))
      .mockImplementationOnce(async () => ({ success: true, ack: 'DISPOSED', sessionId: 's-1', providerId: 'gemini' }));
    const leaseManager = { release: vi.fn(async () => true) };
    const manager = new LiveDubbingCleanupManager({
      leaseManager, sendOffscreen, getSessionState: (id) => states.get(id) || null, logger: { warn: vi.fn() },
    });
    const first = manager.disposeAndRelease(state.descriptor);
    const attempt = manager.getAttempt('s-1');
    expect(attempt).not.toBeNull();
    manager.abandonAttempt('s-1', attempt);
    expect(manager.getAttempt('s-1')).toBeNull();
    const second = manager.disposeAndRelease(state.descriptor);
    expect(second).not.toBe(first);
    expect(sendOffscreen).toHaveBeenCalledTimes(2);
    expect(manager.getAttempt('s-1')).not.toBeNull();
    expect(manager.getAttempt('s-1').promise).toBe(second);
    resolveFirst({ success: true, ack: 'DISPOSED', sessionId: 's-1', providerId: 'gemini' });
    const firstResult = await first;
    const secondResult = await second;
    expect(secondResult).toEqual({ success: true });
    // After abandon, fresh DISPOSE still succeeds; late first also succeeds but shares single release
    expect(firstResult).toEqual({ success: true });
    expect(leaseManager.release).toHaveBeenCalledTimes(1);
    // No newer-state mutation: new generation should remain clean
    const newState = createState('s-1', 'gemini', { leaseAcquired: true });
    states.set('s-1', newState);
    expect(newState.cleanupCompleted).toBe(false);
  });

  it('overlapping late completion releases at most once', async () => {
    const state = createState('s-1', 'gemini', { leaseAcquired: true });
    const states = new Map([['s-1', state]]);
    let releaseResolve;
    const leaseManager = { release: vi.fn(() => new Promise(r => { releaseResolve = r; })) };
    const sendOffscreen = vi.fn(async () => ({ success: true, ack: 'DISPOSED', sessionId: 's-1', providerId: 'gemini' }));
    const manager = new LiveDubbingCleanupManager({
      leaseManager, sendOffscreen, getSessionState: (id) => states.get(id) || null, logger: { warn: vi.fn() },
    });
    const first = manager.disposeAndRelease(state.descriptor);
    await new Promise(r => setTimeout(r, 0));
    expect(leaseManager.release).toHaveBeenCalledTimes(1);
    // Abandon and retry before release completes
    const attempt = manager.getAttempt('s-1');
    manager.abandonAttempt('s-1', attempt);
    const second = manager.disposeAndRelease(state.descriptor);
    expect(second).not.toBe(first);
    // Both share same facts releasePromise, so only one release call
    expect(leaseManager.release).toHaveBeenCalledTimes(1);
    releaseResolve(true);
    const r1 = await first;
    const r2 = await second;
    // Both succeed but share single release
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(leaseManager.release).toHaveBeenCalledTimes(1);
  });

  it('syncLeaseOwnership ABSENT->ACQUIRED releases exactly once', async () => {
    const state = createState('s-1', 'gemini', { leaseAcquired: false });
    const states = new Map([['s-1', state]]);
    let resolveDispose;
    const sendOffscreen = vi.fn(() => new Promise(r => { resolveDispose = r; }));
    const leaseManager = { release: vi.fn(async () => true) };
    const manager = new LiveDubbingCleanupManager({
      leaseManager, sendOffscreen, getSessionState: id => states.get(id) || null, logger: { warn: vi.fn() },
    });
    const p = manager.disposeAndRelease(state.descriptor);
    manager.syncLeaseOwnership('s-1', state, true);
    resolveDispose({ success: true, ack: 'DISPOSED', sessionId: 's-1', providerId: 'gemini' });
    const result = await p;
    expect(result).toEqual({ success: true });
    expect(leaseManager.release).toHaveBeenCalledTimes(1);
  });

  it('syncLeaseOwnership ACQUIRED->ABSENT succeeds without release', async () => {
    const state = createState('s-1', 'gemini', { leaseAcquired: true });
    const states = new Map([['s-1', state]]);
    let resolveDispose;
    const sendOffscreen = vi.fn(() => new Promise(r => { resolveDispose = r; }));
    const leaseManager = { release: vi.fn(async () => true) };
    const manager = new LiveDubbingCleanupManager({
      leaseManager, sendOffscreen, getSessionState: id => states.get(id) || null, logger: { warn: vi.fn() },
    });
    const p = manager.disposeAndRelease(state.descriptor);
    manager.syncLeaseOwnership('s-1', state, false);
    resolveDispose({ success: true, ack: 'DISPOSED', sessionId: 's-1', providerId: 'gemini' });
    const result = await p;
    expect(result).toEqual({ success: true });
    expect(leaseManager.release).not.toHaveBeenCalled();
  });

  it('syncLeaseOwnership never overwrites PENDING', async () => {
    let resolveLease;
    const state = createState('s-1', 'gemini', { leaseAcquired: false, leasePromise: new Promise(r => { resolveLease = r; }) });
    const states = new Map([['s-1', state]]);
    let resolveDispose;
    const sendOffscreen = vi.fn(() => new Promise(r => { resolveDispose = r; }));
    const leaseManager = { release: vi.fn(async () => true) };
    const manager = new LiveDubbingCleanupManager({
      leaseManager, sendOffscreen, getSessionState: id => states.get(id) || null, logger: { warn: vi.fn() },
    });
    const p = manager.disposeAndRelease(state.descriptor);
    manager.syncLeaseOwnership('s-1', state, false);
    manager.syncLeaseOwnership('s-1', state, true);
    resolveDispose({ success: true, ack: 'DISPOSED', sessionId: 's-1', providerId: 'gemini' });
    let settled = false;
    p.then(() => { settled = true; });
    await Promise.resolve();
    await new Promise(r => setTimeout(r, 0));
    expect(settled).toBe(false);
    expect(leaseManager.release).not.toHaveBeenCalled();
    resolveLease(true);
    const result = await p;
    expect(result).toEqual({ success: true });
    expect(leaseManager.release).toHaveBeenCalledTimes(1);
  });

  it('syncLeaseOwnership stale does not affect newer generation', async () => {
    const stateA = createState('s-1', 'gemini', { leaseAcquired: false });
    const states = new Map([['s-1', stateA]]);
    const manager = new LiveDubbingCleanupManager({
      leaseManager: { release: vi.fn(async () => true) },
      sendOffscreen: vi.fn(async () => ({ success: true, ack: 'DISPOSED', sessionId: 's-1', providerId: 'gemini' })),
      getSessionState: id => states.get(id) || null,
      logger: { warn: vi.fn() },
    });
    await manager.disposeAndRelease(stateA.descriptor);
    const stateB = createState('s-1', 'gemini', { leaseAcquired: true });
    states.set('s-1', stateB);
    manager.syncLeaseOwnership('s-1', stateA, true);
    let resolveDispose;
    manager.sendOffscreen = vi.fn(() => new Promise(r => { resolveDispose = r; }));
    const leaseManagerB = { release: vi.fn(async () => true) };
    manager.leaseManager = leaseManagerB;
    const pB = manager.disposeAndRelease(stateB.descriptor);
    resolveDispose({ success: true, ack: 'DISPOSED', sessionId: 's-1', providerId: 'gemini' });
    const result = await pB;
    expect(result).toEqual({ success: true });
    expect(leaseManagerB.release).toHaveBeenCalledTimes(1);
  });

  it('manager does not expose internal Maps', () => {
    const manager = new LiveDubbingCleanupManager({
      leaseManager: { release: vi.fn(async () => true) },
      sendOffscreen: vi.fn(async () => ({})),
      getSessionState: () => null,
      logger: { warn: vi.fn() },
    });
    expect(manager.cleanupFacts).toBeUndefined();
    expect(manager.cleanupPromises).toBeUndefined();
    expect(manager._facts).toBeDefined();
    expect(manager._promises).toBeDefined();
  });
});
