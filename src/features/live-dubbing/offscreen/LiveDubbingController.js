import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import {
  LIVE_DUBBING_ACTIONS,
  LIVE_DUBBING_AUDIO_LIMITS,
  LIVE_DUBBING_AUDIO_MODES,
  LIVE_DUBBING_CAPTURE_STAGES,
  LIVE_DUBBING_INTERNAL_STATUS,
  LIVE_DUBBING_OFFSCREEN_ACKS,
  LIVE_DUBBING_STATUS,
  LIVE_DUBBING_STOP_TIMEOUT,
} from '../constants.js';
import {
  createLiveDubbingDiagnostic,
  createLiveDubbingCleanupDiagnostic,
  createLiveDubbingProviderDiagnostic,
  createLiveDubbingTranscriptMessage,
  createProviderBootstrapRequest,
  normalizeLiveDubbingVolume,
  isLiveDubbingProviderId,
  isLiveDubbingAudioMode,
  normalizeProviderTargetLanguage,
  parseProviderBootstrapResponse,
  sanitizeLiveDubbingCleanupDiagnostic,
  sanitizeLiveDubbingProviderDiagnostic,
  sanitizeLiveDubbingTranscript,
} from '../contracts.js';
import { liveDubbingProviderRegistry } from '../providers/LiveDubbingProviderRegistry.js';
import { LiveDubbingAudioEngine } from './LiveDubbingAudioEngine.js';

const IDLE_STATUS = 'IDLE';
const INPUT_SAMPLE_RATE = 16_000;
const OUTPUT_SAMPLE_RATE = 24_000;
const SAFE_ERROR_CODE = /^[A-Za-z0-9_.-]{1,80}$/;
const PROVIDER_AUDIO_TERMINAL_REASONS = new Set([
  'INVALID_OUTPUT_AUDIO',
  'OUTPUT_AUDIO_ERROR',
]);
const TERMINAL_NOTIFICATION_RETRY_DELAYS_MS = Object.freeze([25, 50]);
const TERMINAL_NOTIFICATION_MAX_ATTEMPTS = TERMINAL_NOTIFICATION_RETRY_DELAYS_MS.length + 1;
const logger = getScopedLogger(LOG_COMPONENTS.LIVE_DUBBING, 'LiveDubbingController');
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

function createTelemetry() {
  return {
    milestones: Object.fromEntries(TELEMETRY_MILESTONES.map(name => [name, null])),
    inputDroppedDurationMs: 0,
    preSetupDroppedDurationMs: 0,
    preSetupDroppedFrames: 0,
    inputBackpressureEvents: 0,
    sendFailures: 0,
    wsBufferedAmountPeak: 0,
    outputQueueCurrentDurationMs: 0,
    outputQueuePeakDurationMs: 0,
    outputSafetyDrops: 0,
    underruns: 0,
    underrunSamples: 0,
    interruptions: 0,
    providerTerminalCategory: null,
    providerBaseline: null,
    outputBaseline: null,
    // Mirrored counters so the sanitized snapshot survives session cleanup.
    inputFrames: 0,
    inputSentFrames: 0,
    translatedAudioChunks: 0,
  };
}

function getPerformanceNow(options) {
  if (typeof options?.performanceNow === 'function') return options.performanceNow;
  if (typeof options?.performance?.now === 'function') return options.performance.now.bind(options.performance);
  if (typeof globalThis.performance?.now === 'function') return globalThis.performance.now.bind(globalThis.performance);
  return () => null;
}

function safeNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function safeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function safeTelemetrySnapshot(telemetry) {
  const source = telemetry || createTelemetry();
  return {
    milestones: Object.fromEntries(TELEMETRY_MILESTONES.map(name => [
      name,
      Number.isFinite(source.milestones?.[name]) ? source.milestones[name] : null,
    ])),
    inputDroppedDurationMs: safeNonNegativeNumber(source.inputDroppedDurationMs),
    preSetupDroppedDurationMs: safeNonNegativeNumber(source.preSetupDroppedDurationMs),
    preSetupDroppedFrames: safeInteger(source.preSetupDroppedFrames),
    inputBackpressureEvents: safeInteger(source.inputBackpressureEvents),
    sendFailures: safeInteger(source.sendFailures),
    wsBufferedAmountPeak: safeNonNegativeNumber(source.wsBufferedAmountPeak),
    outputQueueCurrentDurationMs: safeNonNegativeNumber(source.outputQueueCurrentDurationMs),
    outputQueuePeakDurationMs: safeNonNegativeNumber(source.outputQueuePeakDurationMs),
    outputSafetyDrops: safeInteger(source.outputSafetyDrops),
    underruns: safeInteger(source.underruns),
    underrunSamples: safeInteger(source.underrunSamples),
    interruptions: safeInteger(source.interruptions),
    providerTerminalCategory: typeof source.providerTerminalCategory === 'string'
      && SAFE_ERROR_CODE.test(source.providerTerminalCategory)
      ? source.providerTerminalCategory
      : null,
    inputFrames: safeInteger(source.inputFrames),
    inputSentFrames: safeInteger(source.inputSentFrames),
    translatedAudioChunks: safeInteger(source.translatedAudioChunks),
  };
}

/**
 * Build the scalar-only, same-context telemetry snapshot. All inputs are
 * counts, durations, milestones, or the allowlisted terminal category; no
 * session, media, bootstrap, URL, PCM, transcript, or provider payload is
 * included. Fixed 100ms input framing is production behavior, not a variant.
 */
function buildTelemetrySnapshot({ telemetry, metrics } = {}) {
  const base = safeTelemetrySnapshot(telemetry);
  const sourceMetrics = metrics && typeof metrics === 'object' ? metrics : {};
  const inputFrames = sourceMetrics.inputFrames !== undefined
    ? safeInteger(sourceMetrics.inputFrames)
    : base.inputFrames;
  const inputSentFrames = sourceMetrics.inputSentFrames !== undefined
    ? safeInteger(sourceMetrics.inputSentFrames)
    : base.inputSentFrames;
  const translatedAudioChunks = sourceMetrics.outputChunks !== undefined
    ? safeInteger(sourceMetrics.outputChunks)
    : base.translatedAudioChunks;
  const outputSafetyDrops = Math.max(
    base.outputSafetyDrops,
    safeInteger(sourceMetrics.outputSafetyDrops),
  );
  const inputBackpressureEvents = Math.max(
    base.inputBackpressureEvents,
    safeInteger(sourceMetrics.inputBackpressureEvents),
  );
  const sendFailures = Math.max(
    base.sendFailures,
    safeInteger(sourceMetrics.sendFailures),
  );
  const underrunSamples = Math.max(
    base.underrunSamples,
    safeInteger(sourceMetrics.underrunSamples),
  );
  return {
    ...base,
    inputFrames,
    inputSentFrames,
    inputBackpressureEvents,
    sendFailures,
    translatedAudioChunks,
    outputSafetyDrops,
    underrunSamples,
  };
}

function getFrameByteLength(frame) {
  if (isArrayBuffer(frame?.buffer)) return frame.buffer.byteLength;
  return ArrayBuffer.isView(frame?.buffer) ? frame.buffer.byteLength : 0;
}

function getFrameDurationMs(frame, byteLength = getFrameByteLength(frame)) {
  const sampleCount = Number.isInteger(frame?.sampleCount) && frame.sampleCount > 0
    ? frame.sampleCount
    : Math.floor(byteLength / 2);
  const sampleRate = Number.isInteger(frame?.sampleRate) && frame.sampleRate > 0
    ? frame.sampleRate
    : INPUT_SAMPLE_RATE;
  const durationMs = (sampleCount / sampleRate) * 1000;
  return Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
}

function isSessionId(value) {
  return typeof value === 'string' && Boolean(value.trim());
}

function isProviderId(value) {
  return isLiveDubbingProviderId(value);
}

function isStreamId(value) {
  return typeof value === 'string' && Boolean(value);
}

function getMessageValue(message, key) {
  return message?.data?.[key] ?? message?.[key];
}

function isEventSequence(value) {
  return Number.isInteger(value) && value >= 0;
}

function isOriginalVolume(value) {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= 0
    && value <= 1;
}

function isDubbedVolume(value) {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= 0
    && value <= 1;
}

function getEventSequence(message) {
  const value = getMessageValue(message, 'eventSequence');
  return isEventSequence(value) ? value : undefined;
}

function createCaptureFailure(stage, code, error, fields = {}, sensitiveValues = []) {
  return {
    success: false,
    ...fields,
    error: code,
    diagnostic: createLiveDubbingDiagnostic(stage, error, { sensitiveValues }),
  };
}

function createCaptureConstraints(streamId) {
  return {
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  };
}

function getTracks(stream) {
  return typeof stream?.getTracks === 'function' ? stream.getTracks() : [];
}

function stopTracks(stream) {
  const tracks = getTracks(stream);
  const audioTracks = tracks.length > 0 || typeof stream?.getAudioTracks !== 'function'
    ? tracks
    : stream.getAudioTracks();
  for (const track of audioTracks) {
    try {
      track.stop?.();
    } catch {
      // Track cleanup is best effort; remaining tracks still need stopping.
    }
  }
}

function isArrayBuffer(value) {
  return value instanceof ArrayBuffer
    || (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer);
}

function getFrameBuffer(frame) {
  if (isArrayBuffer(frame?.buffer)) return frame.buffer;
  if (ArrayBuffer.isView(frame?.buffer)) {
    return frame.buffer.buffer.slice(
      frame.buffer.byteOffset,
      frame.buffer.byteOffset + frame.buffer.byteLength,
    );
  }
  return null;
}

function errorCode(error, fallback) {
  return typeof error?.code === 'string' && SAFE_ERROR_CODE.test(error.code)
    ? error.code
    : fallback;
}

function hasAudioContext(options) {
  return Boolean(
    options.audioContextFactory
      || options.contextFactory
      || options.AudioContext
      || globalThis.AudioContext
      || globalThis.webkitAudioContext,
  );
}

/**
 * Owns one offscreen live-dubbing transaction: capture, the local audio
 * engine, one provider bootstrap request, and one fenced provider generation.
 * A terminal callback changes the session fence before cleanup so late worklet
 * and socket events cannot affect a subsequent session.
 */
export class LiveDubbingController {
  constructor(options = {}) {
    this.mediaDevices = options.mediaDevices || globalThis.navigator?.mediaDevices;
    this.notify = options.notify || ((message) => globalThis.chrome?.runtime?.sendMessage?.(message));
    this.notifyTranscript = options.notifyTranscript || this.notify;
    this.requestBootstrap = options.requestBootstrap
      || ((message) => globalThis.chrome?.runtime?.sendMessage?.(message));
    this.providerRegistry = options.providerRegistry || liveDubbingProviderRegistry;
    this.performanceNow = getPerformanceNow(options);
    this.onPlaybackAccepted = typeof options.onPlaybackAccepted === 'function'
      ? options.onPlaybackAccepted
      : null;
    this.log = options.logger || logger;

    this.inputPipelineFactory = options.inputPipelineFactory
      || options.tabAudioPipelineFactory
      || options.createInputPipeline
      || null;
    this.outputPlayerFactory = options.outputPlayerFactory
      || options.pcmOutputPlayerFactory
      || options.createOutputPlayer
      || null;
    this.providerClientFactory = options.providerClientFactory
      || options.geminiClientFactory
      || options.createProviderClient
      || null;
    this.inputPipeline = options.inputPipeline || null;
    this.outputPlayer = options.outputPlayer || null;
    this.providerClient = options.providerClient || null;
    this.inputPipelineOptions = options.inputPipelineOptions || options.tabAudioPipelineOptions || {};
    this.outputPlayerOptions = options.outputPlayerOptions || options.pcmOutputPlayerOptions || {};
    this.audioEngineOptions = {
      audioContextFactory: options.audioContextFactory,
      contextFactory: options.contextFactory,
      AudioContext: options.AudioContext,
      inputPipeline: this.inputPipeline,
      outputPlayer: this.outputPlayer,
      inputPipelineOptions: this.inputPipelineOptions,
      outputPlayerOptions: this.outputPlayerOptions,
    };
    this.providerClientOptions = options.providerClientOptions || options.geminiClientOptions || {};
    this.pipelineRequired = options.requirePipelines
      ?? Boolean(
        this.inputPipelineFactory
          || this.outputPlayerFactory
          || this.inputPipeline
          || this.outputPlayer
          || hasAudioContext(options),
      );

    this.currentSession = null;
    this.lastTelemetry = null;
    this.disposedSession = null;
    this.providerGeneration = 0;
  }

  handles(action) {
    return action === LIVE_DUBBING_ACTIONS.PREPARE
      || action === LIVE_DUBBING_ACTIONS.CONSUME
      || action === LIVE_DUBBING_ACTIONS.CONNECT_PROVIDER
      || action === LIVE_DUBBING_ACTIONS.SET_ORIGINAL_VOLUME_OFFSCREEN
      || action === LIVE_DUBBING_ACTIONS.GET_ORIGINAL_VOLUME_OFFSCREEN
      || action === LIVE_DUBBING_ACTIONS.SET_DUBBED_VOLUME_OFFSCREEN
      || action === LIVE_DUBBING_ACTIONS.GET_DUBBED_VOLUME_OFFSCREEN
      || action === LIVE_DUBBING_ACTIONS.STATUS
      || action === LIVE_DUBBING_ACTIONS.DISPOSE;
  }

  handle(message = {}) {
    switch (message.action) {
      case LIVE_DUBBING_ACTIONS.PREPARE:
        return this.prepare(
          getMessageValue(message, 'sessionId'),
          getMessageValue(message, 'providerId'),
          getMessageValue(message, 'targetLanguage'),
          getEventSequence(message),
          {
            originalVolume: getMessageValue(message, 'originalVolume'),
            dubbedVolume: getMessageValue(message, 'dubbedVolume'),
          },
        );
      case LIVE_DUBBING_ACTIONS.CONSUME:
        return this.consume(
          getMessageValue(message, 'sessionId'),
          getMessageValue(message, 'providerId'),
          getMessageValue(message, 'streamId'),
          getEventSequence(message),
        );
      case LIVE_DUBBING_ACTIONS.CONNECT_PROVIDER:
        return this.connectProvider(
          getMessageValue(message, 'sessionId'),
          getMessageValue(message, 'providerId'),
          getMessageValue(message, 'targetLanguage'),
          getEventSequence(message),
        );
      case LIVE_DUBBING_ACTIONS.SET_ORIGINAL_VOLUME_OFFSCREEN:
        return this.setOriginalVolume(
          getMessageValue(message, 'sessionId'),
          getMessageValue(message, 'providerId'),
          getMessageValue(message, 'volume'),
          getEventSequence(message),
        );
      case LIVE_DUBBING_ACTIONS.GET_ORIGINAL_VOLUME_OFFSCREEN:
        return this.getOriginalVolume(
          getMessageValue(message, 'sessionId'),
          getMessageValue(message, 'providerId'),
          getEventSequence(message),
        );
      case LIVE_DUBBING_ACTIONS.SET_DUBBED_VOLUME_OFFSCREEN:
        return this.setDubbedVolume(
          getMessageValue(message, 'sessionId'),
          getMessageValue(message, 'providerId'),
          getMessageValue(message, 'volume'),
          getEventSequence(message),
        );
      case LIVE_DUBBING_ACTIONS.GET_DUBBED_VOLUME_OFFSCREEN:
        return this.getDubbedVolume(
          getMessageValue(message, 'sessionId'),
          getMessageValue(message, 'providerId'),
          getEventSequence(message),
        );
      case LIVE_DUBBING_ACTIONS.STATUS:
        return this.status(
          getMessageValue(message, 'sessionId'),
          getMessageValue(message, 'providerId'),
          getEventSequence(message),
        );
      case LIVE_DUBBING_ACTIONS.DISPOSE:
        return this.dispose(
          getMessageValue(message, 'sessionId'),
          getMessageValue(message, 'providerId'),
          getMessageValue(message, 'reason'),
          getEventSequence(message),
        );
      default:
        return { success: false, error: 'LIVE_DUBBING_ACTION_UNSUPPORTED' };
    }
  }

  /**
   * Read the committed original-audio gain without changing anything. The
   * fencing matches the write path exactly; the audio engine is never
   * touched, so no monitor is created, no gain changes, and no lifecycle,
   * sequence, or terminal state moves.
   */
  getOriginalVolume(sessionId, providerId, eventSequence = undefined) {
    const sequenceError = this._requiredEventSequence(sessionId, eventSequence, providerId);
    if (sequenceError) return sequenceError;
    if (!isProviderId(providerId)) return this._invalidProvider(sessionId);

    const session = this.currentSession;
    if (!session || session.sessionId !== sessionId || session.providerId !== providerId) {
      return this._sessionMismatch(sessionId, providerId, session);
    }
    if (session.eventSequence !== eventSequence) {
      return this._sequenceMismatch(sessionId, session, providerId);
    }
    const allowedStatuses = [
      LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
      LIVE_DUBBING_INTERNAL_STATUS.CAPTURING,
      LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
      LIVE_DUBBING_STATUS.RUNNING,
    ];
    if (!allowedStatuses.includes(session.status)) {
      return {
        success: false,
        error: 'LIVE_DUBBING_SESSION_UNAVAILABLE',
      };
    }

    return {
      success: true,
      sessionId: session.sessionId,
      providerId: session.providerId,
      eventSequence: session.eventSequence,
      status: session.status,
      originalVolume: session.originalVolume,
    };
  }

  /**
   * Apply a runtime original-audio gain without changing the lifecycle fence.
   * The value lives only on the offscreen session and is committed after an
   * active engine accepts it, so late engine work cannot update a replacement.
   * The session value stays authoritative: a current-request engine failure
   * reconciles the engine back to the committed value, while superseded
   * requests never roll the engine back. While the core path is not ready
   * (`audioPathReady !== true`) the command is pre-engine: it only stores
   * the session value and never calls the engine.
   */
  setOriginalVolume(sessionId, providerId, volume, eventSequence = undefined) {
    if (!isOriginalVolume(volume)) {
      return {
        success: false,
        error: 'LIVE_DUBBING_ORIGINAL_VOLUME_INVALID',
      };
    }
    const sequenceError = this._requiredEventSequence(sessionId, eventSequence, providerId);
    if (sequenceError) return sequenceError;
    if (!isProviderId(providerId)) return this._invalidProvider(sessionId);

    const session = this.currentSession;
    if (!session || session.sessionId !== sessionId || session.providerId !== providerId) {
      return this._sessionMismatch(sessionId, providerId, session);
    }
    if (session.eventSequence !== eventSequence) {
      return this._sequenceMismatch(sessionId, session, providerId);
    }
    const allowedStatuses = [
      LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
      LIVE_DUBBING_INTERNAL_STATUS.CAPTURING,
      LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
      LIVE_DUBBING_STATUS.RUNNING,
    ];
    if (!allowedStatuses.includes(session.status)) {
      return {
        success: false,
        error: 'LIVE_DUBBING_SESSION_UNAVAILABLE',
      };
    }

    const requestToken = ++session.originalVolumeRequestToken;
    const committedVolume = session.originalVolume;
    // While the core audio path is not ready, volume is pre-engine state
    // only: store it and never touch the engine, so a pending startup cannot
    // observe a mutated engine volume. The active path requires readiness.
    if (!session.audioEngine || session.audioPathReady !== true) {
      session.originalVolume = volume;
      return this._originalVolumeResponse(session);
    }

    const audioEngine = session.audioEngine;
    return Promise.resolve()
      .then(() => audioEngine.setOriginalVolume(volume))
      .then(() => {
        if (!this._isCurrentOriginalVolumeRequest(
          session,
          sessionId,
          providerId,
          eventSequence,
          requestToken,
        )) {
          return this._staleOriginalVolumeResponse(
            session,
            sessionId,
            providerId,
            eventSequence,
            requestToken,
          );
        }
        session.originalVolume = volume;
        return this._originalVolumeResponse(session);
      })
      .catch(async () => {
        if (!this._isCurrentOriginalVolumeRequest(
          session,
          sessionId,
          providerId,
          eventSequence,
          requestToken,
        )) {
          return this._staleOriginalVolumeResponse(
            session,
            sessionId,
            providerId,
            eventSequence,
            requestToken,
          );
        }
        if (committedVolume !== volume) {
          try {
            if (this._isCurrentOriginalVolumeRequest(
              session,
              sessionId,
              providerId,
              eventSequence,
              requestToken,
            )) {
              await audioEngine.setOriginalVolume(committedVolume);
            }
          } catch {
            // Reconciliation is best effort and never terminalizes or cleans up.
          }
        }
        return {
          success: false,
          error: 'LIVE_DUBBING_ORIGINAL_AUDIO_UNAVAILABLE',
          sessionId,
          providerId,
          eventSequence: session.eventSequence,
          status: session.status,
        };
      });
  }

  /**
   * Read the committed dubbed-audio gain without changing anything. The
   * fencing matches the write path exactly; no audio target is touched, so
   * no gain changes and no lifecycle, sequence, or terminal state moves.
   * GET is read-only and returns `session.dubbedVolume`.
   */
  getDubbedVolume(sessionId, providerId, eventSequence = undefined) {
    const sequenceError = this._requiredEventSequence(sessionId, eventSequence, providerId);
    if (sequenceError) return sequenceError;
    if (!isProviderId(providerId)) return this._invalidProvider(sessionId);

    const session = this.currentSession;
    if (!session || session.sessionId !== sessionId || session.providerId !== providerId) {
      return this._sessionMismatch(sessionId, providerId, session);
    }
    if (session.eventSequence !== eventSequence) {
      return this._sequenceMismatch(sessionId, session, providerId);
    }
    const allowedStatuses = [
      LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
      LIVE_DUBBING_INTERNAL_STATUS.CAPTURING,
      LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
      LIVE_DUBBING_STATUS.RUNNING,
    ];
    if (!allowedStatuses.includes(session.status)) {
      return {
        success: false,
        error: 'LIVE_DUBBING_SESSION_UNAVAILABLE',
      };
    }

    return {
      success: true,
      sessionId: session.sessionId,
      providerId: session.providerId,
      eventSequence: session.eventSequence,
      status: session.status,
      dubbedVolume: session.dubbedVolume,
    };
  }

  /**
   * Apply a runtime dubbed-audio gain without changing the lifecycle fence.
   * The value lives only on the offscreen session and is committed after the
   * active per-mode target accepts it, so late target work cannot update a
   * replacement. The session value stays authoritative: a current-request
   * target failure reconciles the target back to the committed value, while
   * superseded requests never roll the target back. While the target does not
   * exist the command is pre-target: it only stores the session value and
   * never calls the target. Routing is by declared audio mode — PCM targets
   * the local audio engine, media-stream targets the provider client.
   */
  setDubbedVolume(sessionId, providerId, volume, eventSequence = undefined) {
    if (!isDubbedVolume(volume)) {
      return {
        success: false,
        error: 'LIVE_DUBBING_DUBBED_VOLUME_INVALID',
      };
    }
    const sequenceError = this._requiredEventSequence(sessionId, eventSequence, providerId);
    if (sequenceError) return sequenceError;
    if (!isProviderId(providerId)) return this._invalidProvider(sessionId);

    const session = this.currentSession;
    if (!session || session.sessionId !== sessionId || session.providerId !== providerId) {
      return this._sessionMismatch(sessionId, providerId, session);
    }
    if (session.eventSequence !== eventSequence) {
      return this._sequenceMismatch(sessionId, session, providerId);
    }
    const allowedStatuses = [
      LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
      LIVE_DUBBING_INTERNAL_STATUS.CAPTURING,
      LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
      LIVE_DUBBING_STATUS.RUNNING,
    ];
    if (!allowedStatuses.includes(session.status)) {
      return {
        success: false,
        error: 'LIVE_DUBBING_SESSION_UNAVAILABLE',
      };
    }

    const requestToken = ++session.dubbedVolumeRequestToken;
    const committedVolume = session.dubbedVolume;
    const isMediaStream = session.audioMode === LIVE_DUBBING_AUDIO_MODES.MEDIA_STREAM;
    // While the dubbed target does not exist, volume is pre-target state
    // only: store it and never touch the target, so a pending startup cannot
    // observe a mutated target volume. PCM requires the core audio path to be
    // ready; media-stream requires the provider client to exist.
    if (isMediaStream) {
      if (!session.providerClient) {
        session.dubbedVolume = volume;
        return this._dubbedVolumeResponse(session);
      }
    } else if (!session.audioEngine || session.audioPathReady !== true) {
      session.dubbedVolume = volume;
      return this._dubbedVolumeResponse(session);
    }

    const target = isMediaStream ? session.providerClient : session.audioEngine;
    return Promise.resolve()
      .then(() => target.setDubbedVolume(volume))
      .then(() => {
        if (!this._isCurrentDubbedVolumeRequest(
          session,
          sessionId,
          providerId,
          eventSequence,
          requestToken,
        )) {
          return this._staleDubbedVolumeResponse(
            session,
            sessionId,
            providerId,
            eventSequence,
            requestToken,
          );
        }
        session.dubbedVolume = volume;
        return this._dubbedVolumeResponse(session);
      })
      .catch(async () => {
        if (!this._isCurrentDubbedVolumeRequest(
          session,
          sessionId,
          providerId,
          eventSequence,
          requestToken,
        )) {
          return this._staleDubbedVolumeResponse(
            session,
            sessionId,
            providerId,
            eventSequence,
            requestToken,
          );
        }
        if (committedVolume !== volume) {
          try {
            if (this._isCurrentDubbedVolumeRequest(
              session,
              sessionId,
              providerId,
              eventSequence,
              requestToken,
            )) {
              await target.setDubbedVolume(committedVolume);
            }
          } catch {
            // Reconciliation is best effort and never terminalizes or cleans up.
          }
        }
        return {
          success: false,
          error: 'LIVE_DUBBING_DUBBED_AUDIO_UNAVAILABLE',
          sessionId,
          providerId,
          eventSequence: session.eventSequence,
          status: session.status,
        };
      });
  }

  prepare(sessionId, providerId, targetLanguage = null, eventSequence = undefined, initialVolumes = {}) {
    // Runtime-only volume authorities seeded from persisted preferences
    // carried by the PREPARE message. Validated here; malformed values fall
    // back to silence for original audio and full gain for dubbed audio.
    // Repeat PREPARE for the same session never reseeds these fields.
    const initialOriginalVolume = normalizeLiveDubbingVolume(initialVolumes?.originalVolume, 0);
    const initialDubbedVolume = normalizeLiveDubbingVolume(initialVolumes?.dubbedVolume, 1);
    const sequenceError = this._requiredEventSequence(sessionId, eventSequence, providerId);
    if (sequenceError) return sequenceError;
    if (!isProviderId(providerId)) return this._invalidProvider(sessionId);

    const tombstone = this.disposedSession;
    if (tombstone && (!tombstone.cleanupComplete
      || (tombstone.sessionId === sessionId && tombstone.providerId === providerId))) {
      return createCaptureFailure(
        LIVE_DUBBING_CAPTURE_STAGES.OFFSCREEN_PREPARE,
        'LIVE_DUBBING_SESSION_DISPOSED',
        { name: 'SessionDisposedError', message: 'Session was disposed', code: 'LIVE_DUBBING_SESSION_DISPOSED' },
        {
          ignored: true,
          sessionId,
          providerId,
          status: IDLE_STATUS,
        },
      );
    }

    const session = this.currentSession;
    if (session?.sessionId === sessionId && session.providerId !== providerId) {
      return this._sessionMismatch(sessionId, providerId, session);
    }
    // Matching PREPARE is idempotent: its session is already validated and
    // owns the immutable audio mode. Only a new session queries the registry.
    // The audio path is validated before any audio resource exists, so an
    // unsupported new provider cannot reach getUserMedia or pipeline setup.
    const audioMode = session
      ? session.audioMode
      : this._resolveProviderAudioMode(providerId);
    if (!session && !isLiveDubbingAudioMode(audioMode)) {
      return createCaptureFailure(
        LIVE_DUBBING_CAPTURE_STAGES.OFFSCREEN_PREPARE,
        'LIVE_DUBBING_AUDIO_MODE_UNSUPPORTED',
        { name: 'RangeError', message: 'Unsupported provider audio mode', code: 'LIVE_DUBBING_AUDIO_MODE_UNSUPPORTED' },
        { sessionId, providerId },
      );
    }

    if ((!session && eventSequence !== 0)
      || (session?.sessionId === sessionId && eventSequence !== session.eventSequence)) {
      return this._sequenceMismatch(sessionId, session?.sessionId === sessionId ? session : null, providerId);
    }

    if (!isSessionId(sessionId)) {
      return createCaptureFailure(
        LIVE_DUBBING_CAPTURE_STAGES.OFFSCREEN_PREPARE,
        'INVALID_SESSION_ID',
        { name: 'TypeError', message: 'sessionId is required', code: 'INVALID_SESSION_ID' },
        { sessionId, providerId },
      );
    }

    let mappedTargetLanguage = targetLanguage;
    if (targetLanguage !== null && targetLanguage !== undefined) {
      try {
        mappedTargetLanguage = normalizeProviderTargetLanguage(providerId, targetLanguage);
      } catch (error) {
        return createCaptureFailure(
          LIVE_DUBBING_CAPTURE_STAGES.OFFSCREEN_PREPARE,
          'INVALID_TARGET_LANGUAGE',
          { name: error?.name || 'RangeError', message: 'Unsupported target language', code: 'INVALID_TARGET_LANGUAGE' },
          { sessionId, providerId },
        );
      }
    }

    if (this.currentSession && this.currentSession.sessionId !== sessionId) {
      return createCaptureFailure(
        LIVE_DUBBING_CAPTURE_STAGES.OFFSCREEN_PREPARE,
        'LIVE_DUBBING_SESSION_BUSY',
        { name: 'SessionBusyError', message: 'Another capture session is active', code: 'LIVE_DUBBING_SESSION_BUSY' },
        {
          active: true,
          sessionId,
          providerId,
          status: this.currentSession.status,
        },
      );
    }

    if (this.currentSession
      && mappedTargetLanguage !== null
      && mappedTargetLanguage !== undefined
      && mappedTargetLanguage !== this.currentSession.targetLanguage) {
      return {
        success: false,
        error: 'LIVE_DUBBING_TARGET_LANGUAGE_MISMATCH',
        ignored: true,
        sessionId,
        providerId,
        status: this.currentSession.status,
      };
    }

    if (this.currentSession && eventSequence !== this.currentSession.eventSequence) {
      return {
        success: false,
        error: 'LIVE_DUBBING_EVENT_SEQUENCE_MISMATCH',
        ignored: true,
        sessionId,
        providerId,
        eventSequence: this.currentSession.eventSequence,
        status: this.currentSession.status,
      };
    }

    if (!this.currentSession) {
      this.currentSession = {
        sessionId,
        providerId,
        targetLanguage: mappedTargetLanguage,
        eventSequence,
        status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
        lastError: null,
        stream: null,
        streamStopped: false,
        capturePromise: null,
        connectPromise: null,
        listeners: [],
        terminalSent: false,
        terminalDelivery: null,
        terminalRequested: false,
        disposing: false,
        bootstrapRequested: false,
        bootstrapRequestPromise: null,
        providerClient: null,
        providerGeneration: 0,
        providerDiagnostic: null,
        setupComplete: false,
        setupAcknowledged: false,
        audioEngine: null,
        inputPipeline: null,
        outputPlayer: null,
        pipelinesReady: false,
        audioMode,
        originalVolume: initialOriginalVolume,
        originalVolumeRequestToken: 0,
        dubbedVolume: initialDubbedVolume,
        dubbedVolumeRequestToken: 0,
        audioPathReady: false,
        pendingInput: [],
        pendingInputMs: 0,
         outputEpoch: 0,
         outputSequence: 0,
         transcriptSequence: 0,
         metrics: {
          inputFrames: 0,
          inputBytes: 0,
          inputSentFrames: 0,
          inputSentBytes: 0,
          inputPendingFrames: 0,
          inputPendingBytes: 0,
          inputPendingDurationMs: 0,
          inputDroppedFrames: 0,
          inputDroppedBytes: 0,
          inputBackpressureEvents: 0,
          sendFailures: 0,
          inputDroppedDurationMs: 0,
          preSetupDroppedFrames: 0,
          preSetupDroppedDurationMs: 0,
          outputChunks: 0,
          outputBytes: 0,
          outputSafetyDrops: 0,
          outputAcceptedChunks: 0,
          outputEpochResets: 0,
        },
        telemetry: createTelemetry(),
      };
    }

    return {
      success: true,
      ack: LIVE_DUBBING_OFFSCREEN_ACKS.READY,
      ready: true,
      sessionId,
      providerId,
      status: this.currentSession.status,
      eventSequence: this.currentSession.eventSequence,
    };
  }

  /**
   * Start getUserMedia immediately. The Chrome tab stream ID remains inside
   * this method and is never returned, stored, or logged.
   */
  consume(sessionId, providerId, streamId, eventSequence = undefined) {
    const sequenceError = this._requiredEventSequence(sessionId, eventSequence, providerId);
    if (sequenceError) return sequenceError;
    if (!isProviderId(providerId)) return this._invalidProvider(sessionId);

    const session = this.currentSession;
    if (!session || session.sessionId !== sessionId || session.providerId !== providerId) {
      return {
        success: false,
        error: 'LIVE_DUBBING_SESSION_MISMATCH',
        ignored: true,
        sessionId: isSessionId(sessionId) ? sessionId : null,
        providerId,
        status: session?.status || IDLE_STATUS,
      };
    }

    const captureStarted = Boolean(session.capturePromise)
      || [
        LIVE_DUBBING_INTERNAL_STATUS.CAPTURING,
        LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
        LIVE_DUBBING_STATUS.RUNNING,
      ].includes(session.status);
    if (captureStarted) {
      if (!isEventSequence(eventSequence) || eventSequence !== session.eventSequence) {
        return this._sequenceMismatch(sessionId, session, providerId);
      }
      if (session.capturePromise) return session.capturePromise;
      return this._mediaAcquiredResponse(session);
    }

    if (session.status !== LIVE_DUBBING_STATUS.PREPARING_CAPTURE
      || eventSequence !== session.eventSequence + 1) {
      return this._sequenceMismatch(sessionId, session, providerId);
    }
    session.eventSequence = eventSequence;

    if (!isStreamId(streamId)) {
      return createCaptureFailure(
        LIVE_DUBBING_CAPTURE_STAGES.OFFSCREEN_GET_USER_MEDIA,
        'INVALID_STREAM_ID',
        { name: 'TypeError', message: 'streamId is required', code: 'INVALID_STREAM_ID' },
        { sessionId, providerId },
        [streamId],
      );
    }

    const mediaDevices = this.mediaDevices || globalThis.navigator?.mediaDevices;
    const getUserMedia = mediaDevices?.getUserMedia;
    if (typeof getUserMedia !== 'function') {
      return this._captureFailed(session, 'LIVE_DUBBING_CAPTURE_UNAVAILABLE', { streamId });
    }

    let capturePromise;
    try {
      capturePromise = getUserMedia.call(mediaDevices, createCaptureConstraints(streamId));
    } catch (error) {
      return this._captureFailed(session, 'LIVE_DUBBING_CAPTURE_FAILED', { cause: error, streamId });
    }

    session.capturePromise = Promise.resolve(capturePromise).then(
      stream => this._captureResolved(session, stream, streamId),
      error => this._captureFailed(session, 'LIVE_DUBBING_CAPTURE_FAILED', {
        cause: error,
        streamId,
      }),
    );
    return session.capturePromise;
  }

  /** Initialize both graphs before the provider bootstrap request is made. */
  async _captureResolved(session, stream, streamId) {
    if (!this._isCurrentSession(session)) {
      if (!session.streamStopped) {
        stopTracks(stream);
        session.streamStopped = true;
      }
      return {
        success: false,
        error: 'LIVE_DUBBING_SESSION_DISPOSED',
        ignored: true,
        sessionId: session.sessionId,
        providerId: session.providerId,
        status: IDLE_STATUS,
      };
    }

    const liveAudioTracks = this._getLiveAudioTracks(stream);
    if (liveAudioTracks.length === 0) {
      stopTracks(stream);
      return this._captureFailed(session, 'LIVE_DUBBING_NO_LIVE_AUDIO_TRACK', { streamId });
    }

    session.stream = stream;
    session.streamStopped = false;
    session.status = LIVE_DUBBING_INTERNAL_STATUS.CAPTURING;
    this._markMilestone(session, 'captureReady');
    session.lastError = null;
    this._addTrackListeners(session, liveAudioTracks);

    try {
      await this._initializePipelines(session);
      if (!this._isCurrentSession(session)) {
        return {
          success: false,
          error: 'LIVE_DUBBING_SESSION_DISPOSED',
          ignored: true,
          sessionId: session.sessionId,
          providerId: session.providerId,
          status: IDLE_STATUS,
        };
      }
      session.capturePromise = null;
      return this._mediaAcquiredResponse(session);
    } catch (error) {
      return this._pipelineFailed(session, error, streamId);
    }
  }

  async _initializePipelines(session) {
    if (!this._isCurrentSession(session)) {
      throw Object.assign(new Error('Live dubbing pipeline setup was cancelled'), {
        code: 'LIVE_DUBBING_PIPELINE_SETUP_CANCELLED',
      });
    }

    const inputPipelineFactory = this.inputPipelineFactory
      ? callbacks => this.inputPipelineFactory({ sessionId: session.sessionId, ...callbacks })
      : null;
    const outputPlayerFactory = this.outputPlayerFactory
      ? callbacks => this.outputPlayerFactory({ sessionId: session.sessionId, ...callbacks })
      : null;

    // Start the core audio path silent: optional original-audio monitoring
    // must never fail core capture. The latest remembered session volume is
    // applied afterwards through the normal runtime path with latest-wins
    // fencing (read after readiness, never a pre-startup capture).
    const audioEngine = new LiveDubbingAudioEngine({
      ...this.audioEngineOptions,
      audioMode: session.audioMode,
      originalVolume: 0,
      dubbedVolume: session.dubbedVolume,
      enabled: this.pipelineRequired,
      inputPipelineFactory,
      outputPlayerFactory,
      onFrame: frame => this._handleInputFrame(session, frame),
      onInputError: error => this._handlePipelineError(session, error, 'INPUT_PIPELINE_ERROR'),
      onOutputError: error => this._handlePipelineError(session, error, 'OUTPUT_PIPELINE_ERROR'),
      onInputReady: () => {
        if (this._isCurrentSession(session)) this._markMilestone(session, 'inputReady');
      },
      onOutputReady: () => {
        if (this._isCurrentSession(session)) this._markMilestone(session, 'outputReady');
      },
      onOutputCreated: player => {
        session.telemetry.outputBaseline = this._readChildMetrics(player);
      },
      onMetrics: metrics => {
        if (!this._isCurrentSession(session)) return;
        session.outputMetrics = { ...metrics };
        this._recordOutputMetrics(session, metrics);
      },
      onPlaybackAccepted: details => {
        this._handlePlaybackAccepted(session, details);
      },
    });
    session.audioEngine = audioEngine;

    const readiness = await audioEngine.start(session.stream);
    if (!this._isCurrentSession(session)) {
      throw Object.assign(new Error('Live dubbing pipeline setup was cancelled'), {
        code: 'LIVE_DUBBING_PIPELINE_SETUP_CANCELLED',
      });
    }

    session.inputPipeline = audioEngine.inputPipeline;
    session.outputPlayer = audioEngine.outputPlayer;
    session.pipelinesReady = readiness.inputPipelineReady && readiness.outputPipelineReady;
    session.audioPathReady = readiness.audioPathReady;
    if (this.pipelineRequired || session.audioMode === LIVE_DUBBING_AUDIO_MODES.MEDIA_STREAM) {
      session.status = LIVE_DUBBING_STATUS.CONNECTING_PROVIDER;
    }

    // Deferred original-audio realization must never block core capture:
    // launch detached after readiness/status are committed. Fencing inside
    // keeps dispose/replacement inert and failures local-only.
    void this._applyDeferredOriginalVolume(session, audioEngine).catch(() => {});
    // Deferred dubbed-audio realization mirrors the original path with the
    // same detached, fenced, local-failure semantics.
    void this._applyDeferredDubbedVolume(session, audioEngine).catch(() => {});
  }

  /**
   * Realize the latest remembered pre-engine volume after core readiness.
   * Reads `session.originalVolume`/`originalVolumeRequestToken` after the
   * core path is ready (never a pre-startup capture) and applies it through
   * the normal runtime engine path so monitor logic stays in the engine.
   * Failure stays local: fall back to the last realizable safe value for a
   * new engine (silence), keep session/engine consistent, and never
   * terminalize, clean up, or notify. A newer runtime command arriving
   * during the deferred apply always wins via the token/session fence.
   */
  async _applyDeferredOriginalVolume(session, audioEngine) {
    if (this.currentSession !== session || session.audioEngine !== audioEngine) return;
    if (!this._isCurrentSession(session)) return;
    if (session.audioPathReady !== true) return;
    const volume = session.originalVolume;
    const token = session.originalVolumeRequestToken;
    if (volume === 0) return;
    let applied = false;
    try {
      await audioEngine.setOriginalVolume(volume);
      applied = true;
    } catch {
      applied = false;
    }
    if (applied) {
      if (this.currentSession !== session || session.audioEngine !== audioEngine) return;
      if (!this._isCurrentSession(session)) return;
      if (session.originalVolumeRequestToken !== token) return;
      if (session.originalVolume !== volume) return;
      return;
    }
    if (this.currentSession !== session || session.audioEngine !== audioEngine) return;
    if (!this._isCurrentSession(session)) return;
    if (session.originalVolumeRequestToken !== token) return;
    if (session.originalVolume !== volume) return;
    session.originalVolume = 0;
    try {
      if (this.currentSession === session
        && session.audioEngine === audioEngine
        && session.originalVolumeRequestToken === token
        && session.originalVolume === 0) {
        await audioEngine.setOriginalVolume(0);
      }
    } catch {
      // Best effort: session already reflects the safe fallback.
    }
  }

  /**
   * Realize the latest remembered pre-target dubbed volume after core
   * readiness. Reads `session.dubbedVolume`/`dubbedVolumeRequestToken` after
   * the core path is ready (never a pre-startup capture) and applies it
   * through the per-mode runtime target so target logic stays in the target.
   * Media-stream dubbed audio is provider-owned: at pipeline-init time the
   * provider client does not exist yet, so the deferred step is a no-op and
   * the stored session value is applied by a later runtime SET once the
   * client exists. Failure stays local: fall back to the last realizable
   * safe value for a new target (full gain), keep session/target consistent,
   * and never terminalize, clean up, or notify. A newer runtime command
   * arriving during the deferred apply always wins via the token/session
   * fence.
   */
  async _applyDeferredDubbedVolume(session, audioEngine) {
    if (session.audioMode === LIVE_DUBBING_AUDIO_MODES.MEDIA_STREAM) return;
    if (this.currentSession !== session || session.audioEngine !== audioEngine) return;
    if (!this._isCurrentSession(session)) return;
    if (session.audioPathReady !== true) return;
    const volume = session.dubbedVolume;
    const token = session.dubbedVolumeRequestToken;
    if (volume === 1) return;
    let applied = false;
    try {
      await audioEngine.setDubbedVolume(volume);
      applied = true;
    } catch {
      applied = false;
    }
    if (applied) {
      if (this.currentSession !== session || session.audioEngine !== audioEngine) return;
      if (!this._isCurrentSession(session)) return;
      if (session.dubbedVolumeRequestToken !== token) return;
      if (session.dubbedVolume !== volume) return;
      return;
    }
    if (this.currentSession !== session || session.audioEngine !== audioEngine) return;
    if (!this._isCurrentSession(session)) return;
    if (session.dubbedVolumeRequestToken !== token) return;
    if (session.dubbedVolume !== volume) return;
    session.dubbedVolume = 1;
    try {
      if (this.currentSession === session
        && session.audioEngine === audioEngine
        && session.dubbedVolumeRequestToken === token
        && session.dubbedVolume === 1) {
        await audioEngine.setDubbedVolume(1);
      }
    } catch {
      // Best effort: session already reflects the safe fallback.
    }
  }

  /**
   * Resolve the declared provider audio path. The mode comes only from the
   * registry definition — never from client method presence and never from
   * a provider id. Unknown providers and invalid modes resolve to null and
   * fail closed at the pipeline gate.
   */
  _resolveProviderAudioMode(providerId) {
    try {
      return this.providerRegistry?.getAudioMode?.(providerId) || null;
    } catch {
      return null;
    }
  }

  connectProvider(sessionId, providerId, targetLanguage = null, eventSequence = undefined) {
    const sequenceError = this._requiredEventSequence(sessionId, eventSequence, providerId);
    if (sequenceError) return sequenceError;
    if (!isProviderId(providerId)) return this._invalidProvider(sessionId);

    const session = this.currentSession;
    if (!session || session.sessionId !== sessionId || session.providerId !== providerId) {
      return this._sessionMismatch(sessionId, providerId, session);
    }
    const connectionStarted = Boolean(session.connectPromise)
      || session.status === LIVE_DUBBING_STATUS.RUNNING;
    if (connectionStarted) {
      if (!isEventSequence(eventSequence) || eventSequence !== session.eventSequence) {
        return this._sequenceMismatch(sessionId, session, providerId);
      }
      if (session.status === LIVE_DUBBING_STATUS.RUNNING) return this._providerReadyResponse(session);
      return session.connectPromise;
    }
    if (session.status !== LIVE_DUBBING_STATUS.CONNECTING_PROVIDER
      || !session.audioPathReady
      || eventSequence !== session.eventSequence + 1) {
      return this._sequenceMismatch(sessionId, session, providerId);
    }
    if (targetLanguage !== null && targetLanguage !== undefined) {
      try {
        if (normalizeProviderTargetLanguage(providerId, targetLanguage)
          !== normalizeProviderTargetLanguage(session.providerId, session.targetLanguage)) {
          return {
            success: false,
            error: 'LIVE_DUBBING_TARGET_LANGUAGE_MISMATCH',
            sessionId,
            providerId,
            status: session.status,
          };
        }
      } catch {
        return {
          success: false,
          error: 'INVALID_TARGET_LANGUAGE',
          sessionId,
          providerId,
          status: session.status,
        };
      }
    }
    session.eventSequence = eventSequence;

    const providerGeneration = ++this.providerGeneration;
    session.providerGeneration = providerGeneration;
    session.connectPromise = Promise.resolve().then(async () => {
      const client = await this._createProviderClient(session, providerGeneration);
      if (!this._isCurrentProviderGeneration(session, providerGeneration)) {
        return this._disposedProviderResponse(session);
      }
      if (!client || typeof client.connect !== 'function') {
        throw Object.assign(new Error('Live dubbing provider is unavailable'), {
          code: 'LIVE_DUBBING_PROVIDER_UNAVAILABLE',
        });
      }
      session.providerClient = client;
      // Seed a newly-created media-stream provider with the current session
      // dubbed volume before connect can produce remote playback. Duck-typed:
      // providers without setDubbedVolume keep their own default. A seed
      // failure is non-terminal and never terminalizes or cleans up; the
      // runtime SET path surfaces failures.
      if (session.audioMode === LIVE_DUBBING_AUDIO_MODES.MEDIA_STREAM
        && typeof client.setDubbedVolume === 'function') {
        try {
          await client.setDubbedVolume(session.dubbedVolume);
        } catch {
          try {
            this.log?.warn?.('Live dubbing dubbed volume seed failed');
          } catch {
            // Seed-failure diagnostics must never affect provider setup.
          }
        }
        if (!this._isCurrentProviderGeneration(session, providerGeneration)) {
          return this._disposedProviderResponse(session);
        }
      }
      let bootstrapWrapper = await this.requestProviderBootstrapForSession(session);
      if (!this._isCurrentProviderGeneration(session, providerGeneration)) {
        return this._disposedProviderResponse(session);
      }
      if (!bootstrapWrapper) throw Object.assign(new Error('Provider bootstrap is unavailable'), {
        code: 'LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE',
      });

      let setupPromise;
      try {
        const connectOptions = {
          bootstrap: bootstrapWrapper.bootstrap,
          targetLanguage: bootstrapWrapper.targetLanguage,
        };
        if (session.audioMode === LIVE_DUBBING_AUDIO_MODES.MEDIA_STREAM) {
          // Browser-neutral handoff: the retained capture stream, never a
          // chrome stream id or tabCapture handle (Firefox-compatible).
          connectOptions.sourceStream = session.stream;
        }
        setupPromise = client.connect(connectOptions);
      } finally {
        // The controller never stores bootstrap data; this wrapper is cleared
        // before the provider setup promise is awaited.
        bootstrapWrapper = null;
      }
      await setupPromise;
      if (!this._isCurrentProvider(session, providerGeneration)) {
        throw Object.assign(new Error('Live dubbing provider setup was not acknowledged'), {
          code: 'LIVE_DUBBING_PROVIDER_SETUP_INCOMPLETE',
        });
      }

       // The client promise resolves only after setupComplete. The callback is
       // retained as an early fence for input and callback-driven clients;
       // CONNECTING_PROVIDER remains on its canonical sequence until the
       // provider-ready lifecycle commit below.
       this._markProviderSetupComplete(session, providerGeneration);
       session.status = LIVE_DUBBING_STATUS.RUNNING;
       session.eventSequence += 1;
       return this._providerReadyResponse(session);
    }).catch(error => {
      if (this._isCurrentProviderGeneration(session, providerGeneration)) {
        this._providerFailed(session, error, 'PROVIDER_ERROR', error?.providerDiagnostic);
      }
      if (session.providerDiagnostic) return this._providerFailureResponse(session, error);
      return this._disposedProviderResponse(session);
    });
    return session.connectPromise;
  }

  async _createProviderClient(session, generation) {
    const callbacks = {
      onSetupComplete: () => {
        if (!this._isCurrentProvider(session, generation)) return;
        this._markProviderSetupComplete(session, generation);
      },
      onAudio: audio => this._handleProviderAudio(session, generation, audio),
      onTranslatedTranscript: transcript => this._handleProviderTranslatedTranscript(
        session,
        generation,
        transcript,
      ),
      onOriginalTranscript: transcript => this._handleProviderOriginalTranscript(
        session,
        generation,
        transcript,
      ),
      onInterrupted: () => this._handleProviderInterrupted(session, generation),
      onGenerationComplete: () => {},
      onTurnComplete: () => {},
      onGoAway: details => this._handleProviderTerminal(
        session,
        generation,
        'PROVIDER_GO_AWAY',
        details,
        details?.providerDiagnostic,
      ),
      onError: error => this._handleProviderError(
        session,
        generation,
        error,
        error?.providerDiagnostic,
      ),
      onClose: (details, providerDiagnostic) => this._handleProviderClose(
        session,
        generation,
        details,
        providerDiagnostic,
      ),
      onPlaybackAccepted: details => this._handleProviderPlaybackAccepted(
        session,
        generation,
        details,
      ),
    };
    let client = this.providerClient;
    if (!client && typeof this.providerClientFactory === 'function') {
      client = await this.providerClientFactory({
        sessionId: session.sessionId,
        providerId: session.providerId,
        providerGeneration: generation,
        ...this.providerClientOptions,
        callbacks,
        ...callbacks,
      });
    }
    if (!client) {
      client = this.providerRegistry.create(session.providerId, {
        ...this.providerClientOptions,
        performanceNow: this.performanceNow,
        callbacks,
        ...callbacks,
      });
    }
    for (const [name, callback] of Object.entries(callbacks)) client[name] = callback;
    session.telemetry.providerBaseline = this._readChildTelemetry(client);
    return client;
  }

  _markProviderSetupComplete(session, generation) {
    if (!this._isCurrentProvider(session, generation)) return false;

    const wasSetupComplete = session.setupComplete === true;
    session.setupAcknowledged = true;
    session.setupComplete = true;
    if (!wasSetupComplete) {
      this._markMilestone(session, 'setupComplete');
    }
    this._drainPendingInput(session);
    return true;
  }

  requestProviderBootstrapForSession(session) {
    if (session.bootstrapRequestPromise) return session.bootstrapRequestPromise;
    if (session.bootstrapRequested) {
      return Promise.resolve(null);
    }
    session.bootstrapRequested = true;
    const request = createProviderBootstrapRequest({
      sessionId: session.sessionId,
      providerId: session.providerId,
      targetLanguage: session.targetLanguage,
      eventSequence: session.eventSequence,
    });
    const bootstrapRequestPromise = Promise.resolve()
      .then(() => this.requestBootstrap(request))
      .then(response => parseProviderBootstrapResponse(
        response,
        session.providerId,
        session.targetLanguage,
      ))
      .catch(() => null);
    const trackedBootstrapRequest = bootstrapRequestPromise.finally(() => {
      if (session.bootstrapRequestPromise === trackedBootstrapRequest) {
        session.bootstrapRequestPromise = null;
      }
    });
    session.bootstrapRequestPromise = trackedBootstrapRequest;
    return trackedBootstrapRequest;
  }

  requestProviderBootstrap() {
    const session = this.currentSession;
    if (!session || !isSessionId(session.sessionId) || !isSessionId(session.targetLanguage)) {
      return Promise.resolve({ success: false, error: 'LIVE_DUBBING_SESSION_UNAVAILABLE' });
    }
    if (session.status !== LIVE_DUBBING_STATUS.CONNECTING_PROVIDER
      || !session.audioPathReady) {
      return Promise.resolve({ success: false, error: 'LIVE_DUBBING_AUDIO_PIPELINES_UNAVAILABLE' });
    }
    return this.requestProviderBootstrapForSession(session);
  }

  status(
    requestedSessionId = this.currentSession?.sessionId,
    providerId = undefined,
    requestedEventSequence = undefined,
  ) {
    if (arguments.length === 0) providerId = this.currentSession?.providerId;
    if (requestedSessionId === undefined && !this.currentSession) {
      return { success: true, active: false, sessionId: null, status: IDLE_STATUS };
    }
    if (!isSessionId(requestedSessionId)) {
      return { success: false, error: 'INVALID_SESSION_ID', sessionId: requestedSessionId ?? null, status: IDLE_STATUS };
    }
    if (!isProviderId(providerId)) return this._invalidProvider(requestedSessionId);

    const session = this.currentSession;
    if (!session) {
      return {
        success: true,
        active: false,
        sessionId: requestedSessionId,
        providerId,
        status: IDLE_STATUS,
      };
    }
    if (session.sessionId !== requestedSessionId || session.providerId !== providerId) {
      return this._sessionMismatch(requestedSessionId, providerId, session);
    }
    if (requestedEventSequence !== undefined && requestedEventSequence !== session.eventSequence) {
      return this._sequenceMismatch(requestedSessionId, session, providerId);
    }

    const active = [
      LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
      LIVE_DUBBING_INTERNAL_STATUS.CAPTURING,
      LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
      LIVE_DUBBING_STATUS.RUNNING,
    ].includes(session.status);
    return {
      success: true,
      active,
      sessionId: session.sessionId,
      providerId: session.providerId,
      status: session?.status || IDLE_STATUS,
      eventSequence: session.eventSequence,
      captureReady: Boolean(session.stream),
      ...this._audioReadiness(session),
      setupComplete: session.setupComplete,
      metrics: { ...session.metrics },
      ...(session.outputMetrics ? { outputMetrics: { ...session.outputMetrics } } : {}),
      ...(session.lastError ? { lastError: session.lastError } : {}),
    };
  }

  /** Return scalar-only, same-context diagnostics for local validation. */
  getTelemetry() {
    const session = this.currentSession;
    if (session) {
      this._syncProviderTelemetry(session);
      this._syncProviderSendMetrics(session);
      this._syncOutputMetricsFromPlayer(session);
      this._syncTelemetryCounters(session);
      return buildTelemetrySnapshot({
        telemetry: session.telemetry,
        metrics: session.metrics,
      });
    }
    return buildTelemetrySnapshot({
      telemetry: this.lastTelemetry,
      metrics: this.lastTelemetry,
    });
  }

  getTelemetrySnapshot() {
    return this.getTelemetry();
  }

  getSnapshot() {
    const session = this.currentSession;
    return {
      active: Boolean(session),
      sessionId: session?.sessionId || null,
      ...(session ? { providerId: session.providerId } : {}),
      status: session?.status || IDLE_STATUS,
      telemetry: this.getTelemetry(),
    };
  }

  /**
   * The one authoritative, idempotent disposal path. Fencing happens before
   * any resource call. The offscreen router awaits this Promise before
   * returning the exact DISPOSED acknowledgement for the requested session.
   *
   * Transport retry (fresh DISPOSE delivery) only joins the single canonical
   * physical promise; it never reruns provider.dispose/inputPipeline.stop/
   * outputPlayer.stop (and therefore never reruns the AudioContext.close()
   * inside pipeline/player teardown) while the old teardown is still
   * executing. Every externally visible wait here is bounded by
   * LIVE_DUBBING_STOP_TIMEOUT: a still-executing physical teardown returns an
   * explicit cleanupPending/retryable pending response, never a false
   * DISPOSED. The tombstone and its canonical promise continue in the
   * background; late settlement finalizes only the exact old session.
   */
  async dispose(sessionId, providerId, reason = null, eventSequence = undefined) {
    if (!isProviderId(providerId)) return this._invalidProvider(sessionId);
    const disposed = this.disposedSession;
    if (disposed?.sessionId === sessionId && disposed.providerId === providerId) {
      const settled = await this._awaitBoundedPhysicalCleanup(disposed.cleanupPromise);
      if (!settled) return this._cleanupPendingResponse(sessionId, providerId);
      return {
        success: true,
        ack: LIVE_DUBBING_OFFSCREEN_ACKS.DISPOSED,
        disposed: true,
        idempotent: true,
        sessionId,
        providerId,
        active: false,
        status: IDLE_STATUS,
      };
    }
    const session = this.currentSession;
    if (!session || session.sessionId !== sessionId) {
      return {
        success: true,
        ack: LIVE_DUBBING_OFFSCREEN_ACKS.DISPOSED,
        disposed: true,
        idempotent: !session,
        ignored: Boolean(session),
        sessionId: isSessionId(sessionId) ? sessionId : null,
        providerId,
        active: Boolean(session),
        status: session?.status || IDLE_STATUS,
      };
    }
    if (session.providerId !== providerId) return this._sessionMismatch(sessionId, providerId, session);
    // An exact session identity is the terminal fence; sequence drift is
    // expected when a response is lost while setup is still settling.
    void eventSequence;
    void reason;

    session.terminalRequested = true;
    this._cancelTerminalNotification(session);
    this._removeTrackListeners(session);
    const cleanup = this._cleanupSessionResources(session);
    const tombstone = {
      session,
      sessionId,
      providerId,
      cleanupPromise: cleanup,
      cleanupComplete: false,
    };
    this.disposedSession = tombstone;
    cleanup.then(
      () => {
        if (this.disposedSession === tombstone) tombstone.cleanupComplete = true;
      },
      () => {
        if (this.disposedSession === tombstone) tombstone.cleanupComplete = true;
      },
    );
    this.currentSession = null;

    const response = {
      success: true,
      ack: LIVE_DUBBING_OFFSCREEN_ACKS.DISPOSED,
      disposed: true,
      sessionId,
      providerId,
      active: false,
      status: IDLE_STATUS,
    };
    const settled = await this._awaitBoundedPhysicalCleanup(cleanup);
    if (!settled) return this._cleanupPendingResponse(sessionId, providerId);
    return response;
  }

  _awaitBoundedPhysicalCleanup(cleanupPromise) {
    let timeoutId;
    const timeout = new Promise(resolve => {
      timeoutId = setTimeout(() => resolve(false), LIVE_DUBBING_STOP_TIMEOUT);
    });
    return Promise.race([
      Promise.resolve(cleanupPromise).then(() => true, () => true),
      timeout,
    ]).finally(() => clearTimeout(timeoutId));
  }

  _cleanupPendingResponse(sessionId, providerId) {
    return {
      success: false,
      error: 'LIVE_DUBBING_CLEANUP_PENDING',
      cleanupPending: true,
      retryable: true,
      sessionId: isSessionId(sessionId) ? sessionId : null,
      providerId,
      active: false,
      status: IDLE_STATUS,
      disposed: false,
    };
  }

  _cleanupSessionResources(session) {
    if (session.cleanupPromise) return session.cleanupPromise;
    const cleanupDiagnostic = this._createCleanupDiagnostic(session);
    if (cleanupDiagnostic && !cleanupDiagnostic.playbackAccepted) {
      try {
        // Lifecycle detail only: the background coordinator owns the single
        // warn-level terminal record, so this local summary stays at debug to
        // avoid duplicate terminal logs for one session end.
        this.log?.debug?.('Live dubbing ended without translated playback', cleanupDiagnostic);
      } catch {
        // Diagnostic logging must not affect resource cleanup.
      }
    }
    this._markMilestone(session, 'cleanupStart');
    this._syncProviderSendMetrics(session);
    this._syncOutputMetricsFromPlayer(session);
    this._syncTelemetryCounters(session);
    session.disposing = true;
    session.providerGeneration = ++this.providerGeneration;
    session.setupComplete = false;
    session.pendingInput = [];
    session.pendingInputMs = 0;
    session.metrics.inputPendingFrames = 0;
    session.metrics.inputPendingBytes = 0;
    session.metrics.inputPendingDurationMs = 0;

    const client = session.providerClient;
    const audioEngine = session.audioEngine;
    const inputPipeline = session.inputPipeline;
    const outputPlayer = session.outputPlayer;
    const stream = session.stream;
    session.providerClient = null;
    session.audioEngine = null;
    session.inputPipeline = null;
    session.outputPlayer = null;
    session.stream = null;

    // Provider resources shut down first: dispose is initiated here so
    // close-only clients still terminate synchronously, while async
    // provider shutdown is awaited in the chain below. Tracks stay
    // Controller-owned — the provider never owns the capture stream —
    // and stop synchronously right after.
    let providerShutdown = null;
    try {
      providerShutdown = typeof client?.dispose === 'function'
        ? client.dispose()
        : client?.close?.();
    } catch {
      // Provider teardown is best effort; callbacks are already fenced.
    }
    if (stream && !session.streamStopped) {
      stopTracks(stream);
      session.streamStopped = true;
    }
    session.bootstrapRequestPromise = null;
    session.bootstrapRequested = false;

    try {
      if (audioEngine) audioEngine.clearOutput?.();
      else outputPlayer?.clear?.();
    } catch {
      // Queue clearing is best effort before graph teardown.
    }

    const stopResource = resource => {
      try {
        return Promise.resolve(resource?.stop?.());
      } catch (error) {
        return Promise.reject(error);
      }
    };

    const audioShutdown = audioEngine
      ? stopResource(audioEngine)
      : Promise.allSettled([stopResource(inputPipeline), stopResource(outputPlayer)]);
    session.cleanupPromise = Promise.allSettled([
      providerShutdown,
      audioShutdown,
    ]).then(() => {
      session.telemetry.outputQueueCurrentDurationMs = 0;
      this._markMilestone(session, 'cleanupComplete');
      this._syncTelemetryCounters(session);
      if (this.currentSession === session || (
        this.currentSession === null && this.disposedSession?.session === session
      )) {
        this.lastTelemetry = buildTelemetrySnapshot({
          telemetry: session.telemetry,
          metrics: session.metrics,
        });
      }
      return true;
    });
    return session.cleanupPromise;
  }

  _createCleanupDiagnostic(session) {
    this._syncProviderTelemetry(session);
    this._recordOutputMetrics(session, session.outputMetrics);
    if (session.setupComplete !== true
      && session.telemetry.milestones.setupComplete === null) return null;
    let providerLastSendReason;
    try {
      providerLastSendReason = session.providerClient?.getSendState?.().lastReason;
    } catch {
      providerLastSendReason = undefined;
    }

    return createLiveDubbingCleanupDiagnostic({
      cleanupCause: session.lastError,
      capturedFrames: Math.min(
        Number.MAX_SAFE_INTEGER,
        safeInteger(session.metrics.preSetupDroppedFrames)
          + safeInteger(session.metrics.inputFrames),
      ),
      inputSentFrames: session.metrics.inputSentFrames,
      inputPendingFrames: session.metrics.inputPendingFrames,
      providerLastSendReason,
      providerAudioChunks: session.metrics.outputChunks,
      playbackAccepted: session.telemetry.milestones.firstTranslatedAudioAcceptedByPlayback !== null,
      outputSafetyDrops: session.metrics.outputSafetyDrops,
      interruptions: session.telemetry.interruptions,
      providerTerminalCategory: session.telemetry.providerTerminalCategory,
    });
  }

  _captureFailed(session, error, options = {}) {
    const isCurrent = this._isCurrentSession(session);
    if (options.stream && session.stream !== options.stream) stopTracks(options.stream);
    const diagnostic = createLiveDubbingDiagnostic(
      LIVE_DUBBING_CAPTURE_STAGES.OFFSCREEN_GET_USER_MEDIA,
      options.cause || { name: 'CaptureError', message: error, code: error },
      { sensitiveValues: options.streamId ? [options.streamId] : [] },
    );
    if (isCurrent) {
      session.capturePromise = null;
      session.status = LIVE_DUBBING_STATUS.ERROR;
      session.lastError = error;
    }
    return {
      success: false,
      error,
      sessionId: session.sessionId,
      providerId: session.providerId,
      status: isCurrent ? session.status : IDLE_STATUS,
      diagnostic,
    };
  }

  _pipelineFailed(session, error, streamId) {
    const result = this._captureFailed(session, errorCode(error, 'LIVE_DUBBING_AUDIO_PIPELINES_FAILED'), {
      cause: error,
      streamId,
    });
    this._cleanupSessionResources(session);
    return result;
  }

  _mediaAcquiredResponse(session) {
    return {
      success: true,
      ack: LIVE_DUBBING_OFFSCREEN_ACKS.MEDIA_ACQUIRED,
      mediaAcquired: true,
      sessionId: session.sessionId,
      providerId: session.providerId,
      active: true,
      status: session.status,
      eventSequence: session.eventSequence,
      captureReady: Boolean(session.stream),
      ...this._audioReadiness(session),
    };
  }

  _providerReadyResponse(session) {
    return {
      success: true,
      ack: LIVE_DUBBING_OFFSCREEN_ACKS.PROVIDER_READY,
      providerReady: true,
      running: true,
      sessionId: session.sessionId,
      providerId: session.providerId,
      active: true,
      status: LIVE_DUBBING_STATUS.RUNNING,
      eventSequence: session.eventSequence,
      captureReady: Boolean(session.stream),
      ...this._audioReadiness(session),
      setupComplete: session.setupComplete,
    };
  }

  _originalVolumeResponse(session) {
    return {
      success: true,
      sessionId: session.sessionId,
      providerId: session.providerId,
      eventSequence: session.eventSequence,
      status: session.status,
      originalVolume: session.originalVolume,
    };
  }

  _supersededOriginalVolumeResponse(session) {
    return {
      success: true,
      ignored: true,
      superseded: true,
      sessionId: session.sessionId,
      providerId: session.providerId,
      eventSequence: session.eventSequence,
      status: session.status,
      originalVolume: session.originalVolume,
    };
  }

  _staleOriginalVolumeResponse(session, sessionId, providerId, eventSequence, requestToken) {
    if (this.currentSession && this.currentSession !== session) {
      return this._sessionMismatch(sessionId, providerId, this.currentSession);
    }
    if (this.currentSession === session && session.eventSequence !== eventSequence) {
      return this._sequenceMismatch(sessionId, session, providerId);
    }
    if (this.currentSession === session && session.originalVolumeRequestToken !== requestToken) {
      return this._supersededOriginalVolumeResponse(session);
    }
    return this._disposedProviderResponse(session);
  }

  _dubbedVolumeResponse(session) {
    return {
      success: true,
      sessionId: session.sessionId,
      providerId: session.providerId,
      eventSequence: session.eventSequence,
      status: session.status,
      dubbedVolume: session.dubbedVolume,
    };
  }

  _supersededDubbedVolumeResponse(session) {
    return {
      success: true,
      ignored: true,
      superseded: true,
      sessionId: session.sessionId,
      providerId: session.providerId,
      eventSequence: session.eventSequence,
      status: session.status,
      dubbedVolume: session.dubbedVolume,
    };
  }

  _staleDubbedVolumeResponse(session, sessionId, providerId, eventSequence, requestToken) {
    if (this.currentSession && this.currentSession !== session) {
      return this._sessionMismatch(sessionId, providerId, this.currentSession);
    }
    if (this.currentSession === session && session.eventSequence !== eventSequence) {
      return this._sequenceMismatch(sessionId, session, providerId);
    }
    if (this.currentSession === session && session.dubbedVolumeRequestToken !== requestToken) {
      return this._supersededDubbedVolumeResponse(session);
    }
    return this._disposedProviderResponse(session);
  }

  /**
   * Provider-neutral audio readiness. `audioPathReady` is the generic gate
   * for CONNECT_PROVIDER and bootstrap; the PCM-specific flags report only
   * real local pipelines. In media-stream mode no pipelines exist, so those
   * flags read false while `audioPathReady` carries readiness truthfully.
   */
  _audioReadiness(session) {
    if (session.audioEngine) return session.audioEngine.getReadiness();
    return {
      audioPathReady: session.audioPathReady === true,
      inputPipelineReady: Boolean(session.inputPipeline && session.pipelinesReady),
      outputPipelineReady: Boolean(session.outputPlayer && session.pipelinesReady),
    };
  }

  _disposedProviderResponse(session) {
    return {
      success: false,
      error: 'LIVE_DUBBING_SESSION_DISPOSED',
      ignored: true,
      sessionId: session.sessionId,
      providerId: session.providerId,
      status: IDLE_STATUS,
      ...(session.providerDiagnostic ? { providerDiagnostic: session.providerDiagnostic } : {}),
    };
  }

  _providerFailureResponse(session, error) {
    return {
      success: false,
      error: errorCode(error, session.lastError || 'LIVE_DUBBING_PROVIDER_FAILED'),
      sessionId: session.sessionId,
      providerId: session.providerId,
      status: session.status,
      providerDiagnostic: session.providerDiagnostic,
    };
  }

  _handleInputFrame(session, frame) {
    if (!this._isCurrentSession(session) || session.terminalRequested || session.disposing) return;
    // Media-stream providers consume the retained capture stream directly;
    // the PCM pending queue and the sendAudio path below are pcm-only.
    if (session.audioMode === LIVE_DUBBING_AUDIO_MODES.MEDIA_STREAM) return;
    if (!session.setupComplete) {
      const byteLength = getFrameByteLength(frame);
      const durationMs = getFrameDurationMs(frame, byteLength);
      session.metrics.preSetupDroppedFrames += 1;
      session.metrics.preSetupDroppedDurationMs += durationMs;
      session.telemetry.preSetupDroppedFrames += 1;
      session.telemetry.preSetupDroppedDurationMs += durationMs;
      return;
    }
    const buffer = getFrameBuffer(frame);
    if (!buffer || buffer.byteLength === 0) return;
    const sampleCount = Number.isInteger(frame?.sampleCount) && frame.sampleCount > 0
      ? frame.sampleCount
      : Math.floor(buffer.byteLength / 2);
    const sampleRate = Number.isInteger(frame?.sampleRate) && frame.sampleRate > 0
      ? frame.sampleRate
      : INPUT_SAMPLE_RATE;
    const queued = {
      buffer,
      sampleCount,
      sampleRate,
      sourceSampleStart: frame?.sourceSampleStart,
      sourceTimestamp: frame?.sourceTimestamp,
    };
    session.metrics.inputFrames += 1;
    session.metrics.inputBytes += buffer.byteLength;
    session.telemetry.inputFrames = safeInteger(session.metrics.inputFrames);
    session.pendingInput.push(queued);
    session.pendingInputMs += (sampleCount / sampleRate) * 1000;
    this._trimPendingInput(session);
    this._updatePendingInputMetrics(session);
    this._drainPendingInput(session);
  }

  _trimPendingInput(session) {
    if (session.pendingInputMs <= LIVE_DUBBING_AUDIO_LIMITS.INPUT_PENDING_MAX_MS) return;
    while (session.pendingInput.length > 0
      && session.pendingInputMs > LIVE_DUBBING_AUDIO_LIMITS.INPUT_PENDING_RETAIN_MS) {
      const dropped = session.pendingInput.shift();
      const durationMs = getFrameDurationMs(dropped);
      session.pendingInputMs -= durationMs;
      session.metrics.inputDroppedFrames += 1;
      session.metrics.inputDroppedBytes += dropped.buffer.byteLength;
      session.metrics.inputDroppedDurationMs += durationMs;
      session.telemetry.inputDroppedDurationMs += durationMs;
    }
    this._updatePendingInputMetrics(session);
  }

  _drainPendingInput(session) {
    if (!this._isCurrentSession(session) || !session.setupComplete || !session.providerClient) return;
    // sendAudio is a pcm-only contract, never universal: media-stream
    // providers receive the capture stream at connect and queue nothing.
    if (session.audioMode === LIVE_DUBBING_AUDIO_MODES.MEDIA_STREAM) return;
    while (session.pendingInput.length > 0) {
      const frame = session.pendingInput[0];
      let sent = false;
      try {
        sent = session.providerClient.sendAudio(frame.buffer) === true;
      } catch (error) {
        this._providerFailed(session, error, 'INPUT_SEND_ERROR');
        return;
      }
      if (!sent) {
        const providerSendMetrics = this._readProviderSendMetrics(session.providerClient);
        if (providerSendMetrics) {
          session.metrics.inputBackpressureEvents = Math.max(
            session.metrics.inputBackpressureEvents,
            providerSendMetrics.backpressureEvents,
          );
          session.telemetry.inputBackpressureEvents = Math.max(
            safeInteger(session.telemetry.inputBackpressureEvents),
            session.metrics.inputBackpressureEvents,
          );
        }
        break;
      }
      session.pendingInput.shift();
      session.pendingInputMs -= getFrameDurationMs(frame);
      session.metrics.inputSentFrames += 1;
      session.metrics.inputSentBytes += frame.buffer.byteLength;
      session.telemetry.inputSentFrames = safeInteger(session.metrics.inputSentFrames);
      this._markMilestone(session, 'firstInputSent');
    }
    this._updatePendingInputMetrics(session);
  }

  _updatePendingInputMetrics(session) {
    session.metrics.inputPendingFrames = session.pendingInput.length;
    session.metrics.inputPendingBytes = session.pendingInput.reduce(
      (sum, item) => sum + item.buffer.byteLength,
      0,
    );
    session.metrics.inputPendingDurationMs = safeNonNegativeNumber(session.pendingInputMs);
  }

  _markMilestone(session, name) {
    if (session.telemetry.milestones[name] !== null) return;
    let value = null;
    try {
      value = this.performanceNow();
    } catch {
      value = null;
    }
    if (Number.isFinite(value)) session.telemetry.milestones[name] = value;
  }

  _readChildMetrics(child) {
    try {
      const metrics = child?.getMetrics?.();
      return metrics && typeof metrics === 'object'
        ? {
          queuedSamples: safeInteger(metrics.queuedSamples),
          underruns: safeInteger(metrics.underruns),
          underrunSamples: safeInteger(metrics.underrunSamples),
          safetyDrops: safeInteger(metrics.safetyDrops),
          acceptedChunks: safeInteger(metrics.acceptedChunks),
          epochResets: safeInteger(metrics.epochResets),
          peakQueuedSamples: safeInteger(metrics.peakQueuedSamples),
        }
        : null;
    } catch {
      return null;
    }
  }

  /**
   * Read provider send facts, the source of truth for backpressure and send
   * failures. Returns null for injected doubles
   * without getMetrics so local fallback counting still applies.
   */
  _readProviderSendMetrics(client) {
    try {
      const metrics = client?.getMetrics?.();
      if (!metrics || typeof metrics !== 'object') return null;
      if (!Number.isInteger(metrics.backpressureEvents) && !Number.isInteger(metrics.sendFailures)) {
        return null;
      }
      return {
        backpressureEvents: safeInteger(metrics.backpressureEvents),
        sendFailures: safeInteger(metrics.sendFailures),
      };
    } catch {
      return null;
    }
  }

  _syncProviderSendMetrics(session) {
    const child = this._readProviderSendMetrics(session.providerClient);
    const localBackpressure = safeInteger(session.metrics.inputBackpressureEvents);
    if (child) {
      session.telemetry.inputBackpressureEvents = Math.max(
        safeInteger(session.telemetry.inputBackpressureEvents),
        localBackpressure,
        child.backpressureEvents,
      );
      session.telemetry.sendFailures = Math.max(
        safeInteger(session.telemetry.sendFailures),
        safeInteger(session.metrics.sendFailures),
        child.sendFailures,
      );
    } else {
      session.telemetry.inputBackpressureEvents = Math.max(
        safeInteger(session.telemetry.inputBackpressureEvents),
        localBackpressure,
      );
      session.telemetry.sendFailures = Math.max(
        safeInteger(session.telemetry.sendFailures),
        safeInteger(session.metrics.sendFailures),
      );
    }
    session.metrics.inputBackpressureEvents = Math.max(
      localBackpressure,
      safeInteger(session.telemetry.inputBackpressureEvents),
    );
    session.metrics.sendFailures = safeInteger(session.telemetry.sendFailures);
  }

  _syncTelemetryCounters(session) {
    session.telemetry.inputFrames = safeInteger(session.metrics.inputFrames);
    session.telemetry.inputSentFrames = safeInteger(session.metrics.inputSentFrames);
    session.telemetry.translatedAudioChunks = safeInteger(session.metrics.outputChunks);
    session.telemetry.outputSafetyDrops = Math.max(
      safeInteger(session.telemetry.outputSafetyDrops),
      safeInteger(session.metrics.outputSafetyDrops),
    );
  }

  /**
   * Pull output queue facts directly from the player when available.
   * Playback behavior is unchanged; this is observational only. Current
   * queue duration stays driven by onMetrics notifications so a stale
   * getMetrics mock cannot regress a fresher pushed update; peak and
   * cumulative counters are merged with max semantics.
   */
  _syncOutputMetricsFromPlayer(session) {
    let playerMetrics = null;
    try {
      playerMetrics = session.audioEngine?.getOutputMetrics?.()
        || session.outputPlayer?.getMetrics?.();
    } catch {
      playerMetrics = null;
    }
    if (!playerMetrics || typeof playerMetrics !== 'object') return;
    const queuedSamples = safeInteger(playerMetrics.queuedSamples);
    const peakSamples = safeInteger(playerMetrics.peakQueuedSamples);
    const peakDurationMs = (Math.max(queuedSamples, peakSamples) / OUTPUT_SAMPLE_RATE) * 1000;
    if (playerMetrics.peakQueuedSamples !== undefined
      && Number.isFinite(peakDurationMs) && peakDurationMs >= 0) {
      session.telemetry.outputQueuePeakDurationMs = Math.max(
        safeNonNegativeNumber(session.telemetry.outputQueuePeakDurationMs),
        peakDurationMs,
      );
    }
    const baselineUnderruns = safeInteger(session.telemetry.outputBaseline?.underruns);
    const underruns = Math.max(0, safeInteger(playerMetrics.underruns) - baselineUnderruns);
    session.telemetry.underruns = Math.max(safeInteger(session.telemetry.underruns), underruns);
    // Observational only: raw worklet underrun sample count, baseline-relative
    // like underruns. Existing underruns counting is unchanged.
    if (playerMetrics.underrunSamples !== undefined) {
      const baselineSamples = safeInteger(session.telemetry.outputBaseline?.underrunSamples);
      const samples = Math.max(0, safeInteger(playerMetrics.underrunSamples) - baselineSamples);
      session.telemetry.underrunSamples = Math.max(
        safeInteger(session.telemetry.underrunSamples),
        samples,
      );
    }
    const baselineSafety = safeInteger(session.telemetry.outputBaseline?.safetyDrops);
    const childSafety = Math.max(0, safeInteger(playerMetrics.safetyDrops) - baselineSafety);
    const mergedSafety = Math.max(
      safeInteger(session.metrics.outputSafetyDrops),
      childSafety,
      safeInteger(session.telemetry.outputSafetyDrops),
    );
    session.metrics.outputSafetyDrops = mergedSafety;
    session.telemetry.outputSafetyDrops = mergedSafety;
    if (Number.isInteger(playerMetrics.epochResets)) {
      const baselineEpoch = safeInteger(session.telemetry.outputBaseline?.epochResets);
      session.metrics.outputEpochResets = Math.max(
        0,
        safeInteger(playerMetrics.epochResets) - baselineEpoch,
      );
    }
    if (Number.isInteger(playerMetrics.acceptedChunks)) {
      const baselineAccepted = safeInteger(session.telemetry.outputBaseline?.acceptedChunks);
      session.metrics.outputAcceptedChunks = Math.max(
        safeInteger(session.metrics.outputAcceptedChunks),
        Math.max(0, safeInteger(playerMetrics.acceptedChunks) - baselineAccepted),
      );
    }
  }

  _readChildTelemetry(child) {
    try {
      const telemetry = child?.getTelemetry?.();
      if (!telemetry || typeof telemetry !== 'object') return null;
      return {
        milestones: Object.fromEntries(TELEMETRY_MILESTONES.map(name => [
          name,
          Number.isFinite(telemetry.milestones?.[name]) ? telemetry.milestones[name] : null,
        ])),
        wsBufferedAmountPeak: safeNonNegativeNumber(telemetry.wsBufferedAmountPeak),
        interruptions: safeInteger(telemetry.interruptions),
        providerTerminalCategory: typeof telemetry.providerTerminalCategory === 'string'
          && SAFE_ERROR_CODE.test(telemetry.providerTerminalCategory)
          ? telemetry.providerTerminalCategory
          : null,
      };
    } catch {
      return null;
    }
  }

  _syncProviderTelemetry(session) {
    const childTelemetry = this._readChildTelemetry(session.providerClient);
    if (!childTelemetry) return;
    const baseline = session.telemetry.providerBaseline;
    for (const name of ['wsOpen', 'setupSent', 'setupComplete']) {
      const value = childTelemetry.milestones[name];
      const previous = baseline?.milestones?.[name] ?? null;
      if (Number.isFinite(value) && value !== previous && session.telemetry.milestones[name] === null) {
        session.telemetry.milestones[name] = value;
      }
    }
    const childInterruptions = Math.max(
      0,
      childTelemetry.interruptions - safeInteger(baseline?.interruptions),
    );
    session.telemetry.interruptions = Math.max(session.telemetry.interruptions, childInterruptions);
    session.telemetry.wsBufferedAmountPeak = Math.max(
      session.telemetry.wsBufferedAmountPeak,
      childTelemetry.wsBufferedAmountPeak,
    );
    const previousCategory = baseline?.providerTerminalCategory || null;
    if (!session.telemetry.providerTerminalCategory
      && childTelemetry.providerTerminalCategory
      && childTelemetry.providerTerminalCategory !== previousCategory) {
      session.telemetry.providerTerminalCategory = childTelemetry.providerTerminalCategory;
    }
  }

  _recordOutputMetrics(session, metrics) {
    if (!metrics || typeof metrics !== 'object') return;
    const queuedSamples = safeInteger(metrics.queuedSamples);
    const durationMs = (queuedSamples / OUTPUT_SAMPLE_RATE) * 1000;
    session.telemetry.outputQueueCurrentDurationMs = durationMs;
    session.telemetry.outputQueuePeakDurationMs = Math.max(
      session.telemetry.outputQueuePeakDurationMs,
      durationMs,
    );
    const peakSamples = safeInteger(metrics.peakQueuedSamples);
    if (metrics.peakQueuedSamples !== undefined) {
      const peakDurationMs = (Math.max(queuedSamples, peakSamples) / OUTPUT_SAMPLE_RATE) * 1000;
      if (Number.isFinite(peakDurationMs) && peakDurationMs >= 0) {
        session.telemetry.outputQueuePeakDurationMs = Math.max(
          session.telemetry.outputQueuePeakDurationMs,
          peakDurationMs,
        );
      }
    }
    const baselineUnderruns = safeInteger(session.telemetry.outputBaseline?.underruns);
    const underruns = Math.max(0, safeInteger(metrics.underruns) - baselineUnderruns);
    session.telemetry.underruns = Math.max(session.telemetry.underruns, underruns);
    if (metrics.underrunSamples !== undefined) {
      const baselineSamples = safeInteger(session.telemetry.outputBaseline?.underrunSamples);
      const samples = Math.max(0, safeInteger(metrics.underrunSamples) - baselineSamples);
      session.telemetry.underrunSamples = Math.max(
        safeInteger(session.telemetry.underrunSamples),
        samples,
      );
    }
    if (metrics.safetyDrops !== undefined) {
      const baselineSafety = safeInteger(session.telemetry.outputBaseline?.safetyDrops);
      const childSafety = Math.max(0, safeInteger(metrics.safetyDrops) - baselineSafety);
      const mergedSafety = Math.max(
        safeInteger(session.metrics.outputSafetyDrops),
        childSafety,
      );
      session.metrics.outputSafetyDrops = mergedSafety;
      session.telemetry.outputSafetyDrops = mergedSafety;
    } else {
      session.telemetry.outputSafetyDrops = Math.max(
        safeInteger(session.telemetry.outputSafetyDrops),
        safeInteger(session.metrics.outputSafetyDrops),
      );
    }
  }

  _handlePlaybackAccepted(session, details = {}) {
    if (!this._isCurrentSession(session) || details?.accepted === false) return;
    this._markMilestone(session, 'firstTranslatedAudioAcceptedByPlayback');
    try {
      this.onPlaybackAccepted?.({
        accepted: true,
        sampleCount: safeInteger(details?.sampleCount),
      });
    } catch {
      // Playback telemetry callbacks must never affect audio or cleanup.
    }
  }

  /**
   * Provider-managed playback acceptance. Valid only for media-stream
   * providers that play translated audio themselves; a pcm provider must
   * never claim playback through this callback (the player owns the
   * milestone there). Same milestone semantics, generation-fenced like
   * every provider callback, and free of media objects.
   */
  _handleProviderPlaybackAccepted(session, generation, details = {}) {
    if (!this._isCurrentProvider(session, generation)) return;
    if (session.audioMode !== LIVE_DUBBING_AUDIO_MODES.MEDIA_STREAM) return;
    this._handlePlaybackAccepted(session, details);
  }

  _handleProviderAudio(session, generation, audioBytes) {
    if (!this._isCurrentProvider(session, generation) || !session.setupComplete) return;
    try {
      this._markMilestone(session, 'firstTranslatedAudioReceived');
      const metadata = {
        epoch: session.outputEpoch,
        sequence: ++session.outputSequence,
      };
      const result = session.audioEngine
        ? session.audioEngine.enqueuePcm16(audioBytes, metadata)
        : session.outputPlayer?.enqueuePcm16(audioBytes, metadata);
      session.metrics.outputChunks += 1;
      session.metrics.outputBytes += audioBytes?.byteLength || 0;
      session.telemetry.translatedAudioChunks = safeInteger(session.metrics.outputChunks);
      if (result?.accepted === false) {
        session.metrics.outputSafetyDrops += 1;
        session.telemetry.outputSafetyDrops = Math.max(
          safeInteger(session.telemetry.outputSafetyDrops),
          session.metrics.outputSafetyDrops,
        );
      }
    } catch (error) {
      this._providerFailed(session, error, 'OUTPUT_AUDIO_ERROR');
    }
  }

  _handleProviderTranslatedTranscript(session, generation, transcript) {
    this._handleProviderTranscript(session, generation, transcript);
  }

  _handleProviderOriginalTranscript(session, generation, transcript) {
    this._handleProviderTranscript(session, generation, transcript);
  }

  _handleProviderTranscript(session, generation, transcript) {
    if (!this._isCurrentProvider(session, generation)
      || !session.setupComplete) return;

    const normalized = sanitizeLiveDubbingTranscript(transcript);
    if (!normalized) return;

    let message;
    try {
      const transcriptSequence = Number.isSafeInteger(session.transcriptSequence)
        && session.transcriptSequence >= 0
        ? session.transcriptSequence + 1
        : 1;
      session.transcriptSequence = transcriptSequence;
      const transcriptDescriptor = session.status === LIVE_DUBBING_STATUS.CONNECTING_PROVIDER
        ? { ...session, eventSequence: session.eventSequence + 1 }
        : session;
      message = createLiveDubbingTranscriptMessage(
        transcriptDescriptor,
        normalized,
        transcriptSequence,
      );
      const result = this.notifyTranscript(message);
      Promise.resolve(result).catch(() => {});
    } catch {
      // Transcript delivery is best effort and never changes session lifecycle.
    }
  }

  _handleProviderInterrupted(session, generation) {
    if (!this._isCurrentProvider(session, generation) || !session.setupComplete) return;
    session.telemetry.interruptions += 1;
    session.outputEpoch += 1;
    if (session.audioEngine) session.audioEngine.resetEpoch(session.outputEpoch);
    else session.outputPlayer?.resetEpoch?.(session.outputEpoch);
  }

  _handleProviderError(session, generation, error, providerDiagnostic = null) {
    if (!this._isCurrentProvider(session, generation)) return;
    const reason = PROVIDER_AUDIO_TERMINAL_REASONS.has(error?.providerReason)
      ? error.providerReason
      : 'PROVIDER_ERROR';
    this._providerFailed(session, error, reason, providerDiagnostic);
  }

  _handleProviderClose(session, generation, details = {}, providerDiagnostic = null) {
    if (!this._isCurrentProvider(session, generation) || session.disposing) return;
    this._providerFailed(session, Object.assign(new Error('Live dubbing provider connection closed'), {
      code: 'LIVE_DUBBING_PROVIDER_CLOSED',
    }), 'PROVIDER_CLOSED', providerDiagnostic, details);
  }

  _handleProviderTerminal(session, generation, reason, details = {}, providerDiagnostic = null) {
    if (!this._isCurrentProvider(session, generation)) return;
    providerDiagnostic ||= details?.providerDiagnostic;
    this._providerFailed(session, Object.assign(new Error('Live dubbing provider requested termination'), {
      code: reason,
    }), reason, providerDiagnostic);
  }

  _providerFailed(session, error, reason, providerDiagnostic = null, closeDetails = {}) {
    if (!this._isCurrentSession(session) || session.disposing) return;
    this._latchProviderDiagnostic(session, providerDiagnostic, {
      code: errorCode(error, `LIVE_DUBBING_${reason}`),
      closeCode: closeDetails?.code,
      wasClean: closeDetails?.wasClean,
      terminalCategory: reason,
      wsOpen: session.telemetry.milestones.wsOpen !== null,
      setupSent: session.telemetry.milestones.setupSent !== null,
      setupComplete: session.setupComplete,
    });
    session.status = LIVE_DUBBING_STATUS.ERROR;
    session.lastError = errorCode(error, `LIVE_DUBBING_${reason}`);
    session.telemetry.providerTerminalCategory = errorCode({ code: reason }, 'PROVIDER_ERROR');
    session.terminalRequested = true;
    const cleanupDiagnostic = this._createCleanupDiagnostic(session);
    this._notifyTerminal(session, reason, cleanupDiagnostic);
    this._cleanupSessionResources(session, cleanupDiagnostic);
  }

  _latchProviderDiagnostic(session, diagnostic, fallback = {}) {
    if (session.providerDiagnostic) return session.providerDiagnostic;
    session.providerDiagnostic = sanitizeLiveDubbingProviderDiagnostic(diagnostic)
      || createLiveDubbingProviderDiagnostic(fallback);
    return session.providerDiagnostic;
  }

  _handlePipelineError(session, error, reason) {
    if (!this._isCurrentSession(session) || session.disposing) return;
    if (reason === 'OUTPUT_PIPELINE_ERROR'
      && error?.code === 'OUTPUT_AUDIO_QUEUE_SAFETY_LIMIT') {
      session.metrics.outputSafetyDrops += 1;
      session.telemetry.outputSafetyDrops = Math.max(
        safeInteger(session.telemetry.outputSafetyDrops),
        session.metrics.outputSafetyDrops,
      );
      return;
    }
    this._providerFailed(session, error, reason);
  }

  _getLiveAudioTracks(stream) {
    if (typeof stream?.getAudioTracks === 'function') {
      return stream.getAudioTracks().filter(track => track?.readyState === 'live');
    }
    return getTracks(stream).filter(track => track?.kind === 'audio' && track.readyState === 'live');
  }

  _addTrackListeners(session, tracks) {
    for (const track of tracks) {
      const handler = () => this._handleTrackEnded(session);
      if (typeof track.addEventListener === 'function') {
        track.addEventListener('ended', handler);
        session.listeners.push({ track, handler, mode: 'event' });
      } else if ('onended' in track) {
        const previous = track.onended;
        track.onended = handler;
        session.listeners.push({ track, handler, previous, mode: 'property' });
      }
    }
  }

  _removeTrackListeners(session) {
    for (const listener of session.listeners) {
      try {
        if (listener.mode === 'event') listener.track.removeEventListener?.('ended', listener.handler);
        else if (listener.track.onended === listener.handler) listener.track.onended = listener.previous || null;
      } catch {
        // Listener cleanup is best effort and must not block track stopping.
      }
    }
    session.listeners = [];
  }

  _handleTrackEnded(session) {
    if (!this._isCurrentSession(session) || session.terminalRequested || session.disposing) return;
    if (![
      LIVE_DUBBING_INTERNAL_STATUS.CAPTURING,
      LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
      LIVE_DUBBING_STATUS.RUNNING,
    ].includes(session.status)) return;
    if (this._getLiveAudioTracks(session.stream).length > 0) return;
    session.status = LIVE_DUBBING_STATUS.ERROR;
    session.lastError = 'LIVE_DUBBING_CAPTURE_TRACK_ENDED';
    session.terminalRequested = true;
    const cleanupDiagnostic = this._createCleanupDiagnostic(session);
    this._notifyTerminal(session, 'TRACK_ENDED', cleanupDiagnostic);
    this._cleanupSessionResources(session, cleanupDiagnostic);
  }

  _notifyTerminal(session, event, cleanupDiagnostic = null) {
    if (session.terminalSent) return;
    session.terminalSent = true;
    const providerDiagnostic = session.providerDiagnostic
      ? sanitizeLiveDubbingProviderDiagnostic(session.providerDiagnostic)
      : null;
    const safeCleanupDiagnostic = cleanupDiagnostic
      ? sanitizeLiveDubbingCleanupDiagnostic(cleanupDiagnostic)
      : null;
    if (providerDiagnostic) Object.freeze(providerDiagnostic);
    if (safeCleanupDiagnostic) Object.freeze(safeCleanupDiagnostic);
    const data = Object.freeze({
      sessionId: session.sessionId,
      providerId: session.providerId,
      eventSequence: session.eventSequence,
      status: session.status,
      event,
      error: session.lastError,
      ...(providerDiagnostic ? { providerDiagnostic } : {}),
      ...(safeCleanupDiagnostic ? { cleanupDiagnostic: safeCleanupDiagnostic } : {}),
    });
    const payload = Object.freeze({
      action: LIVE_DUBBING_ACTIONS.TERMINAL,
      data,
    });
    const delivery = {
      payload,
      attempts: 0,
      timerId: null,
      cancelled: false,
      delivered: false,
    };
    session.terminalDelivery = delivery;
    this._attemptTerminalNotification(session, delivery);
  }

  _attemptTerminalNotification(session, delivery) {
    if (session.terminalDelivery !== delivery || delivery.cancelled || this.currentSession !== session) return;
    delivery.attempts += 1;
    let result;
    try {
      result = this.notify(delivery.payload);
    } catch {
      this._scheduleTerminalNotificationRetry(session, delivery);
      return;
    }
    Promise.resolve(result).then(
      () => {
        if (session.terminalDelivery !== delivery || delivery.cancelled || this.currentSession !== session) return;
        delivery.delivered = true;
      },
      () => {
        if (session.terminalDelivery !== delivery || delivery.cancelled || this.currentSession !== session) return;
        this._scheduleTerminalNotificationRetry(session, delivery);
      },
    );
  }

  _scheduleTerminalNotificationRetry(session, delivery) {
    if (session.terminalDelivery !== delivery || delivery.cancelled || this.currentSession !== session) return;
    if (delivery.attempts >= TERMINAL_NOTIFICATION_MAX_ATTEMPTS) {
      try {
        this.log?.debug?.('Live dubbing terminal notification delivery exhausted', { attempts: 3 });
      } catch {
        // Delivery diagnostics must never affect local cleanup.
      }
      return;
    }
    const delay = TERMINAL_NOTIFICATION_RETRY_DELAYS_MS[delivery.attempts - 1];
    delivery.timerId = setTimeout(() => {
      delivery.timerId = null;
      if (session.terminalDelivery !== delivery || delivery.cancelled || this.currentSession !== session) return;
      this._attemptTerminalNotification(session, delivery);
    }, delay);
  }

  _cancelTerminalNotification(session) {
    const delivery = session?.terminalDelivery;
    if (!delivery) return;
    delivery.cancelled = true;
    if (delivery.timerId !== null) {
      clearTimeout(delivery.timerId);
      delivery.timerId = null;
    }
  }

  _isCurrentSession(session) {
    return this.currentSession === session
      && this.currentSession.sessionId === session.sessionId
      && !session.disposing
      && !session.terminalRequested;
  }

  _isCurrentProvider(session, generation) {
    return this._isCurrentProviderGeneration(session, generation)
      && session.providerClient !== null;
  }

  _isCurrentProviderGeneration(session, generation) {
    return this._isCurrentSession(session)
      && !session.disposing
      && session.providerGeneration === generation;
  }

  _isCurrentOriginalVolumeRequest(session, sessionId, providerId, eventSequence, requestToken) {
    return this._isCurrentSession(session)
      && this.currentSession === session
      && session.sessionId === sessionId
      && session.providerId === providerId
      && session.eventSequence === eventSequence
      && session.originalVolumeRequestToken === requestToken;
  }

  _isCurrentDubbedVolumeRequest(session, sessionId, providerId, eventSequence, requestToken) {
    return this._isCurrentSession(session)
      && this.currentSession === session
      && session.sessionId === sessionId
      && session.providerId === providerId
      && session.eventSequence === eventSequence
      && session.dubbedVolumeRequestToken === requestToken;
  }

  _invalidProvider(sessionId) {
    return {
      success: false,
      error: 'LIVE_DUBBING_PROVIDER_UNSUPPORTED',
      ignored: true,
      sessionId: isSessionId(sessionId) ? sessionId : null,
    };
  }

  _sessionMismatch(sessionId, providerId, session) {
    const requestedSessionId = isSessionId(sessionId) ? sessionId : null;
    const requestedProviderId = isProviderId(providerId) ? providerId : null;
    return {
      success: false,
      error: 'LIVE_DUBBING_SESSION_MISMATCH',
      ignored: true,
      sessionId: requestedSessionId,
      providerId: requestedProviderId,
      requestedSessionId,
      actualSessionId: session?.sessionId || null,
      requestedProviderId,
      actualProviderId: session?.providerId || null,
      status: session?.status || IDLE_STATUS,
    };
  }

  _sequenceMismatch(sessionId, session, providerId = session?.providerId) {
    return {
      success: false,
      error: 'LIVE_DUBBING_EVENT_SEQUENCE_MISMATCH',
      ignored: true,
      sessionId,
      providerId: isProviderId(providerId) ? providerId : null,
      eventSequence: session?.eventSequence ?? 0,
      status: session?.status || IDLE_STATUS,
    };
  }

  _requiredEventSequence(sessionId, eventSequence, providerId) {
    if (isEventSequence(eventSequence)) return null;
    const session = this.currentSession?.sessionId === sessionId
      && this.currentSession.providerId === providerId
      ? this.currentSession
      : null;
    return this._sequenceMismatch(sessionId, session, providerId);
  }
}

export const liveDubbingController = new LiveDubbingController();
