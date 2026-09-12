/* global currentFrame, currentTime */

// This file is loaded directly by AudioWorklet.addModule. Keep it standalone:
// extension-local URLs do not require web-accessible-resource declarations.
const DEFAULT_SAMPLE_RATE = 16_000;
const DEFAULT_FRAME_SAMPLES = 1_600;

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value) {
  if (!finite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

function toPcm16(value) {
  const sample = clamp(value);
  return sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
}

class LiveDubbingCaptureProcessor extends AudioWorkletProcessor {
  constructor(options = {}) {
    super();
    const processorOptions = options.processorOptions || {};
    this.sampleRateValue = finite(processorOptions.sampleRate)
      ? processorOptions.sampleRate
      : DEFAULT_SAMPLE_RATE;
    this.frameSamples = Number.isInteger(processorOptions.frameSamples)
      && processorOptions.frameSamples > 0
      ? processorOptions.frameSamples
      : DEFAULT_FRAME_SAMPLES;
    this.frame = new Int16Array(this.frameSamples);
    this.pendingSamples = 0;
    this.nextSourceSample = null;
    this.nextSourceTime = null;
    this.frameSourceSample = null;
    this.frameSourceTime = null;

    this.port.onmessage = event => {
      if (event?.data?.type === 'flush') {
        const sampleCount = this.emitFrame(true);
        this.port.postMessage({
          type: 'flushed',
          sampleCount,
        });
      } else if (event?.data?.type === 'reset') {
        this.pendingSamples = 0;
        this.nextSourceSample = null;
        this.nextSourceTime = null;
        this.frameSourceSample = null;
        this.frameSourceTime = null;
      }
    };
  }

  process(inputs, outputs) {
    for (const channel of outputs?.[0] || []) channel.fill(0);
    const channels = inputs?.[0] || [];
    const channelCount = channels.length;
    if (channelCount === 0) return true;

    const sampleCount = channels.reduce(
      (largest, channel) => Math.max(largest, channel?.length || 0),
      0,
    );
    if (sampleCount === 0) return true;

    const renderFrame = finite(currentFrame) ? currentFrame : null;
    const renderTime = finite(currentTime) ? currentTime : null;
    if (this.nextSourceSample === null) this.nextSourceSample = renderFrame ?? 0;
    if (this.nextSourceTime === null) this.nextSourceTime = renderTime ?? 0;
    if (this.pendingSamples === 0 && renderFrame !== null) {
      this.nextSourceSample = renderFrame;
      this.nextSourceTime = renderTime ?? renderFrame / this.sampleRateValue;
    }

    for (let index = 0; index < sampleCount; index += 1) {
      let sum = 0;
      for (const channel of channels) {
        const value = channel?.[index];
        sum += finite(value) ? value : 0;
      }
      const mono = clamp(sum / channelCount);

      if (this.pendingSamples === 0) {
        this.frameSourceSample = this.nextSourceSample;
        this.frameSourceTime = this.nextSourceTime;
      }
      this.frame[this.pendingSamples] = toPcm16(mono);
      this.pendingSamples += 1;
      this.nextSourceSample += 1;
      this.nextSourceTime += 1 / this.sampleRateValue;

      if (this.pendingSamples === this.frameSamples) this.emitFrame(false);
    }
    return true;
  }

  emitFrame(partial) {
    if (this.pendingSamples === 0) return 0;
    const sampleCount = this.pendingSamples;
    const pcm = new Int16Array(sampleCount);
    pcm.set(this.frame.subarray(0, sampleCount));
    const sourceSampleStart = this.frameSourceSample;
    const sourceTimeStart = this.frameSourceTime;

    this.pendingSamples = 0;
    this.frameSourceSample = null;
    this.frameSourceTime = null;
    this.port.postMessage({
      type: 'pcm',
      buffer: pcm.buffer,
      sampleRate: this.sampleRateValue,
      channels: 1,
      sampleCount,
      sourceSampleStart,
      sourceSampleEnd: sourceSampleStart + sampleCount,
      sourceTimeStart,
      sourceTimestamp: sourceTimeStart,
      partial,
    }, [pcm.buffer]);
    return sampleCount;
  }
}

registerProcessor('live-dubbing-capture-processor', LiveDubbingCaptureProcessor);
