import { describe, expect, it, vi } from 'vitest';
import {
  INPUT_FRAME_SAMPLES,
  TabAudioPipeline,
  resolveLiveDubbingFrameSamples,
} from './TabAudioPipeline.js';
import {
  buildLiveDubbingMeasurementSnapshot,
  buildLiveDubbingMeasurementSummary,
  deriveLiveDubbingTimings,
  getLiveDubbingFrameDurationMs,
  getLiveDubbingFrameVariant,
  LiveDubbingController,
} from './LiveDubbingController.js';

class FakeTrack {
  constructor({ readyState = 'live' } = {}) {
    this.kind = 'audio';
    this.readyState = readyState;
    this.listeners = new Map();
    this.stop = vi.fn(() => {
      this.readyState = 'ended';
    });
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  removeEventListener(type, handler) {
    if (this.listeners.get(type) === handler) this.listeners.delete(type);
  }
}

function createStream(track) {
  return {
    getAudioTracks: () => [track],
    getTracks: () => [track],
  };
}

function isScalar(value) {
  return value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value));
}

describe('live dubbing measurement Stage 3', () => {
  it('resolves canonical frame samples with production default 1600', () => {
    expect(resolveLiveDubbingFrameSamples(undefined)).toBe(1_600);
    expect(resolveLiveDubbingFrameSamples(1_600)).toBe(1_600);
    expect(resolveLiveDubbingFrameSamples(640)).toBe(640);
    expect(resolveLiveDubbingFrameSamples(0)).toBe(1_600);
    expect(resolveLiveDubbingFrameSamples(800)).toBe(1_600);
    expect(resolveLiveDubbingFrameSamples('640')).toBe(1_600);
    expect(resolveLiveDubbingFrameSamples(null)).toBe(1_600);
    expect(resolveLiveDubbingFrameSamples(Number.NaN)).toBe(1_600);
    // Production default stays 100ms when no build define is present.
    expect(INPUT_FRAME_SAMPLES).toBe(1_600);
    expect(getLiveDubbingFrameDurationMs(1_600)).toBe(100);
    expect(getLiveDubbingFrameDurationMs(640)).toBe(40);
    expect(getLiveDubbingFrameVariant(1_600)).toBe('100ms');
    expect(getLiveDubbingFrameVariant(640)).toBe('40ms');
  });

  it('passes the resolved frame size to the capture worklet via processorOptions', async () => {
    const port = { onmessage: null, postMessage: vi.fn(), start: vi.fn(), close: vi.fn() };
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const sink = { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1, setValueAtTime: vi.fn() } };
    const seenOptions = [];
    const node = { connect: vi.fn(), disconnect: vi.fn(), port };
    const context = {
      sampleRate: 16_000,
      currentTime: 0,
      destination: {},
      audioWorklet: { addModule: vi.fn(async () => {}) },
      createMediaStreamSource: vi.fn(() => source),
      createGain: vi.fn(() => sink),
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    };
    const factory = vi.fn((ctx, name, options) => {
      seenOptions.push(options);
      return node;
    });
    const pipeline = new TabAudioPipeline({
      audioContextFactory: async () => context,
      audioWorkletNodeFactory: factory,
    });
    expect(pipeline.frameSamples).toBe(INPUT_FRAME_SAMPLES);
    await pipeline.start({ getTracks: () => [] });
    expect(factory).toHaveBeenCalledOnce();
    expect(seenOptions[0].processorOptions).toMatchObject({
      sampleRate: 16_000,
      frameSamples: INPUT_FRAME_SAMPLES,
    });
    await pipeline.stop();

    const pipeline40 = new TabAudioPipeline({
      frameSamples: 640,
      audioContextFactory: async () => context,
      audioWorkletNodeFactory: factory,
    });
    expect(pipeline40.frameSamples).toBe(640);
    await pipeline40.start({ getTracks: () => [] });
    expect(seenOptions[1].processorOptions).toMatchObject({ frameSamples: 640 });
    await pipeline40.stop();
  });

  it('derives first-input timings and provider-active run duration', () => {
    const timings = deriveLiveDubbingTimings({
      firstInputSent: 100,
      firstTranslatedAudioReceived: 350,
      firstTranslatedAudioAcceptedByPlayback: 380,
      setupComplete: 100,
      cleanupStart: 120100,
    });
    expect(timings.firstInputToFirstTranslatedAudioMs).toBe(250);
    expect(timings.firstInputToPlaybackAcceptedMs).toBe(280);
    expect(timings.runDurationMs).toBe(120000);

    const fallback = deriveLiveDubbingTimings({
      setupComplete: 100,
      cleanupStart: null,
      cleanupComplete: 120100,
    });
    expect(fallback.runDurationMs).toBe(120000);

    const missing = deriveLiveDubbingTimings({
      firstInputSent: null,
      firstTranslatedAudioReceived: 350,
      firstTranslatedAudioAcceptedByPlayback: null,
      setupComplete: null,
      cleanupStart: 510,
      cleanupComplete: null,
    });
    expect(missing.firstInputToFirstTranslatedAudioMs).toBeNull();
    expect(missing.firstInputToPlaybackAcceptedMs).toBeNull();
    expect(missing.runDurationMs).toBeNull();

    const missingEnd = deriveLiveDubbingTimings({
      setupComplete: 100,
      cleanupStart: null,
      cleanupComplete: null,
    });
    expect(missingEnd.runDurationMs).toBeNull();
  });

  it('propagates client send facts, queue peaks, and stays scalar-only without secrets', async () => {
    const track = new FakeTrack();
    const inputPipeline = {
      frameSamples: 640,
      onFrame: null,
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    };
    const outputPlayer = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      clear: vi.fn(),
      enqueuePcm16: vi.fn(() => ({ accepted: true })),
      resetEpoch: vi.fn(),
      getMetrics: vi.fn()
        .mockReturnValueOnce({
          queuedSamples: 0,
          peakQueuedSamples: 0,
          underruns: 0,
          underrunSamples: 0,
          safetyDrops: 0,
          acceptedChunks: 0,
          epochResets: 0,
        })
        .mockReturnValue({
          queuedSamples: 4_800,
          peakQueuedSamples: 9_600,
          underruns: 5,
          underrunSamples: 48_000,
          safetyDrops: 2,
          acceptedChunks: 7,
          epochResets: 1,
        }),
    };
    const provider = {
      connect: vi.fn(async () => providerCallbacks.onSetupComplete()),
      sendAudio: vi.fn(() => true),
      close: vi.fn(),
      lastSendReason: null,
      getMetrics: vi.fn(() => ({ backpressureEvents: 3, sendFailures: 2, sentAudioChunks: 9 })),
      getTelemetry: vi.fn(() => ({
        milestones: {
          captureReady: null,
          inputReady: null,
          outputReady: null,
          wsOpen: 11,
          setupSent: 12,
          setupComplete: null,
          firstInputSent: null,
          firstTranslatedAudioReceived: null,
          firstTranslatedAudioAcceptedByPlayback: null,
          cleanupStart: null,
          cleanupComplete: null,
        },
        wsBufferedAmountPeak: 4_096,
        interruptions: 0,
        providerTerminalCategory: null,
      })),
    };
    let providerCallbacks;
    const controller = new LiveDubbingController({
      performanceNow: (() => {
        let now = 100;
        return () => now++;
      })(),
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(track)) },
      inputPipelineFactory: vi.fn(options => {
        inputPipeline.onFrame = options.onFrame;
        return inputPipeline;
      }),
      outputPlayerFactory: vi.fn(() => outputPlayer),
      providerClientFactory: vi.fn(options => {
        providerCallbacks = options.callbacks;
        return provider;
      }),
      requestCredential: vi.fn().mockResolvedValue({
        success: true,
        apiKey: 'secret-key-value',
        targetLanguage: 'en',
      }),
      logger: { info: vi.fn(), warn: vi.fn() },
    });

    controller.prepare('session-1', 'en', 0);
    await controller.consume('session-1', 'stream-secret-value', 1);
    await controller.connectProvider('session-1', 'en', 2);

    // Queue two input frames then force backpressure on the third.
    inputPipeline.onFrame({ buffer: new ArrayBuffer(1_280), sampleCount: 640, sampleRate: 16_000 });
    inputPipeline.onFrame({ buffer: new ArrayBuffer(1_280), sampleCount: 640, sampleRate: 16_000 });
    provider.sendAudio.mockReturnValueOnce(false);
    provider.lastSendReason = 'BACKPRESSURE';
    inputPipeline.onFrame({ buffer: new ArrayBuffer(1_280), sampleCount: 640, sampleRate: 16_000 });

    // Translated output with secret-bearing base64 must not leak into telemetry.
    providerCallbacks.onAudio({ mimeType: 'audio/pcm;rate=24000', data: 'c2VjcmV0LXRyYW5zY3JpcHQ=' });
    controller.currentSession.outputMetrics = { queuedSamples: 4_800, underruns: 6, underrunSamples: 24_000 };
    controller._recordOutputMetrics(controller.currentSession, controller.currentSession.outputMetrics);

    const snapshot = controller.getTelemetry();
    expect(snapshot.inputFrameSamples).toBe(640);
    expect(snapshot.inputFrameDurationMs).toBe(40);
    expect(snapshot.inputFrames).toBeGreaterThanOrEqual(3);
    expect(snapshot.inputSentFrames).toBeGreaterThanOrEqual(2);
    expect(snapshot.inputQueuePeakFrames).toBeGreaterThanOrEqual(1);
    expect(snapshot.inputQueuePeakDurationMs).toBeGreaterThan(0);
    expect(snapshot.inputBackpressureEvents).toBeGreaterThanOrEqual(3);
    expect(snapshot.sendFailures).toBe(2);
    expect(snapshot.wsBufferedAmountPeak).toBe(4_096);
    expect(snapshot.translatedAudioChunks).toBe(1);
    expect(snapshot.outputQueuePeakDurationMs).toBeGreaterThan(0);
    expect(snapshot.outputSafetyDrops).toBeGreaterThanOrEqual(2);
    expect(snapshot.underruns).toBeGreaterThanOrEqual(1);
    // Raw worklet underrun sample count is observational only; existing
    // underruns counting is unchanged. 48_000 samples @24kHz = 2000ms.
    expect(snapshot.underrunSamples).toBe(48_000);
    expect(snapshot.underrunDurationMs).toBe(2_000);

    const flat = { ...snapshot };
    delete flat.milestones;
    expect(Object.values(flat).every(isScalar)).toBe(true);
    expect(Object.values(snapshot.milestones).every(value => value === null || Number.isFinite(value))).toBe(true);
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain('secret-key-value');
    expect(serialized).not.toContain('stream-secret-value');
    expect(serialized).not.toContain('c2VjcmV0LXRyYW5zY3JpcHQ=');

    const summary = buildLiveDubbingMeasurementSummary({
      telemetry: controller.currentSession.telemetry,
      metrics: controller.currentSession.metrics,
      frameSamples: 640,
    });
    expect(summary.variant).toBe('40ms');
    expect(summary.underrunSamples).toBe(48_000);
    expect(summary.underrunDurationMs).toBe(2_000);
    expect(Object.values(summary).every(isScalar)).toBe(true);
    expect(JSON.stringify(summary)).not.toContain('secret-key-value');
    expect(JSON.stringify(summary)).not.toContain('session-1');

    await controller.dispose('session-1');
  });

  it('transports exactly one scalar measurement summary in the dispose ack and none before setup', async () => {
    const info = vi.fn();
    const warn = vi.fn();
    const debug = vi.fn();
    const inputPipeline = {
      onFrame: null,
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    };
    const outputPlayer = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      clear: vi.fn(),
      enqueuePcm16: vi.fn(() => ({ accepted: true })),
      resetEpoch: vi.fn(),
    };
    const provider = {
      connect: vi.fn(async () => providerCallbacks.onSetupComplete()),
      sendAudio: vi.fn(() => true),
      close: vi.fn(),
    };
    let providerCallbacks;
    const controller = new LiveDubbingController({
      performanceNow: (() => {
        let now = 1_000;
        return () => now++;
      })(),
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(new FakeTrack())) },
      inputPipelineFactory: vi.fn(options => {
        inputPipeline.onFrame = options.onFrame;
        return inputPipeline;
      }),
      outputPlayerFactory: vi.fn(() => outputPlayer),
      providerClientFactory: vi.fn(options => {
        providerCallbacks = options.callbacks;
        return provider;
      }),
      requestCredential: vi.fn().mockResolvedValue({
        success: true,
        apiKey: 'another-secret-key',
        targetLanguage: 'en',
      }),
      logger: { info, warn, debug },
      notify: vi.fn(),
    });

    // Early dispose before provider setup must not emit a summary.
    controller.prepare('early-session', 'en', 0);
    await controller.consume('early-session', 'early-stream-secret', 1);
    const earlyDispose = await controller.dispose('early-session');
    expect(earlyDispose).not.toHaveProperty('measurementSummary');
    expect(info).not.toHaveBeenCalled();
    expect(debug).not.toHaveBeenCalled();

    controller.prepare('session-9', 'en', 0);
    await controller.consume('session-9', 'stream-secret-9', 1);
    await controller.connectProvider('session-9', 'en', 2);
    inputPipeline.onFrame({
      buffer: new ArrayBuffer(3_200),
      sampleCount: 1_600,
      sampleRate: 16_000,
    });
    providerCallbacks.onAudio({ mimeType: 'audio/pcm;rate=24000', data: 'AQ==' });
    // Direct playback acceptance path used by injected doubles.
    controller._handlePlaybackAccepted(controller.currentSession, { accepted: true, sampleCount: 48 });

    const disposed = await controller.dispose('session-9');
    const payload = disposed.measurementSummary;
    expect(payload).toMatchObject({
      variant: '100ms',
      inputFrameSamples: 1_600,
      inputFrameDurationMs: 100,
    });
    expect(Object.values(payload).every(isScalar)).toBe(true);
    expect(JSON.stringify(payload)).not.toContain('session-9');
    expect(JSON.stringify(payload)).not.toContain('stream-secret-9');
    expect(JSON.stringify(payload)).not.toContain('another-secret-key');
    expect(JSON.stringify(payload)).not.toContain('AQ==');
    expect(payload).not.toHaveProperty('sessionId');
    expect(payload).not.toHaveProperty('providerDiagnostic');
    expect(payload).not.toHaveProperty('cleanupDiagnostic');
    // Background owns the canonical log; offscreen stays local-debug only
    // with a single-string line and no object-arg logging.
    expect(info).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledTimes(1);
    expect(debug.mock.calls[0]).toHaveLength(1);
    expect(typeof debug.mock.calls[0][0]).toBe('string');
    expect(debug.mock.calls[0][0].startsWith('Live dubbing measurement summary ')).toBe(true);
    expect(JSON.parse(debug.mock.calls[0][0].slice('Live dubbing measurement summary '.length)))
      .toEqual(payload);

    // Idempotent second dispose must not emit again.
    const repeated = await controller.dispose('session-9');
    expect(repeated).not.toHaveProperty('measurementSummary');
    expect(debug).toHaveBeenCalledTimes(1);
    expect(info).not.toHaveBeenCalled();
  });

  it('builds scalar snapshots without worklet clocks', () => {
    const snapshot = buildLiveDubbingMeasurementSnapshot({
      telemetry: {
        milestones: {
          captureReady: 10,
          inputReady: null,
          outputReady: null,
          wsOpen: null,
          setupSent: null,
          setupComplete: 10,
          firstInputSent: 100,
          firstTranslatedAudioReceived: 350,
          firstTranslatedAudioAcceptedByPlayback: 380,
          cleanupStart: 510,
          cleanupComplete: null,
        },
        inputQueueCurrentDurationMs: 0,
        inputQueuePeakDurationMs: 40,
        inputQueuePeakFrames: 1,
        inputDroppedDurationMs: 0,
        preSetupDroppedDurationMs: 0,
        preSetupDroppedFrames: 0,
        inputBackpressureEvents: 0,
        sendFailures: 0,
        wsBufferedAmountPeak: 0,
        outputQueueCurrentDurationMs: 0,
        outputQueuePeakDurationMs: 0,
        outputSafetyDrops: 0,
        underruns: 0,
        underrunSamples: 2_400,
        interruptions: 0,
        providerTerminalCategory: null,
        inputFrames: 2,
        inputSentFrames: 2,
        inputPendingFrames: 0,
        translatedAudioChunks: 1,
      },
      metrics: {
        inputFrames: 2,
        inputSentFrames: 2,
        inputPendingFrames: 0,
        inputQueuePeakFrames: 1,
        inputBackpressureEvents: 0,
        sendFailures: 0,
        outputChunks: 1,
        outputSafetyDrops: 0,
      },
      frameSamples: 640,
    });
    expect(snapshot.firstInputToFirstTranslatedAudioMs).toBe(250);
    expect(snapshot.firstInputToPlaybackAcceptedMs).toBe(280);
    expect(snapshot.runDurationMs).toBe(500);
    expect(snapshot.terminalCategory).toBeNull();
    expect(snapshot.playbackAccepted).toBe(true);
    // 2_400 samples @24kHz = 100ms of underrun silence.
    expect(snapshot.underrunSamples).toBe(2_400);
    expect(snapshot.underrunDurationMs).toBe(100);
  });

  it('defaults missing underrun samples to zero duration', () => {
    const snapshot = buildLiveDubbingMeasurementSnapshot({
      telemetry: {
        milestones: {
          setupComplete: 100,
          cleanupStart: 200,
        },
      },
      metrics: {},
      frameSamples: 1_600,
    });
    expect(snapshot.underrunSamples).toBe(0);
    expect(snapshot.underrunDurationMs).toBe(0);
    expect(snapshot.runDurationMs).toBe(100);
  });
});
