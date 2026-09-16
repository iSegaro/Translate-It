import { describe, expect, it } from 'vitest';
import {
  LIVE_DUBBING_ACTIONS,
  LIVE_DUBBING_RUNTIME_HOSTS,
} from '../constants.js';
import {
  createDescriptor,
  createFirefoxContentDescriptor,
  isFirefoxContentDescriptor,
  sanitizeDescriptor,
} from '../contracts.js';
import {
  FIREFOX_CONTENT_ACTIONS,
  FIREFOX_CONTENT_FORBIDDEN_KEYS,
  FIREFOX_CONTENT_TARGET,
  createFirefoxContentMessage,
  hasExactFirefoxContentEvent,
  isAuthorizedFirefoxContentControlSender,
  isAuthorizedFirefoxContentSender,
  isExactFirefoxContentResponse,
  isFirefoxContentAction,
  parseFirefoxContentMessage,
  sanitizeFirefoxContentResponse,
} from './firefoxContentContract.js';

const browserAPI = {
  runtime: {
    id: 'extension-id',
    getURL: (path = '') => `chrome-extension://extension-id/${path}`,
  },
};

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

function contentMessage(overrides = {}) {
  return {
    target: FIREFOX_CONTENT_TARGET,
    action: LIVE_DUBBING_ACTIONS.PREPARE,
    data: {
      sessionId: 'session-1',
      providerId: 'gemini',
      tabId: 7,
      frameId: 0,
      documentId: 'doc-1',
      targetLanguage: 'en',
      eventSequence: 0,
      ...overrides,
    },
  };
}

describe('Firefox content contract closed vocabulary', () => {
  it('accepts only the closed PREPARE/STATUS/CONNECT_PROVIDER/DISPOSE vocabulary', () => {
    expect([...FIREFOX_CONTENT_ACTIONS]).toEqual([
      LIVE_DUBBING_ACTIONS.PREPARE,
      LIVE_DUBBING_ACTIONS.STATUS,
      LIVE_DUBBING_ACTIONS.CONNECT_PROVIDER,
      LIVE_DUBBING_ACTIONS.DISPOSE,
    ]);
    expect(isFirefoxContentAction(LIVE_DUBBING_ACTIONS.PREPARE)).toBe(true);
    expect(isFirefoxContentAction(LIVE_DUBBING_ACTIONS.STATUS)).toBe(true);
    expect(isFirefoxContentAction(LIVE_DUBBING_ACTIONS.DISPOSE)).toBe(true);
    expect(isFirefoxContentAction(LIVE_DUBBING_ACTIONS.CONNECT_PROVIDER)).toBe(true);
    expect(isFirefoxContentAction(LIVE_DUBBING_ACTIONS.CONSUME)).toBe(false);
    expect(isFirefoxContentAction(LIVE_DUBBING_ACTIONS.START)).toBe(false);
    expect(parseFirefoxContentMessage(contentMessage({}))).not.toBeNull();
    expect(parseFirefoxContentMessage({
      ...contentMessage(),
      action: LIVE_DUBBING_ACTIONS.CONNECT_PROVIDER,
    })).not.toBeNull();
    expect(parseFirefoxContentMessage({
      ...contentMessage(),
      action: LIVE_DUBBING_ACTIONS.CONSUME,
    })).toBeNull();
    expect(createFirefoxContentMessage(LIVE_DUBBING_ACTIONS.CONNECT_PROVIDER, firefoxDescriptor()))
      .toMatchObject({ action: LIVE_DUBBING_ACTIONS.CONNECT_PROVIDER });
  });

  it('parses exact scalar identity and rejects unknown keys', () => {
    const parsed = parseFirefoxContentMessage(contentMessage());
    expect(parsed).toEqual({
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
    });
    expect(parseFirefoxContentMessage({ ...contentMessage(), target: 'offscreen' })).toBeNull();
    expect(parseFirefoxContentMessage(contentMessage({ unexpected: 1 }))).toBeNull();
    expect(parseFirefoxContentMessage(contentMessage({ eventSequence: '0' }))).toBeNull();
    expect(parseFirefoxContentMessage(contentMessage({ tabId: -1 }))).toBeNull();
    expect(parseFirefoxContentMessage(contentMessage({ documentId: '  ' }))).toBeNull();
    expect(parseFirefoxContentMessage(contentMessage({ providerId: 'unknown' }))).toBeNull();
    expect(parseFirefoxContentMessage(contentMessage({ targetLanguage: 'xx' }))).toBeNull();
  });

  it.each(FIREFOX_CONTENT_FORBIDDEN_KEYS)('rejects forbidden media-adjacent key %s', key => {
    expect(parseFirefoxContentMessage(contentMessage({ [key]: 'media-material' }))).toBeNull();
    expect(parseFirefoxContentMessage({ ...contentMessage(), [key]: 'media-material' })).toBeNull();
    expect(sanitizeFirefoxContentResponse({
      success: true,
      sessionId: 'session-1',
      providerId: 'gemini',
      [key]: 'media-material',
    })).toBeNull();
  });

  it('rejects nested objects and arrays even under allowed names', () => {
    expect(parseFirefoxContentMessage(contentMessage({ targetLanguage: { code: 'en' } }))).toBeNull();
    expect(parseFirefoxContentMessage({
      target: FIREFOX_CONTENT_TARGET,
      action: LIVE_DUBBING_ACTIONS.STATUS,
      data: ['session-1'],
    })).toBeNull();
    expect(sanitizeFirefoxContentResponse({
      success: true,
      sessionId: 'session-1',
      providerId: 'gemini',
      status: { code: 'IDLE' },
    })).toBeNull();
  });

  it('builds exact-addressed messages only from Firefox-owned descriptors', () => {
    const message = createFirefoxContentMessage(LIVE_DUBBING_ACTIONS.STATUS, firefoxDescriptor());
    expect(message).toEqual({
      target: FIREFOX_CONTENT_TARGET,
      action: LIVE_DUBBING_ACTIONS.STATUS,
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        tabId: 7,
        frameId: 0,
        documentId: 'doc-1',
        targetLanguage: 'en',
        eventSequence: 0,
      },
    });
    expect(() => createFirefoxContentMessage(LIVE_DUBBING_ACTIONS.STATUS, createDescriptor({
      sessionId: 'session-1',
      tabId: 7,
      providerId: 'gemini',
      targetLanguage: 'en',
      startedAt: 123,
    }))).toThrow('Firefox content descriptor is required');
  });

  it('matches exact session/provider/tab/frame/document/sequence events', () => {
    const descriptor = firefoxDescriptor();
    expect(hasExactFirefoxContentEvent(parseFirefoxContentMessage(contentMessage()), descriptor)).toBe(true);
    expect(hasExactFirefoxContentEvent(parseFirefoxContentMessage(contentMessage({ sessionId: 'other' })), descriptor)).toBe(false);
    expect(hasExactFirefoxContentEvent(parseFirefoxContentMessage(contentMessage({ providerId: 'openai' })), descriptor)).toBe(false);
    expect(hasExactFirefoxContentEvent(parseFirefoxContentMessage(contentMessage({ eventSequence: 1 })), descriptor)).toBe(false);
    expect(hasExactFirefoxContentEvent(parseFirefoxContentMessage(contentMessage({ tabId: 8 })), descriptor)).toBe(false);
    expect(hasExactFirefoxContentEvent(parseFirefoxContentMessage(contentMessage({ frameId: 1 })), descriptor)).toBe(false);
    expect(hasExactFirefoxContentEvent(parseFirefoxContentMessage(contentMessage({ documentId: 'doc-2' })), descriptor)).toBe(false);
  });

  it('sanitizes responses to scalar allowlisted fields with allowlisted errors', () => {
    const sanitized = sanitizeFirefoxContentResponse({
      success: true,
      ack: 'READY',
      status: 'PREPARING_CAPTURE',
      sessionId: 'session-1',
      providerId: 'gemini',
      tabId: 7,
      frameId: 0,
      documentId: 'doc-1',
      targetLanguage: 'en',
      eventSequence: 0,
      active: true,
      prepared: true,
    });
    expect(sanitized).toEqual({
      success: true,
      ack: 'READY',
      status: 'PREPARING_CAPTURE',
      sessionId: 'session-1',
      providerId: 'gemini',
      tabId: 7,
      frameId: 0,
      documentId: 'doc-1',
      targetLanguage: 'en',
      eventSequence: 0,
      active: true,
      prepared: true,
    });
    // Unknown keys fail the response closed rather than passing through.
    expect(sanitizeFirefoxContentResponse({
      success: true,
      sessionId: 'session-1',
      providerId: 'gemini',
      unknownFutureField: 'dropped',
    })).toBeNull();
    expect(sanitizeFirefoxContentResponse({
      success: false,
      error: 'LIVE_DUBBING_SESSION_MISMATCH',
      sessionId: 'session-1',
      providerId: 'gemini',
    })).toMatchObject({ success: false, error: 'LIVE_DUBBING_SESSION_MISMATCH' });
    expect(sanitizeFirefoxContentResponse({
      success: false,
      error: 'SOME_NEW_ERROR',
      sessionId: 'session-1',
      providerId: 'gemini',
    })).toBeNull();
    expect(sanitizeFirefoxContentResponse({ success: 'yes', sessionId: 'session-1' })).toBeNull();

    expect(sanitizeFirefoxContentResponse({
      success: true,
      ack: 'PROVIDER_READY',
      status: 'RUNNING',
      sessionId: 'session-1',
      providerId: 'gemini',
      tabId: 7,
      frameId: 0,
      documentId: 'doc-1',
      eventSequence: 2,
      runtimeEventSequence: 3,
      providerReady: true,
      setupComplete: true,
    })).toMatchObject({
      ack: 'PROVIDER_READY',
      runtimeEventSequence: 3,
      providerReady: true,
      setupComplete: true,
    });
    expect(parseFirefoxContentMessage({
      ...contentMessage(),
      data: { ...contentMessage().data, apiKey: 'long-lived-key' },
    })).toBeNull();
    expect(sanitizeFirefoxContentResponse({
      success: true,
      sessionId: 'session-1',
      providerId: 'gemini',
      accessToken: 'ephemeral-token',
    })).toBeNull();
  });

  it('never treats an inexact response as a success', () => {
    const descriptor = firefoxDescriptor();
    const exact = sanitizeFirefoxContentResponse({
      success: true,
      ack: 'READY',
      sessionId: 'session-1',
      providerId: 'gemini',
      tabId: 7,
      frameId: 0,
      documentId: 'doc-1',
      eventSequence: 0,
      status: 'PREPARING_CAPTURE',
    });
    expect(isExactFirefoxContentResponse(exact, descriptor)).toBe(true);
    expect(isExactFirefoxContentResponse({ ...exact, documentId: 'doc-2' }, descriptor)).toBe(false);
    expect(isExactFirefoxContentResponse({ ...exact, frameId: 2 }, descriptor)).toBe(false);
    expect(isExactFirefoxContentResponse({ ...exact, sessionId: 'other' }, descriptor)).toBe(false);
    expect(isExactFirefoxContentResponse({ ...exact, eventSequence: 9 }, descriptor)).toBe(false);
    const missingSequence = { ...exact };
    delete missingSequence.eventSequence;
    expect(isExactFirefoxContentResponse(missingSequence, descriptor)).toBe(false);
    expect(isExactFirefoxContentResponse(null, descriptor)).toBe(false);
  });
});

describe('Firefox content sender authorization', () => {
  it('authorizes only tab-bound content senders for the Firefox namespace', () => {
    const contentSender = { id: 'extension-id', tab: { id: 7 }, frameId: 0 };
    expect(isAuthorizedFirefoxContentSender(contentSender, browserAPI)).toBe(true);
    // Offscreen senders carry no tab and must never enter this namespace.
    expect(isAuthorizedFirefoxContentSender({
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    }, browserAPI)).toBe(false);
    expect(isAuthorizedFirefoxContentSender({ id: 'other-id', tab: { id: 7 } }, browserAPI)).toBe(false);
    expect(isAuthorizedFirefoxContentSender({ id: 'extension-id', tab: { id: -1 } }, browserAPI)).toBe(false);
  });

  it('authorizes only the Background service worker at the host ingress', () => {
    expect(isAuthorizedFirefoxContentControlSender({ id: 'extension-id' }, browserAPI)).toBe(true);
    expect(isAuthorizedFirefoxContentControlSender(
      { id: 'extension-id', tab: { id: 7 }, frameId: 0 },
      browserAPI,
    )).toBe(false);
    expect(isAuthorizedFirefoxContentControlSender({ id: 'other-id' }, browserAPI)).toBe(false);
    expect(isAuthorizedFirefoxContentControlSender(null, browserAPI)).toBe(false);
  });
});

describe('Firefox descriptor identity fencing', () => {
  it('defaults legacy descriptors to offscreen ownership', () => {
    const descriptor = createDescriptor({
      sessionId: 'session-1',
      tabId: 7,
      providerId: 'gemini',
      targetLanguage: 'en',
      startedAt: 123,
    });
    expect(descriptor.runtimeHost).toBe(LIVE_DUBBING_RUNTIME_HOSTS.OFFSCREEN);
    expect(isFirefoxContentDescriptor(descriptor)).toBe(false);
    expect(sanitizeDescriptor({ ...descriptor, runtimeHost: undefined }).runtimeHost)
      .toBe(LIVE_DUBBING_RUNTIME_HOSTS.OFFSCREEN);
  });

  it('persists exact Firefox frame/document identity and rejects inexact sets', () => {
    const descriptor = firefoxDescriptor();
    expect(isFirefoxContentDescriptor(descriptor)).toBe(true);
    expect(sanitizeDescriptor(descriptor)).toEqual(descriptor);
    expect(sanitizeDescriptor({ ...descriptor, frameId: undefined })).toBeNull();
    expect(sanitizeDescriptor({ ...descriptor, documentId: '  ' })).toBeNull();
    expect(sanitizeDescriptor({ ...descriptor, runtimeHost: 'content-mesh' })).toBeNull();
    expect(sanitizeDescriptor({ ...descriptor, runtimeHost: 'offscreen' }).runtimeHost).toBe('offscreen');
    expect(() => createFirefoxContentMessage(LIVE_DUBBING_ACTIONS.PREPARE, sanitizeDescriptor({
      ...descriptor,
      runtimeHost: 'offscreen',
    }))).toThrow();
  });

  it('validates Firefox descriptor construction closed', () => {
    expect(() => firefoxDescriptor({ frameId: -1 })).toThrow('frameId is required');
    expect(() => firefoxDescriptor({ documentId: '' })).toThrow('documentId is required');
    expect(() => firefoxDescriptor({ providerId: 'unknown' })).toThrow();
  });
});
