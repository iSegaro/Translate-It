import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { isAuthorizedOffscreenRouterSender } from '@/features/live-dubbing/contracts.js';
import { normalizeSpikeTargetLanguage } from './spikeTargetLanguage.js';
import {
  OPENAI_SPIKE_DEV_ACTIONS,
  OPENAI_SPIKE_DEV_TARGET,
  isSpikeDevMessage,
  parseSpikeDevStart,
  parseSpikeDevStatus,
  parseSpikeDevStop,
  sanitizeSpikeTelemetry,
} from './spikeDevContract.js';
import { OpenAIRealtimeTranslationTransport } from './OpenAIRealtimeTranslationTransport.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_DUBBING, 'OpenAISpikeDevOffscreen(SPIKE)');

const SAFE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,39}$/;

function toSafeCode(value, fallback) {
  return typeof value === 'string' && SAFE_CODE_PATTERN.test(value) ? value : fallback;
}

/**
 * Internal Offscreen dev listener for the Phase D OpenAI spike (SPIKE ONLY).
 * Installed DEV-gated from the offscreen entry; it exposes nothing on
 * globalThis. Background owns the transaction (tab/lease/key/mint/
 * stream-id/lifecycle); this listener owns consume/tracks/transport/
 * playback/cleanup for one fenced session.
 *
 * Protocol: START is consumed with getUserMedia FIRST, then the existing
 * browser-neutral transport runs on the consumed stream. Every ack echoes
 * the transaction identity; stale or foreign STOP/STATUS never touch a
 * newer run. Only scalar codes and scalar status leave this module — no
 * key, secret, SDP, transcript, stream id, or raw body is ever logged,
 * persisted, or returned. Only tracks from a stream created here are ever
 * stopped.
 */
export class OpenAISpikeDevOffscreenHandler {
  constructor(options = {}) {
    this.transport = options.transport || new OpenAIRealtimeTranslationTransport({
      peerConnectionFactory: options.peerConnectionFactory,
      fetchImpl: options.fetchImpl,
      audioElementFactory: options.audioElementFactory,
      performanceNow: options.performanceNow,
      logger: options.logger,
    });
    this.mediaDevices = options.mediaDevices || globalThis.navigator?.mediaDevices || null;
    this.getUserMediaImpl = typeof options.getUserMedia === 'function' ? options.getUserMedia : null;
    this.isAuthorizedSender = typeof options.isAuthorizedSender === 'function'
      ? options.isAuthorizedSender
      : (sender) => {
        try {
          return isAuthorizedOffscreenRouterSender(sender, globalThis.chrome) === true;
        } catch {
          return false;
        }
      };
    this.log = options.logger || logger;

    this.session = null;
    this.pending = null;
  }

  /** Whether a dev message belongs to this listener (production untouched). */
  handles(message) {
    return isSpikeDevMessage(message) && message?.target === OPENAI_SPIKE_DEV_TARGET;
  }

  /**
   * Route one dev message. Returns an ack object for dev actions, or null
   * when the message is not ours.
   */
  async handleDevMessage(message, sender) {
    if (!this.handles(message)) return null;
    if (!this.isAuthorizedSender(sender)) return { success: false, error: 'UNAUTHORIZED' };

    if (message.action === OPENAI_SPIKE_DEV_ACTIONS.START) return this._handleStart(message);
    if (message.action === OPENAI_SPIKE_DEV_ACTIONS.STOP) return this._handleStop(message);
    if (message.action === OPENAI_SPIKE_DEV_ACTIONS.STATUS) return this._handleStatus(message);
    return null;
  }

  async _handleStart(message) {
    const parsed = parseSpikeDevStart(message);
    if (!parsed) return { success: false, error: 'INVALID_START' };
    const { transactionId } = parsed;

    if (this.pending || this.session) {
      return { success: false, transactionId, error: 'ALREADY_STARTED' };
    }
    const targetLanguage = normalizeSpikeTargetLanguage(parsed.targetLanguage);
    if (!targetLanguage) return { success: false, transactionId, error: 'INVALID_TARGET_LANGUAGE' };
    const bootstrap = parsed.bootstrap;
    if (bootstrap.targetLanguage !== undefined && bootstrap.targetLanguage !== null
      && bootstrap.targetLanguage !== targetLanguage) {
      return { success: false, transactionId, error: 'LANGUAGE_MISMATCH' };
    }

    const pending = { transactionId, targetLanguage };
    this.pending = pending;
    const isCurrent = () => this.pending === pending;

    // Consume FIRST: the stream id is perishable and the transport only
    // ever receives the consumed browser-neutral stream, never the id.
    let stream = null;
    try {
      stream = await this._consumeTabAudio(parsed.streamId);
    } catch (error) {
      this._clearPending(pending);
      const code = toSafeCode(error?.code, 'CONSUME_FAILED');
      return { success: false, transactionId, error: code };
    }
    if (!isCurrent()) {
      this._stopStreamTracks(stream);
      this._clearPending(pending);
      return { success: false, transactionId, error: 'START_CANCELLED' };
    }

    let started = null;
    try {
      started = await this.transport.start({ sourceStream: stream, targetLanguage, bootstrap });
    } catch {
      started = null;
    }
    if (!isCurrent()) {
      this._stopStreamTracks(stream);
      this._clearPending(pending);
      return { success: false, transactionId, error: 'START_CANCELLED' };
    }
    if (!started || started.success !== true) {
      this._stopStreamTracks(stream);
      this._clearPending(pending);
      return { success: false, transactionId, error: toSafeCode(started?.error, 'TRANSPORT_FAILED') };
    }

    this.session = {
      transactionId,
      targetLanguage: started.targetLanguage || targetLanguage,
      stream,
    };
    this._clearPending(pending);
    return { success: true, transactionId, targetLanguage: this.session.targetLanguage };
  }

  async _handleStop(message) {
    const parsed = parseSpikeDevStop(message);
    if (!parsed) return { success: false, error: 'INVALID_STOP' };

    // Identity first: a stale or foreign STOP must neither clear a pending
    // newer run nor touch a live one — it is a true no-op.
    const pending = this.pending;
    const session = this.session;
    const pendingMatch = Boolean(pending && pending.transactionId === parsed.transactionId);
    const sessionMatch = Boolean(session && session.transactionId === parsed.transactionId);
    if (!pendingMatch && !sessionMatch) {
      return { success: true, transactionId: parsed.transactionId, ignored: true };
    }

    if (pendingMatch) {
      this._clearPending(pending);
      // Fence the transport while its START is still setting up: dispose is
      // idempotent, so a pre-transport STOP stays safe while a late
      // transport completion can neither publish nor leak.
      try {
        await this.transport.dispose();
      } catch { /* best effort */ }
    }
    if (sessionMatch) {
      try {
        await this.transport.dispose();
      } catch { /* best effort */ }
      this._stopStreamTracks(session.stream);
      session.stream = null;
      this.session = null;
    }
    return { success: true, transactionId: parsed.transactionId };
  }

  async _handleStatus(message) {
    const parsed = parseSpikeDevStatus(message);
    if (!parsed) return { success: false, error: 'INVALID_STATUS' };

    const session = this.session;
    if (!session || session.transactionId !== parsed.transactionId) {
      return {
        success: true,
        transactionId: parsed.transactionId,
        active: false,
        targetLanguage: null,
        captureReady: false,
        telemetry: null,
      };
    }
    let telemetry = null;
    try {
      telemetry = typeof this.transport.getTelemetry === 'function'
        ? sanitizeSpikeTelemetry(this.transport.getTelemetry())
        : null;
    } catch {
      telemetry = null;
    }
    return {
      success: true,
      transactionId: parsed.transactionId,
      active: true,
      targetLanguage: session.targetLanguage,
      captureReady: Boolean(session.stream),
      telemetry,
    };
  }

  async _consumeTabAudio(streamId) {
    const constraints = {
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
      video: false,
    };
    if (this.getUserMediaImpl) return this.getUserMediaImpl(constraints);
    const getUserMedia = this.mediaDevices?.getUserMedia;
    if (typeof getUserMedia !== 'function') {
      throw Object.assign(new Error('Tab audio capture unavailable'), { code: 'CAPTURE_UNAVAILABLE' });
    }
    return getUserMedia.call(this.mediaDevices, constraints);
  }

  _clearPending(pending) {
    if (this.pending === pending) this.pending = null;
  }

  _stopStreamTracks(stream) {
    let tracks = [];
    try {
      tracks = typeof stream?.getTracks === 'function' ? stream.getTracks() : [];
    } catch {
      tracks = [];
    }
    for (const track of tracks) {
      try {
        track?.stop?.();
      } catch { /* track stop is best effort */ }
    }
  }
}

/**
 * Install the internal dev listener in an Offscreen context. Handles dev
 * START/STOP/STATUS only; every other message (including all production
 * traffic) is ignored. Dev-only: call only from DEV-gated entry code.
 */
export function installOpenAISpikeDevOffscreenListener(options = {}) {
  const handler = new OpenAISpikeDevOffscreenHandler(options);
  const runtime = globalThis.chrome?.runtime || null;
  if (!runtime || typeof runtime.onMessage?.addListener !== 'function') {
    return { installed: false };
  }
  const listener = (message, sender, sendResponse) => {
    if (!handler.handles(message)) return false;
    Promise.resolve(handler.handleDevMessage(message, sender)).then(
      (response) => {
        try {
          sendResponse(response || { success: false, error: 'DEV_LISTENER_FAILED' });
        } catch { /* response channel already closed */ }
      },
      () => {
        try {
          sendResponse({ success: false, error: 'DEV_LISTENER_FAILED' });
        } catch { /* response channel already closed */ }
      },
    );
    return true;
  };
  try {
    runtime.onMessage.addListener(listener);
  } catch {
    return { installed: false };
  }
  return {
    installed: true,
    unsubscribe: () => {
      try {
        runtime.onMessage.removeListener(listener);
      } catch { /* best effort */ }
    },
  };
}
