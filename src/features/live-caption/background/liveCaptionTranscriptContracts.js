import {
  STT_PROVIDER_MODES,
  STT_PROVIDER_EXECUTION_LOCATIONS
} from '../stt/liveCaptionSTTProviderContracts.js';

export {
  STT_PROVIDER_MODES,
  STT_PROVIDER_EXECUTION_LOCATIONS
} from '../stt/liveCaptionSTTProviderContracts.js';

export const LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES = Object.freeze({
  PARTIAL: 'partial',
  FINAL: 'final',
  CORRECTION: 'correction',
  ERROR: 'error'
});

function assertObjectValue(value, contractName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`Live caption transcript contract requires an object for ${contractName}`);
  }

  return value;
}

function normalizeTextValue(value, fieldName) {
  if (typeof value !== 'string') {
    throw new TypeError(`Live caption transcript contract requires ${fieldName}`);
  }

  if (value.trim().length === 0) {
    throw new TypeError(`Live caption transcript contract requires ${fieldName}`);
  }

  return value;
}

function normalizeRequiredString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`Live caption transcript contract requires ${fieldName}`);
  }

  return value.trim();
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

function normalizeNumber(value, fieldName) {
  const normalized = Number(value);

  if (!Number.isFinite(normalized)) {
    throw new TypeError(`Live caption transcript contract requires ${fieldName}`);
  }

  return normalized;
}

function normalizeOptionalNumber(value) {
  if (value == null || value === '') {
    return null;
  }

  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeSourceTimelineType(value) {
  if (value == null || value === '') {
    return null;
  }

  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : String(value).trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return ['capture', 'provider', 'media', 'unknown'].includes(normalized) ? normalized : 'unknown';
}

function normalizeOptionalSourceResetId(value) {
  if (value == null || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalProjectedMediaTime(value) {
  if (value == null) {
    return null;
  }

  if (typeof value === 'string' && value.trim().length === 0) {
    return null;
  }

  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeTimelineProjectionStatus(value) {
  if (value == null || value === '') {
    return null;
  }

  const normalized = typeof value === 'string'
    ? value.trim().toLowerCase()
    : String(value).trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  return ['mapped', 'unmapped', 'boundary_crossing', 'invalid'].includes(normalized) ? normalized : null;
}

function normalizeOptionalSourceClockId(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeEventType(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';

  if (!normalized || !Object.values(LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES).includes(normalized)) {
    throw new TypeError('Live caption transcript contract requires a valid eventType');
  }

  return normalized;
}

function normalizeProviderMode(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';

  if (!normalized || !Object.values(STT_PROVIDER_MODES).includes(normalized)) {
    throw new TypeError('Live caption transcript contract requires a valid providerMode');
  }

  return normalized;
}

function normalizeErrorValue(error) {
  const sourceError = error && typeof error === 'object' ? error : { message: error };
  const message = typeof sourceError.message === 'string' && sourceError.message.trim().length > 0
    ? sourceError.message
    : 'Live caption transcript event failed';

  return Object.freeze({
    code: normalizeOptionalString(sourceError.code) ?? 'provider_error',
    message,
    type: normalizeOptionalString(sourceError.type),
    providerId: normalizeOptionalString(sourceError.providerId),
    providerName: normalizeOptionalString(sourceError.providerName),
    statusCode: normalizeOptionalNumber(sourceError.statusCode ?? sourceError.status),
    retryable: Boolean(sourceError.retryable),
    details: sourceError.details ?? null
  });
}

function normalizeEventIdentity(event, eventType) {
  const sessionId = normalizeRequiredString(event.sessionId, 'sessionId');
  const videoFingerprint = normalizeRequiredString(event.videoFingerprint, 'videoFingerprint');
  const providerId = normalizeRequiredString(event.providerId, 'providerId');
  const providerMode = normalizeProviderMode(event.providerMode);
  const tabId = normalizeNumber(event.tabId, 'tabId');
  const segmentId = eventType === LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.ERROR
    ? normalizeOptionalString(event.segmentId)
    : normalizeRequiredString(event.segmentId, 'segmentId');
  const revision = eventType === LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.ERROR
    ? normalizeOptionalNumber(event.revision)
    : normalizeNumber(event.revision, 'revision');

  return {
    sessionId,
    videoFingerprint,
    providerId,
    providerMode,
    tabId,
    segmentId,
    revision
  };
}

export function normalizeLiveCaptionTranscriptEvent(input = {}) {
  const event = assertObjectValue(input, 'transcript-event');
  const eventType = normalizeEventType(event.eventType ?? event.type);
  const identity = normalizeEventIdentity(event, eventType);
  const eventId = normalizeRequiredString(event.eventId ?? `${identity.sessionId}:${identity.segmentId ?? 'error'}:${identity.revision ?? '0'}:${eventType}`, 'eventId');
  const createdAt = normalizeOptionalNumber(event.createdAt ?? Date.now()) ?? Date.now();
  const updatedAt = normalizeOptionalNumber(event.updatedAt);
  const segmentStartMs = normalizeOptionalNumber(event.segmentStartMs);
  const segmentEndMs = normalizeOptionalNumber(event.segmentEndMs);
  const sourceStartMs = normalizeOptionalNumber(event.sourceStartMs);
  const sourceEndMs = normalizeOptionalNumber(event.sourceEndMs);

  if (eventType === LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.FINAL || eventType === LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.CORRECTION) {
    if (segmentStartMs == null || segmentEndMs == null) {
      throw new TypeError('Live caption transcript contract requires segment timing for final and correction events');
    }
  }

  if (eventType === LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.CORRECTION
    && normalizeOptionalString(event.supersedesSegmentId) == null
    && normalizeOptionalString(event.supersedesEventId) == null) {
    throw new TypeError('Live caption transcript contract requires supersedesSegmentId or supersedesEventId for correction events');
  }

  const normalized = {
    eventId,
    eventType,
    providerId: identity.providerId,
    providerMode: identity.providerMode,
    sessionId: identity.sessionId,
    tabId: identity.tabId,
    videoFingerprint: identity.videoFingerprint,
    segmentId: identity.segmentId,
    revision: identity.revision,
    segmentStartMs,
    segmentEndMs,
    sourceTimelineType: normalizeSourceTimelineType(event.sourceTimelineType),
    sourceStartMs,
    sourceEndMs,
    sourceClockId: normalizeOptionalSourceClockId(event.sourceClockId),
    sourceSequence: normalizeOptionalNumber(event.sourceSequence),
    sourceResetId: normalizeOptionalSourceResetId(event.sourceResetId),
    projectedMediaStartMs: normalizeOptionalProjectedMediaTime(event.projectedMediaStartMs),
    projectedMediaEndMs: normalizeOptionalProjectedMediaTime(event.projectedMediaEndMs),
    timelineProjectionStatus: normalizeTimelineProjectionStatus(event.timelineProjectionStatus),
    timelineProjectionAnchorId: normalizeOptionalString(event.timelineProjectionAnchorId),
    timelineProjectionReason: normalizeOptionalString(event.timelineProjectionReason),
    text: eventType === LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.ERROR
      ? null
      : normalizeTextValue(event.text ?? event.originalText ?? '', 'text'),
    sourceLanguage: normalizeOptionalString(event.sourceLanguage),
    targetLanguage: normalizeOptionalString(event.targetLanguage),
    confidence: normalizeOptionalNumber(event.confidence),
    isFinal: eventType === LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.FINAL
      || eventType === LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.CORRECTION,
    supersedesEventId: normalizeOptionalString(event.supersedesEventId),
    supersedesSegmentId: normalizeOptionalString(event.supersedesSegmentId),
    error: eventType === LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES.ERROR
      ? normalizeErrorValue(event.error ?? event)
      : null,
    createdAt,
    updatedAt,
    providerUtteranceId: normalizeOptionalString(event.providerUtteranceId),
    providerSequence: normalizeOptionalNumber(event.providerSequence),
    providerRevision: normalizeOptionalNumber(event.providerRevision),
    providerStreamId: normalizeOptionalString(event.providerStreamId),
    providerChannel: typeof event.providerChannel === 'number'
      ? event.providerChannel
      : (typeof event.providerChannel === 'string' && event.providerChannel.trim().length > 0
        ? event.providerChannel.trim()
        : null),
    metadata: event.metadata && typeof event.metadata === 'object' ? { ...event.metadata } : {}
  };

  return Object.freeze(normalized);
}

export function createLiveCaptionTranscriptEvent(input = {}) {
  return normalizeLiveCaptionTranscriptEvent(input);
}

export default {
  LIVE_CAPTION_TRANSCRIPT_EVENT_TYPES,
  STT_PROVIDER_MODES,
  STT_PROVIDER_EXECUTION_LOCATIONS,
  normalizeLiveCaptionTranscriptEvent,
  createLiveCaptionTranscriptEvent
};
