import {
  LIVE_DUBBING_PROVIDER_ID,
  LIVE_DUBBING_SETUP_TIMEOUT,
} from '../constants.js';
import {
  createLiveDubbingProviderDiagnostic,
  normalizeProviderTargetLanguage,
} from '../contracts.js';

export const GEMINI_LIVE_MODEL = 'models/gemini-3.5-live-translate-preview';
export const GEMINI_LIVE_AUDIO_MIME_TYPE = 'audio/pcm;rate=16000';
export const GEMINI_LIVE_OUTPUT_AUDIO_MIME_TYPE = 'audio/pcm;rate=24000';
export const GEMINI_LIVE_WEBSOCKET_ENDPOINT =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
/**
 * Constrained Live Translation transport. Background mints a single-use
 * ephemeral token for this endpoint; the long-lived API key never leaves
 * background and must never appear in a `?key=` URL.
 */
export const GEMINI_LIVE_CONSTRAINED_WEBSOCKET_ENDPOINT =
  GEMINI_LIVE_WEBSOCKET_ENDPOINT.replace(/BidiGenerateContent$/, 'BidiGenerateContentConstrained');
/** Mint endpoint for constrained single-use Live Translation tokens. Background-only. */
export const GEMINI_LIVE_AUTH_TOKEN_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/auth_tokens';
export const GEMINI_LIVE_SETUP_TIMEOUT = LIVE_DUBBING_SETUP_TIMEOUT;
export const GEMINI_LIVE_MAX_BUFFERED_AMOUNT = 64 * 1024;

const OPEN_READY_STATE = 1;
const NOOP = () => {};
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const TELEMETRY_MILESTONES = Object.freeze([
  'captureReady',
  'inputReady',
  'outputReady',
  'wsOpen',
  'setupSent',
  'setupComplete',
  'firstInputSent',
  'firstTranslatedAudioReceived',
  'firstTranslatedAudioAcceptedByPlayback',
  'cleanupStart',
  'cleanupComplete',
]);
const SERVER_CONTENT_METADATA_FIELDS = Object.freeze({
  inputTranscription: 'record',
  interimInputTranscription: 'record',
  outputTranscription: 'record',
  speechState: 'string',
  waitingForInput: 'boolean',
  interactionStatus: 'status',
  groundingMetadata: 'record',
  urlContextMetadata: 'record',
});
const SERVER_CONTENT_FIELDS = new Set([
  'modelTurn',
  'interrupted',
  'generationComplete',
  'turnComplete',
  ...Object.keys(SERVER_CONTENT_METADATA_FIELDS),
]);
const TOP_LEVEL_UNION_FIELDS = new Set([
  'setupComplete',
  'goAway',
  'error',
  'serverContent',
  'sessionResumptionUpdate',
  'toolCallCancellation',
  'toolCall',
]);
const SESSION_RESUMPTION_FIELDS = new Set([
  'newHandle',
  'resumable',
]);
const TOOL_CALL_CANCELLATION_FIELDS = new Set(['ids']);
const TOOL_CALL_FIELDS = new Set(['functionCalls']);

function createTelemetry() {
  return {
    milestones: Object.fromEntries(TELEMETRY_MILESTONES.map(name => [name, null])),
    wsBufferedAmountPeak: 0,
    interruptions: 0,
    providerTerminalCategory: null,
  };
}

function performanceNow(options) {
  if (typeof options?.performanceNow === 'function') return options.performanceNow;
  if (typeof options?.performance?.now === 'function') return options.performance.now.bind(options.performance);
  if (typeof globalThis.performance?.now === 'function') return globalThis.performance.now.bind(globalThis.performance);
  return () => null;
}

function safeNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function safeTelemetrySnapshot(telemetry) {
  const source = telemetry || createTelemetry();
  return {
    milestones: Object.fromEntries(TELEMETRY_MILESTONES.map(name => [
      name,
      Number.isFinite(source.milestones?.[name]) ? source.milestones[name] : null,
    ])),
    wsBufferedAmountPeak: safeNonNegativeNumber(source.wsBufferedAmountPeak),
    interruptions: Number.isInteger(source.interruptions) && source.interruptions >= 0
      ? source.interruptions
      : 0,
    providerTerminalCategory: typeof source.providerTerminalCategory === 'string'
      && /^[A-Z0-9_.-]{1,80}$/.test(source.providerTerminalCategory)
      ? source.providerTerminalCategory
      : null,
  };
}

function safeEventError(error) {
  return {
    name: typeof error?.name === 'string' && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error.name)
      ? error.name
      : 'Error',
    ...(typeof error?.code === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(error.code)
      ? { code: error.code }
      : {}),
  };
}

class GeminiLiveProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GeminiLiveProtocolError';
    this.code = code;
  }
}

class GeminiLiveOutputAudioError extends GeminiLiveProtocolError {
  constructor(code, reason, message) {
    super(code, sanitizeMessage(message));
    this.name = 'GeminiLiveOutputAudioError';
    this.providerReason = reason;
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPlainRecord(value) {
  if (!isRecord(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function isArrayBuffer(value) {
  return typeof globalThis.ArrayBuffer === 'function'
    && (value instanceof globalThis.ArrayBuffer
      || Object.prototype.toString.call(value) === '[object ArrayBuffer]');
}

function isBlob(value) {
  return typeof globalThis.Blob === 'function' && value instanceof globalThis.Blob;
}

function hasOnlyFields(value, fields) {
  return Object.keys(value).every(field => fields.has(field));
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isPcm24MimeType(value) {
  return isNonEmptyString(value) && /audio\/pcm(?:;\s*rate=24000\b)/i.test(value);
}

function isPcmMimeType(value) {
  return isNonEmptyString(value) && /^audio\/pcm(?:;|$)/i.test(value);
}

function isBase64(value) {
  return isNonEmptyString(value)
    && value.length % 4 !== 1
    && BASE64_PATTERN.test(value);
}

function isValidServerContentMetadata(field, value) {
  const shape = SERVER_CONTENT_METADATA_FIELDS[field];
  if (shape === 'boolean') return typeof value === 'boolean';
  if (shape === 'string') return isNonEmptyString(value);
  if (shape === 'status') return isNonEmptyString(value) || isRecord(value);
  return isRecord(value);
}

function sanitizeMessage(value, secret = '') {
  let message = typeof value === 'string' && value.trim()
    ? value.trim()
    : 'Gemini Live connection failed';

  if (secret) {
    message = message.replaceAll(secret, '[redacted]');
    try {
      message = message.replaceAll(encodeURIComponent(secret), '[redacted]');
    } catch {
      // An invalid URI component is still covered by the raw secret replacement.
    }
  }

  return message
    .replace(/\b(?:wss?|https?):\/\/[^\s]+/gi, '[redacted-url]')
    .replace(/\b(?:api[-_ ]?key|authorization|token|secret|credential)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .slice(0, 240);
}

function createSafeError(code, error, secret = '') {
  const source = error instanceof Error ? error.message : error;
  return new GeminiLiveProtocolError(code, sanitizeMessage(source, secret));
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  if (typeof globalThis.btoa === 'function') return globalThis.btoa(binary);
  if (typeof globalThis.Buffer !== 'undefined') {
    return globalThis.Buffer.from(bytes).toString('base64');
  }
  throw new GeminiLiveProtocolError('GEMINI_LIVE_AUDIO_ENCODING_FAILED', 'Audio encoding is unavailable');
}

function decodeBase64(value) {
  try {
    if (typeof globalThis.atob === 'function') {
      const binary = globalThis.atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
    }
    if (typeof globalThis.Buffer !== 'undefined') {
      return new Uint8Array(globalThis.Buffer.from(value, 'base64'));
    }
  } catch {
    // The transport value was syntactically valid but could not be decoded.
  }

  throw new GeminiLiveOutputAudioError(
    'LIVE_DUBBING_OUTPUT_AUDIO_ERROR',
    'OUTPUT_AUDIO_ERROR',
    'Gemini Live PCM audio decoding failed',
  );
}

function toBytes(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError('sendAudio requires PCM bytes');
}

function callbackFrom(options, callbacks, name, aliases = []) {
  for (const source of [options, callbacks]) {
    for (const key of [name, ...aliases]) {
      if (typeof source?.[key] === 'function') return source[key];
    }
  }
  return NOOP;
}

/**
 * Small native-WebSocket adapter for the Gemini Live translation protocol.
 *
 * It owns Gemini framing, transport encoding/decoding, protocol validation,
 * diagnostics, and socket backpressure. Audio capture, playback, retries, and
 * transcript handling intentionally stay outside this feature-local class.
 */
export class GeminiLiveProviderAdapter {
  constructor(options = {}) {
    const callbacks = options.callbacks || {};
    this.webSocketFactory = options.webSocketFactory
      || options.socketFactory
      || options.createWebSocket
      || (typeof options.WebSocket === 'function'
        ? url => new options.WebSocket(url)
        : url => new globalThis.WebSocket(url));
    const setupTimeout = options.setupTimeout ?? options.setupTimeoutMs;
    this.setupTimeout = Number.isFinite(setupTimeout)
      ? setupTimeout
      : GEMINI_LIVE_SETUP_TIMEOUT;

    this.onEvent = callbackFrom(options, callbacks, 'onEvent', ['onLifecycleEvent']);
    this.onSetupComplete = callbackFrom(options, callbacks, 'onSetupComplete');
    this.onAudio = callbackFrom(options, callbacks, 'onAudio', ['onTranslatedAudio', 'onAudioData']);
    this.onInterrupted = callbackFrom(options, callbacks, 'onInterrupted');
    this.onGenerationComplete = callbackFrom(options, callbacks, 'onGenerationComplete');
    this.onTurnComplete = callbackFrom(options, callbacks, 'onTurnComplete');
    this.onGoAway = callbackFrom(options, callbacks, 'onGoAway');
    this.onError = callbackFrom(options, callbacks, 'onError');
    this.onClose = callbackFrom(options, callbacks, 'onClose');
    this.performanceNow = performanceNow(options);

    this._socket = null;
    this._socketContext = null;
    this.phase = 'idle';
    this.generation = 0;
    this.setupState = null;
    this.metrics = {
      sentAudioChunks: 0,
      sentAudioBytes: 0,
      backpressureEvents: 0,
      sendFailures: 0,
    };
    this.lastSendReason = null;
    this.telemetry = createTelemetry();
  }

  /**
   * Open one session and resolve only after Gemini acknowledges setup.
   * The bootstrap must carry exactly one ephemeral `{ accessToken }` minted
   * by background; legacy `apiKey` bootstraps are rejected. The token builds
   * the constrained socket URL and is never retained in the client or
   * included in any returned value or callback.
   */
  connect(connectionOptions) {
    if (arguments.length !== 1
      || !isPlainRecord(connectionOptions)
      || Object.keys(connectionOptions).length !== 2
      || !Object.prototype.hasOwnProperty.call(connectionOptions, 'bootstrap')
      || !Object.prototype.hasOwnProperty.call(connectionOptions, 'targetLanguage')
      || Object.prototype.hasOwnProperty.call(connectionOptions, 'apiKey')
      || Object.prototype.hasOwnProperty.call(connectionOptions, 'accessToken')
      || !isPlainRecord(connectionOptions.bootstrap)) {
      return Promise.reject(new TypeError('connect requires a nested bootstrap object'));
    }

    let hasLegacyKey = false;
    let bootstrapKeys = null;
    try {
      hasLegacyKey = Object.prototype.hasOwnProperty.call(connectionOptions.bootstrap, 'apiKey');
      bootstrapKeys = Object.keys(connectionOptions.bootstrap);
    } catch {
      return Promise.reject(new TypeError('bootstrap accessToken is unavailable'));
    }
    if (hasLegacyKey) {
      return Promise.reject(new TypeError('bootstrap apiKey is unsupported; accessToken is required'));
    }
    if (!Array.isArray(bootstrapKeys)
      || bootstrapKeys.length !== 1
      || bootstrapKeys[0] !== 'accessToken') {
      return Promise.reject(new TypeError('bootstrap accessToken is unavailable'));
    }

    let accessToken;
    try {
      accessToken = connectionOptions.bootstrap.accessToken;
    } catch {
      return Promise.reject(new TypeError('bootstrap accessToken is unavailable'));
    }
    let mappedTargetLanguage;
    try {
      mappedTargetLanguage = normalizeProviderTargetLanguage(
        LIVE_DUBBING_PROVIDER_ID,
        connectionOptions.targetLanguage,
      );
    } catch {
      mappedTargetLanguage = null;
    }

    if (this._socket || this.setupState || this.phase !== 'idle') {
      return Promise.reject(new GeminiLiveProtocolError(
        'GEMINI_LIVE_ALREADY_CONNECTED',
        'A Gemini Live session is already active',
      ));
    }
    if (!isNonEmptyString(accessToken)) {
      return Promise.reject(new TypeError('accessToken is required'));
    }
    if (!mappedTargetLanguage) {
      return Promise.reject(new RangeError('Unsupported target language'));
    }

    this.telemetry = createTelemetry();
    const generation = ++this.generation;
    let resolveSetup;
    let rejectSetup;
    const promise = new Promise((resolve, reject) => {
      resolveSetup = resolve;
      rejectSetup = reject;
    });
    this.setupState = {
      generation,
      resolve: resolveSetup,
      reject: rejectSetup,
      timer: null,
    };
    this.phase = 'connecting';

    let socket;
    try {
      socket = this.webSocketFactory(
        `${GEMINI_LIVE_CONSTRAINED_WEBSOCKET_ENDPOINT}?access_token=${encodeURIComponent(accessToken)}`,
      );
      if (!socket || typeof socket.send !== 'function') {
        throw new TypeError('WebSocket factory did not return a socket');
      }
      try {
        socket.binaryType = 'arraybuffer';
      } catch {
        // Binary mode is an optimization; a socket that rejects the hint can still connect.
      }
    } catch (error) {
      const safeError = createSafeError('GEMINI_LIVE_CONNECT_FAILED', error, accessToken);
      this._terminateCurrent(
        generation,
        safeError,
        { code: 1006, wasClean: false },
        true,
        'CONNECT_FAILED',
      );
      return promise;
    }

    const socketContext = {
      targetLanguage: mappedTargetLanguage,
    };
    this._socket = socket;
    this._socketContext = socketContext;
    this._attachSocketHandlers(socket, generation, socketContext);
    return promise;
  }

  /**
   * Send one PCM chunk after setup. Returning false is deliberately benign for
   * capture races: callers can drop a chunk while the session is not ready.
   */
  sendAudio(pcmBytes) {
    const bytes = toBytes(pcmBytes);
    if (!this._isReadySocket()) {
      this.lastSendReason = 'NOT_READY';
      return false;
    }
    if (Number.isFinite(this._socket.bufferedAmount)
      && this._socket.bufferedAmount >= GEMINI_LIVE_MAX_BUFFERED_AMOUNT) {
      this.metrics.backpressureEvents += 1;
      this.lastSendReason = 'BACKPRESSURE';
      return false;
    }

    this._recordBufferedAmount();
    const payload = {
      realtimeInput: {
        audio: {
          mimeType: GEMINI_LIVE_AUDIO_MIME_TYPE,
          data: bytesToBase64(bytes),
        },
      },
    };

    try {
      this._socket.send(JSON.stringify(payload));
      this.metrics.sentAudioChunks += 1;
      this.metrics.sentAudioBytes += bytes.byteLength;
      this._markMilestone('firstInputSent');
      this._recordBufferedAmount();
      this.lastSendReason = null;
      return true;
    } catch {
      this.metrics.sendFailures += 1;
      this.lastSendReason = 'SEND_FAILED';
      const safeError = new GeminiLiveProtocolError(
        'GEMINI_LIVE_SEND_FAILED',
        'Gemini Live audio send failed',
      );
      this._terminateCurrent(this.generation, safeError, { code: 1006, wasClean: false }, true, 'SEND_FAILED');
      return false;
    }
  }

  /** Close the current session and invalidate every callback from its socket. */
  close() {
    if (!this._socket && !this.setupState) return false;
    this._terminateCurrent(this.generation, null, { code: 1000, wasClean: true }, true, 'CLIENT_CLOSE');
    return true;
  }

  /** Alias used by offscreen owners that treat protocol clients as resources. */
  dispose() {
    return this.close();
  }

  getMetrics() {
    return { ...this.metrics, phase: this.phase, generation: this.generation };
  }

  getSendState() {
    return { lastReason: this.lastSendReason };
  }

  getTelemetry() {
    return safeTelemetrySnapshot(this.telemetry);
  }

  _attachSocketHandlers(socket, generation, socketContext) {
    socket.onopen = () => {
      if (!this._isCurrent(socket, generation)) return;
      this.phase = 'open';
      this._markMilestone('wsOpen');
      this.setupState.timer = setTimeout(
        () => this._handleSetupTimeout(socket, generation),
        this.setupTimeout,
      );

      try {
        socket.send(JSON.stringify({
          setup: {
            model: GEMINI_LIVE_MODEL,
            generationConfig: {
              responseModalities: ['AUDIO'],
              translationConfig: {
                targetLanguageCode: socketContext.targetLanguage,
                echoTargetLanguage: false,
              },
            },
          },
        }));
        this._markMilestone('setupSent');
        this._recordBufferedAmount();
      } catch (error) {
        const safeError = createSafeError(
          'GEMINI_LIVE_SETUP_SEND_FAILED',
          error,
        );
        this._terminateCurrent(generation, safeError, { code: 1006, wasClean: false }, true, 'SETUP_SEND_FAILED');
      }
    };
    socket.onmessage = event => {
      if (!this._isCurrent(socket, generation)) return;
      this._handleMessage(event?.data, socket, generation);
    };
    socket.onerror = () => {
      if (!this._isCurrent(socket, generation)) return;
      const safeError = new GeminiLiveProtocolError(
        'GEMINI_LIVE_SOCKET_ERROR',
        'Gemini Live WebSocket error',
      );
      this._terminateCurrent(generation, safeError, { code: 1006, wasClean: false }, true, 'SOCKET_ERROR');
    };
    socket.onclose = event => {
      if (!this._isCurrent(socket, generation)) return;
      const code = Number.isInteger(event?.code) ? event.code : 1006;
      const wasClean = event?.wasClean === true || code === 1000;
      const setupError = this.setupState
        ? new GeminiLiveProtocolError(
          'GEMINI_LIVE_CLOSED_BEFORE_SETUP',
          'Gemini Live closed before setup completed',
        )
        : null;
      this._terminateCurrent(
        generation,
        setupError,
        { code, wasClean },
        Boolean(setupError),
        setupError ? 'CLOSED_BEFORE_SETUP' : 'SOCKET_CLOSED',
      );
    };
  }

  _handleSetupTimeout(socket, generation) {
    if (!this._isCurrent(socket, generation) || !this.setupState) return;
    const safeError = new GeminiLiveProtocolError(
      'GEMINI_LIVE_SETUP_TIMEOUT',
      'Gemini Live setup timed out',
    );
    this._terminateCurrent(generation, safeError, { code: 1000, wasClean: false }, true, 'SETUP_TIMEOUT');
  }

  _handleMessage(rawMessage, socket, generation) {
    if (isArrayBuffer(rawMessage)) {
      try {
        rawMessage = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(rawMessage));
      } catch {
        this._emitMalformedMessage(socket, generation, 'BINARY_UTF8_DECODE');
        return;
      }
    } else if (isBlob(rawMessage)) {
      this._emitMalformedMessage(socket, generation, 'BINARY_BLOB_MESSAGE');
      return;
    }

    let message = rawMessage;
    if (typeof rawMessage === 'string') {
      try {
        message = JSON.parse(rawMessage);
      } catch {
        this._emitMalformedMessage(
          socket,
          generation,
          'JSON_PARSE',
          'Gemini Live returned malformed JSON',
        );
        return;
      }
    }
    if (!isPlainRecord(message)) {
      this._emitMalformedMessage(
        socket,
        generation,
        'MESSAGE_ENVELOPE',
        'Gemini Live returned a malformed message',
      );
      return;
    }
    if (Object.keys(message).length === 0) {
      this._emitMalformedMessage(socket, generation, 'EMPTY_MESSAGE_OBJECT');
      return;
    }

    const hasUsageMetadata = Object.prototype.hasOwnProperty.call(message, 'usageMetadata');
    if (hasUsageMetadata && !isRecord(message.usageMetadata)) {
      this._emitMalformedMessage(socket, generation, 'MESSAGE_ENVELOPE');
      return;
    }

    const unionFields = Object.keys(message).filter(field => TOP_LEVEL_UNION_FIELDS.has(field));
    const hasUnknownTopLevelField = Object.keys(message)
      .some(field => field !== 'usageMetadata' && !TOP_LEVEL_UNION_FIELDS.has(field));
    if (hasUnknownTopLevelField) {
      this._emitMalformedMessage(socket, generation, 'UNKNOWN_TOP_LEVEL_FIELD');
      return;
    }
    if (unionFields.length > 1) {
      this._emitMalformedMessage(socket, generation, 'MULTIPLE_TOP_LEVEL_FIELDS');
      return;
    }
    if (unionFields.length === 0 && !hasUsageMetadata) {
      this._emitMalformedMessage(socket, generation, 'MISSING_TOP_LEVEL_FIELD');
      return;
    }
    if (unionFields.length === 0) return;

    const [unionField] = unionFields;
    if (unionField === 'setupComplete') {
      if (!isRecord(message.setupComplete)) {
        this._emitMalformedMessage(socket, generation, 'SETUP_COMPLETE_SHAPE');
        return;
      }
      if (this.setupState && this._isCurrent(socket, generation)) {
        clearTimeout(this.setupState.timer);
        const setup = this.setupState;
        this.setupState = null;
        this.phase = 'ready';
        this._markMilestone('setupComplete');
        setup.resolve();
        this._emit(this.onSetupComplete, 'setupComplete');
      }
      return;
    }

    if (unionField === 'goAway') {
      if (!isRecord(message.goAway)) {
        this._emitMalformedMessage(socket, generation, 'GO_AWAY_SHAPE');
        return;
      }
      const timeLeft = message.goAway.timeLeft;
      if (!((typeof timeLeft === 'string' && timeLeft.length > 0)
        || (typeof timeLeft === 'number' && Number.isFinite(timeLeft)))) {
        this._emitMalformedMessage(socket, generation, 'GO_AWAY_SHAPE');
        return;
      }
      const details = {
        timeLeft: typeof timeLeft === 'string' ? sanitizeMessage(timeLeft) : timeLeft,
      };
      this._terminateCurrent(generation, new GeminiLiveProtocolError(
        'GEMINI_LIVE_GO_AWAY',
        'Gemini Live requested session termination',
      ), { code: 1000, wasClean: false }, true, 'GO_AWAY', providerDiagnostic => {
        this._emit(this.onGoAway, { ...details, providerDiagnostic });
        this._emitEvent({ type: 'goAway' });
      });
      return;
    }

    if (unionField === 'error') {
      if (!isRecord(message.error) || !isNonEmptyString(message.error.message)) {
        this._emitMalformedMessage(socket, generation, 'REMOTE_ERROR_SHAPE');
        return;
      }
      const safeError = createSafeError(
        'GEMINI_LIVE_REMOTE_ERROR',
        message.error.message,
      );
      this._terminateCurrent(generation, safeError, { code: 1011, wasClean: false }, true, 'REMOTE_ERROR');
      return;
    }

    if (unionField === 'sessionResumptionUpdate') {
      const update = message.sessionResumptionUpdate;
      const valid = isRecord(update)
        && hasOnlyFields(update, SESSION_RESUMPTION_FIELDS)
        && (!Object.prototype.hasOwnProperty.call(update, 'newHandle')
          || typeof update.newHandle === 'string')
        && (!Object.prototype.hasOwnProperty.call(update, 'resumable')
          || typeof update.resumable === 'boolean');
      if (!valid) this._emitMalformedMessage(socket, generation, 'SESSION_RESUMPTION_SHAPE');
      return;
    }

    if (unionField === 'toolCallCancellation') {
      const cancellation = message.toolCallCancellation;
      const valid = isRecord(cancellation)
        && hasOnlyFields(cancellation, TOOL_CALL_CANCELLATION_FIELDS)
        && (!Object.prototype.hasOwnProperty.call(cancellation, 'ids')
          || (Array.isArray(cancellation.ids)
            && cancellation.ids.every(id => typeof id === 'string')));
      if (!valid) this._emitMalformedMessage(socket, generation, 'TOOL_CALL_CANCELLATION_SHAPE');
      return;
    }

    if (unionField === 'toolCall') {
      const toolCall = message.toolCall;
      const valid = isRecord(toolCall)
        && hasOnlyFields(toolCall, TOOL_CALL_FIELDS)
        && Array.isArray(toolCall.functionCalls)
        && toolCall.functionCalls.every(functionCall => isRecord(functionCall));
      if (!valid) {
        this._emitMalformedMessage(socket, generation, 'TOOL_CALL_SHAPE');
        return;
      }
      this._terminateCurrent(
        generation,
        new GeminiLiveProtocolError(
          'GEMINI_LIVE_UNSUPPORTED_TOOL_CALL',
          'Gemini Live tool calls are unsupported',
        ),
        { code: 1003, wasClean: false },
        true,
        'UNSUPPORTED_TOOL_CALL',
      );
      return;
    }

    this._parseServerContent(message.serverContent, socket, generation);
  }

  _parseServerContent(serverContent, socket, generation) {
    if (!isRecord(serverContent)) {
      this._emitMalformedMessage(socket, generation, 'SERVER_CONTENT_SHAPE');
      return;
    }
    if (Object.keys(serverContent).length === 0) return;

    if (Object.keys(serverContent).some(field => !SERVER_CONTENT_FIELDS.has(field))) {
      this._emitMalformedMessage(socket, generation, 'SERVER_CONTENT_FIELDS');
      return;
    }

    const audioParts = [];
    const lifecycleEvents = [];
    if (Object.prototype.hasOwnProperty.call(serverContent, 'modelTurn')) {
      const modelTurn = serverContent.modelTurn;
      if (!isRecord(modelTurn) || !Array.isArray(modelTurn.parts)) {
        this._emitMalformedMessage(socket, generation, 'MODEL_TURN_SHAPE');
        return;
      } else {
        for (const part of modelTurn.parts) {
          if (!isRecord(part)) {
            this._emitMalformedMessage(socket, generation, 'PART_SHAPE');
            return;
          }
          if (!Object.prototype.hasOwnProperty.call(part, 'inlineData')) {
            if (typeof part.text === 'string') continue;
            this._emitMalformedMessage(socket, generation, 'PART_SHAPE');
            return;
          }
          const inlineData = part.inlineData;
          if (!isRecord(inlineData)
            || !isPcmMimeType(inlineData.mimeType)
            || !isNonEmptyString(inlineData.data)
            || !isBase64(inlineData.data)) {
            this._emitMalformedMessage(socket, generation, 'INLINE_AUDIO_SHAPE');
            return;
          }
          if (!isPcm24MimeType(inlineData.mimeType)) {
            this._emitOutputAudioFailure(
              socket,
              generation,
              new GeminiLiveOutputAudioError(
                'LIVE_DUBBING_INVALID_OUTPUT_AUDIO',
                'INVALID_OUTPUT_AUDIO',
                'Gemini Live returned unsupported PCM audio',
              ),
            );
            return;
          }
          let bytes;
          try {
            bytes = decodeBase64(inlineData.data);
          } catch (error) {
            this._emitOutputAudioFailure(socket, generation, error);
            return;
          }
          audioParts.push({
            mimeType: inlineData.mimeType,
            bytes,
          });
        }
      }
    }

    for (const [field, callback, type] of [
      ['interrupted', this.onInterrupted, 'interrupted'],
      ['generationComplete', this.onGenerationComplete, 'generationComplete'],
      ['turnComplete', this.onTurnComplete, 'turnComplete'],
    ]) {
      if (!Object.prototype.hasOwnProperty.call(serverContent, field)) continue;
      if (typeof serverContent[field] !== 'boolean') {
        this._emitMalformedMessage(socket, generation, 'LIFECYCLE_SHAPE');
        return;
      }
      if (!serverContent[field]) continue;
      lifecycleEvents.push({ callback, type });
    }

    for (const field of Object.keys(SERVER_CONTENT_METADATA_FIELDS)) {
      if (!Object.prototype.hasOwnProperty.call(serverContent, field)) continue;
      if (!isValidServerContentMetadata(field, serverContent[field])) {
        this._emitMalformedMessage(socket, generation, 'METADATA_SHAPE');
        return;
      }
    }

    if (!this._isCurrent(socket, generation)) return;
    if (audioParts.length > 0) this._markMilestone('firstTranslatedAudioReceived');
    for (const audio of audioParts) {
      this._emit(this.onAudio, audio.bytes);
      this._emitEvent({ type: 'audio' });
    }
    for (const { callback, type } of lifecycleEvents) {
      if (type === 'interrupted') this.telemetry.interruptions += 1;
      this._emit(callback);
      this._emitEvent({ type });
    }
  }

  _emitMalformedMessage(
    socket,
    generation,
    malformedAt,
    message = 'Gemini Live returned a message missing required fields',
  ) {
    const error = new GeminiLiveProtocolError(
      'GEMINI_LIVE_MALFORMED_MESSAGE',
      sanitizeMessage(message),
    );
    this._terminateCurrent(
      generation,
      error,
      { code: 1002, wasClean: false },
      true,
      'MALFORMED_MESSAGE',
      null,
      malformedAt,
    );
    void socket;
  }

  _emitOutputAudioFailure(socket, generation, error) {
    const outputError = error instanceof GeminiLiveOutputAudioError
      ? error
      : new GeminiLiveOutputAudioError(
        'LIVE_DUBBING_OUTPUT_AUDIO_ERROR',
        'OUTPUT_AUDIO_ERROR',
        'Gemini Live PCM audio decoding failed',
      );
    this._terminateCurrent(
      generation,
      outputError,
      { code: 1000, wasClean: false },
      true,
      outputError.providerReason,
      null,
      null,
      { code: null, wasClean: null },
    );
    void socket;
  }

  _emitEvent(event) {
    // Event data is selected field-by-field above. Never expose PCM, base64,
    // transcripts, provider bodies, or raw Error objects to lifecycle callers.
    if (event?.type === 'audio') {
      this._emit(this.onEvent, { type: 'audio', mimeType: 'audio/pcm' });
      return;
    }
    if (event?.type === 'error') {
      this._emit(this.onEvent, { type: 'error', error: safeEventError(event.error) });
      return;
    }
    if (typeof event?.timeLeft === 'string') {
      event = { ...event, timeLeft: sanitizeMessage(event.timeLeft) };
    }
    this._emit(this.onEvent, event);
  }

  _emit(callback, ...args) {
    try {
      callback(...args);
    } catch {
      // Consumer callback failures must not break protocol cleanup or fencing.
    }
  }

  _emitError(error, providerDiagnostic = null) {
    if (providerDiagnostic) error.providerDiagnostic = providerDiagnostic;
    this._emit(this.onError, error);
    this._emitEvent({ type: 'error', error });
  }

  _markMilestone(name) {
    if (this.telemetry.milestones[name] !== null) return;
    let value = null;
    try {
      value = this.performanceNow();
    } catch {
      value = null;
    }
    if (Number.isFinite(value)) this.telemetry.milestones[name] = value;
  }

  _recordBufferedAmount() {
    let value = 0;
    try {
      value = safeNonNegativeNumber(this._socket?.bufferedAmount);
    } catch {
      value = 0;
    }
    this.telemetry.wsBufferedAmountPeak = Math.max(this.telemetry.wsBufferedAmountPeak, value);
  }

  _isReadySocket() {
    return this.phase === 'ready'
      && this._socket
      && (this._socket.readyState === undefined
        || this._socket.readyState === (this._socket.OPEN ?? OPEN_READY_STATE));
  }

  _isCurrent(socket, generation) {
    return this._socket === socket && this.generation === generation;
  }

  _rejectSetup(generation, error) {
    if (!this.setupState || this.setupState.generation !== generation) return;
    clearTimeout(this.setupState.timer);
    const setup = this.setupState;
    this.setupState = null;
    setup.reject(error);
  }

  _terminateCurrent(
    generation,
    error,
    closeDetails,
    notifyError = true,
    terminalCategory = null,
    onFenced = null,
    malformedAt = null,
    diagnosticCloseDetails = closeDetails,
  ) {
    if (this.generation !== generation || (!this._socket && !this.setupState)) return;
    const socket = this._socket;
    const setup = this.setupState;
    if (setup) {
      clearTimeout(setup.timer);
      this.setupState = null;
    }

    // Fence the generation before any callback can synchronously re-enter the
    // client and report the same terminal event a second time.
    this._socket = null;
    this._socketContext = null;
    this.phase = 'idle';
    this.generation += 1;
    this._markMilestone('cleanupStart');
    if (terminalCategory) this.telemetry.providerTerminalCategory = terminalCategory;
    const providerDiagnostic = createLiveDubbingProviderDiagnostic({
      code: error?.code,
      closeCode: diagnosticCloseDetails?.code,
      wasClean: diagnosticCloseDetails?.wasClean,
      terminalCategory,
      malformedAt,
      wsOpen: this.telemetry.milestones.wsOpen !== null,
      setupSent: this.telemetry.milestones.setupSent !== null,
      setupComplete: this.telemetry.milestones.setupComplete !== null,
    });

    const setupError = error || new GeminiLiveProtocolError(
      'GEMINI_LIVE_CLOSED',
      'Gemini Live session closed',
    );
    setupError.providerDiagnostic = providerDiagnostic;
    if (setup) setup.reject(setupError);
    // Fenced terminal semantics run before generic callbacks can observe the
    // same socket close and race to replace the terminal category.
    if (typeof onFenced === 'function') this._emit(onFenced, providerDiagnostic);
    if (error && notifyError) this._emitError(error, providerDiagnostic);

    if (socket && typeof socket.close === 'function') {
      try {
        socket.close(closeDetails.code === 1006 ? 1000 : closeDetails.code, 'client_close');
      } catch {
        // Closing an already failed native socket is best effort.
      }
    }

    const details = {
      code: closeDetails.code,
      wasClean: closeDetails.wasClean,
    };
    this._emit(this.onClose, details, providerDiagnostic);
    this._emitEvent({ type: 'close', code: details.code, wasClean: details.wasClean });
    this._markMilestone('cleanupComplete');
  }
}

export default GeminiLiveProviderAdapter;
