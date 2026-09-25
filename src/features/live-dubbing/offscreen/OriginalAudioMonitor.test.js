import { describe, expect, it, vi } from 'vitest';
import { OriginalAudioMonitor } from './OriginalAudioMonitor.js';

function createGain({ withSetValueAtTime = true } = {}) {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: {
      value: 1,
      ...(withSetValueAtTime ? { setValueAtTime: vi.fn() } : {}),
    },
  };
}

function createContext({ sampleRate = 48_000, gainOptions } = {}) {
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const gain = createGain(gainOptions);
  return {
    context: {
      sampleRate,
      currentTime: 7,
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

function createStream(track = { stop: vi.fn() }) {
  return {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  };
}

const INVALID_VOLUMES = [-1, -0.5, 1.5, 2, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '0.5', null, {}, []];

describe('OriginalAudioMonitor', () => {
  it('defaults to silence', () => {
    expect(new OriginalAudioMonitor().getVolume()).toBe(0);
  });

  it('accepts boundary volumes 0 and 1', () => {
    expect(new OriginalAudioMonitor({ volume: 0 }).getVolume()).toBe(0);
    expect(new OriginalAudioMonitor({ volume: 1 }).getVolume()).toBe(1);
  });

  it.each(INVALID_VOLUMES.map(volume => [volume]))('rejects invalid constructor volume %p', volume => {
    expect(() => new OriginalAudioMonitor({ volume })).toThrow(RangeError);
  });

  it('wires source -> gain -> destination and applies the initial volume', async () => {
    const fake = createContext();
    const track = { stop: vi.fn() };
    const stream = createStream(track);
    const monitor = new OriginalAudioMonitor({
      volume: 0.5,
      audioContextFactory: vi.fn(async () => fake.context),
    });

    await monitor.start(stream);

    expect(fake.context.createMediaStreamSource).toHaveBeenCalledWith(stream);
    expect(fake.source.connect).toHaveBeenCalledWith(fake.gain);
    expect(fake.gain.connect).toHaveBeenCalledWith(fake.context.destination);
    expect(fake.gain.gain.setValueAtTime).toHaveBeenCalledWith(0.5, 7);
    expect(fake.context.resume).toHaveBeenCalledOnce();
    expect(monitor.getVolume()).toBe(0.5);
    expect(track.stop).not.toHaveBeenCalled();
  });

  it('does not force a 16kHz context rate', async () => {
    const fake = createContext({ sampleRate: 48_000 });
    const factory = vi.fn(async () => fake.context);
    const monitor = new OriginalAudioMonitor({ audioContextFactory: factory });

    await monitor.start(createStream());

    expect(factory).toHaveBeenCalledOnce();
    expect(factory.mock.calls[0][0]?.sampleRate).toBeUndefined();
    expect(monitor.state).toBe('running');
  });

  it('supports the contextFactory and AudioContext seams without a sample rate', async () => {
    const first = createContext();
    const viaContextFactory = new OriginalAudioMonitor({
      contextFactory: vi.fn(async () => first.context),
    });
    await viaContextFactory.start(createStream());
    expect(viaContextFactory.state).toBe('running');
    expect(first.context.createMediaStreamSource).toHaveBeenCalledOnce();
    await viaContextFactory.stop();

    const second = createContext();
    function FakeAudioContext() {
      return second.context;
    }
    const viaConstructor = new OriginalAudioMonitor({ AudioContext: FakeAudioContext });
    await viaConstructor.start(createStream());
    expect(viaConstructor.state).toBe('running');
    await viaConstructor.stop();
  });

  it('applies the start volume argument', async () => {
    const fake = createContext();
    const monitor = new OriginalAudioMonitor({
      volume: 0.2,
      audioContextFactory: vi.fn(async () => fake.context),
    });

    await monitor.start(createStream(), 0.8);

    expect(monitor.getVolume()).toBe(0.8);
    expect(fake.gain.gain.setValueAtTime).toHaveBeenCalledWith(0.8, 7);
  });

  it.each(INVALID_VOLUMES.map(volume => [volume]))('rejects invalid start volume %p', async volume => {
    const fake = createContext();
    const monitor = new OriginalAudioMonitor({
      audioContextFactory: vi.fn(async () => fake.context),
    });

    await expect(monitor.start(createStream(), volume)).rejects.toThrow(RangeError);
    expect(fake.context.createMediaStreamSource).not.toHaveBeenCalled();
  });

  it.each(INVALID_VOLUMES.map(volume => [volume]))('rejects invalid setVolume %p', volume => {
    const monitor = new OriginalAudioMonitor();

    expect(() => monitor.setVolume(volume)).toThrow(RangeError);
    expect(monitor.getVolume()).toBe(0);
  });

  it('updates the existing gain node without rebuilding the graph', async () => {
    const fake = createContext();
    const factory = vi.fn(async () => fake.context);
    const monitor = new OriginalAudioMonitor({ audioContextFactory: factory });
    await monitor.start(createStream());

    const source = monitor.source;
    const gain = monitor.gain;
    const context = monitor.context;

    monitor.setVolume(0.25);

    expect(monitor.getVolume()).toBe(0.25);
    expect(fake.gain.gain.setValueAtTime).toHaveBeenCalledWith(0.25, 7);
    expect(monitor.source).toBe(source);
    expect(monitor.gain).toBe(gain);
    expect(monitor.context).toBe(context);
    expect(factory).toHaveBeenCalledOnce();
    expect(fake.context.createMediaStreamSource).toHaveBeenCalledOnce();
    expect(fake.context.createGain).toHaveBeenCalledOnce();
  });

  it('prefers setValueAtTime and leaves gain.value untouched on the primary path', async () => {
    const fake = createContext();
    const monitor = new OriginalAudioMonitor({
      audioContextFactory: vi.fn(async () => fake.context),
    });
    await monitor.start(createStream());

    expect(fake.gain.gain.setValueAtTime).toHaveBeenCalledWith(0, 7);
    expect(fake.gain.gain.value).toBe(1);
    monitor.setVolume(0.6);
    expect(fake.gain.gain.setValueAtTime).toHaveBeenCalledWith(0.6, 7);
    expect(fake.gain.gain.value).toBe(1);
  });

  it('falls back to gain.value when setValueAtTime is unavailable', async () => {
    const fake = createContext({ gainOptions: { withSetValueAtTime: false } });
    const monitor = new OriginalAudioMonitor({
      audioContextFactory: vi.fn(async () => fake.context),
    });
    await monitor.start(createStream());

    expect(fake.gain.gain.value).toBe(0);
    monitor.setVolume(0.6);
    expect(fake.gain.gain.value).toBe(0.6);
  });

  it('falls back to gain.value when setValueAtTime throws', async () => {
    const fake = createContext();
    fake.gain.gain.setValueAtTime = vi.fn(() => {
      throw new Error('param failed');
    });
    const monitor = new OriginalAudioMonitor({
      audioContextFactory: vi.fn(async () => fake.context),
    });
    await monitor.start(createStream());

    expect(fake.gain.gain.value).toBe(0);
    monitor.setVolume(0.6);
    expect(fake.gain.gain.value).toBe(0.6);
  });

  it('stores setVolume before start and applies it on start', async () => {
    const fake = createContext();
    const monitor = new OriginalAudioMonitor({
      audioContextFactory: vi.fn(async () => fake.context),
    });

    monitor.setVolume(0.4);
    await monitor.start(createStream());

    expect(fake.gain.gain.setValueAtTime).toHaveBeenCalledWith(0.4, 7);
    expect(monitor.getVolume()).toBe(0.4);
  });

  it('requires a MediaStream to start', async () => {
    const monitor = new OriginalAudioMonitor({
      audioContextFactory: vi.fn(async () => createContext().context),
    });

    await expect(monitor.start()).rejects.toThrow(TypeError);
    await expect(monitor.start(null)).rejects.toThrow(TypeError);
  });

  it('stops by disconnecting and closing without touching tracks', async () => {
    const fake = createContext();
    const track = { stop: vi.fn() };
    const monitor = new OriginalAudioMonitor({
      audioContextFactory: vi.fn(async () => fake.context),
    });
    await monitor.start(createStream(track));

    await monitor.stop();

    expect(fake.source.disconnect).toHaveBeenCalledOnce();
    expect(fake.gain.disconnect).toHaveBeenCalledOnce();
    expect(fake.context.close).toHaveBeenCalledOnce();
    expect(track.stop).not.toHaveBeenCalled();
    expect(monitor.state).toBe('idle');
    expect(monitor.context).toBeNull();
    expect(monitor.source).toBeNull();
    expect(monitor.gain).toBeNull();
    expect(monitor.stream).toBeNull();
  });

  it('is idempotent across repeated stops', async () => {
    const fake = createContext();
    const track = { stop: vi.fn() };
    const monitor = new OriginalAudioMonitor({
      audioContextFactory: vi.fn(async () => fake.context),
    });
    await monitor.start(createStream(track));

    await monitor.stop();
    await expect(monitor.stop()).resolves.toBeUndefined();

    expect(fake.context.close).toHaveBeenCalledOnce();
    expect(track.stop).not.toHaveBeenCalled();
  });

  it('cleans up safely after a partial start failure', async () => {
    const fake = createContext();
    fake.context.createMediaStreamSource = vi.fn(() => {
      throw new Error('source failed');
    });
    const track = { stop: vi.fn() };
    const monitor = new OriginalAudioMonitor({
      audioContextFactory: vi.fn(async () => fake.context),
    });

    await expect(monitor.start(createStream(track))).rejects.toThrow('source failed');

    expect(monitor.state).toBe('idle');
    expect(monitor.context).toBeNull();
    expect(monitor.source).toBeNull();
    expect(monitor.gain).toBeNull();
    expect(monitor.stream).toBeNull();
    expect(fake.context.close).toHaveBeenCalledOnce();
    expect(track.stop).not.toHaveBeenCalled();
  });

  it('leaves no live graph when stopped during a pending start', async () => {
    let resolveFactory;
    const gate = new Promise(resolve => {
      resolveFactory = resolve;
    });
    const fake = createContext();
    const track = { stop: vi.fn() };
    const monitor = new OriginalAudioMonitor({
      audioContextFactory: vi.fn(() => gate),
    });

    const starting = monitor.start(createStream(track));
    await monitor.stop();
    resolveFactory(fake.context);
    await expect(starting).rejects.toThrow(/cancelled/i);

    expect(monitor.state).toBe('idle');
    expect(monitor.context).toBeNull();
    expect(monitor.source).toBeNull();
    expect(monitor.gain).toBeNull();
    expect(monitor.stream).toBeNull();
    expect(fake.context.close).toHaveBeenCalledOnce();
    expect(track.stop).not.toHaveBeenCalled();
  });

  it('rejects an invalid volume during a pending start without disturbing it', async () => {
    let resolveFactory;
    const gate = new Promise(resolve => {
      resolveFactory = resolve;
    });
    const fake = createContext();
    const factory = vi.fn(() => gate);
    const monitor = new OriginalAudioMonitor({ audioContextFactory: factory });
    const stream = createStream();

    const pending = monitor.start(stream);
    await expect(monitor.start(stream, 2)).rejects.toThrow(RangeError);
    expect(monitor.getVolume()).toBe(0);

    resolveFactory(fake.context);
    await expect(pending).resolves.toMatchObject({ state: 'running', volume: 0 });

    expect(factory).toHaveBeenCalledOnce();
    expect(fake.context.createMediaStreamSource).toHaveBeenCalledOnce();
    expect(fake.context.createGain).toHaveBeenCalledOnce();
    expect(fake.gain.gain.setValueAtTime).toHaveBeenCalledWith(0, 7);

    await monitor.stop();
  });

  it('applies a valid volume given during a pending start to the created graph', async () => {
    let resolveFactory;
    const gate = new Promise(resolve => {
      resolveFactory = resolve;
    });
    const fake = createContext();
    const factory = vi.fn(() => gate);
    const monitor = new OriginalAudioMonitor({ audioContextFactory: factory });
    const stream = createStream();

    const pending = monitor.start(stream);
    const repeated = monitor.start(stream, 0.75);
    resolveFactory(fake.context);
    await expect(pending).resolves.toMatchObject({ state: 'running', volume: 0.75 });
    await expect(repeated).resolves.toMatchObject({ state: 'running', volume: 0.75 });

    expect(monitor.getVolume()).toBe(0.75);
    expect(factory).toHaveBeenCalledOnce();
    expect(fake.context.createMediaStreamSource).toHaveBeenCalledOnce();
    expect(fake.context.createGain).toHaveBeenCalledOnce();
    expect(fake.gain.gain.setValueAtTime).toHaveBeenCalledWith(0.75, 7);

    await monitor.stop();
  });

  it('creates a single graph across repeated starts', async () => {
    const fake = createContext();
    const factory = vi.fn(async () => fake.context);
    const monitor = new OriginalAudioMonitor({ audioContextFactory: factory });
    const stream = createStream();

    await monitor.start(stream);
    const source = monitor.source;
    const gain = monitor.gain;
    const context = monitor.context;
    await monitor.start(stream);

    expect(factory).toHaveBeenCalledOnce();
    expect(fake.context.createMediaStreamSource).toHaveBeenCalledOnce();
    expect(fake.context.createGain).toHaveBeenCalledOnce();
    expect(monitor.source).toBe(source);
    expect(monitor.gain).toBe(gain);
    expect(monitor.context).toBe(context);

    await monitor.stop();
  });
});
