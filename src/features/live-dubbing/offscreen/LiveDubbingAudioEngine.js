import { LIVE_DUBBING_AUDIO_MODES } from '../constants.js';
import { TabAudioPipeline } from './TabAudioPipeline.js';
import { PcmOutputPlayer } from './PcmOutputPlayer.js';
import { OriginalAudioMonitor } from './OriginalAudioMonitor.js';

const AUDIO_PIPELINES_UNAVAILABLE = 'LIVE_DUBBING_AUDIO_PIPELINES_UNAVAILABLE';
const DEFAULT_ORIGINAL_VOLUME = 0;

function getCallback(options, callbacks, name) {
  return options[name] || callbacks?.[name] || null;
}

function getAudioContextOptions(options) {
  const contextOptions = {};
  for (const name of ['audioContextFactory', 'contextFactory', 'AudioContext']) {
    if (options[name] !== undefined) contextOptions[name] = options[name];
  }
  return contextOptions;
}

function invokeCallback(callback, ...args) {
  try {
    callback?.(...args);
  } catch {
    // Observational callbacks must not change local graph behavior.
  }
}

/**
 * Original-monitor gain policy, mirroring the monitor semantics: a normalized
 * 0-1 ratio, never a percentage. The monitor re-validates on creation and
 * volume updates, so this identical check only fails fast at the engine
 * boundary with the same RangeError.
 */
function normalizeOriginalVolume(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError('volume must be a finite number between 0 and 1');
  }
  return value;
}

/**
 * Owns only the local audio graphs used by live dubbing. The controller keeps
 * capture-stream ownership and all session/provider semantics outside this
 * boundary.
 *
 * Optionally owns one OriginalAudioMonitor for audible original audio. The
 * monitor is purely local playback of the borrowed stream in both audio
 * modes, defaults to silence (absent), and never affects readiness, PCM
 * transport, or provider handoff.
 */
export class LiveDubbingAudioEngine {
  constructor(options = {}) {
    const callbacks = options.callbacks || {};
    const contextOptions = getAudioContextOptions(options);

    this.audioMode = options.audioMode || options.mode || null;
    this.enabled = options.enabled ?? options.requirePipelines ?? true;
    this.callbacks = {
      onFrame: getCallback(options, callbacks, 'onFrame'),
      onError: getCallback(options, callbacks, 'onError'),
      onInputError: getCallback(options, callbacks, 'onInputError')
        || getCallback(options, callbacks, 'onError'),
      onOutputError: getCallback(options, callbacks, 'onOutputError')
        || getCallback(options, callbacks, 'onError'),
      onMetrics: getCallback(options, callbacks, 'onMetrics'),
      onPlaybackAccepted: getCallback(options, callbacks, 'onPlaybackAccepted'),
      onInputReady: getCallback(options, callbacks, 'onInputReady'),
      onOutputReady: getCallback(options, callbacks, 'onOutputReady'),
      onOutputCreated: getCallback(options, callbacks, 'onOutputCreated'),
    };

    this.inputPipelineFactory = options.inputPipelineFactory
      || options.tabAudioPipelineFactory
      || options.createInputPipeline
      || null;
    this.outputPlayerFactory = options.outputPlayerFactory
      || options.pcmOutputPlayerFactory
      || options.createOutputPlayer
      || null;
    this.configuredInputPipeline = options.inputPipeline || null;
    this.configuredOutputPlayer = options.outputPlayer || null;
    this.originalAudioMonitorFactory = options.originalAudioMonitorFactory
      || options.createOriginalAudioMonitor
      || null;
    this.configuredOriginalAudioMonitor = options.originalAudioMonitor || null;
    this.inputPipelineOptions = {
      ...contextOptions,
      ...(options.inputPipelineOptions || options.tabAudioPipelineOptions || {}),
    };
    this.outputPlayerOptions = {
      ...contextOptions,
      ...(options.outputPlayerOptions || options.pcmOutputPlayerOptions || {}),
    };
    // Only AudioContext-compatible seams reach the monitor: never a capture
    // sample rate, so the monitor context always stays native-rate.
    this.originalMonitorOptions = { ...contextOptions };
    // Only an omitted volume defaults to silence; explicit null and any
    // other invalid value throw the same RangeError as the setter/monitor.
    this.originalVolume = normalizeOriginalVolume(
      options.originalVolume !== undefined
        ? options.originalVolume
        : options.originalAudioVolume !== undefined
          ? options.originalAudioVolume
          : DEFAULT_ORIGINAL_VOLUME,
    );

    this.inputPipeline = null;
    this.outputPlayer = null;
    this.originalAudioMonitor = null;
    this.monitorStream = null;
    this._monitorStartPromise = null;
    this._pendingOriginalMonitor = null;
    this._pendingOriginalGeneration = null;
    this._pendingOriginalAttempt = null;
    this._attachedOriginalAttempt = null;
    this._monitorGeneration = 0;
    this._monitorAttempt = 0;
    // Attempt IDs already stopped. Keyed by attempt token (not monitor
    // identity): one attempt stops at most once, stopping B never forgets
    // A, and a later legitimate attempt C with the same object still stops
    // once. Tokens are released when their attempt settles (see below), so
    // the set holds only in-flight or recently-stopped-unsettled attempts.
    this._stoppedOriginalAttempts = new Set();
    this.readiness = {
      audioPathReady: false,
      inputPipelineReady: false,
      outputPipelineReady: false,
    };
    this.state = 'idle';
    this._startPromise = null;
    this._stopPromise = null;
    this._stopping = false;
    this._outputCleared = false;
    this._stoppedInputPipeline = null;
    this._stoppedOutputPlayer = null;
  }

  async start(stream, mode = this.audioMode) {
    if (stream && typeof stream === 'object' && 'stream' in stream) {
      mode = stream.audioMode || stream.mode || mode;
      stream = stream.stream;
    } else if (mode && typeof mode === 'object') {
      mode = mode.audioMode || mode.mode || this.audioMode;
    }

    if (this.state === 'running' || this.state === 'ready') return this.getReadiness();
    if (this._startPromise) return this._startPromise;
    if (this._stopPromise) {
      await this._stopPromise;
      // A concurrent caller may have restarted while we awaited: join its
      // lifecycle instead of starting twice.
      if (this.state === 'running' || this.state === 'ready') return this.getReadiness();
      if (this._startPromise) return this._startPromise;
      this._stopPromise = null;
    }
    if (mode !== LIVE_DUBBING_AUDIO_MODES.PCM
      && mode !== LIVE_DUBBING_AUDIO_MODES.MEDIA_STREAM) {
      throw Object.assign(new Error('Live dubbing provider audio mode is unsupported'), {
        code: 'LIVE_DUBBING_AUDIO_MODE_UNSUPPORTED',
      });
    }
    if (mode === LIVE_DUBBING_AUDIO_MODES.PCM && !stream) {
      throw new TypeError('A MediaStream is required for local audio');
    }

    // New lifecycle commit point: re-arm per-resource stop guards so reused
    // injected or configured pipelines are eligible for cleanup again. This
    // stays after validation so a rejected start cannot re-arm already
    // cleaned resources. The monitor stop record is intentionally NOT reset
    // here: a stale attempt from the previous lifecycle may still be pending
    // and its cleanup must remain idempotent.
    this._stoppedInputPipeline = null;
    this._stoppedOutputPlayer = null;
    this.audioMode = mode;
    this._stopping = false;
    this._outputCleared = false;
    this.state = 'starting';
    this._startPromise = this._startWithMonitor(stream, mode);
    try {
      return await this._startPromise;
    } finally {
      this._startPromise = null;
    }
  }

  async _startWithMonitor(stream, mode) {
    const readiness = mode === LIVE_DUBBING_AUDIO_MODES.MEDIA_STREAM
      ? await this._startMediaStreamPath()
      : await this._startPcmPath(stream);
    if (stream) this.monitorStream = stream;
    // A pre-start original volume above silence is explicit configuration:
    // apply it as part of startup. Silence stays monitor-free.
    if (this.originalVolume > 0 && this.monitorStream && !this._stopping) {
      try {
        await this._ensureOriginalMonitor();
      } catch (error) {
        await this._stopResources();
        this.state = 'idle';
        throw error;
      }
    }
    return readiness;
  }

  async _startMediaStreamPath() {
    this.readiness = {
      audioPathReady: true,
      inputPipelineReady: false,
      outputPipelineReady: false,
    };
    this.state = 'ready';
    return this.getReadiness();
  }

  async _startPcmPath(stream) {
    if (!this.enabled) {
      this.readiness = {
        audioPathReady: true,
        inputPipelineReady: false,
        outputPipelineReady: false,
      };
      this.state = 'ready';
      return this.getReadiness();
    }

    try {
      this.inputPipeline = await this._createInputPipeline();
      if (!this.inputPipeline) throw this._pipelinesUnavailableError();
      if (this._stopping) throw this._startCancelledError();

      this.outputPlayer = await this._createOutputPlayer();
      if (!this.outputPlayer) throw this._pipelinesUnavailableError();
      if (this._stopping) throw this._startCancelledError();

      const inputStart = Promise.resolve(this.inputPipeline.start?.(stream)).then(() => {
        invokeCallback(this.callbacks.onInputReady);
      });
      const outputStart = Promise.resolve(this.outputPlayer.start?.()).then(() => {
        invokeCallback(this.callbacks.onOutputReady);
      });
      await Promise.all([inputStart, outputStart]);
      if (this._stopping) throw this._startCancelledError();

      this.readiness = {
        audioPathReady: true,
        inputPipelineReady: true,
        outputPipelineReady: true,
      };
      this.state = 'running';
      return this.getReadiness();
    } catch (error) {
      await this._stopResources();
      this.state = 'idle';
      throw error;
    }
  }

  async _createInputPipeline() {
    const callbacks = {
      onFrame: this.callbacks.onFrame,
      onError: this.callbacks.onInputError,
    };
    let pipeline = this.configuredInputPipeline;
    if (!pipeline && typeof this.inputPipelineFactory === 'function') {
      pipeline = await this.inputPipelineFactory(callbacks);
    }
    if (!pipeline) {
      pipeline = new TabAudioPipeline({
        ...this.inputPipelineOptions,
        stopStreamOnCleanup: false,
        ...callbacks,
      });
    }
    if (pipeline instanceof TabAudioPipeline) pipeline.stopStreamOnCleanup = false;
    if (typeof this.callbacks.onFrame === 'function') pipeline.onFrame = this.callbacks.onFrame;
    if (typeof this.callbacks.onInputError === 'function') {
      pipeline.onError = this.callbacks.onInputError;
    }
    return pipeline;
  }

  async _createOutputPlayer() {
    const callbacks = {
      onError: this.callbacks.onOutputError,
      onMetrics: this.callbacks.onMetrics,
      onPlaybackAccepted: this.callbacks.onPlaybackAccepted,
    };
    let player = this.configuredOutputPlayer;
    if (!player && typeof this.outputPlayerFactory === 'function') {
      player = await this.outputPlayerFactory(callbacks);
    }
    if (!player) player = new PcmOutputPlayer({ ...this.outputPlayerOptions, ...callbacks });
    if (typeof this.callbacks.onOutputError === 'function') {
      player.onError = this.callbacks.onOutputError;
    }
    if (typeof this.callbacks.onMetrics === 'function') player.onMetrics = this.callbacks.onMetrics;
    if (typeof this.callbacks.onPlaybackAccepted === 'function') {
      player.onPlaybackAccepted = this.callbacks.onPlaybackAccepted;
    }
    invokeCallback(this.callbacks.onOutputCreated, player);
    return player;
  }

  /**
   * Set the audible original-audio gain. Async because a non-zero volume
   * after an active start lazily creates and starts the monitor. Silence
   * never creates a monitor: without one the value is only stored, with a
   * live or starting monitor it mutes that same instance at gain 0. Before
   * any start (or after stop) the value is only stored for a later start.
   * Rejects with the same RangeError policy as the monitor for invalid
   * volumes, and with the monitor failure when lazy startup fails.
   */
  async setOriginalVolume(volume) {
    const normalized = normalizeOriginalVolume(volume);
    this.originalVolume = normalized;
    if (normalized === 0) {
      let monitor = this.originalAudioMonitor;
      const pending = !monitor ? this._monitorStartPromise : null;
      if (pending) {
        try {
          monitor = await pending;
        } catch {
          monitor = null;
        }
      }
      // Latest wins: a newer non-zero request may have superseded this mute
      // while the startup was pending.
      if (this.originalVolume === 0) monitor?.setVolume?.(0);
      return normalized;
    }
    const active = (this.state === 'running' || this.state === 'ready')
      && !this._stopping
      && Boolean(this.monitorStream);
    if (!active) return normalized;
    const monitor = await this._ensureOriginalMonitor();
    // Latest wins: skip a stale application when a newer volume (often a
    // mute) was stored while the startup was pending.
    if (this.originalVolume === normalized) monitor.setVolume?.(normalized);
    return normalized;
  }

  getOriginalVolume() {
    return this.originalVolume;
  }

  async _createOriginalMonitor() {
    if (this.configuredOriginalAudioMonitor) return this.configuredOriginalAudioMonitor;
    if (typeof this.originalAudioMonitorFactory === 'function') {
      const created = await this.originalAudioMonitorFactory({ ...this.originalMonitorOptions });
      if (created) return created;
    }
    return new OriginalAudioMonitor({ ...this.originalMonitorOptions });
  }

  async _ensureOriginalMonitor() {
    if (this.originalAudioMonitor) return this.originalAudioMonitor;
    if (this._monitorStartPromise) return this._monitorStartPromise;
    const stream = this.monitorStream;
    if (!stream) {
      throw Object.assign(new Error('Live dubbing original monitor has no borrowed stream'), {
        code: 'ORIGINAL_AUDIO_STREAM_UNAVAILABLE',
      });
    }
    const generation = this._monitorGeneration;
    const attempt = ++this._monitorAttempt;
    const startPromise = (async () => {
      const monitor = await this._createOriginalMonitor();
      if (generation !== this._monitorGeneration) {
        // A newer generation may already have adopted this exact instance
        // (shared factory/injected monitor): never stop another generation's
        // monitor from a stale closure, but still cancel this stale attempt.
        if (!this._isMonitorAdopted(monitor)) {
          await this._stopMonitorOnce(monitor, attempt);
        }
        throw this._startCancelledError();
      }
      // New start ownership for this attempt. Attempt-scoped stop records
      // already let a retry stop the same reused instance again, so no
      // install-time marker reset is needed (and it must not happen: it
      // would re-arm cleanup for a still-pending stale attempt).
      this._pendingOriginalMonitor = monitor;
      this._pendingOriginalGeneration = generation;
      this._pendingOriginalAttempt = attempt;
      try {
        if (this._stopping) throw this._startCancelledError();
        await monitor.start?.(stream, this.originalVolume);
        if (this._stopping || generation !== this._monitorGeneration) {
          throw this._startCancelledError();
        }
      } catch (error) {
        // A stale post-start cancellation must not stop an instance a newer
        // generation adopted meanwhile; genuine current-generation failures
        // always clean up their own attempt.
        if (generation === this._monitorGeneration || !this._isMonitorAdopted(monitor)) {
          await this._stopMonitorOnce(monitor, attempt);
        }
        throw error;
      } finally {
        // Only the attempt that installed the pending ownership may clear
        // it: a stale closure must not drop a newer generation's slot merely
        // because both use the same monitor object.
        if (this._pendingOriginalMonitor === monitor
          && this._pendingOriginalGeneration === generation
          && this._pendingOriginalAttempt === attempt) {
          this._pendingOriginalMonitor = null;
          this._pendingOriginalGeneration = null;
          this._pendingOriginalAttempt = null;
        }
      }
      this.originalAudioMonitor = monitor;
      this._attachedOriginalAttempt = attempt;
      return monitor;
    })();
    this._monitorStartPromise = startPromise;
    try {
      return await startPromise;
    } finally {
      // A newer generation may have installed its own startup meanwhile:
      // never clear another attempt's pointer.
      if (this._monitorStartPromise === startPromise) this._monitorStartPromise = null;
      // This attempt can no longer issue cleanup once settled: its closure
      // finished, and teardown only ever credits live pending/attached
      // ownership, so release its token to keep the set bounded.
      this._stoppedOriginalAttempts.delete(attempt);
    }
  }

  _isMonitorAdopted(monitor) {
    return Boolean(monitor)
      && (monitor === this._pendingOriginalMonitor || monitor === this.originalAudioMonitor);
  }

  async _stopMonitorOnce(monitor, attempt) {
    if (!monitor) return;
    if (this._stoppedOriginalAttempts.has(attempt)) return;
    this._stoppedOriginalAttempts.add(attempt);
    try {
      await monitor.stop?.();
    } catch {
      // Monitor teardown is best effort and must not block graph teardown.
    }
  }

  /**
   * Fence and stop the monitor without awaiting its startup. A pending
   * factory or monitor start is generation-fenced so its stale product is
   * cleaned and never attached; the live or starting instance gets stop()
   * immediately while its own start settles independently.
   */
  async _teardownOriginalMonitor() {
    this._monitorGeneration += 1;
    const pendingStart = this._monitorStartPromise;
    this._monitorStartPromise = null;
    // Observe settlement so a detached pending startup can never surface as
    // an unhandled rejection; its product is fenced inside _ensureOriginalMonitor.
    if (pendingStart) pendingStart.catch(() => {});
    const pending = this._pendingOriginalMonitor;
    const monitor = pending || this.originalAudioMonitor;
    // Attribute the stop to the attempt that owns the instance, so a later
    // legitimate attempt with the same object still cleans up while a
    // duplicate cleanup for this same attempt stays idempotent.
    const attempt = monitor === pending
      ? this._pendingOriginalAttempt
      : this._attachedOriginalAttempt;
    // An attached attempt's startup already settled, so no closure remains
    // that can issue duplicate cleanup. A pending attempt's stale closure
    // may still run, so its token stays until that promise settles.
    const attached = monitor !== null && monitor !== pending;
    this._pendingOriginalMonitor = null;
    this._pendingOriginalGeneration = null;
    this._pendingOriginalAttempt = null;
    this._attachedOriginalAttempt = null;
    this.originalAudioMonitor = null;
    this.monitorStream = null;
    await this._stopMonitorOnce(monitor, attempt);
    if (attached) this._stoppedOriginalAttempts.delete(attempt);
  }

  getReadiness() {
    return { ...this.readiness };
  }

  getOutputMetrics() {
    try {
      const metrics = this.outputPlayer?.getMetrics?.();
      return metrics && typeof metrics === 'object' ? metrics : null;
    } catch {
      return null;
    }
  }

  enqueuePcm16(value, metadata = {}) {
    return this.outputPlayer?.enqueuePcm16?.(value, metadata);
  }

  resetEpoch(epoch) {
    return this.outputPlayer?.resetEpoch?.(epoch);
  }

  clearOutput() {
    if (!this.outputPlayer || this._outputCleared) return undefined;
    this._outputCleared = true;
    try {
      return this.outputPlayer?.clear?.();
    } catch {
      return undefined;
    }
  }

  async stop() {
    if (this._stopPromise) return this._stopPromise;
    this._stopping = true;
    const startPromise = this._startPromise;
    this._stopPromise = (async () => {
      await this._stopResources();
      // Child stop methods own cancellation of an in-flight graph start. Do
      // not wait for that start promise here: controller cleanup must be able
      // to finish while a browser/worklet startup promise is still pending.
      void Promise.resolve(startPromise).catch(() => {});
      this.state = 'idle';
      this.readiness = {
        audioPathReady: false,
        inputPipelineReady: false,
        outputPipelineReady: false,
      };
    })();
    return this._stopPromise;
  }

  async _stopResources() {
    if (this.outputPlayer && !this._outputCleared) this.clearOutput();

    const resources = [];
    if (this.inputPipeline && this._stoppedInputPipeline !== this.inputPipeline) {
      this._stoppedInputPipeline = this.inputPipeline;
      resources.push(this.inputPipeline);
    }
    if (this.outputPlayer && this._stoppedOutputPlayer !== this.outputPlayer) {
      this._stoppedOutputPlayer = this.outputPlayer;
      resources.push(this.outputPlayer);
    }
    await Promise.allSettled(resources.map(resource => {
      try {
        return Promise.resolve(resource.stop?.());
      } catch (error) {
        return Promise.reject(error);
      }
    }));
    await this._teardownOriginalMonitor();
  }

  _pipelinesUnavailableError() {
    return Object.assign(new Error('Live dubbing audio pipelines are unavailable'), {
      code: AUDIO_PIPELINES_UNAVAILABLE,
    });
  }

  _startCancelledError() {
    return Object.assign(new Error('Live dubbing audio setup was cancelled'), {
      code: 'LIVE_DUBBING_PIPELINE_SETUP_CANCELLED',
    });
  }
}

export default LiveDubbingAudioEngine;
