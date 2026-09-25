import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { normalizeSpikeTargetLanguage } from './spikeTargetLanguage.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_DUBBING, 'OpenAIRealtimeTranslationTransport(SPIKE)');

/** Verbatim SDP exchange endpoint for the Phase D feasibility spike. */
export const OPENAI_REALTIME_TRANSLATIONS_CALLS_ENDPOINT =
  'https://api.openai.com/v1/realtime/translations/calls';
/** The only data channel the spike ever creates. */
export const OPENAI_REALTIME_EVENTS_CHANNEL = 'oai-events';

function createTelemetry() {
  return {
    offerCreated: false,
    answerApplied: false,
    transcriptEvents: 0,
    remoteTracks: 0,
    milestones: {
      start: null,
      offerCreated: null,
      answerApplied: null,
      firstRemoteAudio: null,
      firstTranscriptEvent: null,
      cleanup: null,
    },
  };
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
    milestones: { ...createTelemetry().milestones, ...(source.milestones || {}) },
  };
}

function nowMs(performanceNow) {
  try {
    const value = typeof performanceNow === 'function' ? performanceNow() : null;
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function isLiveTrack(track) {
  return Boolean(track)
    && typeof track === 'object'
    && track.readyState !== 'ended'
    && (track.kind === undefined || track.kind === 'audio' || typeof track.kind !== 'string');
}

/**
 * Resolve the browser-neutral audio input. Accepts either a MediaStream or a
 * lone MediaStreamTrack; only `getAudioTracks`/`kind`/`readyState` are read.
 * @returns {object[]} Live audio tracks (never cloned, never stopped here).
 */
function resolveSourceTracks(sourceStream, sourceAudioTrack) {
  if (isLiveTrack(sourceAudioTrack)) return [sourceAudioTrack];
  if (sourceStream && typeof sourceStream.getAudioTracks === 'function') {
    try {
      return sourceStream.getAudioTracks().filter(isLiveTrack);
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Count transcript events only. Accepts the string or object forms delivered
 * by `RTCDataChannel` messages; every other shape is ignored. Transcript
 * text is never read, stored, logged, or returned — only the counter moves.
 */
function isTranscriptEvent(data) {
  let type = null;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      type = parsed && typeof parsed === 'object' ? parsed.type : null;
    } catch {
      return false;
    }
  } else if (data && typeof data === 'object') {
    type = data.type ?? data.data?.type ?? null;
  }
  return typeof type === 'string' && type.toLowerCase().includes('transcript');
}

/**
 * Browser-neutral OpenAI Realtime translation transport (SPIKE ONLY).
 *
 * Input is `{ sourceStream|sourceAudioTrack, targetLanguage, bootstrap }`
 * where `bootstrap` carries only the minted client secret. The transport
 * uses only `MediaStream`/`MediaStreamTrack`/`RTCPeerConnection`/
 * `RTCDataChannel`/audio-element playback. It never imports browser capture
 * APIs and never touches the tab audio pipeline or PCM output player
 * modules owned by the production offscreen controller.
 *
 * Cleanup is idempotent and generation-fenced: `dispose()` closes the data
 * channel, peer connection, and audio element, clears every handler, and
 * drops track references without ever stopping a track it does not own (it
 * owns none — source tracks are only added via `addTrack`). A pending start
 * is reserved synchronously before the first await, so a concurrent start
 * is rejected and a `dispose()` during setup invalidates the reservation:
 * a late factory resolution can never publish and its connection is closed.
 */
export class OpenAIRealtimeTranslationTransport {
  constructor(options = {}) {
    this.peerConnectionFactory = typeof options.peerConnectionFactory === 'function'
      ? options.peerConnectionFactory
      : () => new globalThis.RTCPeerConnection();
    this.fetchImpl = typeof options.fetchImpl === 'function' ? options.fetchImpl : null;
    this.audioElementFactory = typeof options.audioElementFactory === 'function'
      ? options.audioElementFactory
      : () => globalThis.document?.createElement('audio');
    this.performanceNow = typeof options.performanceNow === 'function'
      ? options.performanceNow
      : () => globalThis.performance?.now?.() ?? null;
    this.log = options.logger || logger;

    this.generation = 0;
    this.session = null;
    this.pendingStart = null;
    this.lastTelemetry = null;
  }

  get active() {
    return Boolean(this.session && !this.session.disposed);
  }

  /**
   * Start one fenced translation session.
   * @param {{sourceStream?: object, sourceAudioTrack?: object, targetLanguage: unknown, bootstrap: {secret?: unknown, targetLanguage?: unknown}}} input
   * @returns {Promise<{success: boolean, targetLanguage?: string, error?: string}>}
   */
  async start(input = {}) {
    // A rejected start must leave live state untouched: no reservation
    // exists yet, so generation is not moved here. An active session OR a
    // pending start both fence concurrent starts.
    if (this.pendingStart || (this.session && !this.session.disposed)) {
      return { success: false, error: 'ALREADY_STARTED' };
    }

    const targetLanguage = normalizeSpikeTargetLanguage(input.targetLanguage);
    if (!targetLanguage) return { success: false, error: 'INVALID_TARGET_LANGUAGE' };

    const bootstrap = input.bootstrap && typeof input.bootstrap === 'object' ? input.bootstrap : null;
    const secret = typeof bootstrap?.secret === 'string' && bootstrap.secret ? bootstrap.secret : null;
    if (!secret) return { success: false, error: 'INVALID_BOOTSTRAP' };
    if (bootstrap.targetLanguage !== undefined && bootstrap.targetLanguage !== null
      && bootstrap.targetLanguage !== targetLanguage) {
      return { success: false, error: 'LANGUAGE_MISMATCH' };
    }

    const tracks = resolveSourceTracks(input.sourceStream, input.sourceAudioTrack);
    if (tracks.length === 0) return { success: false, error: 'NO_AUDIO_TRACK' };

    // Reserve the pending start synchronously, before the first await, so a
    // concurrent start observes it and a dispose() during setup can
    // invalidate it. Generation moves only for a legitimate new start.
    const generation = ++this.generation;
    const pendingStart = { generation };
    this.pendingStart = pendingStart;
    const isPending = () => this.pendingStart === pendingStart;

    let peerConnection;
    try {
      peerConnection = await this.peerConnectionFactory();
    } catch {
      this._clearPendingStart(pendingStart);
      return { success: false, error: 'PEER_CONNECTION_UNAVAILABLE' };
    }
    // A dispose() during the factory await invalidated the reservation: the
    // late connection must never publish, so close it and stop.
    if (!isPending()) {
      try { peerConnection?.close?.(); } catch { /* best effort */ }
      return { success: false, error: 'START_CANCELLED' };
    }
    if (!peerConnection || typeof peerConnection.addTrack !== 'function') {
      this._clearPendingStart(pendingStart);
      return { success: false, error: 'PEER_CONNECTION_UNAVAILABLE' };
    }
    if (typeof peerConnection.createDataChannel !== 'function') {
      try { peerConnection.close?.(); } catch { /* best effort */ }
      this._clearPendingStart(pendingStart);
      return { success: false, error: 'DATA_CHANNEL_UNAVAILABLE' };
    }

    const telemetry = createTelemetry();
    telemetry.milestones.start = nowMs(this.performanceNow);
    const session = {
      generation,
      peerConnection,
      channel: null,
      audioElement: null,
      targetLanguage,
      telemetry,
      disposed: false,
      senders: [],
    };
    this.session = session;
    this._clearPendingStart(pendingStart);

    const isCurrent = () => this.session === session
      && session.generation === this.generation
      && !session.disposed;

    try {
      const channel = peerConnection.createDataChannel(OPENAI_REALTIME_EVENTS_CHANNEL);
      session.channel = channel;
      channel.onmessage = (event) => {
        if (!isCurrent()) return;
        if (!isTranscriptEvent(event?.data)) return;
        session.telemetry.transcriptEvents += 1;
        if (session.telemetry.milestones.firstTranscriptEvent === null) {
          session.telemetry.milestones.firstTranscriptEvent = nowMs(this.performanceNow);
        }
      };

      peerConnection.ontrack = (event) => {
        if (!isCurrent()) return;
        const track = event?.track;
        if (!track) return;
        session.telemetry.remoteTracks += 1;
        if (session.telemetry.milestones.firstRemoteAudio === null) {
          session.telemetry.milestones.firstRemoteAudio = nowMs(this.performanceNow);
        }
        this._attachRemoteAudio(session, event);
      };

      for (const track of tracks) {
        try {
          const sender = peerConnection.addTrack(track, input.sourceStream || undefined);
          if (sender) session.senders.push(sender);
        } catch {
          throw Object.assign(new Error('Track attachment failed'), { code: 'ADD_TRACK_FAILED' });
        }
      }

      let offer;
      try {
        offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
      } catch {
        throw Object.assign(new Error('Offer failed'), { code: 'OFFER_FAILED' });
      }
      const offerSdp = offer?.sdp || peerConnection.localDescription?.sdp;
      if (typeof offerSdp !== 'string' || !offerSdp.trim()) {
        throw Object.assign(new Error('Offer has no SDP'), { code: 'OFFER_FAILED' });
      }
      session.telemetry.offerCreated = true;
      session.telemetry.milestones.offerCreated = nowMs(this.performanceNow);

      let answerSdp;
      try {
        const response = await this._fetch(OPENAI_REALTIME_TRANSLATIONS_CALLS_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${secret}`,
            'Content-Type': 'application/sdp',
          },
          body: offerSdp,
        });
        if (!response || response.ok !== true) {
          throw Object.assign(new Error('SDP exchange failed'), { code: 'SDP_EXCHANGE_FAILED' });
        }
        answerSdp = await response.text();
      } catch (error) {
        throw Object.assign(new Error('SDP exchange failed'), {
          code: error?.code || 'SDP_EXCHANGE_FAILED',
        });
      }
      if (typeof answerSdp !== 'string' || !answerSdp.trim()) {
        throw Object.assign(new Error('Empty SDP answer'), { code: 'ANSWER_FAILED' });
      }

      try {
        await peerConnection.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      } catch {
        throw Object.assign(new Error('Remote description failed'), { code: 'REMOTE_DESCRIPTION_FAILED' });
      }
      if (!isCurrent()) {
        throw Object.assign(new Error('Session superseded during setup'), { code: 'SUPERSEDED' });
      }
      session.telemetry.answerApplied = true;
      session.telemetry.milestones.answerApplied = nowMs(this.performanceNow);
      return { success: true, targetLanguage };
    } catch (error) {
      await this._abandon(session);
      const code = typeof error?.code === 'string' && error.code ? error.code : 'START_FAILED';
      return { success: false, error: code };
    }
  }

  /** Scalar-only, same-context diagnostics. No secret, SDP, or text. */
  getTelemetry() {
    if (this.session) return snapshotTelemetry(this.session.telemetry);
    return snapshotTelemetry(this.lastTelemetry);
  }

  getSnapshot() {
    return {
      active: this.active,
      targetLanguage: this.session?.targetLanguage || null,
      telemetry: this.getTelemetry(),
    };
  }

  /**
   * Idempotent, fenced teardown. Invalidates any pending start first so a
   * late factory resolution cannot publish (its connection is closed by the
   * start path), then closes the data channel, peer connection, and audio
   * element and clears every handler. Source tracks are only dereferenced —
   * never stopped, because the transport owns none.
   */
  async dispose() {
    this.generation += 1;
    this.pendingStart = null;
    const session = this.session;
    if (!session || session.disposed) return { success: true, idempotent: true };
    session.disposed = true;

    try { if (session.channel) session.channel.onmessage = null; } catch { /* best effort */ }
    try {
      if (session.peerConnection) {
        session.peerConnection.ontrack = null;
        session.peerConnection.onconnectionstatechange = null;
      }
    } catch { /* best effort */ }

    try { await session.channel?.close?.(); } catch { /* best effort */ }
    try { session.peerConnection?.close?.(); } catch { /* best effort */ }
    try { await session.audioElement?.pause?.(); } catch { /* best effort */ }
    try {
      if (session.audioElement) session.audioElement.srcObject = null;
    } catch { /* best effort */ }

    session.senders = [];
    session.channel = null;
    session.peerConnection = null;
    session.audioElement = null;
    this.lastTelemetry = snapshotTelemetry(session.telemetry);
    if (this.lastTelemetry.milestones.cleanup === null) {
      this.lastTelemetry.milestones.cleanup = nowMs(this.performanceNow);
    }
    this.session = null;
    return { success: true };
  }

  _attachRemoteAudio(session, event) {
    let element = session.audioElement;
    if (!element) {
      try {
        element = this.audioElementFactory();
      } catch {
        return;
      }
      if (!element) return;
      session.audioElement = element;
    }
    try {
      const stream = event?.streams?.[0]
        || (typeof MediaStream === 'function' && event?.track ? new MediaStream([event.track]) : null);
      if (stream && 'srcObject' in element) element.srcObject = stream;
      const played = element.play?.();
      if (played && typeof played.catch === 'function') played.catch(() => {});
    } catch { /* playback attachment is best effort */ }
  }

  _clearPendingStart(pendingStart) {
    if (this.pendingStart === pendingStart) this.pendingStart = null;
  }

  async _abandon(session) {
    if (this.session === session) this.session = null;
    session.disposed = true;
    try { if (session.channel) session.channel.onmessage = null; } catch { /* best effort */ }
    try {
      if (session.peerConnection) {
        session.peerConnection.ontrack = null;
        session.peerConnection.onconnectionstatechange = null;
      }
    } catch { /* best effort */ }
    try { await session.channel?.close?.(); } catch { /* best effort */ }
    try { session.peerConnection?.close?.(); } catch { /* best effort */ }
    try { await session.audioElement?.pause?.(); } catch { /* best effort */ }
    try {
      if (session.audioElement) session.audioElement.srcObject = null;
    } catch { /* best effort */ }
    session.senders = [];
    session.channel = null;
    session.peerConnection = null;
    session.audioElement = null;
  }

  /**
   * Spike SDP exchange goes through the existing proxy infrastructure on a
   * single path, mirroring `GeminiLiveBootstrapService._fetch`.
   */
  async _fetch(url, options) {
    if (this.fetchImpl) return this.fetchImpl(url, options);

    const { resolveProxyConfig } = await import('@/shared/proxy/ProxySettings.js');
    const { proxyManager } = await import('@/shared/proxy/ProxyManager.js');
    return proxyManager.fetch(url, options, await resolveProxyConfig());
  }
}
