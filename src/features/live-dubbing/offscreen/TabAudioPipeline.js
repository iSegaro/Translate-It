/* global __LIVE_DUBBING_FRAME_SAMPLES__ */
/**
 * Capture-side audio primitives for live dubbing.
 *
 * The capture context is intentionally fixed-rate. AudioContext is allowed to
 * choose a different rate on some browsers, but accepting that result here
 * would make the source sample clock and the wire format disagree.
 *
 * Canonical input framing lives here as the single source of truth for the
 * offscreen capture boundary. Production default is 100ms (1600 samples at
 * 16kHz). A build-time measurement override may select 40ms (640 samples);
 * any other value falls back to the production default. The resolved value
 * is passed to the capture AudioWorklet via processorOptions.
 */

export const INPUT_SAMPLE_RATE = 16_000;
export const LIVE_DUBBING_FRAME_SAMPLE_OPTIONS = Object.freeze([1_600, 640]);
export const LIVE_DUBBING_DEFAULT_FRAME_SAMPLES = 1_600;

function readFrameSamplesDefine() {
  try {
    if (typeof __LIVE_DUBBING_FRAME_SAMPLES__ !== 'undefined') return __LIVE_DUBBING_FRAME_SAMPLES__;
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Resolve the canonical capture frame size. Accepts only 1600 or 640;
 * undefined/invalid values fall back to 1600 (100ms production default).
 * @param {unknown} [value] Explicit candidate; defaults to the build define.
 * @returns {number} 1600 or 640.
 */
export function resolveLiveDubbingFrameSamples(value = readFrameSamplesDefine()) {
  return LIVE_DUBBING_FRAME_SAMPLE_OPTIONS.includes(value)
    ? value
    : LIVE_DUBBING_DEFAULT_FRAME_SAMPLES;
}

// Resolved once at module load; the single canonical frame config.
export const INPUT_FRAME_SAMPLES = resolveLiveDubbingFrameSamples();
export const CAPTURE_PROCESSOR_NAME = 'live-dubbing-capture-processor';
export const CAPTURE_WORKLET_URL = new URL('./liveDubbingCapture.worklet.js', import.meta.url).href;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeFrameSamples(value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError('frameSamples must be a positive integer');
  }
  return value;
}

function normalizeSampleRate(value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError('sampleRate must be a positive integer');
  }
  return value;
}

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

function getBufferLength(channel) {
  return channel && Number.isInteger(channel.length) ? channel.length : 0;
}

/**
 * Clamp a floating point audio sample to the PCM domain.
 * Non-finite samples are silence rather than an invalid PCM value.
 */
export function clampAudioSample(sample) {
  if (!isFiniteNumber(sample)) return 0;
  return Math.max(-1, Math.min(1, sample));
}

/**
 * Convert one normalized sample using the asymmetric PCM16 range mandated by
 * signed PCM: -1 maps to -32768 and +1 maps to +32767.
 */
export function floatToPcm16(sample) {
  const clamped = clampAudioSample(sample);
  return clamped < 0
    ? Math.round(clamped * 0x8000)
    : Math.round(clamped * 0x7fff);
}

/**
 * Deterministically downmix channel planes by averaging the channel values.
 * Missing values in a short channel are treated as silence.
 */
export function downmixToMono(channels, frameCount = undefined) {
  const channelList = Array.from(channels || []);
  const inferredFrameCount = channelList.reduce(
    (largest, channel) => Math.max(largest, getBufferLength(channel)),
    0,
  );
  const count = frameCount === undefined ? inferredFrameCount : frameCount;
  if (!Number.isInteger(count) || count < 0) {
    throw new TypeError('frameCount must be a non-negative integer');
  }

  const mono = new Float32Array(count);
  if (channelList.length === 0) return mono;

  for (let index = 0; index < count; index += 1) {
    let sum = 0;
    for (const channel of channelList) {
      const value = channel?.[index];
      sum += isFiniteNumber(value) ? value : 0;
    }
    mono[index] = clampAudioSample(sum / channelList.length);
  }
  return mono;
}

/**
 * Encode mono normalized samples as a tightly-sized transferable PCM16 LE
 * ArrayBuffer. This function deliberately does not resample.
 */
export function encodePcm16Le(samples) {
  const source = samples || [];
  const buffer = new ArrayBuffer(source.length * 2);
  const view = new DataView(buffer);
  for (let index = 0; index < source.length; index += 1) {
    view.setInt16(index * 2, floatToPcm16(source[index]), true);
  }
  return buffer;
}

export const encodePcm16LE = encodePcm16Le;

function createFrame(samples, offset, count, sourceSampleStart, sampleRate, partial) {
  const frameSamples = samples.subarray(offset, offset + count);
  const sourceTimeStart = isFiniteNumber(sourceSampleStart)
    ? sourceSampleStart / sampleRate
    : undefined;
  return {
    type: 'pcm',
    buffer: encodePcm16Le(frameSamples),
    sampleRate,
    channels: 1,
    sampleCount: count,
    sourceSampleStart,
    sourceSampleEnd: isFiniteNumber(sourceSampleStart)
      ? sourceSampleStart + count
      : undefined,
    sourceTimeStart,
    sourceTimestamp: sourceTimeStart,
    partial,
  };
}

/**
 * Frame a mono sample block without resampling. The final short frame is
 * retained by default so callers can choose whether to transmit or carry it.
 */
export function frameMonoPcm16(
  samples,
  {
    frameSamples = INPUT_FRAME_SAMPLES,
    sampleRate = INPUT_SAMPLE_RATE,
    sourceSampleStart = 0,
    includePartial = true,
  } = {},
) {
  const normalizedFrameSamples = normalizeFrameSamples(frameSamples);
  const normalizedSampleRate = normalizeSampleRate(sampleRate);
  const source = samples instanceof Float32Array ? samples : Float32Array.from(samples || []);
  const frames = [];
  for (let offset = 0; offset < source.length; offset += normalizedFrameSamples) {
    const count = Math.min(normalizedFrameSamples, source.length - offset);
    const partial = count < normalizedFrameSamples;
    if (partial && !includePartial) break;
    frames.push(createFrame(
      source,
      offset,
      count,
      isFiniteNumber(sourceSampleStart) ? sourceSampleStart + offset : undefined,
      normalizedSampleRate,
      partial,
    ));
  }
  return frames;
}

/**
 * Stateful pure framing helper used by tests and non-worklet integrations.
 */
export class MonoPcm16Framer {
  constructor({
    frameSamples = INPUT_FRAME_SAMPLES,
    sampleRate = INPUT_SAMPLE_RATE,
  } = {}) {
    this.frameSamples = normalizeFrameSamples(frameSamples);
    this.sampleRate = normalizeSampleRate(sampleRate);
    this.pending = new Float32Array(0);
    this.nextSourceSample = null;
  }

  push(samples, { sourceSampleStart = undefined } = {}) {
    const incoming = samples instanceof Float32Array
      ? samples
      : Float32Array.from(samples || []);
    if (incoming.length === 0) return [];

    if (this.nextSourceSample === null) {
      this.nextSourceSample = isFiniteNumber(sourceSampleStart) ? sourceSampleStart : 0;
    }

    const combined = new Float32Array(this.pending.length + incoming.length);
    combined.set(this.pending);
    combined.set(incoming, this.pending.length);

    const frames = [];
    let offset = 0;
    let frameSourceSample = this.nextSourceSample;
    while (combined.length - offset >= this.frameSamples) {
      frames.push(createFrame(
        combined,
        offset,
        this.frameSamples,
        frameSourceSample,
        this.sampleRate,
        false,
      ));
      offset += this.frameSamples;
      frameSourceSample += this.frameSamples;
    }

    this.pending = combined.slice(offset);
    this.nextSourceSample = frameSourceSample;
    return frames;
  }

  flush() {
    if (this.pending.length === 0) return [];
    const frames = [createFrame(
      this.pending,
      0,
      this.pending.length,
      this.nextSourceSample,
      this.sampleRate,
      true,
    )];
    this.pending = new Float32Array(0);
    this.nextSourceSample = null;
    return frames;
  }

  clear() {
    this.pending = new Float32Array(0);
    this.nextSourceSample = null;
  }
}

function isArrayBuffer(value) {
  return value instanceof ArrayBuffer
    || (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer);
}

function getMessageBuffer(data) {
  if (isArrayBuffer(data?.buffer)) return data.buffer;
  if (ArrayBuffer.isView(data?.buffer)) {
    return data.buffer.buffer.slice(
      data.buffer.byteOffset,
      data.buffer.byteOffset + data.buffer.byteLength,
    );
  }
  if (isArrayBuffer(data?.pcm)) return data.pcm;
  if (ArrayBuffer.isView(data?.pcm)) {
    return data.pcm.buffer.slice(
      data.pcm.byteOffset,
      data.pcm.byteOffset + data.pcm.byteLength,
    );
  }
  return null;
}

function disconnect(node) {
  try {
    node?.disconnect?.();
  } catch {
    // Audio graph cleanup is best effort; all owned resources are still closed.
  }
}

function closePort(port) {
  try {
    port?.close?.();
  } catch {
    // MessagePort close is idempotent in browsers but not in all test doubles.
  }
}

function stopStreamTracks(stream) {
  let tracks = [];
  try {
    tracks = typeof stream?.getTracks === 'function' ? stream.getTracks() || [] : [];
  } catch {
    tracks = [];
  }
  const audioTracks = tracks.length > 0 || typeof stream?.getAudioTracks !== 'function'
    ? tracks
    : (() => {
      try {
        return stream.getAudioTracks() || [];
      } catch {
        return [];
      }
    })();
  for (const track of audioTracks) {
    try {
      track?.stop?.();
    } catch {
      // Track cleanup is best effort and must not block graph teardown.
    }
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
 * Verify a context instead of silently accepting browser resampling.
 */
export function verifyInputAudioContext(context, sampleRate = INPUT_SAMPLE_RATE) {
  if (!context || context.sampleRate !== sampleRate) {
    throw createAudioError(
      'INPUT_AUDIO_CONTEXT_SAMPLE_RATE_MISMATCH',
      `Expected input AudioContext at ${sampleRate} Hz`,
      { expectedSampleRate: sampleRate, actualSampleRate: context?.sampleRate },
    );
  }
  return context;
}

/**
 * Owns one tab MediaStream -> capture AudioWorklet graph. The stream is never
 * connected directly to the destination: the only sink is a zero-gain node.
 */
export class TabAudioPipeline {
  constructor(options = {}) {
    if (options.sampleRate !== undefined && options.sampleRate !== INPUT_SAMPLE_RATE) {
      throw createAudioError('INPUT_AUDIO_SAMPLE_RATE_FIXED', 'Capture sample rate is fixed at 16000 Hz');
    }
    if (options.frameSamples !== undefined
      && !LIVE_DUBBING_FRAME_SAMPLE_OPTIONS.includes(options.frameSamples)) {
      throw createAudioError('INPUT_AUDIO_FRAME_SIZE_FIXED', 'Capture frame size is fixed to 1600 or 640 samples');
    }
    this.sampleRate = INPUT_SAMPLE_RATE;
    this.frameSamples = options.frameSamples !== undefined
      ? options.frameSamples
      : INPUT_FRAME_SAMPLES;

    this.audioContextFactory = getAudioContextFactory(options);
    this.audioWorkletNodeFactory = options.audioWorkletNodeFactory
      || options.workletNodeFactory
      || null;
    this.AudioWorkletNode = options.AudioWorkletNode || null;
    this.workletUrl = options.workletUrl || CAPTURE_WORKLET_URL;
    this.processorName = options.processorName || CAPTURE_PROCESSOR_NAME;
    this.onFrame = options.onFrame || options.onPcmFrame || null;
    this.onError = options.onError || null;
    this.stopStreamOnCleanup = options.stopStreamOnCleanup ?? true;
    this.state = 'idle';
    this.context = null;
    this.source = null;
    this.workletNode = null;
    this.sink = null;
    this.stream = null;
    this._flushWaiters = [];
    this._startPromise = null;
    this.generation = 0;
  }

  async start(stream) {
    if (this.state === 'running') return this.getGraphInfo();
    if (this._startPromise) return this._startPromise;
    if (!stream) throw new TypeError('A MediaStream is required for capture');
    if (typeof this.audioContextFactory !== 'function') {
      throw createAudioError('INPUT_AUDIO_CONTEXT_UNAVAILABLE', 'AudioContext is unavailable');
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
      this.context = await this.audioContextFactory({
        sampleRate: this.sampleRate,
      });
      this._assertCurrentGeneration(generation);
      verifyInputAudioContext(this.context, this.sampleRate);

      if (typeof this.context.audioWorklet?.addModule !== 'function') {
        throw createAudioError('INPUT_AUDIO_WORKLET_UNAVAILABLE', 'AudioWorklet is unavailable');
      }
      await this.context.audioWorklet.addModule(this.workletUrl);
      this._assertCurrentGeneration(generation);

      if (typeof this.context.createMediaStreamSource !== 'function'
        || typeof this.context.createGain !== 'function') {
        throw createAudioError('INPUT_AUDIO_GRAPH_UNAVAILABLE', 'Capture audio graph is unavailable');
      }

      this.source = this.context.createMediaStreamSource(stream);
      this.workletNode = this._createWorkletNode();
      this.sink = this.context.createGain();
      this.sink.gain.value = 0;
      this.sink.gain.setValueAtTime?.(0, this.context.currentTime || 0);

      this.source.connect(this.workletNode);
      this.workletNode.connect(this.sink);
      this.sink.connect(this.context.destination);
      this._attachPort(this.workletNode.port, this.workletNode, generation);

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

  _createWorkletNode() {
    const nodeOptions = {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: {
        sampleRate: this.sampleRate,
        frameSamples: this.frameSamples,
      },
    };
    if (typeof this.audioWorkletNodeFactory === 'function') {
      return this.audioWorkletNodeFactory(this.context, this.processorName, nodeOptions);
    }
    const AudioWorkletNodeConstructor = this.AudioWorkletNode || globalThis.AudioWorkletNode;
    if (typeof AudioWorkletNodeConstructor !== 'function') {
      throw createAudioError('INPUT_AUDIO_WORKLET_NODE_UNAVAILABLE', 'AudioWorkletNode is unavailable');
    }
    return new AudioWorkletNodeConstructor(this.context, this.processorName, nodeOptions);
  }

  _attachPort(port, node, generation) {
    if (!port) throw createAudioError('INPUT_AUDIO_PORT_UNAVAILABLE', 'Capture worklet port is unavailable');
    port.onmessage = event => {
      if (this.workletNode !== node || this.generation !== generation || this.state !== 'running') return;
      this._handleWorkletMessage(event);
    };
    port.start?.();
  }

  _handleWorkletMessage(event) {
    const data = event?.data || {};
    if (data.type === 'flushed') {
      const waiters = this._flushWaiters.splice(0);
      for (const resolve of waiters) resolve(data);
      return;
    }
    if (data.type === 'error') {
      const error = createAudioError(
        data.code || 'INPUT_AUDIO_WORKLET_FAILED',
        typeof data.message === 'string' ? data.message : 'Capture worklet failed',
      );
      this.onError?.(error);
      return;
    }
    if (data.type !== 'pcm') return;

    const buffer = getMessageBuffer(data);
    if (!buffer) return;
    const frame = { ...data, buffer };
    delete frame.pcm;
    try {
      this.onFrame?.(frame);
    } catch (error) {
      this.onError?.(error);
    }
  }

  /** Ask the worklet to emit its final short sample frame, if any. */
  flush() {
    if (this.state !== 'running' || !this.workletNode?.port) return Promise.resolve(null);
    return new Promise(resolve => {
      this._flushWaiters.push(resolve);
      try {
        this.workletNode.port.postMessage({ type: 'flush' });
      } catch (error) {
        this._flushWaiters = this._flushWaiters.filter(waiter => waiter !== resolve);
        this.onError?.(error);
        resolve(null);
      }
    });
  }

  getGraphInfo() {
    return {
      state: this.state,
      sampleRate: this.sampleRate,
      frameSamples: this.frameSamples,
      channels: 1,
      processorName: this.processorName,
    };
  }

  async stop() {
    this.generation += 1;
    await this._teardown();
    this.state = 'idle';
    this._flushWaiters.splice(0).forEach(resolve => resolve(null));
  }

  dispose() {
    return this.stop();
  }

  cleanup() {
    return this.stop();
  }

  async _teardown() {
    const source = this.source;
    const workletNode = this.workletNode;
    const sink = this.sink;
    const context = this.context;
    const stream = this.stream;

    this.source = null;
    this.workletNode = null;
    this.sink = null;
    this.context = null;
    this.stream = null;

    if (workletNode?.port) workletNode.port.onmessage = null;

    disconnect(source);
    disconnect(workletNode);
    disconnect(sink);
    closePort(workletNode?.port);
    await closeContext(context);
    if (this.stopStreamOnCleanup) stopStreamTracks(stream);
  }

  _assertCurrentGeneration(generation) {
    if (this.generation !== generation) {
      throw createAudioError('INPUT_AUDIO_START_CANCELLED', 'Capture setup was cancelled');
    }
  }
}

export const LiveDubbingTabAudioPipeline = TabAudioPipeline;

export default TabAudioPipeline;
