import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveDubbingCoordinator } from '../background/LiveDubbingCoordinator.js';
import {
  LIVE_DUBBING_ACTIONS,
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

function firefoxDescriptor(overrides = {}) {
  return createFirefoxContentDescriptor({
    sessionId: 'session-1',
    tabId: 7,
    frameId: 0,
    documentId: 'doc-1',
    providerId: 'gemini',
    targetLanguage: 'en',
    startedAt: 123,
    ...overrides,
  });
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

  it('scaffolds the Firefox bootstrap route with exact-session validation only', () => {
    const { coordinator } = createHarness();
    const descriptor = seedFirefoxSession(coordinator);
    const sender = { id: 'extension-id', tab: { id: 7 }, frameId: 0, url: 'https://example.test/' };
    const request = {
      action: LIVE_DUBBING_ACTIONS.REQUEST_PROVIDER_BOOTSTRAP,
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        targetLanguage: 'en',
        eventSequence: 0,
        tabId: 7,
        frameId: 0,
        documentId: 'doc-1',
      },
    };

    const authorized = coordinator.authorizeFirefoxContentBootstrapRequest(request, sender);
    expect(authorized).toEqual(descriptor);
    // No bootstrap payload, secret, or token crosses the scaffold.
    expect(authorized).not.toHaveProperty('bootstrap');
    expect(JSON.stringify(authorized)).not.toContain('secret');
    // Validation-only: repeated validation preserves one-time bootstrap
    // eligibility instead of consuming it (reservation belongs to Phase 3).
    expect(coordinator.authorizeFirefoxContentBootstrapRequest(request, sender)).toEqual(descriptor);
    expect(coordinator.authorizeFirefoxContentBootstrapRequest(request, sender)).toEqual(descriptor);
    expect(coordinator.bootstrapRequestSessions.has('session-1')).toBe(false);
  });

  it('rejects inexact Firefox bootstrap scaffolds', () => {
    const { coordinator } = createHarness();
    seedFirefoxSession(coordinator);
    const sender = { id: 'extension-id', tab: { id: 7 }, frameId: 0 };
    const base = {
      action: LIVE_DUBBING_ACTIONS.REQUEST_PROVIDER_BOOTSTRAP,
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        targetLanguage: 'en',
        eventSequence: 0,
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
});
