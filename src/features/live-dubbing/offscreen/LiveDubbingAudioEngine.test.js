import { describe, expect, it, vi } from 'vitest';
import { LIVE_DUBBING_AUDIO_MODES } from '../constants.js';
import { LiveDubbingAudioEngine } from './LiveDubbingAudioEngine.js';
import { TabAudioPipeline, INPUT_SAMPLE_RATE } from './TabAudioPipeline.js';
import { PcmOutputPlayer, OUTPUT_SAMPLE_RATE } from './PcmOutputPlayer.js';

function createPort() {
  return {
    onmessage: null,
    postMessage: vi.fn(),
    start: vi.fn(),
    close: vi.fn(),
  };
}

function createInputContext() {
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
      sampleRate: INPUT_SAMPLE_RATE,
      currentTime: 0,
      destination: {},
      audioWorklet: { addModule: vi.fn(async () => {}) },
      createMediaStreamSource: vi.fn(() => source),
      createGain: vi.fn(() => sink),
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    },
    node,
    source,
    sink,
  };
}

function createOutputContext() {
  const port = createPort();
  const node = { connect: vi.fn(), disconnect: vi.fn(), port };
  return {
    context: {
      sampleRate: OUTPUT_SAMPLE_RATE,
      destination: {},
      audioWorklet: { addModule: vi.fn(async () => {}) },
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    },
    node,
  };
}

function createStream(track = { stop: vi.fn() }) {
  return {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  };
}

function createDouble(overrides = {}) {
  return {
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    clear: vi.fn(),
    enqueuePcm16: vi.fn(() => ({ accepted: true })),
    resetEpoch: vi.fn(),
    ...overrides,
  };
}

describe('LiveDubbingAudioEngine', () => {
  it('starts both local PCM graphs with a borrowed stream', async () => {
    const input = createInputContext();
    const output = createOutputContext();
    const track = { stop: vi.fn() };
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      audioContextFactory: vi.fn(async ({ sampleRate }) => (
        sampleRate === INPUT_SAMPLE_RATE ? input.context : output.context
      )),
      inputPipelineOptions: { audioWorkletNodeFactory: vi.fn(() => input.node) },
      outputPlayerOptions: { audioWorkletNodeFactory: vi.fn(() => output.node) },
    });

    await expect(engine.start(createStream(track))).resolves.toEqual({
      audioPathReady: true,
      inputPipelineReady: true,
      outputPipelineReady: true,
    });
    expect(engine.inputPipeline).toBeInstanceOf(TabAudioPipeline);
    expect(engine.outputPlayer).toBeInstanceOf(PcmOutputPlayer);
    expect(engine.inputPipeline.stopStreamOnCleanup).toBe(false);
    expect(input.source.connect).toHaveBeenCalledWith(input.node);
    expect(output.node.connect).toHaveBeenCalledWith(output.context.destination);

    await engine.stop();
    expect(input.context.close).toHaveBeenCalledOnce();
    expect(output.context.close).toHaveBeenCalledOnce();
    expect(track.stop).not.toHaveBeenCalled();
  });

  it('does not create local resources for media-stream audio', async () => {
    const inputPipelineFactory = vi.fn();
    const outputPlayerFactory = vi.fn();
    const track = { stop: vi.fn() };
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.MEDIA_STREAM,
      inputPipelineFactory,
      outputPlayerFactory,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
    });

    await expect(engine.start()).resolves.toEqual({
      audioPathReady: true,
      inputPipelineReady: false,
      outputPipelineReady: false,
    });
    expect(inputPipelineFactory).not.toHaveBeenCalled();
    expect(outputPlayerFactory).not.toHaveBeenCalled();
    expect(engine.inputPipeline).toBeNull();
    expect(engine.outputPlayer).toBeNull();

    await engine.stop();
    expect(track.stop).not.toHaveBeenCalled();
  });

  it('keeps lifecycle factory context outside the engine boundary', async () => {
    const inputPipelineFactory = vi.fn(() => createDouble());
    const outputPlayerFactory = vi.fn(() => createDouble());
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipelineFactory,
      outputPlayerFactory,
    });

    await engine.start(createStream());
    expect(inputPipelineFactory.mock.calls[0][0]).not.toHaveProperty('sessionId');
    expect(inputPipelineFactory.mock.calls[0][0]).not.toHaveProperty('factoryContext');
    expect(outputPlayerFactory.mock.calls[0][0]).not.toHaveProperty('sessionId');
    expect(outputPlayerFactory.mock.calls[0][0]).not.toHaveProperty('factoryContext');
    expect(engine).not.toHaveProperty('sessionId');
    expect(engine).not.toHaveProperty('factoryContext');
  });

  it('delegates PCM enqueue, epoch reset, and output clearing', async () => {
    const input = createDouble();
    const output = createDouble();
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: input,
      outputPlayer: output,
    });
    await engine.start(createStream());

    const bytes = new Uint8Array([1, 2]);
    expect(engine.enqueuePcm16(bytes, { epoch: 2 })).toEqual({ accepted: true });
    expect(output.enqueuePcm16).toHaveBeenCalledWith(bytes, { epoch: 2 });
    expect(engine.resetEpoch(3)).toBeUndefined();
    expect(output.resetEpoch).toHaveBeenCalledWith(3);
    engine.clearOutput();
    expect(output.clear).toHaveBeenCalledOnce();
  });

  it('keeps public PCM readiness closed until both child starts resolve', async () => {
    let resolveOutputStart;
    const input = createDouble();
    const output = createDouble({
      start: vi.fn(() => new Promise(resolve => { resolveOutputStart = resolve; })),
    });
    const onInputReady = vi.fn();
    const onOutputReady = vi.fn();
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: input,
      outputPlayer: output,
      onInputReady,
      onOutputReady,
    });

    const starting = engine.start(createStream());
    await vi.waitFor(() => expect(onInputReady).toHaveBeenCalledOnce());
    expect(onOutputReady).not.toHaveBeenCalled();
    expect(engine.getReadiness()).toEqual({
      audioPathReady: false,
      inputPipelineReady: false,
      outputPipelineReady: false,
    });

    resolveOutputStart();
    await expect(starting).resolves.toEqual({
      audioPathReady: true,
      inputPipelineReady: true,
      outputPipelineReady: true,
    });
    expect(onOutputReady).toHaveBeenCalledOnce();
  });

  it('cleans up a partial PCM start and makes stop idempotent', async () => {
    const input = createDouble();
    const output = createDouble({
      start: vi.fn(async () => { throw new Error('output start failed'); }),
    });
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: input,
      outputPlayer: output,
    });

    await expect(engine.start(createStream())).rejects.toThrow('output start failed');
    expect(input.stop).toHaveBeenCalledOnce();
    expect(output.clear).toHaveBeenCalledOnce();
    expect(output.stop).toHaveBeenCalledOnce();

    const firstStop = engine.stop();
    const secondStop = engine.stop();
    await expect(Promise.all([firstStop, secondStop])).resolves.toEqual([undefined, undefined]);
    expect(input.stop).toHaveBeenCalledOnce();
    expect(output.stop).toHaveBeenCalledOnce();
  });

  it('forwards factual local-audio callbacks', async () => {
    const input = createDouble();
    const output = createDouble();
    const callbacks = {
      onFrame: vi.fn(),
      onError: vi.fn(),
      onMetrics: vi.fn(),
      onPlaybackAccepted: vi.fn(),
    };
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: input,
      outputPlayer: output,
      ...callbacks,
    });
    await engine.start(createStream());

    input.onFrame({ sampleCount: 1 });
    input.onError(new Error('input'));
    output.onError(new Error('output'));
    output.onMetrics({ queuedSamples: 2 });
    output.onPlaybackAccepted({ accepted: true, sampleCount: 2 });

    expect(callbacks.onFrame).toHaveBeenCalledWith({ sampleCount: 1 });
    expect(callbacks.onError).toHaveBeenCalledTimes(2);
    expect(callbacks.onMetrics).toHaveBeenCalledWith({ queuedSamples: 2 });
    expect(callbacks.onPlaybackAccepted).toHaveBeenCalledWith({ accepted: true, sampleCount: 2 });
  });
});
