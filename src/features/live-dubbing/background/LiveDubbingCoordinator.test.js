import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveDubbingCoordinator } from './LiveDubbingCoordinator.js';
import { LiveDubbingController } from '../offscreen/LiveDubbingController.js';
import {
  LIVE_DUBBING_OPENAI_PROVIDER_ID,
  LIVE_DUBBING_OWNER,
  LIVE_DUBBING_PROVIDER_IDS,
  LIVE_DUBBING_STORAGE_KEY,
  LIVE_DUBBING_OUTCOME_STORAGE_KEY,
  LIVE_DUBBING_OUTCOME_STORAGE_STATE,
  LIVE_DUBBING_STORAGE_STATE,
  LIVE_DUBBING_INTERNAL_STATUS,
  LIVE_DUBBING_STATUS,
  LIVE_DUBBING_START_TIMEOUT,
  LIVE_DUBBING_STOP_TIMEOUT,
} from '../constants.js';

function createHarness({ stored = null, outcome = null, streamId = 'stream-secret', statusResponse, documentExists } = {}) {
  const storage = new Map(stored
    ? [[LIVE_DUBBING_STORAGE_KEY, { providerId: 'gemini', ...stored }]]
    : []);
  if (outcome) storage.set(LIVE_DUBBING_OUTCOME_STORAGE_KEY, outcome);
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
        audioPathReady: true,
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
        audioPathReady: true,
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
        get: vi.fn(async key => Array.isArray(key)
          ? Object.fromEntries(key.map(item => [item, storage.get(item)]))
          : { [key]: storage.get(key) }),
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
    const result = await harness.coordinator.start({ data: { targetLanguage: 'zh-Hans' } }, {});

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
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY).targetLanguage).toBe('zh-Hans');
    expect(messages.map(message => message.data.targetLanguage)).toEqual(['zh-Hans', 'zh-Hans', 'zh-Hans']);
    expect(result.status.status).toBe(LIVE_DUBBING_STATUS.RUNNING);
    expect(result.status.eventSequence).toBe(3);
    expect(result.status.providerId).toBe('gemini');
    expect(result.status.targetLanguage).toBe('zh-Hans');
  });

  it('defaults START without providerId to Gemini and rejects explicit unknown providers', async () => {
    const defaultHarness = createHarness();
    const defaultResult = await defaultHarness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    expect(defaultResult).toMatchObject({ success: true, status: { providerId: 'gemini' } });

    const unknownHarness = createHarness();
    await expect(unknownHarness.coordinator.start({
      data: { providerId: 'unknown', targetLanguage: 'en' },
    }, {})).resolves.toEqual({
      success: false,
      error: 'LIVE_DUBBING_PROVIDER_UNSUPPORTED',
    });
    expect(unknownHarness.manager.acquire).not.toHaveBeenCalled();
    expect(unknownHarness.chromeAPI.tabCapture.getMediaStreamId).not.toHaveBeenCalled();

    const emptyHarness = createHarness();
    await expect(emptyHarness.coordinator.start({
      data: { providerId: '', targetLanguage: 'en' },
    }, {})).resolves.toEqual({
      success: false,
      error: 'LIVE_DUBBING_PROVIDER_UNSUPPORTED',
    });
  });

  it('fixes OpenAI provider identity at START and uses generic media readiness', async () => {
    const harness = createHarness();
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
          audioPathReady: true,
          inputPipelineReady: false,
          outputPipelineReady: false,
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
          audioPathReady: true,
          inputPipelineReady: false,
          outputPipelineReady: false,
          setupComplete: true,
        };
      }
      return { success: true, ack: 'DISPOSED', sessionId: message.data.sessionId, providerId: message.data.providerId };
    });

    const result = await harness.coordinator.start({
      data: { providerId: 'openai', targetLanguage: 'de-DE' },
    }, {});

    expect(result).toMatchObject({
      success: true,
      status: {
        providerId: 'openai',
        targetLanguage: 'de-DE',
        status: LIVE_DUBBING_STATUS.RUNNING,
      },
    });
    expect(harness.manager.acquire).toHaveBeenCalledWith({
      owner: LIVE_DUBBING_OWNER,
      leaseId: 'session-1',
      requiredReasons: ['USER_MEDIA', 'AUDIO_PLAYBACK', 'WEB_RTC'],
    });
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY)).toMatchObject({
      providerId: 'openai',
      targetLanguage: 'de-DE',
    });
  });

  it.each([
    ['gemini', 'de-DE'],
    ['openai', 'en_US'],
  ])('rejects invalid %s target language before descriptor and runtime side effects', async (providerId, targetLanguage) => {
    const harness = createHarness();

    await expect(harness.coordinator.start({ data: { providerId, targetLanguage } }, {}))
      .resolves.toEqual({ success: false, error: 'INVALID_TARGET_LANGUAGE' });

    expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
    expect(harness.browserAPI.storage.session.set).not.toHaveBeenCalled();
    expect(harness.manager.acquire).not.toHaveBeenCalled();
    expect(harness.chromeAPI.tabCapture.getMediaStreamId).not.toHaveBeenCalled();
    expect(harness.browserAPI.runtime.sendMessage).not.toHaveBeenCalled();
    expect(harness.coordinator.descriptor).toBeNull();
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

  it('bounds START timeout cleanup when lease acquisition is slow/delayed', async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness();
      let resolveLease;
      const lease = new Promise(resolve => { resolveLease = resolve; });
      harness.manager.acquire.mockImplementationOnce(() => lease);

      const start = harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
      while (!resolveLease) await Promise.resolve();

      await vi.advanceTimersByTimeAsync(LIVE_DUBBING_START_TIMEOUT + LIVE_DUBBING_STOP_TIMEOUT);
      await expect(start).resolves.toMatchObject({
        success: false,
        error: 'LIVE_DUBBING_START_TIMEOUT',
        retryable: true,
        cleanupPending: true,
        status: { sessionId: 'session-1' },
      });
      expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY)).toMatchObject({
        sessionId: 'session-1',
      });
      expect(harness.browserAPI.runtime.sendMessage.mock.calls
        .map(([message]) => message)
        .filter(message => message.action === 'LIVE_DUBBING_DISPOSE'))
        .toHaveLength(1);
      expect(harness.manager.release).not.toHaveBeenCalled();

      await expect(harness.coordinator.getStatus()).resolves.toMatchObject({
        success: true,
        status: { sessionId: 'session-1' },
      });

      resolveLease(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(harness.manager.release).toHaveBeenCalledWith({
        owner: LIVE_DUBBING_OWNER,
        leaseId: 'session-1',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds reconciliation cleanup and leaves the transition queue available', async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness({
        stored: {
          sessionId: 'old-session',
          tabId: 42,
          targetLanguage: 'en',
          status: LIVE_DUBBING_STATUS.ERROR,
          startedAt: 1,
          lastError: 'START_FAILED',
          eventSequence: 1,
        },
        documentExists: true,
        statusResponse: {
          success: true,
          active: false,
          sessionId: 'old-session',
          status: LIVE_DUBBING_STATUS.ERROR,
        },
      });
      harness.manager.activeLeases = [{ owner: LIVE_DUBBING_OWNER, leaseId: 'old-session' }];
      const originalSendMessage = harness.browserAPI.runtime.sendMessage.getMockImplementation();
      let disposeAttempts = 0;
      let resolveFirstDispose;
      let resolveSecondDispose;
      harness.browserAPI.runtime.sendMessage.mockImplementation(async message => {
        if (message.action === 'LIVE_DUBBING_DISPOSE') {
          disposeAttempts += 1;
          return new Promise(resolve => {
            if (disposeAttempts === 1) resolveFirstDispose = resolve;
            else resolveSecondDispose = resolve;
          });
        }
        return originalSendMessage(message);
      });

      const reconcile = harness.coordinator.reconcile();
      while (!resolveFirstDispose) await Promise.resolve();

      await vi.advanceTimersByTimeAsync(LIVE_DUBBING_STOP_TIMEOUT);
      await expect(reconcile).resolves.toMatchObject({
        success: false,
        retryable: true,
        cleanupPending: true,
        status: { sessionId: 'old-session' },
      });
      await expect(harness.coordinator.getStatus()).resolves.toMatchObject({
        success: true,
        status: { sessionId: 'old-session' },
      });
      expect(harness.manager.release).not.toHaveBeenCalled();

      const retry = harness.coordinator.reconcile();
      while (!resolveSecondDispose) await Promise.resolve();
      expect(disposeAttempts).toBe(2);
      resolveSecondDispose({
        success: true,
        ack: 'DISPOSED',
        sessionId: 'old-session',
        providerId: 'gemini',
      });
      await expect(retry).resolves.toMatchObject({ success: true, status: null });
      expect(resolveFirstDispose).toEqual(expect.any(Function));
      expect(harness.manager.release).toHaveBeenCalledWith({
        owner: LIVE_DUBBING_OWNER,
        leaseId: 'old-session',
      });
    } finally {
      vi.useRealTimers();
    }
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

  it('bounds STOP while canonical disposal is pending and releases only after it settles', async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness();
      const originalSendMessage = harness.browserAPI.runtime.sendMessage.getMockImplementation();
      let resolveDispose;
      harness.browserAPI.runtime.sendMessage.mockImplementation(async message => {
        if (message.action === 'LIVE_DUBBING_DISPOSE') {
          return new Promise(resolve => { resolveDispose = resolve; });
        }
        return originalSendMessage(message);
      });

      await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
      const firstStop = harness.coordinator.stop({ data: { sessionId: 'session-1' } });
      while (!resolveDispose) await Promise.resolve();

      await vi.advanceTimersByTimeAsync(LIVE_DUBBING_STOP_TIMEOUT);
      await expect(firstStop).resolves.toMatchObject({
        success: false,
        error: 'LIVE_DUBBING_STOP_TIMEOUT',
        retryable: true,
        cleanupPending: true,
        status: { sessionId: 'session-1', status: LIVE_DUBBING_STATUS.STOPPING },
      });
      expect(harness.manager.release).not.toHaveBeenCalled();
      expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY)).toMatchObject({
        sessionId: 'session-1',
        status: LIVE_DUBBING_STATUS.STOPPING,
      });

      const secondStop = harness.coordinator.stop({ data: { sessionId: 'session-1' } });
      await vi.advanceTimersByTimeAsync(LIVE_DUBBING_STOP_TIMEOUT);
      await expect(secondStop).resolves.toMatchObject({
        success: false,
        error: 'LIVE_DUBBING_STOP_TIMEOUT',
        cleanupPending: true,
      });
      expect(harness.browserAPI.runtime.sendMessage.mock.calls
        .map(([message]) => message)
        .filter(message => message.action === 'LIVE_DUBBING_DISPOSE'))
        .toHaveLength(2);

      resolveDispose({
        success: true,
        ack: 'DISPOSED',
        sessionId: 'session-1',
        providerId: 'gemini',
      });
      await vi.advanceTimersByTimeAsync(0);

      expect(harness.manager.release).toHaveBeenCalledOnce();
      expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
      await expect(harness.coordinator.stop({ data: { sessionId: 'session-1' } }))
        .resolves.toMatchObject({ success: true, idempotent: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('serves STATUS immediately while START is pending without joining its queue', async () => {
    const harness = createHarness();
    const originalSendMessage = harness.browserAPI.runtime.sendMessage.getMockImplementation();
    let resolvePrepare;
    harness.browserAPI.runtime.sendMessage.mockImplementation(async message => {
      if (message.action === 'LIVE_DUBBING_PREPARE') {
        return new Promise(resolve => { resolvePrepare = resolve; });
      }
      return originalSendMessage(message);
    });

    const startPromise = harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    while (!resolvePrepare) await Promise.resolve();

    // A reopened popup recovers from this authoritative snapshot instead of
    // waiting behind the pending START mutation.
    let statusSettled = false;
    const statusPromise = harness.coordinator.getStatus().then(result => {
      statusSettled = true;
      return result;
    });
    for (let i = 0; i < 10 && !statusSettled; i += 1) await Promise.resolve();
    expect(statusSettled).toBe(true);
    await expect(statusPromise).resolves.toMatchObject({
      success: true,
      status: { sessionId: 'session-1', status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE },
    });

    resolvePrepare({
      success: true,
      ack: 'READY',
      sessionId: 'session-1',
      providerId: 'gemini',
      eventSequence: 0,
    });
    await expect(startPromise).resolves.toMatchObject({ success: true });
  });

  it('cancels a pending START via authoritative STOP with cleanup, release, and no late RUNNING', async () => {
    const harness = createHarness();
    const originalSendMessage = harness.browserAPI.runtime.sendMessage.getMockImplementation();
    let resolveConsume;
    harness.browserAPI.runtime.sendMessage.mockImplementation(async message => {
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
      return originalSendMessage(message);
    });

    const startPromise = harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    while (!resolveConsume) await Promise.resolve();

    const stopped = await harness.coordinator.stop({ data: { sessionId: 'session-1' } });
    expect(stopped).toMatchObject({ success: true, stopped: true, status: null });
    expect(harness.manager.release).toHaveBeenCalledOnce();
    expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);

    resolveConsume({
      success: true,
      ack: 'MEDIA_ACQUIRED',
      sessionId: 'session-1',
      providerId: 'gemini',
      status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
      eventSequence: 1,
      captureReady: true,
      audioPathReady: true,
      inputPipelineReady: true,
      outputPipelineReady: true,
    });
    const started = await startPromise;
    expect(started.success).toBe(false);
    expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
    const persistedStatuses = harness.browserAPI.storage.session.set.mock.calls
      .flatMap(([record]) => Object.values(record))
      .filter(value => value && typeof value === 'object' && typeof value.status === 'string')
      .map(value => value.status);
    expect(persistedStatuses).not.toContain(LIVE_DUBBING_STATUS.RUNNING);
    expect(harness.manager.release).toHaveBeenCalledTimes(1);
  });

  it('keeps a failed START with pending cleanup stoppable and reconstructs it from STATUS', async () => {
    const harness = createHarness();
    const originalSendMessage = harness.browserAPI.runtime.sendMessage.getMockImplementation();
    let disposeCalls = 0;
    harness.browserAPI.runtime.sendMessage.mockImplementation(async message => {
      if (message.action === 'LIVE_DUBBING_CONSUME') {
        return { success: false, error: 'LIVE_DUBBING_OFFSCREEN_BUSY' };
      }
      if (message.action === 'LIVE_DUBBING_DISPOSE') {
        disposeCalls += 1;
        if (disposeCalls === 1) return { success: false, error: 'DISPOSE_TRANSPORT_FAILED' };
      }
      return originalSendMessage(message);
    });

    const failed = await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    expect(failed).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_START_FAILED',
      retryable: true,
      cleanupPending: true,
    });
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY)).toMatchObject({
      sessionId: 'session-1',
      status: LIVE_DUBBING_STATUS.ERROR,
    });
    expect(harness.manager.release).not.toHaveBeenCalled();

    await expect(harness.coordinator.getStatus()).resolves.toMatchObject({
      success: true,
      status: { sessionId: 'session-1', status: LIVE_DUBBING_STATUS.ERROR },
    });

    const stopped = await harness.coordinator.stop({ data: { sessionId: 'session-1' } });
    expect(stopped).toMatchObject({ success: true, stopped: true, status: null });
    expect(disposeCalls).toBe(2);
    expect(harness.manager.release).toHaveBeenCalledOnce();
    expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
  });

  it('bounds STOP retries while controller physical teardown is slow/delayed', async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness();
      const track = {
        kind: 'audio',
        readyState: 'live',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        stop: vi.fn(),
      };
      let resolveProviderDispose;
      const providerDispose = vi.fn(() => new Promise(resolve => { resolveProviderDispose = resolve; }));
      const inputPipeline = { start: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
      const outputPlayer = { start: vi.fn(async () => {}), stop: vi.fn(async () => {}), clear: vi.fn() };
      const providerClient = { connect: vi.fn(async () => {}), dispose: providerDispose, close: vi.fn() };
      const sender = {
        id: 'extension-id',
        url: 'chrome-extension://extension-id/src/html/offscreen.html',
      };
      const offscreen = new LiveDubbingController({
        mediaDevices: { getUserMedia: vi.fn(async () => ({
          getAudioTracks: () => [track],
          getTracks: () => [track],
        })) },
        inputPipelineFactory: vi.fn(async () => inputPipeline),
        outputPlayerFactory: vi.fn(async () => outputPlayer),
        providerClient,
        requestBootstrap: request => harness.coordinator.authorizeOffscreenControlMessage(request, sender, { type: 'bootstrap' })
          .then(descriptor => descriptor
            ? {
              success: true,
              providerId: descriptor.providerId,
              targetLanguage: descriptor.targetLanguage,
              bootstrap: { accessToken: 'handler-token' },
            }
            : { success: false }),
        notify: vi.fn(),
      });
      harness.browserAPI.runtime.sendMessage.mockImplementation(message => {
        harness.calls.push(['message', message]);
        return offscreen.handle(message);
      });

      const started = await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
      expect(started).toMatchObject({ success: true, status: { sessionId: 'session-1' } });

      // First STOP: the single physical teardown starts but is slow/delayed.
      // The externally visible wait is bounded; ownership is retained.
      const firstStop = harness.coordinator.stop({ data: { sessionId: 'session-1' } });
      while (!resolveProviderDispose) await Promise.resolve();
      expect(providerDispose).toHaveBeenCalledOnce();
      expect(offscreen.prepare('session-2', 'gemini', 'en', 0)).toMatchObject({
        success: false,
        error: 'LIVE_DUBBING_SESSION_DISPOSED',
        ignored: true,
      });

      await vi.advanceTimersByTimeAsync(LIVE_DUBBING_STOP_TIMEOUT);
      await expect(firstStop).resolves.toMatchObject({
        success: false,
        retryable: true,
        cleanupPending: true,
        status: { sessionId: 'session-1' },
      });
      expect(harness.manager.release).not.toHaveBeenCalled();
      expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY)).toMatchObject({ sessionId: 'session-1' });

      // Second attempt: fresh transport delivery joins the same canonical
      // physical promise. No concurrent duplicate teardown, no false success.
      const secondStop = harness.coordinator.stop({ data: { sessionId: 'session-1' } });
      await vi.advanceTimersByTimeAsync(0);
      expect(providerDispose).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(LIVE_DUBBING_STOP_TIMEOUT);
      await expect(secondStop).resolves.toMatchObject({
        success: false,
        retryable: true,
        cleanupPending: true,
        status: { sessionId: 'session-1' },
      });
      expect(providerDispose).toHaveBeenCalledOnce();
      expect(harness.manager.release).not.toHaveBeenCalled();
      expect(offscreen.prepare('session-2', 'gemini', 'en', 0)).toMatchObject({
        success: false,
        error: 'LIVE_DUBBING_SESSION_DISPOSED',
      });

      // Authoritative success: resolving the single physical teardown lets a
      // fresh exact DISPOSE acknowledge exactly once. Stale pending results
      // never became DISPOSED on their own and never corrupted a new session.
      resolveProviderDispose();
      await vi.advanceTimersByTimeAsync(0);

      const thirdStop = harness.coordinator.stop({ data: { sessionId: 'session-1' } });
      await expect(thirdStop).resolves.toMatchObject({ success: true, stopped: true, status: null });
      expect(providerDispose).toHaveBeenCalledOnce();
      expect(harness.manager.release).toHaveBeenCalledOnce();
      expect(harness.manager.release).toHaveBeenCalledWith({
        owner: LIVE_DUBBING_OWNER,
        leaseId: 'session-1',
      });
      expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
      expect(offscreen.prepare('session-2', 'gemini', 'en', 0)).toMatchObject({
        success: true,
        sessionId: 'session-2',
      });
      expect(offscreen.currentSession).toMatchObject({ sessionId: 'session-2' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('recovers permanently hung physical teardown via offscreen recreation and reconciliation', async () => {
    vi.useFakeTimers();
    try {
      const harness = createHarness();
      const track = {
        kind: 'audio',
        readyState: 'live',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        stop: vi.fn(),
      };
      // NEVER resolved by design: the old physical teardown stays pending
      // forever. No resolver is captured and nothing resolves it below.
      const providerDispose = vi.fn(() => new Promise(() => {}));
      const inputPipeline = { start: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
      const outputPlayer = { start: vi.fn(async () => {}), stop: vi.fn(async () => {}), clear: vi.fn() };
      const providerClient = { connect: vi.fn(async () => {}), dispose: providerDispose, close: vi.fn() };
      const sender = {
        id: 'extension-id',
        url: 'chrome-extension://extension-id/src/html/offscreen.html',
      };
      const authorizeBootstrap = request => harness.coordinator.authorizeOffscreenControlMessage(request, sender, { type: 'bootstrap' })
        .then(descriptor => descriptor
          ? {
            success: true,
            providerId: descriptor.providerId,
            targetLanguage: descriptor.targetLanguage,
            bootstrap: { accessToken: 'handler-token' },
          }
          : { success: false });
      const oldNotify = vi.fn();
      const oldController = new LiveDubbingController({
        mediaDevices: { getUserMedia: vi.fn(async () => ({
          getAudioTracks: () => [track],
          getTracks: () => [track],
        })) },
        inputPipelineFactory: vi.fn(async () => inputPipeline),
        outputPlayerFactory: vi.fn(async () => outputPlayer),
        providerClient,
        requestBootstrap: authorizeBootstrap,
        notify: oldNotify,
      });
      harness.browserAPI.runtime.sendMessage.mockImplementation(message => {
        harness.calls.push(['message', message]);
        return oldController.handle(message);
      });

      const started = await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
      expect(started).toMatchObject({ success: true, status: { sessionId: 'session-1' } });

      const firstStop = harness.coordinator.stop({ data: { sessionId: 'session-1' } });
      while (providerDispose.mock.calls.length === 0) await Promise.resolve();
      expect(providerDispose).toHaveBeenCalledOnce();

      await vi.advanceTimersByTimeAsync(LIVE_DUBBING_STOP_TIMEOUT);
      await expect(firstStop).resolves.toMatchObject({
        success: false,
        retryable: true,
        cleanupPending: true,
        status: { sessionId: 'session-1' },
      });
      expect(harness.manager.release).not.toHaveBeenCalled();
      expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY)).toMatchObject({ sessionId: 'session-1' });

      const secondStop = harness.coordinator.stop({ data: { sessionId: 'session-1' } });
      await vi.advanceTimersByTimeAsync(0);
      expect(providerDispose).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(LIVE_DUBBING_STOP_TIMEOUT);
      await expect(secondStop).resolves.toMatchObject({
        success: false,
        retryable: true,
        cleanupPending: true,
        status: { sessionId: 'session-1' },
      });
      expect(providerDispose).toHaveBeenCalledOnce();
      expect(harness.manager.release).not.toHaveBeenCalled();
      expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY)).toMatchObject({ sessionId: 'session-1' });

      // Simulate offscreen destruction/recreation: swap in a fresh controller
      // with healthy doubles. The old permanently pending physical promise is
      // abandoned by design; it is never resolved and never retried
      // concurrently.
      const freshTrack = {
        kind: 'audio',
        readyState: 'live',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        stop: vi.fn(),
      };
      const freshInputPipeline = { start: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
      const freshOutputPlayer = { start: vi.fn(async () => {}), stop: vi.fn(async () => {}), clear: vi.fn() };
      const freshProvider = { connect: vi.fn(async () => {}), dispose: vi.fn(async () => {}), close: vi.fn() };
      const freshController = new LiveDubbingController({
        mediaDevices: { getUserMedia: vi.fn(async () => ({
          getAudioTracks: () => [freshTrack],
          getTracks: () => [freshTrack],
        })) },
        inputPipelineFactory: vi.fn(async () => freshInputPipeline),
        outputPlayerFactory: vi.fn(async () => freshOutputPlayer),
        providerClient: freshProvider,
        requestBootstrap: authorizeBootstrap,
        notify: vi.fn(),
      });
      harness.browserAPI.runtime.sendMessage.mockImplementation(message => {
        harness.calls.push(['message', message]);
        return freshController.handle(message);
      });
      harness.manager.documentExists = true;

      expect(oldController.disposedSession.cleanupComplete).toBe(false);
      expect(freshController.currentSession).toBeNull();
      expect(freshController.disposedSession).toBeNull();

      // Existing production recovery path, no new contract.
      const reconciled = await harness.coordinator.reconcile();
      expect(reconciled).toMatchObject({ success: true, status: null, stale: true, retryable: false });
      expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
      expect(harness.manager.release).toHaveBeenCalledTimes(1);
      expect(harness.manager.release).toHaveBeenCalledWith({
        owner: LIVE_DUBBING_OWNER,
        leaseId: 'session-1',
      });

      // No false provider/session inference: exactly one STATUS probe for the
      // exact old session/provider.
      const statusProbes = harness.browserAPI.runtime.sendMessage.mock.calls
        .map(([message]) => message)
        .filter(message => message.action === 'LIVE_DUBBING_STATUS');
      expect(statusProbes).toHaveLength(1);
      expect(statusProbes[0]).toMatchObject({ data: { sessionId: 'session-1', providerId: 'gemini' } });

      // Abandoned old-controller callbacks cannot affect cleared state.
      const oldSession = oldController.disposedSession.session;
      oldController._handleTrackEnded(oldSession);
      providerClient.onError?.(new Error('abandoned old controller'));
      providerClient.onClose?.({ code: 1000, wasClean: false });
      await vi.advanceTimersByTimeAsync(0);
      expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
      expect(harness.manager.release).toHaveBeenCalledTimes(1);
      expect(freshController.currentSession).toBeNull();
      expect(oldNotify).not.toHaveBeenCalled();

      // New session works after recovery.
      expect(freshController.prepare('session-2', 'gemini', 'en', 0)).toMatchObject({
        success: true,
        sessionId: 'session-2',
      });
      await freshController.dispose('session-2', 'gemini');
      harness.coordinator.uuid = () => 'session-3';
      const restarted = await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
      expect(restarted).toMatchObject({ success: true, status: { sessionId: 'session-3' } });
      expect(providerDispose).toHaveBeenCalledOnce();
      expect(freshProvider.dispose).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
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

  it('only cancels a pending start for its exact tab during tab resolution', async () => {
    const harness = createHarness();
    let resolveTab;
    harness.browserAPI.tabs.get.mockImplementationOnce(() => new Promise(resolve => {
      resolveTab = resolve;
    }));
    const startPromise = harness.coordinator.start({ data: { targetLanguage: 'en' } }, {
      tab: { id: 42 },
      url: 'https://example.test',
    });

    while (!resolveTab) await Promise.resolve();

    await expect(harness.coordinator.handleTabRemoved(99)).resolves.toMatchObject({
      success: true,
      ignored: true,
    });
    await expect(harness.coordinator.handleTopLevelNavigation(99)).resolves.toMatchObject({
      success: true,
      ignored: true,
    });
    expect([...harness.coordinator.pendingStarts][0].terminalRequested).toBe(false);

    await expect(harness.coordinator.handleTopLevelNavigation(42)).resolves.toMatchObject({
      success: true,
      pending: true,
      stopped: false,
      reason: 'TOP_LEVEL_NAVIGATION',
    });
    resolveTab({ id: 42, url: 'https://example.test' });

    await expect(startPromise).resolves.toEqual({
      success: false,
      error: 'LIVE_DUBBING_START_CANCELLED',
    });
    expect(harness.manager.acquire).not.toHaveBeenCalled();
    expect(harness.browserAPI.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it.each(['TAB_REMOVED', 'TOP_LEVEL_NAVIGATION'])('cancels an extension-sender start only when the delayed authoritative tab matches (%s)', async event => {
      const harness = createHarness();
      let resolveTabs;
      harness.browserAPI.tabs.query.mockImplementationOnce(() => new Promise(resolve => {
        resolveTabs = resolve;
      }));
      const startPromise = harness.coordinator.start({ data: { targetLanguage: 'en' } }, {
        id: 'extension-id',
        url: 'chrome-extension://extension-id/src/html/popup.html',
      });

      while (!resolveTabs) await Promise.resolve();

      await expect(harness.coordinator.handleTabRemoved(99)).resolves.toMatchObject({
        success: true,
        pending: true,
        stopped: false,
      });
      await expect(harness.coordinator.handleTopLevelNavigation(99)).resolves.toMatchObject({
        success: true,
        pending: true,
        stopped: false,
      });
      expect([...harness.coordinator.pendingStarts][0].terminalRequested).toBe(false);

      const matchingEvent = event === 'TAB_REMOVED'
        ? harness.coordinator.handleTabRemoved(42)
        : harness.coordinator.handleTopLevelNavigation(42);
      await expect(matchingEvent).resolves.toMatchObject({
        success: true,
        pending: true,
        stopped: false,
      });
      expect([...harness.coordinator.pendingStarts][0].terminalRequested).toBe(false);

      resolveTabs([{ id: 42, url: 'https://example.test' }]);

      await expect(startPromise).resolves.toEqual({
        success: false,
        error: 'LIVE_DUBBING_START_CANCELLED',
      });
      expect(harness.browserAPI.tabs.query).toHaveBeenCalledOnce();
      expect(harness.manager.acquire).not.toHaveBeenCalled();
      expect(harness.chromeAPI.tabCapture.getMediaStreamId).not.toHaveBeenCalled();
      expect(harness.browserAPI.runtime.sendMessage).not.toHaveBeenCalled();
    });

  it.each(['TAB_REMOVED', 'TOP_LEVEL_NAVIGATION'])('records delayed tab events for queued unresolved starts after a different known start (%s)', async event => {
      const harness = createHarness();
      harness.coordinator.uuid = vi.fn()
        .mockReturnValueOnce('session-a')
        .mockReturnValueOnce('session-b');
      let resolveKnownTab;
      harness.browserAPI.tabs.get.mockImplementationOnce(() => new Promise(resolve => {
        resolveKnownTab = resolve;
      }));

      const startA = harness.coordinator.start({ data: { targetLanguage: 'en' } }, {
        tab: { id: 41 },
        url: 'https://example.test',
      });
      while (!resolveKnownTab) await Promise.resolve();

      const startB = harness.coordinator.start({ data: { targetLanguage: 'en' } }, {
        id: 'extension-id',
        url: 'chrome-extension://extension-id/src/html/popup.html',
      });
      const pendingB = [...harness.coordinator.pendingStarts]
        .find(pending => pending.sessionId === 'session-b');

      const tabEvent = event === 'TAB_REMOVED'
        ? harness.coordinator.handleTabRemoved(42)
        : harness.coordinator.handleTopLevelNavigation(42);
      await expect(tabEvent).resolves.toMatchObject({
        success: true,
        pending: true,
        stopped: false,
        reason: event,
      });
      expect(pendingB.terminalRequested).toBe(false);
      expect(pendingB.tabEventIds).toContain(42);

      await expect(harness.coordinator.stop({ data: { sessionId: 'session-a' } })).resolves.toMatchObject({
        success: true,
        pending: true,
        stopped: false,
      });
      resolveKnownTab({ id: 41, url: 'https://example.test' });

      await expect(startA).resolves.toEqual({
        success: false,
        error: 'LIVE_DUBBING_START_CANCELLED',
      });
      await expect(startB).resolves.toEqual({
        success: false,
        error: 'LIVE_DUBBING_START_CANCELLED',
      });
      expect(harness.browserAPI.tabs.query).toHaveBeenCalledOnce();
      expect(harness.manager.acquire).not.toHaveBeenCalled();
      expect(harness.chromeAPI.tabCapture.getMediaStreamId).not.toHaveBeenCalled();
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

    expect(result).toMatchObject({
      success: false,
      error: 'STOP_FAILED',
      retryable: true,
      cleanupPending: true,
    });
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
          audioPathReady: true,
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
      audioPathReady: true,
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
          audioPathReady: true,
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
      audioPathReady: true,
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
          audioPathReady: true,
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
      audioPathReady: true,
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
          audioPathReady: true,
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
      audioPathReady: true,
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

  it('persists a public-safe runtime error outcome before clearing the descriptor', async () => {
    const harness = createHarness();
    await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});

    const result = await harness.coordinator.handleOffscreenTerminal({
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        status: LIVE_DUBBING_STATUS.ERROR,
        error: 'GEMINI_LIVE_REMOTE_ERROR',
        providerDiagnostic: {
          code: 'GEMINI_LIVE_REMOTE_ERROR',
          closeCode: 1011,
          wasClean: false,
          terminalCategory: 'REMOTE_ERROR',
          wsOpen: true,
          setupSent: true,
          setupComplete: false,
          payload: 'private-payload',
        },
      },
    }, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    });

    expect(result).toMatchObject({ success: true, stopped: true });
    expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
    expect(harness.storage.get(LIVE_DUBBING_OUTCOME_STORAGE_KEY)).toEqual({
      sourceSessionId: 'session-1',
      providerId: 'gemini',
      error: 'GEMINI_LIVE_REMOTE_ERROR',
      occurredAt: 123,
      providerDiagnostic: {
        stage: 'CONNECT_PROVIDER',
        code: 'GEMINI_LIVE_REMOTE_ERROR',
        closeCode: 1011,
        wasClean: false,
        terminalCategory: 'REMOTE_ERROR',
        malformedAt: null,
        wsOpen: true,
        setupSent: true,
        setupComplete: false,
      },
    });

    await expect(harness.coordinator.getStatus()).resolves.toEqual({
      success: true,
      available: true,
      status: null,
      terminalOutcome: {
        providerId: 'gemini',
        error: 'GEMINI_LIVE_REMOTE_ERROR',
        occurredAt: 123,
        providerDiagnostic: expect.objectContaining({
          stage: 'CONNECT_PROVIDER',
          code: 'GEMINI_LIVE_REMOTE_ERROR',
        }),
      },
    });
    const notifications = harness.browserAPI.runtime.sendMessage.mock.calls
      .map(([message]) => message)
      .filter(message => message.action === 'LIVE_DUBBING_TERMINAL_OUTCOME');
    expect(notifications).toEqual([{
      action: 'LIVE_DUBBING_TERMINAL_OUTCOME',
      data: expect.objectContaining({
        providerId: 'gemini',
        error: 'GEMINI_LIVE_REMOTE_ERROR',
      }),
    }]);
    expect(notifications[0].data).not.toHaveProperty('sourceSessionId');
  });

  it('starts terminal cleanup before deferred outcome storage settles', async () => {
    const harness = createHarness();
    await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    const originalSet = harness.browserAPI.storage.session.set.getMockImplementation();
    let resolveOutcome;
    let outcomeSettled = false;
    harness.browserAPI.storage.session.set.mockImplementation(async record => {
      if (record[LIVE_DUBBING_OUTCOME_STORAGE_KEY]) {
        return new Promise(resolve => {
          resolveOutcome = () => {
            outcomeSettled = true;
            resolve(originalSet(record));
          };
        });
      }
      return originalSet(record);
    });

    const terminal = harness.coordinator.handleOffscreenTerminal({
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        status: LIVE_DUBBING_STATUS.ERROR,
        error: 'LIVE_DUBBING_PROVIDER_ERROR',
      },
    }, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    });

    while (!harness.browserAPI.runtime.sendMessage.mock.calls
      .some(([message]) => message.action === 'LIVE_DUBBING_DISPOSE')) await Promise.resolve();
    expect(resolveOutcome).toEqual(expect.any(Function));
    expect(harness.browserAPI.runtime.sendMessage.mock.calls
      .map(([message]) => message.action)).toContain('LIVE_DUBBING_DISPOSE');
    while (harness.manager.release.mock.calls.length === 0) await Promise.resolve();
    expect(harness.manager.release).toHaveBeenCalledOnce();
    expect(outcomeSettled).toBe(false);

    await expect(terminal).resolves.toMatchObject({ success: true, stopped: true });
    // Notification must not be sent while outcome persistence is still pending;
    // otherwise Popup could read terminalOutcome:null before the write lands.
    expect(harness.browserAPI.runtime.sendMessage.mock.calls
      .map(([message]) => message.action)).not.toContain('LIVE_DUBBING_TERMINAL_OUTCOME');
    // A racing popup read must not observe the outcome before it is persisted.
    await expect(harness.coordinator.getStatus()).resolves.toMatchObject({
      success: true,
      status: null,
      terminalOutcome: null,
    });
    resolveOutcome();
    await harness.coordinator.stateStore.awaitOutcomeMutations();
    // Notification is chained after outcome persistence; flush that microtask chain.
    await Promise.resolve();
    await Promise.resolve();
    expect(outcomeSettled).toBe(true);
    const notifications = harness.browserAPI.runtime.sendMessage.mock.calls
      .map(([message]) => message)
      .filter(message => message.action === 'LIVE_DUBBING_TERMINAL_OUTCOME');
    expect(notifications).toHaveLength(1);
    expect(notifications[0].data).toMatchObject({
      providerId: 'gemini',
      error: 'LIVE_DUBBING_PROVIDER_ERROR',
    });
    await expect(harness.coordinator.getStatus()).resolves.toMatchObject({
      success: true,
      status: null,
      terminalOutcome: {
        providerId: 'gemini',
        error: 'LIVE_DUBBING_PROVIDER_ERROR',
      },
    });
  });

  it('notifies only after failed outcome write settles, leaving idle status without false retained session and without unhandled rejection', async () => {
    const harness = createHarness();
    await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    const originalSet = harness.browserAPI.storage.session.set.getMockImplementation();
    let rejectOutcome;
    let outcomeSettled = false;
    harness.browserAPI.storage.session.set.mockImplementation(async record => {
      if (record[LIVE_DUBBING_OUTCOME_STORAGE_KEY]) {
        return new Promise((_, reject) => {
          rejectOutcome = () => {
            outcomeSettled = true;
            reject(new Error('outcome storage unavailable'));
          };
        });
      }
      return originalSet(record);
    });

    const unhandled = [];
    const onUnhandled = reason => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);

    const terminal = harness.coordinator.handleOffscreenTerminal({
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        status: LIVE_DUBBING_STATUS.ERROR,
        error: 'LIVE_DUBBING_PROVIDER_ERROR',
      },
    }, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    });

    while (!harness.browserAPI.runtime.sendMessage.mock.calls
      .some(([message]) => message.action === 'LIVE_DUBBING_DISPOSE')) await Promise.resolve();
    while (harness.manager.release.mock.calls.length === 0) await Promise.resolve();
    expect(outcomeSettled).toBe(false);

    await expect(terminal).resolves.toMatchObject({ success: true, stopped: true });
    // Cleanup success is independent of outcome I/O; notification must still wait.
    expect(harness.browserAPI.runtime.sendMessage.mock.calls
      .map(([message]) => message.action)).not.toContain('LIVE_DUBBING_TERMINAL_OUTCOME');
    expect(harness.coordinator.stateStore.awaitOutcomeMutations).toEqual(expect.any(Function));

    rejectOutcome();
    await harness.coordinator.stateStore.awaitOutcomeMutations();
    // Notification is chained after outcome persistence; flush that microtask chain.
    await Promise.resolve();
    await Promise.resolve();
    expect(outcomeSettled).toBe(true);

    const notifications = harness.browserAPI.runtime.sendMessage.mock.calls
      .map(([message]) => message)
      .filter(message => message.action === 'LIVE_DUBBING_TERMINAL_OUTCOME');
    expect(notifications).toHaveLength(1);
    expect(harness.coordinator.outcomeStorageState).toBe(LIVE_DUBBING_OUTCOME_STORAGE_STATE.WRITE_FAILED);
    await expect(harness.coordinator.getStatus()).resolves.toEqual({
      success: true,
      available: true,
      status: null,
      terminalOutcome: null,
    });
    expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
    expect(harness.storage.get(LIVE_DUBBING_OUTCOME_STORAGE_KEY)).toBeNull();
    // No duplicate and no unhandled rejection from deferred outcome.
    await Promise.resolve();
    expect(harness.browserAPI.runtime.sendMessage.mock.calls
      .filter(([message]) => message.action === 'LIVE_DUBBING_TERMINAL_OUTCOME')).toHaveLength(1);
    expect(unhandled).toHaveLength(0);
    process.off('unhandledRejection', onUnhandled);
  });

  it('defers notification and avoids duplicates when cleanup is pending, preserving cleanupPending ordering', async () => {
    const harness = createHarness();
    await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    const originalSet = harness.browserAPI.storage.session.set.getMockImplementation();
    let resolveOutcome;
    harness.browserAPI.storage.session.set.mockImplementation(async record => {
      if (record[LIVE_DUBBING_OUTCOME_STORAGE_KEY]) {
        return new Promise(resolve => {
          resolveOutcome = () => resolve(originalSet(record));
        });
      }
      return originalSet(record);
    });
    harness.browserAPI.runtime.sendMessage.mockImplementation(async message => {
      if (message.action === 'LIVE_DUBBING_DISPOSE') return { success: false };
      return { success: true };
    });

    const terminal = harness.coordinator.handleOffscreenTerminal({
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        status: LIVE_DUBBING_STATUS.ERROR,
        error: 'LIVE_DUBBING_PROVIDER_ERROR',
      },
    }, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    });

    while (!harness.browserAPI.runtime.sendMessage.mock.calls
      .some(([message]) => message.action === 'LIVE_DUBBING_DISPOSE')) await Promise.resolve();
    expect(resolveOutcome).toEqual(expect.any(Function));
    // Cleanup is pending/failing but outcome is still deferred: no notification yet.
    await Promise.resolve();
    expect(harness.browserAPI.runtime.sendMessage.mock.calls
      .map(([message]) => message.action)).not.toContain('LIVE_DUBBING_TERMINAL_OUTCOME');

    resolveOutcome();
    await harness.coordinator.stateStore.awaitOutcomeMutations();
    await Promise.resolve();
    await Promise.resolve();
    const pendingResult = await terminal;
    expect(pendingResult).toMatchObject({ success: false, cleanupPending: true });
    const notifications = harness.browserAPI.runtime.sendMessage.mock.calls
      .map(([message]) => message)
      .filter(message => message.action === 'LIVE_DUBBING_TERMINAL_OUTCOME');
    expect(notifications).toHaveLength(1);
    expect(notifications[0].data).toMatchObject({ error: 'LIVE_DUBBING_PROVIDER_ERROR' });
    // cleanupPending keeps descriptor and outcome observable as pending state.
    await expect(harness.coordinator.getStatus()).resolves.toMatchObject({
      success: true,
      status: { sessionId: 'session-1', status: LIVE_DUBBING_STATUS.ERROR },
      terminalOutcome: { error: 'LIVE_DUBBING_PROVIDER_ERROR' },
    });
    // No duplicate on microtask flush.
    await Promise.resolve();
    expect(harness.browserAPI.runtime.sendMessage.mock.calls
      .filter(([message]) => message.action === 'LIVE_DUBBING_TERMINAL_OUTCOME')).toHaveLength(1);
  });

  it.each([
    ['user stop', harness => harness.coordinator.stop({ data: { sessionId: 'session-1' } })],
    ['tab removal', harness => harness.coordinator.handleTabRemoved(42)],
    ['top-level navigation', harness => harness.coordinator.handleTopLevelNavigation(42)],
  ])('does not create an outcome for %s', async (_label, stop) => {
    const harness = createHarness();
    await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});

    await stop(harness);

    expect(harness.storage.get(LIVE_DUBBING_OUTCOME_STORAGE_KEY)).toBeNull();
  });

  it('retains a terminal outcome and descriptor when cleanup is pending', async () => {
    const harness = createHarness();
    await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    harness.browserAPI.runtime.sendMessage.mockImplementation(async message => {
      if (message.action === 'LIVE_DUBBING_DISPOSE') return { success: false };
      return { success: true };
    });

    const result = await harness.coordinator.handleOffscreenTerminal({
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        status: LIVE_DUBBING_STATUS.ERROR,
        error: 'LIVE_DUBBING_PROVIDER_ERROR',
      },
    }, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    });

    expect(result).toMatchObject({ success: false, cleanupPending: true });
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY)).toMatchObject({
      sessionId: 'session-1',
      status: LIVE_DUBBING_STATUS.ERROR,
    });
    expect(harness.storage.get(LIVE_DUBBING_OUTCOME_STORAGE_KEY)).toMatchObject({
      sourceSessionId: 'session-1',
      error: 'LIVE_DUBBING_PROVIDER_ERROR',
    });
    await expect(harness.coordinator.getStatus()).resolves.toMatchObject({
      success: true,
      status: { sessionId: 'session-1' },
      terminalOutcome: { error: 'LIVE_DUBBING_PROVIDER_ERROR' },
    });
  });

  it('clears an old outcome atomically only after a successful future START', async () => {
    const harness = createHarness();
    await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    await harness.coordinator.handleOffscreenTerminal({
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        status: LIVE_DUBBING_STATUS.ERROR,
        error: 'LIVE_DUBBING_PROVIDER_ERROR',
      },
    }, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    });

    harness.coordinator.uuid = () => 'session-2';
    const started = await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});

    expect(started).toMatchObject({ success: true, status: { sessionId: 'session-2' } });
    expect(harness.storage.get(LIVE_DUBBING_OUTCOME_STORAGE_KEY)).toBeNull();
    expect(harness.browserAPI.storage.session.set.mock.calls.some(([record]) => (
      record[LIVE_DUBBING_STORAGE_KEY]?.sessionId === 'session-2'
      && record[LIVE_DUBBING_OUTCOME_STORAGE_KEY] === null
    ))).toBe(true);
  });

  it('retains an old outcome when a future START fails before RUNNING commit', async () => {
    const harness = createHarness();
    await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    await harness.coordinator.handleOffscreenTerminal({
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        status: LIVE_DUBBING_STATUS.ERROR,
        error: 'LIVE_DUBBING_PROVIDER_ERROR',
      },
    }, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    });

    harness.coordinator.uuid = () => 'session-2';
    harness.chromeAPI.tabCapture.getMediaStreamId.mockRejectedValueOnce(new Error('capture failed'));
    await expect(harness.coordinator.start({ data: { targetLanguage: 'en' } }, {}))
      .resolves.toMatchObject({ success: false });

    expect(harness.storage.get(LIVE_DUBBING_OUTCOME_STORAGE_KEY)).toMatchObject({
      sourceSessionId: 'session-1',
      error: 'LIVE_DUBBING_PROVIDER_ERROR',
    });
  });

  it('does not let an old terminal overwrite a newer descriptor or outcome', async () => {
    const harness = createHarness();
    await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    await harness.browserAPI.storage.session.set({
      [LIVE_DUBBING_STORAGE_KEY]: {
        sessionId: 'new-session',
        tabId: 42,
        providerId: 'gemini',
        targetLanguage: 'en',
        status: LIVE_DUBBING_STATUS.RUNNING,
        startedAt: 2,
        lastError: null,
        eventSequence: 1,
      },
      [LIVE_DUBBING_OUTCOME_STORAGE_KEY]: {
        sourceSessionId: 'new-session',
        providerId: 'gemini',
        error: 'NEW_SESSION_ERROR',
        occurredAt: 456,
        providerDiagnostic: null,
      },
    });

    const result = await harness.coordinator.handleOffscreenTerminal({
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        status: LIVE_DUBBING_STATUS.ERROR,
        error: 'OLD_SESSION_ERROR',
      },
    }, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    });

    expect(result).toMatchObject({ success: true, ignored: true });
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY)).toMatchObject({ sessionId: 'new-session' });
    expect(harness.storage.get(LIVE_DUBBING_OUTCOME_STORAGE_KEY)).toMatchObject({
      sourceSessionId: 'new-session',
      error: 'NEW_SESSION_ERROR',
    });
  });

  it('reads a stored outcome after coordinator reconstruction', async () => {
    const harness = createHarness({ outcome: {
      sourceSessionId: 'old-session',
      providerId: 'gemini',
      error: 'LIVE_DUBBING_PROVIDER_ERROR',
      occurredAt: 123,
      providerDiagnostic: null,
    } });

    await expect(harness.coordinator.getStatus()).resolves.toMatchObject({
      success: true,
      status: null,
      terminalOutcome: {
        providerId: 'gemini',
        error: 'LIVE_DUBBING_PROVIDER_ERROR',
        occurredAt: 123,
      },
    });
    expect((await harness.coordinator.getStatus()).terminalOutcome).not.toHaveProperty('sourceSessionId');
  });

  it('hides an older stored outcome behind a newer active descriptor', async () => {
    const harness = createHarness({
      stored: {
        sessionId: 'new-session',
        tabId: 42,
        providerId: 'gemini',
        targetLanguage: 'en',
        status: LIVE_DUBBING_STATUS.RUNNING,
        startedAt: 456,
        lastError: null,
        eventSequence: 1,
      },
      outcome: {
        sourceSessionId: 'old-session',
        providerId: 'gemini',
        error: 'OLD_SESSION_ERROR',
        occurredAt: 123,
        providerDiagnostic: null,
      },
    });

    await expect(harness.coordinator.getStatus()).resolves.toMatchObject({
      success: true,
      status: { sessionId: 'new-session' },
      terminalOutcome: null,
    });
    expect(harness.browserAPI.storage.session.get).toHaveBeenCalledWith([
      LIVE_DUBBING_STORAGE_KEY,
      LIVE_DUBBING_OUTCOME_STORAGE_KEY,
    ]);
  });

  it('continues terminal cleanup when outcome storage cannot be written', async () => {
    const harness = createHarness();
    await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    const originalSet = harness.browserAPI.storage.session.set.getMockImplementation();
    harness.browserAPI.storage.session.set.mockImplementation(async record => {
      if (record[LIVE_DUBBING_OUTCOME_STORAGE_KEY]) throw new Error('outcome storage unavailable');
      return originalSet(record);
    });

    const result = await harness.coordinator.handleOffscreenTerminal({
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        status: LIVE_DUBBING_STATUS.ERROR,
        error: 'LIVE_DUBBING_PROVIDER_ERROR',
      },
    }, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    });

    expect(result).toMatchObject({ success: true, stopped: true });
    expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
    expect(harness.coordinator.storageState).toBe(LIVE_DUBBING_STORAGE_STATE.ABSENT);
    expect(harness.coordinator.outcomeStorageState).toBe(LIVE_DUBBING_OUTCOME_STORAGE_STATE.WRITE_FAILED);
    await expect(harness.coordinator.getStatus()).resolves.toMatchObject({
      success: true,
      status: null,
      terminalOutcome: null,
    });
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
      audioPathReady: true,
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

  it('preserves OpenAI provider identity and lease reasons during recovery', async () => {
    const harness = createHarness({ stored: {
      sessionId: 'openai-session',
      tabId: 42,
      providerId: 'openai',
      targetLanguage: 'en-US',
      status: LIVE_DUBBING_STATUS.RUNNING,
      startedAt: 1,
      lastError: null,
      eventSequence: 2,
    }, statusResponse: {
      success: true,
      active: true,
      sessionId: 'openai-session',
      providerId: 'openai',
      status: LIVE_DUBBING_STATUS.RUNNING,
      captureReady: true,
      audioPathReady: true,
      setupComplete: true,
    } });

    const result = await harness.coordinator.reconcile();

    expect(result).toMatchObject({ success: true, recovered: true, status: { providerId: 'openai' } });
    expect(harness.manager.acquire).toHaveBeenCalledWith({
      owner: LIVE_DUBBING_OWNER,
      leaseId: 'openai-session',
      requiredReasons: ['USER_MEDIA', 'AUDIO_PLAYBACK', 'WEB_RTC'],
    });
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY)).toMatchObject({ providerId: 'openai' });
  });

  it('reconciles a foreign Gemini lease without borrowing the active OpenAI identity', async () => {
    const harness = createHarness({ stored: {
      sessionId: 'openai-session',
      tabId: 42,
      providerId: 'openai',
      targetLanguage: 'en-US',
      status: LIVE_DUBBING_STATUS.RUNNING,
      startedAt: 1,
      lastError: null,
      eventSequence: 2,
    } });
    const leases = [
      {
        owner: LIVE_DUBBING_OWNER,
        leaseId: 'openai-session',
        requiredReasons: ['USER_MEDIA', 'AUDIO_PLAYBACK', 'WEB_RTC'],
      },
      {
        owner: LIVE_DUBBING_OWNER,
        leaseId: 'orphan-session',
        requiredReasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
      },
    ];
    harness.manager.activeLeases = leases;
    harness.browserAPI.runtime.sendMessage.mockImplementation(async message => {
      harness.calls.push(['message', message]);
      const { sessionId, providerId } = message.data;
      if (message.action === 'LIVE_DUBBING_STATUS') {
        if (sessionId === 'openai-session') {
          return {
            success: true,
            active: true,
            sessionId,
            providerId,
            status: LIVE_DUBBING_STATUS.RUNNING,
            captureReady: true,
            audioPathReady: true,
            setupComplete: true,
          };
        }
        return {
          success: true,
          active: true,
          sessionId,
          providerId: 'gemini',
          status: LIVE_DUBBING_STATUS.RUNNING,
          captureReady: true,
          audioPathReady: true,
          setupComplete: true,
        };
      }
      if (message.action === 'LIVE_DUBBING_DISPOSE') {
        return { success: true, ack: 'DISPOSED', sessionId, providerId };
      }
      return { success: true };
    });

    const result = await harness.coordinator.reconcile();
    const messages = harness.browserAPI.runtime.sendMessage.mock.calls
      .map(([message]) => message);

    expect(result).toMatchObject({
      success: true,
      recovered: true,
      status: { sessionId: 'openai-session', providerId: 'openai' },
    });
    expect(messages).toEqual([
      expect.objectContaining({
        action: 'LIVE_DUBBING_STATUS',
        data: expect.objectContaining({ sessionId: 'openai-session', providerId: 'openai' }),
      }),
      expect.objectContaining({
        action: 'LIVE_DUBBING_STATUS',
        data: expect.objectContaining({ sessionId: 'orphan-session', providerId: 'gemini' }),
      }),
      expect.objectContaining({
        action: 'LIVE_DUBBING_STATUS',
        data: expect.objectContaining({ sessionId: 'orphan-session', providerId: 'openai' }),
      }),
      expect.objectContaining({
        action: 'LIVE_DUBBING_DISPOSE',
        data: expect.objectContaining({ sessionId: 'orphan-session', providerId: 'gemini' }),
      }),
    ]);
    expect(harness.manager.release).toHaveBeenCalledWith({
      owner: LIVE_DUBBING_OWNER,
      leaseId: 'orphan-session',
    });
    expect(harness.manager.activeLeases).toEqual([leases[0]]);
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY)).toMatchObject({
      sessionId: 'openai-session',
      providerId: 'openai',
    });
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
      audioPathReady: true,
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

  it('clears an inactive persisted OpenAI descriptor without probing Gemini', async () => {
    const harness = createHarness({ stored: {
      sessionId: 'openai-session',
      tabId: 42,
      providerId: LIVE_DUBBING_OPENAI_PROVIDER_ID,
      targetLanguage: 'en-US',
      status: LIVE_DUBBING_STATUS.ERROR,
      startedAt: 1,
      lastError: 'START_FAILED',
      eventSequence: 1,
    }, statusResponse: {
      success: true,
      active: false,
      sessionId: 'openai-session',
      providerId: LIVE_DUBBING_OPENAI_PROVIDER_ID,
      status: 'IDLE',
    } });

    const result = await harness.coordinator.reconcile();
    const messages = harness.browserAPI.runtime.sendMessage.mock.calls
      .map(([message]) => message);

    expect(result).toMatchObject({ success: true, stale: true, status: null });
    expect(messages).toEqual([
      expect.objectContaining({
        action: 'LIVE_DUBBING_STATUS',
        data: expect.objectContaining({
          sessionId: 'openai-session',
          providerId: LIVE_DUBBING_OPENAI_PROVIDER_ID,
        }),
      }),
    ]);
    expect(harness.manager.release).not.toHaveBeenCalled();
    expect(harness.storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
  });

  it('isolates a persisted OpenAI descriptor from a Gemini status mismatch', async () => {
    const harness = createHarness({ stored: {
      sessionId: 'openai-session',
      tabId: 42,
      providerId: LIVE_DUBBING_OPENAI_PROVIDER_ID,
      targetLanguage: 'en-US',
      status: LIVE_DUBBING_STATUS.RUNNING,
      startedAt: 1,
      lastError: null,
      eventSequence: 2,
    }, statusResponse: {
      success: true,
      active: false,
      sessionId: 'openai-session',
      providerId: 'gemini',
      status: 'IDLE',
    } });

    const result = await harness.coordinator.reconcile();

    expect(result).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_SESSION_MISMATCH',
      isolated: true,
      retryable: true,
    });
    expect(harness.browserAPI.runtime.sendMessage).toHaveBeenCalledOnce();
    expect(harness.manager.release).not.toHaveBeenCalled();
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY)).toMatchObject({
      sessionId: 'openai-session',
      providerId: LIVE_DUBBING_OPENAI_PROVIDER_ID,
    });
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

  it('fences a late first cleanup attempt after a newer session takes ownership', async () => {
    vi.useFakeTimers();
    try {
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

      const stop = harness.coordinator.stop({ data: { sessionId: 'session-1' } });
      while (!resolveDispose) await Promise.resolve();
      await vi.advanceTimersByTimeAsync(LIVE_DUBBING_STOP_TIMEOUT);
      await expect(stop).resolves.toMatchObject({
        success: false,
        error: 'LIVE_DUBBING_STOP_TIMEOUT',
        cleanupPending: true,
      });

      harness.manager.activeLeases = [
        { owner: LIVE_DUBBING_OWNER, leaseId: 'session-1' },
        { owner: LIVE_DUBBING_OWNER, leaseId: 'new-session' },
      ];
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
      await vi.advanceTimersByTimeAsync(0);

      expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY)).toMatchObject({
        sessionId: 'new-session',
      });
      expect(harness.manager.activeLeases).toEqual([
        { owner: LIVE_DUBBING_OWNER, leaseId: 'new-session' },
      ]);
      expect(harness.manager.release).toHaveBeenCalledWith({
        owner: LIVE_DUBBING_OWNER,
        leaseId: 'session-1',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a foreign-provider terminal without impacting the active OpenAI session', async () => {
    const harness = createHarness();
    const started = await harness.coordinator.start({
      data: { providerId: 'openai', targetLanguage: 'en-US' },
    }, {});
    const sender = {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    };

    const result = await harness.coordinator.handleOffscreenTerminal({
      data: { sessionId: started.status.sessionId, providerId: 'gemini', event: 'STALE_TERMINAL' },
    }, sender);

    expect(result).toMatchObject({ success: false, error: 'LIVE_DUBBING_UNAUTHORIZED', ignored: true });
    expect(harness.manager.release).not.toHaveBeenCalled();
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY)).toMatchObject({
      providerId: 'openai',
      sessionId: started.status.sessionId,
    });
  });

  it.each([
    ['Gemini-looking', ['USER_MEDIA', 'AUDIO_PLAYBACK']],
    ['OpenAI-looking', ['USER_MEDIA', 'AUDIO_PLAYBACK', 'WEB_RTC']],
  ])('probes every canonical provider for a descriptorless %s orphan', async (
    _label,
    requiredReasons,
  ) => {
    const harness = createHarness({ statusResponse: {
      success: true,
      active: false,
      sessionId: 'orphan-session',
      status: 'IDLE',
    } });
    harness.manager.activeLeases = [{
      owner: LIVE_DUBBING_OWNER,
      leaseId: 'orphan-session',
      requiredReasons,
    }];

    const result = await harness.coordinator.reconcile();
    const messages = harness.browserAPI.runtime.sendMessage.mock.calls
      .map(([message]) => message);
    const expectedProviderIds = [...LIVE_DUBBING_PROVIDER_IDS];

    expect(result).toMatchObject({ success: true, stale: true, status: null });
    expect(messages).toEqual([
      expect.objectContaining({
        action: 'LIVE_DUBBING_STATUS',
        data: { sessionId: 'orphan-session', providerId: expectedProviderIds[0] },
      }),
      expect.objectContaining({
        action: 'LIVE_DUBBING_STATUS',
        data: { sessionId: 'orphan-session', providerId: expectedProviderIds[1] },
      }),
      expect.objectContaining({
        action: 'LIVE_DUBBING_DISPOSE',
        data: expect.objectContaining({ sessionId: 'orphan-session', providerId: expectedProviderIds[0] }),
      }),
    ]);
    expect(harness.manager.release).toHaveBeenCalledWith({
      owner: LIVE_DUBBING_OWNER,
      leaseId: 'orphan-session',
    });
    expect(harness.manager.activeLeases).toEqual([]);
  });

  it('ignores foreign-owner leases during reconciliation', async () => {
    const harness = createHarness();
    const foreignLease = { owner: 'other-owner', leaseId: 'foreign-session' };
    harness.manager.activeLeases = [foreignLease];

    const result = await harness.coordinator.reconcile();

    expect(result).toEqual({
      success: true,
      status: null,
      recovered: false,
      stale: false,
    });
    expect(harness.browserAPI.runtime.sendMessage).not.toHaveBeenCalled();
    expect(harness.manager.release).not.toHaveBeenCalled();
    expect(harness.manager.activeLeases).toEqual([foreignLease]);
  });

  it('releases an untrusted lease only after an exact provider probe proves it is inactive', async () => {
    const harness = createHarness();
    harness.manager.activeLeases = [{
      owner: LIVE_DUBBING_OWNER,
      leaseId: 'untrusted-session',
      requiredReasons: ['WORKERS'],
    }];
    harness.browserAPI.runtime.sendMessage.mockImplementation(async message => {
      harness.calls.push(['message', message]);
      const { sessionId, providerId } = message.data;
      if (message.action === 'LIVE_DUBBING_STATUS' && providerId === 'openai') {
        return { success: true, active: false, sessionId, providerId, status: 'IDLE' };
      }
      if (message.action === 'LIVE_DUBBING_STATUS') {
        return {
          success: false,
          error: 'LIVE_DUBBING_SESSION_MISMATCH',
          sessionId,
          providerId,
        };
      }
      if (message.action === 'LIVE_DUBBING_DISPOSE') {
        return { success: true, ack: 'DISPOSED', sessionId, providerId };
      }
      return { success: true };
    });

    const result = await harness.coordinator.reconcile();
    const messages = harness.browserAPI.runtime.sendMessage.mock.calls
      .map(([message]) => message);

    expect(result).toMatchObject({ success: true, stale: true });
    expect(messages.map(message => [message.action, message.data.providerId])).toEqual([
      ['LIVE_DUBBING_STATUS', 'gemini'],
      ['LIVE_DUBBING_STATUS', 'openai'],
      ['LIVE_DUBBING_DISPOSE', 'openai'],
    ]);
    expect(harness.manager.release).toHaveBeenCalledWith({
      owner: LIVE_DUBBING_OWNER,
      leaseId: 'untrusted-session',
    });
  });

  it.each([
    ['Gemini-looking', ['USER_MEDIA', 'AUDIO_PLAYBACK'], 'openai'],
    ['OpenAI-looking', ['USER_MEDIA', 'AUDIO_PLAYBACK', 'WEB_RTC'], 'gemini'],
  ])('uses authoritative %s orphan status instead of lease reasons', async (
    _label,
    requiredReasons,
    authoritativeProviderId,
  ) => {
    const harness = createHarness();
    harness.manager.activeLeases = [{
      owner: LIVE_DUBBING_OWNER,
      leaseId: 'orphan-session',
      requiredReasons,
    }];
    harness.browserAPI.runtime.sendMessage.mockImplementation(async message => {
      harness.calls.push(['message', message]);
      const { sessionId, providerId } = message.data;
      if (message.action === 'LIVE_DUBBING_STATUS') {
        if (providerId === authoritativeProviderId) {
          return {
            success: true,
            active: true,
            sessionId,
            providerId,
            status: LIVE_DUBBING_STATUS.RUNNING,
          };
        }
        return {
          success: false,
          error: 'LIVE_DUBBING_SESSION_MISMATCH',
          sessionId,
          providerId,
          requestedSessionId: sessionId,
          actualSessionId: sessionId,
          requestedProviderId: providerId,
          actualProviderId: authoritativeProviderId,
        };
      }
      if (message.action === 'LIVE_DUBBING_DISPOSE') {
        return { success: true, ack: 'DISPOSED', sessionId, providerId };
      }
      return { success: true };
    });

    const result = await harness.coordinator.reconcile();
    const messages = harness.browserAPI.runtime.sendMessage.mock.calls
      .map(([message]) => message);

    expect(result).toMatchObject({ success: true, stale: true, status: null });
    expect(messages.map(message => [message.action, message.data.providerId])).toEqual([
      ...LIVE_DUBBING_PROVIDER_IDS.map(providerId => ['LIVE_DUBBING_STATUS', providerId]),
      ['LIVE_DUBBING_DISPOSE', authoritativeProviderId],
    ]);
    expect(harness.manager.release).toHaveBeenCalledWith({
      owner: LIVE_DUBBING_OWNER,
      leaseId: 'orphan-session',
    });
  });

  it('uses only the valid descriptor provider during recovery', async () => {
    const harness = createHarness({ stored: {
      sessionId: 'openai-session',
      tabId: 42,
      providerId: LIVE_DUBBING_OPENAI_PROVIDER_ID,
      targetLanguage: 'en-US',
      status: LIVE_DUBBING_STATUS.RUNNING,
      startedAt: 1,
      lastError: null,
      eventSequence: 2,
    }, statusResponse: {
      success: true,
      active: true,
      sessionId: 'openai-session',
      providerId: LIVE_DUBBING_OPENAI_PROVIDER_ID,
      status: LIVE_DUBBING_STATUS.RUNNING,
      captureReady: true,
      audioPathReady: true,
      setupComplete: true,
    } });
    harness.manager.activeLeases = [{
      owner: LIVE_DUBBING_OWNER,
      leaseId: 'openai-session',
      requiredReasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
    }];

    const result = await harness.coordinator.reconcile();
    const messages = harness.browserAPI.runtime.sendMessage.mock.calls
      .map(([message]) => message);

    expect(result).toMatchObject({ success: true, recovered: true, status: {
      providerId: LIVE_DUBBING_OPENAI_PROVIDER_ID,
    } });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      action: 'LIVE_DUBBING_STATUS',
      data: { sessionId: 'openai-session', providerId: LIVE_DUBBING_OPENAI_PROVIDER_ID },
    });
  });

  it('fails closed when an untrusted lease has ambiguous active provider probes', async () => {
    const harness = createHarness();
    harness.manager.activeLeases = [{
      owner: LIVE_DUBBING_OWNER,
      leaseId: 'ambiguous-session',
      requiredReasons: ['WORKERS'],
    }];
    harness.browserAPI.runtime.sendMessage.mockImplementation(async message => {
      harness.calls.push(['message', message]);
      return {
        success: true,
        active: true,
        sessionId: message.data.sessionId,
        providerId: message.data.providerId,
        status: LIVE_DUBBING_STATUS.RUNNING,
      };
    });

    const result = await harness.coordinator.reconcile();

    expect(result).toMatchObject({
      success: false,
      stale: true,
      retryable: true,
      providerIdentityRequired: true,
    });
    expect(harness.manager.release).not.toHaveBeenCalled();
    expect(harness.browserAPI.runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  // ---- lifecycle policy ownership (Coordinator, not Store) ----
  it('prevents terminalRequested session from committing non-terminal transition', async () => {
    const harness = createHarness({
      stored: {
        sessionId: 'session-1',
        tabId: 42,
        targetLanguage: 'en',
        status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
        startedAt: 123,
        lastError: null,
        eventSequence: 2,
      },
    });
    await harness.coordinator._readStatusSnapshot();
    const descriptor = harness.coordinator.descriptor;
    // ensure session state exists for terminalRequested check
    const state = { descriptor, terminalRequested: false, leaseAcquired: true, prepared: true, cleanupCompleted: false, providerDiagnostic: null, cleanupFacts: null };
    harness.coordinator.sessionStates.set(descriptor.sessionId, state);
    state.terminalRequested = true;

    const attempt = { ...descriptor, status: LIVE_DUBBING_STATUS.RUNNING, eventSequence: descriptor.eventSequence + 1 };
    const ok = await harness.coordinator._writeDescriptor(attempt, descriptor.sessionId, descriptor);
    expect(ok).toBe(false);
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY).eventSequence).toBe(2);
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY).status).toBe(LIVE_DUBBING_STATUS.CONNECTING_PROVIDER);
    // terminal states are allowed
    const stopping = { ...descriptor, status: LIVE_DUBBING_STATUS.STOPPING, eventSequence: descriptor.eventSequence + 1 };
    const okStopping = await harness.coordinator._writeDescriptor(stopping, descriptor.sessionId, descriptor);
    expect(okStopping).toBe(true);
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY).status).toBe(LIVE_DUBBING_STATUS.STOPPING);
  });

  it('prevents STOPPING from regressing to RUNNING without STOPPING expectedDescriptor', async () => {
    const harness = createHarness();
    await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    const descriptor = harness.coordinator.descriptor;
    const stopping = { ...descriptor, status: LIVE_DUBBING_STATUS.STOPPING, eventSequence: descriptor.eventSequence + 1 };
    expect(await harness.coordinator._writeDescriptor(stopping, descriptor.sessionId, descriptor)).toBe(true);
    harness.coordinator.sessionStates.get(descriptor.sessionId).descriptor = stopping;
    // now try to regress to RUNNING with expectedDescriptor not STOPPING
    const running = { ...stopping, status: LIVE_DUBBING_STATUS.RUNNING, eventSequence: stopping.eventSequence + 1 };
    const regress = await harness.coordinator._writeDescriptor(running, descriptor.sessionId, descriptor);
    expect(regress).toBe(false);
    // with STOPPING expectedDescriptor it is allowed (internal ERROR transition)
    const errorFromStopping = { ...stopping, status: LIVE_DUBBING_STATUS.ERROR, eventSequence: stopping.eventSequence + 1, lastError: 'STOP_FAILED' };
    const okError = await harness.coordinator._writeDescriptor(errorFromStopping, descriptor.sessionId, stopping);
    expect(okError).toBe(true);
  });

  it('successful RUNNING clears previous outcome atomically via Coordinator', async () => {
    const outcome = {
      sourceSessionId: 'session-1',
      providerId: 'gemini',
      error: 'LIVE_DUBBING_PROVIDER_ERROR',
      occurredAt: 123,
      providerDiagnostic: null,
    };
    const harness = createHarness({
      stored: {
        sessionId: 'session-1',
        tabId: 42,
        targetLanguage: 'en',
        status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
        startedAt: 123,
        lastError: null,
        eventSequence: 2,
      },
      outcome,
    });
    // hydrate outcome into store
    await harness.coordinator._readStatusSnapshot();
    expect(harness.coordinator.terminalOutcome).toMatchObject({ sourceSessionId: 'session-1' });
    const state = harness.coordinator.sessionStates.get('session-1') || { descriptor: harness.coordinator.descriptor, terminalRequested: false, leaseAcquired: true, prepared: true, cleanupCompleted: false, providerDiagnostic: null, cleanupFacts: null };
    if (!harness.coordinator.sessionStates.has('session-1')) harness.coordinator.sessionStates.set('session-1', state);
    state.descriptor = harness.coordinator.descriptor;
    const running = { ...harness.coordinator.descriptor, status: LIVE_DUBBING_STATUS.RUNNING, eventSequence: 3 };
    const ok = await harness.coordinator._writeDescriptor(running, 'session-1', harness.coordinator.descriptor, { clearOutcome: true });
    expect(ok).toBe(true);
    expect(harness.coordinator.terminalOutcome).toBeNull();
    expect(harness.coordinator.outcomeStorageState).toBe(LIVE_DUBBING_OUTCOME_STORAGE_STATE.ABSENT);
    expect(harness.storage.get(LIVE_DUBBING_OUTCOME_STORAGE_KEY)).toBeNull();
    expect(harness.browserAPI.storage.session.set).toHaveBeenCalledWith(expect.objectContaining({
      [LIVE_DUBBING_STORAGE_KEY]: expect.objectContaining({ status: LIVE_DUBBING_STATUS.RUNNING }),
      [LIVE_DUBBING_OUTCOME_STORAGE_KEY]: null,
    }));
  });

  it('terminal racing outcome mutation cannot commit RUNNING', async () => {
    const harness = createHarness({
      stored: {
        sessionId: 'session-1',
        tabId: 42,
        targetLanguage: 'en',
        status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
        startedAt: 123,
        lastError: null,
        eventSequence: 2,
      },
    });
    await harness.coordinator._readStatusSnapshot();
    const descriptor = harness.coordinator.descriptor;
    const state = { descriptor, terminalRequested: false, leaseAcquired: true, prepared: true, cleanupCompleted: false, providerDiagnostic: null, cleanupFacts: null };
    harness.coordinator.sessionStates.set(descriptor.sessionId, state);
    // queue a long outcome mutation
    let resolveMutation;
    const pending = harness.coordinator._queueOutcomeMutation(() => new Promise(resolve => { resolveMutation = resolve; }));
    await Promise.resolve();
    // prepare RUNNING commit that will await the mutation
    const running = { ...descriptor, status: LIVE_DUBBING_STATUS.RUNNING, eventSequence: descriptor.eventSequence + 1 };
    const commit = harness.coordinator._writeDescriptor(running, descriptor.sessionId, descriptor, { clearOutcome: true });
    // before mutation settles, mark terminalRequested (simulates OFFSCREEN_TERMINAL racing)
    state.terminalRequested = true;
    resolveMutation(true);
    await pending;
    const ok = await commit;
    expect(ok).toBe(false);
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY).eventSequence).toBe(2);
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY).status).toBe(LIVE_DUBBING_STATUS.CONNECTING_PROVIDER);
  });

  it('exposes public storage failure responses with retryable/cleanupPending/status', async () => {
    const harness = createHarness();
    await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    harness.browserAPI.storage.session.get.mockRejectedValueOnce(new Error('unreadable'));
    const readFail = await harness.coordinator.start({ data: { targetLanguage: 'en' } }, {});
    expect(readFail).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_STORAGE_UNREADABLE',
      retryable: true,
      status: { sessionId: 'session-1' },
    });
    // descriptor invalid
    harness.browserAPI.storage.session.get.mockResolvedValueOnce({
      [LIVE_DUBBING_STORAGE_KEY]: { sessionId: 'bad', tabId: 'not-a-number', providerId: 'gemini', targetLanguage: 'en', status: 'RUNNING', startedAt: 1, lastError: null, eventSequence: 0 },
    });
    const bad = await harness.coordinator.stop({ data: { sessionId: 'bad' } });
    expect(bad).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_STORAGE_DESCRIPTOR_INVALID',
      retryable: true,
    });
    // clear failure cleanupPending
    harness.browserAPI.storage.session.remove.mockRejectedValueOnce(new Error('clear failed'));
    const clearFail = await harness.coordinator.stop({ data: { sessionId: 'session-1' } });
    expect(clearFail).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_STORAGE_CLEAR_FAILED',
      retryable: true,
      cleanupPending: true,
      status: expect.objectContaining({ sessionId: 'session-1' }),
    });
  });

  // ---- race tests for explicit snapshot API (A-E) ----

  it('A: terminalRequested flips during authoritative read rejects non-terminal write', async () => {
    const harness = createHarness({
      stored: {
        sessionId: 'session-1',
        tabId: 42,
        targetLanguage: 'en',
        status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
        startedAt: 123,
        lastError: null,
        eventSequence: 2,
      },
    });
    await harness.coordinator._readStatusSnapshot();
    const descriptor = harness.coordinator.descriptor;
    const state = { descriptor, terminalRequested: false, leaseAcquired: true, prepared: true, cleanupCompleted: false, providerDiagnostic: null, cleanupFacts: null };
    harness.coordinator.sessionStates.set(descriptor.sessionId, state);
    harness.browserAPI.storage.session.set.mockClear();
    let resolveGet;
    const deferred = new Promise(resolve => { resolveGet = resolve; });
    harness.browserAPI.storage.session.get.mockImplementation(() => deferred);
    const attempt = { ...descriptor, status: LIVE_DUBBING_STATUS.RUNNING, eventSequence: descriptor.eventSequence + 1 };
    const promise = harness.coordinator._writeDescriptor(attempt, descriptor.sessionId, descriptor);
    // flip while read pending
    state.terminalRequested = true;
    resolveGet({ [LIVE_DUBBING_STORAGE_KEY]: { ...descriptor, providerId: 'gemini' } });
    const ok = await promise;
    expect(ok).toBe(false);
    expect(harness.browserAPI.storage.session.set).not.toHaveBeenCalled();
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY).status).toBe(LIVE_DUBBING_STATUS.CONNECTING_PROVIDER);
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY).eventSequence).toBe(2);
  });

  it('B: STOPPING appears during authoritative read rejects RUNNING', async () => {
    const harness = createHarness({
      stored: {
        sessionId: 'session-1',
        tabId: 42,
        targetLanguage: 'en',
        status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
        startedAt: 123,
        lastError: null,
        eventSequence: 2,
      },
    });
    await harness.coordinator._readStatusSnapshot();
    const descriptor = harness.coordinator.descriptor;
    const state = { descriptor, terminalRequested: false, leaseAcquired: true, prepared: true, cleanupCompleted: false, providerDiagnostic: null, cleanupFacts: null };
    harness.coordinator.sessionStates.set(descriptor.sessionId, state);
    harness.browserAPI.storage.session.set.mockClear();
    let resolveGet;
    const deferred = new Promise(resolve => { resolveGet = resolve; });
    harness.browserAPI.storage.session.get.mockImplementation(() => deferred);
    const running = { ...descriptor, status: LIVE_DUBBING_STATUS.RUNNING, eventSequence: descriptor.eventSequence + 1 };
    const promise = harness.coordinator._writeDescriptor(running, descriptor.sessionId, descriptor);
    // mutate persisted to STOPPING while read pending
    const stoppingPersisted = { ...descriptor, providerId: 'gemini', status: LIVE_DUBBING_STATUS.STOPPING, eventSequence: descriptor.eventSequence + 1 };
    harness.storage.set(LIVE_DUBBING_STORAGE_KEY, stoppingPersisted);
    resolveGet({ [LIVE_DUBBING_STORAGE_KEY]: stoppingPersisted });
    const ok = await promise;
    expect(ok).toBe(false);
    expect(harness.browserAPI.storage.session.set).not.toHaveBeenCalled();
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY).status).toBe(LIVE_DUBBING_STATUS.STOPPING);
  });

  it('C: normal fenced non-clearOutcome uses exactly one authoritative read before set', async () => {
    const harness = createHarness({
      stored: {
        sessionId: 'session-1',
        tabId: 42,
        targetLanguage: 'en',
        status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
        startedAt: 123,
        lastError: null,
        eventSequence: 2,
      },
    });
    await harness.coordinator._readStatusSnapshot();
    const descriptor = harness.coordinator.descriptor;
    const state = { descriptor, terminalRequested: false, leaseAcquired: true, prepared: true, cleanupCompleted: false, providerDiagnostic: null, cleanupFacts: null };
    harness.coordinator.sessionStates.set(descriptor.sessionId, state);
    harness.browserAPI.storage.session.get.mockClear();
    harness.browserAPI.storage.session.set.mockClear();
    const attempt = { ...descriptor, status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER, eventSequence: 3 };
    const ok = await harness.coordinator._writeDescriptor(attempt, descriptor.sessionId, descriptor);
    expect(ok).toBe(true);
    expect(harness.browserAPI.storage.session.get).toHaveBeenCalledTimes(1);
    expect(harness.browserAPI.storage.session.get).toHaveBeenCalledWith(LIVE_DUBBING_STORAGE_KEY);
    expect(harness.browserAPI.storage.session.set).toHaveBeenCalledTimes(1);
  });

  it('D1: clearOutcome race - terminalRequested flips during awaitOutcomeMutations prevents RUNNING+clear', async () => {
    const harness = createHarness({
      stored: {
        sessionId: 'session-1',
        tabId: 42,
        targetLanguage: 'en',
        status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
        startedAt: 123,
        lastError: null,
        eventSequence: 2,
      },
    });
    await harness.coordinator._readStatusSnapshot();
    const descriptor = harness.coordinator.descriptor;
    const state = { descriptor, terminalRequested: false, leaseAcquired: true, prepared: true, cleanupCompleted: false, providerDiagnostic: null, cleanupFacts: null };
    harness.coordinator.sessionStates.set(descriptor.sessionId, state);
    harness.browserAPI.storage.session.set.mockClear();
    let resolveMutation;
    const pending = harness.coordinator._queueOutcomeMutation(() => new Promise(resolve => { resolveMutation = resolve; }));
    await Promise.resolve();
    let resolveAuthoritativeRead;
    const authoritativeRead = new Promise(resolve => { resolveAuthoritativeRead = resolve; });
    harness.browserAPI.storage.session.get.mockImplementationOnce(() => authoritativeRead);
    let resolveAwaitEntered;
    const awaitEntered = new Promise(resolve => { resolveAwaitEntered = resolve; });
    const awaitOutcomeMutations = harness.coordinator.stateStore.awaitOutcomeMutations.bind(
      harness.coordinator.stateStore,
    );
    harness.coordinator.stateStore.awaitOutcomeMutations = vi.fn(async () => {
      resolveAwaitEntered();
      await awaitOutcomeMutations();
    });
    const running = { ...descriptor, status: LIVE_DUBBING_STATUS.RUNNING, eventSequence: descriptor.eventSequence + 1 };
    const commit = harness.coordinator._writeDescriptor(running, descriptor.sessionId, descriptor, { clearOutcome: true });
    resolveAuthoritativeRead({ [LIVE_DUBBING_STORAGE_KEY]: { ...descriptor } });
    await awaitEntered;
    // flip after the first read and while awaiting outcome mutations
    state.terminalRequested = true;
    resolveMutation(true);
    await pending;
    const ok = await commit;
    expect(ok).toBe(false);
    expect(harness.browserAPI.storage.session.set).not.toHaveBeenCalledWith(expect.objectContaining({ [LIVE_DUBBING_OUTCOME_STORAGE_KEY]: null }));
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY).status).toBe(LIVE_DUBBING_STATUS.CONNECTING_PROVIDER);
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY).eventSequence).toBe(2);
  });

  it('D2: clearOutcome race - STOPPING appears during awaitOutcomeMutations prevents RUNNING+clear', async () => {
    const harness = createHarness({
      stored: {
        sessionId: 'session-1',
        tabId: 42,
        targetLanguage: 'en',
        status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
        startedAt: 123,
        lastError: null,
        eventSequence: 2,
      },
    });
    await harness.coordinator._readStatusSnapshot();
    const descriptor = harness.coordinator.descriptor;
    const state = { descriptor, terminalRequested: false, leaseAcquired: true, prepared: true, cleanupCompleted: false, providerDiagnostic: null, cleanupFacts: null };
    harness.coordinator.sessionStates.set(descriptor.sessionId, state);
    harness.browserAPI.storage.session.set.mockClear();
    let resolveMutation;
    const pending = harness.coordinator._queueOutcomeMutation(() => new Promise(resolve => { resolveMutation = resolve; }));
    await Promise.resolve();
    const running = { ...descriptor, status: LIVE_DUBBING_STATUS.RUNNING, eventSequence: descriptor.eventSequence + 1 };
    const commit = harness.coordinator._writeDescriptor(running, descriptor.sessionId, descriptor, { clearOutcome: true });
    // mutate persisted to STOPPING while awaiting
    const stoppingPersisted = { ...descriptor, providerId: 'gemini', status: LIVE_DUBBING_STATUS.STOPPING, eventSequence: 3 };
    // delay mutation until commit has started awaiting, then set storage before second read
    // We mutate the map now; second read will see STOPPING
    harness.storage.set(LIVE_DUBBING_STORAGE_KEY, stoppingPersisted);
    resolveMutation(true);
    await pending;
    const ok = await commit;
    expect(ok).toBe(false);
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY).status).toBe(LIVE_DUBBING_STATUS.STOPPING);
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY).status).not.toBe(LIVE_DUBBING_STATUS.RUNNING);
  });

  it('E: valid transitions still succeed (CONNECTING_PROVIDER->RUNNING, STOPPING->ERROR, terminal->STOPPING/ERROR)', async () => {
    // CONNECTING_PROVIDER -> RUNNING with clearOutcome
    const harness = createHarness({
      stored: {
        sessionId: 'session-1',
        tabId: 42,
        targetLanguage: 'en',
        status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
        startedAt: 123,
        lastError: null,
        eventSequence: 2,
      },
    });
    await harness.coordinator._readStatusSnapshot();
    let descriptor = harness.coordinator.descriptor;
    let state = { descriptor, terminalRequested: false, leaseAcquired: true, prepared: true, cleanupCompleted: false, providerDiagnostic: null, cleanupFacts: null };
    harness.coordinator.sessionStates.set(descriptor.sessionId, state);
    const running = { ...descriptor, status: LIVE_DUBBING_STATUS.RUNNING, eventSequence: 3 };
    const okRunning = await harness.coordinator._writeDescriptor(running, descriptor.sessionId, descriptor, { clearOutcome: true });
    expect(okRunning).toBe(true);
    expect(harness.storage.get(LIVE_DUBBING_STORAGE_KEY).status).toBe(LIVE_DUBBING_STATUS.RUNNING);

    // STOPPING -> ERROR with matching expectedDescriptor
    const harness2 = createHarness({
      stored: {
        sessionId: 'session-2',
        tabId: 42,
        targetLanguage: 'en',
        status: LIVE_DUBBING_STATUS.STOPPING,
        startedAt: 123,
        lastError: null,
        eventSequence: 3,
      },
    });
    await harness2.coordinator._readStatusSnapshot();
    const stopping = harness2.coordinator.descriptor;
    const state2 = { descriptor: stopping, terminalRequested: false, leaseAcquired: true, prepared: true, cleanupCompleted: false, providerDiagnostic: null, cleanupFacts: null };
    harness2.coordinator.sessionStates.set(stopping.sessionId, state2);
    const error = { ...stopping, status: LIVE_DUBBING_STATUS.ERROR, eventSequence: 4, lastError: 'STOP_FAILED' };
    const okError = await harness2.coordinator._writeDescriptor(error, stopping.sessionId, stopping);
    expect(okError).toBe(true);
    expect(harness2.storage.get(LIVE_DUBBING_STORAGE_KEY).status).toBe(LIVE_DUBBING_STATUS.ERROR);

    // terminalRequested may still go to STOPPING/ERROR
    const harness3 = createHarness({
      stored: {
        sessionId: 'session-3',
        tabId: 42,
        targetLanguage: 'en',
        status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
        startedAt: 123,
        lastError: null,
        eventSequence: 2,
      },
    });
    await harness3.coordinator._readStatusSnapshot();
    const desc3 = harness3.coordinator.descriptor;
    const state3 = { descriptor: desc3, terminalRequested: true, leaseAcquired: true, prepared: true, cleanupCompleted: false, providerDiagnostic: null, cleanupFacts: null };
    harness3.coordinator.sessionStates.set(desc3.sessionId, state3);
    const stopping3 = { ...desc3, status: LIVE_DUBBING_STATUS.STOPPING, eventSequence: 3 };
    const okStoppingTerminal = await harness3.coordinator._writeDescriptor(stopping3, desc3.sessionId, desc3);
    expect(okStoppingTerminal).toBe(true);
    // update state to reflect new persisted stopping
    state3.descriptor = stopping3;
    const error3 = { ...stopping3, status: LIVE_DUBBING_STATUS.ERROR, eventSequence: 4, lastError: 'STOP_FAILED' };
    const okErrorTerminal = await harness3.coordinator._writeDescriptor(error3, desc3.sessionId, stopping3);
    expect(okErrorTerminal).toBe(true);
    // but RUNNING should still be rejected when terminalRequested
    const harness4 = createHarness({
      stored: {
        sessionId: 'session-4',
        tabId: 42,
        targetLanguage: 'en',
        status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
        startedAt: 123,
        lastError: null,
        eventSequence: 2,
      },
    });
    await harness4.coordinator._readStatusSnapshot();
    const desc4 = harness4.coordinator.descriptor;
    const state4 = { descriptor: desc4, terminalRequested: true, leaseAcquired: true, prepared: true, cleanupCompleted: false, providerDiagnostic: null, cleanupFacts: null };
    harness4.coordinator.sessionStates.set(desc4.sessionId, state4);
    const running4 = { ...desc4, status: LIVE_DUBBING_STATUS.RUNNING, eventSequence: 3 };
    const okRunningTerminal = await harness4.coordinator._writeDescriptor(running4, desc4.sessionId, desc4);
    expect(okRunningTerminal).toBe(false);
  });
});
