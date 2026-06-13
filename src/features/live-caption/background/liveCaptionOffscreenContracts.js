import {
  STT_PROVIDER_EXECUTION_LOCATIONS,
  STT_PROVIDER_MODES
} from '../stt/liveCaptionSTTProviderContracts.js';
import {
  normalizeLiveCaptionTranscriptEvent
} from './liveCaptionTranscriptContracts.js';

export const LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES = Object.freeze({
  START_CAPTURE_REQUEST: 'live-caption/offscreen/start-capture-request',
  STOP_CAPTURE_REQUEST: 'live-caption/offscreen/stop-capture-request',
  STATUS_REQUEST: 'live-caption/offscreen/status-request',
  STATUS_RESPONSE: 'live-caption/offscreen/status-response',
  SNAPSHOT_RESPONSE: 'live-caption/offscreen/snapshot-response',
  FINALIZED_CHUNK: 'live-caption/offscreen/finalized-chunk',
  CAPTURE_ERROR: 'live-caption/offscreen/capture-error'
});

export const LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES = Object.freeze({
  START_STREAMING_STT_SESSION: 'live-caption/offscreen/start-streaming-stt-session',
  STOP_STREAMING_STT_SESSION: 'live-caption/offscreen/stop-streaming-stt-session',
  STREAMING_STT_TRANSCRIPT_EVENT: 'live-caption/offscreen/streaming-stt-transcript-event',
  STREAMING_STT_STATUS: 'live-caption/offscreen/streaming-stt-status',
  STREAMING_STT_ERROR: 'live-caption/offscreen/streaming-stt-error'
});

export const LIVE_CAPTION_CAPTURE_STATES = Object.freeze({
  IDLE: 'idle',
  STARTING: 'starting',
  ACTIVE: 'active',
  STOPPING: 'stopping',
  RECOVERING: 'recovering',
  UNAVAILABLE: 'unavailable',
  ERROR: 'error'
});

export const LIVE_CAPTION_OFFSCREEN_ERROR_CODES = Object.freeze({
  MISSING_SESSION_ID: 'missing_session_id',
  MISSING_TAB_ID: 'missing_tab_id',
  MISSING_VIDEO_FINGERPRINT: 'missing_video_fingerprint',
  MISSING_CHUNK_TIMING: 'missing_chunk_timing',
  MISSING_MIME_TYPE: 'missing_mime_type',
  MISSING_PAYLOAD: 'missing_payload',
  RAW_STREAM_NOT_ALLOWED: 'raw_stream_not_allowed',
  INVALID_RESPONSE: 'invalid_response',
  OFFSCREEN_UNAVAILABLE: 'offscreen_unavailable'
});

function normalizeNumericValue(value, fieldName) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`LiveCaption offscreen contract requires a valid ${fieldName}`);
  }

  return number;
}

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`LiveCaption offscreen contract requires ${fieldName}`);
  }

  return value.trim();
}

function assertRequiredFields(input, requiredFields, contractName) {
  for (const field of requiredFields) {
    if (input[field] === undefined || input[field] === null || input[field] === '') {
      throw new TypeError(`LiveCaption offscreen contract requires ${field} for ${contractName}`);
    }
  }
}

function isRawStreamLike(value) {
  if (!value || typeof value !== 'object') {
    return false;
  }

  if (typeof value.getTracks === 'function' || typeof value.addTrack === 'function' || typeof value.removeTrack === 'function') {
    return true;
  }

  return Boolean(value.stream || value.mediaStream || value.rawStream || value.track || value.tracks);
}

function rejectRawStreamLikePayload(payload, contractName) {
  if (!isRawStreamLike(payload)) {
    return;
  }

  throw new TypeError(`Raw stream handoff is not allowed in ${contractName}`);
}

function createBaseMessage(type, fields = {}) {
  return Object.freeze({
    type,
    source: 'background',
    target: 'offscreen',
    ...fields
  });
}

function normalizeOptionalString(value) {
  if (value == null) {
    return null;
  }

  if (typeof value !== 'string') {
    return String(value);
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeExecutionLocation(value) {
  const normalized = normalizeOptionalString(value)?.toLowerCase() ?? '';
  if (
    normalized !== STT_PROVIDER_EXECUTION_LOCATIONS.BACKGROUND
    && normalized !== STT_PROVIDER_EXECUTION_LOCATIONS.OFFSCREEN
  ) {
    throw new TypeError('LiveCaption offscreen contract requires a valid executionLocation');
  }
  return normalized;
}

function normalizeProviderMode(value) {
  const normalized = normalizeOptionalString(value)?.toLowerCase() ?? '';
  if (normalized !== STT_PROVIDER_MODES.BATCH && normalized !== STT_PROVIDER_MODES.STREAMING) {
    throw new TypeError('LiveCaption offscreen contract requires a valid providerMode');
  }
  return normalized;
}

function normalizeTranscriptEventPayload(payload, contractName) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError(`LiveCaption offscreen contract requires transcript event payload for ${contractName}`);
  }

  return payload;
}

export function createLiveCaptionStartCaptureRequest({
  sessionId,
  tabId,
  videoFingerprint,
  captureOptions = {},
  requestId = null,
  sentAt = Date.now()
} = {}) {
  assertRequiredFields({ sessionId, tabId, videoFingerprint }, ['sessionId', 'tabId', 'videoFingerprint'], 'start-capture-request');
  rejectRawStreamLikePayload(captureOptions, 'start-capture-request.captureOptions');

  return createBaseMessage(LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.START_CAPTURE_REQUEST, {
    requestId,
    sentAt,
    sessionId: assertNonEmptyString(sessionId, 'sessionId'),
    tabId: normalizeNumericValue(tabId, 'tabId'),
    videoFingerprint: assertNonEmptyString(videoFingerprint, 'videoFingerprint'),
    captureOptions: { ...captureOptions }
  });
}

export function createLiveCaptionStopCaptureRequest({
  sessionId,
  tabId,
  videoFingerprint,
  reason = 'stop',
  requestId = null,
  sentAt = Date.now()
} = {}) {
  assertRequiredFields({ sessionId, tabId, videoFingerprint }, ['sessionId', 'tabId', 'videoFingerprint'], 'stop-capture-request');

  return createBaseMessage(LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.STOP_CAPTURE_REQUEST, {
    requestId,
    sentAt,
    sessionId: assertNonEmptyString(sessionId, 'sessionId'),
    tabId: normalizeNumericValue(tabId, 'tabId'),
    videoFingerprint: assertNonEmptyString(videoFingerprint, 'videoFingerprint'),
    reason
  });
}

export function createLiveCaptionStatusRequest({
  sessionId,
  tabId,
  videoFingerprint,
  requestId = null,
  sentAt = Date.now()
} = {}) {
  assertRequiredFields({ sessionId, tabId, videoFingerprint }, ['sessionId', 'tabId', 'videoFingerprint'], 'status-request');

  return createBaseMessage(LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.STATUS_REQUEST, {
    requestId,
    sentAt,
    sessionId: assertNonEmptyString(sessionId, 'sessionId'),
    tabId: normalizeNumericValue(tabId, 'tabId'),
    videoFingerprint: assertNonEmptyString(videoFingerprint, 'videoFingerprint')
  });
}

export function createLiveCaptionFinalizedChunkMessage({
  sessionId,
  tabId,
  videoFingerprint,
  chunkStartMs,
  chunkEndMs,
  mimeType,
  chunkPayload,
  payloadKind = 'blob',
  requestId = null,
  sentAt = Date.now()
} = {}) {
  assertRequiredFields(
    { sessionId, tabId, videoFingerprint, chunkStartMs, chunkEndMs, mimeType, chunkPayload },
    ['sessionId', 'tabId', 'videoFingerprint', 'chunkStartMs', 'chunkEndMs', 'mimeType', 'chunkPayload'],
    'finalized-chunk'
  );

  rejectRawStreamLikePayload(chunkPayload, 'finalized-chunk');

  const normalizedStart = normalizeNumericValue(chunkStartMs, 'chunkStartMs');
  const normalizedEnd = normalizeNumericValue(chunkEndMs, 'chunkEndMs');

  if (normalizedEnd < normalizedStart) {
    throw new TypeError('LiveCaption finalized chunk requires chunkEndMs to be greater than or equal to chunkStartMs');
  }

  return createBaseMessage(LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.FINALIZED_CHUNK, {
    requestId,
    sentAt,
    sessionId: assertNonEmptyString(sessionId, 'sessionId'),
    tabId: normalizeNumericValue(tabId, 'tabId'),
    videoFingerprint: assertNonEmptyString(videoFingerprint, 'videoFingerprint'),
    chunkStartMs: normalizedStart,
    chunkEndMs: normalizedEnd,
    mimeType: assertNonEmptyString(mimeType, 'mimeType'),
    payloadKind,
    chunkPayload
  });
}

export function createLiveCaptionCaptureErrorMessage({
  sessionId,
  tabId,
  videoFingerprint,
  code = LIVE_CAPTION_OFFSCREEN_ERROR_CODES.INVALID_RESPONSE,
  message = 'Live caption offscreen capture error',
  details = null,
  requestId = null,
  sentAt = Date.now()
} = {}) {
  assertRequiredFields({ sessionId, tabId, videoFingerprint }, ['sessionId', 'tabId', 'videoFingerprint'], 'capture-error');

  return createBaseMessage(LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.CAPTURE_ERROR, {
    requestId,
    sentAt,
    sessionId: assertNonEmptyString(sessionId, 'sessionId'),
    tabId: normalizeNumericValue(tabId, 'tabId'),
    videoFingerprint: assertNonEmptyString(videoFingerprint, 'videoFingerprint'),
    error: {
      code,
      message,
      details
    }
  });
}

export function createLiveCaptionStartStreamingSttSessionRequest({
  sessionId,
  tabId,
  videoFingerprint,
  providerId,
  providerMode = STT_PROVIDER_MODES.STREAMING,
  executionLocation = STT_PROVIDER_EXECUTION_LOCATIONS.OFFSCREEN,
  sourceLanguage = null,
  targetLanguage = null,
  providerOptions = {},
  metadata = {},
  requestId = null,
  sentAt = Date.now()
} = {}) {
  assertRequiredFields(
    { sessionId, tabId, videoFingerprint, providerId },
    ['sessionId', 'tabId', 'videoFingerprint', 'providerId'],
    'start-streaming-stt-session'
  );

  rejectRawStreamLikePayload(providerOptions, 'start-streaming-stt-session.providerOptions');
  rejectRawStreamLikePayload(metadata, 'start-streaming-stt-session.metadata');

  const normalizedProviderMode = normalizeProviderMode(providerMode);
  const normalizedExecutionLocation = normalizeExecutionLocation(executionLocation);

  if (normalizedProviderMode !== STT_PROVIDER_MODES.STREAMING) {
    throw new TypeError('LiveCaption offscreen contract requires providerMode to be streaming for start-streaming-stt-session');
  }

  if (normalizedExecutionLocation !== STT_PROVIDER_EXECUTION_LOCATIONS.OFFSCREEN) {
    throw new TypeError('LiveCaption offscreen contract requires executionLocation to be offscreen for start-streaming-stt-session');
  }

  return createBaseMessage(LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.START_STREAMING_STT_SESSION, {
    requestId,
    sentAt,
    sessionId: assertNonEmptyString(sessionId, 'sessionId'),
    tabId: normalizeNumericValue(tabId, 'tabId'),
    videoFingerprint: assertNonEmptyString(videoFingerprint, 'videoFingerprint'),
    providerId: assertNonEmptyString(providerId, 'providerId'),
    providerMode: normalizedProviderMode,
    executionLocation: normalizedExecutionLocation,
    sourceLanguage: normalizeOptionalString(sourceLanguage),
    targetLanguage: normalizeOptionalString(targetLanguage),
    providerOptions: { ...providerOptions },
    metadata: { ...metadata }
  });
}

export function createLiveCaptionStopStreamingSttSessionRequest({
  sessionId,
  tabId,
  videoFingerprint,
  providerId = null,
  reason = 'stop',
  requestId = null,
  sentAt = Date.now()
} = {}) {
  assertRequiredFields(
    { sessionId, tabId, videoFingerprint },
    ['sessionId', 'tabId', 'videoFingerprint'],
    'stop-streaming-stt-session'
  );

  return createBaseMessage(LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STOP_STREAMING_STT_SESSION, {
    requestId,
    sentAt,
    sessionId: assertNonEmptyString(sessionId, 'sessionId'),
    tabId: normalizeNumericValue(tabId, 'tabId'),
    videoFingerprint: assertNonEmptyString(videoFingerprint, 'videoFingerprint'),
    providerId: normalizeOptionalString(providerId),
    reason
  });
}

export function createLiveCaptionStreamingSttTranscriptEventMessage({
  sessionId,
  tabId,
  videoFingerprint,
  event,
  requestId = null,
  sentAt = Date.now()
} = {}) {
  assertRequiredFields(
    { sessionId, tabId, videoFingerprint, event },
    ['sessionId', 'tabId', 'videoFingerprint', 'event'],
    'streaming-stt-transcript-event'
  );

  const normalizedEvent = normalizeLiveCaptionTranscriptEvent(
    normalizeTranscriptEventPayload(event, 'streaming-stt-transcript-event.event')
  );

  return createBaseMessage(LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_TRANSCRIPT_EVENT, {
    requestId,
    sentAt,
    sessionId: assertNonEmptyString(sessionId, 'sessionId'),
    tabId: normalizeNumericValue(tabId, 'tabId'),
    videoFingerprint: assertNonEmptyString(videoFingerprint, 'videoFingerprint'),
    event: normalizedEvent
  });
}

export function createLiveCaptionStreamingSttStatusMessage({
  sessionId,
  tabId,
  videoFingerprint,
  providerId = null,
  status = 'idle',
  details = null,
  requestId = null,
  sentAt = Date.now()
} = {}) {
  assertRequiredFields(
    { sessionId, tabId, videoFingerprint },
    ['sessionId', 'tabId', 'videoFingerprint'],
    'streaming-stt-status'
  );

  return createBaseMessage(LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_STATUS, {
    requestId,
    sentAt,
    sessionId: assertNonEmptyString(sessionId, 'sessionId'),
    tabId: normalizeNumericValue(tabId, 'tabId'),
    videoFingerprint: assertNonEmptyString(videoFingerprint, 'videoFingerprint'),
    providerId: normalizeOptionalString(providerId),
    status: normalizeOptionalString(status) ?? 'idle',
    details: details && typeof details === 'object' ? { ...details } : null
  });
}

export function createLiveCaptionStreamingSttErrorMessage({
  sessionId,
  tabId,
  videoFingerprint,
  providerId = null,
  error = {},
  requestId = null,
  sentAt = Date.now()
} = {}) {
  assertRequiredFields(
    { sessionId, tabId, videoFingerprint },
    ['sessionId', 'tabId', 'videoFingerprint'],
    'streaming-stt-error'
  );

  return createBaseMessage(LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES.STREAMING_STT_ERROR, {
    requestId,
    sentAt,
    sessionId: assertNonEmptyString(sessionId, 'sessionId'),
    tabId: normalizeNumericValue(tabId, 'tabId'),
    videoFingerprint: assertNonEmptyString(videoFingerprint, 'videoFingerprint'),
    providerId: normalizeOptionalString(providerId),
    error: error && typeof error === 'object' ? { ...error } : { message: String(error) }
  });
}

export function createLiveCaptionOffscreenSnapshotResponse({
  sessionId,
  tabId,
  videoFingerprint,
  status = LIVE_CAPTION_CAPTURE_STATES.IDLE,
  sessionSnapshot = null,
  requestId = null,
  sentAt = Date.now()
} = {}) {
  assertRequiredFields({ sessionId, tabId, videoFingerprint }, ['sessionId', 'tabId', 'videoFingerprint'], 'snapshot-response');

  return createBaseMessage(LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.SNAPSHOT_RESPONSE, {
    requestId,
    sentAt,
    ok: true,
    sessionId: assertNonEmptyString(sessionId, 'sessionId'),
    tabId: normalizeNumericValue(tabId, 'tabId'),
    videoFingerprint: assertNonEmptyString(videoFingerprint, 'videoFingerprint'),
    status,
    sessionSnapshot
  });
}

export function createLiveCaptionFailClosedResponse({
  sessionId = null,
  tabId = null,
  videoFingerprint = null,
  reason = 'reconciliation_failed',
  code = LIVE_CAPTION_OFFSCREEN_ERROR_CODES.INVALID_RESPONSE,
  message = 'Live caption offscreen response rejected',
  requestId = null,
  sentAt = Date.now(),
  details = null
} = {}) {
  return createBaseMessage(LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.CAPTURE_ERROR, {
    requestId,
    sentAt,
    ok: false,
    failClosed: true,
    sessionId,
    tabId,
    videoFingerprint,
    error: {
      code,
      message,
      reason,
      details
    }
  });
}

export function normalizeLiveCaptionOffscreenResponse(response, context = {}) {
  if (!response || typeof response !== 'object') {
    return createLiveCaptionFailClosedResponse({
      ...context,
      code: LIVE_CAPTION_OFFSCREEN_ERROR_CODES.INVALID_RESPONSE,
      message: 'Offscreen response was not an object',
      details: response
    });
  }

  const type = response.type || context.expectedType || null;
  const sessionId = response.sessionId ?? context.sessionId ?? null;
  const tabId = response.tabId ?? context.tabId ?? null;
  const videoFingerprint = response.videoFingerprint ?? context.videoFingerprint ?? null;

  if (response.ok === false || response.failClosed === true) {
    return createLiveCaptionFailClosedResponse({
      sessionId,
      tabId,
      videoFingerprint,
      reason: response.error?.reason || context.reason || 'offscreen_failure',
      code: response.error?.code || LIVE_CAPTION_OFFSCREEN_ERROR_CODES.INVALID_RESPONSE,
      message: response.error?.message || 'Offscreen returned an error response',
      details: response.error?.details ?? response.details ?? response
    });
  }

  if (!type) {
    return createLiveCaptionFailClosedResponse({
      sessionId,
      tabId,
      videoFingerprint,
      code: LIVE_CAPTION_OFFSCREEN_ERROR_CODES.INVALID_RESPONSE,
      message: 'Offscreen response missing message type',
      details: response
    });
  }

  if (type === LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.STATUS_RESPONSE ||
      type === LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.SNAPSHOT_RESPONSE) {
    return createBaseMessage(type, {
      ok: true,
      sessionId,
      tabId: tabId === null ? null : normalizeNumericValue(tabId, 'tabId'),
      videoFingerprint,
      status: response.status || LIVE_CAPTION_CAPTURE_STATES.IDLE,
      sessionSnapshot: response.sessionSnapshot ? { ...response.sessionSnapshot } : null,
      requestId: response.requestId ?? null,
      sentAt: response.sentAt ?? null
    });
  }

  if (type === LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.FINALIZED_CHUNK) {
    return createBaseMessage(type, {
      ok: true,
      sessionId,
      tabId: tabId === null ? null : normalizeNumericValue(tabId, 'tabId'),
      videoFingerprint,
      chunkStartMs: response.chunkStartMs ?? null,
      chunkEndMs: response.chunkEndMs ?? null,
      mimeType: response.mimeType ?? null,
      payloadKind: response.payloadKind ?? null,
      chunkPayload: response.chunkPayload ?? null,
      requestId: response.requestId ?? null,
      sentAt: response.sentAt ?? null
    });
  }

  if (type === LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES.CAPTURE_ERROR) {
    return createLiveCaptionFailClosedResponse({
      sessionId,
      tabId,
      videoFingerprint,
      code: response.error?.code || LIVE_CAPTION_OFFSCREEN_ERROR_CODES.INVALID_RESPONSE,
      message: response.error?.message || 'Offscreen returned an error response',
      reason: response.error?.reason || context.reason || 'offscreen_error',
      details: response.error?.details ?? response.details ?? response
    });
  }

  return createLiveCaptionFailClosedResponse({
    sessionId,
    tabId,
    videoFingerprint,
    code: LIVE_CAPTION_OFFSCREEN_ERROR_CODES.INVALID_RESPONSE,
    message: `Unsupported live-caption offscreen response: ${String(type)}`,
    details: response
  });
}

export default {
  LIVE_CAPTION_OFFSCREEN_MESSAGE_TYPES,
  LIVE_CAPTION_STREAMING_OFFSCREEN_MESSAGE_TYPES,
  LIVE_CAPTION_CAPTURE_STATES,
  LIVE_CAPTION_OFFSCREEN_ERROR_CODES,
  createLiveCaptionStartCaptureRequest,
  createLiveCaptionStopCaptureRequest,
  createLiveCaptionStatusRequest,
  createLiveCaptionFinalizedChunkMessage,
  createLiveCaptionCaptureErrorMessage,
  createLiveCaptionStartStreamingSttSessionRequest,
  createLiveCaptionStopStreamingSttSessionRequest,
  createLiveCaptionStreamingSttTranscriptEventMessage,
  createLiveCaptionStreamingSttStatusMessage,
  createLiveCaptionStreamingSttErrorMessage,
  createLiveCaptionOffscreenSnapshotResponse,
  createLiveCaptionFailClosedResponse,
  normalizeLiveCaptionOffscreenResponse
};
