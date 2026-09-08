import { getAvailableTranslationLanguageCodes } from '@/utils/i18n/TranslationLanguageLoader.js';
import {
  LIVE_DUBBING_ACTIONS,
  LIVE_DUBBING_CAPTURE_STAGES,
  LIVE_DUBBING_STATUS,
} from './constants.js';

const availableLanguages = new Set(getAvailableTranslationLanguageCodes());
const supportedStatuses = new Set(Object.values(LIVE_DUBBING_STATUS));
const supportedDiagnosticStages = new Set(Object.values(LIVE_DUBBING_CAPTURE_STAGES));
const safeErrorNamePattern = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
const safeErrorCodePattern = /^[A-Za-z0-9_.-]{1,80}$/;
const unsafeErrorCodePattern = /(?:stream\s*id|payload|credential|password|secret|token|media)[-_][a-z]/;
const diagnosticMessageLimit = 160;

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

function hasMatchingSessionField(response, field, sessionId) {
  return !Object.prototype.hasOwnProperty.call(response, field)
    || response[field] === sessionId;
}

/**
 * Require every session identity supplied by an internal response to agree.
 * Missing optional identity fields remain compatible with older acknowledgements.
 */
export function isExactSessionResponse(response, sessionId) {
  return Boolean(response
    && response.sessionId === sessionId
    && hasMatchingSessionField(response, 'requestedSessionId', sessionId)
    && hasMatchingSessionField(response, 'actualSessionId', sessionId));
}

/**
 * Normalize and validate target language without loading language data.
 * @param {unknown} language
 * @returns {string}
 */
export function normalizeTargetLanguage(language) {
  if (typeof language !== 'string' || !language.trim()) {
    throw new TypeError('targetLanguage is required');
  }

  const normalized = language.trim().toLowerCase();
  const exact = availableLanguages.has(normalized)
    ? normalized
    : normalized.split('-')[0];

  if (!availableLanguages.has(exact)) {
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
  let targetLanguage = null;
  if (typeof value.targetLanguage === 'string') {
    const normalized = value.targetLanguage.trim().toLowerCase();
    const candidate = availableLanguages.has(normalized) ? normalized : normalized.split('-')[0];
    if (availableLanguages.has(candidate)) targetLanguage = candidate;
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

  if (!sessionId || tabId === null || !targetLanguage || !status
    || startedAt === null || eventSequence === null) {
    return null;
  }

  return {
    sessionId,
    tabId,
    targetLanguage,
    status,
    startedAt,
    lastError,
    eventSequence,
  };
}

/**
 * Create descriptor with no transport or credential fields.
 */
export function createDescriptor({ sessionId, tabId, targetLanguage, startedAt }) {
  return {
    sessionId,
    tabId,
    targetLanguage: normalizeTargetLanguage(targetLanguage),
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
      targetLanguage: descriptor.targetLanguage,
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
      targetLanguage: descriptor.targetLanguage,
      streamId,
    },
  };
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

export function isAcknowledgedForSession(response, acknowledgement, sessionId) {
  return isAcknowledged(response, acknowledgement)
    && isExactSessionResponse(response, sessionId);
}

/**
 * Build a session-scoped offscreen request when descriptor metadata is absent.
 */
export function createSessionMessage(action, sessionId) {
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new TypeError('sessionId is required for offscreen messaging');
  }

  return {
    target: 'offscreen',
    action,
    data: { sessionId },
  };
}

export function isLiveDubbingAction(action) {
  return Object.values(LIVE_DUBBING_ACTIONS).includes(action);
}

export function safeFailureCode(stage) {
  return `LIVE_DUBBING_${String(stage).toUpperCase()}_FAILED`;
}
