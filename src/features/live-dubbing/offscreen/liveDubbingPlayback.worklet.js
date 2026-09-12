// Standalone extension-local AudioWorklet asset. It owns no MediaStream and
// therefore cannot pass captured tab audio through to the output graph.
const DEFAULT_SAMPLE_RATE = 24_000;
const DEFAULT_BUFFER_SAMPLES = DEFAULT_SAMPLE_RATE * 10;
const METRICS_INTERVAL_SECONDS = 1;

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function toFloatSamples(value) {
  if (value instanceof Float32Array) return value;
  if (value instanceof ArrayBuffer) return new Float32Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Float32Array(value.buffer, value.byteOffset, Math.floor(value.byteLength / 4));
  }
  return null;
}

class FloatRingBuffer {
  constructor(capacity) {
    this.buffer = new Float32Array(capacity);
    this.readIndex = 0;
    this.writeIndex = 0;
    this.length = 0;
  }

  get available() {
    return this.length;
  }

  get free() {
    return this.buffer.length - this.length;
  }

  clear() {
    this.readIndex = 0;
    this.writeIndex = 0;
    this.length = 0;
  }

  write(samples) {
    if (samples.length > this.free) return false;
    const firstPart = Math.min(samples.length, this.buffer.length - this.writeIndex);
    this.buffer.set(samples.subarray(0, firstPart), this.writeIndex);
    if (firstPart < samples.length) {
      this.buffer.set(samples.subarray(firstPart), 0);
    }
    this.writeIndex = (this.writeIndex + samples.length) % this.buffer.length;
    this.length += samples.length;
    return true;
  }

  readInto(output) {
    output.fill(0);
    const count = Math.min(output.length, this.length);
    const firstPart = Math.min(count, this.buffer.length - this.readIndex);
    output.set(this.buffer.subarray(this.readIndex, this.readIndex + firstPart), 0);
    if (firstPart < count) {
      output.set(this.buffer.subarray(0, count - firstPart), firstPart);
    }
    this.readIndex = (this.readIndex + count) % this.buffer.length;
    this.length -= count;
    return count;
  }
}

class LiveDubbingPlaybackProcessor extends AudioWorkletProcessor {
  constructor(options = {}) {
    super();
    const processorOptions = options.processorOptions || {};
    this.sampleRateValue = finite(processorOptions.sampleRate) && processorOptions.sampleRate > 0
      ? processorOptions.sampleRate
      : DEFAULT_SAMPLE_RATE;
    this.metricsIntervalSamples = Math.max(
      1,
      Math.ceil(this.sampleRateValue * METRICS_INTERVAL_SECONDS),
    );
    this.maxBufferSamples = Number.isInteger(processorOptions.maxBufferSamples)
      && processorOptions.maxBufferSamples > 0
      ? processorOptions.maxBufferSamples
      : DEFAULT_BUFFER_SAMPLES;
    this.ring = new FloatRingBuffer(this.maxBufferSamples);
    this.pending = [];
    this.pendingSamples = 0;
    this.epoch = processorOptions.epoch ?? 0;
    this.underruns = 0;
    this.underrunSamples = 0;
    this.disposed = false;
    this.samplesSinceMetrics = 0;

    this.port.onmessage = event => this.handleMessage(event?.data || {});
  }

  handleMessage(message) {
    if (message.type === 'dispose') {
      this.pending = [];
      this.pendingSamples = 0;
      this.ring.clear();
      this.disposed = true;
      return;
    }

    if (message.type === 'reset') {
      this.epoch = message.epoch;
      this.pending = [];
      this.pendingSamples = 0;
      this.ring.clear();
      this.postMetrics();
      return;
    }

    if (message.type === 'metrics') {
      this.postMetrics();
      return;
    }

    if (message.type !== 'enqueue') return;
    if (message.epoch !== undefined && message.epoch !== this.epoch) {
      this.port.postMessage({
        type: 'rejected',
        id: message.id,
        code: 'OUTPUT_AUDIO_STALE_EPOCH',
        message: 'PCM chunk belongs to an older output epoch',
        queuedSamples: this.queuedSamples(),
      });
      return;
    }

    const samples = toFloatSamples(message.buffer);
    if (!samples || samples.length === 0) {
      this.port.postMessage({
        type: 'rejected',
        id: message.id,
        code: 'OUTPUT_AUDIO_INVALID_PCM',
        message: 'PCM chunk is empty or invalid',
        queuedSamples: this.queuedSamples(),
      });
      return;
    }

    // This is the only drop boundary. Normal playback never evicts queued
    // audio; a bounded guard rejects input that cannot fit in the local queue.
    if (samples.length > this.maxBufferSamples
      || this.queuedSamples() + samples.length > this.maxBufferSamples) {
      this.port.postMessage({
        type: 'rejected',
        id: message.id,
        code: 'OUTPUT_AUDIO_QUEUE_SAFETY_LIMIT',
        message: 'Playback queue safety limit reached',
        queuedSamples: this.queuedSamples(),
      });
      return;
    }

    this.pending.push({ id: message.id, samples });
    this.pendingSamples += samples.length;
    this.port.postMessage({
      type: 'accepted',
      id: message.id,
      queuedSamples: this.queuedSamples(),
    });
  }

  queuedSamples() {
    return this.ring.available + this.pendingSamples;
  }

  drainPending() {
    while (this.pending.length > 0) {
      const item = this.pending[0];
      if (!this.ring.write(item.samples)) break;
      this.pending.shift();
      this.pendingSamples -= item.samples.length;
    }
  }

  postMetrics() {
    this.samplesSinceMetrics = 0;
    this.port.postMessage({
      type: 'metrics',
      queuedSamples: this.queuedSamples(),
      underruns: this.underruns,
      underrunSamples: this.underrunSamples,
      sampleRate: this.sampleRateValue,
      epoch: this.epoch,
    });
  }

  process(_inputs, outputs) {
    if (this.disposed) return false;
    const output = outputs?.[0];
    if (!output) return true;
    const firstChannel = output[0];
    if (!firstChannel) return true;

    this.drainPending();
    const rendered = this.ring.readInto(firstChannel);
    for (let channelIndex = 1; channelIndex < output.length; channelIndex += 1) {
      output[channelIndex].set(firstChannel);
    }

    if (rendered < firstChannel.length) {
      this.underruns += 1;
      this.underrunSamples += firstChannel.length - rendered;
    }

    // Keep silence local to the worklet; one sample-clock report per second is
    // enough for diagnostics without crossing the thread on every quantum.
    this.samplesSinceMetrics += firstChannel.length;
    if (this.samplesSinceMetrics >= this.metricsIntervalSamples) {
      this.postMetrics();
    }
    return true;
  }
}

registerProcessor('live-dubbing-playback-processor', LiveDubbingPlaybackProcessor);
