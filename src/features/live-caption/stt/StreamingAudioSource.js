import { createLiveCaptionNotImplementedError } from '../core/contracts.js';

export const STREAMING_AUDIO_FORMATS = Object.freeze({
  WEBM_OPUS: 'webm-opus',
  PCM16_MONO_16KHZ: 'pcm16-mono-16khz'
});

export const STREAMING_AUDIO_SOURCE_STATES = Object.freeze({
  IDLE: 'idle',
  STARTING: 'starting',
  ACTIVE: 'active',
  STOPPING: 'stopping',
  ERROR: 'error',
  DESTROYED: 'destroyed'
});

function normalizeOptionalNumber(value) {
  if (value == null || value === '') {
    return null;
  }

  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeOptionalString(value) {
  if (value == null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeStreamingAudioFormat(format) {
  const normalized = normalizeOptionalString(format);

  if (!normalized) {
    return null;
  }

  return Object.values(STREAMING_AUDIO_FORMATS).includes(normalized) ? normalized : null;
}

export function normalizeStreamingAudioChunk(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('StreamingAudioSource requires a chunk input object');
  }

  const format = normalizeStreamingAudioFormat(input.format);
  if (!format) {
    throw new TypeError('StreamingAudioSource requires a supported audio format');
  }

  const chunkStartMs = normalizeOptionalNumber(input.chunkStartMs);
  const chunkEndMs = normalizeOptionalNumber(input.chunkEndMs);

  if (chunkStartMs != null && chunkEndMs != null && chunkEndMs < chunkStartMs) {
    throw new TypeError('StreamingAudioSource requires chunkEndMs to be greater than or equal to chunkStartMs');
  }

  return Object.freeze({
    payload: input.payload ?? null,
    format,
    mimeType: normalizeOptionalString(input.mimeType),
    sampleRate: normalizeOptionalNumber(input.sampleRate),
    channelCount: normalizeOptionalNumber(input.channelCount),
    bitDepth: normalizeOptionalNumber(input.bitDepth),
    chunkStartMs,
    chunkEndMs,
    source: normalizeOptionalString(input.source),
    sessionId: normalizeOptionalString(input.sessionId),
    tabId: normalizeOptionalNumber(input.tabId),
    videoFingerprint: normalizeOptionalString(input.videoFingerprint),
    metadata: input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
      ? Object.freeze({ ...input.metadata })
      : Object.freeze({}),
    createdAt: normalizeOptionalNumber(input.createdAt) ?? Date.now()
  });
}

export function createStreamingAudioChunk(input = {}) {
  return normalizeStreamingAudioChunk(input);
}

/**
 * Abstract contract for live-caption streaming audio sources.
 * Owns source-level lifecycle shape and normalized chunk metadata.
 */
export class StreamingAudioSource {
  constructor(sourceId, { logger = null } = {}) {
    if (new.target === StreamingAudioSource) {
      throw createLiveCaptionNotImplementedError('StreamingAudioSource');
    }

    if (typeof sourceId !== 'string' || sourceId.trim().length === 0) {
      throw new TypeError('StreamingAudioSource requires a sourceId');
    }

    this.sourceId = sourceId.trim();
    this.logger = logger ?? null;
    this.state = STREAMING_AUDIO_SOURCE_STATES.IDLE;
    this.session = null;
    this.lastError = null;
    this.lastUpdatedAt = Date.now();
  }

  _touch() {
    this.lastUpdatedAt = Date.now();
  }

  _setState(state, details = {}) {
    this.state = state;
    this._touch();

    this.logger?.debug?.('[StreamingAudioSource] state updated', {
      sourceId: this.sourceId,
      state,
      ...details
    });

    return this.state;
  }

  _normalizeSessionConfig(sessionConfig = {}) {
    if (!sessionConfig || typeof sessionConfig !== 'object' || Array.isArray(sessionConfig)) {
      throw new TypeError('StreamingAudioSource requires a sessionConfig object');
    }

    const sessionId = normalizeOptionalString(sessionConfig.sessionId);
    const tabId = normalizeOptionalNumber(sessionConfig.tabId);
    const videoFingerprint = normalizeOptionalString(sessionConfig.videoFingerprint);

    if (!sessionId) {
      throw new TypeError('StreamingAudioSource requires sessionId');
    }

    if (tabId == null) {
      throw new TypeError('StreamingAudioSource requires tabId');
    }

    if (!videoFingerprint) {
      throw new TypeError('StreamingAudioSource requires videoFingerprint');
    }

    return Object.freeze({
      sessionId,
      tabId,
      videoFingerprint,
      audioFormat: normalizeStreamingAudioFormat(sessionConfig.audioFormat),
      preferredAudioInputFormat: normalizeOptionalString(sessionConfig.preferredAudioInputFormat),
      fallbackAudioInputFormat: normalizeOptionalString(sessionConfig.fallbackAudioInputFormat),
      sampleRate: normalizeOptionalNumber(sessionConfig.sampleRate),
      channelCount: normalizeOptionalNumber(sessionConfig.channelCount),
      bitDepth: normalizeOptionalNumber(sessionConfig.bitDepth),
      providerId: normalizeOptionalString(sessionConfig.providerId),
      providerMode: normalizeOptionalString(sessionConfig.providerMode),
      executionLocation: normalizeOptionalString(sessionConfig.executionLocation),
      providerOptions: sessionConfig.providerOptions && typeof sessionConfig.providerOptions === 'object' && !Array.isArray(sessionConfig.providerOptions)
        ? { ...sessionConfig.providerOptions }
        : {},
      metadata: sessionConfig.metadata && typeof sessionConfig.metadata === 'object' && !Array.isArray(sessionConfig.metadata)
        ? { ...sessionConfig.metadata }
        : {},
      requestId: normalizeOptionalString(sessionConfig.requestId),
      timestamp: normalizeOptionalNumber(sessionConfig.timestamp) ?? Date.now()
    });
  }

  _createSessionSnapshot() {
    return Object.freeze({
      sourceId: this.sourceId,
      state: this.state,
      session: this.session
        ? {
            ...this.session,
            providerOptions: { ...this.session.providerOptions },
            metadata: { ...this.session.metadata }
          }
        : null,
      lastError: this.lastError ? { ...this.lastError } : null,
      lastUpdatedAt: this.lastUpdatedAt
    });
  }

  async start() {
    throw createLiveCaptionNotImplementedError(`${this.constructor.name}.start`);
  }

  async stop() {
    throw createLiveCaptionNotImplementedError(`${this.constructor.name}.stop`);
  }

  async destroy() {
    throw createLiveCaptionNotImplementedError(`${this.constructor.name}.destroy`);
  }

  getStatus() {
    return this._createSessionSnapshot();
  }

  getSessionSnapshot() {
    return this._createSessionSnapshot();
  }
}

export default StreamingAudioSource;
