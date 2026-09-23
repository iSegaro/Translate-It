import {
  LIVE_DUBBING_OPENAI_PROVIDER_ID,
  LIVE_DUBBING_SETUP_TIMEOUT,
} from '../constants.js';
import {
  normalizeProviderTargetLanguage,
  createLiveDubbingOriginalTranscript,
  createLiveDubbingTranslatedTranscript,
  sanitizeLiveDubbingProviderDiagnostic,
} from '../contracts.js';
import { getScopedLogger } from '../../../shared/logging/logger.js';
import { LOG_COMPONENTS } from '../../../shared/logging/logConstants.js';

export const OPENAI_REALTIME_TRANSLATIONS_CALLS_ENDPOINT =
  'https://api.openai.com/v1/realtime/translations/calls';
export const OPENAI_REALTIME_EVENTS_CHANNEL = 'oai-events';
export const OPENAI_REALTIME_SETUP_TIMEOUT = LIVE_DUBBING_SETUP_TIMEOUT;

const TELEMETRY_MILESTONES = Object.freeze([
  'setupComplete',
  'firstTranslatedAudioReceived',
  'firstTranslatedAudioAcceptedByPlayback',
  'cleanupComplete',
]);
// Only oai-events types that terminally fail the session. Progress,
// transcript, audio, session, and rate-limit events are never terminal.
const TERMINAL_EVENT_TYPES = new Set(['error']);
const SAFE_ERROR_CODE = /^[A-Za-z0-9_.-]{1,80}$/;
const DISCONNECTED_GRACE_PERIOD = 3000;
const NOOP = () => {};
const DEFAULT_DUBBED_VOLUME = 1;
const logger = getScopedLogger(LOG_COMPONENTS.LIVE_DUBBING, 'OpenAIRealtimeProviderAdapter');
const PROVIDER_ERROR_MESSAGES = Object.freeze({
  OPENAI_REALTIME_PROVIDER_UNAVAILABLE: 'OpenAI Realtime provider is unavailable',
  OPENAI_REALTIME_DATA_CHANNEL_FAILED: 'OpenAI Realtime events channel failed',
  OPENAI_REALTIME_AUDIO_PLAYBACK_FAILED: 'OpenAI Realtime audio playback failed',
  OPENAI_REALTIME_SDP_EXCHANGE_FAILED: 'OpenAI Realtime SDP exchange failed',
  OPENAI_REALTIME_SETUP_CANCELLED: 'OpenAI Realtime setup was cancelled',
  OPENAI_REALTIME_SETUP_TIMEOUT: 'OpenAI Realtime setup timed out',
  OPENAI_REALTIME_REMOTE_TRACK_FAILED: 'OpenAI Realtime remote audio failed',
});
const PROVIDER_ERROR_CODES = new Set(Object.keys(PROVIDER_ERROR_MESSAGES));

function callbackFrom(options, callbacks, name) {
  for (const source of [options, callbacks]) {
    if (typeof source?.[name] === 'function') return source[name];
  }
  return NOOP;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isLiveAudioTrack(track) {
  return Boolean(track)
    && typeof track === 'object'
    && (track.kind === undefined || track.kind === 'audio')
    && track.readyState !== 'ended';
}

function resolveAudioTracks(sourceStream) {
  if (!sourceStream || typeof sourceStream.getAudioTracks !== 'function') return [];
  try {
    return sourceStream.getAudioTracks().filter(isLiveAudioTrack);
  } catch {
    return [];
  }
}

function readClientSecret(bootstrap) {
  if (!isRecord(bootstrap)) return null;
  const candidates = [bootstrap.secret, bootstrap.clientSecret, bootstrap.client_secret];
  return candidates.find(value => typeof value === 'string' && value.trim())?.trim() || null;
}

function messageForCode(code) {
  return PROVIDER_ERROR_MESSAGES[code] || 'OpenAI Realtime provider failed';
}

function readObjectField(source, field) {
  try {
    return source && typeof source === 'object' ? source[field] : undefined;
  } catch {
    return undefined;
  }
}

function sanitizeProviderDiagnostic(value) {
  try {
    const diagnostic = sanitizeLiveDubbingProviderDiagnostic(value);
    if (!diagnostic) return null;

    // The shared DTO is scalar-only. The adapter still accepts only its own
    // fixed error vocabulary so a foreign provider cannot smuggle an arbitrary
    // code into this boundary.
    return {
      ...diagnostic,
      code: PROVIDER_ERROR_CODES.has(diagnostic.code) ? diagnostic.code : null,
      terminalCategory: null,
      malformedAt: null,
    };
  } catch {
    return null;
  }
}

function createProviderError(code, cause = null) {
  const safeCode = PROVIDER_ERROR_CODES.has(code)
    ? code
    : 'OPENAI_REALTIME_PROVIDER_UNAVAILABLE';
  const error = new Error(messageForCode(safeCode));
  error.name = 'OpenAIRealtimeProviderError';
  error.code = safeCode;
  const providerDiagnostic = sanitizeProviderDiagnostic(readObjectField(cause, 'providerDiagnostic'));
  if (providerDiagnostic) error.providerDiagnostic = providerDiagnostic;
  return error;
}

function normalizeProviderError(error, fallbackCode) {
  const code = readObjectField(error, 'code');
  return createProviderError(PROVIDER_ERROR_CODES.has(code) ? code : fallbackCode, error);
}

function createAbortController() {
  try {
    return typeof globalThis.AbortController === 'function'
      ? new globalThis.AbortController()
      : null;
  } catch {
    return null;
  }
}

function abortController(controller) {
  if (!controller) return;
  try {
    if (controller.signal?.aborted) return;
  } catch {
    // Continue with best-effort abort when a foreign signal is malformed.
  }
  try { controller.abort(); } catch { /* best effort */ }
}

function abortSessionSdp(session) {
  if (!session || session.sdpAbortRequested) return;
  session.sdpAbortRequested = true;
  abortController(session.sdpAbortController);
}

function createTelemetry() {
  return {
    offerCreated: false,
    answerApplied: false,
    transcriptEvents: 0,
    remoteTracks: 0,
    milestones: Object.fromEntries(TELEMETRY_MILESTONES.map(name => [name, null])),
    providerTerminalCategory: null,
  };
}

function nowMs(performanceNow) {
  try {
    const value = performanceNow();
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function snapshotTelemetry(telemetry) {
  const source = telemetry || createTelemetry();
  return {
    offerCreated: source.offerCreated === true,
    answerApplied: source.answerApplied === true,
    transcriptEvents: Number.isSafeInteger(source.transcriptEvents) && source.transcriptEvents >= 0
      ? source.transcriptEvents
      : 0,
    remoteTracks: Number.isSafeInteger(source.remoteTracks) && source.remoteTracks >= 0
      ? source.remoteTracks
      : 0,
    milestones: Object.fromEntries(TELEMETRY_MILESTONES.map(name => [
      name,
      Number.isFinite(source.milestones?.[name]) ? source.milestones[name] : null,
    ])),
    providerTerminalCategory: typeof source.providerTerminalCategory === 'string'
      && SAFE_ERROR_CODE.test(source.providerTerminalCategory)
      ? source.providerTerminalCategory
      : null,
  };
}

function readEventType(data) {
  let type = null;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      type = parsed && typeof parsed === 'object' ? parsed.type : null;
    } catch {
      return null;
    }
  } else if (isRecord(data)) {
    type = data.type ?? data.data?.type;
  }
  return typeof type === 'string' ? type : null;
}

function readOutputTranscriptDelta(data) {
  let event = data;
  if (typeof data === 'string') {
    try {
      event = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!isRecord(event) || event.type !== 'session.output_transcript.delta') return null;
  try {
    return createLiveDubbingTranslatedTranscript(event.delta);
  } catch {
    return null;
  }
}

function readOriginalTranscriptDelta(data) {
  let event = data;
  if (typeof data === 'string') {
    try {
      event = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!isRecord(event) || event.type !== 'session.input_transcript.delta') return null;
  try {
    return createLiveDubbingOriginalTranscript(event.delta);
  } catch {
    return null;
  }
}

function isTerminalEvent(data) {
  return TERMINAL_EVENT_TYPES.has(readEventType(data));
}

function closePeerConnection(peerConnection) {
  try { peerConnection?.close?.(); } catch { /* best effort */ }
}

/**
 * Provider-neutral dubbed-volume policy: a normalized 0-1 ratio, never a
 * percentage. Anything outside a finite 0..1 is rejected with RangeError so
 * invalid caller input fails fast at this boundary instead of reaching the
 * playback element.
 */
function normalizeDubbedVolume(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError('dubbed volume must be a finite number between 0 and 1');
  }
  return value;
}

/**
 * Registered production OpenAI Realtime WebRTC provider adapter.
 *
 * The Controller owns the source MediaStream and its tracks. This adapter
 * only adds the live audio tracks to a peer connection, exchanges raw SDP,
 * and owns the remote playback element. Bootstrap remains opaque outside the
 * short-lived Authorization header; secrets, SDP, media, and raw provider
 * transcript payloads never enter lifecycle callbacks.
 */
export class OpenAIRealtimeProviderAdapter {
  constructor(options = {}) {
    const callbacks = options.callbacks || {};
    this.peerConnectionFactory = options.peerConnectionFactory
      || (() => new globalThis.RTCPeerConnection());
    this.fetchImpl = options.fetchImpl
      || (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
    this.audioElementFactory = options.audioElementFactory
      || (() => globalThis.document?.createElement('audio'));
    this.mediaStreamFactory = options.mediaStreamFactory
      || (tracks => new globalThis.MediaStream(tracks));
    this.setupTimeout = Number.isFinite(options.setupTimeout) && options.setupTimeout > 0
      ? options.setupTimeout
      : OPENAI_REALTIME_SETUP_TIMEOUT;
    this.performanceNow = typeof options.performanceNow === 'function'
      ? options.performanceNow
      : () => globalThis.performance?.now?.() ?? null;

    this.onSetupComplete = callbackFrom(options, callbacks, 'onSetupComplete');
    this.onPlaybackAccepted = callbackFrom(options, callbacks, 'onPlaybackAccepted');
    this.onError = callbackFrom(options, callbacks, 'onError');
    this.onClose = callbackFrom(options, callbacks, 'onClose');
    this.onTranslatedTranscript = callbackFrom(options, callbacks, 'onTranslatedTranscript');
    this.onOriginalTranscript = callbackFrom(options, callbacks, 'onOriginalTranscript');

    this.generation = 0;
    this.attachmentToken = 0;
    this.session = null;
    this.pendingStart = null;
    this.lastTelemetry = null;
    this.dubbedVolume = DEFAULT_DUBBED_VOLUME;
    this.log = options.logger || logger;
  }

  get active() {
    return Boolean(this.session && !this.session.disposed);
  }

  /**
   * Provider-neutral dubbed (translated speech) output volume.
   *
   * Stores the value immediately; when a remote playback element is already
   * attached it is updated live, otherwise the value is only remembered and
   * applied to the element on the next remote-track attachment (before
   * play()). Invalid values throw RangeError without touching the stored
   * value. A live-element application failure is rethrown (strict) so the
   * Controller can reconcile/rollback without terminalizing the provider:
   * no terminal/error callbacks, reconnect, or dispose happen here. The
   * stored value is kept on failure so the user's intent is preserved.
   */
  setDubbedVolume(volume) {
    const normalized = normalizeDubbedVolume(volume);
    this.dubbedVolume = normalized;
    this._applyDubbedVolume(this.session?.audioElement, { strict: true });
    return normalized;
  }

  /**
   * Latest dubbed output volume, defaulting to full volume before any SET.
   */
  getDubbedVolume() {
    return this.dubbedVolume;
  }

  /**
   * Best-effort volume application to a playback element. The attachment path
   * (default, non-strict) never throws and never reports a provider failure:
   * volume is cosmetic and must not affect WebRTC transport, ontrack wiring,
   * or reconnect behavior. The runtime SET path (`strict: true`) rethrows the
   * assignment error after logging so the Controller can surface
   * `LIVE_DUBBING_DUBBED_AUDIO_UNAVAILABLE` and reconcile/rollback without
   * terminalizing the provider.
   */
  _applyDubbedVolume(element, { strict = false } = {}) {
    if (!element) return;
    try {
      element.volume = this.dubbedVolume;
    } catch (error) {
      try { this.log?.warn?.('OpenAI Realtime dubbed volume apply failed'); } catch { /* best effort */ }
      if (strict) throw error;
    }
  }

  /**
   * Establish one WebRTC translation session. Setup resolves only after the
   * SDP exchange plus minimum transport viability (open oai-events channel)
   * within the setup timeout, so the Controller never observes a falsely
   * RUNNING session. Setup failures reject so the Controller's existing
   * provider error boundary owns terminal cleanup.
   */
  connect(connectionOptions = {}) {
    return this._connect(connectionOptions);
  }

  async _connect(connectionOptions) {
    if (this.pendingStart || this.active) {
      throw createProviderError('OPENAI_REALTIME_PROVIDER_UNAVAILABLE');
    }
    if (!isRecord(connectionOptions)
      || !Object.prototype.hasOwnProperty.call(connectionOptions, 'bootstrap')
      || !Object.prototype.hasOwnProperty.call(connectionOptions, 'targetLanguage')
      || !Object.prototype.hasOwnProperty.call(connectionOptions, 'sourceStream')) {
      throw createProviderError('OPENAI_REALTIME_PROVIDER_UNAVAILABLE');
    }

    try {
      normalizeProviderTargetLanguage(
        LIVE_DUBBING_OPENAI_PROVIDER_ID,
        connectionOptions.targetLanguage,
      );
    } catch {
      throw createProviderError('OPENAI_REALTIME_PROVIDER_UNAVAILABLE');
    }
    const secret = readClientSecret(connectionOptions.bootstrap);
    const tracks = resolveAudioTracks(connectionOptions.sourceStream);
    if (!secret || tracks.length === 0 || typeof this.fetchImpl !== 'function') {
      throw createProviderError('OPENAI_REALTIME_PROVIDER_UNAVAILABLE');
    }

    const generation = ++this.generation;
    const pendingStart = { generation };
    const session = {
      generation,
      disposed: false,
      peerConnection: null,
      dataChannel: null,
      audioElement: null,
      remoteTrack: null,
      remoteTrackEnded: null,
      remoteAttachmentToken: null,
      sdpAbortController: createAbortController(),
      sdpAbortRequested: false,
      playbackAccepted: false,
      telemetry: createTelemetry(),
      cancelReject: null,
      viability: null,
      viabilityTimer: null,
      disconnectedTimer: null,
    };
    const cancellation = new Promise((_, reject) => {
      session.cancelReject = reject;
    });
    this.pendingStart = pendingStart;
    this.session = session;

    const isCurrent = () => this.session === session
      && !session.disposed
      && session.generation === this.generation;
    const setup = this._setup(session, isCurrent, tracks, connectionOptions, secret);
    const timeout = new Promise((_, reject) => {
      pendingStart.timer = setTimeout(
        () => {
          abortSessionSdp(session);
          reject(createProviderError('OPENAI_REALTIME_SETUP_TIMEOUT'));
        },
        this.setupTimeout,
      );
    });

    try {
      await Promise.race([setup, timeout, cancellation]);
      if (!isCurrent()) throw createProviderError('OPENAI_REALTIME_SETUP_CANCELLED');
      session.telemetry.milestones.setupComplete = nowMs(this.performanceNow);
      this._clearPending(pendingStart);
      session.cancelReject = null;
      this.onSetupComplete();
      return undefined;
    } catch (error) {
      const cancelled = !isCurrent();
      const safeError = normalizeProviderError(
        error,
        'OPENAI_REALTIME_SDP_EXCHANGE_FAILED',
      );
      this._clearPending(pendingStart);
      if (!cancelled) {
        this._notifyError(safeError);
        await this._cleanupSession(session);
      }
      throw safeError;
    } finally {
      clearTimeout(pendingStart.timer);
      if (this.pendingStart === pendingStart) this.pendingStart = null;
    }
  }

  async _setup(session, isCurrent, tracks, connectionOptions, secret) {
    let peerConnection;
    try {
      peerConnection = await this.peerConnectionFactory();
    } catch {
      throw createProviderError('OPENAI_REALTIME_PROVIDER_UNAVAILABLE');
    }
    if (!isCurrent()) {
      closePeerConnection(peerConnection);
      throw createProviderError('OPENAI_REALTIME_SETUP_CANCELLED');
    }
    if (!peerConnection
      || typeof peerConnection.addTrack !== 'function'
      || typeof peerConnection.createDataChannel !== 'function'
      || typeof peerConnection.createOffer !== 'function'
      || typeof peerConnection.setLocalDescription !== 'function'
      || typeof peerConnection.setRemoteDescription !== 'function') {
      closePeerConnection(peerConnection);
      throw createProviderError('OPENAI_REALTIME_PROVIDER_UNAVAILABLE');
    }

    session.peerConnection = peerConnection;
    peerConnection.ontrack = event => this._handleRemoteTrack(session, event, isCurrent);
    peerConnection.onconnectionstatechange = () => this._handlePeerState(session, isCurrent);
    peerConnection.oniceconnectionstatechange = () => this._handlePeerState(session, isCurrent);

    try {
      const dataChannel = peerConnection.createDataChannel(OPENAI_REALTIME_EVENTS_CHANNEL);
      session.dataChannel = dataChannel;
      dataChannel.onopen = () => this._handleChannelViable(session, isCurrent);
      dataChannel.onmessage = event => {
        if (!isCurrent()) return;
        // Only terminal/error event types fail the session. Supported transcript
        // events are normalized before reaching the Controller; all other
        // transcript-shaped events are ignored.
        if (isTerminalEvent(event?.data)) {
          this._reportRuntimeFailure(
            session,
            isCurrent,
            createProviderError('OPENAI_REALTIME_PROVIDER_UNAVAILABLE'),
          );
          return;
        }
        const transcript = readOutputTranscriptDelta(event?.data);
        const originalTranscript = readOriginalTranscriptDelta(event?.data);
        if (transcript || originalTranscript) {
          session.telemetry.transcriptEvents += 1;
        }
        if (transcript) this._emit(this.onTranslatedTranscript, transcript);
        if (originalTranscript) this._emit(this.onOriginalTranscript, originalTranscript);
      };
      dataChannel.onerror = () => this._reportRuntimeFailure(
        session,
        isCurrent,
        createProviderError('OPENAI_REALTIME_DATA_CHANNEL_FAILED'),
      );
      dataChannel.onclose = () => {
        if (isCurrent()) this._reportRuntimeFailure(
          session,
          isCurrent,
          createProviderError('OPENAI_REALTIME_DATA_CHANNEL_FAILED'),
        );
      };
    } catch {
      throw createProviderError('OPENAI_REALTIME_DATA_CHANNEL_FAILED');
    }

    try {
      for (const track of tracks) {
        if (!isCurrent()) throw createProviderError('OPENAI_REALTIME_SETUP_CANCELLED');
        peerConnection.addTrack(track, connectionOptions.sourceStream);
      }
      const offer = await peerConnection.createOffer();
      if (!isCurrent()) throw createProviderError('OPENAI_REALTIME_SETUP_CANCELLED');
      await peerConnection.setLocalDescription(offer);
      const offerSdp = offer?.sdp || peerConnection.localDescription?.sdp;
      if (typeof offerSdp !== 'string' || !offerSdp.trim()) {
        throw createProviderError('OPENAI_REALTIME_SDP_EXCHANGE_FAILED');
      }
      session.telemetry.offerCreated = true;

      const response = await this.fetchImpl(OPENAI_REALTIME_TRANSLATIONS_CALLS_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/sdp',
        },
        body: offerSdp,
        signal: session.sdpAbortController?.signal,
      });
      if (!isCurrent()) throw createProviderError('OPENAI_REALTIME_SETUP_CANCELLED');
      if (!response || response.ok !== true) {
        throw createProviderError('OPENAI_REALTIME_SDP_EXCHANGE_FAILED');
      }
      const answerSdp = await response.text();
      if (!isCurrent()) throw createProviderError('OPENAI_REALTIME_SETUP_CANCELLED');
      if (typeof answerSdp !== 'string' || !answerSdp.trim()) {
        throw createProviderError('OPENAI_REALTIME_SDP_EXCHANGE_FAILED');
      }
      await peerConnection.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      if (!isCurrent()) throw createProviderError('OPENAI_REALTIME_SETUP_CANCELLED');
      session.telemetry.answerApplied = true;
      // SDP success alone never completes setup: the translations transport
      // is only viable once the oai-events channel is open (which transitively
      // proves ICE/DTLS/SCTP connectivity). Remote audio is opportunistic —
      // silence yields no track — so it never gates viability.
      await this._awaitTransportViable(session, isCurrent);
    } catch (error) {
      throw normalizeProviderError(error, 'OPENAI_REALTIME_SDP_EXCHANGE_FAILED');
    }
  }

  _isTransportViable(session) {
    try {
      return session?.dataChannel?.readyState === 'open';
    } catch {
      return false;
    }
  }

  _awaitTransportViable(session, isCurrent) {
    if (!isCurrent()) throw createProviderError('OPENAI_REALTIME_SETUP_CANCELLED');
    if (this._isTransportViable(session)) return Promise.resolve(true);
    return new Promise((resolve, reject) => {
      session.viability = { resolve, reject };
      session.viabilityTimer = setTimeout(() => {
        session.viabilityTimer = null;
        session.viability = null;
        if (!isCurrent()) return;
        reject(createProviderError('OPENAI_REALTIME_SETUP_TIMEOUT'));
      }, this.setupTimeout);
    });
  }

  _handleChannelViable(session, isCurrent) {
    if (!isCurrent()) return;
    const viability = session.viability;
    if (!viability) return;
    session.viability = null;
    this._clearViabilityWatchdog(session);
    viability.resolve(true);
  }

  _clearViabilityWatchdog(session) {
    if (session?.viabilityTimer) {
      clearTimeout(session.viabilityTimer);
      session.viabilityTimer = null;
    }
  }

  _rejectViabilityWaiter(session) {
    const viability = session?.viability;
    if (session) {
      session.viability = null;
      this._clearViabilityWatchdog(session);
    }
    if (viability) {
      try {
        viability.reject(createProviderError('OPENAI_REALTIME_SETUP_CANCELLED'));
      } catch { /* best effort */ }
    }
  }

  _handleRemoteTrack(session, event, isCurrent) {
    if (!isCurrent() || !isLiveAudioTrack(event?.track)) return;
    session.telemetry.remoteTracks += 1;
    if (session.telemetry.milestones.firstTranslatedAudioReceived === null) {
      session.telemetry.milestones.firstTranslatedAudioReceived = nowMs(this.performanceNow);
    }

    let stream = event?.streams?.[0] || null;
    if (!stream) {
      try { stream = this.mediaStreamFactory([event.track]); } catch { stream = null; }
    }
    if (!stream) {
      this._reportRuntimeFailure(session, isCurrent, createProviderError('OPENAI_REALTIME_REMOTE_TRACK_FAILED'));
      return;
    }

    const attachmentToken = ++this.attachmentToken;
    this._detachRemoteTrackListener(session);
    session.remoteAttachmentToken = attachmentToken;
    session.remoteTrack = event.track;
    const isAttachmentCurrent = () => isCurrent()
      && session.remoteAttachmentToken === attachmentToken
      && session.remoteTrack === event.track;

    let element = session.audioElement;
    try {
      if (!element) element = this.audioElementFactory();
      if (!element || typeof element.play !== 'function') throw new Error('audio element unavailable');
      session.audioElement = element;
      element.autoplay = true;
      element.playsInline = true;
      element.srcObject = stream;
      // The stored dubbed volume wins over the element default on every
      // attachment (including replacement tracks reusing this element), and
      // is always applied before play() so the first audible frame already
      // carries the latest level. Best effort: never throws, so transport
      // and playback-failure semantics below are unchanged.
      this._applyDubbedVolume(element);
      session.remoteTrackEnded = () => this._reportRuntimeFailure(
        session,
        isAttachmentCurrent,
        createProviderError('OPENAI_REALTIME_REMOTE_TRACK_FAILED'),
      );
      event.track.addEventListener?.('ended', session.remoteTrackEnded, { once: true });
      Promise.resolve(element.play()).then(
        () => {
          if (!isAttachmentCurrent() || session.playbackAccepted) return;
          session.playbackAccepted = true;
          session.telemetry.milestones.firstTranslatedAudioAcceptedByPlayback = nowMs(this.performanceNow);
          this.onPlaybackAccepted({ accepted: true });
        },
        () => {
          if (isAttachmentCurrent()) {
            this._reportRuntimeFailure(
              session,
              isAttachmentCurrent,
              createProviderError('OPENAI_REALTIME_AUDIO_PLAYBACK_FAILED'),
            );
          }
        },
      );
    } catch {
      if (isAttachmentCurrent()) {
        this._reportRuntimeFailure(
          session,
          isAttachmentCurrent,
          createProviderError('OPENAI_REALTIME_AUDIO_PLAYBACK_FAILED'),
        );
      }
    }
  }

  _detachRemoteTrackListener(session) {
    try {
      if (session.remoteTrack && session.remoteTrackEnded) {
        session.remoteTrack.removeEventListener?.('ended', session.remoteTrackEnded);
      }
    } catch { /* best effort */ }
    session.remoteTrack = null;
    session.remoteTrackEnded = null;
  }

  _handlePeerState(session, isCurrent) {
    if (!isCurrent()) return;
    const peerConnection = session.peerConnection;
    const connectionState = peerConnection?.connectionState;
    const iceConnectionState = peerConnection?.iceConnectionState;
    if ([connectionState, iceConnectionState].some(state => state === 'closed' || state === 'failed')) {
      this._reportRuntimeFailure(
        session,
        isCurrent,
        createProviderError('OPENAI_REALTIME_PROVIDER_UNAVAILABLE'),
      );
      return;
    }

    if (connectionState === 'disconnected' || iceConnectionState === 'disconnected') {
      if (session.disconnectedTimer !== null) return;

      const disconnectedTimer = setTimeout(() => {
        if (session.disconnectedTimer !== disconnectedTimer) return;
        session.disconnectedTimer = null;
        if (!isCurrent()) return;

        const currentStates = [
          session.peerConnection?.connectionState,
          session.peerConnection?.iceConnectionState,
        ];
        if (!currentStates.some(state => state === 'disconnected'
          || state === 'closed'
          || state === 'failed')) return;

        this._reportRuntimeFailure(
          session,
          isCurrent,
          createProviderError('OPENAI_REALTIME_PROVIDER_UNAVAILABLE'),
        );
      }, DISCONNECTED_GRACE_PERIOD);
      session.disconnectedTimer = disconnectedTimer;
      return;
    }

    if (session.disconnectedTimer !== null) {
      clearTimeout(session.disconnectedTimer);
      session.disconnectedTimer = null;
    }
  }

  _reportRuntimeFailure(session, isCurrent, error) {
    if (!isCurrent()) return;
    const safeError = normalizeProviderError(error, 'OPENAI_REALTIME_PROVIDER_UNAVAILABLE');
    this._notifyError(safeError);
    void this._cleanupSession(session);
  }

  _notifyError(error) {
    try {
      this.onError(normalizeProviderError(error, 'OPENAI_REALTIME_PROVIDER_UNAVAILABLE'));
    } catch { /* lifecycle callback is best effort */ }
  }

  _emit(callback, ...args) {
    try {
      callback(...args);
    } catch {
      // Consumer callbacks must not affect the WebRTC session.
    }
  }

  _clearPending(pendingStart) {
    if (this.pendingStart === pendingStart) this.pendingStart = null;
  }

  async dispose() {
    this.generation += 1;
    const pendingStart = this.pendingStart;
    this.pendingStart = null;
    const session = this.session;
    if (pendingStart) pendingStart.cancelled = true;
    if (!session || session.disposed) return { success: true, idempotent: true };

    session.disposed = true;
    abortSessionSdp(session);
    session.cancelReject?.(createProviderError('OPENAI_REALTIME_SETUP_CANCELLED'));
    await this._cleanupSession(session);
    return { success: true };
  }

  close() {
    return this.dispose();
  }

  getTelemetry() {
    return snapshotTelemetry(this.session?.telemetry || this.lastTelemetry);
  }

  _cleanupSession(session) {
    if (!session || session.cleaned) return Promise.resolve();
    session.cleaned = true;
    if (session.disconnectedTimer !== null) {
      clearTimeout(session.disconnectedTimer);
      session.disconnectedTimer = null;
    }
    abortSessionSdp(session);
    // Settle a pending viability wait as stale so setup cannot hang past
    // teardown; the watchdog timer is cleared with it.
    this._rejectViabilityWaiter(session);
    try { session.dataChannel && (session.dataChannel.onmessage = null); } catch { /* best effort */ }
    try {
      if (session.dataChannel) {
        session.dataChannel.onopen = null;
        session.dataChannel.onerror = null;
        session.dataChannel.onclose = null;
      }
    } catch { /* best effort */ }
    this._detachRemoteTrackListener(session);
    try {
      if (session.peerConnection) {
        session.peerConnection.ontrack = null;
        session.peerConnection.onconnectionstatechange = null;
        session.peerConnection.oniceconnectionstatechange = null;
      }
    } catch { /* best effort */ }
    try { session.dataChannel?.close?.(); } catch { /* best effort */ }
    closePeerConnection(session.peerConnection);
    try { session.audioElement?.pause?.(); } catch { /* best effort */ }
    try {
      if (session.audioElement) session.audioElement.srcObject = null;
    } catch { /* best effort */ }
    session.dataChannel = null;
    session.peerConnection = null;
    session.audioElement = null;
    session.remoteAttachmentToken = null;
    session.sdpAbortController = null;
    this.lastTelemetry = snapshotTelemetry(session.telemetry);
    if (this.session === session) this.session = null;
    return Promise.resolve();
  }
}
