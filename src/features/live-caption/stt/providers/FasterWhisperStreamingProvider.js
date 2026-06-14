import {
  BaseStreamingSTTProvider,
  STT_STREAMING_PROVIDER_EVENT_TYPES,
  STT_STREAMING_PROVIDER_STATES
} from '../BaseStreamingSTTProvider.js';

export const FASTER_WHISPER_STREAMING_PROVIDER_ID = 'faster_whisper_streaming';
const DEFAULT_PROTOCOL_VERSION = 1;

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

/**
 * Faster Whisper streaming provider skeleton.
 * Owns only provider-local lifecycle state for the future WebSocket-backed runtime.
 */
export class FasterWhisperStreamingProvider extends BaseStreamingSTTProvider {
  static id = FASTER_WHISPER_STREAMING_PROVIDER_ID;
  static displayName = 'Faster Whisper Streaming';
  static mode = 'streaming';

  constructor({
    providerId = FASTER_WHISPER_STREAMING_PROVIDER_ID,
    eventSink = null,
    websocketFactory = null,
    logger = null
  } = {}) {
    super(providerId, {
      eventSink,
      providerName: 'Faster Whisper Streaming',
      logger
    });

    this.websocketFactory = websocketFactory ?? null;
    this.connection = null;
    this.runtime = null;
    this.lastLifecycleAction = null;
    this.readyTimeoutMs = null;
    this._readyResolver = null;
    this._readyRejecter = null;
    this._readyTimeoutHandle = null;
    this._intentionalClose = false;
    this._socketOpened = false;
    this._readyReceived = false;
    this._socket = null;
    this._boundSocketHandlers = null;
    this._serverMessageSequence = 0;
  }

  async startSession(sessionConfig, options = {}) {
    this.lastLifecycleAction = 'start';
    return super.startSession(sessionConfig, options);
  }

  async stopSession(options = {}) {
    this.lastLifecycleAction = 'stop';
    return super.stopSession(options);
  }

  async destroy(options = {}) {
    this.lastLifecycleAction = 'destroy';
    return super.destroy(options);
  }

  async _onStartSession(session, options = {}) {
    this._intentionalClose = false;
    this._socketOpened = false;
    this._readyReceived = false;
    this._serverMessageSequence = 0;
    this._readyTimeoutMs = Number.isFinite(Number(options.readyTimeoutMs)) ? Math.max(0, Number(options.readyTimeoutMs)) : 5000;
    this.runtime = Object.freeze({
      sessionId: session?.sessionId ?? null,
      tabId: session?.tabId ?? null,
      videoFingerprint: session?.videoFingerprint ?? null,
      options: { ...options },
      state: STT_STREAMING_PROVIDER_STATES.STARTING
    });

    return this._connect(session, options);
  }

  async _onStopSession(session, options = {}) {
    this._intentionalClose = true;
    return this._disconnect(session, options);
  }

  async _onDestroySession(session, options = {}) {
    this._intentionalClose = true;
    this.runtime = null;
    this.connection = null;
    return this._disconnect(session, {
      ...options,
      reason: options.reason ?? 'destroy'
    });
  }

  _resolveEndpoint(session, options = {}) {
    const endpointUrl = session?.providerOptions?.endpointUrl ?? session?.providerOptions?.wsUrl ?? options?.providerOptions?.endpointUrl ?? options?.providerOptions?.wsUrl ?? null;
    if (typeof endpointUrl === 'string' && endpointUrl.trim().length > 0) {
      return endpointUrl.trim();
    }

    return 'ws://127.0.0.1:8765/v1/audio/transcriptions/stream';
  }

  _getWebSocketFactory() {
    if (typeof this.websocketFactory === 'function') {
      return this.websocketFactory;
    }

    if (typeof globalThis?.WebSocket === 'function') {
      return (url, protocols) => new globalThis.WebSocket(url, protocols);
    }

    return null;
  }

  _clearReadyTimer() {
    if (this._readyTimeoutHandle) {
      clearTimeout(this._readyTimeoutHandle);
      this._readyTimeoutHandle = null;
    }
  }

  _cleanupSocket() {
    const socket = this._socket;
    if (!socket) {
      this._boundSocketHandlers = null;
      return;
    }

    try {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      if (typeof socket.removeEventListener === 'function' && this._boundSocketHandlers) {
        socket.removeEventListener('open', this._boundSocketHandlers.open);
        socket.removeEventListener('message', this._boundSocketHandlers.message);
        socket.removeEventListener('error', this._boundSocketHandlers.error);
        socket.removeEventListener('close', this._boundSocketHandlers.close);
      }
    } catch {
      // Best effort cleanup.
    }

    this._boundSocketHandlers = null;
    this._socket = null;
    this.connection = null;
  }

  _settleReadyReject(error) {
    if (this._readyRejecter) {
      this._readyRejecter(error);
    }

    this._readyResolver = null;
    this._readyRejecter = null;
  }

  _settleReadyResolve(value) {
    if (this._readyResolver) {
      this._readyResolver(value);
    }

    this._readyResolver = null;
    this._readyRejecter = null;
  }

  _sendJson(socket, payload) {
    if (!socket || typeof socket.send !== 'function') {
      return false;
    }

    socket.send(JSON.stringify(payload));
    return true;
  }

  _buildStartPayload(session, options = {}) {
    const metadata = session?.metadata && typeof session.metadata === 'object' && !Array.isArray(session.metadata)
      ? session.metadata
      : {};
    const optionMetadata = options?.metadata && typeof options.metadata === 'object' && !Array.isArray(options.metadata)
      ? options.metadata
      : {};
    const mergedMetadata = {
      ...metadata,
      ...optionMetadata
    };
    const audioInputFormats = Array.isArray(session?.audioInputFormats)
      ? session.audioInputFormats.filter((format) => typeof format === 'string' && format.trim().length > 0).map((format) => format.trim())
      : [];
    const selectedAudioFormat = normalizeOptionalString(session?.selectedAudioFormat) ?? normalizeOptionalString(session?.audioFormat) ?? null;
    const preferredAudioInputFormat = normalizeOptionalString(session?.preferredAudioInputFormat) ?? selectedAudioFormat;
    const fallbackAudioInputFormat = normalizeOptionalString(session?.fallbackAudioInputFormat) ?? 'webm-opus';
    const audioSourceType = normalizeOptionalString(session?.audioSourceType) ?? null;
    const protocolVersion = normalizeOptionalNumber(
      mergedMetadata.protocolVersion
      ?? session?.protocolVersion
      ?? options?.protocolVersion
      ?? DEFAULT_PROTOCOL_VERSION
    ) ?? DEFAULT_PROTOCOL_VERSION;

    return {
      type: 'start',
      sessionId: session.sessionId,
      tabId: session.tabId,
      videoFingerprint: session.videoFingerprint,
      providerId: this.providerId,
      sourceLanguage: session.sourceLanguage ?? null,
      targetLanguage: session.targetLanguage ?? null,
      audioFormat: selectedAudioFormat,
      selectedAudioFormat,
      preferredAudioInputFormat,
      fallbackAudioInputFormat,
      audioSourceType,
      audioInputFormats,
      sampleRate: normalizeOptionalNumber(session?.sampleRate) ?? null,
      channelCount: normalizeOptionalNumber(session?.channelCount) ?? null,
      bitDepth: normalizeOptionalNumber(session?.bitDepth) ?? null,
      protocolVersion,
      options: {
        ...(session.providerOptions ?? {}),
        ...(options.providerOptions ?? {})
      },
      metadata: {
        ...mergedMetadata,
        audioFormat: selectedAudioFormat,
        selectedAudioFormat,
        preferredAudioInputFormat,
        fallbackAudioInputFormat,
        audioSourceType,
        audioInputFormats,
        sampleRate: normalizeOptionalNumber(session?.sampleRate) ?? null,
        channelCount: normalizeOptionalNumber(session?.channelCount) ?? null,
        bitDepth: normalizeOptionalNumber(session?.bitDepth) ?? null,
        protocolVersion
      }
    };
  }

  _isStaleSessionMessage(payload, session) {
    return Boolean(payload?.sessionId && session?.sessionId && payload.sessionId !== session.sessionId);
  }

  _createGeneratedId(sessionId, sequence) {
    return `${sessionId}:${sequence}`;
  }

  _nextServerMessageSequence() {
    this._serverMessageSequence += 1;
    return this._serverMessageSequence;
  }

  _buildFinalTranscriptEvent(session, payload = {}) {
    const sequence = this._nextServerMessageSequence();
    const generatedId = this._createGeneratedId(session.sessionId, sequence);
    const sourceLanguage = payload.language ?? session.sourceLanguage ?? null;
    const confidence = Number.isFinite(Number(payload.confidence)) ? Number(payload.confidence) : null;
    const text = typeof payload.text === 'string' ? payload.text.trim() : String(payload.text ?? '').trim();

    if (!text) {
      return null;
    }

    return Object.freeze({
      eventId: typeof payload.eventId === 'string' && payload.eventId.trim().length > 0 ? payload.eventId.trim() : generatedId,
      eventType: 'final',
      providerId: this.providerId,
      providerMode: 'streaming',
      sessionId: session.sessionId,
      tabId: session.tabId,
      videoFingerprint: session.videoFingerprint,
      segmentId: typeof payload.segmentId === 'string' && payload.segmentId.trim().length > 0 ? payload.segmentId.trim() : generatedId,
      revision: 1,
      segmentStartMs: Number.isFinite(Number(payload.startMs)) ? Number(payload.startMs) : null,
      segmentEndMs: Number.isFinite(Number(payload.endMs)) ? Number(payload.endMs) : null,
      text,
      sourceLanguage: typeof sourceLanguage === 'string' && sourceLanguage.trim().length > 0 ? sourceLanguage.trim() : null,
      confidence,
      createdAt: Date.now(),
      metadata: Object.freeze({
        rawServerPayload: payload,
        providerProtocol: 'faster_whisper_streaming_ws'
      })
    });
  }

  async _connect(session, options = {}) {
    const websocketFactory = this._getWebSocketFactory();
    if (!websocketFactory) {
      throw this._normalizeError(new TypeError('Faster Whisper streaming provider requires a websocketFactory or global WebSocket'), {
        code: 'websocket_unavailable',
        message: 'Faster Whisper streaming provider requires a websocketFactory or global WebSocket',
        retryable: false
      });
    }

    const endpointUrl = this._resolveEndpoint(session, options);
    const socket = websocketFactory(endpointUrl);

    if (!socket) {
      throw this._normalizeError(new TypeError('Faster Whisper streaming provider could not create a WebSocket'), {
        code: 'websocket_creation_failed',
        message: 'Faster Whisper streaming provider could not create a WebSocket',
        retryable: false
      });
    }

    this._socket = socket;
    this.connection = socket;

    const readyPromise = new Promise((resolve, reject) => {
      this._readyResolver = resolve;
      this._readyRejecter = reject;
    });

    const handleOpen = () => {
      this._socketOpened = true;
      this._sendJson(socket, this._buildStartPayload(session, options));
    };

    const handleMessage = (event) => {
      const rawData = typeof event?.data !== 'undefined' ? event.data : event;
      let payload = rawData;

      if (typeof rawData === 'string') {
        try {
          payload = JSON.parse(rawData);
        } catch (error) {
          const normalized = this._normalizeError(error, {
            code: 'malformed_message',
            message: 'Faster Whisper streaming provider received malformed JSON',
            retryable: false
          });
          if (this._readyReceived) {
            this.emitErrorEvent({ error: normalized });
          }
          this._settleReadyReject(normalized);
          this._intentionalClose = true;
          try {
            socket.close?.(1007, 'malformed message');
          } catch {
            // Best effort cleanup.
          }
          return;
        }
      }

      if (this._isStaleSessionMessage(payload, session)) {
        return Object.freeze({
          handled: false,
          status: 'stale_session',
          providerId: this.providerId,
          sessionId: session?.sessionId ?? null,
          tabId: session?.tabId ?? null,
          videoFingerprint: session?.videoFingerprint ?? null
        });
      }

      if (payload?.type === 'ready' && payload.sessionId === session.sessionId) {
        this._readyReceived = true;
        this._clearReadyTimer();
        this.emitStatusEvent({
          state: 'ready',
          details: {
            readyPayload: payload
          }
        });
        this._settleReadyResolve(payload);
        return;
      }

      if (payload?.type === 'final') {
        const transcriptEvent = this._buildFinalTranscriptEvent(session, payload);
        if (!transcriptEvent) {
          return Object.freeze({
            handled: false,
            status: 'empty_final',
            providerId: this.providerId,
            sessionId: session?.sessionId ?? null,
            tabId: session?.tabId ?? null,
            videoFingerprint: session?.videoFingerprint ?? null
          });
        }
        this.emitTranscriptEvent({
          event: transcriptEvent
        });
        return transcriptEvent;
      }

      if (payload?.type === 'error') {
        const normalized = this._normalizeError(payload, {
          code: payload.code ?? 'streaming_error',
          message: payload.message ?? 'Faster Whisper streaming provider error',
          retryable: Boolean(payload.retryable),
          details: payload.details ?? null
        });
        if (this._readyReceived) {
          this.emitErrorEvent({ error: normalized });
          this._intentionalClose = true;
          try {
            socket.close?.(1011, 'server error');
          } catch {
            // Best effort cleanup.
          }
        } else {
          this._settleReadyReject(normalized);
          this._intentionalClose = true;
          try {
            socket.close?.(1011, 'server error');
          } catch {
            // Best effort cleanup.
          }
        }
        return;
      }

      const normalized = this._normalizeError(new Error(`Unsupported Faster Whisper streaming message type: ${payload?.type ?? 'unknown'}`), {
        code: 'protocol_error',
        message: `Unsupported Faster Whisper streaming message type: ${payload?.type ?? 'unknown'}`,
        retryable: false,
        details: {
          payload
        }
      });
      if (this._readyReceived) {
        this.emitErrorEvent({ error: normalized });
      } else {
        this._settleReadyReject(normalized);
      }
      this._intentionalClose = true;
      try {
        socket.close?.(1002, 'unsupported message type');
      } catch {
        // Best effort cleanup.
      }
      return normalized;
    };

    const handleError = (error) => {
      const normalized = this._handleError(error);
      if (this._readyReceived) {
        this.emitErrorEvent({ error: normalized });
      } else {
        this._settleReadyReject(normalized);
      }
      this._intentionalClose = true;
      try {
        socket.close?.(1011, 'socket error');
      } catch {
        // Best effort cleanup.
      }
    };

    const handleClose = (event) => {
      const wasIntentional = this._intentionalClose;
      this._clearReadyTimer();

      if (!wasIntentional && (!this._readyReceived || this.state === STT_STREAMING_PROVIDER_STATES.ACTIVE)) {
        const normalized = this._normalizeError(new Error(event?.reason || 'Streaming socket closed unexpectedly'), {
          code: 'socket_closed',
          message: event?.reason || 'Streaming socket closed unexpectedly',
          retryable: false,
          details: {
            code: event?.code ?? null,
            wasClean: Boolean(event?.wasClean)
          }
        });
        if (this._readyReceived) {
          this.emitErrorEvent({ error: normalized });
        } else {
          this._settleReadyReject(normalized);
        }
      }

      this.emitClosedEvent({
        reason: wasIntentional ? (options.reason ?? 'stop') : 'socket_closed'
      });

      this._cleanupSocket();
    };

    this._boundSocketHandlers = {
      open: handleOpen,
      message: handleMessage,
      error: handleError,
      close: handleClose
    };

    if (typeof socket.addEventListener === 'function') {
      socket.addEventListener('open', handleOpen);
      socket.addEventListener('message', handleMessage);
      socket.addEventListener('error', handleError);
      socket.addEventListener('close', handleClose);
    } else {
      socket.onopen = handleOpen;
      socket.onmessage = handleMessage;
      socket.onerror = handleError;
      socket.onclose = handleClose;
    }

    this._readyTimeoutHandle = setTimeout(() => {
      const normalized = this._normalizeError(new Error('Faster Whisper streaming ready timeout'), {
        code: 'ready_timeout',
        message: 'Faster Whisper streaming ready timeout',
        retryable: false
      });
      this._settleReadyReject(normalized);
      this._intentionalClose = true;
      try {
        socket.close?.(1000, 'ready timeout');
      } catch {
        // Best effort cleanup.
      }
      this._cleanupSocket();
    }, this._readyTimeoutMs);

    try {
      const readyPayload = await readyPromise;
      this._clearReadyTimer();
      this.runtime = Object.freeze({
        sessionId: session?.sessionId ?? null,
        tabId: session?.tabId ?? null,
        videoFingerprint: session?.videoFingerprint ?? null,
        options: { ...options },
        state: STT_STREAMING_PROVIDER_STATES.ACTIVE,
        readyPayload
      });
      return {
        handled: true,
        status: 'ready',
        providerId: this.providerId,
        sessionId: session.sessionId,
        tabId: session.tabId,
        videoFingerprint: session.videoFingerprint,
        readyPayload
      };
    } catch (error) {
      this._clearReadyTimer();
      throw error;
    }
  }

  async _disconnect(session, options = {}) {
    this._intentionalClose = true;
    this._clearReadyTimer();

    const socket = this._socket;
    if (!socket) {
      this._cleanupSocket();
      return Object.freeze({
        handled: true,
        status: 'closed',
        providerId: this.providerId,
        sessionId: session?.sessionId ?? null,
        tabId: session?.tabId ?? null,
        videoFingerprint: session?.videoFingerprint ?? null
      });
    }

    try {
      if (socket.readyState === 1) {
        this._sendJson(socket, {
          type: 'stop',
          sessionId: session?.sessionId ?? null,
          reason: options.reason ?? 'stop'
        });
      }
      socket.close?.(1000, options.reason ?? 'stop');
    } finally {
      this._readyResolver = null;
      this._readyRejecter = null;
    }

    return Object.freeze({
      handled: true,
      status: 'closed',
      providerId: this.providerId,
      sessionId: session?.sessionId ?? null,
      tabId: session?.tabId ?? null,
      videoFingerprint: session?.videoFingerprint ?? null
    });
  }

  async _handleServerMessage(message) {
    return Object.freeze({
      handled: false,
      status: 'not_implemented',
      reason: 'streaming_protocol_not_implemented',
      providerId: this.providerId,
      message
    });
  }

  async _handleMessage(message) {
    return this._handleServerMessage(message);
  }

  async _normalizeAudioChunk(audioChunk) {
    if (audioChunk instanceof Uint8Array) {
      return audioChunk;
    }

    if (audioChunk instanceof ArrayBuffer) {
      return new Uint8Array(audioChunk);
    }

    if (audioChunk instanceof Blob) {
      return new Uint8Array(await audioChunk.arrayBuffer());
    }

    throw new TypeError('Faster Whisper streaming provider requires a Blob, ArrayBuffer, or Uint8Array audio chunk');
  }

  async handleAudioChunk(audioChunk, metadata = {}) {
    const socket = this._socket;
    const isReady = this.state === STT_STREAMING_PROVIDER_STATES.ACTIVE && this._readyReceived && socket && socket.readyState === 1;

    if (!isReady) {
      return Object.freeze({
        handled: false,
        status: 'not_ready',
        providerId: this.providerId,
        sessionId: this.session?.sessionId ?? null,
        tabId: this.session?.tabId ?? null,
        videoFingerprint: this.session?.videoFingerprint ?? null,
        metadata: metadata ?? null
      });
    }

    const uint8Array = await this._normalizeAudioChunk(audioChunk);
    socket.send(uint8Array);

    return Object.freeze({
      handled: true,
      status: 'sent',
      bytes: uint8Array.byteLength,
      providerId: this.providerId,
      sessionId: this.session?.sessionId ?? null,
      tabId: this.session?.tabId ?? null,
      videoFingerprint: this.session?.videoFingerprint ?? null,
      metadata: metadata ?? null
    });
  }

  async _handleError(error) {
    return this._normalizeError(error, {
      message: error?.message ?? 'Faster Whisper streaming provider error',
      retryable: Boolean(error?.retryable),
      details: error?.details ?? null
    });
  }
}

export default FasterWhisperStreamingProvider;
