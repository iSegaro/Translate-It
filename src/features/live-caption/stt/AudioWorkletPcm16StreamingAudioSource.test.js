import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AudioWorkletPcm16StreamingAudioSource,
  AUDIO_WORKLET_PCM16_MONO_STREAMING_PROCESSOR_NAME,
  AUDIO_WORKLET_PCM16_MONO_STREAMING_SAMPLE_RATE,
  AUDIO_WORKLET_PCM16_MONO_STREAMING_CHANNEL_COUNT,
  AUDIO_WORKLET_PCM16_MONO_STREAMING_BIT_DEPTH,
  AUDIO_WORKLET_PCM16_MONO_STREAMING_MIME_TYPE
} from './AudioWorkletPcm16StreamingAudioSource.js';
import { STREAMING_AUDIO_FORMATS, STREAMING_AUDIO_SOURCE_STATES } from './StreamingAudioSource.js';
import { downmixFrameToMono } from './worklets/pcm16MonoStreamingProcessor.js';

function createMockEnvironment() {
  const trackStop = vi.fn();
  const mediaStream = {
    getTracks: () => [
      {
        stop: trackStop
      }
    ]
  };

  const mediaStreamSource = {
    connect: vi.fn(),
    disconnect: vi.fn()
  };

  const port = {
    onmessage: null,
    close: vi.fn()
  };

  const audioWorkletNode = {
    port,
    connect: vi.fn(),
    disconnect: vi.fn()
  };

  const audioContext = {
    sampleRate: 48000,
    state: 'running',
    destination: {},
    audioWorklet: {
      addModule: vi.fn().mockResolvedValue(undefined)
    },
    createMediaStreamSource: vi.fn(() => mediaStreamSource),
    suspend: vi.fn().mockImplementation(async () => {
      audioContext.state = 'suspended';
    }),
    resume: vi.fn().mockImplementation(async () => {
      audioContext.state = 'running';
    }),
    close: vi.fn().mockImplementation(async () => {
      audioContext.state = 'closed';
    })
  };

  return {
    trackStop,
    mediaStream,
    mediaStreamSource,
    port,
    audioWorkletNode,
    audioContext
  };
}

describe('AudioWorkletPcm16StreamingAudioSource', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits PCM16 mono chunks at 16 kHz from worklet frames', async () => {
    const emittedChunks = [];
    const events = [];
    const env = createMockEnvironment();
    const source = new AudioWorkletPcm16StreamingAudioSource({
      audioContextFactory: vi.fn(async () => env.audioContext),
      audioWorkletNodeFactory: vi.fn(() => env.audioWorkletNode),
      audioWorkletModuleUrl: 'mock://pcm16-worklet.js',
      onChunk: (chunk) => emittedChunks.push(chunk),
      onStateChange: (state, details) => events.push({ state, details })
    });

    const snapshot = await source.start({
      sessionId: 'session-1',
      tabId: 17,
      videoFingerprint: 'video-a'
    }, {
      stream: env.mediaStream,
      chunkTimeslice: 100,
      audioContextOptions: { latencyHint: 'interactive' },
      processorOptions: { windowSize: 1024 }
    });

    expect(snapshot.state).toBe(STREAMING_AUDIO_SOURCE_STATES.ACTIVE);
    expect(source.captureState).toBe('capturing');
    expect(env.audioContext.audioWorklet.addModule).toHaveBeenCalledWith('mock://pcm16-worklet.js');
    expect(env.audioContext.createMediaStreamSource).toHaveBeenCalledWith(env.mediaStream);
    expect(env.mediaStreamSource.connect).toHaveBeenCalledWith(env.audioWorkletNode);

    const workletFrame = new Float32Array(4800).fill(0.5);
    env.port.onmessage?.({
      data: {
        type: 'frame',
        samples: workletFrame,
        sampleRate: 48000
      }
    });

    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();

    expect(emittedChunks).toHaveLength(1);
    const chunk = emittedChunks[0];
    expect(chunk.format).toBe(STREAMING_AUDIO_FORMATS.PCM16_MONO_16KHZ);
    expect(chunk.sampleRate).toBe(AUDIO_WORKLET_PCM16_MONO_STREAMING_SAMPLE_RATE);
    expect(chunk.channelCount).toBe(AUDIO_WORKLET_PCM16_MONO_STREAMING_CHANNEL_COUNT);
    expect(chunk.bitDepth).toBe(AUDIO_WORKLET_PCM16_MONO_STREAMING_BIT_DEPTH);
    expect(chunk.mimeType).toBe(AUDIO_WORKLET_PCM16_MONO_STREAMING_MIME_TYPE);
    expect(chunk.chunkStartMs).toBe(0);
    expect(chunk.chunkEndMs).toBe(100);
    expect(chunk.payload).toBeInstanceOf(Uint8Array);
    expect(chunk.payload.length).toBe(3200);
    const firstSample = new DataView(chunk.payload.buffer, chunk.payload.byteOffset, chunk.payload.byteLength).getInt16(0, true);
    expect(firstSample).toBeGreaterThan(0);
    expect(events.some((entry) => entry.state === 'starting')).toBe(true);
    expect(events.some((entry) => entry.state === 'capturing')).toBe(true);
  });

  it('downmixes multichannel frames to mono before source-side resampling', () => {
    const mono = downmixFrameToMono([
      Float32Array.from([1, 0.5, -0.5]),
      Float32Array.from([0, 0.5, 0.5])
    ]);

    expect(mono).toBeInstanceOf(Float32Array);
    expect(Array.from(mono)).toEqual([0.5, 0.5, 0]);
  });

  it('stops and destroys idempotently while releasing audio resources exactly once', async () => {
    const env = createMockEnvironment();
    const source = new AudioWorkletPcm16StreamingAudioSource({
      audioContextFactory: vi.fn(async () => env.audioContext),
      audioWorkletNodeFactory: vi.fn(() => env.audioWorkletNode),
      audioWorkletModuleUrl: 'mock://pcm16-worklet.js'
    });

    await source.start({
      sessionId: 'session-2',
      tabId: 21,
      videoFingerprint: 'video-b'
    }, {
      stream: env.mediaStream,
      chunkTimeslice: 100
    });

    env.port.onmessage?.({
      data: {
        type: 'frame',
        samples: new Float32Array([0, 1, -1, 0.25]),
        sampleRate: 48000
      }
    });

    await source.pause();
    expect(source.captureState).toBe('paused');
    await source.resume();
    expect(source.captureState).toBe('capturing');

    await source.stop();
    await source.stop();
    await source.destroy();
    await source.destroy();

    expect(env.audioContext.audioWorklet.addModule).toHaveBeenCalledTimes(1);
    expect(env.mediaStreamSource.disconnect).toHaveBeenCalledTimes(1);
    expect(env.audioWorkletNode.disconnect).toHaveBeenCalledTimes(1);
    expect(env.port.close).toHaveBeenCalledTimes(1);
    expect(env.trackStop).toHaveBeenCalledTimes(1);
    expect(env.audioContext.suspend).toHaveBeenCalled();
    expect(env.audioContext.resume).toHaveBeenCalled();
    expect(env.audioContext.close).toHaveBeenCalledTimes(1);
    expect(source.getStatus().state).toBe(STREAMING_AUDIO_SOURCE_STATES.DESTROYED);
  });
});
