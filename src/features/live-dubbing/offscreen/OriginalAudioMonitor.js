/**
 * Component-only original-audio monitor for live dubbing.
 *
 * Plays the borrowed capture MediaStream audibly through its own independent
 * graph: MediaStreamSource -> GainNode -> AudioContext.destination. This path
 * is fully separate from the TabAudioPipeline zero-gain/silence capture path:
 * no worklet, no framing, no forced sample rate.
 *
 * The context uses the browser native rate. No fixed sample rate is requested
 * so original audio is never resampled by this monitor.
 *
 * Ownership boundary: the stream is borrowed. This monitor never stops tracks,
 * never adds track listeners, and knows nothing about sessions, providers,
 * event sequences, controllers, engines, or terminal semantics. Cleanup closes
 * only the graph and context this monitor created.
 */

const VOLUME_MIN = 0;
const VOLUME_MAX = 1;
const DEFAULT_VOLUME = 0;

function createAudioError(code, message, fields = {}) {
  const error = new Error(message);
  error.name = 'LiveDubbingAudioError';
  error.code = code;
  Object.assign(error, fields);
  return error;
}

function getAudioContextFactory(options) {
  if (typeof options.audioContextFactory === 'function') return options.audioContextFactory;
  if (typeof options.contextFactory === 'function') return options.contextFactory;

  const AudioContextConstructor = options.AudioContext
    || globalThis.AudioContext
    || globalThis.webkitAudioContext;
  if (typeof AudioContextConstructor !== 'function') return null;

  return contextOptions => new AudioContextConstructor(contextOptions);
}

/**
 * Single volume policy for constructor/start/setVolume. Gain is a normalized
 * 0-1 ratio, never a percentage: 0 is silence, 1 is the unmodified source.
 */
function normalizeVolume(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < VOLUME_MIN || value > VOLUME_MAX) {
    throw new RangeError('volume must be a finite number between 0 and 1');
  }
  return value;
}

function disconnect(node) {
  try {
    node?.disconnect?.();
  } catch {
    // Audio graph cleanup is best effort; the context is still closed below.
  }
}

async function closeContext(context) {
  try {
    await context?.close?.();
  } catch {
    // Contexts can already be closed when a setup step fails.
  }
}

/**
 * Audible monitor for the original (untranslated) capture audio. Works with
 * any borrowed MediaStream, so it applies equally to Gemini PCM and OpenAI
 * media-stream captures without provider assumptions.
 */
export class OriginalAudioMonitor {
  constructor(options = {}) {
    this.audioContextFactory = getAudioContextFactory(options);
    // Only an omitted volume defaults to silence; explicit null is invalid.
    this.volume = normalizeVolume(options.volume === undefined ? DEFAULT_VOLUME : options.volume);
    this.state = 'idle';
    this.context = null;
    this.source = null;
    this.gain = null;
    this.stream = null;
    this._startPromise = null;
    this.generation = 0;
  }

  /**
   * Start monitoring the borrowed stream. Idempotent while running and while
   * starting: repeat calls reuse the single pending promise, graph, and
   * context. A provided volume is always normalized first (same RangeError
   * policy), stored as the requested volume, and applied immediately when a
   * gain node already exists; otherwise the pending startup applies the
   * latest stored volume when it creates the gain node.
   */
  async start(stream, volume = undefined) {
    if (volume !== undefined) {
      const normalized = normalizeVolume(volume);
      this.volume = normalized;
      if (this.gain) this._applyVolume(this.gain, normalized);
    }
    if (this.state === 'running') {
      return this.getGraphInfo();
    }
    if (this._startPromise) return this._startPromise;
    if (!stream) throw new TypeError('A MediaStream is required for monitoring');
    if (typeof this.audioContextFactory !== 'function') {
      throw createAudioError('ORIGINAL_AUDIO_CONTEXT_UNAVAILABLE', 'AudioContext is unavailable');
    }

    this.state = 'starting';
    this.stream = stream;
    const generation = ++this.generation;
    this._startPromise = this._start(stream, generation);
    try {
      return await this._startPromise;
    } finally {
      this._startPromise = null;
    }
  }

  async _start(stream, generation) {
    try {
      // Native rate on purpose: no sampleRate is requested so the browser
      // keeps its default and original audio is never resampled here.
      this.context = await this.audioContextFactory();
      this._assertCurrentGeneration(generation);

      if (typeof this.context.createMediaStreamSource !== 'function'
        || typeof this.context.createGain !== 'function'
        || !this.context.destination) {
        throw createAudioError('ORIGINAL_AUDIO_GRAPH_UNAVAILABLE', 'Monitor audio graph is unavailable');
      }

      this.source = this.context.createMediaStreamSource(stream);
      this.gain = this.context.createGain();
      this._applyVolume(this.gain, this.volume);

      this.source.connect(this.gain);
      this.gain.connect(this.context.destination);

      await this.context.resume?.();
      this._assertCurrentGeneration(generation);
      this.state = 'running';
      return this.getGraphInfo();
    } catch (error) {
      await this._teardown();
      this.state = 'idle';
      throw error;
    }
  }

  /**
   * Update the monitor gain without rebuilding the graph. Before start the
   * value is stored and applied when the gain node is created.
   */
  setVolume(volume) {
    const normalized = normalizeVolume(volume);
    this.volume = normalized;
    if (this.gain) this._applyVolume(this.gain, normalized);
    return this.volume;
  }

  getVolume() {
    return this.volume;
  }

  getGraphInfo() {
    return {
      state: this.state,
      volume: this.volume,
    };
  }

  async stop() {
    this.generation += 1;
    await this._teardown();
    this.state = 'idle';
  }

  /**
   * Primary path is setValueAtTime; the direct value assignment is only a
   * fallback when setValueAtTime is missing or throws.
   */
  _applyVolume(gainNode, volume) {
    const gain = gainNode?.gain;
    if (!gain) return;
    if (typeof gain.setValueAtTime === 'function') {
      try {
        gain.setValueAtTime(volume, this.context?.currentTime || 0);
        return;
      } catch {
        // Fall through to the direct value fallback below.
      }
    }
    gain.value = volume;
  }

  async _teardown() {
    const source = this.source;
    const gain = this.gain;
    const context = this.context;

    this.source = null;
    this.gain = null;
    this.context = null;
    this.stream = null;

    disconnect(source);
    disconnect(gain);
    await closeContext(context);
  }

  _assertCurrentGeneration(generation) {
    if (this.generation !== generation) {
      throw createAudioError('ORIGINAL_AUDIO_START_CANCELLED', 'Monitor setup was cancelled');
    }
  }
}

export default OriginalAudioMonitor;
