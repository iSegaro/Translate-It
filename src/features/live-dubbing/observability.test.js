import { describe, expect, it, vi } from 'vitest';
import { LiveDubbingFeatureHandler } from './handlers/LiveDubbingFeatureHandler.js';
import { FirefoxLiveDubbingContentHost } from './firefox/FirefoxContentRuntimeHost.js';
import { LiveDubbingCoordinator } from './background/LiveDubbingCoordinator.js';
import { LIVE_DUBBING_ACTIONS } from './constants.js';
import { FIREFOX_CONTENT_TARGET } from './firefox/firefoxContentContract.js';
import { MEDIA_SOURCE_ERRORS, MEDIA_CAPTURE_ERRORS } from './media/mediaConstants.js';

function descriptor(overrides = {}) {
  return {
    sessionId: 'session-1',
    providerId: 'gemini',
    tabId: 7,
    frameId: 0,
    documentId: 'doc-1',
    targetLanguage: 'en',
    eventSequence: 0,
    ...overrides,
  };
}
function sourceHandle() {
  return {
    stream: { getTracks: () => [], getAudioTracks: () => [{ kind: 'audio', readyState: 'live', stop: vi.fn() }] },
    dispose: vi.fn(),
  };
}
function mockSourceHandleWithDispose() {
  const handle = sourceHandle();
  // ensure getTracks returns something for cleanup checks
  handle.stream.getTracks = () => [];
  handle.stream.getAudioTracks = () => [{ kind: 'audio', readyState: 'live', stop: vi.fn() }];
  return handle;
}

describe('LiveDubbing observability - handler preserves canonical failures', () => {
  it('1 preserves MEDIA_SOURCE_NOT_FOUND', async () => {
    const handler = new LiveDubbingFeatureHandler({
      controller: { prepare: async () => ({ success: true }), consumeSource: async () => ({ success: true, sourceAccepted: true, eventSequence: 1 }), dispose: async () => ({ success: true }) },
      resolver: { resolve: () => ({ success: false, error: MEDIA_SOURCE_ERRORS.NOT_FOUND }) },
      captureAdapter: { capture: vi.fn() },
    });
    await handler.activate();
    const result = await handler.prepareRuntime(descriptor());
    expect(result).toMatchObject({ success: false, error: 'LIVE_DUBBING_MEDIA_SOURCE_NOT_FOUND' });
    expect(JSON.stringify(result)).not.toContain('http');
  });

  it('2 preserves MEDIA_SOURCE_AMBIGUOUS', async () => {
    const handler = new LiveDubbingFeatureHandler({
      controller: { prepare: async () => ({ success: true }), consumeSource: async () => ({ success: true, sourceAccepted: true, eventSequence: 1 }), dispose: async () => ({ success: true }) },
      resolver: { resolve: () => ({ success: false, error: MEDIA_SOURCE_ERRORS.AMBIGUOUS }) },
      captureAdapter: { capture: vi.fn() },
    });
    await handler.activate();
    const result = await handler.prepareRuntime(descriptor());
    expect(result).toMatchObject({ success: false, error: 'LIVE_DUBBING_MEDIA_SOURCE_AMBIGUOUS' });
  });

  it('3 preserves MEDIA_CAPTURE_UNSUPPORTED', async () => {
    const handler = new LiveDubbingFeatureHandler({
      controller: { prepare: async () => ({ success: true }), consumeSource: async () => ({ success: true, sourceAccepted: true, eventSequence: 1 }), dispose: async () => ({ success: true }) },
      resolver: { resolve: () => ({ success: true, source: 'el' }) },
      captureAdapter: { capture: () => ({ success: false, error: MEDIA_CAPTURE_ERRORS.UNSUPPORTED }) },
    });
    await handler.activate();
    const result = await handler.prepareRuntime(descriptor());
    expect(result).toMatchObject({ success: false, error: 'LIVE_DUBBING_MEDIA_CAPTURE_UNSUPPORTED' });
  });

  it('4 preserves MEDIA_CAPTURE_NO_AUDIO', async () => {
    const handler = new LiveDubbingFeatureHandler({
      controller: { prepare: async () => ({ success: true }), consumeSource: async () => ({ success: true, sourceAccepted: true, eventSequence: 1 }), dispose: async () => ({ success: true }) },
      resolver: { resolve: () => ({ success: true, source: 'el' }) },
      captureAdapter: { capture: () => ({ success: false, error: MEDIA_CAPTURE_ERRORS.NO_AUDIO }) },
    });
    await handler.activate();
    const result = await handler.prepareRuntime(descriptor());
    expect(result).toMatchObject({ success: false, error: 'LIVE_DUBBING_MEDIA_CAPTURE_NO_AUDIO' });
  });

  it('5 controller prepare failure preserves canonical code', async () => {
    const handler = new LiveDubbingFeatureHandler({
      controller: {
        prepare: async () => ({ success: false, error: 'LIVE_DUBBING_CAPTURE_FAILED' }),
        consumeSource: vi.fn(),
        dispose: async () => ({ success: true }),
      },
      resolver: { resolve: () => ({ success: true, source: 'el' }) },
      captureAdapter: { capture: () => sourceHandle() },
    });
    await handler.activate();
    const result = await handler.prepareRuntime(descriptor());
    expect(result).toMatchObject({ success: false, error: 'LIVE_DUBBING_CAPTURE_FAILED' });
  });

  it('5b controller consumeSource failure preserves code', async () => {
    const handler = new LiveDubbingFeatureHandler({
      controller: {
        prepare: async () => ({ success: true }),
        consumeSource: async () => ({ success: false, error: 'LIVE_DUBBING_AUDIO_PIPELINES_FAILED', sourceAccepted: false }),
        dispose: async () => ({ success: true }),
      },
      resolver: { resolve: () => ({ success: true, source: 'el' }) },
      captureAdapter: { capture: () => sourceHandle() },
    });
    await handler.activate();
    const result = await handler.prepareRuntime(descriptor());
    expect(result).toMatchObject({ success: false, error: 'LIVE_DUBBING_AUDIO_PIPELINES_FAILED' });
  });

  it('6 provider bootstrap/setup preserves code via connectRuntime', async () => {
    const controller = {
      prepare: async () => ({ success: true }),
      consumeSource: async () => ({ success: true, sourceAccepted: true, eventSequence: 1 }),
      connectProvider: async () => ({ success: false, error: 'LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE' }),
      dispose: async () => ({ success: true }),
    };
    const handler = new LiveDubbingFeatureHandler({
      controller,
      resolver: { resolve: () => ({ success: true, source: 'el' }) },
      captureAdapter: { capture: () => sourceHandle() },
    });
    await handler.activate();
    const prep = await handler.prepareRuntime(descriptor());
    expect(prep.success).toBe(true);
    const connect = await handler.connectRuntime({ ...descriptor(), eventSequence: 2, runtimeEventSequence: 1 });
    expect(connect).toMatchObject({ success: false, error: 'LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE' });
    // second variant: setup incomplete via provider returning incomplete
    controller.connectProvider = async () => ({ success: true, eventSequence: 3, setupComplete: false });
    // need fresh handler for second? reuse but need to reset preparedDescriptor
    const handler2 = new LiveDubbingFeatureHandler({
      controller: {
        prepare: async () => ({ success: true }),
        consumeSource: async () => ({ success: true, sourceAccepted: true, eventSequence: 1 }),
        connectProvider: async () => ({ success: true, eventSequence: 9, setupComplete: true }),
        dispose: async () => ({ success: true }),
      },
      resolver: { resolve: () => ({ success: true, source: 'el' }) },
      captureAdapter: { capture: () => sourceHandle() },
    });
    await handler2.activate();
    await handler2.prepareRuntime(descriptor());
    const badSeq = await handler2.connectRuntime({ ...descriptor(), eventSequence: 2, runtimeEventSequence: 1 });
    expect(badSeq).toMatchObject({ success: false, error: 'LIVE_DUBBING_PROVIDER_SETUP_INCOMPLETE' });
  });

  it('7 arbitrary exception not propagated', async () => {
    const handler = new LiveDubbingFeatureHandler({
      controller: {
        prepare: async () => { throw new Error('secret token abc https://example.com/stream?token=secret MediaStream {id:123}'); },
        dispose: async () => ({ success: true }),
      },
      resolver: { resolve: () => ({ success: true, source: 'el' }) },
      captureAdapter: { capture: () => sourceHandle() },
    });
    await handler.activate();
    const result = await handler.prepareRuntime(descriptor());
    expect(result.success).toBe(false);
    expect(result.error).toBe('LIVE_DUBBING_RUNTIME_PREPARE_FAILED');
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('example.com');
    expect(JSON.stringify(result)).not.toContain('MediaStream');
    // also resolver throwing arbitrary
    const handler2 = new LiveDubbingFeatureHandler({
      controller: { prepare: async () => ({ success: true }), consumeSource: async () => ({ success: true, sourceAccepted: true, eventSequence: 1 }), dispose: async () => ({ success: true }) },
      resolver: { resolve: () => { throw new Error('payload secret https://evil.com'); } },
      captureAdapter: { capture: () => sourceHandle() },
    });
    await handler2.activate();
    const result2 = await handler2.prepareRuntime(descriptor());
    expect(result2.success).toBe(false);
    expect(JSON.stringify(result2)).not.toContain('evil.com');
    expect(JSON.stringify(result2)).not.toContain('secret');
  });

  it('8 credentials/URLs/media not in response', async () => {
    const handler = new LiveDubbingFeatureHandler({
      controller: {
        prepare: async () => ({ success: false, error: 'LIVE_DUBBING_CAPTURE_FAILED' }),
        dispose: async () => ({ success: true }),
      },
      resolver: { resolve: () => ({ success: true, source: { fakeUrl: 'https://secret.example/token=abc', mediaStream: 'MediaStream' } }) },
      captureAdapter: { capture: () => ({ success: false, error: MEDIA_CAPTURE_ERRORS.NO_AUDIO }) },
    });
    await handler.activate();
    const result = await handler.prepareRuntime(descriptor());
    const str = JSON.stringify(result);
    expect(str).not.toContain('https://');
    expect(str).not.toContain('token');
    expect(str).not.toContain('MediaStream');
    expect(str).not.toContain('secret');
    // also ensure is scalar only
    expect(typeof result.error).toBe('string');
    expect(result.error).toMatch(/^[A-Z0-9_.-]{1,80}$/);
  });

  it('9 failure cleanup exactly-once and descriptor unchanged', async () => {
    const source = mockSourceHandleWithDispose();
    const disposeSpy = vi.fn(async () => ({ success: true, disposed: true }));
    const controller = {
      prepare: async () => ({ success: true }),
      consumeSource: async () => ({ success: false, sourceAccepted: false }),
      dispose: disposeSpy,
    };
    const handler = new LiveDubbingFeatureHandler({
      controller,
      resolver: { resolve: () => ({ success: true, source: 'el' }) },
      captureAdapter: { capture: () => source },
    });
    await handler.activate();
    const result = await handler.prepareRuntime(descriptor());
    expect(result.success).toBe(false);
    expect(source.dispose).toHaveBeenCalledTimes(1);
    expect(disposeSpy).toHaveBeenCalledTimes(1);
    // second deactivate should not double dispose source
    await handler.deactivate();
    expect(source.dispose).toHaveBeenCalledTimes(1);
    expect(disposeSpy).toHaveBeenCalledTimes(1);
    // descriptor should not be retained as prepared
    expect(handler.preparedDescriptor).toBeNull();
    expect(handler.controllerDescriptor).toBeNull();
  });

  it('9b success does not leak source handle', async () => {
    const source = mockSourceHandleWithDispose();
    const handler = new LiveDubbingFeatureHandler({
      controller: {
        prepare: async () => ({ success: true }),
        consumeSource: async () => ({ success: true, sourceAccepted: true, eventSequence: 1 }),
        dispose: async () => ({ success: true }),
      },
      resolver: { resolve: () => ({ success: true, source: 'el' }) },
      captureAdapter: { capture: () => source },
    });
    await handler.activate();
    const result = await handler.prepareRuntime(descriptor());
    expect(result.success).toBe(true);
    expect(handler.localSourceHandle).toBeNull(); // owned transferred
    expect(source.dispose).not.toHaveBeenCalled();
  });
});

describe('Firefox host preserves canonical errors', () => {
  const browserAPI = { runtime: { id: 'ext-id', getURL: (p='') => `chrome-extension://ext-id/${p}` } };
  const backgroundSender = { id: 'ext-id' };
  function makeHost(prepareResult) {
    const lifecycle = {
      requestActivation: async () => ({ activated: true }),
      deactivateFeature: async () => true,
      prepareRuntime: async () => prepareResult,
      isFeatureActive: () => true,
      getRuntimeEventSequence: () => 1,
      connectFeatureRuntime: async () => ({ success: true, eventSequence: 3, runtimeEventSequence: 3, setupComplete: true }),
    };
    return new FirefoxLiveDubbingContentHost({ browserAPI, featureLifecycle: lifecycle });
  }
  function prepareMsg(overrides = {}) {
    return { target: FIREFOX_CONTENT_TARGET, action: LIVE_DUBBING_ACTIONS.PREPARE, data: { sessionId: 's1', providerId: 'gemini', tabId: 7, frameId: 0, documentId: 'doc-1', targetLanguage: 'en', eventSequence: 0, ...overrides } };
  }
  it('host forwards MEDIA_SOURCE_NOT_FOUND exact with fencing', async () => {
    const host = makeHost({ success: false, error: 'LIVE_DUBBING_MEDIA_SOURCE_NOT_FOUND' });
    const resp = await host.handle(prepareMsg(), backgroundSender);
    expect(resp).toMatchObject({ success: false, error: 'LIVE_DUBBING_MEDIA_SOURCE_NOT_FOUND', sessionId: 's1', tabId: 7, frameId: 0, documentId: 'doc-1', eventSequence: 0 });
    // forbidden keys not present
    expect(JSON.stringify(resp)).not.toContain('stream');
    expect(JSON.stringify(resp)).not.toContain('MediaStream');
  });
  it('host forwards MEDIA_CAPTURE_NO_AUDIO and keeps generic for activation failure', async () => {
    const activationFailHost = new FirefoxLiveDubbingContentHost({ browserAPI, featureLifecycle: { requestActivation: async () => null, deactivateFeature: async () => true, prepareRuntime: async () => ({ success: true }), isFeatureActive: () => false } });
    const respActive = await activationFailHost.handle(prepareMsg(), backgroundSender);
    expect(respActive).toMatchObject({ success: false, error: 'LIVE_DUBBING_ACTIVATION_BLOCKED' });
    const host2 = makeHost({ success: false, error: 'LIVE_DUBBING_MEDIA_CAPTURE_NO_AUDIO' });
    const resp2 = await host2.handle(prepareMsg(), backgroundSender);
    expect(resp2).toMatchObject({ success: false, error: 'LIVE_DUBBING_MEDIA_CAPTURE_NO_AUDIO' });
  });
  it('host preserves provider bootstrap error via CONNECT', async () => {
    const lifecycle = {
      requestActivation: async () => ({ activated: true }),
      deactivateFeature: async () => true,
      prepareRuntime: async () => ({ success: true, runtimeEventSequence: 1 }),
      isFeatureActive: () => true,
      getRuntimeEventSequence: () => 1,
      connectFeatureRuntime: async () => ({ success: false, error: 'LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE', ignored: true }),
    };
    const host = new FirefoxLiveDubbingContentHost({ browserAPI, featureLifecycle: lifecycle });
    const prep = await host.handle(prepareMsg(), backgroundSender);
    expect(prep.success).toBe(true);
    const connectMsg = { target: FIREFOX_CONTENT_TARGET, action: LIVE_DUBBING_ACTIONS.CONNECT_PROVIDER, data: { sessionId: 's1', providerId: 'gemini', tabId: 7, frameId: 0, documentId: 'doc-1', targetLanguage: 'en', eventSequence: 2 } };
    const conn = await host.handle(connectMsg, backgroundSender);
    expect(conn).toMatchObject({ success: false, error: 'LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE' });
    expect(JSON.stringify(conn)).not.toContain('apiKey');
  });
  it('host sanitizes arbitrary exception to generic', async () => {
    const host = makeHost({ success: false, error: 'arbitrary message with https://evil.com and secret token' });
    const resp = await host.handle(prepareMsg(), backgroundSender);
    // should fallback to generic prepare failed, not leak url/secret
    expect(resp.error).toBe('LIVE_DUBBING_RUNTIME_PREPARE_FAILED');
    expect(JSON.stringify(resp)).not.toContain('evil.com');
    expect(JSON.stringify(resp)).not.toContain('secret');
  });
});

describe('Coordinator firefox transaction retains safe reason', () => {
  function createCoordinatorWithHost(prepareError, providerError) {
    const storage = new Map();
    const browserAPI = {
      runtime: {
        id: 'ext-id',
        getURL: (p='') => `chrome-extension://ext-id/${p}`,
        sendMessage: vi.fn(),
      },
      storage: {
        session: {
          get: vi.fn(async (k) => ({ [k]: storage.get(k) })),
          set: vi.fn(async (rec) => Object.entries(rec).forEach(([k,v]) => storage.set(k,v))),
          remove: vi.fn(async (k) => storage.delete(k)),
        },
      },
      tabs: {
        query: vi.fn(async () => [{ id: 7, url: 'https://example.test' }]),
        get: vi.fn(async (id) => ({ id, url: 'https://example.test' })),
        sendMessage: vi.fn(async (tabId, message) => {
          if (message.action === LIVE_DUBBING_ACTIONS.PREPARE) {
            return prepareError ? { success: false, error: prepareError, sessionId: 's1', providerId: 'gemini', tabId: 7, frameId: 0, documentId: 'doc-1', eventSequence: 0, status: 'IDLE' } : { success: true, ack: 'READY', sessionId: 's1', providerId: 'gemini', tabId: 7, frameId: 0, documentId: 'doc-1', targetLanguage: 'en', eventSequence: 0, runtimeEventSequence: 1, prepared: true, status: 'PREPARING_CAPTURE' };
          }
          if (message.action === LIVE_DUBBING_ACTIONS.CONNECT_PROVIDER) {
            return providerError ? { success: false, error: providerError, sessionId: 's1', providerId: 'gemini', tabId: 7, frameId: 0, documentId: 'doc-1', eventSequence: 2, status: 'IDLE' } : { success: true, ack: 'PROVIDER_READY', sessionId: 's1', providerId: 'gemini', tabId: 7, frameId: 0, documentId: 'doc-1', targetLanguage: 'en', eventSequence: 2, runtimeEventSequence: 3, providerReady: true, setupComplete: true, active: true, status: 'RUNNING' };
          }
          if (message.action === LIVE_DUBBING_ACTIONS.DISPOSE) return { success: true, ack: 'DISPOSED', sessionId: 's1', providerId: 'gemini', tabId: 7, frameId: 0, documentId: 'doc-1', eventSequence: 0, status: 'IDLE' };
          if (message.action === LIVE_DUBBING_ACTIONS.STATUS) return { success: true, active: false, sessionId: 's1', providerId: 'gemini', status: 'IDLE' };
          return { success: true };
        }),
      },
    };
    const registration = {
      get: vi.fn(() => ({ tabId: 7, frameId: 0, documentId: 'doc-1' })),
      discover: vi.fn(async () => ({ tabId: 7, frameId: 0, documentId: 'doc-1' })),
    };
    const coordinator = new LiveDubbingCoordinator({
      browserAPI,
      chromeAPI: {},
      leaseManager: { acquire: vi.fn(async () => true), release: vi.fn(async () => true), getSnapshot: () => ({ activeLeases: [] }), ensureDocument: vi.fn() },
      firefoxContentRuntimeRegistration: registration,
      runtimeHost: 'firefox-content',
      uuid: () => 's1',
      now: () => 123,
      logger: { warn: vi.fn() },
    });
    // mock tabs.sendMessage to use our handler
    browserAPI.tabs.sendMessage = vi.fn(async (tabId, message) => {
      // simulate host response sanitization
      const isPrepare = message.action === LIVE_DUBBING_ACTIONS.PREPARE;
      if (isPrepare && prepareError) return { success: false, error: prepareError, sessionId: 's1', providerId: 'gemini', tabId: 7, frameId: 0, documentId: 'doc-1', eventSequence: 0, status: 'IDLE' };
      if (isPrepare) return { success: true, ack: 'READY', sessionId: 's1', providerId: 'gemini', tabId: 7, frameId: 0, documentId: 'doc-1', targetLanguage: 'en', eventSequence: 0, runtimeEventSequence: 1, prepared: true, status: 'PREPARING_CAPTURE' };
      if (message.action === LIVE_DUBBING_ACTIONS.CONNECT_PROVIDER) {
        if (providerError) return { success: false, error: providerError, sessionId: 's1', providerId: 'gemini', tabId: 7, frameId: 0, documentId: 'doc-1', eventSequence: 2, status: 'IDLE' };
        return { success: true, ack: 'PROVIDER_READY', sessionId: 's1', providerId: 'gemini', tabId: 7, frameId: 0, documentId: 'doc-1', targetLanguage: 'en', eventSequence: 2, runtimeEventSequence: 3, providerReady: true, setupComplete: true, active: true, status: 'RUNNING' };
      }
      return { success: true, ack: 'DISPOSED', sessionId: 's1', providerId: 'gemini', tabId: 7, frameId: 0, documentId: 'doc-1', eventSequence: 0, status: 'IDLE' };
    });
    return { coordinator, browserAPI, storage };
  }

  it('preserves MEDIA_SOURCE_NOT_FOUND as reason in START failure', async () => {
    const { coordinator } = createCoordinatorWithHost('LIVE_DUBBING_MEDIA_SOURCE_NOT_FOUND', null);
    const result = await coordinator.start({ data: { targetLanguage: 'en', providerId: 'gemini' } }, { tab: { id: 7 } });
    expect(result.success).toBe(false);
    expect(result.error).toBe('LIVE_DUBBING_START_FAILED');
    expect(result.reason).toBe('LIVE_DUBBING_MEDIA_SOURCE_NOT_FOUND');
    expect(JSON.stringify(result)).not.toContain('stream');
  });

  it('preserves PROVIDER_BOOTSTRAP_UNAVAILABLE as reason', async () => {
    const { coordinator } = createCoordinatorWithHost(null, 'LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE');
    const result = await coordinator.start({ data: { targetLanguage: 'en', providerId: 'gemini' } }, { tab: { id: 7 } });
    expect(result.success).toBe(false);
    expect(result.reason).toBe('LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE');
  });

  it('does not leak arbitrary exception', async () => {
    const { coordinator } = createCoordinatorWithHost('secret token https://evil.com MediaStream', null);
    // the host will sanitize to generic, coordinator will get generic error not secret
    const result = await coordinator.start({ data: { targetLanguage: 'en', providerId: 'gemini' } }, { tab: { id: 7 } });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain('evil.com');
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('MediaStream');
    // reason should be null or generic, not raw
    if (result.reason) expect(result.reason).toMatch(/^[A-Z0-9_.-]+$/);
  });

  it('chrome path unchanged - returns generic START_FAILED without media reason when tabCapture fails', async () => {
    const storage = new Map();
    const browserAPI = {
      runtime: {
        id: 'ext-id',
        getURL: (p='') => `chrome-extension://ext-id/${p}`,
        sendMessage: vi.fn(async (msg) => {
          if (msg.action === 'LIVE_DUBBING_PREPARE') return { success: true, ack: 'READY', sessionId: 's1', providerId: 'gemini', eventSequence: 0 };
          if (msg.action === 'LIVE_DUBBING_DISPOSE') return { success: true, ack: 'DISPOSED', sessionId: 's1', providerId: 'gemini' };
          return { success: false };
        }),
      },
      storage: {
        session: {
          get: vi.fn(async (k) => ({ [k]: storage.get(k) })),
          set: vi.fn(async (rec) => Object.entries(rec).forEach(([k,v]) => storage.set(k,v))),
          remove: vi.fn(async (k) => storage.delete(k)),
        },
      },
      tabs: { query: vi.fn(async () => [{ id: 7 }]), get: vi.fn(async (id) => ({ id })) },
    };
    const chromeAPI = { tabCapture: { getMediaStreamId: vi.fn(async () => { throw new Error('capture failed https://evil.com'); }) } };
    const coordinator = new LiveDubbingCoordinator({
      browserAPI,
      chromeAPI,
      leaseManager: { acquire: vi.fn(async () => true), release: vi.fn(async () => true), getSnapshot: () => ({ activeLeases: [] }), ensureDocument: vi.fn() },
      runtimeHost: 'offscreen',
      uuid: () => 's1',
      now: () => 123,
      logger: { warn: vi.fn() },
    });
    const result = await coordinator.start({ data: { targetLanguage: 'en' } }, { tab: { id: 7 } });
    expect(result.success).toBe(false);
    expect(result.error).toBe('LIVE_DUBBING_START_FAILED');
    expect(JSON.stringify(result)).not.toContain('evil.com');
    expect(JSON.stringify(result)).not.toContain('MediaStream');
  });
});
