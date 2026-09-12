/**
 * Playback-side audio primitives for live dubbing.
 *
 * PCM is decoded here and handed to a local AudioWorklet ring buffer. There is
 * no MediaStream input in this class, so captured tab audio cannot accidentally
 * become an output source.
 */

export const OUTPUT_SAMPLE_RATE = 24_000;
export const PLAYBACK_PROCESSOR_NAME = 'live-dubbing-playback-processor';
export const PLAYBACK_WORKLET_URL = new URL('./liveDubbingPlayback.worklet.js', import.meta.url).href;
export const DEFAULT_MAX_QUEUED_SAMPLES = OUTPUT_SAMPLE_RATE * 10;

function isArrayBuffer(value) {
  return value instanceof ArrayBuffer
    || (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer);
}

function asBytes(value) {
  if (isArrayBuffer(value)) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError('PCM input must be an ArrayBuffer or typed array');
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

function closePort(port) {
  try {
    port?.close?.();
  } catch {
    // MessagePort close is best effort for non-browser test doubles.
  }
}

function disconnect(node) {
  try {
    node?.disconnect?.();
  } catch {
    // The context is still closed below when graph teardown is partial.
  }
}

async function closeContext(context) {
  try {
    await context?.close?.();
  } catch {
    // Contexts can already be closed after a failed setup step.
  }
}

/**
 * Decode complete little-endian signed PCM16 samples. An incomplete trailing
 * byte belongs to Pcm16ByteAccumulator and is intentionally not decoded here.
 */
export function decodePcm16Le(value) {
  const bytes = asBytes(value);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const samples = new Float32Array(sampleCount);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 0x8000;
  }
  return samples;
}

export const decodePcm16LE = decodePcm16Le;

/**
 * Preserve an odd PCM byte between transport chunks without guessing its
 * missing high/low byte.
 */
export class Pcm16ByteAccumulator {
  constructor() {
    this.remainder = new Uint8Array(0);
  }

  push(value) {
    const incoming = asBytes(value);
    if (incoming.length === 0) return new Float32Array(0);

    const combined = new Uint8Array(this.remainder.length + incoming.length);
    combined.set(this.remainder);
    combined.set(incoming, this.remainder.length);

    const completeByteLength = combined.length - (combined.length % 2);
    const complete = combined.subarray(0, completeByteLength);
    this.remainder = combined.slice(completeByteLength);
    return complete.length === 0 ? new Float32Array(0) : decodePcm16Le(complete);
  }

  get pendingByteCount() {
    return this.remainder.length;
  }

  clear() {
    this.remainder = new Uint8Array(0);
  }
}

class OrderedSampleQueue {
  constructor() {
    this.items = [];
    this.sampleCount = 0;
  }

  push(item) {
    this.items.push(item);
    this.sampleCount += item.sampleCount;
  }

  peek() {
    return this.items[0] || null;
  }

  shift() {
    const item = this.items.shift() || null;
    if (item) this.sampleCount -= item.sampleCount;
    return item;
  }

  clear() {
    this.items = [];
    this.sampleCount = 0;
  }
}

function normalizeMaxQueuedSamples(value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError('maxQueuedSamples must be a positive integer');
  }
  return value;
}

function isScalar(value) {
  return value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value));
}

function invokeCallback(callback, value) {
  if (typeof callback !== 'function') return;
  try {
    callback(value);
  } catch {
    // Consumer callbacks are observational and must not interrupt playback.
  }
}

/** Fail closed if the browser did not honor the dedicated playback rate. */
export function verifyOutputAudioContext(context, sampleRate = OUTPUT_SAMPLE_RATE) {
  if (!context || context.sampleRate !== sampleRate) {
    throw createAudioError(
      'OUTPUT_AUDIO_CONTEXT_SAMPLE_RATE_MISMATCH',
      `Expected output AudioContext at ${sampleRate} Hz`,
      { expectedSampleRate: sampleRate, actualSampleRate: context?.sampleRate },
    );
  }
  return context;
}

/**
 * Queue decoded PCM and feed one ordered message at a time to the playback
 * worklet. The worklet acknowledges ownership before the next chunk is sent,
 * which avoids normal queue drops while keeping transfers zero-copy.
 */
export class PcmOutputPlayer {
  constructor(options = {}) {
    if (options.sampleRate !== undefined && options.sampleRate !== OUTPUT_SAMPLE_RATE) {
      throw createAudioError('OUTPUT_AUDIO_SAMPLE_RATE_FIXED', 'Playback sample rate is fixed at 24000 Hz');
    }
    this.sampleRate = OUTPUT_SAMPLE_RATE;
    this.maxQueuedSamples = normalizeMaxQueuedSamples(
      options.maxQueuedSamples ?? DEFAULT_MAX_QUEUED_SAMPLES,
    );
    this.audioContextFactory = getAudioContextFactory(options);
    this.audioWorkletNodeFactory = options.audioWorkletNodeFactory
      || options.workletNodeFactory
      || null;
    this.AudioWorkletNode = options.AudioWorkletNode || null;
    this.workletUrl = options.workletUrl || PLAYBACK_WORKLET_URL;
    this.processorName = options.processorName || PLAYBACK_PROCESSOR_NAME;
    this.onError = options.onError || null;
    this.onMetrics = options.onMetrics || null;
    this.onPlaybackAccepted = typeof options.onPlaybackAccepted === 'function'
      ? options.onPlaybackAccepted
      : null;

    this.state = 'idle';
    this.context = null;
    this.workletNode = null;
    this.queue = new OrderedSampleQueue();
    this.byteAccumulator = new Pcm16ByteAccumulator();
    this.inFlight = null;
    this.remoteQueuedSamples = 0;
    this.epoch = options.epoch ?? 0;
    this.nextMessageId = 1;
    this.metrics = {
      acceptedChunks: 0,
      acceptedSamples: 0,
      sentChunks: 0,
      sentSamples: 0,
      underruns: 0,
      underrunSamples: 0,
      safetyDrops: 0,
      staleChunks: 0,
      epochResets: 0,
      peakQueuedSamples: 0,
    };
    this._startPromise = null;
    this.generation = 0;
  }

  async start() {
    if (this.state === 'running') return this.getMetrics();
    if (this._startPromise) return this._startPromise;
    if (typeof this.audioContextFactory !== 'function') {
      throw createAudioError('OUTPUT_AUDIO_CONTEXT_UNAVAILABLE', 'AudioContext is unavailable');
    }

    this.state = 'starting';
    const generation = ++this.generation;
    this._startPromise = this._start(generation);
    try {
      return await this._startPromise;
    } finally {
      this._startPromise = null;
    }
  }

  async _start(generation) {
    try {
      this.context = await this.audioContextFactory({
        sampleRate: this.sampleRate,
      });
      this._assertCurrentGeneration(generation);
      verifyOutputAudioContext(this.context, this.sampleRate);
      if (typeof this.context.audioWorklet?.addModule !== 'function') {
        throw createAudioError('OUTPUT_AUDIO_WORKLET_UNAVAILABLE', 'AudioWorklet is unavailable');
      }
      await this.context.audioWorklet.addModule(this.workletUrl);
      this._assertCurrentGeneration(generation);
      this.workletNode = this._createWorkletNode();
      if (typeof this.workletNode.connect !== 'function' || !this.context.destination) {
        throw createAudioError('OUTPUT_AUDIO_GRAPH_UNAVAILABLE', 'Playback audio graph is unavailable');
      }
      this.workletNode.connect(this.context.destination);
      this._attachPort(this.workletNode.port, this.workletNode, generation);
      await this.context.resume?.();
      this._assertCurrentGeneration(generation);
      this.state = 'running';
      this._pump();
      return this.getMetrics();
    } catch (error) {
      await this._teardown();
      this.state = 'idle';
      throw error;
    }
  }

  _createWorkletNode() {
    const nodeOptions = {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: {
        sampleRate: this.sampleRate,
        maxBufferSamples: this.maxQueuedSamples,
        epoch: this.epoch,
      },
    };
    if (typeof this.audioWorkletNodeFactory === 'function') {
      return this.audioWorkletNodeFactory(this.context, this.processorName, nodeOptions);
    }
    const AudioWorkletNodeConstructor = this.AudioWorkletNode || globalThis.AudioWorkletNode;
    if (typeof AudioWorkletNodeConstructor !== 'function') {
      throw createAudioError('OUTPUT_AUDIO_WORKLET_NODE_UNAVAILABLE', 'AudioWorkletNode is unavailable');
    }
    return new AudioWorkletNodeConstructor(this.context, this.processorName, nodeOptions);
  }

  _attachPort(port, node, generation) {
    if (!port) throw createAudioError('OUTPUT_AUDIO_PORT_UNAVAILABLE', 'Playback worklet port is unavailable');
    port.onmessage = event => {
      if (this.workletNode !== node || this.generation !== generation || this.state !== 'running') return;
      this._handleWorkletMessage(event);
    };
    port.start?.();
  }

  _handleWorkletMessage(event) {
    const data = event?.data || {};
    if (data.type === 'accepted' || data.type === 'rejected') {
      if (!this.inFlight || data.id !== this.inFlight.id) return;
      const item = this.inFlight;
      this.inFlight = null;
      if (data.type === 'accepted') {
        this.queue.shift();
        this.metrics.sentChunks += 1;
        this.metrics.sentSamples += item.sampleCount;
        this.remoteQueuedSamples = Number.isSafeInteger(data.queuedSamples) && data.queuedSamples >= 0
          ? data.queuedSamples
          : this.remoteQueuedSamples + item.sampleCount;
      } else {
        // Rejection is only expected from the explicit bounded safety guard.
        this.queue.shift();
        this.metrics.safetyDrops += 1;
        this.remoteQueuedSamples = Number.isSafeInteger(data.queuedSamples) && data.queuedSamples >= 0
          ? data.queuedSamples
          : this.remoteQueuedSamples;
        invokeCallback(this.onError, createAudioError(
          data.code || 'OUTPUT_AUDIO_QUEUE_SAFETY_LIMIT',
          typeof data.message === 'string' ? data.message : 'Playback queue safety limit reached',
        ));
      }
      this._publishMetrics();
      if (data.type === 'accepted') {
        try {
          this.onPlaybackAccepted?.(this._createPlaybackAcceptedDetails(item));
        } catch {
          // Acceptance notifications are observational and must not interrupt delivery.
        }
      }
      this._pump();
      return;
    }

    if (data.type === 'metrics' || data.type === 'underrun') {
      if (Number.isSafeInteger(data.queuedSamples) && data.queuedSamples >= 0) {
        this.remoteQueuedSamples = data.queuedSamples;
      }
      if (Number.isSafeInteger(data.underruns) && data.underruns >= 0) this.metrics.underruns = data.underruns;
      if (Number.isSafeInteger(data.underrunSamples) && data.underrunSamples >= 0) {
        this.metrics.underrunSamples = data.underrunSamples;
      }
      this._publishMetrics();
      return;
    }

    if (data.type === 'error') {
      invokeCallback(this.onError, createAudioError(
        data.code || 'OUTPUT_AUDIO_WORKLET_FAILED',
        typeof data.message === 'string' ? data.message : 'Playback worklet failed',
      ));
    }
  }

  /**
   * Enqueue one PCM16 transport chunk. `metadata` is retained only as message
   * metadata; queue order is always insertion order, never sequence-sorted.
   */
  enqueuePcm16(value, metadata = {}) {
    if (this.state !== 'running') {
      return { accepted: false, error: 'OUTPUT_AUDIO_NOT_RUNNING' };
    }
    const bytes = asBytes(value);
    const incomingEpoch = metadata.epoch;
    if (incomingEpoch !== undefined && incomingEpoch !== this.epoch) {
      if (typeof incomingEpoch === 'number'
        && typeof this.epoch === 'number'
        && incomingEpoch < this.epoch) {
        this.metrics.staleChunks += 1;
        return { accepted: false, error: 'OUTPUT_AUDIO_STALE_EPOCH' };
      }
      this.resetEpoch(incomingEpoch);
    }

    const samples = this.byteAccumulator.push(bytes);
    if (samples.length === 0) return { accepted: true, sampleCount: 0, partialByte: true };

    // The worklet owns the remote queue's live bound; this local bound must not
    // guess from a stale metrics message and reject otherwise normal playback.
    const queuedBefore = this.queue.sampleCount;
    if (queuedBefore + samples.length > this.maxQueuedSamples) {
      this.metrics.safetyDrops += 1;
      this._publishMetrics();
      return {
        accepted: false,
        error: 'OUTPUT_AUDIO_QUEUE_SAFETY_LIMIT',
        droppedSamples: samples.length,
      };
    }

    this.queue.push({
      id: this.nextMessageId++,
      epoch: this.epoch,
      sequence: metadata.sequence,
      samples,
      sampleCount: samples.length,
      sourceSampleStart: metadata.sourceSampleStart,
      sourceTimestamp: metadata.sourceTimestamp,
    });
    this.metrics.acceptedChunks += 1;
    this.metrics.acceptedSamples += samples.length;
    this._publishMetrics();
    this._pump();
    return { accepted: true, sampleCount: samples.length, partialByte: false };
  }

  enqueueFrame(frame) {
    if (!frame || frame.buffer === undefined) {
      throw new TypeError('A PCM frame buffer is required');
    }
    return this.enqueuePcm16(frame.buffer, frame);
  }

  enqueue(value, metadata = {}) {
    return this.enqueuePcm16(value, metadata);
  }

  /** Start a new output generation and discard all old queued audio. */
  resetEpoch(epoch = this._nextEpoch()) {
    this.epoch = epoch;
    this.queue.clear();
    this.inFlight = null;
    this.remoteQueuedSamples = 0;
    this.byteAccumulator.clear();
    this.metrics.epochResets += 1;
    if (this.workletNode?.port) {
      try {
        this.workletNode.port.postMessage({ type: 'reset', epoch: this.epoch });
      } catch (error) {
        invokeCallback(this.onError, error);
      }
    }
    this._publishMetrics();
    return this.epoch;
  }

  clear() {
    return this.resetEpoch();
  }

  reset(epoch = this._nextEpoch()) {
    return this.resetEpoch(epoch);
  }

  getPendingByteCount() {
    return this.byteAccumulator.pendingByteCount;
  }

  getMetrics() {
    const queuedSamples = this._updateQueuePeak();
    return {
      ...this.metrics,
      state: this.state,
      epoch: this.epoch,
      sampleRate: this.sampleRate,
      queuedSamples,
      queuedDurationMs: (queuedSamples / this.sampleRate) * 1000,
      peakQueuedDurationMs: (this.metrics.peakQueuedSamples / this.sampleRate) * 1000,
      pendingByteCount: this.byteAccumulator.pendingByteCount,
    };
  }

  getQueueMetrics() {
    return this.getMetrics();
  }

  _nextEpoch() {
    return typeof this.epoch === 'number' && Number.isSafeInteger(this.epoch)
      ? this.epoch + 1
      : `${String(this.epoch)}:next`;
  }

  _queuedSampleCount() {
    return this.queue.sampleCount + this.remoteQueuedSamples;
  }

  _updateQueuePeak() {
    const queuedSamples = this._queuedSampleCount();
    if (queuedSamples > this.metrics.peakQueuedSamples) {
      this.metrics.peakQueuedSamples = queuedSamples;
    }
    return queuedSamples;
  }

  _createPlaybackAcceptedDetails(item) {
    const queuedSamples = this._updateQueuePeak();
    const details = {
      id: item.id,
      sampleCount: item.sampleCount,
      queuedSamples,
      sampleRate: this.sampleRate,
      durationMs: (item.sampleCount / this.sampleRate) * 1000,
      queuedDurationMs: (queuedSamples / this.sampleRate) * 1000,
      peakQueuedDurationMs: (this.metrics.peakQueuedSamples / this.sampleRate) * 1000,
    };
    for (const [name, value] of [
      ['epoch', item.epoch],
      ['sequence', item.sequence],
      ['sourceSampleStart', item.sourceSampleStart],
      ['sourceTimestamp', item.sourceTimestamp],
    ]) {
      if (isScalar(value)) details[name] = value;
    }
    return details;
  }

  _pump() {
    if (this.state !== 'running' || this.inFlight || !this.workletNode?.port) return;
    const item = this.queue.peek();
    if (!item) return;

    this.inFlight = item;
    try {
      this.workletNode.port.postMessage({
        type: 'enqueue',
        id: item.id,
        epoch: item.epoch,
        sequence: item.sequence,
        sampleRate: this.sampleRate,
        sampleCount: item.sampleCount,
        sourceSampleStart: item.sourceSampleStart,
        sourceTimestamp: item.sourceTimestamp,
        buffer: item.samples.buffer,
      }, [item.samples.buffer]);
    } catch (error) {
      this.inFlight = null;
      invokeCallback(this.onError, error);
    }
  }

  _publishMetrics() {
    invokeCallback(this.onMetrics, this.getMetrics());
  }

  async stop() {
    this.generation += 1;
    await this._teardown();
    this.state = 'idle';
    this.queue.clear();
    this.inFlight = null;
    this.remoteQueuedSamples = 0;
    this.byteAccumulator.clear();
    this._publishMetrics();
  }

  dispose() {
    return this.stop();
  }

  cleanup() {
    return this.stop();
  }

  async _teardown() {
    const node = this.workletNode;
    const context = this.context;
    this.workletNode = null;
    this.context = null;
    if (node?.port) node.port.onmessage = null;
    try {
      node?.port?.postMessage({ type: 'dispose' });
    } catch {
      // Teardown continues even if the worklet has already stopped.
    }
    disconnect(node);
    closePort(node?.port);
    await closeContext(context);
  }

  _assertCurrentGeneration(generation) {
    if (this.generation !== generation) {
      throw createAudioError('OUTPUT_AUDIO_START_CANCELLED', 'Playback setup was cancelled');
    }
  }
}

export const LiveDubbingPcmOutputPlayer = PcmOutputPlayer;

export default PcmOutputPlayer;
