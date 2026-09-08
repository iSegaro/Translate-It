import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveDubbingCoordinator } from './LiveDubbingCoordinator.js';
import {
  LIVE_DUBBING_OWNER,
  LIVE_DUBBING_STORAGE_KEY,
  LIVE_DUBBING_STORAGE_STATE,
  LIVE_DUBBING_STATUS,
} from '../constants.js';

function createHarness({ stored = null, streamId = 'stream-secret', statusResponse, documentExists } = {}) {
  const storage = new Map(stored ? [[LIVE_DUBBING_STORAGE_KEY, stored]] : []);
  const calls = [];
  const logger = { warn: vi.fn() };
  const manager = {
    documentExists,
    activeLeases: [],
    acquire: vi.fn(async lease => {
      calls.push(['acquire', lease]);
      manager.activeLeases = [lease];
      return true;
    }),
    release: vi.fn(async lease => {
      calls.push(['release', lease]);
      manager.activeLeases = manager.activeLeases.filter(item => item.leaseId !== lease.leaseId);
      return true;
    }),
    ensureDocument: vi.fn(),
    getSnapshot: vi.fn(() => ({ documentExists: manager.documentExists, activeLeases: manager.activeLeases })),
  };
  const sendMessage = vi.fn(async message => {
    calls.push(['message', message]);
    if (message.action === 'LIVE_DUBBING_PREPARE') {
      return { success: true, ack: 'READY', sessionId: message.data.sessionId };
    }
    if (message.action === 'LIVE_DUBBING_CONSUME') {
      return { success: true, ack: 'MEDIA_ACQUIRED', sessionId: message.data.sessionId };
    }
    if (message.action === 'LIVE_DUBBING_DISPOSE') {
      return { success: true, ack: 'DISPOSED', sessionId: message.data.sessionId };
    }
    if (message.action === 'LIVE_DUBBING_STATUS') {
      return statusResponse || { success: true, active: false, sessionId: message.data.sessionId };
    }
    return { success: true };
  });
  const browserAPI = {
    runtime: { sendMessage },
    storage: {
      session: {
        get: vi.fn(async key => ({ [key]: storage.get(key) })),
        set: vi.fn(async record => Object.entries(record).forEach(([key, value]) => storage.set(key, value))),
        remove: vi.fn(async key => storage.delete(key)),
      },
    },
    tabs: {
      query: vi.fn(async () => [{ id: 42, url: 'https://example.test' }]),
      get: vi.fn(async id => ({ id, url: 'https://example.test' })),
    },
  };
  const chromeAPI = {
    tabCapture: {
      getMediaStreamId: vi.fn(async () => streamId),
    },
  };

  return {
    calls,
    storage,
    manager,
    browserAPI,
    chromeAPI,
    coordinator: new LiveDubbingCoordinator({
      browserAPI,
      chromeAPI,
      leaseManager: manager,
      uuid: () => 'session-1',
      now: () => 123,
      logger,
    }),
    logger,
  };
}

describe('LiveDubbingCoordinator', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('acquires lease, prepares offscreen, forwards stream ID only to consume, then reports active', async () => {
    const harness = createHarness();
    const result = await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});

    expect(result.success).toBe(true);
    expect(harness.manager.acquire).toHaveBeenCalledWith({
      owner: LIVE_DUBBING_OWNER,
      leaseId: 'session-1',
      requiredReasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
    });
    expect(harness.chromeAPI.tabCapture.getMediaStreamId).toHaveBeenCalledWith({ targetTabId: 42 });

    const messages = harness.browserAPI.runtime.sendMessage.mock.calls.map(([message]) => message);
    expect(messages.map(message => message.action)).toEqual([
      'LIVE_DUBBING_PREPARE',
      'LIVE_DUBBING_CONSUME',
    ]);
    expect(messages[0].data).not.toHaveProperty('streamId');
    expect(messages[1]).toMatchObject({ target: 'offscreen', data: { streamId: 'stream-secret' } });
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY)).not.toHaveProperty('streamId');
    expect(result.status.status).toBe('CAPTURING');
  });

  it('returns current status for duplicate start and ignores stale stop', async () => {
    const harness = createHarness();
    const first = await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    const duplicate = await harness.coordinator.start({ data: { targetLanguage: 'de' } }, {});
    const stale = await harness.coordinator.stop({ data: { sessionId: 'old-session' } });

    expect(first.success).toBe(true);
    expect(duplicate).toMatchObject({ success: false, busy: true, current: { sessionId: 'session-1' } });
    expect(stale).toMatchObject({ success: true, ignored: true });
    expect(harness.manager.release).not.toHaveBeenCalled();
  });

  it('disposes before releasing exact lease when capture start fails', async () => {
    const harness = createHarness();
    harness.chromeAPI.tabCapture.getMediaStreamId.mockRejectedValueOnce(new Error('capture failed'));

    const result = await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    const orderedKinds = harness.calls.map(([kind]) => kind);

    expect(result).toMatchObject({ success: false, error: 'LIVE_DUBBING_START_FAILED' });
    expect(orderedKinds).toEqual(['acquire', 'message', 'message', 'release']);
    expect(harness.calls[1][1].action).toBe('LIVE_DUBBING_PREPARE');
    expect(harness.calls[2][1].action).toBe('LIVE_DUBBING_DISPOSE');
    expect(harness.manager.release).toHaveBeenCalledWith({ owner: LIVE_DUBBING_OWNER, leaseId: 'session-1' });
    expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
  });

  it('logs sanitized media-stream diagnostics with preserved stage', async () => {
    const harness = createHarness();
    const failure = new Error('permission denied at https://example.test/capture');
    failure.name = 'NotAllowedError';
    harness.chromeAPI.tabCapture.getMediaStreamId.mockRejectedValueOnce(failure);

    const result = await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    const diagnostic = harness.logger.warn.mock.calls
      .find(([message]) => message === 'Live dubbing capture failed')?.[1];

    expect(result).toMatchObject({ success: false, error: 'LIVE_DUBBING_START_FAILED' });
    expect(result).not.toHaveProperty('diagnostic');
    expect(diagnostic).toEqual({
      stage: 'GET_MEDIA_STREAM_ID',
      error: {
        name: 'NotAllowedError',
        message: 'permission denied at [redacted-url]',
      },
    });
    expect(JSON.stringify(diagnostic)).not.toContain('example.test');
  });

  it('attributes an unusable stream ID result to GET_MEDIA_STREAM_ID', async () => {
    const harness = createHarness({ streamId: null });

    const result = await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    const diagnostic = harness.logger.warn.mock.calls
      .find(([message]) => message === 'Live dubbing capture failed')?.[1];

    expect(result).toMatchObject({ success: false, error: 'LIVE_DUBBING_START_FAILED' });
    expect(diagnostic).toMatchObject({ stage: 'GET_MEDIA_STREAM_ID' });
    expect(JSON.stringify(diagnostic)).not.toContain('stream-secret');
  });

  it('logs OFFSCREEN_PREPARE diagnostics without returning them to caller', async () => {
    const harness = createHarness();
    harness.browserAPI.runtime.sendMessage.mockImplementationOnce(async message => {
      harness.calls.push(['message', message]);
      return {
        success: false,
        error: 'LIVE_DUBBING_SESSION_BUSY',
        diagnostic: {
          stage: 'OFFSCREEN_PREPARE',
          error: {
            name: 'SessionBusyError',
            message: 'payload: stream-secret at https://example.test',
            code: 'LIVE_DUBBING_SESSION_BUSY',
          },
        },
      };
    });

    const result = await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    const diagnostic = harness.logger.warn.mock.calls
      .find(([message]) => message === 'Live dubbing capture failed')?.[1];

    expect(result).toMatchObject({ success: false, error: 'LIVE_DUBBING_START_FAILED' });
    expect(result).not.toHaveProperty('diagnostic');
    expect(diagnostic).toMatchObject({
      stage: 'OFFSCREEN_PREPARE',
      error: {
        name: 'SessionBusyError',
        code: 'LIVE_DUBBING_SESSION_BUSY',
      },
    });
    expect(diagnostic.error.message).not.toContain('stream-secret');
    expect(diagnostic.error.message).not.toContain('example.test');
  });

  it('fails closed when storage becomes unreadable while a session is active', async () => {
    const harness = createHarness();
    await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    harness.browserAPI.storage.session.get.mockRejectedValueOnce(new Error('temporary storage failure'));

    const blocked = await harness.coordinator.start({ data: { targetLanguage: 'de' } }, {});

    expect(blocked).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_STORAGE_UNREADABLE',
      retryable: true,
      status: { sessionId: 'session-1', status: LIVE_DUBBING_STATUS.CAPTURING },
    });
    expect(harness.coordinator.storageState).toBe(LIVE_DUBBING_STORAGE_STATE.UNREADABLE);
    expect(harness.manager.acquire).toHaveBeenCalledOnce();
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY)).toMatchObject({
      sessionId: 'session-1',
      status: LIVE_DUBBING_STATUS.CAPTURING,
    });

    const retry = await harness.coordinator.start({ data: { targetLanguage: 'de' } }, {});
    expect(retry).toMatchObject({ busy: true, current: { sessionId: 'session-1' } });
    expect(harness.manager.acquire).toHaveBeenCalledOnce();
  });

  it('uses active sender tab, and never trusts a popup tab ID payload', async () => {
    const harness = createHarness();
    await harness.coordinator.start({ data: { targetLanguage: 'en', tabId: 999 } }, {
      tab: { id: 42 },
    });

    expect(harness.browserAPI.tabs.query).not.toHaveBeenCalled();
    expect(harness.chromeAPI.tabCapture.getMediaStreamId).toHaveBeenCalledWith({ targetTabId: 42 });
  });

  it('stops on matching session, repeated stop is idempotent, and tab events ignore other tabs', async () => {
    const harness = createHarness();
    const started = await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});

    const otherTab = await harness.coordinator.handleTabRemoved(99);
    const stopped = await harness.coordinator.stop({ data: { sessionId: started.status.sessionId } });
    const repeated = await harness.coordinator.stop({ data: { sessionId: started.status.sessionId } });
    const actions = harness.browserAPI.runtime.sendMessage.mock.calls.map(([message]) => message.action);

    expect(otherTab).toMatchObject({ ignored: true, stopped: false });
    expect(stopped).toMatchObject({ success: true, stopped: true });
    expect(repeated).toMatchObject({ success: true, idempotent: true });
    expect(harness.coordinator.sessionStates.has(started.status.sessionId)).toBe(false);
    expect(actions).toEqual(['LIVE_DUBBING_PREPARE', 'LIVE_DUBBING_CONSUME', 'LIVE_DUBBING_DISPOSE']);
  });

  it('retains terminal ownership when descriptor clear fails after exact disposal and release', async () => {
    const harness = createHarness();
    await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    harness.browserAPI.storage.session.remove.mockRejectedValueOnce(new Error('storage unavailable'));

    const failed = await harness.coordinator.stop({ data: { sessionId: 'session-1' } });
    const retried = await harness.coordinator.stop({ data: { sessionId: 'session-1' } });
    const disposeMessages = harness.browserAPI.runtime.sendMessage.mock.calls
      .map(([message]) => message)
      .filter(message => message.action === 'LIVE_DUBBING_DISPOSE');

    expect(failed).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_STORAGE_CLEAR_FAILED',
      retryable: true,
      cleanupPending: true,
      status: { sessionId: 'session-1', status: LIVE_DUBBING_STATUS.STOPPING },
    });
    expect(failed).not.toHaveProperty('ignored');
    expect(failed).not.toHaveProperty('stopped', true);
    expect(retried).toMatchObject({ success: true, stopped: true, status: null });
    expect(disposeMessages).toHaveLength(1);
    expect(harness.manager.release).toHaveBeenCalledTimes(1);
    expect(harness.manager.release).toHaveBeenCalledWith({
      owner: LIVE_DUBBING_OWNER,
      leaseId: 'session-1',
    });
    expect(harness.coordinator.sessionStates.has('session-1')).toBe(false);
    expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
  });

  it('retains a cancelled pre-capture descriptor until a failed clear can be retried', async () => {
    const harness = createHarness();
    let resolveTabs;
    harness.browserAPI.tabs.query.mockImplementationOnce(() => new Promise(resolve => {
      resolveTabs = resolve;
    }));
    const startPromise = harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});

    while (!resolveTabs) await Promise.resolve();
    const pendingStop = await harness.coordinator.stop({ data: { sessionId: 'session-1' } });
    harness.browserAPI.storage.session.remove.mockRejectedValueOnce(new Error('storage unavailable'));
    resolveTabs([{ id: 42, url: 'https://example.test' }]);

    const failedStart = await startPromise;
    expect(pendingStop).toMatchObject({ success: true, pending: true, stopped: false });
    expect(failedStart).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_STORAGE_CLEAR_FAILED',
      retryable: true,
      cleanupPending: true,
      status: { sessionId: 'session-1', status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE },
    });
    expect(harness.coordinator.sessionStates.has('session-1')).toBe(true);
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY)).toMatchObject({
      sessionId: 'session-1',
      status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
    });
    expect(harness.manager.acquire).not.toHaveBeenCalled();
    expect(harness.browserAPI.runtime.sendMessage).not.toHaveBeenCalled();

    const retried = await harness.coordinator.stop({ data: { sessionId: 'session-1' } });

    expect(retried).toMatchObject({ success: true, stopped: true, status: null });
    expect(harness.coordinator.sessionStates.has('session-1')).toBe(false);
    expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
    expect(harness.manager.release).not.toHaveBeenCalled();
    expect(harness.browserAPI.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('does not release lease after stale ignored dispose response', async () => {
    const harness = createHarness();
    await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    harness.browserAPI.runtime.sendMessage.mockImplementationOnce(async message => {
      harness.calls.push(['message', message]);
      return {
        success: true,
        ack: 'DISPOSED',
        disposed: true,
        ignored: true,
        sessionId: 'stale-session',
      };
    });

    const result = await harness.coordinator.stop({ data: { sessionId: 'session-1' } });

    expect(result).toMatchObject({ success: false, error: 'STOP_FAILED', cleanupPending: true });
    expect(harness.manager.release).not.toHaveBeenCalled();
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY)).toMatchObject({
      sessionId: 'session-1',
      status: LIVE_DUBBING_STATUS.ERROR,
    });
  });

  it('stops matching session on top-level navigation', async () => {
    const harness = createHarness();
    await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});

    const result = await harness.coordinator.handleTopLevelNavigation(42);

    expect(result).toMatchObject({ success: true, stopped: true, reason: 'TOP_LEVEL_NAVIGATION' });
    expect(harness.manager.release).toHaveBeenCalledOnce();
  });

  it('does not serialize tab teardown behind pending offscreen capture', async () => {
    const harness = createHarness();
    let resolveConsume;
    harness.browserAPI.runtime.sendMessage.mockImplementation(async message => {
      harness.calls.push(['message', message]);
      if (message.action === 'LIVE_DUBBING_PREPARE') {
        return { success: true, ack: 'READY', sessionId: message.data.sessionId };
      }
      if (message.action === 'LIVE_DUBBING_CONSUME') {
        return new Promise(resolve => { resolveConsume = resolve; });
      }
      if (message.action === 'LIVE_DUBBING_DISPOSE') {
        return { success: true, ack: 'DISPOSED', disposed: true, sessionId: message.data.sessionId };
      }
      return { success: true };
    });

    const startPromise = harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    while (!resolveConsume) await Promise.resolve();

    const stopResult = await harness.coordinator.handleTabRemoved(42);
    expect(stopResult).toMatchObject({ success: true, stopped: true, reason: 'TAB_REMOVED' });
    expect(harness.manager.release).toHaveBeenCalledOnce();

    resolveConsume({
      success: true,
      ack: 'MEDIA_ACQUIRED',
      sessionId: 'session-1',
    });
    await expect(startPromise).resolves.toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_START_FAILED',
    });

    const disposeMessages = harness.browserAPI.runtime.sendMessage.mock.calls
      .map(([message]) => message)
      .filter(message => message.action === 'LIVE_DUBBING_DISPOSE');
    expect(disposeMessages).toHaveLength(1);
  });

  it('handles fenced offscreen terminal notification with one dispose and release', async () => {
    const harness = createHarness();
    await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});

    const result = await harness.coordinator.handleOffscreenTerminal({
      data: { sessionId: 'session-1', event: 'TRACK_ENDED' },
    });

    expect(result).toMatchObject({ success: true, stopped: true });
    expect(harness.manager.release).toHaveBeenCalledOnce();
    expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
  });

  it('reconciles stale descriptor through status, dispose, and exact lease release', async () => {
    const stored = {
      sessionId: 'old-session',
      tabId: 42,
      targetLanguage: 'en',
      status: 'CAPTURING',
      startedAt: 1,
      lastError: null,
      eventSequence: 2,
    };
    const harness = createHarness({ stored });
    harness.manager.activeLeases = [{
      owner: LIVE_DUBBING_OWNER,
      leaseId: 'old-session',
      requiredReasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
    }];

    const result = await harness.coordinator.reconcile();
    const actions = harness.browserAPI.runtime.sendMessage.mock.calls.map(([message]) => message.action);

    expect(result).toMatchObject({ success: true, stale: true, status: null });
    expect(actions).toEqual(['LIVE_DUBBING_STATUS', 'LIVE_DUBBING_DISPOSE']);
    expect(harness.manager.release).toHaveBeenCalledWith({ owner: LIVE_DUBBING_OWNER, leaseId: 'old-session' });
  });

  it('cleans up PREPARING_CAPTURE descriptor when status has no recoverable state', async () => {
    const stored = {
      sessionId: 'old-session',
      tabId: 42,
      targetLanguage: 'en',
      status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
      startedAt: 1,
      lastError: null,
      eventSequence: 0,
    };
    const harness = createHarness({ stored, statusResponse: {
      success: true,
      sessionId: 'old-session',
    } });
    harness.manager.activeLeases = [{ owner: LIVE_DUBBING_OWNER, leaseId: 'old-session' }];

    const result = await harness.coordinator.reconcile();
    const actions = harness.browserAPI.runtime.sendMessage.mock.calls
      .map(([message]) => message.action);

    expect(result).toMatchObject({ success: true, stale: true, status: null });
    expect(actions).toEqual(['LIVE_DUBBING_STATUS', 'LIVE_DUBBING_DISPOSE']);
    expect(harness.manager.release).toHaveBeenCalledWith({
      owner: LIVE_DUBBING_OWNER,
      leaseId: 'old-session',
    });
    expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
  });

  it('adopts only exact active CAPTURING status for matching session', async () => {
    const stored = {
      sessionId: 'old-session',
      tabId: 42,
      targetLanguage: 'en',
      status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
      startedAt: 1,
      lastError: null,
      eventSequence: 0,
    };
    const harness = createHarness({ stored, statusResponse: {
      success: true,
      active: true,
      sessionId: 'old-session',
      status: LIVE_DUBBING_STATUS.CAPTURING,
    } });
    harness.manager.activeLeases = [{ owner: LIVE_DUBBING_OWNER, leaseId: 'old-session' }];

    const result = await harness.coordinator.reconcile();
    const actions = harness.browserAPI.runtime.sendMessage.mock.calls
      .map(([message]) => message.action);

    expect(result).toMatchObject({
      success: true,
      recovered: true,
      status: { sessionId: 'old-session', status: LIVE_DUBBING_STATUS.CAPTURING },
    });
    expect(actions).toEqual(['LIVE_DUBBING_STATUS']);
    expect(harness.manager.release).not.toHaveBeenCalled();
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY)).toMatchObject({
      status: LIVE_DUBBING_STATUS.CAPTURING,
    });
  });

  it('reacquires exact lease before adopting active offscreen capture', async () => {
    const stored = {
      sessionId: 'old-session',
      tabId: 42,
      targetLanguage: 'en',
      status: LIVE_DUBBING_STATUS.CAPTURING,
      startedAt: 1,
      lastError: null,
      eventSequence: 2,
    };
    const harness = createHarness({ stored, statusResponse: {
      success: true,
      active: true,
      sessionId: 'old-session',
      status: LIVE_DUBBING_STATUS.CAPTURING,
    } });

    const result = await harness.coordinator.reconcile();

    expect(result).toMatchObject({ success: true, recovered: true });
    expect(harness.manager.acquire).toHaveBeenCalledWith({
      owner: LIVE_DUBBING_OWNER,
      leaseId: 'old-session',
      requiredReasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
    });
    expect(harness.browserAPI.runtime.sendMessage).toHaveBeenCalledOnce();
    expect(harness.browserAPI.runtime.sendMessage.mock.calls[0][0].action)
      .toBe('LIVE_DUBBING_STATUS');
  });

  it('does not report recovered capture when lease reacquisition fails', async () => {
    const stored = {
      sessionId: 'old-session',
      tabId: 42,
      targetLanguage: 'en',
      status: LIVE_DUBBING_STATUS.CAPTURING,
      startedAt: 1,
      lastError: null,
      eventSequence: 2,
    };
    const harness = createHarness({ stored, statusResponse: {
      success: true,
      active: true,
      sessionId: 'old-session',
      status: LIVE_DUBBING_STATUS.CAPTURING,
    } });
    harness.manager.acquire.mockResolvedValueOnce(false);

    const result = await harness.coordinator.reconcile();

    expect(result).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_LEASE_ACQUIRE_FAILED',
      recovered: false,
      retryable: true,
      status: { status: LIVE_DUBBING_STATUS.ERROR },
    });
    expect(harness.browserAPI.runtime.sendMessage).toHaveBeenCalledOnce();
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY)).toMatchObject({
      sessionId: 'old-session',
      status: LIVE_DUBBING_STATUS.ERROR,
    });
    expect(harness.manager.release).not.toHaveBeenCalled();
  });

  it('clears descriptor when exact offscreen session and lease are both absent', async () => {
    const stored = {
      sessionId: 'old-session',
      tabId: 42,
      targetLanguage: 'en',
      status: LIVE_DUBBING_STATUS.ERROR,
      startedAt: 1,
      lastError: 'START_FAILED',
      eventSequence: 1,
    };
    const harness = createHarness({ stored, statusResponse: {
      success: true,
      active: false,
      sessionId: 'old-session',
      status: 'IDLE',
    } });

    const result = await harness.coordinator.reconcile();
    const actions = harness.browserAPI.runtime.sendMessage.mock.calls
      .map(([message]) => message.action);

    expect(result).toMatchObject({ success: true, stale: true, status: null });
    expect(actions).toEqual(['LIVE_DUBBING_STATUS']);
    expect(harness.manager.release).not.toHaveBeenCalled();
    expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
  });

  it('clears descriptor after crash before lease acquisition when offscreen document is absent', async () => {
    const stored = {
      sessionId: 'old-session',
      tabId: 42,
      targetLanguage: 'en',
      status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
      startedAt: 1,
      lastError: null,
      eventSequence: 0,
    };
    const harness = createHarness({ stored, documentExists: false });

    const result = await harness.coordinator.reconcile();

    expect(result).toMatchObject({ success: true, stale: true, status: null });
    expect(harness.browserAPI.runtime.sendMessage).not.toHaveBeenCalled();
    expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
  });

  it('clears error descriptor after offscreen document and matching lease disappear', async () => {
    const stored = {
      sessionId: 'old-session',
      tabId: 42,
      targetLanguage: 'en',
      status: LIVE_DUBBING_STATUS.ERROR,
      startedAt: 1,
      lastError: 'START_FAILED',
      eventSequence: 1,
    };
    const harness = createHarness({ stored, documentExists: false, statusResponse: null });

    const result = await harness.coordinator.reconcile();

    expect(result).toMatchObject({ success: true, stale: true, status: null });
    expect(harness.browserAPI.runtime.sendMessage).not.toHaveBeenCalled();
    expect(harness.manager.release).not.toHaveBeenCalled();
    expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
  });

  it('retries reconciliation after transient dispose failure', async () => {
    const stored = {
      sessionId: 'old-session',
      tabId: 42,
      targetLanguage: 'en',
      status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
      startedAt: 1,
      lastError: null,
      eventSequence: 0,
    };
    const harness = createHarness({ stored, statusResponse: {
      success: true,
      active: false,
      sessionId: 'old-session',
      status: 'ERROR',
    } });
    harness.manager.activeLeases = [{ owner: LIVE_DUBBING_OWNER, leaseId: 'old-session' }];
    harness.browserAPI.runtime.sendMessage
      .mockImplementationOnce(async message => {
        harness.calls.push(['message', message]);
        return {
          success: true,
          active: false,
          sessionId: 'old-session',
          status: 'ERROR',
        };
      })
      .mockImplementationOnce(async message => {
        harness.calls.push(['message', message]);
        expect(message.action).toBe('LIVE_DUBBING_DISPOSE');
        return { success: false, sessionId: 'old-session' };
      });

    const failed = await harness.coordinator.reconcile();
    const retried = await harness.coordinator.reconcile();

    expect(failed).toMatchObject({ success: false, cleanupPending: true, retryable: true });
    expect(retried).toMatchObject({ success: true, stale: true, status: null });
    expect(harness.manager.release).toHaveBeenCalledOnce();
    expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
  });

  it('retries reconciliation after transient lease release failure', async () => {
    const stored = {
      sessionId: 'old-session',
      tabId: 42,
      targetLanguage: 'en',
      status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
      startedAt: 1,
      lastError: null,
      eventSequence: 0,
    };
    const harness = createHarness({ stored, statusResponse: {
      success: true,
      active: false,
      sessionId: 'old-session',
      status: 'ERROR',
    } });
    harness.manager.activeLeases = [{ owner: LIVE_DUBBING_OWNER, leaseId: 'old-session' }];
    harness.manager.release.mockRejectedValueOnce(new Error('release failed'));

    const failed = await harness.coordinator.reconcile();
    const retried = await harness.coordinator.reconcile();

    expect(failed).toMatchObject({ success: false, cleanupPending: true, retryable: true });
    expect(retried).toMatchObject({ success: true, stale: true, status: null });
    expect(harness.manager.release).toHaveBeenCalledTimes(2);
    expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
  });

  it('does not clean up or release when reconciliation status belongs to another session', async () => {
    const stored = {
      sessionId: 'old-session',
      tabId: 42,
      targetLanguage: 'en',
      status: 'CAPTURING',
      startedAt: 1,
      lastError: null,
      eventSequence: 2,
    };
    const harness = createHarness({ stored, statusResponse: {
      success: true,
      active: true,
      sessionId: 'old-session',
      requestedSessionId: 'old-session',
      actualSessionId: 'other-session',
    } });
    harness.manager.activeLeases = [{ owner: LIVE_DUBBING_OWNER, leaseId: 'old-session' }];

    const result = await harness.coordinator.reconcile();

    expect(result).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_SESSION_MISMATCH',
      recovered: false,
      status: { sessionId: 'old-session' },
      isolated: true,
      retryable: true,
    });
    expect(result).not.toHaveProperty('actualSessionId');
    expect(result).not.toHaveProperty('requestedSessionId');
    expect(harness.manager.release).not.toHaveBeenCalled();
    expect(harness.browserAPI.runtime.sendMessage).toHaveBeenCalledOnce();
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY)).toMatchObject({
      sessionId: 'old-session',
      status: 'CAPTURING',
    });
  });

  it('does not let stale terminal cleanup clear a newer session descriptor', async () => {
    const harness = createHarness();
    await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});

    let resolveDispose;
    const originalSendMessage = harness.browserAPI.runtime.sendMessage.getMockImplementation();
    harness.browserAPI.runtime.sendMessage.mockImplementation(async message => {
      if (message.action === 'LIVE_DUBBING_DISPOSE') {
        return new Promise(resolve => { resolveDispose = resolve; });
      }
      return originalSendMessage(message);
    });

    const stopPromise = harness.coordinator.stop({ data: { sessionId: 'session-1' } });
    while (!resolveDispose) await Promise.resolve();

    await harness.browserAPI.storage.session.set({
      [LIVE_DUBBING_STORAGE_KEY]: {
        sessionId: 'new-session',
        tabId: 84,
        targetLanguage: 'de',
        status: LIVE_DUBBING_STATUS.CAPTURING,
        startedAt: 2,
        lastError: null,
        eventSequence: 1,
      },
    });
    resolveDispose({
      success: true,
      ack: 'DISPOSED',
      sessionId: 'session-1',
    });

    const result = await stopPromise;

    expect(result).toMatchObject({ success: true, stopped: false, ignored: true });
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY)).toMatchObject({
      sessionId: 'new-session',
    });
    expect(harness.manager.release).toHaveBeenCalledWith({
      owner: LIVE_DUBBING_OWNER,
      leaseId: 'session-1',
    });
  });

  it('reconciles orphan lease only after exact status and dispose acknowledgements', async () => {
    const harness = createHarness({ statusResponse: {
      success: true,
      active: false,
      sessionId: 'orphan-session',
    } });
    harness.manager.activeLeases = [{ owner: LIVE_DUBBING_OWNER, leaseId: 'orphan-session' }];

    const result = await harness.coordinator.reconcile();

    expect(result).toMatchObject({ success: true, stale: true });
    expect(harness.manager.release).toHaveBeenCalledWith({
      owner: LIVE_DUBBING_OWNER,
      leaseId: 'orphan-session',
    });
    const actions = harness.browserAPI.runtime.sendMessage.mock.calls
      .map(([message]) => message.action);
    expect(actions).toEqual(['LIVE_DUBBING_STATUS', 'LIVE_DUBBING_DISPOSE']);
  });
});
