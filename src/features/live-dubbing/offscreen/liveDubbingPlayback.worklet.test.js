import { afterEach, describe, expect, it, vi } from 'vitest';

function createPort() {
  return {
    onmessage: null,
    postMessage: vi.fn(),
  };
}

describe('live dubbing playback worklet', () => {
  const originalAudioWorkletProcessor = globalThis.AudioWorkletProcessor;
  const originalRegisterProcessor = globalThis.registerProcessor;

  afterEach(() => {
    if (originalAudioWorkletProcessor === undefined) delete globalThis.AudioWorkletProcessor;
    else globalThis.AudioWorkletProcessor = originalAudioWorkletProcessor;
    if (originalRegisterProcessor === undefined) delete globalThis.registerProcessor;
    else globalThis.registerProcessor = originalRegisterProcessor;
  });

  it('aggregates repeated empty render quanta into sample-counted metrics', async () => {
    const port = createPort();
    globalThis.AudioWorkletProcessor = class {
      constructor() {
        this.port = port;
      }
    };
    globalThis.registerProcessor = vi.fn();

    await import('./liveDubbingPlayback.worklet.js?metrics-test');
    const Processor = globalThis.registerProcessor.mock.calls[0][1];
    const processor = new Processor();

    for (let index = 0; index < 200; index += 1) {
      processor.process([], [[new Float32Array(128)]]);
    }

    expect(port.postMessage).toHaveBeenCalledTimes(1);
    expect(port.postMessage).toHaveBeenCalledWith({
      type: 'metrics',
      queuedSamples: 0,
      underruns: 188,
      underrunSamples: 24_064,
      sampleRate: 24_000,
      epoch: 0,
    });

    processor.handleMessage({ type: 'metrics' });
    expect(port.postMessage).toHaveBeenCalledTimes(2);
    expect(port.postMessage.mock.calls[1][0]).toMatchObject({
      type: 'metrics',
      underruns: 200,
      underrunSamples: 25_600,
    });
  });

  it('keeps ownership acknowledgements exact while rejecting stale and full chunks', async () => {
    const port = createPort();
    globalThis.AudioWorkletProcessor = class {
      constructor() {
        this.port = port;
      }
    };
    globalThis.registerProcessor = vi.fn();

    await import('./liveDubbingPlayback.worklet.js?ack-test');
    const Processor = globalThis.registerProcessor.mock.calls[0][1];
    const processor = new Processor({ processorOptions: { maxBufferSamples: 1 } });

    processor.handleMessage({
      type: 'enqueue',
      id: 'accepted-chunk',
      epoch: 0,
      buffer: new Float32Array([0.5]).buffer,
    });
    expect(port.postMessage).toHaveBeenNthCalledWith(1, {
      type: 'accepted',
      id: 'accepted-chunk',
      queuedSamples: 1,
    });

    processor.handleMessage({ type: 'enqueue', id: 'stale-chunk', epoch: -1 });
    expect(port.postMessage).toHaveBeenNthCalledWith(2, {
      type: 'rejected',
      id: 'stale-chunk',
      code: 'OUTPUT_AUDIO_STALE_EPOCH',
      message: 'PCM chunk belongs to an older output epoch',
      queuedSamples: 1,
    });

    processor.handleMessage({
      type: 'enqueue',
      id: 'full-chunk',
      epoch: 0,
      buffer: new Float32Array([0.25]).buffer,
    });
    expect(port.postMessage).toHaveBeenNthCalledWith(3, {
      type: 'rejected',
      id: 'full-chunk',
      code: 'OUTPUT_AUDIO_QUEUE_SAFETY_LIMIT',
      message: 'Playback queue safety limit reached',
      queuedSamples: 1,
    });
  });
});
