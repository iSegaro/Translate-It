import { createLiveCaptionNotImplementedError } from '../core/contracts.js';

export const STT_STREAMING_PROVIDER_STATES = Object.freeze({
  IDLE: 'idle',
  STARTING: 'starting',
  ACTIVE: 'active',
  STOPPING: 'stopping',
  CLOSED: 'closed',
  ERROR: 'error',
  DESTROYED: 'destroyed'
});

export const STT_STREAMING_PROVIDER_EVENT_TYPES = Object.freeze({
  STATUS: 'status',
  TRANSCRIPT: 'transcript',
  ERROR: 'error',
  CLOSED: 'closed'
});

function assertProviderId(providerId) {
  if (typeof providerId !== 'string' || providerId.trim().length === 0) {
    throw new TypeError('BaseStreamingSTTProvider requires providerId');
  }

  return providerId.trim();
}

function assertSessionConfig(sessionConfig) {
  if (!sessionConfig || typeof sessionConfig !== 'object' || Array.isArray(sessionConfig)) {
    throw new TypeError('BaseStreamingSTTProvider.startSession requires a sessionConfig object');
  }

  const sessionId = typeof sessionConfig.sessionId === 'string' ? sessionConfig.sessionId.trim() : '';
  const tabId = sessionConfig.tabId;
  const videoFingerprint = typeof sessionConfig.videoFingerprint === 'string' ? sessionConfig.videoFingerprint.trim() : '';

  if (!sessionId) {
    throw new TypeError('BaseStreamingSTTProvider.startSession requires sessionId');
  }

  if (tabId == null || tabId === '') {
    throw new TypeError('BaseStreamingSTTProvider.startSession requires tabId');
  }

  if (!videoFingerprint) {
    throw new TypeError('BaseStreamingSTTProvider.startSession requires videoFingerprint');
  }

  return {
    ...sessionConfig,
    sessionId,
    tabId,
    videoFingerprint
  };
}

function normalizeTimestamp(value = Date.now()) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function normalizeOptionalString(value) {
  if (value == null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function cloneObject(value) {
  if (!value || typeof value !== 'object') {
    return value ?? null;
  }

  return Array.isArray(value) ? [...value] : { ...value };
}

export function normalizeStreamingProviderEventEnvelope(type, payload = {}, fallback = {}) {
  const normalizedType = normalizeOptionalString(type);

  if (!normalizedType) {
    throw new TypeError('BaseStreamingSTTProvider requires a valid event type');
  }

  const providerId = normalizeOptionalString(payload.providerId ?? fallback.providerId);
  const sessionId = normalizeOptionalString(payload.sessionId ?? fallback.sessionId);
  const tabId = payload.tabId ?? fallback.tabId ?? null;
  const videoFingerprint = normalizeOptionalString(payload.videoFingerprint ?? fallback.videoFingerprint);

  return Object.freeze({
    type: normalizedType,
    providerId,
    sessionId,
    tabId,
    videoFingerprint,
    timestamp: normalizeTimestamp(payload.timestamp ?? fallback.timestamp ?? Date.now()),
    ...Object.fromEntries(
      Object.entries(payload).filter(([key]) => !['type', 'providerId', 'sessionId', 'tabId', 'videoFingerprint', 'timestamp'].includes(key))
    )
  });
}

function normalizeErrorPayload(error, fallback = {}) {
  if (!error) {
    return Object.freeze({
      name: 'Error',
      message: 'Streaming provider error',
      code: fallback.code ?? null,
      type: fallback.type ?? null,
      retryable: Boolean(fallback.retryable),
      details: fallback.details ?? null
    });
  }

  if (typeof error === 'string') {
    return Object.freeze({
      name: 'Error',
      message: error,
      code: fallback.code ?? null,
      type: fallback.type ?? null,
      retryable: Boolean(fallback.retryable),
      details: fallback.details ?? null
    });
  }

  return Object.freeze({
    name: error.name || 'Error',
    message: typeof error.message === 'string' && error.message.trim().length > 0
      ? error.message
      : (fallback.message ?? 'Streaming provider error'),
    code: normalizeOptionalString(error.code ?? fallback.code),
    type: normalizeOptionalString(error.type ?? fallback.type),
    retryable: Boolean(error.retryable ?? fallback.retryable),
    details: cloneObject(error.details ?? fallback.details) ?? null
  });
}

/**
 * Abstract base contract for live-caption streaming STT providers.
 * Owns session state, lifecycle transitions, and event sink normalization.
 */
export class BaseStreamingSTTProvider {
  constructor(providerId, { eventSink = null, providerName = null, logger = null } = {}) {
    if (new.target === BaseStreamingSTTProvider) {
      throw createLiveCaptionNotImplementedError('BaseStreamingSTTProvider');
    }

    this.providerId = assertProviderId(providerId);
    this.providerName = providerName || this.providerId || this.constructor.name;
    this.eventSink = eventSink ?? null;
    this.logger = logger ?? null;
    this.state = STT_STREAMING_PROVIDER_STATES.IDLE;
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

    if (this.logger?.debug) {
      this.logger.debug(`[${this.providerName}] Streaming provider state updated`, {
        providerId: this.providerId,
        state,
        ...details
      });
    }

    return this.state;
  }

  _emit(event) {
    if (!this.eventSink || typeof this.eventSink.emit !== 'function') {
      return event;
    }

    this.eventSink.emit(event);
    return event;
  }

  _emitTypedEvent(type, payload = {}) {
    const envelope = normalizeStreamingProviderEventEnvelope(type, payload, {
      providerId: this.providerId,
      sessionId: this.session?.sessionId ?? null,
      tabId: this.session?.tabId ?? null,
      videoFingerprint: this.session?.videoFingerprint ?? null
    });

    return this._emit(envelope);
  }

  _normalizeSessionConfig(sessionConfig) {
    const normalized = assertSessionConfig(sessionConfig);

    return Object.freeze({
      sessionId: normalized.sessionId,
      tabId: normalized.tabId,
      videoFingerprint: normalized.videoFingerprint,
      sourceLanguage: normalizeOptionalString(normalized.sourceLanguage),
      targetLanguage: normalizeOptionalString(normalized.targetLanguage),
      providerOptions: cloneObject(normalized.providerOptions) ?? {},
      metadata: cloneObject(normalized.metadata) ?? {},
      requestId: normalizeOptionalString(normalized.requestId),
      timestamp: normalizeTimestamp(normalized.timestamp ?? Date.now())
    });
  }

  _createSessionSnapshot() {
    return Object.freeze({
      providerId: this.providerId,
      providerName: this.providerName,
      state: this.state,
      session: this.session ? { ...this.session, providerOptions: { ...this.session.providerOptions }, metadata: { ...this.session.metadata } } : null,
      lastError: this.lastError ? { ...this.lastError } : null,
      lastUpdatedAt: this.lastUpdatedAt
    });
  }

  _normalizeError(error, fallback = {}) {
    return normalizeErrorPayload(error, {
      code: fallback.code ?? null,
      type: fallback.type ?? null,
      retryable: fallback.retryable ?? false,
      message: fallback.message ?? null,
      details: fallback.details ?? null
    });
  }

  async _onStartSession() {}

  async _onStopSession() {}

  async _onDestroySession() {}

  async _onHandleAudioChunk() {
    return Object.freeze({
      handled: false,
      status: 'unsupported',
      reason: 'audio_chunk_not_supported',
      providerId: this.providerId,
      sessionId: this.session?.sessionId ?? null,
      tabId: this.session?.tabId ?? null,
      videoFingerprint: this.session?.videoFingerprint ?? null
    });
  }

  async startSession(sessionConfig, options = {}) {
    if (this.state === STT_STREAMING_PROVIDER_STATES.DESTROYED) {
      throw new TypeError('BaseStreamingSTTProvider cannot start a destroyed provider');
    }

    const normalizedSession = this._normalizeSessionConfig(sessionConfig);
    const existingSession = this.session;

    if (existingSession
      && existingSession.sessionId === normalizedSession.sessionId
      && existingSession.tabId === normalizedSession.tabId
      && existingSession.videoFingerprint === normalizedSession.videoFingerprint
      && (this.state === STT_STREAMING_PROVIDER_STATES.STARTING || this.state === STT_STREAMING_PROVIDER_STATES.ACTIVE)) {
      return this._createSessionSnapshot();
    }

    if (this.state !== STT_STREAMING_PROVIDER_STATES.IDLE && this.state !== STT_STREAMING_PROVIDER_STATES.CLOSED) {
      throw new TypeError(`BaseStreamingSTTProvider cannot start a session while in state ${this.state}`);
    }

    this.session = {
      ...normalizedSession,
      startedAt: normalizedSession.timestamp,
      stoppedAt: null,
      destroyedAt: null
    };
    this.lastError = null;

    this._setState(STT_STREAMING_PROVIDER_STATES.STARTING, {
      sessionId: normalizedSession.sessionId,
      tabId: normalizedSession.tabId,
      videoFingerprint: normalizedSession.videoFingerprint
    });
    this._emitTypedEvent(STT_STREAMING_PROVIDER_EVENT_TYPES.STATUS, {
      state: STT_STREAMING_PROVIDER_STATES.STARTING,
      details: cloneObject(options.details) ?? null
    });

    try {
      await this._onStartSession(this.session, options);
      this._setState(STT_STREAMING_PROVIDER_STATES.ACTIVE, {
        sessionId: normalizedSession.sessionId,
        tabId: normalizedSession.tabId,
        videoFingerprint: normalizedSession.videoFingerprint
      });
      this._emitTypedEvent(STT_STREAMING_PROVIDER_EVENT_TYPES.STATUS, {
        state: STT_STREAMING_PROVIDER_STATES.ACTIVE,
        details: cloneObject(options.details) ?? null
      });
      return this._createSessionSnapshot();
    } catch (error) {
      this.state = STT_STREAMING_PROVIDER_STATES.ERROR;
      this.lastError = this._normalizeError(error, {
        message: error?.message ?? 'Streaming provider failed to start',
        retryable: Boolean(error?.retryable),
        details: error?.details ?? null
      });
      this._touch();
      this._emitTypedEvent(STT_STREAMING_PROVIDER_EVENT_TYPES.ERROR, {
        error: this.lastError,
        state: STT_STREAMING_PROVIDER_STATES.ERROR
      });
      throw this.lastError;
    }
  }

  async handleAudioChunk(audioChunk, metadata = {}) {
    return this._onHandleAudioChunk(audioChunk, metadata);
  }

  async stopSession(options = {}) {
    if (this.state === STT_STREAMING_PROVIDER_STATES.DESTROYED) {
      return this._createSessionSnapshot();
    }

    if (!this.session || this.state === STT_STREAMING_PROVIDER_STATES.CLOSED) {
      return this._createSessionSnapshot();
    }

    if (this.state === STT_STREAMING_PROVIDER_STATES.STOPPING) {
      return this._createSessionSnapshot();
    }

    this._setState(STT_STREAMING_PROVIDER_STATES.STOPPING, {
      sessionId: this.session.sessionId,
      tabId: this.session.tabId,
      videoFingerprint: this.session.videoFingerprint
    });
    this._emitTypedEvent(STT_STREAMING_PROVIDER_EVENT_TYPES.STATUS, {
      state: STT_STREAMING_PROVIDER_STATES.STOPPING,
      reason: normalizeOptionalString(options.reason) ?? 'stop'
    });

    try {
      await this._onStopSession(this.session, options);
    } catch (error) {
      this.state = STT_STREAMING_PROVIDER_STATES.ERROR;
      this.lastError = this._normalizeError(error, {
        message: error?.message ?? 'Streaming provider failed to stop',
        retryable: false,
        details: error?.details ?? null
      });
      this._touch();
      this._emitTypedEvent(STT_STREAMING_PROVIDER_EVENT_TYPES.ERROR, {
        error: this.lastError,
        state: STT_STREAMING_PROVIDER_STATES.ERROR
      });
      throw this.lastError;
    }

    this.session.stoppedAt = Date.now();
    this._setState(STT_STREAMING_PROVIDER_STATES.CLOSED, {
      sessionId: this.session.sessionId,
      tabId: this.session.tabId,
      videoFingerprint: this.session.videoFingerprint
    });
    this._emitTypedEvent(STT_STREAMING_PROVIDER_EVENT_TYPES.STATUS, {
      state: STT_STREAMING_PROVIDER_STATES.CLOSED,
      reason: normalizeOptionalString(options.reason) ?? 'stop'
    });
    this._emitTypedEvent(STT_STREAMING_PROVIDER_EVENT_TYPES.CLOSED, {
      reason: normalizeOptionalString(options.reason) ?? 'stop'
    });

    return this._createSessionSnapshot();
  }

  async destroy(options = {}) {
    if (this.state === STT_STREAMING_PROVIDER_STATES.DESTROYED) {
      return this._createSessionSnapshot();
    }

    if (this.session && this.state !== STT_STREAMING_PROVIDER_STATES.CLOSED) {
      try {
        await this._onStopSession(this.session, {
          ...options,
          reason: options.reason ?? 'destroy'
        });
      } catch (error) {
        this.lastError = this._normalizeError(error, {
          message: error?.message ?? 'Streaming provider failed to destroy cleanly',
          retryable: false,
          details: error?.details ?? null
        });
        this.state = STT_STREAMING_PROVIDER_STATES.ERROR;
        this._touch();
        this._emitTypedEvent(STT_STREAMING_PROVIDER_EVENT_TYPES.ERROR, {
          error: this.lastError,
          state: STT_STREAMING_PROVIDER_STATES.ERROR
        });
      }
    }

    try {
      await this._onDestroySession(this.session, options);
    } finally {
      if (this.session) {
        this.session.destroyedAt = Date.now();
      }

      this._setState(STT_STREAMING_PROVIDER_STATES.DESTROYED, {
        sessionId: this.session?.sessionId ?? null,
        tabId: this.session?.tabId ?? null,
        videoFingerprint: this.session?.videoFingerprint ?? null
      });
      this._emitTypedEvent(STT_STREAMING_PROVIDER_EVENT_TYPES.STATUS, {
        state: STT_STREAMING_PROVIDER_STATES.DESTROYED,
        reason: normalizeOptionalString(options.reason) ?? 'destroy'
      });
      this._emitTypedEvent(STT_STREAMING_PROVIDER_EVENT_TYPES.CLOSED, {
        reason: normalizeOptionalString(options.reason) ?? 'destroy'
      });
      this.session = null;
      this._touch();
    }

    return this._createSessionSnapshot();
  }

  emitStatusEvent(payload = {}) {
    return this._emitTypedEvent(STT_STREAMING_PROVIDER_EVENT_TYPES.STATUS, {
      ...payload,
      state: payload.state ?? this.state
    });
  }

  emitTranscriptEvent(payload = {}) {
    return this._emitTypedEvent(STT_STREAMING_PROVIDER_EVENT_TYPES.TRANSCRIPT, payload);
  }

  emitErrorEvent(payload = {}) {
    const error = this._normalizeError(payload.error ?? payload, payload);
    this.lastError = error;
    this.state = STT_STREAMING_PROVIDER_STATES.ERROR;
    this._touch();

    return this._emitTypedEvent(STT_STREAMING_PROVIDER_EVENT_TYPES.ERROR, {
      ...payload,
      error,
      state: STT_STREAMING_PROVIDER_STATES.ERROR
    });
  }

  emitClosedEvent(payload = {}) {
    return this._emitTypedEvent(STT_STREAMING_PROVIDER_EVENT_TYPES.CLOSED, payload);
  }

  getStatus() {
    return this._createSessionSnapshot();
  }

  getSessionSnapshot() {
    return this._createSessionSnapshot();
  }
}

export default BaseStreamingSTTProvider;
