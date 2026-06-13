import {
  BaseStreamingSTTProvider,
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
    return this._disconnect(session, options);
  }

  async _onDestroySession(session, options = {}) {
    this.runtime = null;
    this.connection = null;
    return this._disconnect(session, {
      ...options,
      reason: options.reason ?? 'destroy'
    });
  }

  async _connect() {
    return Object.freeze({
      handled: false,
      status: 'not_implemented',
      reason: 'streaming_protocol_not_implemented',
      providerId: this.providerId
    });
  }

  async _disconnect() {
    return Object.freeze({
      handled: false,
      status: 'not_implemented',
      reason: 'streaming_protocol_not_implemented',
      providerId: this.providerId
    });
  }

  async _handleMessage() {
    return Object.freeze({
      handled: false,
      status: 'not_implemented',
      reason: 'streaming_protocol_not_implemented',
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
