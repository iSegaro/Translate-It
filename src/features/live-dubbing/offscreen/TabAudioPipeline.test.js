import { describe, expect, it, vi } from 'vitest';
import {
  INPUT_FRAME_SAMPLES,
  INPUT_SAMPLE_RATE,
  MonoPcm16Framer,
  TabAudioPipeline,
  downmixToMono,
  encodePcm16Le,
  floatToPcm16,
  frameMonoPcm16,
  verifyInputAudioContext,
} from './TabAudioPipeline.js';

function createPort() {
  return {
    onmessage: null,
    postMessage: vi.fn(),
    start: vi.fn(),
    close: vi.fn(),
  };
}

function createContext(sampleRate = INPUT_SAMPLE_RATE) {
  const port = createPort();
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const sink = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: { value: 1, setValueAtTime: vi.fn() },
  };
  const node = { connect: vi.fn(), disconnect: vi.fn(), port };
  return {
    context: {
      sampleRate,
      currentTime: 3,
      destination: {},
      audioWorklet: { addModule: vi.fn(async () => {}) },
      createMediaStreamSource: vi.fn(() => source),
      createGain: vi.fn(() => sink),
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    },
    source,
    sink,
    node,
    port,
  };
}

describe('capture PCM primitives', () => {
  it('downmixes channel planes deterministically and clamps PCM16 edges', () => {
    expect(Array.from(downmixToMono([
      new Float32Array([2, 0.5, Number.NaN]),
      new Float32Array([-2, 0.5, 0.25]),
    ]))).toEqual([0, 0.5, 0.125]);
    expect(floatToPcm16(2)).toBe(32767);
    expect(floatToPcm16(-2)).toBe(-32768);
    expect(floatToPcm16(Number.NaN)).toBe(0);
  });

  it('frames a short final block and preserves source sample metadata', () => {
    const samples = new Float32Array(INPUT_FRAME_SAMPLES + 1).fill(0.5);
    const frames = frameMonoPcm16(samples, { sourceSampleStart: 42 });

    expect(frames.map(frame => frame.sampleCount)).toEqual([INPUT_FRAME_SAMPLES, 1]);
    expect(frames.map(frame => frame.sourceSampleStart)).toEqual([42, 1642]);
    expect(frames[0].sourceTimestamp).toBe(42 / INPUT_SAMPLE_RATE);
    expect(frames[0].buffer.byteLength).toBe(INPUT_FRAME_SAMPLES * 2);
    expect(new DataView(frames[1].buffer).getInt16(0, true)).toBe(16384);
  });

  it('carries a sample remainder between pushes and flushes it once', () => {
    const framer = new MonoPcm16Framer();
    expect(framer.push(new Float32Array(1_000), { sourceSampleStart: 100 })).toHaveLength(0);
    expect(framer.push(new Float32Array(600))).toHaveLength(1);
    expect(framer.push(new Float32Array([0.25]))).toHaveLength(0);
    expect(framer.flush()[0]).toMatchObject({ sampleCount: 1, sourceSampleStart: 1700 });
  });

  it('requests and verifies the fixed-rate capture context and cleans up its graph', async () => {
    const fake = createContext();
    const track = { stop: vi.fn() };
    const stream = { getTracks: () => [track] };
    const onFrame = vi.fn();
    const pipeline = new TabAudioPipeline({
      audioContextFactory: vi.fn(async options => {
        expect(options).toEqual({ sampleRate: INPUT_SAMPLE_RATE });
        return fake.context;
      }),
      audioWorkletNodeFactory: vi.fn(() => fake.node),
      onFrame,
    });

    await pipeline.start(stream);
    expect(fake.context.audioWorklet.addModule).toHaveBeenCalledWith(expect.stringContaining('liveDubbingCapture.worklet.js'));
    expect(fake.source.connect).toHaveBeenCalledWith(fake.node);
    expect(fake.node.connect).toHaveBeenCalledWith(fake.sink);
    expect(fake.sink.gain.value).toBe(0);
    expect(fake.sink.connect).toHaveBeenCalledWith(fake.context.destination);

    const buffer = encodePcm16Le([0.25]);
    fake.port.onmessage({ data: { type: 'pcm', buffer, sampleCount: 1 } });
    expect(onFrame).toHaveBeenCalledWith(expect.objectContaining({ buffer, sampleCount: 1 }));

    await pipeline.stop();
    expect(fake.source.disconnect).toHaveBeenCalledOnce();
    expect(fake.node.disconnect).toHaveBeenCalledOnce();
    expect(fake.sink.disconnect).toHaveBeenCalledOnce();
    expect(fake.port.close).toHaveBeenCalledOnce();
    expect(fake.context.close).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('fails closed and closes an unexpected capture context rate', async () => {
    const fake = createContext(48_000);
    expect(() => verifyInputAudioContext(fake.context)).toThrow(/16000/);
    const pipeline = new TabAudioPipeline({ audioContextFactory: vi.fn(async () => fake.context) });
    await expect(pipeline.start({})).rejects.toMatchObject({
      code: 'INPUT_AUDIO_CONTEXT_SAMPLE_RATE_MISMATCH',
    });
    expect(fake.context.close).toHaveBeenCalledOnce();
    expect(fake.context.audioWorklet.addModule).not.toHaveBeenCalled();
  });
});
