import { describe, expect, it, vi } from 'vitest';
import {
  OUTPUT_SAMPLE_RATE,
  Pcm16ByteAccumulator,
  PcmOutputPlayer,
  decodePcm16Le,
  verifyOutputAudioContext,
} from './PcmOutputPlayer.js';

function createPort() {
  return {
    onmessage: null,
    postMessage: vi.fn(),
    start: vi.fn(),
    close: vi.fn(),
  };
}

function createContext(sampleRate = OUTPUT_SAMPLE_RATE) {
  const port = createPort();
  const node = { connect: vi.fn(), disconnect: vi.fn(), port };
  return {
    context: {
      sampleRate,
      destination: {},
      audioWorklet: { addModule: vi.fn(async () => {}) },
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    },
    node,
    port,
  };
}

function pcmBytes(...samples) {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  samples.forEach((sample, index) => view.setInt16(index * 2, sample, true));
  return new Uint8Array(buffer);
}

describe('PCM output primitives', () => {
  it('decodes signed PCM16 LE and preserves an odd byte for the next chunk', () => {
    expect(Array.from(decodePcm16Le(pcmBytes(-32768, 32767)))).toEqual([-1, 32767 / 32768]);
    const accumulator = new Pcm16ByteAccumulator();
    expect(Array.from(accumulator.push(new Uint8Array([0, 0x80, 0xff])))).toEqual([-1]);
    expect(accumulator.pendingByteCount).toBe(1);
    expect(Array.from(accumulator.push(new Uint8Array([0x7f])))).toEqual([32767 / 32768]);
    expect(accumulator.pendingByteCount).toBe(0);
  });

  it('uses a dedicated fixed-rate output context and sends FIFO transferable chunks', async () => {
    const fake = createContext();
    const player = new PcmOutputPlayer({
      audioContextFactory: vi.fn(async options => {
        expect(options).toEqual({ sampleRate: OUTPUT_SAMPLE_RATE });
        return fake.context;
      }),
      audioWorkletNodeFactory: vi.fn(() => fake.node),
    });
    await player.start();

    player.enqueuePcm16(pcmBytes(1000), { sequence: 1 });
    player.enqueuePcm16(pcmBytes(2000), { sequence: 2 });
    expect(fake.port.postMessage).toHaveBeenCalledTimes(1);
    const first = fake.port.postMessage.mock.calls[0];
    expect(first[0]).toMatchObject({ type: 'enqueue', sequence: 1, sampleCount: 1 });
    expect(first[1]).toEqual([first[0].buffer]);
    expect(new Float32Array(first[0].buffer)[0]).toBe(1000 / 32768);

    fake.port.onmessage({ data: { type: 'accepted', id: first[0].id, queuedSamples: 1 } });
    expect(fake.port.postMessage).toHaveBeenCalledTimes(2);
    expect(fake.port.postMessage.mock.calls[1][0]).toMatchObject({ sequence: 2 });

    fake.port.onmessage({ data: { type: 'accepted', id: 2, queuedSamples: 2 } });
    expect(player.getMetrics()).toMatchObject({
      acceptedSamples: 2,
      sentSamples: 2,
      queuedSamples: 2,
    });
  });

  it('reports worklet acceptance separately and tracks current plus peak queue duration', async () => {
    const fake = createContext();
    const onPlaybackAccepted = vi.fn(() => {
      throw new Error('acceptance observer failed');
    });
    const player = new PcmOutputPlayer({
      epoch: 3,
      audioContextFactory: vi.fn(async () => fake.context),
      audioWorkletNodeFactory: vi.fn(() => fake.node),
      onPlaybackAccepted,
    });
    await player.start();

    player.enqueuePcm16(pcmBytes(1000, 2000), {
      epoch: 3,
      sequence: 7,
      sourceSampleStart: 42,
      sourceTimestamp: 42 / OUTPUT_SAMPLE_RATE,
    });
    expect(onPlaybackAccepted).not.toHaveBeenCalled();
    expect(player.getMetrics()).toMatchObject({
      queuedSamples: 2,
      sampleRate: OUTPUT_SAMPLE_RATE,
      queuedDurationMs: (2 / OUTPUT_SAMPLE_RATE) * 1000,
      peakQueuedDurationMs: (2 / OUTPUT_SAMPLE_RATE) * 1000,
    });

    const enqueueMessage = fake.port.postMessage.mock.calls[0][0];
    fake.port.onmessage({ data: {
      type: 'accepted',
      id: enqueueMessage.id,
      queuedSamples: 2,
    } });
    expect(onPlaybackAccepted).toHaveBeenCalledOnce();
    const acceptedDetails = onPlaybackAccepted.mock.calls[0][0];
    expect(acceptedDetails).toMatchObject({
      id: enqueueMessage.id,
      epoch: 3,
      sequence: 7,
      sampleCount: 2,
      queuedSamples: 2,
      sampleRate: OUTPUT_SAMPLE_RATE,
      durationMs: (2 / OUTPUT_SAMPLE_RATE) * 1000,
      queuedDurationMs: (2 / OUTPUT_SAMPLE_RATE) * 1000,
    });
    expect(acceptedDetails.buffer).toBeUndefined();
    expect(Object.values(acceptedDetails).every(value => (
      value === null
      || typeof value === 'string'
      || typeof value === 'boolean'
      || (typeof value === 'number' && Number.isFinite(value))
    ))).toBe(true);

    fake.port.onmessage({ data: {
      type: 'metrics',
      queuedSamples: 0,
      underruns: 0,
      underrunSamples: 0,
    } });
    expect(player.getQueueMetrics()).toMatchObject({
      queuedSamples: 0,
      queuedDurationMs: 0,
      peakQueuedDurationMs: (2 / OUTPUT_SAMPLE_RATE) * 1000,
    });
  });

  it('swallows error callback failures from worklet rejections', async () => {
    const fake = createContext();
    const onError = vi.fn(() => {
      throw new Error('error observer failed');
    });
    const player = new PcmOutputPlayer({
      audioContextFactory: vi.fn(async () => fake.context),
      audioWorkletNodeFactory: vi.fn(() => fake.node),
      onError,
    });
    await player.start();

    player.enqueuePcm16(pcmBytes(1000));
    const first = fake.port.postMessage.mock.calls[0][0];
    expect(() => fake.port.onmessage({ data: {
      type: 'rejected',
      id: first.id,
      code: 'OUTPUT_AUDIO_QUEUE_SAFETY_LIMIT',
      message: 'queue full',
      queuedSamples: 0,
    } })).not.toThrow();
    expect(onError).toHaveBeenCalledOnce();

    expect(player.enqueuePcm16(pcmBytes(2000)).accepted).toBe(true);
    expect(fake.port.postMessage).toHaveBeenCalledTimes(2);
  });

  it('keeps metrics observers from interrupting output queue delivery', async () => {
    const fake = createContext();
    const player = new PcmOutputPlayer({
      audioContextFactory: vi.fn(async () => fake.context),
      audioWorkletNodeFactory: vi.fn(() => fake.node),
      onMetrics: () => {
        throw new Error('metrics observer failed');
      },
    });
    await player.start();

    expect(player.enqueuePcm16(pcmBytes(1000)).accepted).toBe(true);
    const enqueueMessage = fake.port.postMessage.mock.calls[0][0];
    fake.port.onmessage({ data: {
      type: 'accepted',
      id: enqueueMessage.id,
      queuedSamples: 1,
    } });
    expect(player.getMetrics()).toMatchObject({ sentChunks: 1, sentSamples: 1 });
  });

  it('resets the output epoch and clears queued audio plus partial bytes', async () => {
    const fake = createContext();
    const player = new PcmOutputPlayer({
      audioContextFactory: vi.fn(async () => fake.context),
      audioWorkletNodeFactory: vi.fn(() => fake.node),
    });
    await player.start();
    player.enqueuePcm16(pcmBytes(500));
    player.enqueuePcm16(new Uint8Array([0]));
    expect(player.getPendingByteCount()).toBe(1);
    player.resetEpoch(7);
    expect(player.getMetrics()).toMatchObject({ epoch: 7, queuedSamples: 0, pendingByteCount: 0 });
    expect(fake.port.postMessage.mock.calls.at(-1)[0]).toEqual({ type: 'reset', epoch: 7 });
  });

  it('records underrun metrics, enforces only the explicit safety bound, and cleans up', async () => {
    const fake = createContext();
    const onError = vi.fn();
    const player = new PcmOutputPlayer({
      maxQueuedSamples: 1,
      audioContextFactory: vi.fn(async () => fake.context),
      audioWorkletNodeFactory: vi.fn(() => fake.node),
      onError,
    });
    await player.start();
    expect(player.enqueuePcm16(pcmBytes(1)).accepted).toBe(true);
    expect(player.enqueuePcm16(pcmBytes(2))).toMatchObject({
      accepted: false,
      error: 'OUTPUT_AUDIO_QUEUE_SAFETY_LIMIT',
    });
    fake.port.onmessage({ data: { type: 'underrun', underruns: 2, underrunSamples: 256, queuedSamples: 0 } });
    expect(player.getMetrics()).toMatchObject({ underruns: 2, underrunSamples: 256, safetyDrops: 1 });

    await player.stop();
    expect(fake.node.disconnect).toHaveBeenCalledOnce();
    expect(fake.port.close).toHaveBeenCalledOnce();
    expect(fake.context.close).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it('fails closed for an unexpected output context rate', async () => {
    const fake = createContext(16_000);
    expect(() => verifyOutputAudioContext(fake.context)).toThrow(/24000/);
    const player = new PcmOutputPlayer({ audioContextFactory: vi.fn(async () => fake.context) });
    await expect(player.start()).rejects.toMatchObject({
      code: 'OUTPUT_AUDIO_CONTEXT_SAMPLE_RATE_MISMATCH',
    });
    expect(fake.context.close).toHaveBeenCalledOnce();
    expect(fake.context.audioWorklet.addModule).not.toHaveBeenCalled();
  });
});
