import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveDubbingCoordinator } from './LiveDubbingCoordinator.js';
import { LiveDubbingController } from '../offscreen/LiveDubbingController.js';
import {
  LIVE_DUBBING_OWNER,
  LIVE_DUBBING_STORAGE_KEY,
  LIVE_DUBBING_STORAGE_STATE,
  LIVE_DUBBING_INTERNAL_STATUS,
  LIVE_DUBBING_STATUS,
  LIVE_DUBBING_START_TIMEOUT,
} from '../constants.js';

function createHarness({ stored = null, streamId = 'stream-secret', statusResponse, documentExists } = {}) {
  const storage = new Map(stored
    ? [[LIVE_DUBBING_STORAGE_KEY, { providerId: 'gemini', ...stored }]]
    : []);
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
      return {
        success: true,
        ack: 'READY',
        sessionId: message.data.sessionId,
        providerId: message.data.providerId,
        eventSequence: message.data.eventSequence,
      };
    }
    if (message.action === 'LIVE_DUBBING_CONSUME') {
      return {
        success: true,
        ack: 'MEDIA_ACQUIRED',
        sessionId: message.data.sessionId,
        providerId: message.data.providerId,
        status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
        eventSequence: message.data.eventSequence,
        captureReady: true,
        inputPipelineReady: true,
        outputPipelineReady: true,
      };
    }
    if (message.action === 'LIVE_DUBBING_CONNECT_PROVIDER') {
      return {
        success: true,
        ack: 'PROVIDER_READY',
        sessionId: message.data.sessionId,
        providerId: message.data.providerId,
        status: LIVE_DUBBING_STATUS.RUNNING,
        eventSequence: message.data.eventSequence + 1,
        captureReady: true,
        inputPipelineReady: true,
        outputPipelineReady: true,
        setupComplete: true,
      };
    }
    if (message.action === 'LIVE_DUBBING_DISPOSE') {
      return {
        success: true,
        ack: 'DISPOSED',
        sessionId: message.data.sessionId,
        providerId: message.data.providerId,
      };
    }
    if (message.action === 'LIVE_DUBBING_STATUS') {
      return statusResponse
        ? { providerId: message.data.providerId, ...statusResponse }
        : { success: true, active: false, sessionId: message.data.sessionId, providerId: message.data.providerId };
    }
    return { success: true };
  });
  const browserAPI = {
    runtime: {
      id: 'extension-id',
      getURL: (path = '') => `chrome-extension://extension-id/${path}`,
      sendMessage,
    },
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
      'LIVE_DUBBING_CONNECT_PROVIDER',
    ]);
    expect(messages[0].data).not.toHaveProperty('streamId');
    expect(messages[1]).toMatchObject({ target: 'offscreen', data: { streamId: 'stream-secret' } });
    expect(messages[2].data).not.toHaveProperty('streamId');
    expect(messages.map(message => message.data.eventSequence)).toEqual([0, 1, 2]);
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY)).not.toHaveProperty('streamId');
    expect(result.status.status).toBe(LIVE_DUBBING_STATUS.RUNNING);
    expect(result.status.eventSequence).toBe(3);
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

  it('disposes the exact capture fence when pre-provider pipeline setup fails', async () => {
    const harness = createHarness();
    const track = {
      kind: 'audio',
      readyState: 'live',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      stop: vi.fn(),
    };
    const inputPipeline = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    };
    const offscreen = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => ({
        getAudioTracks: () => [track],
        getTracks: () => [track],
      })) },
      inputPipelineFactory: vi.fn(async () => inputPipeline),
      outputPlayerFactory: vi.fn(async () => {
        throw new Error('output pipeline setup failed');
      }),
    });
    harness.browserAPI.runtime.sendMessage.mockImplementation(message => {
      harness.calls.push(['message', message]);
      return offscreen.handle(message);
    });

    const result = await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    const dispose = harness.browserAPI.runtime.sendMessage.mock.calls
      .map(([message]) => message)
      .find(message => message.action === 'LIVE_DUBBING_DISPOSE');

    expect(result).toMatchObject({ success: false, error: 'LIVE_DUBBING_START_FAILED' });
    expect(dispose).toMatchObject({ data: { sessionId: 'session-1', eventSequence: 1 } });
    expect(harness.manager.release).toHaveBeenCalledWith({
      owner: LIVE_DUBBING_OWNER,
      leaseId: 'session-1',
    });
    expect(inputPipeline.stop).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
  });

  it('times out during pre-provider pipeline setup without stranding the lease', async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    const track = {
      kind: 'audio',
      readyState: 'live',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      stop: vi.fn(),
    };
    let resolveInputStart;
    const inputPipeline = {
      start: vi.fn(() => new Promise(resolve => { resolveInputStart = resolve; })),
      stop: vi.fn(async () => {}),
    };
    const outputPlayer = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      clear: vi.fn(),
    };
    const offscreen = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => ({
        getAudioTracks: () => [track],
        getTracks: () => [track],
      })) },
      inputPipelineFactory: vi.fn(async () => inputPipeline),
      outputPlayerFactory: vi.fn(async () => outputPlayer),
    });
    harness.browserAPI.runtime.sendMessage.mockImplementation(message => {
      harness.calls.push(['message', message]);
      return offscreen.handle(message);
    });

    const startPromise = harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    while (!resolveInputStart) await Promise.resolve();
    await vi.advanceTimersByTimeAsync(LIVE_DUBBING_START_TIMEOUT);
    const result = await startPromise;
    const dispose = harness.browserAPI.runtime.sendMessage.mock.calls
      .map(([message]) => message)
      .find(message => message.action === 'LIVE_DUBBING_DISPOSE');

    expect(result).toEqual({ success: false, error: 'LIVE_DUBBING_START_TIMEOUT' });
    expect(dispose).toMatchObject({ data: { sessionId: 'session-1', eventSequence: 1 } });
    expect(harness.manager.release).toHaveBeenCalledWith({
      owner: LIVE_DUBBING_OWNER,
      leaseId: 'session-1',
    });
    expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);

    resolveInputStart();
    await Promise.resolve();
    vi.useRealTimers();
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
      status: { sessionId: 'session-1', status: LIVE_DUBBING_STATUS.RUNNING },
    });
    expect(harness.coordinator.storageState).toBe(LIVE_DUBBING_STORAGE_STATE.UNREADABLE);
    expect(harness.manager.acquire).toHaveBeenCalledOnce();
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY)).toMatchObject({
      sessionId: 'session-1',
      status: LIVE_DUBBING_STATUS.RUNNING,
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
    expect(actions).toEqual([
      'LIVE_DUBBING_PREPARE',
      'LIVE_DUBBING_CONSUME',
      'LIVE_DUBBING_CONNECT_PROVIDER',
      'LIVE_DUBBING_DISPOSE',
    ]);
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

  it('cancels a pre-capture start before creating a descriptor', async () => {
    const harness = createHarness();
    let resolveTabs;
    harness.browserAPI.tabs.query.mockImplementationOnce(() => new Promise(resolve => {
      resolveTabs = resolve;
    }));
    const startPromise = harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});

    while (!resolveTabs) await Promise.resolve();
    const pendingStop = await harness.coordinator.stop({ data: { sessionId: 'session-1' } });
    resolveTabs([{ id: 42, url: 'https://example.test' }]);

    const failedStart = await startPromise;
    expect(pendingStop).toMatchObject({ success: true, pending: true, stopped: false });
    expect(failedStart).toEqual({ success: false, error: 'LIVE_DUBBING_START_CANCELLED' });
    expect(harness.coordinator.sessionStates.has('session-1')).toBe(false);
    expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
    expect(harness.manager.acquire).not.toHaveBeenCalled();
    expect(harness.browserAPI.runtime.sendMessage).not.toHaveBeenCalled();

    const retried = await harness.coordinator.stop({ data: { sessionId: 'session-1' } });

    expect(retried).toMatchObject({ success: true, idempotent: true, status: null });
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

  it('persists CONNECTING_PROVIDER and fences a late provider response after stop', async () => {
    const harness = createHarness();
    let resolveProvider;
    harness.browserAPI.runtime.sendMessage.mockImplementation(async message => {
      harness.calls.push(['message', message]);
      if (message.action === 'LIVE_DUBBING_PREPARE') {
        return {
          success: true,
          ack: 'READY',
          sessionId: message.data.sessionId,
          providerId: message.data.providerId,
          eventSequence: message.data.eventSequence,
        };
      }
      if (message.action === 'LIVE_DUBBING_CONSUME') {
        return {
          success: true,
          ack: 'MEDIA_ACQUIRED',
          sessionId: message.data.sessionId,
          providerId: message.data.providerId,
          status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
          eventSequence: message.data.eventSequence,
          captureReady: true,
          inputPipelineReady: true,
          outputPipelineReady: true,
        };
      }
      if (message.action === 'LIVE_DUBBING_CONNECT_PROVIDER') {
        return new Promise(resolve => { resolveProvider = resolve; });
      }
      if (message.action === 'LIVE_DUBBING_DISPOSE') {
        return {
          success: true,
          ack: 'DISPOSED',
          sessionId: message.data.sessionId,
          providerId: message.data.providerId,
        };
      }
      return { success: true };
    });

    const startPromise = harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    while (!resolveProvider) await Promise.resolve();
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY)).toMatchObject({
      status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
    });

    const stop = await harness.coordinator.stop({ data: { sessionId: 'session-1' } });
    expect(stop).toMatchObject({ success: true, stopped: true });
    resolveProvider({
      success: true,
      ack: 'PROVIDER_READY',
      sessionId: 'session-1',
      providerId: 'gemini',
      status: LIVE_DUBBING_STATUS.RUNNING,
      eventSequence: 3,
      captureReady: true,
      inputPipelineReady: true,
      outputPipelineReady: true,
      setupComplete: true,
    });

    await expect(startPromise).resolves.toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_START_FAILED',
    });
    expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
  });

  it('returns and logs a close-only provider diagnostic through START_FAILED', async () => {
    const harness = createHarness();
    const track = {
      kind: 'audio',
      readyState: 'live',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      stop: vi.fn(),
    };
    const inputPipeline = { start: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
    const outputPlayer = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      clear: vi.fn(),
    };
    const provider = {
      connect: vi.fn(() => provider.onClose(
        { code: 1006, wasClean: false },
        {
          stage: 'REMOTE_ERROR',
          code: 'GEMINI_LIVE_PROVIDER_CLOSED',
          closeCode: 1006,
          wasClean: false,
          terminalCategory: 'SOCKET_CLOSED',
          wsOpen: true,
          setupSent: true,
          setupComplete: false,
          message: 'provider-body-secret',
          key: 'secret-key',
        },
      )),
      close: vi.fn(),
    };
    const offscreen = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => ({
        getAudioTracks: () => [track],
        getTracks: () => [track],
      })) },
      inputPipeline,
      outputPlayer,
      providerClient: provider,
      requestBootstrap: vi.fn().mockResolvedValue({
        success: true,
        providerId: 'gemini',
        targetLanguage: 'en',
        bootstrap: { accessToken: 'test-token' },
      }),
      notify: vi.fn(),
    });
    harness.browserAPI.runtime.sendMessage.mockImplementation(message => {
      harness.calls.push(['message', message]);
      return offscreen.handle(message);
    });

    const result = await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});

    expect(result).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_START_FAILED',
      providerDiagnostic: {
        stage: 'CONNECT_PROVIDER',
        code: 'GEMINI_LIVE_PROVIDER_CLOSED',
        closeCode: 1006,
        wasClean: false,
        terminalCategory: 'SOCKET_CLOSED',
        wsOpen: true,
        setupSent: true,
        setupComplete: false,
      },
    });
    expect(harness.logger.warn).toHaveBeenCalledWith(
      'Live dubbing provider startup failed',
      result.providerDiagnostic,
    );
    expect(JSON.stringify(harness.logger.warn.mock.calls)).not.toContain('provider-body-secret');
    expect(provider.close).toHaveBeenCalledOnce();
    expect(inputPipeline.stop).toHaveBeenCalledOnce();
    expect(outputPlayer.stop).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(harness.manager.release).toHaveBeenCalledWith({
      owner: LIVE_DUBBING_OWNER,
      leaseId: 'session-1',
    });
    expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
  });

  it('accepts an earlier-sequence Offscreen terminal while provider setup is connecting', async () => {
    const harness = createHarness();
    let resolveProvider;
    harness.browserAPI.runtime.sendMessage.mockImplementation(async message => {
      harness.calls.push(['message', message]);
      if (message.action === 'LIVE_DUBBING_PREPARE') {
        return {
          success: true,
          ack: 'READY',
          sessionId: message.data.sessionId,
          providerId: message.data.providerId,
          eventSequence: message.data.eventSequence,
        };
      }
      if (message.action === 'LIVE_DUBBING_CONSUME') {
        return {
          success: true,
          ack: 'MEDIA_ACQUIRED',
          sessionId: message.data.sessionId,
          providerId: message.data.providerId,
          status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
          eventSequence: message.data.eventSequence,
          captureReady: true,
          inputPipelineReady: true,
          outputPipelineReady: true,
        };
      }
      if (message.action === 'LIVE_DUBBING_CONNECT_PROVIDER') {
        return new Promise(resolve => { resolveProvider = resolve; });
      }
      if (message.action === 'LIVE_DUBBING_DISPOSE') {
        return {
          success: true,
          ack: 'DISPOSED',
          sessionId: message.data.sessionId,
          providerId: message.data.providerId,
        };
      }
      return { success: true };
    });

    const startPromise = harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    while (!resolveProvider) await Promise.resolve();

    const terminal = harness.coordinator.handleOffscreenTerminal({
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        eventSequence: 1,
        event: 'TRACK_ENDED',
        providerDiagnostic: {
          stage: 'CONNECT_PROVIDER',
          code: 'GEMINI_LIVE_REMOTE_ERROR',
          closeCode: 1011,
          wasClean: false,
          terminalCategory: 'REMOTE_ERROR',
          wsOpen: true,
          setupSent: true,
          setupComplete: false,
        },
      },
    }, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    });
    await expect(terminal).resolves.toMatchObject({ success: true, stopped: true });

    resolveProvider({
      success: true,
      ack: 'PROVIDER_READY',
      sessionId: 'session-1',
      providerId: 'gemini',
      status: LIVE_DUBBING_STATUS.RUNNING,
      eventSequence: 3,
      captureReady: true,
      inputPipelineReady: true,
      outputPipelineReady: true,
      setupComplete: true,
      providerDiagnostic: {
        stage: 'CONNECT_PROVIDER',
        code: 'STALE_PROVIDER_ERROR',
        closeCode: 1006,
        wasClean: false,
        terminalCategory: 'STALE_RESPONSE',
        wsOpen: true,
        setupSent: true,
        setupComplete: false,
      },
    });
    await expect(startPromise).resolves.toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_START_FAILED',
      providerDiagnostic: {
        code: 'GEMINI_LIVE_REMOTE_ERROR',
        terminalCategory: 'REMOTE_ERROR',
      },
    });
    expect(harness.logger.warn).toHaveBeenCalledWith(
      'Live dubbing provider startup failed',
      expect.objectContaining({
        stage: 'CONNECT_PROVIDER',
        code: 'GEMINI_LIVE_REMOTE_ERROR',
      }),
    );
    expect(harness.manager.release).toHaveBeenCalledWith({
      owner: LIVE_DUBBING_OWNER,
      leaseId: 'session-1',
    });
    expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
  });

  it('fences a terminal event before RUNNING persistence and never stores stale RUNNING state', async () => {
    const harness = createHarness();
    let resolveProvider;
    harness.browserAPI.runtime.sendMessage.mockImplementation(async message => {
      harness.calls.push(['message', message]);
      if (message.action === 'LIVE_DUBBING_PREPARE') {
        return {
          success: true,
          ack: 'READY',
          sessionId: message.data.sessionId,
          providerId: message.data.providerId,
          eventSequence: message.data.eventSequence,
        };
      }
      if (message.action === 'LIVE_DUBBING_CONSUME') {
        return {
          success: true,
          ack: 'MEDIA_ACQUIRED',
          sessionId: message.data.sessionId,
          providerId: message.data.providerId,
          status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
          eventSequence: message.data.eventSequence,
          captureReady: true,
          inputPipelineReady: true,
          outputPipelineReady: true,
        };
      }
      if (message.action === 'LIVE_DUBBING_CONNECT_PROVIDER') {
        return new Promise(resolve => { resolveProvider = resolve; });
      }
      if (message.action === 'LIVE_DUBBING_DISPOSE') {
        return {
          success: true,
          ack: 'DISPOSED',
          sessionId: message.data.sessionId,
          providerId: message.data.providerId,
        };
      }
      return { success: true };
    });

    const startPromise = harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    while (!resolveProvider) await Promise.resolve();

    const terminalPromise = harness.coordinator.handleOffscreenTerminal({
      data: { sessionId: 'session-1', providerId: 'gemini', eventSequence: 3, event: 'TRACK_ENDED' },
    }, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    });
    resolveProvider({
      success: true,
      ack: 'PROVIDER_READY',
      sessionId: 'session-1',
      providerId: 'gemini',
      status: LIVE_DUBBING_STATUS.RUNNING,
      eventSequence: 3,
      captureReady: true,
      inputPipelineReady: true,
      outputPipelineReady: true,
      setupComplete: true,
    });

    await expect(terminalPromise).resolves.toMatchObject({ success: true, stopped: true });
    await expect(startPromise).resolves.toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_START_FAILED',
    });
    expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY)?.status)
      .not.toBe(LIVE_DUBBING_STATUS.RUNNING);
  });

  it('services the bootstrap request during provider setup without transition deadlock', async () => {
    const harness = createHarness();
    const sender = {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    };
    const track = {
      kind: 'audio',
      readyState: 'live',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      stop: vi.fn(),
    };
    const inputPipeline = { start: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
    const outputPlayer = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      clear: vi.fn(),
    };
    const providerClient = { connect: vi.fn(async () => {}) };
    let bootstrapRequest;
    const offscreen = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => ({
        getAudioTracks: () => [track],
        getTracks: () => [track],
      })) },
      inputPipelineFactory: vi.fn(async () => inputPipeline),
      outputPlayerFactory: vi.fn(async () => outputPlayer),
      providerClient,
      requestBootstrap: request => {
        bootstrapRequest = request;
        return harness.coordinator.authorizeOffscreenControlMessage(request, sender, { type: 'bootstrap' })
          .then(descriptor => descriptor
            ? {
              success: true,
              providerId: descriptor.providerId,
              targetLanguage: descriptor.targetLanguage,
              bootstrap: { accessToken: 'handler-token' },
            }
            : { success: false });
      },
    });
    harness.browserAPI.runtime.sendMessage.mockImplementation(message => {
      harness.calls.push(['message', message]);
      return offscreen.handle(message);
    });

    const result = await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});

    expect(result).toMatchObject({ success: true, status: { status: LIVE_DUBBING_STATUS.RUNNING } });
    expect(bootstrapRequest).toMatchObject({
      action: 'LIVE_DUBBING_REQUEST_PROVIDER_BOOTSTRAP',
      data: { sessionId: 'session-1', providerId: 'gemini', targetLanguage: 'en', eventSequence: 2 },
    });
    expect(providerClient.connect).toHaveBeenCalledWith({
      bootstrap: { accessToken: 'handler-token' },
      targetLanguage: 'en',
    });
  });

  it('rejects stale and stop-fenced bootstrap requests without claiming transition ownership', async () => {
    const harness = createHarness();
    let resolveProvider;
    harness.browserAPI.runtime.sendMessage.mockImplementation(async message => {
      harness.calls.push(['message', message]);
      if (message.action === 'LIVE_DUBBING_PREPARE') {
        return {
          success: true,
          ack: 'READY',
          sessionId: message.data.sessionId,
          providerId: message.data.providerId,
          eventSequence: message.data.eventSequence,
        };
      }
      if (message.action === 'LIVE_DUBBING_CONSUME') {
        return {
          success: true,
          ack: 'MEDIA_ACQUIRED',
          sessionId: message.data.sessionId,
          providerId: message.data.providerId,
          status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
          eventSequence: message.data.eventSequence,
          captureReady: true,
          inputPipelineReady: true,
          outputPipelineReady: true,
        };
      }
      if (message.action === 'LIVE_DUBBING_CONNECT_PROVIDER') {
        return new Promise(resolve => { resolveProvider = resolve; });
      }
      if (message.action === 'LIVE_DUBBING_DISPOSE') {
        return {
          success: true,
          ack: 'DISPOSED',
          sessionId: message.data.sessionId,
          providerId: message.data.providerId,
        };
      }
      return { success: true };
    });

    const startPromise = harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    while (!resolveProvider) await Promise.resolve();

    const sender = {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    };
    const staleRequest = {
      action: 'LIVE_DUBBING_REQUEST_PROVIDER_BOOTSTRAP',
      data: { sessionId: 'stale-session', providerId: 'gemini', targetLanguage: 'en', eventSequence: 2 },
    };
    const transition = harness.coordinator.transition;
    await expect(harness.coordinator.authorizeOffscreenControlMessage(
      staleRequest,
      sender,
      { type: 'bootstrap' },
    )).resolves.toBeNull();
    expect(harness.coordinator.transition).toBe(transition);

    const request = {
      action: 'LIVE_DUBBING_REQUEST_PROVIDER_BOOTSTRAP',
      data: { sessionId: 'session-1', providerId: 'gemini', targetLanguage: 'en', eventSequence: 2 },
    };
    const authorized = await harness.coordinator.authorizeOffscreenControlMessage(
      request,
      sender,
      { type: 'bootstrap' },
    );
    expect(authorized).toMatchObject({ sessionId: 'session-1', status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER });

    const stopResult = await harness.coordinator.stop({ data: { sessionId: 'session-1' } });
    expect(stopResult).toEqual({ success: true, stopped: true, status: null, reason: 'STOP_REQUESTED' });
    expect(harness.coordinator.isBootstrapRequestStillAuthorized(authorized)).toBe(false);

    resolveProvider({
      success: true,
      ack: 'PROVIDER_READY',
      sessionId: 'session-1',
      providerId: 'gemini',
      status: LIVE_DUBBING_STATUS.RUNNING,
      eventSequence: 3,
      captureReady: true,
      inputPipelineReady: true,
      outputPipelineReady: true,
      setupComplete: true,
    });
    await expect(startPromise).resolves.toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_START_FAILED',
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
        return {
          success: true,
          ack: 'READY',
          sessionId: message.data.sessionId,
          providerId: message.data.providerId,
          eventSequence: message.data.eventSequence,
        };
      }
      if (message.action === 'LIVE_DUBBING_CONSUME') {
        return new Promise(resolve => { resolveConsume = resolve; });
      }
      if (message.action === 'LIVE_DUBBING_DISPOSE') {
        return {
          success: true,
          ack: 'DISPOSED',
          disposed: true,
          sessionId: message.data.sessionId,
          providerId: message.data.providerId,
        };
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
      providerId: 'gemini',
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
      data: { sessionId: 'session-1', providerId: 'gemini', event: 'TRACK_ENDED' },
    });

    expect(result).toMatchObject({ success: true, stopped: true });
    expect(harness.manager.release).toHaveBeenCalledOnce();
    expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
  });

  it('logs a sanitized cleanup summary once after valid terminal release', async () => {
    const harness = createHarness();
    await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});

    const result = await harness.coordinator.handleOffscreenTerminal({
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        event: 'PROVIDER_ERROR',
        cleanupDiagnostic: {
          cleanupCause: 'LIVE_DUBBING_PROVIDER_ERROR',
          capturedFrames: 7,
          inputSentFrames: 3,
          inputPendingFrames: 2,
          providerLastSendReason: 'BACKPRESSURE',
          providerAudioChunks: 4,
          playbackAccepted: false,
          outputSafetyDrops: 1,
          interruptions: 6,
          providerTerminalCategory: 'PROVIDER_ERROR',
          sessionId: 'session-secret',
          streamId: 'stream-secret',
          pcm: 'AQ==',
        },
      },
    }, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    });

    expect(result).toMatchObject({ success: true, stopped: true });
    expect(harness.logger.warn).toHaveBeenCalledOnce();
    expect(harness.logger.warn).toHaveBeenCalledWith(
      'Live dubbing ended without translated playback',
      {
        cleanupCause: 'LIVE_DUBBING_PROVIDER_ERROR',
        capturedFrames: 7,
        inputSentFrames: 3,
        inputPendingFrames: 2,
        providerLastSendReason: 'BACKPRESSURE',
        providerAudioChunks: 4,
        playbackAccepted: false,
        outputSafetyDrops: 1,
        interruptions: 6,
        providerTerminalCategory: 'PROVIDER_ERROR',
      },
    );
    expect(harness.logger.warn.mock.invocationCallOrder[0])
      .toBeGreaterThan(harness.manager.release.mock.invocationCallOrder[0]);
    const storagePayload = JSON.stringify([...harness.storage.values()]);
    expect(storagePayload).not.toContain('cleanupDiagnostic');
    expect(storagePayload).not.toContain('session-secret');
    expect(storagePayload).not.toContain('stream-secret');
    expect(storagePayload).not.toContain('AQ==');
  });

  it('latches and logs a sanitized provider terminal before cleanup', async () => {
    const harness = createHarness();
    await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    const providerDiagnostic = {
      stage: 'REMOTE_ERROR',
      code: 'GEMINI_LIVE_MALFORMED_MESSAGE',
      closeCode: 1006,
      wasClean: false,
      terminalCategory: 'MALFORMED_MESSAGE',
      malformedAt: 'INLINE_AUDIO_SHAPE',
      wsOpen: true,
      setupSent: true,
      setupComplete: false,
      message: 'provider-body-secret',
      streamId: 'stream-secret',
    };
    const forgetSessionState = vi.spyOn(harness.coordinator, '_forgetSessionState');

    const result = await harness.coordinator.handleOffscreenTerminal({
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        event: 'PROVIDER_ERROR',
        providerDiagnostic,
        cleanupDiagnostic: {
          cleanupCause: 'LIVE_DUBBING_PROVIDER_ERROR',
          playbackAccepted: false,
        },
      },
    }, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    });

    expect(result).toMatchObject({ success: true, stopped: true });
    expect(harness.logger.warn).toHaveBeenNthCalledWith(1, 'Live dubbing provider terminal', {
      stage: 'CONNECT_PROVIDER',
      code: 'GEMINI_LIVE_MALFORMED_MESSAGE',
      closeCode: 1006,
      wasClean: false,
      terminalCategory: 'MALFORMED_MESSAGE',
      malformedAt: 'INLINE_AUDIO_SHAPE',
      wsOpen: true,
      setupSent: true,
      setupComplete: false,
    });
    expect(harness.logger.warn).toHaveBeenNthCalledWith(
      2,
      'Live dubbing ended without translated playback',
      expect.objectContaining({ playbackAccepted: false }),
    );
    expect(JSON.stringify(harness.logger.warn.mock.calls)).not.toContain('provider-body-secret');
    expect(JSON.stringify(harness.logger.warn.mock.calls)).not.toContain('stream-secret');
    expect(forgetSessionState).toHaveBeenCalledOnce();
    expect(harness.logger.warn.mock.invocationCallOrder[0])
      .toBeLessThan(forgetSessionState.mock.invocationCallOrder[0]);
  });

  it('does not let rejected or senderless terminals inject provider diagnostics', async () => {
    const diagnostic = {
      code: 'GEMINI_LIVE_MALFORMED_MESSAGE',
      terminalCategory: 'MALFORMED_MESSAGE',
      malformedAt: 'INLINE_AUDIO_SHAPE',
    };
    const sender = {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    };

    const wrongSenderHarness = createHarness();
    await wrongSenderHarness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    await wrongSenderHarness.coordinator.handleOffscreenTerminal({
      data: { sessionId: 'session-1', providerId: 'gemini', providerDiagnostic: diagnostic },
    }, { ...sender, tab: { id: 42 } });
    expect(wrongSenderHarness.coordinator.sessionStates.get('session-1').providerDiagnostic)
      .toBeNull();
    expect(wrongSenderHarness.logger.warn).not.toHaveBeenCalled();

    const wrongSessionHarness = createHarness();
    await wrongSessionHarness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    await wrongSessionHarness.coordinator.handleOffscreenTerminal({
      data: { sessionId: 'other-session', providerDiagnostic: diagnostic },
    }, sender);
    expect(wrongSessionHarness.coordinator.sessionStates.get('session-1').providerDiagnostic)
      .toBeNull();
    expect(wrongSessionHarness.logger.warn).not.toHaveBeenCalled();

    const senderlessHarness = createHarness();
    await senderlessHarness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    const stopForSession = vi.spyOn(senderlessHarness.coordinator, '_stopForSession')
      .mockResolvedValue({ success: true, stopped: true });
    await senderlessHarness.coordinator.handleOffscreenTerminal({
      data: { sessionId: 'session-1', providerId: 'gemini', providerDiagnostic: diagnostic },
    });
    expect(stopForSession).toHaveBeenCalledOnce();
    expect(senderlessHarness.coordinator.sessionStates.get('session-1').providerDiagnostic)
      .toBeNull();
    expect(senderlessHarness.logger.warn).not.toHaveBeenCalled();

    const invalidHarness = createHarness();
    await invalidHarness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    const firstDiagnostic = invalidHarness.coordinator.sessionStates.get('session-1');
    invalidHarness.coordinator._latchProviderDiagnostic(firstDiagnostic, diagnostic);
    vi.spyOn(invalidHarness.coordinator, '_stopForSession').mockResolvedValue({
      success: true,
      stopped: true,
    });
    await invalidHarness.coordinator.handleOffscreenTerminal({
      data: { sessionId: 'session-1', providerId: 'gemini', providerDiagnostic: new Error('provider-body-secret') },
    }, sender);
    expect(firstDiagnostic.providerDiagnostic).toMatchObject({
      code: 'GEMINI_LIVE_MALFORMED_MESSAGE',
      malformedAt: 'INLINE_AUDIO_SHAPE',
    });
    expect(invalidHarness.logger.warn).not.toHaveBeenCalled();
  });

  it('preserves the first provider diagnostic when a duplicate terminal replays later data', async () => {
    const harness = createHarness();
    await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    const sender = {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    };
    const first = {
      code: 'GEMINI_LIVE_MALFORMED_MESSAGE',
      terminalCategory: 'MALFORMED_MESSAGE',
      malformedAt: 'INLINE_AUDIO_SHAPE',
    };
    const later = {
      code: 'GEMINI_LIVE_REMOTE_ERROR',
      terminalCategory: 'REMOTE_ERROR',
      malformedAt: 'BINARY_BLOB_MESSAGE',
    };
    let resolveStop;
    const stopForSession = vi.spyOn(harness.coordinator, '_stopForSession')
      .mockImplementation(() => new Promise(resolve => { resolveStop = resolve; }));

    const firstTerminal = harness.coordinator.handleOffscreenTerminal({
      data: { sessionId: 'session-1', providerId: 'gemini', providerDiagnostic: first },
    }, sender);
    await expect(harness.coordinator.handleOffscreenTerminal({
      data: { sessionId: 'session-1', providerId: 'gemini', providerDiagnostic: later },
    }, sender)).resolves.toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_UNAUTHORIZED',
    });

    expect(harness.coordinator.sessionStates.get('session-1').providerDiagnostic)
      .toMatchObject({
        code: 'GEMINI_LIVE_MALFORMED_MESSAGE',
        terminalCategory: 'MALFORMED_MESSAGE',
        malformedAt: 'INLINE_AUDIO_SHAPE',
      });
    expect(harness.logger.warn).toHaveBeenCalledOnce();
    expect(harness.logger.warn).toHaveBeenCalledWith(
      'Live dubbing provider terminal',
      expect.objectContaining({
        code: 'GEMINI_LIVE_MALFORMED_MESSAGE',
        terminalCategory: 'MALFORMED_MESSAGE',
        malformedAt: 'INLINE_AUDIO_SHAPE',
      }),
    );

    resolveStop({ success: true, stopped: true });
    await expect(firstTerminal).resolves.toMatchObject({ success: true, stopped: true });
    expect(stopForSession).toHaveBeenCalledOnce();
  });

  it('does not log cleanup summaries for unauthenticated, wrong-session, duplicate, or senderless terminals', async () => {
    const summary = {
      cleanupCause: 'EXPLICIT_DISPOSE',
      playbackAccepted: false,
    };
    const sender = {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    };

    const wrongSenderHarness = createHarness();
    await wrongSenderHarness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    await expect(wrongSenderHarness.coordinator.handleOffscreenTerminal({
      data: { sessionId: 'session-1', providerId: 'gemini', cleanupDiagnostic: summary },
    }, { ...sender, tab: { id: 42 } })).resolves.toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_UNAUTHORIZED',
    });
    expect(wrongSenderHarness.logger.warn).not.toHaveBeenCalled();

    const wrongSessionHarness = createHarness();
    await wrongSessionHarness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    await expect(wrongSessionHarness.coordinator.handleOffscreenTerminal({
      data: { sessionId: 'other-session', cleanupDiagnostic: summary },
    }, sender)).resolves.toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_UNAUTHORIZED',
    });
    expect(wrongSessionHarness.logger.warn).not.toHaveBeenCalled();

    const duplicateHarness = createHarness();
    await duplicateHarness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    await duplicateHarness.coordinator.handleOffscreenTerminal({
      data: { sessionId: 'session-1', providerId: 'gemini', cleanupDiagnostic: { ...summary, playbackAccepted: true } },
    }, sender);
    await expect(duplicateHarness.coordinator.handleOffscreenTerminal({
      data: { sessionId: 'session-1', providerId: 'gemini', cleanupDiagnostic: summary },
    }, sender)).resolves.toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_UNAUTHORIZED',
    });
    expect(duplicateHarness.logger.warn).not.toHaveBeenCalled();

    const senderlessHarness = createHarness();
    await senderlessHarness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    await senderlessHarness.coordinator.handleOffscreenTerminal({
      data: { sessionId: 'session-1', providerId: 'gemini', cleanupDiagnostic: summary },
    });
    expect(senderlessHarness.logger.warn).not.toHaveBeenCalled();
  });

  it('accepts stale-sequence terminals only for the exact Offscreen session', async () => {
    const harness = createHarness();
    await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    const sender = {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    };

    await expect(harness.coordinator.handleOffscreenTerminal({
      data: { sessionId: 'session-1', providerId: 'gemini', eventSequence: 3, event: 'TRACK_ENDED' },
    }, sender)).resolves.toMatchObject({
      success: true,
      stopped: true,
    });
    await expect(harness.coordinator.handleOffscreenTerminal({
      data: { sessionId: 'session-1', providerId: 'gemini', eventSequence: 0, event: 'TRACK_ENDED' },
    }, { ...sender, tab: { id: 42 } })).resolves.toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_UNAUTHORIZED',
    });
    await expect(harness.coordinator.handleOffscreenTerminal({
      data: { sessionId: 'other-session', eventSequence: 3, event: 'TRACK_ENDED' },
    }, sender)).resolves.toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_UNAUTHORIZED',
    });
    expect(harness.manager.release).toHaveBeenCalledOnce();
  });

  it('authorizes one bootstrap request only for the exact connecting session event', async () => {
    const harness = createHarness();
    const started = await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    const connecting = harness.coordinator._advance(
      started.status,
      LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
    );
    expect(await harness.coordinator._writeDescriptor(
      connecting,
      started.status.sessionId,
      started.status,
    )).toBe(true);
    harness.coordinator.sessionStates.get(started.status.sessionId).descriptor = connecting;
    const sender = {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    };
    const request = {
      action: 'LIVE_DUBBING_REQUEST_PROVIDER_BOOTSTRAP',
      data: {
        sessionId: started.status.sessionId,
        providerId: 'gemini',
        targetLanguage: 'en',
        eventSequence: connecting.eventSequence,
      },
    };

    await expect(harness.coordinator.authorizeOffscreenControlMessage(
      request,
      sender,
      { type: 'bootstrap' },
    )).resolves.toMatchObject({ sessionId: 'session-1', status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER });
    await expect(harness.coordinator.authorizeOffscreenControlMessage(
      request,
      sender,
      { type: 'bootstrap' },
    )).resolves.toBeNull();
    expect(JSON.stringify(harness.storage.get(LIVE_DUBBING_STORAGE_KEY))).not.toContain('secret');
  });

  it('clears bootstrap request ownership across terminal cleanup and a repeated session', async () => {
    const harness = createHarness();
    const sender = {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    };

    const stageConnecting = async () => {
      const current = harness.coordinator.descriptor;
      const connecting = harness.coordinator._advance(
        current,
        LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
      );
      expect(await harness.coordinator._writeDescriptor(
        connecting,
        current.sessionId,
        current,
      )).toBe(true);
      harness.coordinator.sessionStates.get(current.sessionId).descriptor = connecting;
      return connecting;
    };
    const bootstrapRequest = eventSequence => ({
      action: 'LIVE_DUBBING_REQUEST_PROVIDER_BOOTSTRAP',
      data: { sessionId: 'session-1', providerId: 'gemini', targetLanguage: 'en', eventSequence },
    });

    const first = await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    const firstConnecting = await stageConnecting();
    await expect(harness.coordinator.authorizeOffscreenControlMessage(
      bootstrapRequest(firstConnecting.eventSequence),
      sender,
      { type: 'bootstrap' },
    )).resolves.toMatchObject({ sessionId: 'session-1' });
    expect(harness.coordinator.bootstrapRequestSessions.has('session-1')).toBe(true);

    await expect(harness.coordinator.handleOffscreenTerminal({
      data: { sessionId: first.status.sessionId, providerId: 'gemini', eventSequence: 0, event: 'TRACK_ENDED' },
    }, sender)).resolves.toMatchObject({ success: true, stopped: true });
    expect(harness.coordinator.bootstrapRequestSessions.has('session-1')).toBe(false);

    const second = await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    const secondConnecting = await stageConnecting();
    await expect(harness.coordinator.authorizeOffscreenControlMessage(
      bootstrapRequest(secondConnecting.eventSequence),
      sender,
      { type: 'bootstrap' },
    )).resolves.toMatchObject({ sessionId: second.status.sessionId });
  });

  it('reconciles stale descriptor through status, dispose, and exact lease release', async () => {
    const stored = {
      sessionId: 'old-session',
      tabId: 42,
      targetLanguage: 'en',
      status: LIVE_DUBBING_STATUS.RUNNING,
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

  it('ignores a status response from a different provider identity', async () => {
    const harness = createHarness({ stored: {
      sessionId: 'old-session',
      tabId: 42,
      targetLanguage: 'en',
      status: LIVE_DUBBING_STATUS.RUNNING,
      startedAt: 1,
      lastError: null,
      eventSequence: 2,
    }, statusResponse: {
      success: true,
      active: true,
      sessionId: 'old-session',
      providerId: 'other-provider',
      status: LIVE_DUBBING_STATUS.RUNNING,
    } });

    const result = await harness.coordinator.reconcile();

    expect(result).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_SESSION_MISMATCH',
      retryable: true,
      isolated: true,
    });
    expect(harness.manager.release).not.toHaveBeenCalled();
    expect(harness.browserAPI.runtime.sendMessage).toHaveBeenCalledOnce();
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

  it('does not recover a capture-only offscreen session after worker restart', async () => {
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
      status: LIVE_DUBBING_INTERNAL_STATUS.CAPTURING,
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

  it('reconciles a pre-provider session after service-worker recovery', async () => {
    const track = {
      kind: 'audio',
      readyState: 'live',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      stop: vi.fn(),
    };
    const offscreen = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => ({
        getAudioTracks: () => [track],
        getTracks: () => [track],
      })) },
    });
    offscreen.prepare('old-session', 'gemini', 'en', 0);
    await offscreen.consume('old-session', 'gemini', 'stream-secret', 1);

    const harness = createHarness({ stored: {
      sessionId: 'old-session',
      tabId: 42,
      targetLanguage: 'en',
      status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
      startedAt: 1,
      lastError: null,
      eventSequence: 1,
    } });
    harness.manager.activeLeases = [{
      owner: LIVE_DUBBING_OWNER,
      leaseId: 'old-session',
      requiredReasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
    }];
    harness.browserAPI.runtime.sendMessage.mockImplementation(message => {
      harness.calls.push(['message', message]);
      return offscreen.handle(message);
    });

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
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('reacquires exact lease before adopting active offscreen capture', async () => {
    const stored = {
      sessionId: 'old-session',
      tabId: 42,
      targetLanguage: 'en',
      status: LIVE_DUBBING_STATUS.RUNNING,
      startedAt: 1,
      lastError: null,
      eventSequence: 2,
    };
    const harness = createHarness({ stored, statusResponse: {
      success: true,
      active: true,
      sessionId: 'old-session',
      status: LIVE_DUBBING_STATUS.RUNNING,
      captureReady: true,
      inputPipelineReady: true,
      outputPipelineReady: true,
      setupComplete: true,
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
      status: LIVE_DUBBING_STATUS.RUNNING,
      startedAt: 1,
      lastError: null,
      eventSequence: 2,
    };
    const harness = createHarness({ stored, statusResponse: {
      success: true,
      active: true,
      sessionId: 'old-session',
      status: LIVE_DUBBING_STATUS.RUNNING,
      captureReady: true,
      inputPipelineReady: true,
      outputPipelineReady: true,
      setupComplete: true,
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
          providerId: 'gemini',
          status: 'ERROR',
        };
      })
      .mockImplementationOnce(async message => {
        harness.calls.push(['message', message]);
        expect(message.action).toBe('LIVE_DUBBING_DISPOSE');
        return { success: false, sessionId: 'old-session', providerId: 'gemini' };
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
      status: LIVE_DUBBING_STATUS.RUNNING,
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
      status: LIVE_DUBBING_STATUS.RUNNING,
    });
  });

  it('isolates reconciliation when offscreen owns a different session (real controller status)', async () => {
    const stored = {
      sessionId: 'session-A',
      tabId: 42,
      targetLanguage: 'en',
      status: LIVE_DUBBING_STATUS.RUNNING,
      startedAt: 1,
      lastError: null,
      eventSequence: 2,
    };
    // Offscreen currently owns session B. The status query for A must return
    // the real controller mismatch shape, not a hand-mocked status object.
    const offscreen = new LiveDubbingController();
    offscreen.prepare('session-B', 'gemini', 'en', 0);

    const harness = createHarness({ stored });
    harness.manager.activeLeases = [{ owner: LIVE_DUBBING_OWNER, leaseId: 'session-A' }];
    const dispose = vi.spyOn(harness.coordinator, '_disposeAndRelease');
    harness.browserAPI.runtime.sendMessage.mockImplementation(message => {
      harness.calls.push(['message', message]);
      return offscreen.handle(message);
    });

    // Prove the real controller response carries explicit session + provider proof.
    const direct = offscreen.status('session-A', 'gemini');
    expect(direct).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_SESSION_MISMATCH',
      ignored: true,
      sessionId: 'session-A',
      providerId: 'gemini',
      requestedSessionId: 'session-A',
      actualSessionId: 'session-B',
      requestedProviderId: 'gemini',
      actualProviderId: 'gemini',
    });

    const result = await harness.coordinator.reconcile();
    const actions = harness.browserAPI.runtime.sendMessage.mock.calls
      .map(([message]) => message.action);

    expect(result).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_SESSION_MISMATCH',
      recovered: false,
      isolated: true,
      retryable: true,
      status: { sessionId: 'session-A' },
    });
    expect(actions).toEqual(['LIVE_DUBBING_STATUS']);
    expect(dispose).not.toHaveBeenCalled();
    expect(harness.manager.release).not.toHaveBeenCalled();
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY)).toMatchObject({
      sessionId: 'session-A',
      status: LIVE_DUBBING_STATUS.RUNNING,
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
        providerId: 'gemini',
        targetLanguage: 'de',
        status: LIVE_DUBBING_STATUS.RUNNING,
        startedAt: 2,
        lastError: null,
        eventSequence: 1,
      },
    });
    resolveDispose({
      success: true,
      ack: 'DISPOSED',
      sessionId: 'session-1',
      providerId: 'gemini',
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
      providerId: 'gemini',
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
