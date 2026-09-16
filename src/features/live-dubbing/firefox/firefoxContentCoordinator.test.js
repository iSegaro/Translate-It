import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveDubbingCoordinator } from '../background/LiveDubbingCoordinator.js';
import {
  LIVE_DUBBING_ACTIONS,
  LIVE_DUBBING_OPENAI_PROVIDER_ID,
  LIVE_DUBBING_PROVIDER_ID,
  LIVE_DUBBING_RUNTIME_HOSTS,
  LIVE_DUBBING_STORAGE_KEY,
  LIVE_DUBBING_STORAGE_STATE,
  LIVE_DUBBING_STATUS,
} from '../constants.js';
import {
  createDescriptor,
  createFirefoxContentDescriptor,
} from '../contracts.js';
import {
  FIREFOX_CONTENT_SEND_TIMEOUT_MS,
  getFirefoxContentTarget,
  sendFirefoxContentMessage,
} from './firefoxContentAddressing.js';
import { createFirefoxContentMessage } from './firefoxContentContract.js';
import { FIREFOX_CONTENT_BACKGROUND_ACTIONS } from './firefoxContentRuntimeMessenger.js';

function firefoxDescriptor(overrides = {}) {
  const { status, eventSequence, ...descriptorOverrides } = overrides;
  const descriptor = createFirefoxContentDescriptor({
    sessionId: 'session-1',
    tabId: 7,
    frameId: 0,
    documentId: 'doc-1',
    providerId: 'gemini',
    targetLanguage: 'en',
    startedAt: 123,
    ...descriptorOverrides,
  });
  return {
    ...descriptor,
    ...(status === undefined ? {} : { status }),
    ...(eventSequence === undefined ? {} : { eventSequence }),
  };
}

function createHarness() {
  const storage = new Map();
  const browserAPI = {
    runtime: {
      id: 'extension-id',
      getURL: (path = '') => `chrome-extension://extension-id/${path}`,
      sendMessage: vi.fn(async () => ({ success: true })),
    },
    storage: {
      session: {
        get: vi.fn(async key => ({ [key]: storage.get(key) })),
        set: vi.fn(async record => Object.entries(record).forEach(([key, value]) => storage.set(key, value))),
        remove: vi.fn(async key => storage.delete(key)),
      },
    },
    tabs: {
      sendMessage: vi.fn(),
      query: vi.fn(async () => [{ id: 7, url: 'https://example.test' }]),
      get: vi.fn(async id => ({ id, url: 'https://example.test' })),
    },
  };
  const coordinator = new LiveDubbingCoordinator({
    browserAPI,
    chromeAPI: {},
    leaseManager: { acquire: vi.fn(async () => true), release: vi.fn(async () => true) },
    uuid: () => 'session-1',
    now: () => 123,
    logger: { warn: vi.fn() },
  });
  return { browserAPI, coordinator, storage };
}

function seedFirefoxSession(coordinator, descriptor = firefoxDescriptor()) {
  coordinator.descriptor = { ...descriptor };
  coordinator.storageState = LIVE_DUBBING_STORAGE_STATE.PRESENT;
  coordinator.sessionStates.set(descriptor.sessionId, {
    descriptor: { ...descriptor },
    leasePromise: null,
    leaseAcquired: false,
    prepared: true,
    terminalRequested: false,
    cleanupCompleted: false,
    providerDiagnostic: null,
    cleanupFacts: null,
  });
  return descriptor;
}

describe('Firefox content addressing', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('targets the exact document with the full identity', async () => {
    const { browserAPI } = createHarness();
    const descriptor = firefoxDescriptor();
    browserAPI.tabs.sendMessage.mockResolvedValue({
      success: true,
      ack: 'READY',
      sessionId: 'session-1',
      providerId: 'gemini',
      tabId: 7,
      frameId: 0,
      documentId: 'doc-1',
      eventSequence: 0,
      status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
    });

    const response = await sendFirefoxContentMessage(
      browserAPI,
      descriptor,
      createFirefoxContentMessage(LIVE_DUBBING_ACTIONS.PREPARE, descriptor),
    );

    expect(browserAPI.tabs.sendMessage).toHaveBeenCalledTimes(1);
    expect(browserAPI.tabs.sendMessage).toHaveBeenCalledWith(7, {
      target: 'live-dubbing-firefox-content',
      action: LIVE_DUBBING_ACTIONS.PREPARE,
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        tabId: 7,
        frameId: 0,
        documentId: 'doc-1',
        targetLanguage: 'en',
        eventSequence: 0,
      },
    }, { frameId: 0, documentId: 'doc-1' });
    expect(response).toMatchObject({ success: true, ack: 'READY', sessionId: 'session-1' });
  });

  it('fails closed without sending when identity is inexact', async () => {
    const { browserAPI } = createHarness();
    const descriptor = firefoxDescriptor();
    const foreign = createFirefoxContentMessage(
      LIVE_DUBBING_ACTIONS.STATUS,
      firefoxDescriptor({ sessionId: 'session-2', documentId: 'doc-2' }),
    );

    const response = await sendFirefoxContentMessage(browserAPI, descriptor, foreign);
    expect(response).toEqual({
      success: false,
      error: 'LIVE_DUBBING_SESSION_MISMATCH',
      sessionId: 'session-1',
      providerId: 'gemini',
    });
    expect(browserAPI.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('maps disappearance to a bounded controlled failure, never a false success', async () => {
    const { browserAPI } = createHarness();
    const descriptor = firefoxDescriptor();
    const message = createFirefoxContentMessage(LIVE_DUBBING_ACTIONS.STATUS, descriptor);

    browserAPI.tabs.sendMessage.mockRejectedValueOnce(new Error('No receiving end'));
    await expect(sendFirefoxContentMessage(browserAPI, descriptor, message))
      .resolves.toMatchObject({ success: false, error: 'LIVE_DUBBING_CONTENT_UNAVAILABLE' });

    browserAPI.tabs.sendMessage.mockResolvedValueOnce({
      success: true,
      ack: 'READY',
      sessionId: 'session-1',
      providerId: 'gemini',
      tabId: 7,
      frameId: 0,
      documentId: 'doc-stale',
      eventSequence: 0,
    });
    await expect(sendFirefoxContentMessage(browserAPI, descriptor, message))
      .resolves.toMatchObject({ success: false, error: 'LIVE_DUBBING_SESSION_MISMATCH' });

    browserAPI.tabs.sendMessage.mockResolvedValueOnce(null);
    await expect(sendFirefoxContentMessage(browserAPI, descriptor, message))
      .resolves.toMatchObject({ success: false });

    await expect(sendFirefoxContentMessage({}, descriptor, message))
      .resolves.toMatchObject({ success: false, error: 'LIVE_DUBBING_CONTENT_UNAVAILABLE' });

    browserAPI.tabs.sendMessage.mockImplementationOnce(() => new Promise(() => {}));
    await expect(sendFirefoxContentMessage(browserAPI, descriptor, message, { timeoutMs: 5 }))
      .resolves.toMatchObject({ success: false, error: 'LIVE_DUBBING_CONTENT_UNAVAILABLE' });

    expect(FIREFOX_CONTENT_SEND_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('resolves no target for offscreen or incomplete descriptors', () => {
    expect(getFirefoxContentTarget(createDescriptor({
      sessionId: 'session-1',
      tabId: 7,
      providerId: 'gemini',
      targetLanguage: 'en',
      startedAt: 123,
    }))).toBeNull();
    expect(getFirefoxContentTarget({
      runtimeHost: 'firefox-content',
      tabId: 7,
      frameId: 0,
      documentId: '  ',
    })).toBeNull();
    expect(getFirefoxContentTarget(null)).toBeNull();
  });

  it('sends through the Coordinator with the same exact targeting', async () => {
    const { browserAPI, coordinator } = createHarness();
    const descriptor = firefoxDescriptor();
    browserAPI.tabs.sendMessage.mockResolvedValue({
      success: true,
      sessionId: 'session-1',
      providerId: 'gemini',
      tabId: 7,
      frameId: 0,
      documentId: 'doc-1',
      eventSequence: 0,
      active: false,
      status: 'IDLE',
    });

    const response = await coordinator._sendFirefoxContent(
      descriptor,
      createFirefoxContentMessage(LIVE_DUBBING_ACTIONS.STATUS, descriptor),
    );
    expect(browserAPI.tabs.sendMessage).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ target: 'live-dubbing-firefox-content' }),
      { frameId: 0, documentId: 'doc-1' },
    );
    expect(response.success).toBe(true);
    expect(coordinator.isFirefoxContentSession(descriptor)).toBe(true);
    expect(coordinator.isFirefoxContentSession(createDescriptor({
      sessionId: 's',
      tabId: 1,
      providerId: 'gemini',
      targetLanguage: 'en',
      startedAt: 1,
    }))).toBe(false);
  });
});

describe('Firefox content boundary at the Coordinator', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('never admits content senders to the offscreen control route', async () => {
    const { coordinator } = createHarness();
    seedFirefoxSession(coordinator);
    const contentSender = { id: 'extension-id', tab: { id: 7 }, frameId: 0, url: 'https://example.test/' };
    const terminalMessage = {
      action: LIVE_DUBBING_ACTIONS.TERMINAL,
      data: { sessionId: 'session-1', providerId: 'gemini', event: 'HOST_TERMINAL' },
    };

    await expect(coordinator.authorizeOffscreenControlMessage(terminalMessage, contentSender))
      .resolves.toBeNull();
    await expect(coordinator.authorizeOffscreenControlMessage(terminalMessage, contentSender, { type: 'bootstrap' }))
      .resolves.toBeNull();
    await expect(coordinator.handleOffscreenTerminal(terminalMessage, contentSender))
      .resolves.toMatchObject({ success: false, error: 'LIVE_DUBBING_UNAUTHORIZED', ignored: true });
  });

  it('reserves one Firefox bootstrap request for the exact connecting session', () => {
    const { coordinator } = createHarness();
    const descriptor = seedFirefoxSession(coordinator, firefoxDescriptor({
      status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
      eventSequence: 3,
    }));
    const sender = {
      id: 'extension-id',
      tab: { id: 7 },
      frameId: 0,
      documentId: 'doc-1',
      url: 'https://example.test/',
    };
    const request = {
      action: FIREFOX_CONTENT_BACKGROUND_ACTIONS.REQUEST_BOOTSTRAP,
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        targetLanguage: 'en',
        eventSequence: 3,
        tabId: 7,
        frameId: 0,
        documentId: 'doc-1',
      },
    };

    const authorized = coordinator.authorizeFirefoxContentBootstrapRequest(request, sender);
    expect(authorized).toEqual(descriptor);
    // No bootstrap payload, secret, or token crosses authorization.
    expect(authorized).not.toHaveProperty('bootstrap');
    expect(JSON.stringify(authorized)).not.toContain('secret');
    // Reservation is atomic and one-shot at the mint path.
    expect(coordinator.authorizeFirefoxContentBootstrapRequest(request, sender)).toBeNull();
    expect(coordinator.bootstrapRequestSessions.has('session-1')).toBe(true);
  });

  it('accepts the provider bootstrap runtime sequence after persisted CONNECTING sequence 2', () => {
    const { coordinator } = createHarness();
    const descriptor = seedFirefoxSession(coordinator, firefoxDescriptor({
      status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
      eventSequence: 2,
    }));
    const request = {
      action: FIREFOX_CONTENT_BACKGROUND_ACTIONS.REQUEST_BOOTSTRAP,
      data: {
        sessionId: descriptor.sessionId,
        providerId: descriptor.providerId,
        targetLanguage: descriptor.targetLanguage,
        tabId: descriptor.tabId,
        frameId: descriptor.frameId,
        documentId: descriptor.documentId,
        eventSequence: 3,
      },
    };

    expect(coordinator.authorizeFirefoxContentBootstrapRequest(request, {
      id: 'extension-id',
      tab: { id: descriptor.tabId },
      frameId: descriptor.frameId,
      documentId: descriptor.documentId,
    })).toEqual(descriptor);
  });

  it('rejects inexact Firefox bootstrap scaffolds', () => {
    const { coordinator } = createHarness();
    seedFirefoxSession(coordinator, firefoxDescriptor({
      status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
      eventSequence: 3,
    }));
    const sender = {
      id: 'extension-id',
      tab: { id: 7 },
      frameId: 0,
      documentId: 'doc-1',
    };
    const base = {
      action: FIREFOX_CONTENT_BACKGROUND_ACTIONS.REQUEST_BOOTSTRAP,
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        targetLanguage: 'en',
        eventSequence: 3,
        tabId: 7,
        frameId: 0,
        documentId: 'doc-1',
      },
    };

    expect(coordinator.authorizeFirefoxContentBootstrapRequest(
      { ...base, data: { ...base.data, documentId: 'doc-stale' } }, sender,
    )).toBeNull();
    expect(coordinator.authorizeFirefoxContentBootstrapRequest(
      { ...base, data: { ...base.data, sessionId: 'other' } }, sender,
    )).toBeNull();
    // Offscreen senders (no tab) never enter the content route.
    expect(coordinator.authorizeFirefoxContentBootstrapRequest(base, {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    })).toBeNull();
  });

  it('requires Gemini CONNECTING_PROVIDER sequence 3 and exact native sender identity', () => {
    const request = {
      action: FIREFOX_CONTENT_BACKGROUND_ACTIONS.REQUEST_BOOTSTRAP,
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        targetLanguage: 'en',
        eventSequence: 3,
        tabId: 7,
        frameId: 0,
        documentId: 'doc-1',
      },
    };
    const sender = { id: 'extension-id', tab: { id: 7 }, frameId: 0, documentId: 'doc-1' };
    const authorize = ({ descriptorOverrides = {}, dataOverrides = {}, senderOverrides = {} } = {}) => {
      const { coordinator } = createHarness();
      seedFirefoxSession(coordinator, {
        ...firefoxDescriptor({ status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER, eventSequence: 3 }),
        ...descriptorOverrides,
      });
      return coordinator.authorizeFirefoxContentBootstrapRequest({
        ...request,
        data: { ...request.data, ...dataOverrides },
      }, { ...sender, ...senderOverrides });
    };

    expect(authorize({ descriptorOverrides: { providerId: 'openai' } })).toBeNull();
    expect(authorize({ descriptorOverrides: { status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE } })).toBeNull();
    expect(authorize({ descriptorOverrides: { eventSequence: 2 }, dataOverrides: { eventSequence: 2 } })).toBeNull();
    expect(authorize({ dataOverrides: { providerId: 'openai' } })).toBeNull();
    expect(authorize({ dataOverrides: { targetLanguage: 'es' } })).toBeNull();
    expect(authorize({ senderOverrides: { tab: { id: 8 } } })).toBeNull();
    expect(authorize({ senderOverrides: { frameId: 1 } })).toBeNull();
    expect(authorize({ senderOverrides: { documentId: 'doc-stale' } })).toBeNull();
  });

  it('accepts Controller terminal sequence drift from CONNECTING_PROVIDER 3 to terminal 2', () => {
    const { coordinator } = createHarness();
    const descriptor = seedFirefoxSession(coordinator, firefoxDescriptor({
      status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
      eventSequence: 3,
    }));
    const sender = {
      id: 'extension-id',
      tab: { id: 7 },
      frameId: 0,
      documentId: 'doc-1',
      url: 'https://example.test/',
    };
    const stop = vi.spyOn(coordinator, '_stopForSession');
    const terminal = {
      target: 'live-dubbing-firefox-background',
      action: FIREFOX_CONTENT_BACKGROUND_ACTIONS.TERMINAL,
      data: {
        sessionId: descriptor.sessionId,
        providerId: descriptor.providerId,
        tabId: descriptor.tabId,
        frameId: descriptor.frameId,
        documentId: descriptor.documentId,
        eventSequence: 2,
        event: 'PROVIDER_ERROR',
        status: 'CONNECTING_PROVIDER',
        error: 'LIVE_DUBBING_PROVIDER_ERROR',
      },
    };

    expect(coordinator.authorizeFirefoxContentTerminal(terminal, sender)).toEqual(descriptor);
    expect(coordinator.sessionStates.get(descriptor.sessionId).terminalRequested).toBe(true);
    expect(stop).not.toHaveBeenCalled();
  });

  it('rejects terminal sequence 2 when RUNNING descriptor sequence is 3', () => {
    const { coordinator } = createHarness();
    const descriptor = seedFirefoxSession(coordinator, firefoxDescriptor({
      status: LIVE_DUBBING_STATUS.RUNNING,
      eventSequence: 3,
    }));
    const terminal = {
      action: FIREFOX_CONTENT_BACKGROUND_ACTIONS.TERMINAL,
      data: {
        sessionId: descriptor.sessionId,
        providerId: descriptor.providerId,
        tabId: descriptor.tabId,
        frameId: descriptor.frameId,
        documentId: descriptor.documentId,
        eventSequence: 2,
        event: 'PROVIDER_ERROR',
      },
    };

    expect(coordinator.authorizeFirefoxContentTerminal(terminal, {
      id: 'extension-id',
      tab: { id: 7 },
      frameId: 0,
      documentId: 'doc-1',
    })).toBeNull();
    expect(coordinator.sessionStates.get(descriptor.sessionId).terminalRequested).toBe(false);
  });

  it('rejects terminal sequences outside exact state or the Controller drift', () => {
    const createTerminal = eventSequence => {
      const { coordinator } = createHarness();
      const descriptor = seedFirefoxSession(coordinator, firefoxDescriptor({
        status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
        eventSequence: 3,
      }));
      const terminal = {
        action: FIREFOX_CONTENT_BACKGROUND_ACTIONS.TERMINAL,
        data: {
          sessionId: descriptor.sessionId,
          providerId: descriptor.providerId,
          tabId: descriptor.tabId,
          frameId: descriptor.frameId,
          documentId: descriptor.documentId,
          eventSequence,
          event: 'PROVIDER_ERROR',
        },
      };
      return coordinator.authorizeFirefoxContentTerminal(terminal, {
        id: 'extension-id',
        tab: { id: 7 },
        frameId: 0,
        documentId: 'doc-1',
      });
    };

    expect(createTerminal(1)).toBeNull();
    expect(createTerminal(4)).toBeNull();
  });

  it('cannot terminalize a newer Firefox document or session', () => {
    const { coordinator } = createHarness();
    const descriptor = seedFirefoxSession(coordinator, firefoxDescriptor({
      sessionId: 'session-2',
      documentId: 'doc-2',
      status: LIVE_DUBBING_STATUS.RUNNING,
      eventSequence: 3,
    }));
    const terminal = {
      target: 'live-dubbing-firefox-background',
      action: FIREFOX_CONTENT_BACKGROUND_ACTIONS.TERMINAL,
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        tabId: 7,
        frameId: 0,
        documentId: 'doc-1',
        eventSequence: 3,
        event: 'STALE_TERMINAL',
      },
    };

    expect(coordinator.authorizeFirefoxContentTerminal(terminal, {
      id: 'extension-id',
      tab: { id: 7 },
      frameId: 0,
      documentId: 'doc-1',
    })).toBeNull();
    expect(coordinator.sessionStates.get(descriptor.sessionId).terminalRequested).toBe(false);
  });

  it('keeps descriptor fencing backward compatible while separating owners', () => {
    const { coordinator } = createHarness();
    const legacy = { sessionId: 's', providerId: 'gemini', tabId: 1, startedAt: 1, targetLanguage: 'en', eventSequence: 0, status: 'PREPARING_CAPTURE' };
    expect(coordinator._isSameDescriptorFence(legacy, { ...legacy })).toBe(true);

    const firefox = firefoxDescriptor();
    expect(coordinator._isSameDescriptorFence(firefox, { ...firefox })).toBe(true);
    expect(coordinator._isSameDescriptorFence(firefox, { ...firefox, documentId: 'doc-2' })).toBe(false);
    expect(coordinator._isSameDescriptorFence(firefox, { ...firefox, frameId: 2 })).toBe(false);
    expect(coordinator._isSameDescriptorFence(firefox, { ...firefox, runtimeHost: 'offscreen' })).toBe(false);
  });

  it('leaves the Chrome offscreen/tabCapture path untouched', async () => {
    const { coordinator, browserAPI, storage } = createHarness();
    coordinator.chromeAPI = { tabCapture: { getMediaStreamId: vi.fn(async () => 'stream-id') } };
    browserAPI.runtime.sendMessage.mockImplementation(async message => {
      if (message.action === 'LIVE_DUBBING_PREPARE') {
        return { success: true, ack: 'READY', sessionId: message.data.sessionId, providerId: message.data.providerId, eventSequence: message.data.eventSequence };
      }
      if (message.action === 'LIVE_DUBBING_CONSUME') {
        return {
          success: true, ack: 'MEDIA_ACQUIRED', sessionId: message.data.sessionId, providerId: message.data.providerId,
          status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER, eventSequence: message.data.eventSequence,
          captureReady: true, audioPathReady: true,
        };
      }
      if (message.action === 'LIVE_DUBBING_CONNECT_PROVIDER') {
        return {
          success: true, ack: 'PROVIDER_READY', sessionId: message.data.sessionId, providerId: message.data.providerId,
          status: LIVE_DUBBING_STATUS.RUNNING, eventSequence: message.data.eventSequence + 1,
          captureReady: true, audioPathReady: true, setupComplete: true,
        };
      }
      return { success: true, ack: 'DISPOSED', sessionId: message.data.sessionId, providerId: message.data.providerId };
    });

    const result = await coordinator.start({ data: { targetLanguage: 'en' } }, {});
    expect(result.success).toBe(true);
    expect(browserAPI.tabs.sendMessage).not.toHaveBeenCalled();
    expect(browserAPI.runtime.sendMessage.mock.calls.map(([message]) => message.target))
      .toEqual(['offscreen', 'offscreen', 'offscreen']);
    const stored = storage.get(LIVE_DUBBING_STORAGE_KEY);
    expect(stored.runtimeHost).toBe('offscreen');
    expect(stored).not.toHaveProperty('frameId');
    expect(stored).not.toHaveProperty('documentId');
  });

  it('runs Firefox START through the exact content host without lease or tabCapture use', async () => {
    const { browserAPI } = createHarness();
    const registration = {
      get: vi.fn(() => ({ tabId: 7, frameId: 0, documentId: 'doc-1' })),
      discover: vi.fn(),
    };
    const leaseManager = {
      acquire: vi.fn(async () => true),
      release: vi.fn(async () => true),
    };
    const getMediaStreamId = vi.fn(async () => 'should-not-be-requested');
    const messages = [];
    browserAPI.tabs.sendMessage.mockImplementation(async (tabId, message, options) => {
      messages.push({ tabId, message, options });
      const { data } = message;
      if (message.action === LIVE_DUBBING_ACTIONS.PREPARE) {
        return {
          success: true,
          ack: 'READY',
          sessionId: data.sessionId,
          providerId: data.providerId,
          tabId: data.tabId,
          frameId: data.frameId,
          documentId: data.documentId,
          targetLanguage: data.targetLanguage,
          eventSequence: 0,
          runtimeEventSequence: 1,
          prepared: true,
          active: true,
          status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
        };
      }
      if (message.action === LIVE_DUBBING_ACTIONS.CONNECT_PROVIDER) {
        return {
          success: true,
          ack: 'PROVIDER_READY',
          sessionId: data.sessionId,
          providerId: data.providerId,
          tabId: data.tabId,
          frameId: data.frameId,
          documentId: data.documentId,
          targetLanguage: data.targetLanguage,
          eventSequence: 2,
          runtimeEventSequence: 3,
          providerReady: true,
          setupComplete: true,
          active: true,
          prepared: true,
          status: LIVE_DUBBING_STATUS.RUNNING,
        };
      }
      return { success: false };
    });

    const coordinator = new LiveDubbingCoordinator({
      browserAPI,
      chromeAPI: { tabCapture: { getMediaStreamId } },
      leaseManager,
      runtimeHost: LIVE_DUBBING_RUNTIME_HOSTS.FIREFOX_CONTENT,
      firefoxContentRuntimeRegistration: registration,
      uuid: () => 'session-1',
      now: () => 123,
      logger: { warn: vi.fn() },
    });
    const result = await coordinator.start({ data: { targetLanguage: 'en' } }, {});

    expect(result).toMatchObject({
      success: true,
      status: {
        sessionId: 'session-1',
        runtimeHost: LIVE_DUBBING_RUNTIME_HOSTS.FIREFOX_CONTENT,
        frameId: 0,
        documentId: 'doc-1',
        status: LIVE_DUBBING_STATUS.RUNNING,
        eventSequence: 3,
      },
    });
    expect(registration.discover).not.toHaveBeenCalled();
    expect(leaseManager.acquire).not.toHaveBeenCalled();
    expect(getMediaStreamId).not.toHaveBeenCalled();
    expect(messages.map(({ message }) => message.action)).toEqual([
      LIVE_DUBBING_ACTIONS.PREPARE,
      LIVE_DUBBING_ACTIONS.CONNECT_PROVIDER,
    ]);
    expect(messages.map(({ message }) => message.data.eventSequence)).toEqual([0, 2]);
    expect(messages.every(({ tabId, options }) => tabId === 7
      && options.frameId === 0 && options.documentId === 'doc-1')).toBe(true);
  });

  it('disposes Firefox content sessions exactly and never releases an offscreen lease', async () => {
    const { browserAPI, storage } = createHarness();
    const registration = {
      get: vi.fn(() => ({ tabId: 7, frameId: 0, documentId: 'doc-1' })),
      discover: vi.fn(),
    };
    const release = vi.fn(async () => true);
    const descriptor = firefoxDescriptor({ status: LIVE_DUBBING_STATUS.RUNNING, eventSequence: 3 });
    storage.set(LIVE_DUBBING_STORAGE_KEY, descriptor);
    const coordinator = new LiveDubbingCoordinator({
      browserAPI,
      chromeAPI: {},
      leaseManager: { acquire: vi.fn(), release },
      runtimeHost: LIVE_DUBBING_RUNTIME_HOSTS.FIREFOX_CONTENT,
      firefoxContentRuntimeRegistration: registration,
      uuid: () => 'session-1',
      now: () => 123,
      logger: { warn: vi.fn() },
    });
    coordinator.descriptor = descriptor;
    coordinator.storageState = LIVE_DUBBING_STORAGE_STATE.PRESENT;
    coordinator.sessionStates.set(descriptor.sessionId, {
      descriptor,
      leasePromise: null,
      leaseAcquired: false,
      prepared: true,
      terminalRequested: false,
      cleanupCompleted: false,
      providerDiagnostic: null,
      cleanupFacts: null,
    });
    browserAPI.tabs.sendMessage.mockImplementation(async (tabId, message, options) => ({
      success: true,
      ack: 'DISPOSED',
      sessionId: message.data.sessionId,
      providerId: message.data.providerId,
      tabId,
      frameId: options.frameId,
      documentId: options.documentId,
      eventSequence: message.data.eventSequence,
      active: false,
      status: 'IDLE',
    }));

    const result = await coordinator.stop({ data: { sessionId: descriptor.sessionId } });

    expect(result).toMatchObject({ success: true, stopped: true });
    expect(browserAPI.tabs.sendMessage).toHaveBeenCalledOnce();
    expect(browserAPI.tabs.sendMessage.mock.calls[0][1]).toMatchObject({
      action: LIVE_DUBBING_ACTIONS.DISPOSE,
      data: { eventSequence: 3, documentId: 'doc-1' },
    });
    expect(release).not.toHaveBeenCalled();
    expect(storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
  });

  it('recovers the persisted Firefox host without rebinding a newer document', async () => {
    const { browserAPI, storage } = createHarness();
    const descriptor = firefoxDescriptor({ status: LIVE_DUBBING_STATUS.RUNNING, eventSequence: 3 });
    storage.set(LIVE_DUBBING_STORAGE_KEY, descriptor);
    const registration = {
      get: vi.fn(() => ({ tabId: 7, frameId: 0, documentId: 'doc-1' })),
      discover: vi.fn(),
    };
    browserAPI.tabs.sendMessage.mockResolvedValue({
      success: true,
      sessionId: descriptor.sessionId,
      providerId: descriptor.providerId,
      tabId: descriptor.tabId,
      frameId: descriptor.frameId,
      documentId: descriptor.documentId,
      eventSequence: 3,
      runtimeEventSequence: 3,
      active: true,
      prepared: true,
      setupComplete: true,
      status: LIVE_DUBBING_STATUS.RUNNING,
    });
    const coordinator = new LiveDubbingCoordinator({
      browserAPI,
      chromeAPI: {},
      leaseManager: { acquire: vi.fn(), release: vi.fn() },
      runtimeHost: LIVE_DUBBING_RUNTIME_HOSTS.FIREFOX_CONTENT,
      firefoxContentRuntimeRegistration: registration,
      logger: { warn: vi.fn() },
    });

    await expect(coordinator.reconcile()).resolves.toMatchObject({
      success: true,
      recovered: true,
      status: { documentId: 'doc-1', eventSequence: 3 },
    });
    expect(browserAPI.tabs.sendMessage.mock.calls[0][1].action).toBe(LIVE_DUBBING_ACTIONS.STATUS);
    expect(coordinator.leaseManager.acquire).not.toHaveBeenCalled();

    registration.get.mockReturnValue({ tabId: 7, frameId: 0, documentId: 'doc-new' });
    await expect(coordinator.reconcile()).resolves.toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_STALE_DOCUMENT',
      retryable: true,
    });
    expect(storage.get(LIVE_DUBBING_STORAGE_KEY)).toMatchObject({ documentId: 'doc-1' });
  });
});

describe('Firefox reconcile Gemini-only gating (Phase 4 Gate 3b)', () => {
  beforeEach(() => vi.restoreAllMocks());

  function createReconcileHarness({ storedDescriptor }) {
    const storage = new Map([[LIVE_DUBBING_STORAGE_KEY, { ...storedDescriptor }]]);
    const browserAPI = {
      runtime: {
        id: 'extension-id',
        getURL: (path = '') => `chrome-extension://extension-id/${path}`,
        sendMessage: vi.fn(async () => ({ success: true })),
      },
      storage: {
        session: {
          get: vi.fn(async key => ({ [key]: storage.get(key) })),
          set: vi.fn(async record => Object.entries(record).forEach(([key, value]) => storage.set(key, value))),
          remove: vi.fn(async key => storage.delete(key)),
        },
      },
      tabs: {
        sendMessage: vi.fn(),
        query: vi.fn(async () => [{ id: 7, url: 'https://example.test' }]),
        get: vi.fn(async id => ({ id, url: 'https://example.test' })),
      },
    };
    const leaseManager = {
      acquire: vi.fn(async () => true),
      release: vi.fn(async () => true),
    };
    const getMediaStreamId = vi.fn(async () => 'should-not-be-requested');
    const registration = {
      get: vi.fn(() => ({ tabId: 7, frameId: 0, documentId: 'doc-1' })),
      discover: vi.fn(),
    };
    const coordinator = new LiveDubbingCoordinator({
      browserAPI,
      chromeAPI: { tabCapture: { getMediaStreamId } },
      leaseManager,
      runtimeHost: LIVE_DUBBING_RUNTIME_HOSTS.FIREFOX_CONTENT,
      firefoxContentRuntimeRegistration: registration,
      uuid: () => 'openai-firefox-1',
      now: () => 123,
      logger: { warn: vi.fn() },
    });
    return { browserAPI, coordinator, storage, leaseManager, getMediaStreamId, registration };
  }

  function openaiFirefoxDescriptor(overrides = {}) {
    return firefoxDescriptor({
      sessionId: 'openai-firefox-1',
      providerId: LIVE_DUBBING_OPENAI_PROVIDER_ID,
      targetLanguage: 'en-US',
      status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
      eventSequence: 0,
      ...overrides,
    });
  }

  it('routes a persisted OpenAI Firefox descriptor directly to exact DISPOSE without PREPARE/CONNECT, lease, or tabCapture', async () => {
    const descriptor = openaiFirefoxDescriptor();
    const { browserAPI, coordinator, storage, leaseManager, getMediaStreamId } = createReconcileHarness({
      storedDescriptor: descriptor,
    });
    browserAPI.tabs.sendMessage.mockImplementation(async (tabId, message, options) => ({
      success: true,
      ack: 'DISPOSED',
      sessionId: message.data.sessionId,
      providerId: message.data.providerId,
      tabId,
      frameId: options.frameId,
      documentId: options.documentId,
      eventSequence: message.data.eventSequence,
      active: false,
      status: 'IDLE',
    }));

    const result = await coordinator.reconcile();
    const calls = browserAPI.tabs.sendMessage.mock.calls;
    const actions = calls.map(([, message]) => message.action);

    expect(result).toMatchObject({ success: true, stopped: true, status: null, recovered: false });
    expect(actions).toEqual([LIVE_DUBBING_ACTIONS.DISPOSE]);
    expect(calls[0][1]).toMatchObject({
      action: LIVE_DUBBING_ACTIONS.DISPOSE,
      data: {
        sessionId: 'openai-firefox-1',
        providerId: LIVE_DUBBING_OPENAI_PROVIDER_ID,
        tabId: 7,
        frameId: 0,
        documentId: 'doc-1',
        eventSequence: 0,
      },
    });
    expect(calls[0][0]).toBe(7);
    expect(calls[0][2]).toEqual({ frameId: 0, documentId: 'doc-1' });
    expect(leaseManager.acquire).not.toHaveBeenCalled();
    expect(leaseManager.release).not.toHaveBeenCalled();
    expect(getMediaStreamId).not.toHaveBeenCalled();
    expect(browserAPI.runtime.sendMessage).not.toHaveBeenCalled();
    expect(storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
  });

  it('retains the OpenAI Firefox descriptor when DISPOSE is unconfirmed and remains recoverable', async () => {
    const descriptor = openaiFirefoxDescriptor();
    const { browserAPI, coordinator, storage, leaseManager, getMediaStreamId } = createReconcileHarness({
      storedDescriptor: descriptor,
    });
    browserAPI.tabs.sendMessage
      .mockImplementationOnce(async () => ({ success: false, error: 'LIVE_DUBBING_SESSION_DISPOSED' }))
      .mockImplementation(async (tabId, message, options) => ({
        success: true,
        ack: 'DISPOSED',
        sessionId: message.data.sessionId,
        providerId: message.data.providerId,
        tabId,
        frameId: options.frameId,
        documentId: options.documentId,
        eventSequence: message.data.eventSequence,
        active: false,
        status: 'IDLE',
      }));

    const pending = await coordinator.reconcile();
    const pendingActions = browserAPI.tabs.sendMessage.mock.calls.map(([, message]) => message.action);

    expect(pending).toMatchObject({
      success: false,
      error: 'STOP_FAILED',
      retryable: true,
      cleanupPending: true,
      recovered: false,
      status: { sessionId: 'openai-firefox-1', providerId: LIVE_DUBBING_OPENAI_PROVIDER_ID },
    });
    expect(pendingActions).toEqual([LIVE_DUBBING_ACTIONS.DISPOSE]);
    expect(storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(true);
    expect(storage.get(LIVE_DUBBING_STORAGE_KEY)).toMatchObject({
      sessionId: 'openai-firefox-1',
      providerId: LIVE_DUBBING_OPENAI_PROVIDER_ID,
    });
    expect(leaseManager.acquire).not.toHaveBeenCalled();
    expect(leaseManager.release).not.toHaveBeenCalled();
    expect(getMediaStreamId).not.toHaveBeenCalled();

    const recovered = await coordinator.reconcile();
    const allActions = browserAPI.tabs.sendMessage.mock.calls.map(([, message]) => message.action);

    expect(recovered).toMatchObject({ success: true, stopped: true, status: null, recovered: false });
    expect(allActions).toEqual([LIVE_DUBBING_ACTIONS.DISPOSE, LIVE_DUBBING_ACTIONS.DISPOSE]);
    expect(storage.has(LIVE_DUBBING_STORAGE_KEY)).toBe(false);
    expect(leaseManager.acquire).not.toHaveBeenCalled();
    expect(leaseManager.release).not.toHaveBeenCalled();
    expect(getMediaStreamId).not.toHaveBeenCalled();
  });

  it('lets Gemini Firefox reconciliation proceed through PREPARE/CONNECT normally', async () => {
    const descriptor = firefoxDescriptor({
      sessionId: 'session-1',
      providerId: LIVE_DUBBING_PROVIDER_ID,
      targetLanguage: 'en',
      status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
      eventSequence: 0,
    });
    const { browserAPI, coordinator, storage, leaseManager, getMediaStreamId } = createReconcileHarness({
      storedDescriptor: descriptor,
    });
    browserAPI.tabs.sendMessage.mockImplementation(async (tabId, message) => {
      const { data } = message;
      if (message.action === LIVE_DUBBING_ACTIONS.PREPARE) {
        return {
          success: true,
          ack: 'READY',
          sessionId: data.sessionId,
          providerId: data.providerId,
          tabId: data.tabId,
          frameId: data.frameId,
          documentId: data.documentId,
          targetLanguage: data.targetLanguage,
          eventSequence: data.eventSequence,
          runtimeEventSequence: 1,
          prepared: true,
          active: true,
          status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
        };
      }
      if (message.action === LIVE_DUBBING_ACTIONS.CONNECT_PROVIDER) {
        return {
          success: true,
          ack: 'PROVIDER_READY',
          sessionId: data.sessionId,
          providerId: data.providerId,
          tabId: data.tabId,
          frameId: data.frameId,
          documentId: data.documentId,
          targetLanguage: data.targetLanguage,
          eventSequence: data.eventSequence,
          runtimeEventSequence: 3,
          providerReady: true,
          setupComplete: true,
          active: true,
          prepared: true,
          status: LIVE_DUBBING_STATUS.RUNNING,
        };
      }
      return { success: false };
    });

    const result = await coordinator.reconcile();
    const actions = browserAPI.tabs.sendMessage.mock.calls.map(([, message]) => message.action);

    expect(result).toMatchObject({
      success: true,
      recovered: true,
      status: {
        sessionId: 'session-1',
        providerId: LIVE_DUBBING_PROVIDER_ID,
        status: LIVE_DUBBING_STATUS.RUNNING,
        eventSequence: 3,
      },
    });
    expect(actions).toEqual([LIVE_DUBBING_ACTIONS.PREPARE, LIVE_DUBBING_ACTIONS.CONNECT_PROVIDER]);
    expect(leaseManager.acquire).not.toHaveBeenCalled();
    expect(leaseManager.release).not.toHaveBeenCalled();
    expect(getMediaStreamId).not.toHaveBeenCalled();
    expect(storage.get(LIVE_DUBBING_STORAGE_KEY)).toMatchObject({
      sessionId: 'session-1',
      providerId: LIVE_DUBBING_PROVIDER_ID,
      status: LIVE_DUBBING_STATUS.RUNNING,
    });
  });
});
