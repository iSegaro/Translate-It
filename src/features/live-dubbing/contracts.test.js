import { describe, expect, it } from 'vitest';
import {
  createLiveDubbingCleanupDiagnostic,
  createDescriptor,
  createOriginalVolumeMessage,
  createOriginalVolumeQueryMessage,
  createPrepareMessage,
  normalizeLiveDubbingVolume,
  createLiveDubbingProviderDiagnostic,
  createLiveDubbingTranslatedTranscript,
  createLiveDubbingTranslatedTranscriptMessage,
  createLiveDubbingTranscriptClearMessage,
  createProviderBootstrapRequest,
  createProviderBootstrapResponse,
  createSessionMessage,
  hasExactSessionEvent,
  isAuthorizedOffscreenRouterSender,
  isAuthorizedLiveDubbingOffscreenControlSender,
  isAuthorizedOffscreenSender,
  isExactSessionResponse,
  isLiveDubbingProviderId,
  isLiveDubbingAudioMode,
  isTrustedLiveDubbingUiSender,
  normalizeProviderTargetLanguage,
  normalizeOpenAITargetLanguage,
  sanitizeLiveDubbingTerminalOutcome,
  sanitizeLiveDubbingProviderDiagnostic,
  sanitizeLiveDubbingTranslatedTranscript,
  isValidLiveDubbingTranscriptSequence,
  sanitizeDescriptor,
  sanitizeLiveDubbingCleanupDiagnostic,
  toPublicLiveDubbingTerminalOutcome,
} from './contracts.js';
import {
  LIVE_DUBBING_ACTION_TIMEOUTS,
  LIVE_DUBBING_ACTIONS,
  LIVE_DUBBING_OFFSCREEN_ACTIONS,
  LIVE_DUBBING_STATUS,
  LIVE_DUBBING_TIMEOUTS,
  LIVE_DUBBING_TRANSLATED_TRANSCRIPT_MAX_LENGTH,
} from './constants.js';

const browserAPI = {
  runtime: {
    id: 'extension-id',
    getURL: (path = '') => `chrome-extension://extension-id/${path}`,
  },
};

describe('live dubbing Stage 2 contracts', () => {
  it('keeps provider language policies independent', () => {
    expect(normalizeProviderTargetLanguage('gemini', 'zh-Hans')).toBe('zh-Hans');
    expect(normalizeProviderTargetLanguage('openai', 'de-DE')).toBe('de-DE');

    // de-DE is intentionally valid for OpenAI but outside Gemini's finite
    // canonical map; an OpenAI-shaped tag must not widen Gemini support.
    expect(() => normalizeProviderTargetLanguage('gemini', 'de-DE'))
      .toThrow('Unsupported target language');
    expect(() => normalizeProviderTargetLanguage('openai', 'de_DE'))
      .toThrow('Unsupported target language');
  });

  it('accepts only the Phase F provider identities', () => {
    expect(isLiveDubbingProviderId('gemini')).toBe(true);
    expect(isLiveDubbingProviderId('openai')).toBe(true);
    expect(isLiveDubbingProviderId('')).toBe(false);
    expect(isLiveDubbingProviderId('unknown')).toBe(false);
    expect(isLiveDubbingProviderId(null)).toBe(false);
  });

  it.each([
    ['es', 'es'],
    [' en-US ', 'en-US'],
    ['zh-Hant', 'zh-Hant'],
  ])('normalizes OpenAI language %s with its own policy', (input, expected) => {
    expect(normalizeOpenAITargetLanguage(input)).toBe(expected);
    expect(normalizeProviderTargetLanguage('openai', input)).toBe(expected);
  });

  it.each(['', '!!', 'english language', 'en_US', 'a'])('rejects unsupported OpenAI language %s', language => {
    expect(() => normalizeProviderTargetLanguage('openai', language)).toThrow('Unsupported target language');
  });

  it('does not apply a language policy to unknown providers', () => {
    expect(() => normalizeProviderTargetLanguage('unknown', 'en')).toThrow('Unsupported live dubbing provider');
  });
  it.each([
    ['af', 'af'],
    ['sq', 'sq'],
    ['az', 'az'],
    ['be', 'be'],
    ['ca', 'ca'],
    ['ml', 'ml'],
    ['kn', 'kn'],
    ['mr', 'mr'],
    ['ne', 'ne'],
    ['pa', 'pa'],
    ['si', 'si'],
    ['kk', 'kk'],
    ['uz', 'uz'],
    ['zh-cn', 'zh-Hans'],
    ['zh-tw', 'zh-Hant'],
    ['fil', 'fil'],
  ])('maps supported Gemini language %s to %s', (input, expected) => {
    expect(normalizeProviderTargetLanguage('gemini', input)).toBe(expected);
  });

  it.each([
    'pt', 'tl', 'yue', 'lzh', 'ps', 'or', 'xx',
    'en-US', 'en-GB', 'zh-HK', 'sr-Latn', 'fil-PH',
  ])(
    'rejects unsupported Gemini language %s before descriptor creation',
    (language) => {
      expect(() => createDescriptor({
        sessionId: 'session-1',
        tabId: 1,
        providerId: 'gemini',
        targetLanguage: language,
        startedAt: 1,
      })).toThrow('Unsupported target language');
    },
  );

  it('keeps public descriptors free of internal capture and bootstrap fields', () => {
    const descriptor = sanitizeDescriptor({
      sessionId: 'session-1',
      tabId: 1,
      providerId: 'gemini',
      targetLanguage: 'zh-cn',
      status: LIVE_DUBBING_STATUS.RUNNING,
      startedAt: 1,
      lastError: null,
      eventSequence: 1,
      apiKey: 'secret-key',
      streamId: 'stream-secret',
    });

    expect(descriptor).toEqual({
      sessionId: 'session-1',
      tabId: 1,
      providerId: 'gemini',
      targetLanguage: 'zh-Hans',
      status: LIVE_DUBBING_STATUS.RUNNING,
      startedAt: 1,
      lastError: null,
      eventSequence: 1,
    });
  });

  it.each([0, 1])('builds an exact original-volume message for %s', volume => {
    const descriptor = {
      sessionId: 'session-1',
      providerId: 'gemini',
      eventSequence: 4,
      status: LIVE_DUBBING_STATUS.RUNNING,
      targetLanguage: 'en',
    };
    const snapshot = { ...descriptor };

    expect(createOriginalVolumeMessage(descriptor, volume)).toEqual({
      target: 'offscreen',
      action: LIVE_DUBBING_ACTIONS.SET_ORIGINAL_VOLUME_OFFSCREEN,
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        eventSequence: 4,
        volume,
      },
    });
    expect(descriptor).toEqual(snapshot);
    expect(LIVE_DUBBING_OFFSCREEN_ACTIONS).toContain(LIVE_DUBBING_ACTIONS.SET_ORIGINAL_VOLUME_OFFSCREEN);
    expect(LIVE_DUBBING_OFFSCREEN_ACTIONS).not.toContain(LIVE_DUBBING_ACTIONS.SET_ORIGINAL_VOLUME);
  });

  it.each([null, '0.5', Number.NaN, Number.POSITIVE_INFINITY, -0.01, 1.01, undefined])(
    'rejects invalid original volume %p',
    volume => {
      expect(() => createOriginalVolumeMessage({
        sessionId: 'session-1',
        providerId: 'gemini',
        eventSequence: 4,
      }, volume)).toThrow();
    },
  );

  it.each([
    [0, 0, 0], [1, 1, 1], [0.4, 0.25, 0.4],
    [-0.5, 0, 0], [1.5, 0, 0], [Number.NaN, 0, 0],
    [Number.POSITIVE_INFINITY, 1, 1], [Number.NEGATIVE_INFINITY, 1, 1],
    ['0.5', 0, 0], ['0.5', 1, 1], [null, 0, 0], [null, 1, 1],
    [undefined, 0, 0], [undefined, 1, 1], [{}, 0, 0], [[], 1, 1],
  ])('normalizes live-dubbing volume %p to %p with fallback %p', (value, fallback, expected) => {
    expect(normalizeLiveDubbingVolume(value, fallback)).toBe(expected);
  });

  it('carries normalized initial volumes on the prepare message', () => {
    const descriptor = {
      sessionId: 'session-1',
      tabId: 42,
      providerId: 'gemini',
      targetLanguage: 'en',
      eventSequence: 0,
    };

    expect(createPrepareMessage(descriptor, { originalVolume: 0.4, dubbedVolume: 0.9 })).toMatchObject({
      target: 'offscreen',
      action: LIVE_DUBBING_ACTIONS.PREPARE,
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        eventSequence: 0,
        originalVolume: 0.4,
        dubbedVolume: 0.9,
      },
    });
    expect(createPrepareMessage(descriptor)).toMatchObject({
      data: { originalVolume: 0, dubbedVolume: 1 },
    });
    expect(createPrepareMessage(descriptor, { originalVolume: 'loud', dubbedVolume: 7 })).toMatchObject({
      data: { originalVolume: 0, dubbedVolume: 1 },
    });
  });

  it('builds an exact original-volume query message without a volume payload', () => {
    const descriptor = {
      sessionId: 'session-1',
      providerId: 'gemini',
      eventSequence: 4,
      status: LIVE_DUBBING_STATUS.RUNNING,
      targetLanguage: 'en',
    };
    const snapshot = { ...descriptor };

    expect(createOriginalVolumeQueryMessage(descriptor)).toEqual({
      target: 'offscreen',
      action: LIVE_DUBBING_ACTIONS.GET_ORIGINAL_VOLUME_OFFSCREEN,
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        eventSequence: 4,
      },
    });
    expect(descriptor).toEqual(snapshot);
    expect(LIVE_DUBBING_OFFSCREEN_ACTIONS).toContain(LIVE_DUBBING_ACTIONS.GET_ORIGINAL_VOLUME_OFFSCREEN);
    expect(LIVE_DUBBING_OFFSCREEN_ACTIONS).not.toContain(LIVE_DUBBING_ACTIONS.GET_ORIGINAL_VOLUME);
  });

  it('sanitizes an OpenAI descriptor while retaining its immutable identity tuple', () => {
    const descriptor = sanitizeDescriptor({
      sessionId: 'session-openai',
      tabId: 7,
      providerId: 'openai',
      targetLanguage: 'en-US',
      status: LIVE_DUBBING_STATUS.RUNNING,
      startedAt: 123,
      lastError: null,
      eventSequence: 3,
      sdp: 'private-sdp',
      transcript: 'private transcript',
    });

    expect(descriptor).toEqual({
      sessionId: 'session-openai',
      tabId: 7,
      providerId: 'openai',
      targetLanguage: 'en-US',
      status: LIVE_DUBBING_STATUS.RUNNING,
      startedAt: 123,
      lastError: null,
      eventSequence: 3,
    });
    expect(JSON.stringify(descriptor)).not.toContain('private');
  });

  it('rejects persisted descriptors without an explicit provider identity', () => {
    expect(sanitizeDescriptor({
      sessionId: 'session-1',
      tabId: 1,
      targetLanguage: 'en',
      status: LIVE_DUBBING_STATUS.RUNNING,
      startedAt: 1,
      lastError: null,
      eventSequence: 1,
    })).toBeNull();
  });

  it('redacts provider diagnostics to the exact flat scalar DTO', () => {
    const diagnostic = sanitizeLiveDubbingProviderDiagnostic({
      stage: 'REMOTE_ERROR',
      code: 'GEMINI_LIVE_REMOTE_ERROR',
      closeCode: 1006,
      wasClean: false,
      terminalCategory: 'REMOTE_ERROR',
      malformedAt: 'JSON_PARSE',
      wsOpen: true,
      setupSent: true,
      setupComplete: false,
      message: 'provider-body-secret',
      url: 'wss://example.test/secret',
      key: 'secret-key',
      pcm: 'AQ==',
      transcript: 'private transcript',
      streamId: 'stream-secret',
      error: new Error('provider error'),
    });

    expect(diagnostic).toEqual({
      stage: 'CONNECT_PROVIDER',
      code: 'GEMINI_LIVE_REMOTE_ERROR',
      closeCode: 1006,
      wasClean: false,
      terminalCategory: 'REMOTE_ERROR',
      malformedAt: null,
      wsOpen: true,
      setupSent: true,
      setupComplete: false,
    });
    expect(Object.keys(diagnostic)).toEqual([
      'stage',
      'code',
      'closeCode',
      'wasClean',
      'terminalCategory',
      'malformedAt',
      'wsOpen',
      'setupSent',
      'setupComplete',
    ]);
    expect(JSON.stringify(diagnostic)).not.toContain('secret');
  });

  it('fails closed for unsafe provider diagnostic scalar values', () => {
    expect(createLiveDubbingProviderDiagnostic({
      code: 'bad code',
      closeCode: Number.POSITIVE_INFINITY,
      wasClean: 'false',
      terminalCategory: 'bad/category',
      malformedAt: 'ARBITRARY_BRANCH',
      wsOpen: 1,
      setupSent: null,
      setupComplete: {},
    })).toEqual({
      stage: 'CONNECT_PROVIDER',
      code: null,
      closeCode: null,
      wasClean: null,
      terminalCategory: null,
      malformedAt: null,
      wsOpen: false,
      setupSent: false,
      setupComplete: false,
    });
  });

  it('keeps terminal outcomes scalar, bounded, and separate from descriptors', () => {
    const outcome = sanitizeLiveDubbingTerminalOutcome({
      sourceSessionId: 'session-1',
      providerId: 'gemini',
      error: 'GEMINI_LIVE_REMOTE_ERROR',
      occurredAt: 123,
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
      payload: 'private-payload',
    });

    expect(outcome).toBeNull();

    const valid = sanitizeLiveDubbingTerminalOutcome({
      sourceSessionId: 'session-1',
      providerId: 'gemini',
      error: 'GEMINI_LIVE_REMOTE_ERROR',
      occurredAt: 123,
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
    });

    expect(valid).toEqual({
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
    expect(toPublicLiveDubbingTerminalOutcome(valid)).toEqual({
      providerId: 'gemini',
      error: 'GEMINI_LIVE_REMOTE_ERROR',
      occurredAt: 123,
      providerDiagnostic: valid.providerDiagnostic,
    });
    expect(toPublicLiveDubbingTerminalOutcome(valid)).not.toHaveProperty('sourceSessionId');
  });

  it('accepts symbolic OpenAI data-channel failure codes', () => {
    expect(sanitizeLiveDubbingTerminalOutcome({
      sourceSessionId: 'session-openai',
      providerId: 'openai',
      error: 'OPENAI_REALTIME_DATA_CHANNEL_FAILED',
      occurredAt: 123,
    })).toMatchObject({
      providerId: 'openai',
      error: 'OPENAI_REALTIME_DATA_CHANNEL_FAILED',
    });
  });

  it.each([
    new Error('private error'),
    { sourceSessionId: 'session-1', providerId: 'gemini', error: 'https://secret.test', occurredAt: 1 },
    { sourceSessionId: 'session-1', providerId: 'gemini', error: 'SECRET_KEY', occurredAt: 1 },
    { sourceSessionId: 'session-1', providerId: 'gemini', error: 'MEDIA_STREAM_ID', occurredAt: 1 },
    { sourceSessionId: 'session-1', providerId: 'gemini', error: { message: 'private' }, occurredAt: 1 },
    { sourceSessionId: 'session-1', providerId: 'gemini', error: 'ERROR', occurredAt: Infinity },
  ])('rejects unsafe terminal outcome %s', value => {
    expect(sanitizeLiveDubbingTerminalOutcome(value)).toBeNull();
  });

  it('accepts only the fixed malformed branch enum for malformed failures', () => {
    expect(createLiveDubbingProviderDiagnostic({
      code: 'GEMINI_LIVE_MALFORMED_MESSAGE',
      terminalCategory: 'MALFORMED_MESSAGE',
      malformedAt: 'TOOL_CALL_CANCELLATION_SHAPE',
    }).malformedAt).toBe('TOOL_CALL_CANCELLATION_SHAPE');
    expect(createLiveDubbingProviderDiagnostic({
      code: 'GEMINI_LIVE_MALFORMED_MESSAGE',
      malformedAt: 'BINARY_BLOB_MESSAGE',
    }).malformedAt).toBe('BINARY_BLOB_MESSAGE');
    expect(createLiveDubbingProviderDiagnostic({
      code: 'GEMINI_LIVE_MALFORMED_MESSAGE',
      malformedAt: 'BINARY_UTF8_DECODE',
    }).malformedAt).toBe('BINARY_UTF8_DECODE');
    expect(createLiveDubbingProviderDiagnostic({
      code: 'GEMINI_LIVE_MALFORMED_MESSAGE',
      malformedAt: 'EMPTY_MESSAGE_OBJECT',
    }).malformedAt).toBe('EMPTY_MESSAGE_OBJECT');
  });

  it('sanitizes cleanup diagnostics to the exact scalar allowlist', () => {
    const diagnostic = sanitizeLiveDubbingCleanupDiagnostic({
      cleanupCause: 'EXPLICIT_DISPOSE',
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
      data: 'AQ==',
      rawError: new Error('private error'),
    });

    expect(diagnostic).toEqual({
      cleanupCause: 'EXPLICIT_DISPOSE',
      capturedFrames: 7,
      inputSentFrames: 3,
      inputPendingFrames: 2,
      providerLastSendReason: 'BACKPRESSURE',
      providerAudioChunks: 4,
      playbackAccepted: false,
      outputSafetyDrops: 1,
      interruptions: 6,
      providerTerminalCategory: 'PROVIDER_ERROR',
    });
    expect(Object.keys(diagnostic)).toEqual([
      'cleanupCause',
      'capturedFrames',
      'inputSentFrames',
      'inputPendingFrames',
      'providerLastSendReason',
      'providerAudioChunks',
      'playbackAccepted',
      'outputSafetyDrops',
      'interruptions',
      'providerTerminalCategory',
    ]);
    expect(JSON.stringify(diagnostic)).not.toContain('secret');
    expect(JSON.stringify(diagnostic)).not.toContain('AQ==');
    expect(JSON.stringify(diagnostic)).not.toContain('private error');

    expect(createLiveDubbingCleanupDiagnostic({
      cleanupCause: 'stream-secret',
      capturedFrames: Number.POSITIVE_INFINITY,
      providerLastSendReason: 'provider-secret',
      providerTerminalCategory: 'session-secret',
      playbackAccepted: 'true',
    })).toEqual({
      cleanupCause: 'EXPLICIT_DISPOSE',
      capturedFrames: 0,
      inputSentFrames: 0,
      inputPendingFrames: 0,
      providerLastSendReason: null,
      providerAudioChunks: 0,
      playbackAccepted: false,
      outputSafetyDrops: 0,
      interruptions: 0,
      providerTerminalCategory: null,
    });
  });

  it('requires same-runtime internal senders without a tab', () => {
    const base = {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    };

    expect(isAuthorizedOffscreenSender(base, browserAPI)).toBe(true);
    expect(isAuthorizedOffscreenSender({ ...base, id: 'other' }, browserAPI)).toBe(false);
    expect(isAuthorizedOffscreenSender({ ...base, tab: { id: 4 } }, browserAPI)).toBe(false);
    expect(isAuthorizedOffscreenSender({ ...base, url: 'chrome-extension://extension-id/popup.html' }, browserAPI)).toBe(false);
    expect(isAuthorizedOffscreenRouterSender({
      ...base,
      url: 'chrome-extension://extension-id/background.js',
    }, browserAPI)).toBe(true);
  });

  it('rejects bootstrap-capable Offscreen senders when sender.url is missing', () => {
    expect(isAuthorizedOffscreenSender({ id: 'extension-id' }, browserAPI)).toBe(false);
  });

  it('restricts live-dubbing offscreen control to Background/SW senders', () => {
    // Accepted: Service Worker shapes carry no document context (no URL, or
    // background page URL without document/frame metadata).
    expect(isAuthorizedLiveDubbingOffscreenControlSender({ id: 'extension-id' }, browserAPI)).toBe(true);
    expect(isAuthorizedLiveDubbingOffscreenControlSender({
      id: 'extension-id',
      url: 'chrome-extension://extension-id/background.js',
    }, browserAPI)).toBe(true);

    // Rejected: UI documents always carry browser-generated documentId on
    // supported Chromium, which positively identifies a document sender.
    for (const page of ['popup.html', 'sidepanel.html', 'options.html']) {
      expect(isAuthorizedLiveDubbingOffscreenControlSender({
        id: 'extension-id',
        url: `chrome-extension://extension-id/src/html/${page}`,
        documentId: `doc-${page}`,
      }, browserAPI)).toBe(false);
      expect(isAuthorizedLiveDubbingOffscreenControlSender({
        id: 'extension-id',
        url: `chrome-extension://extension-id/src/html/${page}`,
        tab: { id: 42 },
        frameId: 0,
        documentId: `doc-${page}-tab`,
      }, browserAPI)).toBe(false);
    }

    // Rejected: offscreen-self control invocation carries document metadata.
    expect(isAuthorizedLiveDubbingOffscreenControlSender({
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
      documentId: 'doc-offscreen',
    }, browserAPI)).toBe(false);

    // Rejected: content-script/tab and foreign senders.
    expect(isAuthorizedLiveDubbingOffscreenControlSender({
      id: 'extension-id',
      url: 'https://example.test/page',
      tab: { id: 1 },
      frameId: 0,
      documentId: 'doc-content',
    }, browserAPI)).toBe(false);
    expect(isAuthorizedLiveDubbingOffscreenControlSender({
      id: 'other-extension',
      url: 'chrome-extension://other-extension/background.js',
    }, browserAPI)).toBe(false);

    // Fail closed: missing/malformed sender metadata.
    expect(isAuthorizedLiveDubbingOffscreenControlSender(undefined, browserAPI)).toBe(false);
    expect(isAuthorizedLiveDubbingOffscreenControlSender(null, browserAPI)).toBe(false);
    expect(isAuthorizedLiveDubbingOffscreenControlSender({}, browserAPI)).toBe(false);
    expect(isAuthorizedLiveDubbingOffscreenControlSender({ id: 'extension-id', tab: { id: 1 } }, browserAPI)).toBe(false);
    expect(isAuthorizedLiveDubbingOffscreenControlSender({ id: 'extension-id', url: 'not a valid url %%' }, browserAPI)).toBe(false);
  });

  it('proves control auth depends on document context, not UI path recognition', () => {
    // Unknown same-extension paths the codebase never allowlists or denylists
    // are still rejected once they carry document metadata.
    for (const path of ['src/html/arbitrary.html', 'src/html/brand-new-page.html']) {
      expect(isAuthorizedLiveDubbingOffscreenControlSender({
        id: 'extension-id',
        url: `chrome-extension://extension-id/${path}`,
        documentId: 'doc-arbitrary',
      }, browserAPI)).toBe(false);
    }

    // Frame-bound senders are rejected even with a trusted id and origin.
    expect(isAuthorizedLiveDubbingOffscreenControlSender({
      id: 'extension-id',
      url: 'chrome-extension://extension-id/background.js',
      frameId: 0,
    }, browserAPI)).toBe(false);

    // Non-document SW shapes stay accepted regardless of URL presence.
    expect(isAuthorizedLiveDubbingOffscreenControlSender({ id: 'extension-id' }, browserAPI)).toBe(true);
    expect(isAuthorizedLiveDubbingOffscreenControlSender({
      id: 'extension-id',
      url: 'chrome-extension://extension-id/background.js',
    }, browserAPI)).toBe(true);
  });

  it('fails closed when the exact Offscreen URL cannot be resolved', () => {
    expect(isAuthorizedOffscreenSender({
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    }, {
      runtime: { id: 'extension-id' },
    })).toBe(false);
  });

  it('restricts public commands to extension UI documents', () => {
    expect(isTrustedLiveDubbingUiSender({
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/popup.html',
    }, browserAPI)).toBe(true);
    expect(isTrustedLiveDubbingUiSender({
      id: 'extension-id',
      url: 'https://example.test/page',
      tab: { id: 1 },
    }, browserAPI)).toBe(false);
    expect(isTrustedLiveDubbingUiSender({
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
    }, browserAPI)).toBe(false);
  });

  it('accepts tab-bound trusted UI documents by exact path, never by origin alone', () => {
    // Real sender shapes: Options opened in a normal browser tab carries
    // sender.tab; Sidepanel can too. Both must be accepted.
    expect(isTrustedLiveDubbingUiSender({
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/options.html',
      tab: { id: 42 },
    }, browserAPI)).toBe(true);
    expect(isTrustedLiveDubbingUiSender({
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/sidepanel.html',
      tab: { id: 7 },
    }, browserAPI)).toBe(true);
    expect(isTrustedLiveDubbingUiSender({
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/popup.html',
      tab: { id: 9 },
    }, browserAPI)).toBe(true);
    expect(isTrustedLiveDubbingUiSender({
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/options.html#api',
      tab: { id: 42 },
    }, browserAPI)).toBe(true);

    // Rejections: content scripts (tab-bound or not), arbitrary extension
    // pages (even tab-bound), offscreen, background/SW (no URL), external
    // extensions, missing identity, missing URL, wrong runtime id.
    expect(isTrustedLiveDubbingUiSender({
      id: 'extension-id',
      url: 'https://example.test/page',
      tab: { id: 42 },
    }, browserAPI)).toBe(false);
    expect(isTrustedLiveDubbingUiSender({
      id: 'extension-id',
      url: 'https://example.test/page',
    }, browserAPI)).toBe(false);
    expect(isTrustedLiveDubbingUiSender({
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/other.html',
      tab: { id: 42 },
    }, browserAPI)).toBe(false);
    expect(isTrustedLiveDubbingUiSender({
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/other.html',
    }, browserAPI)).toBe(false);
    expect(isTrustedLiveDubbingUiSender({
      id: 'extension-id',
      url: 'chrome-extension://extension-id/popup.html',
      tab: { id: 42 },
    }, browserAPI)).toBe(false);
    expect(isTrustedLiveDubbingUiSender({
      id: 'extension-id',
      url: 'chrome-extension://extension-id/',
    }, browserAPI)).toBe(false);
    expect(isTrustedLiveDubbingUiSender({
      id: 'extension-id',
      url: 'chrome-extension://extension-id/src/html/offscreen.html',
      tab: { id: 42 },
    }, browserAPI)).toBe(false);
    expect(isTrustedLiveDubbingUiSender({ id: 'extension-id' }, browserAPI)).toBe(false);
    expect(isTrustedLiveDubbingUiSender({
      id: 'other-extension',
      url: 'chrome-extension://other-extension/src/html/options.html',
      tab: { id: 42 },
    }, browserAPI)).toBe(false);
    expect(isTrustedLiveDubbingUiSender({
      url: 'chrome-extension://extension-id/src/html/options.html',
      tab: { id: 42 },
    }, browserAPI)).toBe(false);
    expect(isTrustedLiveDubbingUiSender({
      id: 'extension-id',
      tab: { id: 42 },
    }, browserAPI)).toBe(false);
    expect(isTrustedLiveDubbingUiSender(undefined, browserAPI)).toBe(false);
  });

  it('creates a one-time provider bootstrap DTO with explicit identity', () => {
    expect(createProviderBootstrapRequest({
      sessionId: 'session-1',
      providerId: 'gemini',
      targetLanguage: 'fil',
      eventSequence: 1,
    })).toEqual({
      action: 'LIVE_DUBBING_REQUEST_PROVIDER_BOOTSTRAP',
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        targetLanguage: 'fil',
        eventSequence: 1,
      },
    });
    const bootstrap = { apiKey: 'secret-key' };
    expect(createProviderBootstrapResponse('gemini', 'fil', bootstrap)).toEqual({
      success: true,
      providerId: 'gemini',
      targetLanguage: 'fil',
      bootstrap,
    });

    const openAiMessage = createSessionMessage('LIVE_DUBBING_STATUS', 'session-openai', 'openai');
    expect(openAiMessage.data).toEqual({ sessionId: 'session-openai', providerId: 'openai' });
    expect(createProviderBootstrapRequest({
      sessionId: 'session-openai',
      providerId: 'openai',
      targetLanguage: 'en-US',
      eventSequence: 2,
    })).toMatchObject({
      data: {
        sessionId: 'session-openai',
        providerId: 'openai',
        targetLanguage: 'en-US',
        eventSequence: 2,
      },
    });
    expect(hasExactSessionEvent({
      data: { sessionId: 'session-openai', providerId: 'openai', eventSequence: 0 },
    }, {
      sessionId: 'session-openai',
      providerId: 'openai',
      eventSequence: 0,
    })).toBe(true);
  });

  it('requires exact session and provider identity on internal responses', () => {
    const response = { success: true, sessionId: 'session-1', providerId: 'gemini' };

    expect(isExactSessionResponse(response, 'session-1', 'gemini')).toBe(true);
    expect(isExactSessionResponse({ ...response, providerId: 'other' }, 'session-1', 'gemini')).toBe(false);
    expect(isExactSessionResponse({ sessionId: 'session-1' }, 'session-1', 'gemini')).toBe(false);
    expect(isExactSessionResponse(response, 'session-2', 'gemini')).toBe(false);
    expect(isExactSessionResponse({ success: true, sessionId: 'session-1', providerId: 'openai' }, 'session-1', 'openai')).toBe(true);
    expect(isExactSessionResponse({ success: true, sessionId: 'session-1', providerId: 'gemini', actualProviderId: 'openai' }, 'session-1', 'gemini')).toBe(false);
  });

  it('exposes the required operation timeout contract', () => {
    expect(LIVE_DUBBING_TIMEOUTS).toEqual({ START: 30_000, STOP: 10_000, STATUS: 5_000, SETUP: 10_000 });
    expect(LIVE_DUBBING_ACTION_TIMEOUTS.START_LIVE_DUBBING).toBe(30_000);
    expect(LIVE_DUBBING_ACTION_TIMEOUTS.STOP_LIVE_DUBBING).toBe(10_000);
    expect(LIVE_DUBBING_ACTION_TIMEOUTS.GET_LIVE_DUBBING_STATUS).toBe(5_000);
    expect(LIVE_DUBBING_ACTION_TIMEOUTS.SET_LIVE_DUBBING_ORIGINAL_VOLUME)
      .toBe(LIVE_DUBBING_TIMEOUTS.STATUS);
    expect(LIVE_DUBBING_ACTION_TIMEOUTS.GET_LIVE_DUBBING_ORIGINAL_VOLUME)
      .toBe(LIVE_DUBBING_TIMEOUTS.STATUS);
    expect(LIVE_DUBBING_ACTION_TIMEOUTS.LIVE_DUBBING_GET_ORIGINAL_VOLUME)
      .toBe(LIVE_DUBBING_TIMEOUTS.STATUS);
  });

  it('accepts only the declared provider audio modes', () => {
    expect(isLiveDubbingAudioMode('pcm')).toBe(true);
    expect(isLiveDubbingAudioMode('media-stream')).toBe(true);
    expect(isLiveDubbingAudioMode('PCM')).toBe(false);
    expect(isLiveDubbingAudioMode('webrtc')).toBe(false);
    expect(isLiveDubbingAudioMode('')).toBe(false);
    expect(isLiveDubbingAudioMode(null)).toBe(false);
    expect(isLiveDubbingAudioMode(undefined)).toBe(false);
    expect(isLiveDubbingAudioMode(0)).toBe(false);
    expect(isLiveDubbingAudioMode({})).toBe(false);
  });

  it('keeps translated transcript DTOs provider-neutral and text-only', () => {
    expect(createLiveDubbingTranslatedTranscript(' hello ')).toEqual({
      kind: 'translated',
      text: ' hello ',
    });
    expect(sanitizeLiveDubbingTranslatedTranscript({
      kind: 'translated',
      text: 'hello',
      source: 'must not cross the boundary',
    })).toEqual({ kind: 'translated', text: 'hello' });
    expect(sanitizeLiveDubbingTranslatedTranscript({ kind: 'source', text: 'no' })).toBeNull();
    expect(sanitizeLiveDubbingTranslatedTranscript({ kind: 'translated', text: ' ' })).toEqual({
      kind: 'translated',
      text: ' ',
    });
    expect(createLiveDubbingTranslatedTranscript('x'.repeat(LIVE_DUBBING_TRANSLATED_TRANSCRIPT_MAX_LENGTH + 1)))
      .toBeNull();
    expect(isValidLiveDubbingTranscriptSequence(1)).toBe(true);
    expect(isValidLiveDubbingTranscriptSequence(0)).toBe(false);
    expect(createLiveDubbingTranslatedTranscriptMessage({
      sessionId: 'session-1',
      providerId: 'gemini',
      eventSequence: 4,
    }, { kind: 'translated', text: 'hello' }, 2)).toEqual({
      action: LIVE_DUBBING_ACTIONS.TRANSLATED_TRANSCRIPT,
      data: {
        sessionId: 'session-1',
        providerId: 'gemini',
        eventSequence: 4,
        transcriptSequence: 2,
        transcript: { kind: 'translated', text: 'hello' },
      },
    });
    expect(createLiveDubbingTranscriptClearMessage('session-1')).toEqual({
      action: LIVE_DUBBING_ACTIONS.CLEAR_TRANSCRIPT,
      data: { sessionId: 'session-1' },
    });
  });
});
