import {
  BaseStreamingSTTProvider,
  STT_STREAMING_PROVIDER_EVENT_TYPES,
  STT_STREAMING_PROVIDER_STATES
} from '../BaseStreamingSTTProvider.js';

export const FASTER_WHISPER_STREAMING_PROVIDER_ID = 'faster_whisper_streaming';

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
      this._sendJson(socket, {
        type: 'start',
        sessionId: session.sessionId,
        tabId: session.tabId,
        videoFingerprint: session.videoFingerprint,
        providerId: this.providerId,
        sourceLanguage: session.sourceLanguage ?? null,
        targetLanguage: session.targetLanguage ?? null,
        options: {
          ...(session.providerOptions ?? {}),
          ...(options.providerOptions ?? {})
        }
      });
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

      if (payload?.type === 'error') {
        const normalized = this._normalizeError(payload, {
          code: payload.code ?? 'streaming_error',
          message: payload.message ?? 'Faster Whisper streaming provider error',
          retryable: Boolean(payload.retryable),
          details: payload.details ?? null
        });
        if (this._readyReceived) {
          this.emitErrorEvent({ error: normalized });
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

      this._handleServerMessage(payload);
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

  async handleAudioChunk() {
    return Object.freeze({
      handled: false,
      status: 'unsupported',
      reason: 'audio_chunk_not_supported',
      providerId: this.providerId
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
