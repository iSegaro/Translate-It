import { LIVE_DUBBING_AUDIO_MODES } from '../constants.js';
import { TabAudioPipeline } from './TabAudioPipeline.js';
import { PcmOutputPlayer } from './PcmOutputPlayer.js';

const AUDIO_PIPELINES_UNAVAILABLE = 'LIVE_DUBBING_AUDIO_PIPELINES_UNAVAILABLE';

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
 * Owns only the local audio graphs used by live dubbing. The controller keeps
 * capture-stream ownership and all session/provider semantics outside this
 * boundary.
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
    this.inputPipelineOptions = {
      ...contextOptions,
      ...(options.inputPipelineOptions || options.tabAudioPipelineOptions || {}),
    };
    this.outputPlayerOptions = {
      ...contextOptions,
      ...(options.outputPlayerOptions || options.pcmOutputPlayerOptions || {}),
    };

    this.inputPipeline = null;
    this.outputPlayer = null;
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
    if (this._stopPromise) await this._stopPromise;
    if (mode !== LIVE_DUBBING_AUDIO_MODES.PCM
      && mode !== LIVE_DUBBING_AUDIO_MODES.MEDIA_STREAM) {
      throw Object.assign(new Error('Live dubbing provider audio mode is unsupported'), {
        code: 'LIVE_DUBBING_AUDIO_MODE_UNSUPPORTED',
      });
    }
    if (mode === LIVE_DUBBING_AUDIO_MODES.PCM && !stream) {
      throw new TypeError('A MediaStream is required for local audio');
    }

    this.audioMode = mode;
    this._stopping = false;
    this._outputCleared = false;
    this.state = 'starting';
    this._startPromise = mode === LIVE_DUBBING_AUDIO_MODES.MEDIA_STREAM
      ? this._startMediaStreamPath()
      : this._startPcmPath(stream);
    try {
      return await this._startPromise;
    } finally {
      this._startPromise = null;
    }
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
