import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVE_DUBBING_ACTIONS } from '@/features/live-dubbing/constants.js';
import { FIREFOX_CONTENT_TARGET } from '@/features/live-dubbing/firefox/firefoxContentContract.js';
import { LIVE_DUBBING_FEATURE_NAME } from '@/features/live-dubbing/handlers/LiveDubbingFeatureHandler.js';
import { LiveDubbingFeatureHandler } from '@/features/live-dubbing/handlers/LiveDubbingFeatureHandler.js';

const mocks = vi.hoisted(() => ({
  exclusionChecker: {
    updateUrl: vi.fn(),
    isFeatureAllowed: vi.fn().mockResolvedValue(true),
    refreshSettings: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined),
  },
  storageManagerOn: vi.fn(),
  storageManagerOff: vi.fn(),
}));

vi.mock('@/features/exclusion/core/ExclusionChecker.js', () => ({
  ExclusionChecker: {
    getInstance: () => mocks.exclusionChecker,
    resetInstance: vi.fn(),
  },
}));

vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  storageManager: {
    on: mocks.storageManagerOn,
    off: mocks.storageManagerOff,
  },
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    init: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: { getInstance: () => ({ handle: vi.fn() }) },
}));

vi.mock('@/shared/error-management/ErrorTypes.js', () => ({
  ErrorTypes: {},
}));

vi.mock('@/handlers/content/ContentMessageHandler.js', () => ({
  default: { resetInstance: vi.fn(() => Promise.resolve()) },
}));

vi.mock('@/features/windows/managers/WindowsManager.js', () => ({
  WindowsManager: { resetInstance: vi.fn(() => Promise.resolve()) },
}));

vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({
  sendMessage: vi.fn().mockResolvedValue({ success: true }),
  sendRegularMessage: vi.fn(),
}));

vi.mock('@/shared/messaging/core/MessageActions.js', () => ({
  MessageActions: { DEACTIVATE_SELECT_ELEMENT_MODE: 'DEACTIVATE_SELECT_ELEMENT_MODE' },
}));

import { FeatureManager } from '@/core/managers/content/FeatureManager.js';
import { bootstrapContentRuntimeInfrastructure } from './contentRuntimeBootstrap.js';

function createRuntime() {
  const listeners = new Set();
  return {
    id: 'extension-id',
    getURL: (path = '') => `chrome-extension://extension-id/${path}`,
    onMessage: {
      addListener: vi.fn(listener => listeners.add(listener)),
      removeListener: vi.fn(listener => listeners.delete(listener)),
      listeners,
    },
  };
}

function prepareMessage(sessionId) {
  return {
    target: FIREFOX_CONTENT_TARGET,
    action: LIVE_DUBBING_ACTIONS.PREPARE,
    data: {
      sessionId,
      providerId: 'gemini',
      tabId: 7,
      frameId: 0,
      documentId: 'doc-1',
      targetLanguage: 'en',
      eventSequence: 0,
    },
  };
}

function statusMessage(sessionId) {
  return { ...prepareMessage(sessionId), action: LIVE_DUBBING_ACTIONS.STATUS };
}

function createMediaDocument() {
  const track = { kind: 'audio', readyState: 'live', stop: vi.fn() };
  const stream = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  };
  const media = {
    isConnected: true,
    paused: false,
    ended: false,
    readyState: 2,
    captureStream: vi.fn(() => stream),
  };
  return {
    querySelectorAll: selector => (selector === 'video' ? [media] : []),
  };
}

async function flushMicrotasks(rounds = 10) {
  for (let i = 0; i < rounds; i += 1) await Promise.resolve();
}

describe('content runtime teardown barrier with the real FeatureManager', () => {
  beforeEach(() => vi.stubGlobal('document', createMediaDocument()));
  afterEach(() => vi.unstubAllGlobals());

  it('fresh PREPARE cannot adopt the old active handler while teardown is pending', async () => {
    // Controllably-pending handler teardown; everything else is the real
    // production composition (bootstrap seam, host, manager, handler).
    let resolveTeardown;
    const teardownGate = new Promise(resolve => { resolveTeardown = resolve; });
    const deactivateSpy = vi
      .spyOn(LiveDubbingFeatureHandler.prototype, 'deactivate')
      .mockImplementationOnce(() => teardownGate);

    const runtime = createRuntime();
    const record = bootstrapContentRuntimeInfrastructure({
      browserName: 'firefox',
      browserAPI: { runtime },
    });
    expect(record).not.toBeNull();
    try {
      const [listener] = [...runtime.onMessage.listeners];
      const sender = { id: 'extension-id' };
      const manager = FeatureManager.getInstance();

      const readyA = await listener(prepareMessage('session-a'), sender);
      expect(readyA).toMatchObject({ success: true, ack: 'READY' });
      const handlerA = manager.getFeatureHandler(LIVE_DUBBING_FEATURE_NAME);
      expect(handlerA).not.toBeFalsy();
      expect(manager.isFeatureActive(LIVE_DUBBING_FEATURE_NAME)).toBe(true);

      // Navigation invalidates A while its teardown stays pending. The
      // production seam reaches the manager asynchronously, so flush before
      // asserting; the teardown gate itself stays pending regardless.
      record.host.invalidate('NAVIGATION');
      await flushMicrotasks();
      expect(deactivateSpy).toHaveBeenCalledTimes(1);

      // B arrives while teardown is in flight: it must not adopt the old
      // active handler and must not activate anything yet.
      let bSettled = false;
      const bPromise = listener(prepareMessage('session-b'), sender).then(response => {
        bSettled = true;
        return response;
      });
      await flushMicrotasks();
      expect(bSettled).toBe(false);
      expect(record.host.session).toBeNull();
      expect(manager.getFeatureHandler(LIVE_DUBBING_FEATURE_NAME)).toBe(handlerA);

      // Resolving A's teardown lets B activate a fresh handler instance.
      resolveTeardown(true);
      const readyB = await bPromise;
      expect(readyB).toMatchObject({ success: true, ack: 'READY' });
      const handlerB = manager.getFeatureHandler(LIVE_DUBBING_FEATURE_NAME);
      expect(handlerB).not.toBeFalsy();
      expect(handlerB).not.toBe(handlerA);
      expect(manager.isFeatureActive(LIVE_DUBBING_FEATURE_NAME)).toBe(true);

      // Late settlement cannot remove B: STATUS still reports B active and
      // the manager still owns B's handler.
      await flushMicrotasks();
      const statusB = await listener(statusMessage('session-b'), sender);
      expect(statusB).toMatchObject({ success: true, active: true, prepared: true });
      expect(manager.getFeatureHandler(LIVE_DUBBING_FEATURE_NAME)).toBe(handlerB);
      expect(record.host.session?.sessionId).toBe('session-b');
      expect(deactivateSpy).toHaveBeenCalledTimes(1);
    } finally {
      deactivateSpy.mockRestore();
      record.unregister();
      await FeatureManager.resetInstance();
    }
  });

  it('failed teardown stays barred with deterministic retry until confirmed clean', async () => {
    // Persistently failing handler teardown; everything else is the real
    // production composition. The manager swallows the throw but keeps the
    // handler registered, so the seam cannot confirm cleanup.
    const originalDeactivate = LiveDubbingFeatureHandler.prototype.deactivate;
    const deactivateSpy = vi
      .spyOn(LiveDubbingFeatureHandler.prototype, 'deactivate')
      .mockImplementation(async () => { throw new Error('teardown failed'); });

    const runtime = createRuntime();
    const record = bootstrapContentRuntimeInfrastructure({
      browserName: 'firefox',
      browserAPI: { runtime },
    });
    expect(record).not.toBeNull();
    try {
      const [listener] = [...runtime.onMessage.listeners];
      const sender = { id: 'extension-id' };
      const manager = FeatureManager.getInstance();
      const requestSpy = vi.spyOn(manager, 'requestFeatureActivation');
      const managerDeactivateCalls = [];
      vi.spyOn(manager, 'deactivateFeature').mockImplementation((...args) => {
        managerDeactivateCalls.push(args[0]);
        return FeatureManager.prototype.deactivateFeature.apply(manager, args);
      });

      // A activates the real feature.
      expect(await listener(prepareMessage('session-a'), sender))
        .toMatchObject({ success: true, ack: 'READY' });
      const handlerA = manager.getFeatureHandler(LIVE_DUBBING_FEATURE_NAME);
      expect(manager.isFeatureActive(LIVE_DUBBING_FEATURE_NAME)).toBe(true);

      // Navigation terminalizes A, but teardown cannot confirm cleanup: the
      // handler stays registered and active.
      record.host.invalidate('NAVIGATION');
      await flushMicrotasks();
      expect(deactivateSpy).toHaveBeenCalledTimes(1);
      expect(manager.isFeatureActive(LIVE_DUBBING_FEATURE_NAME)).toBe(true);
      expect(record.host.session).toBeNull();

      // B fails closed with no second runtime: same old handler, no session,
      // and no further activation attempts while barred.
      expect(await listener(prepareMessage('session-b'), sender))
        .toMatchObject({ success: false, error: 'LIVE_DUBBING_ACTIVATION_BLOCKED' });
      expect(record.host.session).toBeNull();
      expect(manager.getFeatureHandler(LIVE_DUBBING_FEATURE_NAME)).toBe(handlerA);
      expect(requestSpy).toHaveBeenCalledTimes(1);

      // Deterministic retry while still failing: same closed outcome, one
      // controlled attempt per PREPARE, barrier retained.
      expect(await listener(prepareMessage('session-b'), sender))
        .toMatchObject({ success: false, error: 'LIVE_DUBBING_ACTIVATION_BLOCKED' });
      expect(deactivateSpy).toHaveBeenCalledTimes(3);
      expect(requestSpy).toHaveBeenCalledTimes(1);

      // Confirmed retry success releases the barrier; B activates normally
      // through the single manager with a fresh handler.
      const registeredHandler = manager.getFeatureHandler(LIVE_DUBBING_FEATURE_NAME);
      expect(registeredHandler).toBe(handlerA);
      const implCalls = [];
      deactivateSpy.mockImplementation(() => originalDeactivate.call(registeredHandler).then(
        value => {
          implCalls.push(`resolved:${value}`);
          return value;
        },
        error => {
          implCalls.push(`rejected:${error?.message}`);
          throw error;
        },
      ));
      // Pre-heal invariants: three controlled attempts so far, one activation.
      expect(deactivateSpy).toHaveBeenCalledTimes(3);
      expect(requestSpy).toHaveBeenCalledTimes(1);
      expect(record.host.teardown?.cleaned).toBe(false);
      expect(record.host.teardownTimeoutMs).toBe(10000);
      const healResponse = await listener(prepareMessage('session-b'), sender);
      expect(managerDeactivateCalls).toEqual([
        'liveDubbing',
        'liveDubbing',
        'liveDubbing',
        'liveDubbing',
      ]);
      expect(implCalls).toEqual(['resolved:true']);
      expect(deactivateSpy).toHaveBeenCalledTimes(4);
      expect(requestSpy).toHaveBeenCalledTimes(2);
      expect(record.host.teardown).toBeNull();
      expect(healResponse).toMatchObject({ success: true, ack: 'READY' });
      const handlerB = manager.getFeatureHandler(LIVE_DUBBING_FEATURE_NAME);
      expect(handlerB).not.toBeFalsy();
      expect(handlerB).not.toBe(handlerA);
      expect(manager.isFeatureActive(LIVE_DUBBING_FEATURE_NAME)).toBe(true);

      // Late stability: STATUS reports B active and the manager still owns B.
      const statusB = await listener(statusMessage('session-b'), sender);
      expect(statusB).toMatchObject({ success: true, active: true, prepared: true });
      expect(manager.getFeatureHandler(LIVE_DUBBING_FEATURE_NAME)).toBe(handlerB);
      expect(record.host.session?.sessionId).toBe('session-b');
      expect(deactivateSpy).toHaveBeenCalledTimes(4);
    } finally {
      deactivateSpy.mockRestore();
      record.unregister();
      await FeatureManager.resetInstance();
    }
  });

  it('retains a false handler cleanup result until a later retry confirms clean', async () => {
    let resolveTeardown;
    const teardownGate = new Promise(resolve => { resolveTeardown = resolve; });
    const deactivateSpy = vi
      .spyOn(LiveDubbingFeatureHandler.prototype, 'deactivate')
      .mockImplementationOnce(() => teardownGate);

    const runtime = createRuntime();
    const record = bootstrapContentRuntimeInfrastructure({
      browserName: 'firefox',
      browserAPI: { runtime },
    });
    expect(record).not.toBeNull();
    try {
      const [listener] = [...runtime.onMessage.listeners];
      const sender = { id: 'extension-id' };
      const manager = FeatureManager.getInstance();
      const requestSpy = vi.spyOn(manager, 'requestFeatureActivation');

      expect(await listener(prepareMessage('session-a'), sender))
        .toMatchObject({ success: true, ack: 'READY' });
      const handlerA = manager.getFeatureHandler(LIVE_DUBBING_FEATURE_NAME);
      record.host.invalidate('NAVIGATION');
      await flushMicrotasks();
      expect(deactivateSpy).toHaveBeenCalledTimes(1);

      let bSettled = false;
      const bPromise = listener(prepareMessage('session-b'), sender).then(response => {
        bSettled = true;
        return response;
      });
      await flushMicrotasks();
      expect(bSettled).toBe(false);
      expect(manager.isFeatureActive(LIVE_DUBBING_FEATURE_NAME)).toBe(true);

      // A settled false result bars adoption and retains A for retry.
      resolveTeardown(false);
      expect(await bPromise)
        .toMatchObject({ success: false, error: 'LIVE_DUBBING_ACTIVATION_BLOCKED' });
      expect(record.host.session).toBeNull();
      expect(manager.getFeatureHandler(LIVE_DUBBING_FEATURE_NAME)).toBe(handlerA);
      expect(requestSpy).toHaveBeenCalledTimes(1);

      // The next controlled retry invokes the retained handler and releases
      // B only after the manager reports it inactive.
      const readyB = await listener(prepareMessage('session-b'), sender);
      expect(deactivateSpy).toHaveBeenCalledTimes(2);
      expect(requestSpy).toHaveBeenCalledTimes(2);
      expect(readyB).toMatchObject({ success: true, ack: 'READY' });
      const handlerB = manager.getFeatureHandler(LIVE_DUBBING_FEATURE_NAME);
      expect(handlerB).not.toBe(handlerA);
      expect(manager.isFeatureActive(LIVE_DUBBING_FEATURE_NAME)).toBe(true);
    } finally {
      deactivateSpy.mockRestore();
      record.unregister();
      await FeatureManager.resetInstance();
    }
  });
});
