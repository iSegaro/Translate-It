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
import {
  PCM16_MONO_STREAMING_PROCESSOR_ASSET_PATH,
  resolvePcm16MonoStreamingProcessorModuleUrl
} from './worklets/pcm16MonoStreamingProcessorAsset.js';
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

function createLoggerSpy() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
}

describe('AudioWorkletPcm16StreamingAudioSource', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
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

  it('uses the runtime-resolved packaged asset URL by default', async () => {
    const env = createMockEnvironment();
    const getURL = vi.fn((path) => `chrome-extension://extension-id/${path}`);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      redirected: false,
      headers: {
        get: vi.fn((key) => (String(key).toLowerCase() === 'content-type' ? 'text/javascript; charset=utf-8' : null))
      },
      clone() {
        return this;
      },
      text: vi.fn().mockResolvedValue('registerProcessor("pcm16-mono-streaming-processor", class {});')
    });
    vi.stubGlobal('chrome', {
      runtime: {
        getURL
      }
    });
    vi.stubGlobal('fetch', fetchMock);
    const logger = createLoggerSpy();

    const source = new AudioWorkletPcm16StreamingAudioSource({
      audioContextFactory: vi.fn(async () => env.audioContext),
      audioWorkletNodeFactory: vi.fn(() => env.audioWorkletNode),
      logger
    });

    await source.start({
      sessionId: 'session-asset',
      tabId: 1,
      videoFingerprint: 'video-asset'
    }, {
      stream: env.mediaStream,
      chunkTimeslice: 100
    });

    expect(getURL).toHaveBeenCalledWith(PCM16_MONO_STREAMING_PROCESSOR_ASSET_PATH);
    expect(fetchMock).toHaveBeenCalledWith(`chrome-extension://extension-id/${PCM16_MONO_STREAMING_PROCESSOR_ASSET_PATH}`);
    expect(env.audioContext.audioWorklet.addModule).toHaveBeenCalledWith(
      `chrome-extension://extension-id/${PCM16_MONO_STREAMING_PROCESSOR_ASSET_PATH}`
    );
    expect(fetchMock.mock.invocationCallOrder[0]).toBeLessThan(
      env.audioContext.audioWorklet.addModule.mock.invocationCallOrder[0]
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('falls back to the runtime-resolved packaged asset URL when the constructor receives null', async () => {
    const env = createMockEnvironment();
    const getURL = vi.fn((path) => `chrome-extension://extension-id/${path}`);
    vi.stubGlobal('chrome', {
      runtime: {
        getURL
      }
    });

    const source = new AudioWorkletPcm16StreamingAudioSource({
      audioContextFactory: vi.fn(async () => env.audioContext),
      audioWorkletNodeFactory: vi.fn(() => env.audioWorkletNode),
      audioWorkletModuleUrl: null
    });

    await source.start({
      sessionId: 'session-null-module-url',
      tabId: 11,
      videoFingerprint: 'video-null-module-url'
    }, {
      stream: env.mediaStream,
      chunkTimeslice: 100
    });

    expect(getURL).toHaveBeenCalledWith(PCM16_MONO_STREAMING_PROCESSOR_ASSET_PATH);
    expect(env.audioContext.audioWorklet.addModule).toHaveBeenCalledWith(
      `chrome-extension://extension-id/${PCM16_MONO_STREAMING_PROCESSOR_ASSET_PATH}`
    );
  });

  it('falls back to the runtime-resolved packaged asset URL when the constructor receives an empty string', async () => {
    const env = createMockEnvironment();
    const getURL = vi.fn((path) => `chrome-extension://extension-id/${path}`);
    vi.stubGlobal('chrome', {
      runtime: {
        getURL
      }
    });

    const source = new AudioWorkletPcm16StreamingAudioSource({
      audioContextFactory: vi.fn(async () => env.audioContext),
      audioWorkletNodeFactory: vi.fn(() => env.audioWorkletNode),
      audioWorkletModuleUrl: ''
    });

    await source.start({
      sessionId: 'session-empty-module-url',
      tabId: 12,
      videoFingerprint: 'video-empty-module-url'
    }, {
      stream: env.mediaStream,
      chunkTimeslice: 100
    });

    expect(getURL).toHaveBeenCalledWith(PCM16_MONO_STREAMING_PROCESSOR_ASSET_PATH);
    expect(env.audioContext.audioWorklet.addModule).toHaveBeenCalledWith(
      `chrome-extension://extension-id/${PCM16_MONO_STREAMING_PROCESSOR_ASSET_PATH}`
    );
  });

  it('allows an injected audioWorkletModuleUrl to override the packaged asset URL', async () => {
    const env = createMockEnvironment();
    const getURL = vi.fn((path) => `chrome-extension://extension-id/${path}`);
    vi.stubGlobal('chrome', {
      runtime: {
        getURL
      }
    });

    const source = new AudioWorkletPcm16StreamingAudioSource({
      audioContextFactory: vi.fn(async () => env.audioContext),
      audioWorkletNodeFactory: vi.fn(() => env.audioWorkletNode),
      audioWorkletModuleUrl: 'mock://pcm16-worklet.js'
    });

    await source.start({
      sessionId: 'session-override',
      tabId: 2,
      videoFingerprint: 'video-override'
    }, {
      stream: env.mediaStream,
      chunkTimeslice: 100
    });

    expect(getURL).not.toHaveBeenCalled();
    expect(env.audioContext.audioWorklet.addModule).toHaveBeenCalledWith('mock://pcm16-worklet.js');
  });

  it('ignores null and empty start-time overrides and keeps the resolved module URL', async () => {
    const env = createMockEnvironment();
    const getURL = vi.fn((path) => `chrome-extension://extension-id/${path}`);
    vi.stubGlobal('chrome', {
      runtime: {
        getURL
      }
    });

    const source = new AudioWorkletPcm16StreamingAudioSource({
      audioContextFactory: vi.fn(async () => env.audioContext),
      audioWorkletNodeFactory: vi.fn(() => env.audioWorkletNode)
    });

    await source.start({
      sessionId: 'session-start-null-override',
      tabId: 13,
      videoFingerprint: 'video-start-null-override'
    }, {
      stream: env.mediaStream,
      chunkTimeslice: 100,
      audioWorkletModuleUrl: null
    });

    await source.stop();
    env.audioContext.audioWorklet.addModule.mockClear();

    await source.start({
      sessionId: 'session-start-empty-override',
      tabId: 14,
      videoFingerprint: 'video-start-empty-override'
    }, {
      stream: env.mediaStream,
      chunkTimeslice: 100,
      audioWorkletModuleUrl: ''
    });

    expect(getURL).toHaveBeenCalledWith(PCM16_MONO_STREAMING_PROCESSOR_ASSET_PATH);
    expect(env.audioContext.audioWorklet.addModule).toHaveBeenCalledWith(
      `chrome-extension://extension-id/${PCM16_MONO_STREAMING_PROCESSOR_ASSET_PATH}`
    );
  });

  it('rejects invalid module URLs before calling addModule', async () => {
    const env = createMockEnvironment();
    const logger = createLoggerSpy();
    const audioContext = {
      ...env.audioContext,
      audioWorklet: {
        addModule: vi.fn().mockResolvedValue(undefined)
      }
    };
    const source = new AudioWorkletPcm16StreamingAudioSource({
      audioContextFactory: vi.fn(async () => audioContext),
      audioWorkletNodeFactory: vi.fn(() => env.audioWorkletNode),
      logger
    });
    source.audioWorkletModuleUrl = '   ';

    await expect(source.start({
      sessionId: 'session-invalid-module-url',
      tabId: 15,
      videoFingerprint: 'video-invalid-module-url'
    }, {
      stream: env.mediaStream,
      chunkTimeslice: 100
    })).rejects.toMatchObject({
      code: 'audio_worklet_module_url_invalid',
      reason: 'invalid_audio_worklet_module_url'
    });

    expect(audioContext.audioWorklet.addModule).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs a preflight fetch failure and still proceeds to addModule', async () => {
    const env = createMockEnvironment();
    const fetchError = new Error('fetch failed');
    const fetchMock = vi.fn().mockRejectedValue(fetchError);
    const logger = createLoggerSpy();
    vi.stubGlobal('fetch', fetchMock);

    const source = new AudioWorkletPcm16StreamingAudioSource({
      audioContextFactory: vi.fn(async () => env.audioContext),
      audioWorkletNodeFactory: vi.fn(() => env.audioWorkletNode),
      audioWorkletModuleUrl: 'mock://pcm16-worklet.js',
      logger
    });

    await source.start({
      sessionId: 'session-preflight-failure',
      tabId: 3,
      videoFingerprint: 'video-preflight-failure'
    }, {
      stream: env.mediaStream,
      chunkTimeslice: 100
    });

    expect(fetchMock).toHaveBeenCalledWith('mock://pcm16-worklet.js');
    expect(env.audioContext.audioWorklet.addModule).toHaveBeenCalledWith('mock://pcm16-worklet.js');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('AudioWorklet PCM module diagnostics:'),
      expect.objectContaining({
        moduleUrl: 'mock://pcm16-worklet.js',
        preflight: expect.objectContaining({
          errorMessage: 'fetch failed'
        })
      })
    );
  });

  it('logs a response preview when the preflight response is not JavaScript-like', async () => {
    const env = createMockEnvironment();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      redirected: false,
      headers: {
        get: vi.fn(() => 'application/json')
      },
      clone() {
        return this;
      },
      text: vi.fn().mockResolvedValue('{"unexpected":"payload"}')
    });
    const logger = createLoggerSpy();
    vi.stubGlobal('fetch', fetchMock);

    const source = new AudioWorkletPcm16StreamingAudioSource({
      audioContextFactory: vi.fn(async () => env.audioContext),
      audioWorkletNodeFactory: vi.fn(() => env.audioWorkletNode),
      audioWorkletModuleUrl: 'mock://pcm16-worklet.js',
      logger
    });

    await source.start({
      sessionId: 'session-preflight-preview',
      tabId: 5,
      videoFingerprint: 'video-preflight-preview'
    }, {
      stream: env.mediaStream,
      chunkTimeslice: 100
    });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('AudioWorklet PCM module diagnostics:'),
      expect.objectContaining({
        moduleUrl: 'mock://pcm16-worklet.js',
        preflight: expect.objectContaining({
          contentType: 'application/json',
          responsePreview: '{"unexpected":"payload"}'
        })
      })
    );
  });

  it('logs addModule failure details including the module URL', async () => {
    const env = createMockEnvironment();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      redirected: false,
      headers: {
        get: vi.fn(() => 'text/javascript')
      },
      clone() {
        return this;
      },
      text: vi.fn().mockResolvedValue('registerProcessor("pcm16-mono-streaming-processor", class {});')
    });
    const logger = createLoggerSpy();
    const addModuleError = new Error('Unable to load a worklet\'s module.');
    env.audioContext.audioWorklet.addModule.mockRejectedValueOnce(addModuleError);
    vi.stubGlobal('fetch', fetchMock);

    const source = new AudioWorkletPcm16StreamingAudioSource({
      audioContextFactory: vi.fn(async () => env.audioContext),
      audioWorkletNodeFactory: vi.fn(() => env.audioWorkletNode),
      audioWorkletModuleUrl: 'mock://pcm16-worklet.js',
      logger
    });

    await expect(source.start({
      sessionId: 'session-module-failure',
      tabId: 4,
      videoFingerprint: 'video-module-failure'
    }, {
      stream: env.mediaStream,
      chunkTimeslice: 100
    })).rejects.toThrow("Unable to load a worklet's module.");

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('AudioWorklet PCM module diagnostics:'),
      expect.objectContaining({
        moduleUrl: 'mock://pcm16-worklet.js',
        errorMessage: "Unable to load a worklet's module.",
        fallbackReason: 'audio_worklet_module_load_failure'
      })
    );
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
    expect(env.trackStop).not.toHaveBeenCalled();
    expect(env.audioContext.suspend).toHaveBeenCalled();
    expect(env.audioContext.resume).toHaveBeenCalled();
    expect(env.audioContext.close).toHaveBeenCalledTimes(1);
    expect(source.getStatus().state).toBe(STREAMING_AUDIO_SOURCE_STATES.DESTROYED);
  });

  it('normalizes the packaged audio worklet module URL helper', () => {
    const getURL = vi.fn((path) => `chrome-extension://extension-id/${path}`);
    const runtimeUrl = resolvePcm16MonoStreamingProcessorModuleUrl({
      chrome: {
        runtime: {
          getURL
        }
      }
    });

    expect(runtimeUrl).toBe(`chrome-extension://extension-id/${PCM16_MONO_STREAMING_PROCESSOR_ASSET_PATH}`);
  });
});
