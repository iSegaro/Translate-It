/**
 * Phase 4 Firefox content-runtime control contract (production).
 *
 * Closed, scalar-only control plane between the Background Coordinator
 * (authoritative) and the isolated Live Dubbing content-runtime host. This
 * module owns no capture, provider execution, site logic, media transport,
 * or page-world API: only PREPARE/STATUS/CONNECT_PROVIDER/DISPOSE control data with exact
 * session/provider/tab/frame/document/event identity crosses it.
 *
 * Generic CONNECT/CONSUME are deliberately absent: they imply source/provider
 * execution, which the content control boundary does not expose. The
 * control-only CONNECT_PROVIDER action delegates setup to the active local
 * runtime. Bootstrap minting stays Background-side; the Coordinator owns the
 * exact-session route and the persisted lifecycle descriptor.
 */

import {
  LIVE_DUBBING_ACTIONS,
  LIVE_DUBBING_STATUS,
} from '../constants.js';
import {
  isFirefoxContentDescriptor,
  isLiveDubbingProviderId,
  normalizeProviderTargetLanguage,
} from '../contracts.js';

export const FIREFOX_CONTENT_TARGET = 'live-dubbing-firefox-content';

/**
 * Closed action vocabulary. Anything outside this set fails closed at both
 * the Coordinator addressing boundary and the content host ingress.
 */
export const FIREFOX_CONTENT_ACTIONS = Object.freeze([
  LIVE_DUBBING_ACTIONS.PREPARE,
  LIVE_DUBBING_ACTIONS.STATUS,
  LIVE_DUBBING_ACTIONS.CONNECT_PROVIDER,
  LIVE_DUBBING_ACTIONS.DISPOSE,
]);

export const FIREFOX_CONTENT_ACKS = Object.freeze({
  READY: 'READY',
  PROVIDER_READY: 'PROVIDER_READY',
  DISPOSED: 'DISPOSED',
});

export const FIREFOX_CONTENT_STATUS = Object.freeze({
  IDLE: 'IDLE',
  PREPARING_CAPTURE: LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
  CONNECTING_PROVIDER: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
  RUNNING: LIVE_DUBBING_STATUS.RUNNING,
});

/**
 * Allowlisted host failure codes. Scalar only; never carries media,
 * payloads, credentials, or exception objects.
 */
export const FIREFOX_CONTENT_ERRORS = Object.freeze([
  'INVALID_SESSION_ID',
  'INVALID_TARGET_LANGUAGE',
  'LIVE_DUBBING_ACTION_UNSUPPORTED',
  'LIVE_DUBBING_ACTIVATION_BLOCKED',
  'LIVE_DUBBING_EVENT_SEQUENCE_MISMATCH',
  'LIVE_DUBBING_PROVIDER_UNSUPPORTED',
  'LIVE_DUBBING_SESSION_BUSY',
  'LIVE_DUBBING_SESSION_DISPOSED',
  'LIVE_DUBBING_SESSION_MISMATCH',
  'LIVE_DUBBING_STALE_DOCUMENT',
  'LIVE_DUBBING_TARGET_LANGUAGE_MISMATCH',
  'LIVE_DUBBING_UNAUTHORIZED',
  'LIVE_DUBBING_PROVIDER_UNAVAILABLE',
  'LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE',
  'LIVE_DUBBING_PROVIDER_SETUP_INCOMPLETE',
  'LIVE_DUBBING_PROVIDER_ERROR',
  'LIVE_DUBBING_RUNTIME_NOT_PREPARED',
  'LIVE_DUBBING_RUNTIME_PREPARE_FAILED',
  'LIVE_DUBBING_MEDIA_SOURCE_NOT_FOUND',
  'LIVE_DUBBING_MEDIA_SOURCE_AMBIGUOUS',
  'LIVE_DUBBING_MEDIA_CAPTURE_UNSUPPORTED',
  'LIVE_DUBBING_MEDIA_CAPTURE_EXCEPTION',
  'LIVE_DUBBING_MEDIA_CAPTURE_INVALID_STREAM',
  'LIVE_DUBBING_MEDIA_CAPTURE_NO_AUDIO',
  'LIVE_DUBBING_CAPTURE_FAILED',
  'LIVE_DUBBING_CAPTURE_UNAVAILABLE',
  'LIVE_DUBBING_NO_LIVE_AUDIO_TRACK',
  'LIVE_DUBBING_SOURCE_HANDLE_INVALID',
  'LIVE_DUBBING_AUDIO_PIPELINES_FAILED',
  'LIVE_DUBBING_AUDIO_MODE_UNSUPPORTED',
  'LIVE_DUBBING_AUDIO_PIPELINES_UNAVAILABLE',
  'LIVE_DUBBING_PIPELINE_SETUP_CANCELLED',
  'LIVE_DUBBING_SOURCE_OWNERSHIP_CONFLICT',
  'LIVE_DUBBING_CAPTURE_TRACK_ENDED',
  // PCM pipeline native failures — closed canonical codes
  'INPUT_AUDIO_CONTEXT_CREATE_FAILED',
  'INPUT_AUDIO_WORKLET_LOAD_FAILED',
  'INPUT_AUDIO_MEDIA_STREAM_SOURCE_FAILED',
  'INPUT_AUDIO_WORKLET_NODE_FAILED',
  'INPUT_AUDIO_WORKLET_NODE_NOT_SUPPORTED',
  'INPUT_AUDIO_WORKLET_NODE_INDEX_SIZE',
  'INPUT_AUDIO_WORKLET_NODE_INVALID_STATE',
  'INPUT_AUDIO_WORKLET_NODE_OPERATION_FAILED',
  'INPUT_AUDIO_WORKLET_NODE_TYPE_ERROR',
  'INPUT_AUDIO_GRAPH_FAILED',
  'INPUT_AUDIO_CONTEXT_RESUME_FAILED',
  'OUTPUT_AUDIO_CONTEXT_CREATE_FAILED',
  'OUTPUT_AUDIO_WORKLET_LOAD_FAILED',
  'OUTPUT_AUDIO_WORKLET_NODE_FAILED',
  'OUTPUT_AUDIO_WORKLET_NODE_NOT_SUPPORTED',
  'OUTPUT_AUDIO_WORKLET_NODE_INDEX_SIZE',
  'OUTPUT_AUDIO_WORKLET_NODE_INVALID_STATE',
  'OUTPUT_AUDIO_WORKLET_NODE_OPERATION_FAILED',
  'OUTPUT_AUDIO_WORKLET_NODE_TYPE_ERROR',
  'OUTPUT_AUDIO_GRAPH_FAILED',
  'OUTPUT_AUDIO_CONTEXT_RESUME_FAILED',
]);

const supportedErrors = new Set(FIREFOX_CONTENT_ERRORS);
const supportedActions = new Set(FIREFOX_CONTENT_ACTIONS);

/**
 * Keys that must never appear in a Firefox content control message. Media,
 * audio, transcript, SDP, payload, credential, and exception material fails
 * the message closed even when the surrounding envelope is well-formed.
 */
export const FIREFOX_CONTENT_FORBIDDEN_KEYS = Object.freeze([
  'stream',
  'streamId',
  'track',
  'tracks',
  'mediaStream',
  'mediaStreamTrack',
  'audio',
  'audioData',
  'pcm',
  'samples',
  'transcript',
  'sdp',
  'offer',
  'answer',
  'candidate',
  'payload',
  'bootstrap',
  'apiKey',
  'accessToken',
  'secret',
  'token',
  'credential',
  'password',
  'exception',
  'stack',
  'errorObject',
]);

const forbiddenKeys = new Set(FIREFOX_CONTENT_FORBIDDEN_KEYS);

const ALLOWED_MESSAGE_DATA_KEYS = Object.freeze([
  'sessionId',
  'providerId',
  'tabId',
  'frameId',
  'documentId',
  'targetLanguage',
  'eventSequence',
]);

const allowedMessageDataKeys = new Set(ALLOWED_MESSAGE_DATA_KEYS);

const ALLOWED_RESPONSE_KEYS = Object.freeze([
  'success',
  'ack',
  'status',
  'sessionId',
  'providerId',
  'tabId',
  'frameId',
  'documentId',
  'targetLanguage',
  'eventSequence',
  'runtimeEventSequence',
  'providerReady',
  'setupComplete',
  'active',
  'prepared',
  'disposed',
  'idempotent',
  'ignored',
  'error',
]);

const allowedResponseKeys = new Set(ALLOWED_RESPONSE_KEYS);

const DOCUMENT_ID_LIMIT = 256;

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

function isDocumentId(value) {
  return typeof value === 'string'
    && Boolean(value.trim())
    && value.trim().length <= DOCUMENT_ID_LIMIT;
}

function isTabOrFrameId(value) {
  return Number.isInteger(value) && value >= 0;
}

function isEventSequence(value) {
  return Number.isInteger(value) && value >= 0;
}

function getRuntimeId(browserAPI) {
  try {
    const runtime = browserAPI?.runtime || globalThis.chrome?.runtime || null;
    const id = runtime?.id;
    return typeof id === 'string' && id.trim() ? id : null;
  } catch {
    return null;
  }
}

function hasForbiddenKey(record) {
  return Object.keys(record).some(key => forbiddenKeys.has(key));
}

function hasScalarValuesOnly(record) {
  return Object.values(record).every(value => (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ));
}

/**
 * Whether an action belongs to the closed Firefox content vocabulary.
 * @param {unknown} action
 * @returns {boolean}
 */
export function isFirefoxContentAction(action) {
  return supportedActions.has(action);
}

/**
 * Parse and validate a Background→content control message. Returns a fresh
 * scalar-only { action, data } record or null when anything is inexact:
 * unknown target/action, unknown or forbidden keys, non-scalar values,
 * unknown provider, unnormalizable language, or malformed identity.
 * @param {unknown} message
 * @returns {{action: string, data: object}|null}
 */
export function parseFirefoxContentMessage(message) {
  if (!isPlainRecord(message)) return null;
  if (message.target !== FIREFOX_CONTENT_TARGET) return null;
  if (!isFirefoxContentAction(message.action)) return null;
  if (!isPlainRecord(message.data)) return null;
  if (hasForbiddenKey(message) || hasForbiddenKey(message.data)) return null;
  if (!hasScalarValuesOnly(message.data)) return null;

  const data = message.data;
  if (!Object.keys(data).every(key => allowedMessageDataKeys.has(key))) return null;
  if (!isSessionId(data.sessionId)) return null;
  if (!isLiveDubbingProviderId(data.providerId)) return null;
  if (!isTabOrFrameId(data.tabId)) return null;
  if (!isTabOrFrameId(data.frameId)) return null;
  if (!isDocumentId(data.documentId)) return null;
  if (!isEventSequence(data.eventSequence)) return null;
  if (data.targetLanguage !== undefined && data.targetLanguage !== null) {
    if (typeof data.targetLanguage !== 'string') return null;
    try {
      normalizeProviderTargetLanguage(data.providerId, data.targetLanguage);
    } catch {
      return null;
    }
  }

  return {
    action: message.action,
    data: {
      sessionId: data.sessionId,
      providerId: data.providerId,
      tabId: data.tabId,
      frameId: data.frameId,
      documentId: data.documentId.trim(),
      ...(data.targetLanguage === undefined || data.targetLanguage === null
        ? {}
        : { targetLanguage: data.targetLanguage }),
      eventSequence: data.eventSequence,
    },
  };
}

/**
 * Build a closed Background→content control message from a Firefox-owned
 * descriptor. Throws closed on any inexact input; never attaches media,
 * bootstrap, or transport material.
 * @param {string} action
 * @param {object} descriptor
 * @returns {{target: string, action: string, data: object}}
 */
export function createFirefoxContentMessage(action, descriptor) {
  if (!isFirefoxContentAction(action)) {
    throw new TypeError('Unsupported Firefox content action');
  }
  if (!isFirefoxContentDescriptor(descriptor)) {
    throw new TypeError('Firefox content descriptor is required');
  }

  const message = {
    target: FIREFOX_CONTENT_TARGET,
    action,
    data: {
      sessionId: descriptor.sessionId,
      providerId: descriptor.providerId,
      tabId: descriptor.tabId,
      frameId: descriptor.frameId,
      documentId: descriptor.documentId,
      targetLanguage: descriptor.targetLanguage,
      eventSequence: descriptor.eventSequence,
    },
  };
  const parsed = parseFirefoxContentMessage(message);
  if (!parsed) throw new TypeError('Invalid Firefox content message identity');

  return message;
}

/**
 * Require exact session/provider/sequence plus exact tab/frame/document
 * identity between a parsed control message and its owning descriptor.
 * @param {{action: string, data: object}|unknown} message
 * @param {object} descriptor
 * @returns {boolean}
 */
export function hasExactFirefoxContentEvent(message, descriptor) {
  const data = message?.data || null;
  return Boolean(descriptor
    && isFirefoxContentDescriptor(descriptor)
    && isLiveDubbingProviderId(descriptor.providerId)
    && data
    && data.sessionId === descriptor.sessionId
    && data.providerId === descriptor.providerId
    && Number.isInteger(data.eventSequence)
    && data.eventSequence === descriptor.eventSequence
    && data.tabId === descriptor.tabId
    && data.frameId === descriptor.frameId
    && typeof data.documentId === 'string'
    && typeof descriptor.documentId === 'string'
    && data.documentId.trim() === descriptor.documentId.trim());
}

/**
 * Validate a sender delivering Firefox content-runtime control responses to
 * Background. Content senders are tab-bound with the trusted runtime id;
 * offscreen senders (no tab, offscreen document URL) are explicitly
 * rejected so content traffic can never enter the offscreen control route.
 * @param {object|null} sender
 * @param {object|null} browserAPI
 * @returns {boolean}
 */
export function isAuthorizedFirefoxContentSender(sender, browserAPI) {
  try {
    const runtimeId = getRuntimeId(browserAPI);
    if (!runtimeId || sender?.id !== runtimeId) return false;
    const tabId = sender?.tab?.id;
    if (!Number.isInteger(tabId) || tabId < 0) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate the Background service-worker sender at the content host ingress.
 * Positive rule: trusted runtime id with no tab binding (a tab-bound sender
 * is another content context, never Background). Document/frame targeting is
 * enforced separately via message data against the host document binding,
 * which is stable across browsers where sender metadata shapes differ.
 * @param {object|null} sender
 * @param {object|null} browserAPI
 * @returns {boolean}
 */
export function isAuthorizedFirefoxContentControlSender(sender, browserAPI) {
  try {
    const runtimeId = getRuntimeId(browserAPI);
    if (!runtimeId || sender?.id !== runtimeId) return false;
    if (sender?.tab !== undefined && sender.tab !== null) return false;
    return true;
  } catch {
    return false;
  }
}

function safeResponseIdentity(value, validator) {
  return validator(value) ? value : null;
}

/**
 * Re-sanitize a host response into a fresh scalar-only record. Unknown keys
 * are discarded, non-scalar values fail the response, and error codes outside
 * the allowlist fail closed. Never returns media, payloads, or exceptions.
 * @param {unknown} response
 * @returns {object|null}
 */
export function sanitizeFirefoxContentResponse(response) {
  if (!isPlainRecord(response)) return null;
  if (hasForbiddenKey(response)) return null;
  if (!Object.keys(response).every(key => allowedResponseKeys.has(key))) return null;
  if (!hasScalarValuesOnly(response)) return null;
  if (typeof response.success !== 'boolean') return null;
  if (response.error !== undefined
    && (typeof response.error !== 'string' || !supportedErrors.has(response.error))) return null;
  if (response.ack !== undefined
    && response.ack !== FIREFOX_CONTENT_ACKS.READY
    && response.ack !== FIREFOX_CONTENT_ACKS.PROVIDER_READY
    && response.ack !== FIREFOX_CONTENT_ACKS.DISPOSED) return null;
  if (response.status !== undefined
    && response.status !== FIREFOX_CONTENT_STATUS.IDLE
    && response.status !== FIREFOX_CONTENT_STATUS.PREPARING_CAPTURE
    && response.status !== FIREFOX_CONTENT_STATUS.CONNECTING_PROVIDER
    && response.status !== FIREFOX_CONTENT_STATUS.RUNNING) return null;

  return {
    success: response.success,
    ...(response.ack === undefined ? {} : { ack: response.ack }),
    ...(response.status === undefined ? {} : { status: response.status }),
    sessionId: safeResponseIdentity(response.sessionId, isSessionId),
    providerId: isLiveDubbingProviderId(response.providerId) ? response.providerId : null,
    ...(response.tabId === undefined ? {} : { tabId: isTabOrFrameId(response.tabId) ? response.tabId : null }),
    ...(response.frameId === undefined ? {} : { frameId: isTabOrFrameId(response.frameId) ? response.frameId : null }),
    ...(response.documentId === undefined
      ? {}
      : { documentId: isDocumentId(response.documentId) ? response.documentId.trim() : null }),
    ...(response.targetLanguage === undefined ? {} : {
      targetLanguage: typeof response.targetLanguage === 'string' ? response.targetLanguage : null,
    }),
    ...(response.eventSequence === undefined
      ? {}
      : { eventSequence: isEventSequence(response.eventSequence) ? response.eventSequence : null }),
    ...(response.runtimeEventSequence === undefined
      ? {}
      : { runtimeEventSequence: isEventSequence(response.runtimeEventSequence)
        ? response.runtimeEventSequence
        : null }),
    ...(response.providerReady === undefined ? {} : { providerReady: response.providerReady === true }),
    ...(response.setupComplete === undefined ? {} : { setupComplete: response.setupComplete === true }),
    ...(response.active === undefined ? {} : { active: response.active === true }),
    ...(response.prepared === undefined ? {} : { prepared: response.prepared === true }),
    ...(response.disposed === undefined ? {} : { disposed: response.disposed === true }),
    ...(response.idempotent === undefined ? {} : { idempotent: response.idempotent === true }),
    ...(response.ignored === undefined ? {} : { ignored: response.ignored === true }),
    ...(response.error === undefined ? {} : { error: response.error }),
  };
}

/**
 * Require a sanitized host response to echo the exact owning identity:
 * session, provider, event sequence, and tab/frame/document address.
 * Anything inexact is not a success, even when success:true is claimed.
 * @param {object|null} response sanitized response
 * @param {object} descriptor owning Firefox descriptor
 * @returns {boolean}
 */
export function isExactFirefoxContentResponse(response, descriptor) {
  if (!response || typeof response !== 'object') return false;
  return Boolean(descriptor
    && isFirefoxContentDescriptor(descriptor)
    && response.sessionId === descriptor.sessionId
    && response.providerId === descriptor.providerId
    && response.tabId === descriptor.tabId
    && response.frameId === descriptor.frameId
    && typeof response.documentId === 'string'
    && response.documentId.trim() === descriptor.documentId.trim()
    && (response.targetLanguage === undefined
      || response.targetLanguage === descriptor.targetLanguage)
    && response.eventSequence === descriptor.eventSequence);
}
