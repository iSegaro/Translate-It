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
  const gainNode = { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } };
  return {
    context: {
      sampleRate: OUTPUT_SAMPLE_RATE,
      destination: {},
      audioWorklet: { addModule: vi.fn(async () => {}) },
      createGain: vi.fn(() => gainNode),
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    },
    node,
    gainNode,
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
    setVolume: vi.fn(),
    getVolume: vi.fn(() => 1),
    ...overrides,
  };
}

function createMonitorDouble(overrides = {}) {
  return {
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    setVolume: vi.fn(),
    getVolume: vi.fn(() => 0),
    ...overrides,
  };
}

function createMonitorContext() {
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const gain = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: { value: 1, setValueAtTime: vi.fn() },
  };
  return {
    context: {
      sampleRate: 48_000,
      currentTime: 3,
      destination: {},
      createMediaStreamSource: vi.fn(() => source),
      createGain: vi.fn(() => gain),
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    },
    source,
    gain,
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
    expect(output.node.connect).toHaveBeenCalledWith(output.gainNode);
    expect(output.gainNode.connect).toHaveBeenCalledWith(output.context.destination);

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

  it('defaults original volume to silence without a monitor', () => {
    const engine = new LiveDubbingAudioEngine({ audioMode: LIVE_DUBBING_AUDIO_MODES.PCM });

    expect(engine.getOriginalVolume()).toBe(0);
    expect(engine.originalAudioMonitor).toBeNull();
  });

  it('creates no monitor for PCM start at default volume', async () => {
    const monitorFactory = vi.fn(() => createMonitorDouble());
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitorFactory: monitorFactory,
    });

    await engine.start(createStream());

    expect(monitorFactory).not.toHaveBeenCalled();
    expect(engine.originalAudioMonitor).toBeNull();
    await engine.stop();
  });

  it('creates no monitor for media-stream start at default volume', async () => {
    const monitorFactory = vi.fn(() => createMonitorDouble());
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.MEDIA_STREAM,
      originalAudioMonitorFactory: monitorFactory,
    });

    await engine.start(createStream());

    expect(monitorFactory).not.toHaveBeenCalled();
    expect(engine.originalAudioMonitor).toBeNull();
    expect(engine.inputPipeline).toBeNull();
    expect(engine.outputPlayer).toBeNull();
    await engine.stop();
  });

  it('lazily creates the monitor after PCM start with the exact borrowed stream', async () => {
    const track = { stop: vi.fn() };
    const stream = createStream(track);
    const monitor = createMonitorDouble();
    const monitorFactory = vi.fn(() => monitor);
    const input = createDouble();
    const output = createDouble();
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: input,
      outputPlayer: output,
      originalAudioMonitorFactory: monitorFactory,
    });
    await engine.start(stream);
    const inputStarts = input.start.mock.calls.length;

    await expect(engine.setOriginalVolume(0.5)).resolves.toBe(0.5);

    expect(monitorFactory).toHaveBeenCalledOnce();
    expect(monitorFactory.mock.calls[0][0]).not.toHaveProperty('sampleRate');
    expect(monitor.start).toHaveBeenCalledOnce();
    expect(monitor.start).toHaveBeenCalledWith(stream, 0.5);
    expect(monitor.start.mock.calls[0][0]).toBe(stream);
    expect(input.start).toHaveBeenCalledTimes(inputStarts);
    expect(track.stop).not.toHaveBeenCalled();
    await engine.stop();
    expect(track.stop).not.toHaveBeenCalled();
  });

  it('lazily creates the monitor after media-stream start with the exact borrowed stream', async () => {
    const track = { stop: vi.fn() };
    const stream = createStream(track);
    const monitor = createMonitorDouble();
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.MEDIA_STREAM,
      originalAudioMonitor: monitor,
    });
    await engine.start(stream);

    await expect(engine.setOriginalVolume(0.4)).resolves.toBe(0.4);

    expect(monitor.start).toHaveBeenCalledOnce();
    expect(monitor.start).toHaveBeenCalledWith(stream, 0.4);
    expect(monitor.start.mock.calls[0][0]).toBe(stream);
    expect(engine.inputPipeline).toBeNull();
    expect(engine.outputPlayer).toBeNull();
    expect(track.stop).not.toHaveBeenCalled();
    await engine.stop();
    expect(track.stop).not.toHaveBeenCalled();
  });

  it('reuses one monitor across repeated non-zero volumes', async () => {
    const monitor = createMonitorDouble();
    const monitorFactory = vi.fn(() => monitor);
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitorFactory: monitorFactory,
    });
    await engine.start(createStream());

    await engine.setOriginalVolume(0.5);
    await engine.setOriginalVolume(0.7);

    expect(monitorFactory).toHaveBeenCalledOnce();
    expect(monitor.start).toHaveBeenCalledOnce();
    expect(monitor.setVolume).toHaveBeenCalledWith(0.7);
    expect(engine.getOriginalVolume()).toBe(0.7);
    await engine.stop();
  });

  it('keeps the monitor alive at gain 0 on mute', async () => {
    const monitor = createMonitorDouble();
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitor: monitor,
    });
    await engine.start(createStream());

    await engine.setOriginalVolume(0.5);
    const instance = engine.originalAudioMonitor;
    await engine.setOriginalVolume(0);

    expect(engine.originalAudioMonitor).toBe(instance);
    expect(monitor.start).toHaveBeenCalledOnce();
    expect(monitor.setVolume).toHaveBeenCalledWith(0);
    expect(monitor.stop).not.toHaveBeenCalled();
    expect(engine.getOriginalVolume()).toBe(0);
    await engine.stop();
  });

  it('does not rebuild across mute and unmute cycles', async () => {
    const monitor = createMonitorDouble();
    const monitorFactory = vi.fn(() => monitor);
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitorFactory: monitorFactory,
    });
    await engine.start(createStream());

    await engine.setOriginalVolume(0.5);
    await engine.setOriginalVolume(0);
    await engine.setOriginalVolume(0.3);

    expect(monitorFactory).toHaveBeenCalledOnce();
    expect(monitor.start).toHaveBeenCalledOnce();
    expect(engine.originalAudioMonitor).toBe(monitor);
    await engine.stop();
  });

  it('applies a pre-start non-zero volume during start', async () => {
    const stream = createStream();
    const monitor = createMonitorDouble();
    const monitorFactory = vi.fn(() => monitor);
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitorFactory: monitorFactory,
    });

    await expect(engine.setOriginalVolume(0.6)).resolves.toBe(0.6);
    expect(monitorFactory).not.toHaveBeenCalled();

    await engine.start(stream);

    expect(monitorFactory).toHaveBeenCalledOnce();
    expect(monitor.start).toHaveBeenCalledWith(stream, 0.6);
    expect(engine.getOriginalVolume()).toBe(0.6);
    await engine.stop();
  });

  it('rejects invalid original volumes consistently', async () => {
    const monitorFactory = vi.fn(() => createMonitorDouble());
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitorFactory: monitorFactory,
    });
    await engine.start(createStream());

    for (const volume of [-1, 2, Number.NaN, Number.POSITIVE_INFINITY, '0.5', null, {}]) {
      await expect(engine.setOriginalVolume(volume)).rejects.toThrow(RangeError);
    }
    expect(monitorFactory).not.toHaveBeenCalled();
    expect(() => new LiveDubbingAudioEngine({ originalVolume: 2 }))
      .toThrow(RangeError);
    await engine.stop();
  });

  it('stops the monitor and clears the borrowed stream on stop', async () => {
    const monitor = createMonitorDouble();
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitor: monitor,
    });
    await engine.start(createStream());
    await engine.setOriginalVolume(0.5);
    expect(engine.monitorStream).not.toBeNull();

    await engine.stop();

    expect(monitor.stop).toHaveBeenCalledOnce();
    expect(engine.originalAudioMonitor).toBeNull();
    expect(engine.monitorStream).toBeNull();
  });

  it('does not let a pending monitor startup survive stop', async () => {
    let resolveMonitorStart;
    const track = { stop: vi.fn() };
    const monitor = createMonitorDouble({
      start: vi.fn(() => new Promise(resolve => { resolveMonitorStart = resolve; })),
    });
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitor: monitor,
    });
    await engine.start(createStream(track));

    const pending = engine.setOriginalVolume(0.5);
    await vi.waitFor(() => expect(monitor.start).toHaveBeenCalledOnce());
    const stopping = engine.stop();
    resolveMonitorStart();
    await expect(pending).rejects.toMatchObject({
      code: 'LIVE_DUBBING_PIPELINE_SETUP_CANCELLED',
    });
    await stopping;

    expect(monitor.stop).toHaveBeenCalledOnce();
    expect(engine.originalAudioMonitor).toBeNull();
    expect(engine.monitorStream).toBeNull();
    expect(track.stop).not.toHaveBeenCalled();
  });

  it('stops the monitor once across idempotent stops', async () => {
    const monitor = createMonitorDouble();
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitor: monitor,
    });
    await engine.start(createStream());
    await engine.setOriginalVolume(0.5);

    await Promise.all([engine.stop(), engine.stop()]);

    expect(monitor.stop).toHaveBeenCalledOnce();
  });

  it('keeps PCM readiness free of monitor state', async () => {
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitor: createMonitorDouble(),
    });
    await engine.start(createStream());
    await engine.setOriginalVolume(0.5);

    expect(engine.getReadiness()).toEqual({
      audioPathReady: true,
      inputPipelineReady: true,
      outputPipelineReady: true,
    });
    await engine.stop();
  });

  it('keeps media-stream readiness truthful with a monitor', async () => {
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.MEDIA_STREAM,
      originalAudioMonitor: createMonitorDouble(),
    });
    await engine.start(createStream());
    await engine.setOriginalVolume(0.5);

    expect(engine.getReadiness()).toEqual({
      audioPathReady: true,
      inputPipelineReady: false,
      outputPipelineReady: false,
    });
    expect(engine.inputPipeline).toBeNull();
    expect(engine.outputPlayer).toBeNull();
    await engine.stop();
  });

  it('leaves translated PCM transport unchanged with a monitor', async () => {
    const output = createDouble();
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: output,
      originalAudioMonitor: createMonitorDouble(),
    });
    await engine.start(createStream());
    await engine.setOriginalVolume(0.5);

    const bytes = new Uint8Array([1, 2]);
    expect(engine.enqueuePcm16(bytes, { epoch: 2 })).toEqual({ accepted: true });
    expect(output.enqueuePcm16).toHaveBeenCalledWith(bytes, { epoch: 2 });
    engine.resetEpoch(3);
    expect(output.resetEpoch).toHaveBeenCalledWith(3);
    output.getMetrics = vi.fn(() => ({ queuedSamples: 7 }));
    expect(engine.getOutputMetrics()).toMatchObject({ queuedSamples: 7 });
    await engine.stop();
  });

  it('builds the monitor natively without a capture sample rate', async () => {
    const fake = createMonitorContext();
    const track = { stop: vi.fn() };
    const stream = createStream(track);
    const audioContextFactory = vi.fn(async () => fake.context);
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      audioContextFactory,
    });
    await engine.start(stream);

    await engine.setOriginalVolume(0.5);

    expect(audioContextFactory).toHaveBeenCalledOnce();
    expect(audioContextFactory.mock.calls[0].length).toBe(0);
    expect(fake.context.createMediaStreamSource).toHaveBeenCalledWith(stream);
    expect(engine.originalAudioMonitor).not.toBeNull();
    await engine.stop();
    expect(track.stop).not.toHaveBeenCalled();
  });

  it('rejects lazy monitor failure without stopping the stream', async () => {
    const track = { stop: vi.fn() };
    const monitor = createMonitorDouble({
      start: vi.fn(async () => { throw new Error('monitor boom'); }),
    });
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitor: monitor,
    });
    await engine.start(createStream(track));

    await expect(engine.setOriginalVolume(0.5)).rejects.toThrow('monitor boom');

    expect(monitor.stop).toHaveBeenCalledOnce();
    expect(engine.originalAudioMonitor).toBeNull();
    expect(track.stop).not.toHaveBeenCalled();
    await engine.stop();
  });

  it('stores 0 without creating a monitor on an active engine', async () => {
    const monitorFactory = vi.fn(() => createMonitorDouble());
    const audioContextFactory = vi.fn(async () => createMonitorContext().context);
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitorFactory: monitorFactory,
      audioContextFactory,
    });
    await engine.start(createStream());

    await expect(engine.setOriginalVolume(0)).resolves.toBe(0);

    expect(engine.getOriginalVolume()).toBe(0);
    expect(engine.originalAudioMonitor).toBeNull();
    expect(monitorFactory).not.toHaveBeenCalled();
    expect(audioContextFactory).not.toHaveBeenCalled();
    await engine.stop();
  });

  it('mutes a pending monitor from an earlier non-zero without a second monitor', async () => {
    let resolveMonitorStart;
    const monitor = createMonitorDouble({
      start: vi.fn(() => new Promise(resolve => { resolveMonitorStart = resolve; })),
    });
    const monitorFactory = vi.fn(() => monitor);
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitorFactory: monitorFactory,
    });
    await engine.start(createStream());

    const pending = engine.setOriginalVolume(0.5);
    await vi.waitFor(() => expect(monitor.start).toHaveBeenCalledOnce());
    const muting = engine.setOriginalVolume(0);
    resolveMonitorStart();
    await expect(pending).resolves.toBe(0.5);
    await expect(muting).resolves.toBe(0);

    expect(monitorFactory).toHaveBeenCalledOnce();
    expect(monitor.start).toHaveBeenCalledOnce();
    expect(engine.originalAudioMonitor).toBe(monitor);
    expect(monitor.setVolume).toHaveBeenLastCalledWith(0);
    expect(engine.getOriginalVolume()).toBe(0);
    await engine.stop();
  });

  it('forwards mute to a starting real monitor before it resolves', async () => {
    let resolveCtx;
    const ctxGate = new Promise(resolve => {
      resolveCtx = resolve;
    });
    const fake = createMonitorContext();
    const audioContextFactory = vi.fn(() => ctxGate.then(() => fake.context));
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      audioContextFactory,
    });
    await engine.start(createStream());

    const pending = engine.setOriginalVolume(0.6);
    await vi.waitFor(() => expect(engine._pendingOriginalMonitor).not.toBeNull());

    const muting = engine.setOriginalVolume(0);
    await expect(muting).resolves.toBe(0);
    expect(engine.getOriginalVolume()).toBe(0);
    expect(engine._pendingOriginalMonitor.getVolume()).toBe(0);

    resolveCtx();
    await expect(pending).resolves.toBe(0.6);

    expect(audioContextFactory).toHaveBeenCalledOnce();
    expect(engine.originalAudioMonitor).not.toBeNull();
    expect(fake.gain.gain.setValueAtTime).not.toHaveBeenCalledWith(0.6, expect.anything());
    expect(fake.gain.gain.setValueAtTime).toHaveBeenLastCalledWith(0, expect.anything());
    expect(engine.getOriginalVolume()).toBe(0);
    await engine.stop();
  });

  it('forwards a newer volume to a starting monitor without a second graph', async () => {
    let resolveStart;
    const startGate = new Promise(resolve => {
      resolveStart = resolve;
    });
    const monitor = createMonitorDouble({
      start: vi.fn(() => startGate),
    });
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitor: monitor,
    });
    await engine.start(createStream());

    const first = engine.setOriginalVolume(0.4);
    await vi.waitFor(() => expect(monitor.start).toHaveBeenCalledOnce());
    expect(engine._pendingOriginalMonitor).toBe(monitor);

    const second = engine.setOriginalVolume(0.8);
    await expect(second).resolves.toBe(0.8);
    expect(monitor.setVolume).toHaveBeenCalledWith(0.8);
    expect(engine.getOriginalVolume()).toBe(0.8);

    resolveStart();
    await expect(first).resolves.toBe(0.4);

    expect(monitor.start).toHaveBeenCalledOnce();
    expect(monitor.setVolume).not.toHaveBeenCalledWith(0.4);
    expect(monitor.setVolume).toHaveBeenLastCalledWith(0.8);
    expect(engine.originalAudioMonitor).toBe(monitor);
    expect(engine.getOriginalVolume()).toBe(0.8);
    await engine.stop();
  });

  it('lets a newer non-zero supersede a hanging startup without a second graph', async () => {
    let resolveFactory;
    const factoryGate = new Promise(resolve => {
      resolveFactory = resolve;
    });
    const monitor = createMonitorDouble();
    const monitorFactory = vi.fn(() => factoryGate.then(() => monitor));
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitorFactory: monitorFactory,
    });
    await engine.start(createStream());

    const first = engine.setOriginalVolume(0.4);
    await vi.waitFor(() => expect(monitorFactory).toHaveBeenCalledOnce());

    const second = engine.setOriginalVolume(0.8);
    await expect(second).resolves.toBe(0.8);
    expect(monitorFactory).toHaveBeenCalledOnce();

    resolveFactory();
    await expect(first).resolves.toBe(0.4);

    expect(monitorFactory).toHaveBeenCalledOnce();
    expect(monitor.start).toHaveBeenCalledOnce();
    expect(monitor.start).toHaveBeenCalledWith(expect.anything(), 0.8);
    expect(monitor.setVolume).not.toHaveBeenCalledWith(0.4);
    expect(monitor.setVolume).toHaveBeenLastCalledWith(0.8);
    expect(engine.originalAudioMonitor).toBe(monitor);
    expect(engine.getOriginalVolume()).toBe(0.8);
    await engine.stop();
  });

  it('resolves mute promptly while a monitor startup hangs', async () => {
    let resolveFactory;
    const factoryGate = new Promise(resolve => {
      resolveFactory = resolve;
    });
    const monitor = createMonitorDouble();
    const monitorFactory = vi.fn(() => factoryGate.then(() => monitor));
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitorFactory: monitorFactory,
    });
    await engine.start(createStream());

    const pending = engine.setOriginalVolume(0.6);
    await vi.waitFor(() => expect(monitorFactory).toHaveBeenCalledOnce());

    await expect(engine.setOriginalVolume(0)).resolves.toBe(0);
    expect(engine.getOriginalVolume()).toBe(0);

    resolveFactory();
    await expect(pending).resolves.toBe(0.6);

    expect(monitorFactory).toHaveBeenCalledOnce();
    expect(monitor.start).toHaveBeenCalledOnce();
    expect(monitor.setVolume).not.toHaveBeenCalledWith(0.6);
    expect(monitor.setVolume).toHaveBeenLastCalledWith(0);
    expect(engine.originalAudioMonitor).toBe(monitor);
    expect(engine.getOriginalVolume()).toBe(0);
    await engine.stop();
  });

  it.each([
    ['originalVolume', { originalVolume: 0.3, originalAudioVolume: 0.7 }, 0.3],
    ['originalAudioVolume', { originalAudioVolume: 0.4 }, 0.4],
    ['default', {}, 0],
  ])('resolves constructor volume precedence for %s', (name, options, expected) => {
    void name;
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      ...options,
    });

    expect(engine.getOriginalVolume()).toBe(expected);
  });

  it.each([
    [null], ['0.5'], [Number.NaN], [Number.POSITIVE_INFINITY], [-1], [2], [{}],
  ])('rejects explicit invalid constructor originalVolume %p', volume => {
    expect(() => new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      originalVolume: volume,
    })).toThrow(RangeError);
  });

  it.each([
    [null], ['0.5'], [Number.NaN], [Number.NEGATIVE_INFINITY], [-0.5], [1.5], [[]],
  ])('rejects explicit invalid constructor originalAudioVolume %p', volume => {
    expect(() => new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      originalAudioVolume: volume,
    })).toThrow(RangeError);
  });

  it('resolves stop while a monitor start is pending', async () => {
    let resolveMonitorStart;
    const monitor = createMonitorDouble({
      start: vi.fn(() => new Promise(resolve => { resolveMonitorStart = resolve; })),
    });
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitor: monitor,
    });
    await engine.start(createStream());

    const pending = engine.setOriginalVolume(0.5);
    await vi.waitFor(() => expect(monitor.start).toHaveBeenCalledOnce());
    await expect(engine.stop()).resolves.toBeUndefined();
    resolveMonitorStart();
    await expect(pending).rejects.toMatchObject({
      code: 'LIVE_DUBBING_PIPELINE_SETUP_CANCELLED',
    });
  });

  it('stops the starting monitor without awaiting its start', async () => {
    let resolveMonitorStart;
    const monitor = createMonitorDouble({
      start: vi.fn(() => new Promise(resolve => { resolveMonitorStart = resolve; })),
    });
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitor: monitor,
    });
    await engine.start(createStream());

    const pending = engine.setOriginalVolume(0.5);
    await vi.waitFor(() => expect(monitor.start).toHaveBeenCalledOnce());
    await engine.stop();
    expect(monitor.stop).toHaveBeenCalledOnce();
    resolveMonitorStart();
    await expect(pending).rejects.toMatchObject({
      code: 'LIVE_DUBBING_PIPELINE_SETUP_CANCELLED',
    });
    expect(monitor.stop).toHaveBeenCalledOnce();
  });

  it('never attaches a stale monitor start resolution after stop', async () => {
    let resolveMonitorStart;
    const monitor = createMonitorDouble({
      start: vi.fn(() => new Promise(resolve => { resolveMonitorStart = resolve; })),
    });
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitor: monitor,
    });
    await engine.start(createStream());

    const pending = engine.setOriginalVolume(0.5);
    await vi.waitFor(() => expect(monitor.start).toHaveBeenCalledOnce());
    await engine.stop();
    resolveMonitorStart();
    await expect(pending).rejects.toMatchObject({
      code: 'LIVE_DUBBING_PIPELINE_SETUP_CANCELLED',
    });

    expect(engine.originalAudioMonitor).toBeNull();
    expect(engine.monitorStream).toBeNull();
  });

  it('does not block stop on a pending monitor factory', async () => {
    let resolveFactory;
    const factory = vi.fn(() => new Promise(resolve => { resolveFactory = resolve; }));
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitorFactory: factory,
    });
    await engine.start(createStream());

    const pending = engine.setOriginalVolume(0.5);
    await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce());
    await expect(engine.stop()).resolves.toBeUndefined();
    resolveFactory(createMonitorDouble());
    await expect(pending).rejects.toMatchObject({
      code: 'LIVE_DUBBING_PIPELINE_SETUP_CANCELLED',
    });
  });

  it('cleans a stale factory product without attaching it', async () => {
    let resolveFactory;
    const factory = vi.fn(() => new Promise(resolve => { resolveFactory = resolve; }));
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitorFactory: factory,
    });
    await engine.start(createStream());

    const pending = engine.setOriginalVolume(0.5);
    await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce());
    await engine.stop();
    const stale = createMonitorDouble();
    resolveFactory(stale);
    await expect(pending).rejects.toMatchObject({
      code: 'LIVE_DUBBING_PIPELINE_SETUP_CANCELLED',
    });

    expect(engine.originalAudioMonitor).toBeNull();
    expect(stale.start).not.toHaveBeenCalled();
    expect(stale.stop).toHaveBeenCalledOnce();
  });

  it('never stops borrowed tracks across stop-during-monitor-startup', async () => {
    const track = { stop: vi.fn() };
    let resolveFactory;
    const factory = vi.fn(() => new Promise(resolve => { resolveFactory = resolve; }));
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.MEDIA_STREAM,
      originalAudioMonitorFactory: factory,
    });
    await engine.start(createStream(track));

    const pending = engine.setOriginalVolume(0.5);
    await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce());
    await engine.stop();
    resolveFactory(createMonitorDouble());
    await expect(pending).rejects.toMatchObject({
      code: 'LIVE_DUBBING_PIPELINE_SETUP_CANCELLED',
    });

    expect(track.stop).not.toHaveBeenCalled();
    expect(engine.originalAudioMonitor).toBeNull();
    expect(engine.monitorStream).toBeNull();
  });

  it('cleans up each failed retry of the same monitor instance', async () => {
    const monitor = createMonitorDouble({
      start: vi.fn(async () => { throw new Error('monitor boom'); }),
    });
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitor: monitor,
    });
    await engine.start(createStream());

    await expect(engine.setOriginalVolume(0.5)).rejects.toThrow('monitor boom');
    expect(monitor.stop).toHaveBeenCalledOnce();
    await expect(engine.setOriginalVolume(0.5)).rejects.toThrow('monitor boom');

    expect(monitor.start).toHaveBeenCalledTimes(2);
    expect(monitor.stop).toHaveBeenCalledTimes(2);
    expect(engine.originalAudioMonitor).toBeNull();
    await engine.stop();
  });

  it('cancels a retried same-instance startup on stop without attaching it', async () => {
    const track = { stop: vi.fn() };
    let resolveMonitorStart;
    const monitor = createMonitorDouble({
      start: vi.fn()
        .mockRejectedValueOnce(new Error('first boom'))
        .mockImplementationOnce(() => new Promise(resolve => { resolveMonitorStart = resolve; })),
    });
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitor: monitor,
    });
    await engine.start(createStream(track));

    await expect(engine.setOriginalVolume(0.5)).rejects.toThrow('first boom');
    expect(monitor.stop).toHaveBeenCalledOnce();

    const retry = engine.setOriginalVolume(0.5);
    await vi.waitFor(() => expect(monitor.start).toHaveBeenCalledTimes(2));
    const stopping = engine.stop();
    resolveMonitorStart();
    await expect(retry).rejects.toMatchObject({
      code: 'LIVE_DUBBING_PIPELINE_SETUP_CANCELLED',
    });
    await stopping;

    expect(monitor.stop).toHaveBeenCalledTimes(2);
    expect(engine.originalAudioMonitor).toBeNull();
    expect(engine.monitorStream).toBeNull();
    expect(track.stop).not.toHaveBeenCalled();
  });

  it('spares an adopted instance when a stale generation resolves it', async () => {
    const track = { stop: vi.fn() };
    const stream = createStream(track);
    const shared = createMonitorDouble();
    let resolveStaleFactory;
    const staleGate = new Promise(resolve => { resolveStaleFactory = resolve; });
    const factory = vi.fn()
      .mockImplementationOnce(() => staleGate)
      .mockImplementation(() => shared);
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitorFactory: factory,
    });
    await engine.start(stream);

    // 1. Gen A startup pending on its factory.
    const stale = engine.setOriginalVolume(0.5);
    await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(1));
    // 2. Engine stop fences gen A.
    await engine.stop();
    // 3. Restart; gen B adopts the shared instance via the stored volume.
    await engine.start(stream);
    // 4. Gen B created and started instance X.
    expect(factory).toHaveBeenCalledTimes(2);
    expect(shared.start).toHaveBeenCalledOnce();
    expect(engine.originalAudioMonitor).toBe(shared);
    // 5. Stale gen A resolves with the same adopted instance.
    resolveStaleFactory(shared);
    // 6. Stale operation still rejects as cancelled.
    await expect(stale).rejects.toMatchObject({
      code: 'LIVE_DUBBING_PIPELINE_SETUP_CANCELLED',
    });
    // 7. The stale closure did not stop the adopted instance.
    expect(shared.stop).not.toHaveBeenCalled();
    // 8. X remains attached and usable for gen B.
    expect(engine.originalAudioMonitor).toBe(shared);
    await expect(engine.setOriginalVolume(0.6)).resolves.toBe(0.6);
    expect(shared.setVolume).toHaveBeenCalledWith(0.6);
    // 9. Final stop stops X exactly once for gen B; restart semantics make
    // the second lifecycle's teardown real without private-field mutation.
    await engine.stop();
    expect(shared.stop).toHaveBeenCalledOnce();
    // 10. Borrowed tracks never stopped.
    expect(track.stop).not.toHaveBeenCalled();
  });

  it('restarts the same engine and stops each lifecycle exactly once', async () => {
    const track = { stop: vi.fn() };
    const stream = createStream(track);
    const input = createDouble();
    const output = createDouble();
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: input,
      outputPlayer: output,
    });

    await engine.start(stream);
    await engine.stop();
    await engine.stop();
    expect(input.start).toHaveBeenCalledOnce();
    expect(output.start).toHaveBeenCalledOnce();
    expect(input.stop).toHaveBeenCalledOnce();
    expect(output.stop).toHaveBeenCalledOnce();

    await engine.start(stream);
    await engine.stop();
    expect(input.start).toHaveBeenCalledTimes(2);
    expect(output.start).toHaveBeenCalledTimes(2);
    expect(input.stop).toHaveBeenCalledTimes(2);
    expect(output.stop).toHaveBeenCalledTimes(2);
    expect(track.stop).not.toHaveBeenCalled();
  });

  it('joins concurrent restarts resuming from the same settled stop', async () => {
    const stream = createStream();
    const input = createDouble();
    const output = createDouble();
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: input,
      outputPlayer: output,
    });

    await engine.start(stream);
    await engine.stop();

    const [first, second] = await Promise.all([
      engine.start(stream),
      engine.start(stream),
    ]);
    expect(first).toMatchObject({ audioPathReady: true });
    expect(second).toMatchObject({ audioPathReady: true });
    expect(input.start).toHaveBeenCalledTimes(2);
    expect(output.start).toHaveBeenCalledTimes(2);

    await engine.stop();
    expect(input.stop).toHaveBeenCalledTimes(2);
    expect(output.stop).toHaveBeenCalledTimes(2);
  });

  it('does not let a stale monitor startup clear a newer lifecycle pointer', async () => {
    let resolveStaleFactory;
    let resolveFreshFactory;
    const staleGate = new Promise(resolve => { resolveStaleFactory = resolve; });
    const freshGate = new Promise(resolve => { resolveFreshFactory = resolve; });
    const factory = vi.fn()
      .mockImplementationOnce(() => staleGate)
      .mockImplementationOnce(() => freshGate);
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitorFactory: factory,
    });
    const stream = createStream();
    await engine.start(stream);

    // Gen A startup pending on its factory; stop fences it.
    const stale = engine.setOriginalVolume(0.5);
    await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(1));
    await engine.stop();

    // Park the requested volume at silence while stopped so the restart
    // itself stays monitor-free; gen B is driven explicitly below.
    await expect(engine.setOriginalVolume(0)).resolves.toBe(0);

    // Gen B startup pending on its own factory.
    await engine.start(stream);
    const fresh = engine.setOriginalVolume(0.5);
    await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(2));

    // Stale A settles with an unadopted product: cleaned and cancelled,
    // without disturbing B's pointer.
    const abandoned = createMonitorDouble();
    resolveStaleFactory(abandoned);
    await expect(stale).rejects.toMatchObject({
      code: 'LIVE_DUBBING_PIPELINE_SETUP_CANCELLED',
    });
    expect(abandoned.stop).toHaveBeenCalledOnce();

    // A concurrent volume call still joins B's one startup: no new factory.
    const monitorB = createMonitorDouble();
    const join = engine.setOriginalVolume(0.6);
    expect(factory).toHaveBeenCalledTimes(2);
    resolveFreshFactory(monitorB);
    await expect(fresh).resolves.toBe(0.5);
    await expect(join).resolves.toBe(0.6);
    expect(engine.originalAudioMonitor).toBe(monitorB);
    expect(monitorB.setVolume).toHaveBeenCalledWith(0.6);

    await engine.stop();
    expect(monitorB.stop).toHaveBeenCalledOnce();
  });

  it('keeps newer pending ownership when a stale attempt settles on the same monitor', async () => {
    const track = { stop: vi.fn() };
    const stream = createStream(track);
    let resolveFirstStart;
    let resolveSecondStart;
    const shared = createMonitorDouble({
      start: vi.fn()
        .mockImplementationOnce(() => new Promise(resolve => { resolveFirstStart = resolve; }))
        .mockImplementation(() => new Promise(resolve => { resolveSecondStart = resolve; })),
    });
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitor: shared,
    });
    await engine.start(stream);

    // Gen A pending with X; stop fences it and stops X once.
    const stale = engine.setOriginalVolume(0.5);
    await vi.waitFor(() => expect(shared.start).toHaveBeenCalledTimes(1));
    await engine.stop();
    expect(shared.stop).toHaveBeenCalledOnce();

    // Park the requested volume at silence while stopped so the restart
    // itself stays monitor-free; gen B is driven explicitly below.
    await expect(engine.setOriginalVolume(0)).resolves.toBe(0);

    // Gen B reuses X and is pending.
    await engine.start(stream);
    const fresh = engine.setOriginalVolume(0.5);
    await vi.waitFor(() => expect(shared.start).toHaveBeenCalledTimes(2));

    // Stale A settles: cancelled, must not clear B's pending slot or stop X.
    resolveFirstStart();
    await expect(stale).rejects.toMatchObject({
      code: 'LIVE_DUBBING_PIPELINE_SETUP_CANCELLED',
    });
    expect(shared.stop).toHaveBeenCalledOnce();
    expect(engine._pendingOriginalMonitor).toBe(shared);

    // B completes and attaches X; final stop cleans it exactly once for B.
    resolveSecondStart();
    await expect(fresh).resolves.toBe(0.5);
    expect(engine.originalAudioMonitor).toBe(shared);
    await engine.stop();
    expect(shared.stop).toHaveBeenCalledTimes(2);
    expect(track.stop).not.toHaveBeenCalled();
  });

  it('does not stop a stale attempt twice across restart without adoption', async () => {
    const track = { stop: vi.fn() };
    const stream = createStream(track);
    let resolveStaleStart;
    const shared = createMonitorDouble({
      start: vi.fn()
        .mockImplementationOnce(() => new Promise(resolve => { resolveStaleStart = resolve; }))
        .mockImplementation(async () => {}),
    });
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitor: shared,
    });
    await engine.start(stream);

    // Gen A begins a lazy startup and remains pending.
    const stale = engine.setOriginalVolume(0.5);
    await vi.waitFor(() => expect(shared.start).toHaveBeenCalledTimes(1));
    // Stop fences gen A: X.stop called once.
    await engine.stop();
    expect(shared.stop).toHaveBeenCalledOnce();
    // Park the volume at silence so the restart adopts no monitor.
    await expect(engine.setOriginalVolume(0)).resolves.toBe(0);

    // Restart creates no monitor.
    await engine.start(stream);
    expect(engine.originalAudioMonitor).toBeNull();

    // Stale gen A settles: cancelled, and still exactly one stop — the
    // restart must not have re-armed cleanup for the pending stale attempt.
    resolveStaleStart();
    await expect(stale).rejects.toMatchObject({
      code: 'LIVE_DUBBING_PIPELINE_SETUP_CANCELLED',
    });
    expect(shared.stop).toHaveBeenCalledOnce();

    // Gen B reuses X and succeeds.
    await expect(engine.setOriginalVolume(0.5)).resolves.toBe(0.5);
    expect(engine.originalAudioMonitor).toBe(shared);
    // Final stop cleans X exactly once for gen B.
    await engine.stop();
    expect(shared.stop).toHaveBeenCalledTimes(2);
    expect(track.stop).not.toHaveBeenCalled();
  });

  it('does not restop a stale attempt settled after a newer attempt was cleaned', async () => {
    const track = { stop: vi.fn() };
    const stream = createStream(track);
    let resolveStaleStart;
    const shared = createMonitorDouble({
      start: vi.fn()
        .mockImplementationOnce(() => new Promise(resolve => { resolveStaleStart = resolve; }))
        .mockImplementation(async () => {}),
    });
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitor: shared,
    });
    await engine.start(stream);

    // Attempt A pending with X; stop cleans A: total 1.
    const stale = engine.setOriginalVolume(0.5);
    await vi.waitFor(() => expect(shared.start).toHaveBeenCalledTimes(1));
    await engine.stop();
    expect(shared.stop).toHaveBeenCalledOnce();
    await expect(engine.setOriginalVolume(0)).resolves.toBe(0);

    // Restart monitor-free; attempt B succeeds with the same X.
    await engine.start(stream);
    await expect(engine.setOriginalVolume(0.5)).resolves.toBe(0.5);
    expect(engine.originalAudioMonitor).toBe(shared);

    // Stop cleans B: total 2.
    await engine.stop();
    expect(shared.stop).toHaveBeenCalledTimes(2);

    // Only now stale A settles: cancelled, and no third stop — stopping B
    // must not have forgotten that A was already cleaned.
    resolveStaleStart();
    await expect(stale).rejects.toMatchObject({
      code: 'LIVE_DUBBING_PIPELINE_SETUP_CANCELLED',
    });
    expect(shared.stop).toHaveBeenCalledTimes(2);
    expect(track.stop).not.toHaveBeenCalled();
  });

  it('releases attached attempt tokens so the stopped set stays bounded', async () => {
    const stream = createStream();
    const shared = createMonitorDouble();
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: createDouble(),
      originalAudioMonitor: shared,
    });

    for (let cycle = 0; cycle < 5; cycle++) {
      await engine.start(stream);
      await expect(engine.setOriginalVolume(0.5)).resolves.toBe(0.5);
      expect(engine.originalAudioMonitor).toBe(shared);
      await engine.stop();
    }

    // Same instance reused and stopped exactly once per lifecycle, while
    // the stopped-attempt set returns to empty instead of growing.
    expect(shared.start).toHaveBeenCalledTimes(5);
    expect(shared.stop).toHaveBeenCalledTimes(5);
    expect(engine._stoppedOriginalAttempts.size).toBe(0);
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

  it('defaults dubbed volume to full gain', () => {
    const engine = new LiveDubbingAudioEngine({ audioMode: LIVE_DUBBING_AUDIO_MODES.PCM });

    expect(engine.getDubbedVolume()).toBe(1);
  });

  it('delegates runtime dubbed volume to the active player without recreation', async () => {
    const output = createDouble();
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: output,
    });
    await engine.start(createStream());
    expect(output.setVolume).toHaveBeenCalledWith(1);
    expect(output.start).toHaveBeenCalledOnce();
    output.setVolume.mockClear();

    expect(engine.setDubbedVolume(0.5)).toBe(0.5);

    expect(output.setVolume).toHaveBeenCalledWith(0.5);
    expect(output.setVolume).toHaveBeenCalledOnce();
    expect(output.start).toHaveBeenCalledOnce();
    expect(engine.getDubbedVolume()).toBe(0.5);
    await engine.stop();
  });

  it('applies a pre-start dubbed volume to a factory-created player', async () => {
    const output = createDouble();
    const outputPlayerFactory = vi.fn(() => output);
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayerFactory,
    });

    expect(engine.setDubbedVolume(0.3)).toBe(0.3);

    await engine.start(createStream());

    expect(outputPlayerFactory).toHaveBeenCalledOnce();
    expect(output.setVolume).toHaveBeenCalledWith(0.3);
    expect(engine.getDubbedVolume()).toBe(0.3);
    await engine.stop();
  });

  it('applies a pre-start dubbed volume to real PCM gain before playback', async () => {
    const fake = createOutputContext();
    const player = new PcmOutputPlayer({
      audioContextFactory: vi.fn(async () => fake.context),
      audioWorkletNodeFactory: vi.fn(() => fake.node),
    });
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: player,
    });

    engine.setDubbedVolume(0.4);
    await engine.start(createStream());

    expect(player.getVolume()).toBe(0.4);
    expect(fake.gainNode.gain.value).toBe(0.4);
    expect(fake.node.connect).toHaveBeenCalledWith(fake.gainNode);
    await engine.stop();
  });

  it('rejects invalid dubbed volumes without touching the player', async () => {
    const output = createDouble();
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: output,
    });
    await engine.start(createStream());
    output.setVolume.mockClear();

    for (const volume of [-1, 2, Number.NaN, Number.POSITIVE_INFINITY, '0.5', null, {}]) {
      expect(() => engine.setDubbedVolume(volume)).toThrow(RangeError);
    }
    expect(output.setVolume).not.toHaveBeenCalled();
    expect(engine.getDubbedVolume()).toBe(1);
    expect(() => new LiveDubbingAudioEngine({ dubbedVolume: 2 }))
      .toThrow(RangeError);
    await engine.stop();
  });

  it('leaves original volume and monitor untouched by dubbed changes', async () => {
    const monitorFactory = vi.fn(() => createMonitorDouble());
    const output = createDouble();
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.PCM,
      inputPipeline: createDouble(),
      outputPlayer: output,
      originalAudioMonitorFactory: monitorFactory,
    });
    await engine.start(createStream());

    engine.setDubbedVolume(0.5);

    expect(engine.getDubbedVolume()).toBe(0.5);
    expect(engine.getOriginalVolume()).toBe(0);
    expect(monitorFactory).not.toHaveBeenCalled();
    expect(engine.originalAudioMonitor).toBeNull();

    await engine.setOriginalVolume(0.4);

    expect(engine.getOriginalVolume()).toBe(0.4);
    expect(engine.getDubbedVolume()).toBe(0.5);
    await engine.stop();
  });
});
