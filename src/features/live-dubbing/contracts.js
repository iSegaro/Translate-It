import {
  LIVE_DUBBING_ACTIONS,
  LIVE_DUBBING_CAPTURE_STAGES,
  LIVE_DUBBING_PROVIDER_ID,
  LIVE_DUBBING_STATUS,
} from './constants.js';

const supportedStatuses = new Set(Object.values(LIVE_DUBBING_STATUS));
const supportedDiagnosticStages = new Set(Object.values(LIVE_DUBBING_CAPTURE_STAGES));
const safeErrorNamePattern = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
const safeErrorCodePattern = /^[A-Za-z0-9_.-]{1,80}$/;
const unsafeErrorCodePattern = /(?:stream\s*id|payload|credential|password|secret|token|media)[-_][a-z]/;
const diagnosticMessageLimit = 160;
const providerDiagnosticStage = 'CONNECT_PROVIDER';
const safeProviderDiagnosticTokenPattern = /^[A-Za-z0-9_.-]{1,80}$/;
const supportedProviderMalformedAt = new Set([
  'JSON_PARSE',
  'MESSAGE_ENVELOPE',
  'SETUP_COMPLETE_SHAPE',
  'GO_AWAY_SHAPE',
  'REMOTE_ERROR_SHAPE',
  'TOP_LEVEL_FIELDS',
  'SERVER_CONTENT_SHAPE',
  'SERVER_CONTENT_FIELDS',
  'MODEL_TURN_SHAPE',
  'PART_SHAPE',
  'INLINE_AUDIO_SHAPE',
  'LIFECYCLE_SHAPE',
  'METADATA_SHAPE',
  'SESSION_RESUMPTION_SHAPE',
  'TOOL_CALL_SHAPE',
  'TOOL_CALL_CANCELLATION_SHAPE',
  'UNKNOWN_TOP_LEVEL_FIELD',
  'MULTIPLE_TOP_LEVEL_FIELDS',
  'MISSING_TOP_LEVEL_FIELD',
  'BINARY_BLOB_MESSAGE',
  'BINARY_UTF8_DECODE',
  'EMPTY_MESSAGE_OBJECT',
]);
const supportedCleanupCauses = new Set([
  'EXPLICIT_DISPOSE',
  'LIVE_DUBBING_AUDIO_PIPELINES_FAILED',
  'LIVE_DUBBING_CAPTURE_FAILED',
  'LIVE_DUBBING_CAPTURE_TRACK_ENDED',
  'LIVE_DUBBING_CAPTURE_UNAVAILABLE',
  'LIVE_DUBBING_INPUT_PIPELINE_ERROR',
  'LIVE_DUBBING_INPUT_SEND_ERROR',
  'LIVE_DUBBING_INVALID_OUTPUT_AUDIO',
  'LIVE_DUBBING_NO_LIVE_AUDIO_TRACK',
  'LIVE_DUBBING_OUTPUT_AUDIO_ERROR',
  'LIVE_DUBBING_OUTPUT_PIPELINE_ERROR',
  'LIVE_DUBBING_PIPELINE_SETUP_CANCELLED',
  'LIVE_DUBBING_PROVIDER_CLOSED',
  'LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE',
  'LIVE_DUBBING_PROVIDER_ERROR',
  'LIVE_DUBBING_PROVIDER_SETUP_INCOMPLETE',
  'LIVE_DUBBING_PROVIDER_UNAVAILABLE',
  'GEMINI_LIVE_ALREADY_CONNECTED',
  'GEMINI_LIVE_AUDIO_ENCODING_FAILED',
  'GEMINI_LIVE_CLOSED',
  'GEMINI_LIVE_CLOSED_BEFORE_SETUP',
  'GEMINI_LIVE_CONNECT_FAILED',
  'GEMINI_LIVE_GO_AWAY',
  'GEMINI_LIVE_MALFORMED_MESSAGE',
  'GEMINI_LIVE_REMOTE_ERROR',
  'GEMINI_LIVE_SEND_FAILED',
  'GEMINI_LIVE_SETUP_SEND_FAILED',
  'GEMINI_LIVE_SETUP_TIMEOUT',
  'GEMINI_LIVE_SOCKET_ERROR',
  'GEMINI_LIVE_UNSUPPORTED_TOOL_CALL',
  'PROVIDER_GO_AWAY',
]);
const supportedCleanupProviderSendReasons = new Set(['BACKPRESSURE', 'NOT_READY', 'SEND_FAILED']);
const supportedCleanupProviderTerminalCategories = new Set([
  'INPUT_PIPELINE_ERROR',
  'INPUT_SEND_ERROR',
  'INVALID_OUTPUT_AUDIO',
  'OUTPUT_AUDIO_ERROR',
  'OUTPUT_PIPELINE_ERROR',
  'PROVIDER_CLOSED',
  'PROVIDER_ERROR',
  'PROVIDER_GO_AWAY',
]);

/** @typedef {'JSON_PARSE'|'MESSAGE_ENVELOPE'|'SETUP_COMPLETE_SHAPE'|'GO_AWAY_SHAPE'|'REMOTE_ERROR_SHAPE'|'TOP_LEVEL_FIELDS'|'SERVER_CONTENT_SHAPE'|'SERVER_CONTENT_FIELDS'|'MODEL_TURN_SHAPE'|'PART_SHAPE'|'INLINE_AUDIO_SHAPE'|'LIFECYCLE_SHAPE'|'METADATA_SHAPE'|'SESSION_RESUMPTION_SHAPE'|'TOOL_CALL_SHAPE'|'TOOL_CALL_CANCELLATION_SHAPE'|'UNKNOWN_TOP_LEVEL_FIELD'|'MULTIPLE_TOP_LEVEL_FIELDS'|'MISSING_TOP_LEVEL_FIELD'|'BINARY_BLOB_MESSAGE'|'BINARY_UTF8_DECODE'|'EMPTY_MESSAGE_OBJECT'} LiveDubbingProviderMalformedAt */

/**
 * Gemini Live language support is intentionally explicit. Do not fall back to
 * the general translation language catalog here: Live provider support is a
 * separate contract and must fail closed for unknown codes.
 */
export const LIVE_GEMINI_LANGUAGE_MAP = Object.freeze({
  af: 'af',
  ar: 'ar',
  az: 'az',
  be: 'be',
  bn: 'bn',
  bg: 'bg',
  ca: 'ca',
  cs: 'cs',
  da: 'da',
  de: 'de',
  el: 'el',
  en: 'en',
  es: 'es',
  et: 'et',
  fa: 'fa',
  fi: 'fi',
  fil: 'fil',
  fr: 'fr',
  he: 'he',
  hi: 'hi',
  hr: 'hr',
  hu: 'hu',
  id: 'id',
  it: 'it',
  ja: 'ja',
  kk: 'kk',
  kn: 'kn',
  ko: 'ko',
  lt: 'lt',
  lv: 'lv',
  ml: 'ml',
  ms: 'ms',
  mr: 'mr',
  ne: 'ne',
  nl: 'nl',
  no: 'no',
  pa: 'pa',
  pl: 'pl',
  ro: 'ro',
  ru: 'ru',
  si: 'si',
  sk: 'sk',
  sl: 'sl',
  sr: 'sr',
  sq: 'sq',
  sv: 'sv',
  sw: 'sw',
  ta: 'ta',
  te: 'te',
  th: 'th',
  tr: 'tr',
  uk: 'uk',
  ur: 'ur',
  uz: 'uz',
  vi: 'vi',
  'zh-cn': 'zh-Hans',
  'zh-tw': 'zh-Hant',
  'zh-hans': 'zh-Hans',
  'zh-hant': 'zh-Hant',
});

const trustedUiPaths = Object.freeze([
  'src/html/popup.html',
  'src/html/sidepanel.html',
  'src/html/options.html',
]);

const OFFSCREEN_DOCUMENT_PATH = 'src/html/offscreen.html';

function getRuntime(browserAPI) {
  return browserAPI?.runtime || globalThis.chrome?.runtime || null;
}

function getRuntimeId(browserAPI) {
  const runtime = getRuntime(browserAPI);
  return typeof runtime?.id === 'string' && runtime.id.trim() ? runtime.id : null;
}

function getRuntimeUrl(browserAPI, path) {
  try {
    const url = getRuntime(browserAPI)?.getURL?.(path);
    return typeof url === 'string' && url ? url : null;
  } catch {
    return null;
  }
}

function getExtensionOrigin(browserAPI) {
  const runtimeUrl = getRuntimeUrl(browserAPI, '');
  if (!runtimeUrl) {
    const runtimeId = getRuntimeId(browserAPI);
    return runtimeId ? `chrome-extension://${runtimeId}` : null;
  }

  try {
    return new URL(runtimeUrl).origin;
  } catch {
    return null;
  }
}

function getUrlPath(value) {
  try {
    return new URL(value).pathname.replace(/^\//, '');
  } catch {
    return null;
  }
}

function hasTrustedRuntimeIdentity(sender, browserAPI) {
  const runtimeId = getRuntimeId(browserAPI);
  return Boolean(runtimeId && sender?.id === runtimeId);
}

function hasNoTab(sender) {
  return sender?.tab === undefined || sender?.tab === null;
}

function hasExtensionOrigin(sender, browserAPI) {
  if (sender?.url === undefined) return true;
  if (typeof sender.url !== 'string') return false;

  const extensionOrigin = getExtensionOrigin(browserAPI);
  if (!extensionOrigin) return false;

  try {
    return new URL(sender.url).origin === extensionOrigin;
  } catch {
    return false;
  }
}

function containsSensitiveValue(value, sensitiveValues) {
  return (Array.isArray(sensitiveValues) ? sensitiveValues : [])
    .some(sensitiveValue => typeof sensitiveValue === 'string'
      && sensitiveValue.length > 0
      && value.includes(sensitiveValue));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeDiagnosticMessage(value, sensitiveValues = []) {
  let message = typeof value === 'string' ? value.trim() : '';
  if (!message) return 'Operation failed';

  for (const sensitiveValue of Array.isArray(sensitiveValues) ? sensitiveValues : []) {
    if (typeof sensitiveValue !== 'string' || !sensitiveValue) continue;
    message = message.replace(new RegExp(escapeRegExp(sensitiveValue), 'g'), '[redacted]');
  }

  return message
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s]+/gi, '[redacted-url]')
    .replace(/\b(?:data|javascript|about):[^\s]+/gi, '[redacted-url]')
    .replace(/\bwww\.[^\s]+/gi, '[redacted-url]')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/\b(?:authorization|credential|password|secret|token|api[-_ ]?key|payload|raw[-_ ]?media|media(?:stream)?|stream[\s-]*id)\s*(?::|=|\bis\b)\s*(?:Bearer\s+)?[^\s,;]+/gi, '$1=[redacted]')
    .replace(/\b(?:stream|media|token|secret|credential|password)[-_][A-Za-z0-9_-]+\b/gi, '$1-[redacted]')
    .replace(/\b(?:MediaStream|MediaSource|ArrayBuffer|Blob)\s*(?:\([^)]*\)|\{[^}]*\})?/g, '[redacted-media]')
    .replace(/\{[^{}]*\}/g, '[redacted-data]')
    .replace(/[A-Za-z0-9+/=_-]{48,}/g, '[redacted]')
    .slice(0, diagnosticMessageLimit);
}

/**
 * Keep capture diagnostics safe for internal cross-context logging.
 * @param {unknown} stage
 * @param {unknown} error
 * @param {{sensitiveValues?: string[]}} options
 * @returns {{stage: string, error: {name: string, message: string, code?: string}}}
 */
export function createLiveDubbingDiagnostic(stage, error, options = {}) {
  const normalizedStage = supportedDiagnosticStages.has(stage) ? stage : 'UNKNOWN';
  const source = error && typeof error === 'object' ? error : { message: error };
  const name = typeof source.name === 'string' && safeErrorNamePattern.test(source.name)
    ? source.name
    : 'Error';
  const message = sanitizeDiagnosticMessage(source.message, options.sensitiveValues);
  const code = typeof source.code === 'string'
    && safeErrorCodePattern.test(source.code)
    && !unsafeErrorCodePattern.test(source.code)
    && !containsSensitiveValue(source.code, options.sensitiveValues)
    ? source.code
    : null;

  return {
    stage: normalizedStage,
    error: {
      name,
      message,
      ...(code ? { code } : {}),
    },
  };
}

/**
 * Re-sanitize diagnostics received from another extension context.
 * @param {unknown} diagnostic
 * @returns {{stage: string, error: {name: string, message: string, code?: string}}|null}
 */
export function sanitizeLiveDubbingDiagnostic(diagnostic, options = {}) {
  if (!diagnostic || typeof diagnostic !== 'object') return null;
  return createLiveDubbingDiagnostic(diagnostic.stage, diagnostic.error, options);
}

function safeProviderDiagnosticToken(value) {
  return typeof value === 'string' && safeProviderDiagnosticTokenPattern.test(value)
    ? value
    : null;
}

function safeProviderCloseCode(value) {
  // 1006 is observable on WebSocket close events even though it cannot be sent.
  return Number.isInteger(value) && value >= 1000 && value <= 4999 ? value : null;
}

function safeProviderMalformedAt(value) {
  return supportedProviderMalformedAt.has(value) ? value : null;
}

/**
 * Create the deliberately flat provider-startup diagnostic DTO. Only scalar,
 * allowlisted fields are read so provider errors, credentials, and payloads
 * cannot cross a context boundary.
 * @param {unknown} value
 * @returns {{stage: 'CONNECT_PROVIDER', code: string|null, closeCode: integer|null, wasClean: boolean|null, terminalCategory: string|null, malformedAt: LiveDubbingProviderMalformedAt|null, wsOpen: boolean, setupSent: boolean, setupComplete: boolean}}
 */
export function createLiveDubbingProviderDiagnostic(value = {}) {
  const source = value && typeof value === 'object' && !(value instanceof Error)
    ? value
    : {};
  const isMalformedFailure = source.code === 'GEMINI_LIVE_MALFORMED_MESSAGE'
    || source.terminalCategory === 'MALFORMED_MESSAGE';
  return {
    stage: providerDiagnosticStage,
    code: safeProviderDiagnosticToken(source.code),
    closeCode: safeProviderCloseCode(source.closeCode),
    wasClean: typeof source.wasClean === 'boolean' ? source.wasClean : null,
    terminalCategory: safeProviderDiagnosticToken(source.terminalCategory),
    malformedAt: isMalformedFailure ? safeProviderMalformedAt(source.malformedAt) : null,
    wsOpen: source.wsOpen === true,
    setupSent: source.setupSent === true,
    setupComplete: source.setupComplete === true,
  };
}

/**
 * Re-sanitize a provider-startup diagnostic received from another context.
 * Unknown fields are intentionally discarded.
 * @param {unknown} diagnostic
 * @returns {{stage: 'CONNECT_PROVIDER', code: string|null, closeCode: integer|null, wasClean: boolean|null, terminalCategory: string|null, malformedAt: LiveDubbingProviderMalformedAt|null, wsOpen: boolean, setupSent: boolean, setupComplete: boolean}|null}
 */
export function sanitizeLiveDubbingProviderDiagnostic(diagnostic) {
  if (!diagnostic || typeof diagnostic !== 'object' || diagnostic instanceof Error) return null;
  return createLiveDubbingProviderDiagnostic(diagnostic);
}

function readCleanupDiagnosticField(source, field) {
  try {
    return source[field];
  } catch {
    return undefined;
  }
}

function safeCleanupCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function safeCleanupToken(allowlist, value) {
  return allowlist.has(value) ? value : null;
}

/**
 * Create the exact terminal cleanup summary DTO. It is intentionally a fresh,
 * scalar-only object so session ownership, media, credentials, and payloads
 * cannot cross the offscreen/background boundary.
 * @param {unknown} value
 * @returns {{cleanupCause: string, capturedFrames: number, inputSentFrames: number, inputPendingFrames: number, providerLastSendReason: string|null, providerAudioChunks: number, playbackAccepted: boolean, outputSafetyDrops: number, interruptions: number, providerTerminalCategory: string|null}}
 */
export function createLiveDubbingCleanupDiagnostic(value = {}) {
  const source = value && typeof value === 'object' && !(value instanceof Error)
    ? value
    : {};
  const cleanupCause = readCleanupDiagnosticField(source, 'cleanupCause');
  return {
    cleanupCause: supportedCleanupCauses.has(cleanupCause)
      ? cleanupCause
      : 'EXPLICIT_DISPOSE',
    capturedFrames: safeCleanupCount(readCleanupDiagnosticField(source, 'capturedFrames')),
    inputSentFrames: safeCleanupCount(readCleanupDiagnosticField(source, 'inputSentFrames')),
    inputPendingFrames: safeCleanupCount(readCleanupDiagnosticField(source, 'inputPendingFrames')),
    providerLastSendReason: safeCleanupToken(
      supportedCleanupProviderSendReasons,
      readCleanupDiagnosticField(source, 'providerLastSendReason'),
    ),
    providerAudioChunks: safeCleanupCount(readCleanupDiagnosticField(source, 'providerAudioChunks')),
    playbackAccepted: readCleanupDiagnosticField(source, 'playbackAccepted') === true,
    outputSafetyDrops: safeCleanupCount(readCleanupDiagnosticField(source, 'outputSafetyDrops')),
    interruptions: safeCleanupCount(readCleanupDiagnosticField(source, 'interruptions')),
    providerTerminalCategory: safeCleanupToken(
      supportedCleanupProviderTerminalCategories,
      readCleanupDiagnosticField(source, 'providerTerminalCategory'),
    ),
  };
}

/**
 * Re-sanitize a terminal cleanup summary received from another context.
 * Unknown fields and unsafe values are discarded by the fresh DTO builder.
 * @param {unknown} diagnostic
 * @returns {{cleanupCause: string, capturedFrames: number, inputSentFrames: number, inputPendingFrames: number, providerLastSendReason: string|null, providerAudioChunks: number, playbackAccepted: boolean, outputSafetyDrops: number, interruptions: number, providerTerminalCategory: string|null}|null}
 */
export function sanitizeLiveDubbingCleanupDiagnostic(diagnostic) {
  if (!diagnostic || typeof diagnostic !== 'object' || diagnostic instanceof Error) return null;
  return createLiveDubbingCleanupDiagnostic(diagnostic);
}

function hasMatchingSessionField(response, field, sessionId) {
  return !Object.prototype.hasOwnProperty.call(response, field)
    || response[field] === sessionId;
}

/**
 * Require every session identity supplied by an internal response to agree.
 * Session-bound acknowledgements must carry the current session and provider
 * identities. Optional requested/actual session fields remain diagnostic-only.
 */
export function isExactSessionResponse(response, sessionId, providerId) {
  return Boolean(response
    && providerId === LIVE_DUBBING_PROVIDER_ID
    && response.sessionId === sessionId
    && response.providerId === providerId
    && hasMatchingSessionField(response, 'requestedSessionId', sessionId)
    && hasMatchingSessionField(response, 'actualSessionId', sessionId));
}

/**
 * Validate a message emitted by the offscreen document before it reaches a
 * background coordinator. The exact URL is required so extension identity
 * metadata cannot be replaced by only an extension ID and missing tab.
 */
export function isAuthorizedOffscreenSender(sender, browserAPI) {
  if (!hasTrustedRuntimeIdentity(sender, browserAPI) || !hasNoTab(sender)) return false;

  const expectedUrl = getRuntimeUrl(browserAPI, OFFSCREEN_DOCUMENT_PATH);
  return Boolean(expectedUrl && typeof sender?.url === 'string' && sender.url === expectedUrl);
}

/**
 * Validate an internal sender delivering a command to the offscreen router.
 * The sender is the extension service worker/page, so its exact page URL is
 * not required; its extension origin is required whenever a URL is supplied.
 */
export function isAuthorizedOffscreenRouterSender(sender, browserAPI) {
  return hasTrustedRuntimeIdentity(sender, browserAPI)
    && hasNoTab(sender)
    && hasExtensionOrigin(sender, browserAPI);
}

/**
 * Public live-dubbing commands are restricted to the extension's own UI
 * documents. Trusted extension pages (e.g. Options) can be tab-bound when
 * opened in a normal browser tab, so sender.tab presence is not a signal;
 * only the exact allowlisted UI document path authorizes. Extension origin
 * alone never authorizes: the exact path must match.
 */
export function isTrustedLiveDubbingUiSender(sender, browserAPI) {
  if (!hasTrustedRuntimeIdentity(sender, browserAPI)) return false;
  if (typeof sender?.url !== 'string' || !hasExtensionOrigin(sender, browserAPI)) return false;

  const path = getUrlPath(sender.url);
  return Boolean(path && trustedUiPaths.includes(path));
}

export function hasExactSessionEvent(message, descriptor) {
  const data = message?.data || message || {};
  return Boolean(descriptor
    && descriptor.providerId === LIVE_DUBBING_PROVIDER_ID
    && data.sessionId === descriptor.sessionId
    && data.providerId === descriptor.providerId
    && Number.isInteger(data.eventSequence)
    && data.eventSequence === descriptor.eventSequence);
}

/**
 * Normalize and validate a provider target language without loading language
 * data. Unknown providers and languages fail closed.
 * @param {unknown} providerId
 * @param {unknown} language
 * @returns {string}
 */
export function normalizeProviderTargetLanguage(providerId, language) {
  if (providerId !== LIVE_DUBBING_PROVIDER_ID) {
    throw new RangeError('Unsupported live dubbing provider');
  }
  if (typeof language !== 'string' || !language.trim()) {
    throw new TypeError('targetLanguage is required');
  }

  const normalized = language.trim().toLowerCase();
  const exact = LIVE_GEMINI_LANGUAGE_MAP[normalized];

  if (!exact) {
    throw new RangeError('Unsupported target language');
  }

  return exact;
}

/**
 * Keep storage records limited to the public control-plane descriptor.
 * @param {unknown} value
 * @returns {object|null}
 */
export function sanitizeDescriptor(value) {
  if (!value || typeof value !== 'object') return null;

  const sessionId = typeof value.sessionId === 'string' && value.sessionId.trim()
    ? value.sessionId.trim()
    : null;
  const tabId = Number.isInteger(value.tabId) && value.tabId >= 0 ? value.tabId : null;
  const providerId = value.providerId === LIVE_DUBBING_PROVIDER_ID
    ? value.providerId
    : null;
  let targetLanguage = null;
  if (providerId && typeof value.targetLanguage === 'string') {
    try {
      targetLanguage = normalizeProviderTargetLanguage(providerId, value.targetLanguage);
    } catch {
      targetLanguage = null;
    }
  }
  const status = supportedStatuses.has(value.status) ? value.status : null;
  const startedAt = Number.isFinite(value.startedAt) ? value.startedAt : null;
  const eventSequence = Number.isInteger(value.eventSequence) && value.eventSequence >= 0
    ? value.eventSequence
    : null;
  const lastError = value.lastError === null || value.lastError === undefined
    ? null
    : typeof value.lastError === 'string'
      ? value.lastError.trim() ? sanitizeDiagnosticMessage(value.lastError) : ''
      : null;

  if (!sessionId || tabId === null || !providerId || !targetLanguage || !status
    || startedAt === null || eventSequence === null) {
    return null;
  }

  return {
    sessionId,
    tabId,
    providerId,
    targetLanguage,
    status,
    startedAt,
    lastError,
    eventSequence,
  };
}

/**
 * Create descriptor with no transport or provider bootstrap fields.
 */
export function createDescriptor({ sessionId, tabId, providerId, targetLanguage, startedAt }) {
  return {
    sessionId,
    tabId,
    providerId,
    targetLanguage: normalizeProviderTargetLanguage(providerId, targetLanguage),
    status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
    startedAt,
    lastError: null,
    eventSequence: 0,
  };
}

export function cloneDescriptor(descriptor) {
  return descriptor ? { ...descriptor } : null;
}

function baseOffscreenMessage(action, descriptor) {
  return {
    target: 'offscreen',
    action,
    data: {
      sessionId: descriptor.sessionId,
      tabId: descriptor.tabId,
      providerId: descriptor.providerId,
      targetLanguage: descriptor.targetLanguage,
      eventSequence: descriptor.eventSequence,
    },
  };
}

export function createPrepareMessage(descriptor) {
  return baseOffscreenMessage(LIVE_DUBBING_ACTIONS.PREPARE, descriptor);
}

export function createConsumeMessage(descriptor, streamId) {
  if (typeof streamId !== 'string' || !streamId) {
    throw new TypeError('streamId is required for offscreen consumption');
  }

  return {
    ...baseOffscreenMessage(LIVE_DUBBING_ACTIONS.CONSUME, descriptor),
    data: {
      sessionId: descriptor.sessionId,
      tabId: descriptor.tabId,
      providerId: descriptor.providerId,
      targetLanguage: descriptor.targetLanguage,
      eventSequence: descriptor.eventSequence,
      streamId,
    },
  };
}

export function createProviderConnectMessage(descriptor) {
  return baseOffscreenMessage(LIVE_DUBBING_ACTIONS.CONNECT_PROVIDER, descriptor);
}

export function createDisposeMessage(descriptor) {
  return baseOffscreenMessage(LIVE_DUBBING_ACTIONS.DISPOSE, descriptor);
}

export function createStatusMessage(descriptor) {
  return baseOffscreenMessage(LIVE_DUBBING_ACTIONS.STATUS, descriptor);
}

export function isSuccessfulResponse(response) {
  return Boolean(response && response.success !== false);
}

export function isAcknowledged(response, acknowledgement) {
  if (!isSuccessfulResponse(response)) return false;

  return response.ack === acknowledgement
    || response.status === acknowledgement
    || response.event === acknowledgement
    || response.type === acknowledgement
    || (acknowledgement === 'READY' && response.ready === true)
    || (acknowledgement === 'MEDIA_ACQUIRED' && response.mediaAcquired === true)
    || (acknowledgement === 'DISPOSED' && response.disposed === true);
}

export function isAcknowledgedForSession(response, acknowledgement, sessionId, providerId) {
  return isAcknowledged(response, acknowledgement)
    && isExactSessionResponse(response, sessionId, providerId);
}

/**
 * Build a session-scoped offscreen request when descriptor metadata is absent.
 */
export function createSessionMessage(action, sessionId, providerId) {
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new TypeError('sessionId is required for offscreen messaging');
  }
  if (providerId !== LIVE_DUBBING_PROVIDER_ID) {
    throw new TypeError('providerId is required for offscreen messaging');
  }

  return {
    target: 'offscreen',
    action,
    data: { sessionId, providerId },
  };
}

/**
 * Build the one-time offscreen provider bootstrap request. Bootstrap data is
 * never placed in a broadcast action or in a session descriptor.
 */
export function createProviderBootstrapRequest({ sessionId, providerId, targetLanguage, eventSequence }) {
  if (!isSessionId(sessionId)) throw new TypeError('sessionId is required');
  if (!Number.isInteger(eventSequence) || eventSequence < 0) {
    throw new TypeError('eventSequence is required');
  }
  if (providerId !== LIVE_DUBBING_PROVIDER_ID) throw new TypeError('providerId is required');

  return {
    action: LIVE_DUBBING_ACTIONS.REQUEST_PROVIDER_BOOTSTRAP,
    data: {
      sessionId,
      providerId,
      targetLanguage: normalizeProviderTargetLanguage(providerId, targetLanguage),
      eventSequence,
    },
  };
}

/**
 * Return the deliberately small provider bootstrap response DTO. The nested
 * bootstrap remains opaque here; only the provider and language are generic.
 */
export function createProviderBootstrapResponse(providerId, targetLanguage, bootstrap) {
  if (providerId !== LIVE_DUBBING_PROVIDER_ID) {
    throw new TypeError('providerId is required');
  }
  if (!isPlainRecord(bootstrap)) {
    throw new TypeError('bootstrap must be a plain object');
  }

  return {
    success: true,
    providerId,
    targetLanguage: normalizeProviderTargetLanguage(providerId, targetLanguage),
    bootstrap,
  };
}

export function parseProviderBootstrapResponse(response, expectedProviderId, expectedTargetLanguage) {
  if (!isPlainRecord(response) || response.success !== true
    || Object.keys(response).length !== 4
    || Object.prototype.hasOwnProperty.call(response, 'apiKey')) return null;

  if (response.providerId !== expectedProviderId) return null;

  let targetLanguage;
  try {
    targetLanguage = normalizeProviderTargetLanguage(expectedProviderId, response.targetLanguage);
    if (targetLanguage !== normalizeProviderTargetLanguage(expectedProviderId, expectedTargetLanguage)) return null;
  } catch {
    return null;
  }
  if (!isPlainRecord(response.bootstrap)) return null;

  return {
    providerId: response.providerId,
    targetLanguage,
    bootstrap: response.bootstrap,
  };
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function isSessionId(value) {
  return typeof value === 'string' && Boolean(value.trim());
}

export function isLiveDubbingAction(action) {
  return Object.values(LIVE_DUBBING_ACTIONS).includes(action);
}

export function safeFailureCode(stage) {
  return `LIVE_DUBBING_${String(stage).toUpperCase()}_FAILED`;
}
