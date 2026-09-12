import { describe, expect, it, vi } from 'vitest';
import { LiveDubbingController } from './LiveDubbingController.js';
import {
  LIVE_DUBBING_ACTIONS,
  LIVE_DUBBING_INTERNAL_STATUS,
  LIVE_DUBBING_STATUS,
} from '../constants.js';

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

  end() {
    this.readyState = 'ended';
    this.listeners.get('ended')?.();
  }
}

function createStream(track) {
  return {
    getAudioTracks: () => [track],
    getTracks: () => [track],
  };
}

describe('LiveDubbingController', () => {
  it('requires an explicit zero sequence for the initial prepare', () => {
    const controller = new LiveDubbingController();
    const missing = controller.handle({
      action: LIVE_DUBBING_ACTIONS.PREPARE,
      data: { sessionId: 'session-1' },
    });
    const future = controller.prepare('session-1', null, 1);

    expect(missing).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_EVENT_SEQUENCE_MISMATCH',
      eventSequence: 0,
      status: 'IDLE',
    });
    expect(future).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_EVENT_SEQUENCE_MISMATCH',
    });
    expect(controller.currentSession).toBeNull();

    expect(controller.prepare('session-1', null, 0)).toMatchObject({
      success: true,
      eventSequence: 0,
    });
  });

  it('requires the next sequence to start capture and current sequence to retry it', async () => {
    const track = new FakeTrack();
    const getUserMedia = vi.fn(async () => createStream(track));
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia },
    });

    controller.prepare('session-1', null, 0);
    for (const eventSequence of [undefined, 0, 2]) {
      const response = controller.consume('session-1', 'stream-secret', eventSequence);
      expect(response).toMatchObject({
        success: false,
        error: 'LIVE_DUBBING_EVENT_SEQUENCE_MISMATCH',
      });
      expect(controller.currentSession.eventSequence).toBe(0);
      expect(controller.currentSession.status).toBe(LIVE_DUBBING_STATUS.PREPARING_CAPTURE);
    }
    expect(getUserMedia).not.toHaveBeenCalled();

    const firstConsume = controller.consume('session-1', 'stream-secret', 1);
    expect(controller.currentSession.eventSequence).toBe(1);
    expect(controller.consume('session-1', 'other-stream-secret', 1)).toBe(firstConsume);
    await expect(firstConsume).resolves.toMatchObject({
      success: true,
      ack: 'MEDIA_ACQUIRED',
    });

    expect(controller.consume('session-1', 'stream-secret', 0)).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_EVENT_SEQUENCE_MISMATCH',
    });
    expect(controller.consume('session-1', 'stream-secret', 2)).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_EVENT_SEQUENCE_MISMATCH',
    });
    expect(controller.consume('session-1', 'stream-secret', 1)).toMatchObject({
      success: true,
      ack: 'MEDIA_ACQUIRED',
    });
    expect(getUserMedia).toHaveBeenCalledOnce();

    await controller.dispose('session-1');
  });

  it('requires the next sequence to start provider connection and current sequence to retry it', async () => {
    const track = new FakeTrack();
    const inputPipeline = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    };
    const outputPlayer = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      clear: vi.fn(),
    };
    let resolveCredential;
    const credential = new Promise(resolve => {
      resolveCredential = resolve;
    });
    const provider = {
      connect: vi.fn(async () => provider.onSetupComplete()),
      close: vi.fn(),
    };
    const requestCredential = vi.fn(() => credential);
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(track)) },
      inputPipeline,
      outputPlayer,
      providerClient: provider,
      requestCredential,
    });

    controller.prepare('session-1', 'en', 0);
    await controller.consume('session-1', 'stream-secret', 1);
    for (const eventSequence of [undefined, 1, 3]) {
      const response = controller.connectProvider('session-1', 'en', eventSequence);
      expect(response).toMatchObject({
        success: false,
        error: 'LIVE_DUBBING_EVENT_SEQUENCE_MISMATCH',
      });
      expect(controller.currentSession.eventSequence).toBe(1);
      expect(controller.currentSession.status).toBe(LIVE_DUBBING_STATUS.CONNECTING_PROVIDER);
    }
    expect(requestCredential).not.toHaveBeenCalled();

    const firstConnect = controller.connectProvider('session-1', 'en', 2);
    expect(controller.connectProvider('session-1', 'en', 2)).toBe(firstConnect);
    expect(controller.currentSession.eventSequence).toBe(2);
    expect(controller.connectProvider('session-1', 'en', 1)).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_EVENT_SEQUENCE_MISMATCH',
    });

    resolveCredential({ success: true, apiKey: 'secret-key', targetLanguage: 'en' });
    await expect(firstConnect).resolves.toMatchObject({
      success: true,
      ack: 'PROVIDER_READY',
      eventSequence: 3,
    });
    expect(controller.connectProvider('session-1', 'en', 2)).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_EVENT_SEQUENCE_MISMATCH',
    });
    expect(controller.connectProvider('session-1', 'en', 3)).toMatchObject({
      success: true,
      ack: 'PROVIDER_READY',
    });

    await controller.dispose('session-1');
  });

  it('clears settled credentials before pending provider setup resolves', async () => {
    const track = new FakeTrack();
    const inputPipeline = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    };
    const outputPlayer = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      clear: vi.fn(),
    };
    let resolveSetup;
    const setup = new Promise(resolve => {
      resolveSetup = resolve;
    });
    let resolveSetupStarted;
    const setupStarted = new Promise(resolve => {
      resolveSetupStarted = resolve;
    });
    let resolveClient;
    const clientReady = new Promise(resolve => {
      resolveClient = resolve;
    });
    const provider = {
      connect: vi.fn(() => {
        resolveSetupStarted();
        return setup;
      }),
      close: vi.fn(),
    };
    const providerClientFactory = vi.fn(() => clientReady);
    const requestCredential = vi.fn().mockResolvedValue({
      success: true,
      apiKey: 'secret-key',
      targetLanguage: 'en',
    });
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(track)) },
      inputPipeline,
      outputPlayer,
      providerClientFactory,
      requestCredential,
    });

    controller.prepare('session-1', 'en', 0);
    await controller.consume('session-1', 'stream-secret', 1);
    const connecting = controller.connectProvider('session-1', 'en', 2);
    await vi.waitFor(() => expect(providerClientFactory).toHaveBeenCalledOnce());
    expect(requestCredential).not.toHaveBeenCalled();
    expect(controller.currentSession.credentialRequestPromise).toBeNull();

    resolveClient(provider);
    await setupStarted;

    const session = controller.currentSession;
    expect(provider.connect).toHaveBeenCalledWith('secret-key', 'en');
    expect(session.credentialRequestPromise).toBeNull();
    expect(session.credentialRequested).toBe(true);
    await expect(controller.requestProviderCredentialForSession(session)).resolves.toBeNull();
    expect(requestCredential).toHaveBeenCalledOnce();
    expect(session).not.toHaveProperty('apiKey');
    expect(JSON.stringify(session)).not.toContain('secret-key');

    provider.onSetupComplete();
    resolveSetup();
    await expect(connecting).resolves.toMatchObject({
      success: true,
      ack: 'PROVIDER_READY',
    });
    expect(session.credentialRequestPromise).toBeNull();
    expect(JSON.stringify(session)).not.toContain('secret-key');

    await controller.dispose('session-1');
  });

  it('calls getUserMedia immediately with Chrome tab constraints', async () => {
    const stream = createStream(new FakeTrack());
    const getUserMedia = vi.fn(() => Promise.resolve(stream));
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia },
    });

    controller.prepare('session-1', null, 0);
    const consume = controller.consume('session-1', 'stream-secret', 1);

    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: 'stream-secret',
        },
      },
      video: false,
    });
    await expect(consume).resolves.toMatchObject({
      success: true,
      ack: 'MEDIA_ACQUIRED',
      status: LIVE_DUBBING_INTERNAL_STATUS.CAPTURING,
    });
  });

  it('shares pending capture and keeps returned tracks managed', async () => {
    const track = new FakeTrack();
    const stream = createStream(track);
    let resolveCapture;
    const capture = new Promise(resolve => {
      resolveCapture = resolve;
    });
    const getUserMedia = vi.fn(() => capture);
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia },
    });

    controller.prepare('session-1', null, 0);
    const firstConsume = controller.consume('session-1', 'stream-secret', 1);
    const duplicateConsume = controller.consume('session-1', 'other-stream-secret', 1);

    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(duplicateConsume).toBe(firstConsume);

    resolveCapture(stream);
    await expect(firstConsume).resolves.toMatchObject({
      success: true,
      ack: 'MEDIA_ACQUIRED',
      status: LIVE_DUBBING_INTERNAL_STATUS.CAPTURING,
    });
    expect(track.listeners.has('ended')).toBe(true);

    await controller.dispose('session-1');
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('disposes pending capture immediately and stops a stream that resolves late', async () => {
    const track = new FakeTrack();
    let resolveCapture;
    const capture = new Promise(resolve => { resolveCapture = resolve; });
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(() => capture) },
    });

    controller.prepare('session-1', null, 0);
    const consume = controller.consume('session-1', 'stream-secret', 1);
    const disposed = await controller.dispose('session-1', 'STOP_REQUESTED');

    expect(disposed).toMatchObject({ ack: 'DISPOSED', sessionId: 'session-1' });
    resolveCapture(createStream(track));

    await expect(consume).resolves.toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_SESSION_DISPOSED',
      sessionId: 'session-1',
    });
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('rejects capture without a live audio track and stops returned tracks', async () => {
    const track = new FakeTrack({ readyState: 'ended' });
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(track)) },
    });

    controller.prepare('session-1', null, 0);
    await expect(controller.consume('session-1', 'stream-secret', 1)).resolves.toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_NO_LIVE_AUDIO_TRACK',
      status: LIVE_DUBBING_STATUS.ERROR,
    });
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('returns sanitized OFFSCREEN_GET_USER_MEDIA diagnostics without stream data', async () => {
    const streamId = 'stream-secret';
    const failure = new Error(`denied for ${streamId} at https://example.test/media`);
    failure.name = 'NotAllowedError';
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(() => Promise.reject(failure)) },
    });

    controller.prepare('session-1', null, 0);
    const result = await controller.consume('session-1', streamId, 1);

    expect(result).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_CAPTURE_FAILED',
      diagnostic: {
        stage: 'OFFSCREEN_GET_USER_MEDIA',
        error: { name: 'NotAllowedError' },
      },
    });
    expect(JSON.stringify(result.diagnostic)).not.toContain(streamId);
    expect(JSON.stringify(result.diagnostic)).not.toContain('example.test');
    expect(result).not.toHaveProperty('streamId');
  });

  it('fences stale disposal and performs matching idempotent cleanup once per session', async () => {
    const track = new FakeTrack();
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(track)) },
    });

    controller.prepare('session-1', null, 0);
    await controller.consume('session-1', 'stream-secret', 1);

    const stale = await controller.handle({
      action: LIVE_DUBBING_ACTIONS.DISPOSE,
      data: { sessionId: 'stale-session', reason: 'STALE' },
    });
    expect(stale).toMatchObject({
      success: true,
      ack: 'DISPOSED',
      ignored: true,
    });
    expect(track.stop).not.toHaveBeenCalled();
    expect(controller.status()).toMatchObject({
      sessionId: 'session-1',
      status: LIVE_DUBBING_INTERNAL_STATUS.CAPTURING,
    });

    const disposed = await controller.dispose('session-1', 'STOP');
    const repeated = await controller.dispose('session-1', 'STOP');
    expect(disposed).toMatchObject({ success: true, ack: 'DISPOSED', disposed: true });
    expect(repeated).toMatchObject({ success: true, ack: 'DISPOSED', disposed: true });
    expect(track.stop).toHaveBeenCalledOnce();
    expect(controller.status()).toEqual({
      success: true,
      active: false,
      sessionId: null,
      status: 'IDLE',
    });
  });

  it('fences track-ended terminal status to its owning session', async () => {
    const track = new FakeTrack();
    const notify = vi.fn();
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(track)) },
      notify,
    });

    controller.prepare('session-1', null, 0);
    await controller.consume('session-1', 'stream-secret', 1);
    track.end();

    expect(controller.status()).toMatchObject({
      sessionId: 'session-1',
      active: false,
      status: LIVE_DUBBING_STATUS.ERROR,
      lastError: 'LIVE_DUBBING_CAPTURE_TRACK_ENDED',
    });
    expect(notify).toHaveBeenCalledWith({
      action: LIVE_DUBBING_ACTIONS.TERMINAL,
      data: {
        sessionId: 'session-1',
        eventSequence: 1,
        status: LIVE_DUBBING_STATUS.ERROR,
        event: 'TRACK_ENDED',
        error: 'LIVE_DUBBING_CAPTURE_TRACK_ENDED',
      },
    });

    await controller.dispose('session-1');
    track.end();
    expect(controller.status().sessionId).toBeNull();
    expect(notify).toHaveBeenCalledOnce();
  });

  it('rejects status requests for another session without exposing current ownership', async () => {
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(new FakeTrack())) },
    });

    controller.prepare('session-1', null, 0);
    const response = controller.handle({
      action: LIVE_DUBBING_ACTIONS.STATUS,
      data: { sessionId: 'stale-session' },
    });

    expect(response).toMatchObject({
      success: false,
      ignored: true,
      error: 'LIVE_DUBBING_SESSION_MISMATCH',
      sessionId: 'stale-session',
      requestedSessionId: 'stale-session',
      actualSessionId: 'session-1',
    });
  });

  it('does not request provider credentials before capture pipelines are ready', async () => {
    const requestCredential = vi.fn().mockResolvedValue({
      success: true,
      apiKey: 'secret-key',
      targetLanguage: 'fil',
    });
    const controller = new LiveDubbingController({ requestCredential });

    controller.prepare('session-1', 'fil', 0);
    const first = await controller.requestProviderCredential();

    expect(first).toEqual({
      success: false,
      error: 'LIVE_DUBBING_AUDIO_PIPELINES_UNAVAILABLE',
    });
    expect(requestCredential).not.toHaveBeenCalled();
  });

  it('gates provider setup and input until both pipelines and setup complete', async () => {
    const track = new FakeTrack();
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
    const requestCredential = vi.fn().mockResolvedValue({
      success: true,
      apiKey: 'secret-key',
      targetLanguage: 'fr',
    });
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => stream) },
      requestCredential,
      inputPipelineFactory: vi.fn(options => {
        inputPipeline.onFrame = options.onFrame;
        return inputPipeline;
      }),
      outputPlayerFactory: vi.fn(() => outputPlayer),
      providerClientFactory: vi.fn(options => {
        providerCallbacks = options.callbacks;
        return provider;
      }),
    });
    const stream = createStream(track);

    controller.prepare('session-1', 'fr', 0);
    const captured = await controller.consume('session-1', 'stream-secret', 1);
    expect(captured).toMatchObject({
      ack: 'MEDIA_ACQUIRED',
      status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
      inputPipelineReady: true,
      outputPipelineReady: true,
    });
    inputPipeline.onFrame({ buffer: new ArrayBuffer(2), sampleCount: 1, sampleRate: 16_000 });
    expect(provider.sendAudio).not.toHaveBeenCalled();
    expect(controller.getTelemetry()).toMatchObject({
      preSetupDroppedFrames: 1,
      preSetupDroppedDurationMs: expect.closeTo(0.0625, 5),
    });

    const connected = await controller.connectProvider('session-1', 'fr', 2);
    expect(connected).toMatchObject({
        ack: 'PROVIDER_READY',
        status: LIVE_DUBBING_STATUS.RUNNING,
        setupComplete: true,
    });
    expect(requestCredential).toHaveBeenCalledOnce();
    expect(provider.connect).toHaveBeenCalledWith('secret-key', 'fr');
    inputPipeline.onFrame({ buffer: new ArrayBuffer(2), sampleCount: 1, sampleRate: 16_000 });
    expect(provider.sendAudio).toHaveBeenCalledOnce();

    providerCallbacks.onAudio(new Uint8Array([1]));
    expect(outputPlayer.enqueuePcm16).toHaveBeenCalledOnce();
    expect(outputPlayer.enqueuePcm16).toHaveBeenCalledWith(
      new Uint8Array([1]),
      expect.objectContaining({ epoch: 0, sequence: 1 }),
    );
    providerCallbacks.onInterrupted();
    expect(outputPlayer.resetEpoch).toHaveBeenCalledWith(1);

    await controller.dispose('session-1');
    expect(provider.close).toHaveBeenCalledOnce();
    expect(inputPipeline.stop).toHaveBeenCalledOnce();
    expect(outputPlayer.stop).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('exposes scalar telemetry, playback acceptance, and cleanup milestones', async () => {
    let now = 0;
    const track = new FakeTrack();
    const inputPipeline = {
      onFrame: null,
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    };
    const outputPlayer = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      clear: vi.fn(),
      getMetrics: vi.fn(() => ({ queuedSamples: 2_400, underruns: 3 })),
      enqueuePcm16: vi.fn()
        .mockReturnValueOnce({ accepted: true, sampleCount: 0, partialByte: true })
        .mockReturnValueOnce({ accepted: false, error: 'OUTPUT_AUDIO_QUEUE_SAFETY_LIMIT' }),
      resetEpoch: vi.fn(),
    };
    const provider = {
      connect: vi.fn(async () => provider.onSetupComplete()),
      sendAudio: vi.fn(() => true),
      close: vi.fn(),
    };
    let providerCallbacks;
    const onPlaybackAccepted = vi.fn(() => {
      throw new Error('callback failures are isolated');
    });
    const controller = new LiveDubbingController({
      performanceNow: () => ++now,
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
        apiKey: 'secret-key',
        targetLanguage: 'en',
      }),
      onPlaybackAccepted,
    });

    controller.prepare('session-1', 'en', 0);
    await controller.consume('session-1', 'stream-secret', 1);
    inputPipeline.onFrame({ buffer: new ArrayBuffer(2), sampleCount: 1, sampleRate: 16_000 });
    await controller.connectProvider('session-1', 'en', 2);
    inputPipeline.onFrame({ buffer: new ArrayBuffer(2), sampleCount: 1, sampleRate: 16_000 });
    providerCallbacks.onAudio(new Uint8Array([1]));
    expect(controller.getTelemetry().milestones.firstTranslatedAudioAcceptedByPlayback).toBeNull();
    providerCallbacks.onAudio(new Uint8Array([2]));
    expect(controller.getTelemetry().milestones.firstTranslatedAudioAcceptedByPlayback).toBeNull();
    outputPlayer.onMetrics({ queuedSamples: 4_800, underruns: 4 });
    outputPlayer.onPlaybackAccepted({ accepted: false, sampleCount: 2 });
    expect(controller.getTelemetry().milestones.firstTranslatedAudioAcceptedByPlayback).toBeNull();
    outputPlayer.onPlaybackAccepted({ id: 1, sampleCount: 2, queuedSamples: 0 });
    const acceptedAt = controller.getTelemetry().milestones.firstTranslatedAudioAcceptedByPlayback;
    outputPlayer.onPlaybackAccepted({ accepted: true, sampleCount: 2 });

    const telemetry = controller.getTelemetry();
    expect(telemetry).toMatchObject({
      preSetupDroppedFrames: 1,
      preSetupDroppedDurationMs: expect.closeTo(0.0625, 5),
      outputQueueCurrentDurationMs: 200,
      outputQueuePeakDurationMs: 200,
      underruns: 1,
      milestones: {
        captureReady: expect.any(Number),
        inputReady: expect.any(Number),
        outputReady: expect.any(Number),
        setupComplete: expect.any(Number),
        firstInputSent: expect.any(Number),
        firstTranslatedAudioReceived: expect.any(Number),
        firstTranslatedAudioAcceptedByPlayback: expect.any(Number),
      },
    });
    expect(telemetry.milestones.firstTranslatedAudioAcceptedByPlayback).toBe(acceptedAt);
    expect(onPlaybackAccepted).toHaveBeenCalledWith({ accepted: true, sampleCount: 2 });
    expect(JSON.stringify(telemetry)).not.toContain('secret-key');
    expect(JSON.stringify(telemetry)).not.toContain('stream-secret');
    expect(JSON.stringify(telemetry)).not.toContain('AQ==');

    const session = controller.currentSession;
    await controller.dispose('session-1');
    expect(session.credentialRequested).toBe(false);
    expect(controller.getSnapshot()).toMatchObject({
      active: false,
      status: 'IDLE',
      telemetry: {
        milestones: {
          cleanupStart: expect.any(Number),
          cleanupComplete: expect.any(Number),
        },
      },
    });
  });

  it('logs one bounded cleanup diagnostic when setup completed without playback', async () => {
    const warn = vi.fn();
    const notify = vi.fn();
    const controller = new LiveDubbingController({ logger: { warn }, notify });
    controller.prepare('session-1', 'en', 0);
    const session = controller.currentSession;
    session.setupComplete = true;
    session.lastError = 'LIVE_DUBBING_PROVIDER_ERROR';
    session.stream = { streamId: 'stream-secret', transcript: 'private transcript' };
    session.providerClient = {
      getSendState: vi.fn(() => ({ lastReason: 'BACKPRESSURE' })),
      sessionId: 'session-secret',
      data: 'AQ==',
    };
    session.metrics = {
      ...session.metrics,
      preSetupDroppedFrames: 2,
      inputFrames: 5,
      inputSentFrames: 3,
      inputPendingFrames: 2,
      outputChunks: 4,
      outputSafetyDrops: 1,
    };
    session.telemetry.milestones.setupComplete = 1;
    session.telemetry.interruptions = 6;
    session.telemetry.providerTerminalCategory = 'PROVIDER_ERROR';

    controller._providerFailed(session, { code: 'LIVE_DUBBING_PROVIDER_ERROR' }, 'PROVIDER_ERROR');
    await session.cleanupPromise;

    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('Live dubbing ended without translated playback', {
      cleanupCause: 'LIVE_DUBBING_PROVIDER_ERROR',
      capturedFrames: 7,
      inputSentFrames: 3,
      inputPendingFrames: 2,
      providerLastSendReason: 'BACKPRESSURE',
      providerAudioChunks: 4,
      playbackAccepted: false,
      outputSafetyDrops: 1,
      interruptions: 6,
      providerTerminalCategory: 'PROVIDER_ERROR',
    });
    const diagnostic = warn.mock.calls[0][1];
    expect(Object.values(diagnostic).every(value => value === null || ['string', 'number', 'boolean'].includes(typeof value))).toBe(true);
    expect(JSON.stringify(diagnostic)).not.toContain('session-secret');
    expect(JSON.stringify(diagnostic)).not.toContain('stream-secret');
    expect(JSON.stringify(diagnostic)).not.toContain('AQ==');
    expect(JSON.stringify(diagnostic)).not.toContain('private transcript');
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ cleanupDiagnostic: diagnostic }),
    }));

    await controller.dispose('session-1');

    controller.prepare('session-2', 'en', 0);
    const playedSession = controller.currentSession;
    playedSession.setupComplete = true;
    playedSession.telemetry.milestones.setupComplete = 1;
    playedSession.telemetry.milestones.firstTranslatedAudioAcceptedByPlayback = 2;
    await controller.dispose('session-2');

    expect(warn).toHaveBeenCalledOnce();
  });

  it('cleans up provider failures and fences the old generation', async () => {
    const track = new FakeTrack();
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
      connect: vi.fn(async () => provider.onSetupComplete()),
      sendAudio: vi.fn(() => true),
      close: vi.fn(),
    };
    const notify = vi.fn();
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(track)) },
      inputPipeline,
      outputPlayer,
      providerClient: provider,
      requestCredential: vi.fn().mockResolvedValue({
        success: true,
        apiKey: 'secret-key',
        targetLanguage: 'de',
      }),
      notify,
    });

    controller.prepare('session-1', 'de', 0);
    await controller.consume('session-1', 'stream-secret', 1);
    await controller.connectProvider('session-1', 'de', 2);
    provider.onError(new Error('provider-secret'));

    expect(controller.status()).toMatchObject({
      sessionId: 'session-1',
      status: LIVE_DUBBING_STATUS.ERROR,
      lastError: 'LIVE_DUBBING_PROVIDER_ERROR',
    });
    expect(provider.close).toHaveBeenCalledOnce();
    expect(inputPipeline.stop).toHaveBeenCalledOnce();
    expect(outputPlayer.stop).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(JSON.stringify(notify.mock.calls)).not.toContain('provider-secret');

    const outputCalls = outputPlayer.enqueuePcm16.mock.calls.length;
    provider.onAudio(new Uint8Array([1]));
    expect(outputPlayer.enqueuePcm16).toHaveBeenCalledTimes(outputCalls);
    await controller.dispose('session-1');
  });

  it.each([
    ['LIVE_DUBBING_INVALID_OUTPUT_AUDIO', 'INVALID_OUTPUT_AUDIO'],
    ['LIVE_DUBBING_OUTPUT_AUDIO_ERROR', 'OUTPUT_AUDIO_ERROR'],
  ])('preserves typed provider output failure %s and reason %s', async (code, reason) => {
    const track = new FakeTrack();
    const inputPipeline = { start: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
    const outputPlayer = { start: vi.fn(async () => {}), stop: vi.fn(async () => {}), clear: vi.fn() };
    const provider = {
      connect: vi.fn(async () => provider.onSetupComplete()),
      close: vi.fn(),
    };
    const notify = vi.fn();
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(track)) },
      inputPipeline,
      outputPlayer,
      providerClient: provider,
      requestCredential: vi.fn().mockResolvedValue({
        success: true,
        apiKey: 'secret-key',
        targetLanguage: 'fr',
      }),
      notify,
    });

    controller.prepare('session-1', 'fr', 0);
    await controller.consume('session-1', 'stream-secret', 1);
    await controller.connectProvider('session-1', 'fr', 2);
    provider.onError(Object.assign(new Error('provider output failure'), {
      code,
      providerReason: reason,
    }));

    expect(controller.status()).toMatchObject({
      status: LIVE_DUBBING_STATUS.ERROR,
      lastError: code,
    });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ event: reason, error: code }),
    }));

    await controller.dispose('session-1');
  });

  it('returns and notifies the sanitized diagnostic from failed CONNECT_PROVIDER', async () => {
    const track = new FakeTrack();
    const inputPipeline = { start: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
    const outputPlayer = { start: vi.fn(async () => {}), stop: vi.fn(async () => {}), clear: vi.fn() };
    const provider = {
      connect: vi.fn(() => Promise.reject(Object.assign(new Error('provider-body-secret'), {
        code: 'GEMINI_LIVE_REMOTE_ERROR',
        providerDiagnostic: {
          stage: 'REMOTE_ERROR',
          code: 'GEMINI_LIVE_REMOTE_ERROR',
          closeCode: 1011,
          wasClean: false,
          terminalCategory: 'REMOTE_ERROR',
          wsOpen: true,
          setupSent: true,
          setupComplete: false,
          message: 'provider-body-secret',
          key: 'secret-key',
        },
      }))),
      close: vi.fn(),
    };
    const notify = vi.fn();
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(track)) },
      inputPipeline,
      outputPlayer,
      providerClient: provider,
      requestCredential: vi.fn().mockResolvedValue({
        success: true,
        apiKey: 'secret-key',
        targetLanguage: 'fr',
      }),
      notify,
    });

    controller.prepare('session-1', 'fr', 0);
    await controller.consume('session-1', 'stream-secret', 1);
    const result = await controller.connectProvider('session-1', 'fr', 2);
    const providerDiagnostic = result.providerDiagnostic;

    expect(result).toMatchObject({
      success: false,
      error: 'GEMINI_LIVE_REMOTE_ERROR',
      providerDiagnostic: {
        stage: 'CONNECT_PROVIDER',
        code: 'GEMINI_LIVE_REMOTE_ERROR',
        closeCode: 1011,
        wasClean: false,
        terminalCategory: 'REMOTE_ERROR',
        wsOpen: true,
        setupSent: true,
        setupComplete: false,
        malformedAt: null,
      },
    });
    expect(Object.keys(providerDiagnostic)).toHaveLength(9);
    expect(JSON.stringify(notify.mock.calls)).not.toContain('provider-body-secret');
    expect(provider.close).toHaveBeenCalledOnce();

    await controller.dispose('session-1');
  });

  it('preserves GoAway as the terminal provider reason when generic callbacks arrive afterward', async () => {
    const track = new FakeTrack();
    const inputPipeline = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    };
    const outputPlayer = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      clear: vi.fn(),
    };
    const provider = {
      connect: vi.fn(async () => provider.onSetupComplete()),
      close: vi.fn(),
    };
    const notify = vi.fn();
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(track)) },
      inputPipeline,
      outputPlayer,
      providerClient: provider,
      requestCredential: vi.fn().mockResolvedValue({
        success: true,
        apiKey: 'secret-key',
        targetLanguage: 'fr',
      }),
      notify,
    });

    controller.prepare('session-1', 'fr', 0);
    await controller.consume('session-1', 'stream-secret', 1);
    await controller.connectProvider('session-1', 'fr', 2);

    provider.onGoAway({ timeLeft: '10s' });
    provider.onError(new Error('late generic provider error'));
    provider.onClose({ code: 1000, wasClean: false });

    expect(controller.status()).toMatchObject({
      sessionId: 'session-1',
      status: LIVE_DUBBING_STATUS.ERROR,
      lastError: 'PROVIDER_GO_AWAY',
    });
    expect(controller.getTelemetry()).toMatchObject({
      providerTerminalCategory: 'PROVIDER_GO_AWAY',
    });
    expect(notify).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        event: 'PROVIDER_GO_AWAY',
        error: 'PROVIDER_GO_AWAY',
        providerDiagnostic: expect.objectContaining({
          stage: 'CONNECT_PROVIDER',
          terminalCategory: 'PROVIDER_GO_AWAY',
        }),
      }),
    }));
    expect(provider.close).toHaveBeenCalledOnce();

    await controller.dispose('session-1');
  });
});
