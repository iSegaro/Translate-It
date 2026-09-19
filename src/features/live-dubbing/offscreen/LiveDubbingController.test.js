import { describe, expect, it, vi } from 'vitest';
import { LiveDubbingController } from './LiveDubbingController.js';
import { LiveDubbingAudioEngine } from './LiveDubbingAudioEngine.js';
import {
  LIVE_DUBBING_ACTIONS,
  LIVE_DUBBING_AUDIO_MODES,
  LIVE_DUBBING_INTERNAL_STATUS,
  LIVE_DUBBING_STATUS,
  LIVE_DUBBING_STOP_TIMEOUT,
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

function createOriginalAudioContext() {
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const gain = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: { setValueAtTime: vi.fn(), value: 0 },
  };
  return {
    createMediaStreamSource: vi.fn(() => source),
    createGain: vi.fn(() => gain),
    currentTime: 0,
    destination: {},
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
}

describe('LiveDubbingController', () => {
  it('does not require pipelines from nested audio options alone', () => {
    const controller = new LiveDubbingController({
      inputPipelineOptions: { audioWorkletNodeFactory: vi.fn() },
      outputPlayerOptions: { audioWorkletNodeFactory: vi.fn() },
    });

    expect(controller.pipelineRequired).toBe(false);
  });

  it.each([LIVE_DUBBING_AUDIO_MODES.PCM, LIVE_DUBBING_AUDIO_MODES.MEDIA_STREAM])(
    'passes pre-engine volume to the %s audio engine',
    async audioMode => {
      const track = new FakeTrack();
      const controller = new LiveDubbingController({
        mediaDevices: { getUserMedia: vi.fn(async () => createStream(track)) },
        providerRegistry: { getAudioMode: vi.fn(() => audioMode) },
        audioContextFactory: vi.fn(async () => createOriginalAudioContext()),
        inputPipeline: { start: vi.fn(async () => {}), stop: vi.fn(async () => {}) },
        outputPlayer: {
          start: vi.fn(async () => {}),
          stop: vi.fn(async () => {}),
          clear: vi.fn(),
        },
      });

      controller.prepare('session-1', 'gemini', null, 0);
      expect(controller.setOriginalVolume('session-1', 'gemini', 0.4, 0)).toEqual({
        success: true,
        sessionId: 'session-1',
        providerId: 'gemini',
        eventSequence: 0,
        status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
        originalVolume: 0.4,
      });
      await controller.consume('session-1', 'gemini', 'stream-secret', 1);

      await vi.waitFor(() => expect(controller.currentSession.audioEngine.originalVolume).toBe(0.4));
      await controller.dispose('session-1', 'gemini');
    },
  );

  it('keeps PCM capture ready when deferred original audio fails', async () => {
    const track = new FakeTrack();
    const notify = vi.fn();
    const provider = {
      connect: vi.fn(async () => provider.onSetupComplete()),
      close: vi.fn(),
    };
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(track)) },
      providerRegistry: { getAudioMode: vi.fn(() => LIVE_DUBBING_AUDIO_MODES.PCM) },
      inputPipeline: { start: vi.fn(async () => {}), stop: vi.fn(async () => {}) },
      outputPlayer: { start: vi.fn(async () => {}), stop: vi.fn(async () => {}), clear: vi.fn() },
      audioContextFactory: vi.fn(async () => {
        throw new Error('ctx boom');
      }),
      providerClient: provider,
      requestBootstrap: vi.fn().mockResolvedValue({
        success: true,
        providerId: 'gemini',
        targetLanguage: 'en',
        bootstrap: { accessToken: 'test-token' },
      }),
      notify,
    });

    controller.prepare('session-1', 'gemini', 'en', 0);
    expect(controller.setOriginalVolume('session-1', 'gemini', 0.6, 0)).toMatchObject({
      success: true,
      originalVolume: 0.6,
    });

    const consumed = await controller.consume('session-1', 'gemini', 'stream-secret', 1);
    expect(consumed).toMatchObject({
      success: true,
      ack: 'MEDIA_ACQUIRED',
      audioPathReady: true,
    });
    const session = controller.currentSession;
    expect(session.status).toBe(LIVE_DUBBING_STATUS.CONNECTING_PROVIDER);
    expect(session.lastError).toBeNull();
    await vi.waitFor(() => expect(controller.currentSession.originalVolume).toBe(0));
    await vi.waitFor(() => expect(controller.currentSession.audioEngine.getOriginalVolume()).toBe(0));
    expect(track.readyState).toBe('live');
    expect(track.stop).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();

    await expect(controller.connectProvider('session-1', 'gemini', 'en', 2)).resolves.toMatchObject({
      success: true,
      ack: 'PROVIDER_READY',
    });
    expect(controller.currentSession.status).toBe(LIVE_DUBBING_STATUS.RUNNING);

    await controller.dispose('session-1', 'gemini');
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('keeps media-stream capture ready when deferred original audio fails', async () => {
    const track = new FakeTrack();
    const stream = createStream(track);
    const notify = vi.fn();
    const clients = [];
    let providerCallbacks;
    const registry = {
      create: vi.fn((providerId, options) => {
        providerCallbacks = options.callbacks;
        const client = {
          connect: vi.fn(async () => providerCallbacks.onSetupComplete()),
          dispose: vi.fn(async () => {}),
        };
        clients.push(client);
        return client;
      }),
      getAudioMode: vi.fn(() => LIVE_DUBBING_AUDIO_MODES.MEDIA_STREAM),
    };
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => stream) },
      providerRegistry: registry,
      audioContextFactory: vi.fn(async () => {
        throw new Error('ctx boom');
      }),
      requestBootstrap: vi.fn().mockResolvedValue({
        success: true,
        providerId: 'gemini',
        targetLanguage: 'en',
        bootstrap: { accessToken: 'test-token' },
      }),
      notify,
    });

    controller.prepare('session-1', 'gemini', 'en', 0);
    expect(controller.setOriginalVolume('session-1', 'gemini', 0.6, 0)).toMatchObject({
      success: true,
      originalVolume: 0.6,
    });

    const consumed = await controller.consume('session-1', 'gemini', 'stream-secret', 1);
    expect(consumed).toMatchObject({
      success: true,
      ack: 'MEDIA_ACQUIRED',
      audioPathReady: true,
    });
    const session = controller.currentSession;
    expect(session.status).toBe(LIVE_DUBBING_STATUS.CONNECTING_PROVIDER);
    expect(session.lastError).toBeNull();
    await vi.waitFor(() => expect(controller.currentSession.originalVolume).toBe(0));
    await vi.waitFor(() => expect(controller.currentSession.audioEngine.getOriginalVolume()).toBe(0));
    expect(track.readyState).toBe('live');
    expect(track.stop).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();

    await expect(controller.connectProvider('session-1', 'gemini', 'en', 2)).resolves.toMatchObject({
      success: true,
      ack: 'PROVIDER_READY',
    });
    expect(controller.currentSession.status).toBe(LIVE_DUBBING_STATUS.RUNNING);

    await controller.dispose('session-1', 'gemini');
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('realizes the latest volume with a real monitor when a newer command arrives during init', async () => {
    const track = new FakeTrack();
    let resolveInputStart;
    const inputStarted = new Promise(resolve => {
      resolveInputStart = resolve;
    });
    const audioContextFactory = vi.fn(async () => createOriginalAudioContext());
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(track)) },
      providerRegistry: { getAudioMode: vi.fn(() => LIVE_DUBBING_AUDIO_MODES.PCM) },
      audioContextFactory,
      inputPipeline: {
        start: vi.fn(() => inputStarted),
        stop: vi.fn(async () => {}),
      },
      outputPlayer: {
        start: vi.fn(async () => {}),
        stop: vi.fn(async () => {}),
        clear: vi.fn(),
      },
    });

    controller.prepare('session-1', 'gemini', null, 0);
    expect(controller.setOriginalVolume('session-1', 'gemini', 0.4, 0)).toMatchObject({
      success: true,
      originalVolume: 0.4,
    });

    const consumePromise = controller.consume('session-1', 'gemini', 'stream-secret', 1);
    await vi.waitFor(() => expect(controller.currentSession.audioEngine).not.toBeNull());
    const pendingEngine = controller.currentSession.audioEngine;
    expect(pendingEngine.getOriginalVolume()).toBe(0);

    expect(controller.setOriginalVolume('session-1', 'gemini', 0.8, 1)).toMatchObject({
      success: true,
      originalVolume: 0.8,
    });
    expect(controller.currentSession.originalVolume).toBe(0.8);
    expect(pendingEngine.getOriginalVolume()).toBe(0);
    expect(pendingEngine.originalAudioMonitor).toBeNull();
    expect(audioContextFactory).not.toHaveBeenCalled();

    resolveInputStart();
    await expect(consumePromise).resolves.toMatchObject({
      success: true,
      ack: 'MEDIA_ACQUIRED',
    });

    await vi.waitFor(() => expect(controller.currentSession.audioEngine.getOriginalVolume()).toBe(0.8));
    expect(controller.currentSession.originalVolume).toBe(0.8);
    expect(controller.currentSession.audioEngine).toBe(pendingEngine);
    expect(audioContextFactory).toHaveBeenCalledOnce();
    expect(controller.currentSession.audioEngine.originalAudioMonitor).not.toBeNull();
    expect(controller.currentSession.eventSequence).toBe(1);

    await controller.dispose('session-1', 'gemini');
  });

  it('falls back to silence when the deferred volume fails during startup without losing capture', async () => {
    const track = new FakeTrack();
    let resolveInputStart;
    const inputStarted = new Promise(resolve => {
      resolveInputStart = resolve;
    });
    const notify = vi.fn();
    const audioContextFactory = vi.fn(async () => {
      throw new Error('ctx boom');
    });
    const provider = {
      connect: vi.fn(async () => provider.onSetupComplete()),
      close: vi.fn(),
    };
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(track)) },
      providerRegistry: { getAudioMode: vi.fn(() => LIVE_DUBBING_AUDIO_MODES.PCM) },
      audioContextFactory,
      inputPipeline: {
        start: vi.fn(() => inputStarted),
        stop: vi.fn(async () => {}),
      },
      outputPlayer: {
        start: vi.fn(async () => {}),
        stop: vi.fn(async () => {}),
        clear: vi.fn(),
      },
      providerClient: provider,
      requestBootstrap: vi.fn().mockResolvedValue({
        success: true,
        providerId: 'gemini',
        targetLanguage: 'en',
        bootstrap: { accessToken: 'test-token' },
      }),
      notify,
    });

    controller.prepare('session-1', 'gemini', 'en', 0);
    const consumePromise = controller.consume('session-1', 'gemini', 'stream-secret', 1);
    await vi.waitFor(() => expect(controller.currentSession.audioEngine).not.toBeNull());
    expect(controller.currentSession.audioEngine.getOriginalVolume()).toBe(0);

    expect(controller.setOriginalVolume('session-1', 'gemini', 0.8, 1)).toMatchObject({
      success: true,
      originalVolume: 0.8,
    });
    expect(controller.currentSession.audioEngine.getOriginalVolume()).toBe(0);

    resolveInputStart();
    await expect(consumePromise).resolves.toMatchObject({
      success: true,
      ack: 'MEDIA_ACQUIRED',
      audioPathReady: true,
    });

    const session = controller.currentSession;
    expect(session.status).toBe(LIVE_DUBBING_STATUS.CONNECTING_PROVIDER);
    expect(session.lastError).toBeNull();
    await vi.waitFor(() => expect(controller.currentSession.originalVolume).toBe(0));
    await vi.waitFor(() => expect(controller.currentSession.audioEngine.getOriginalVolume()).toBe(0));
    expect(track.readyState).toBe('live');
    expect(track.stop).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();

    await expect(controller.connectProvider('session-1', 'gemini', 'en', 2)).resolves.toMatchObject({
      success: true,
      ack: 'PROVIDER_READY',
    });
    expect(controller.currentSession.status).toBe(LIVE_DUBBING_STATUS.RUNNING);

    await controller.dispose('session-1', 'gemini');
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('does not block capture on a hanging deferred monitor startup', async () => {
    const track = new FakeTrack();
    let resolveCtx;
    const ctxPending = new Promise(resolve => {
      resolveCtx = resolve;
    });
    const notify = vi.fn();
    const audioContextFactory = vi.fn(() => ctxPending);
    const provider = {
      connect: vi.fn(async () => provider.onSetupComplete()),
      close: vi.fn(),
    };
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(track)) },
      providerRegistry: { getAudioMode: vi.fn(() => LIVE_DUBBING_AUDIO_MODES.PCM) },
      audioContextFactory,
      inputPipeline: { start: vi.fn(async () => {}), stop: vi.fn(async () => {}) },
      outputPlayer: { start: vi.fn(async () => {}), stop: vi.fn(async () => {}), clear: vi.fn() },
      providerClient: provider,
      requestBootstrap: vi.fn().mockResolvedValue({
        success: true,
        providerId: 'gemini',
        targetLanguage: 'en',
        bootstrap: { accessToken: 'test-token' },
      }),
      notify,
    });

    controller.prepare('session-1', 'gemini', 'en', 0);
    expect(controller.setOriginalVolume('session-1', 'gemini', 0.6, 0)).toMatchObject({
      success: true,
      originalVolume: 0.6,
    });

    const consumed = await controller.consume('session-1', 'gemini', 'stream-secret', 1);
    expect(consumed).toMatchObject({
      success: true,
      ack: 'MEDIA_ACQUIRED',
      audioPathReady: true,
    });
    await vi.waitFor(() => expect(audioContextFactory).toHaveBeenCalledOnce());
    expect(controller.currentSession.status).toBe(LIVE_DUBBING_STATUS.CONNECTING_PROVIDER);
    expect(controller.currentSession.lastError).toBeNull();
    expect(track.readyState).toBe('live');
    expect(track.stop).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();

    await expect(controller.connectProvider('session-1', 'gemini', 'en', 2)).resolves.toMatchObject({
      success: true,
      ack: 'PROVIDER_READY',
    });
    expect(controller.currentSession.status).toBe(LIVE_DUBBING_STATUS.RUNNING);

    await expect(controller.dispose('session-1', 'gemini')).resolves.toMatchObject({
      success: true,
      ack: 'DISPOSED',
    });
    expect(track.stop).toHaveBeenCalledOnce();
    expect(controller.currentSession).toBeNull();

    resolveCtx(createOriginalAudioContext());
    await Promise.resolve();
    await Promise.resolve();
    expect(notify).not.toHaveBeenCalled();
  });

  it('mutes promptly while a deferred monitor startup hangs with no stale gain', async () => {
    const track = new FakeTrack();
    let resolveCtx;
    const ctxPending = new Promise(resolve => {
      resolveCtx = resolve;
    });
    const notify = vi.fn();
    const audioContextFactory = vi.fn(() => ctxPending);
    const provider = {
      connect: vi.fn(async () => provider.onSetupComplete()),
      close: vi.fn(),
    };
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(track)) },
      providerRegistry: { getAudioMode: vi.fn(() => LIVE_DUBBING_AUDIO_MODES.PCM) },
      audioContextFactory,
      inputPipeline: { start: vi.fn(async () => {}), stop: vi.fn(async () => {}) },
      outputPlayer: { start: vi.fn(async () => {}), stop: vi.fn(async () => {}), clear: vi.fn() },
      providerClient: provider,
      requestBootstrap: vi.fn().mockResolvedValue({
        success: true,
        providerId: 'gemini',
        targetLanguage: 'en',
        bootstrap: { accessToken: 'test-token' },
      }),
      notify,
    });

    controller.prepare('session-1', 'gemini', 'en', 0);
    expect(controller.setOriginalVolume('session-1', 'gemini', 0.6, 0)).toMatchObject({
      success: true,
      originalVolume: 0.6,
    });

    await expect(controller.consume('session-1', 'gemini', 'stream-secret', 1)).resolves.toMatchObject({
      success: true,
      ack: 'MEDIA_ACQUIRED',
      audioPathReady: true,
    });
    await vi.waitFor(() => expect(audioContextFactory).toHaveBeenCalledOnce());

    await expect(controller.connectProvider('session-1', 'gemini', 'en', 2)).resolves.toMatchObject({
      success: true,
      ack: 'PROVIDER_READY',
    });
    expect(controller.currentSession.status).toBe(LIVE_DUBBING_STATUS.RUNNING);
    expect(controller.currentSession.originalVolume).toBe(0.6);
    expect(controller.currentSession.audioEngine.getOriginalVolume()).toBe(0.6);

    const mute = controller.setOriginalVolume('session-1', 'gemini', 0, 3);
    await expect(mute).resolves.toMatchObject({ success: true, originalVolume: 0 });
    expect(controller.currentSession.originalVolume).toBe(0);
    expect(track.stop).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();

    const fakeCtx = createOriginalAudioContext();
    resolveCtx(fakeCtx);
    const engine = controller.currentSession.audioEngine;
    await vi.waitFor(() => expect(engine.originalAudioMonitor).not.toBeNull());

    expect(controller.currentSession.originalVolume).toBe(0);
    expect(engine.getOriginalVolume()).toBe(0);
    const gainNode = fakeCtx.createGain.mock.results[0].value;
    expect(gainNode.gain.setValueAtTime).toHaveBeenCalled();
    expect(gainNode.gain.setValueAtTime).toHaveBeenLastCalledWith(0, expect.anything());
    expect(track.readyState).toBe('live');
    expect(track.stop).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();

    await controller.dispose('session-1', 'gemini');
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('stays silent with no monitor when muted to zero during startup', async () => {
    const track = new FakeTrack();
    let resolveInputStart;
    const inputStarted = new Promise(resolve => {
      resolveInputStart = resolve;
    });
    const audioContextFactory = vi.fn(async () => createOriginalAudioContext());
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(track)) },
      providerRegistry: { getAudioMode: vi.fn(() => LIVE_DUBBING_AUDIO_MODES.PCM) },
      audioContextFactory,
      inputPipeline: {
        start: vi.fn(() => inputStarted),
        stop: vi.fn(async () => {}),
      },
      outputPlayer: {
        start: vi.fn(async () => {}),
        stop: vi.fn(async () => {}),
        clear: vi.fn(),
      },
    });

    controller.prepare('session-1', 'gemini', null, 0);
    expect(controller.setOriginalVolume('session-1', 'gemini', 0.4, 0)).toMatchObject({
      success: true,
      originalVolume: 0.4,
    });

    const consumePromise = controller.consume('session-1', 'gemini', 'stream-secret', 1);
    await vi.waitFor(() => expect(controller.currentSession.audioEngine).not.toBeNull());

    expect(controller.setOriginalVolume('session-1', 'gemini', 0, 1)).toMatchObject({
      success: true,
      originalVolume: 0,
    });

    resolveInputStart();
    await expect(consumePromise).resolves.toMatchObject({
      success: true,
      ack: 'MEDIA_ACQUIRED',
    });

    expect(controller.currentSession.originalVolume).toBe(0);
    expect(controller.currentSession.audioEngine.getOriginalVolume()).toBe(0);
    expect(controller.currentSession.audioEngine.originalAudioMonitor).toBeNull();
    expect(audioContextFactory).not.toHaveBeenCalled();

    await controller.dispose('session-1', 'gemini');
  });

  it('stores original volume before engine creation without changing lifecycle state', () => {
    const controller = new LiveDubbingController();
    controller.prepare('session-1', 'gemini', null, 0);
    const session = controller.currentSession;
    const before = {
      eventSequence: session.eventSequence,
      status: session.status,
      providerGeneration: session.providerGeneration,
      stream: session.stream,
    };

    expect(controller.handle({
      action: LIVE_DUBBING_ACTIONS.SET_ORIGINAL_VOLUME_OFFSCREEN,
      data: { sessionId: 'session-1', providerId: 'gemini', volume: 0.4, eventSequence: 0 },
    })).toEqual({
      success: true,
      sessionId: 'session-1',
      providerId: 'gemini',
      eventSequence: 0,
      status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
      originalVolume: 0.4,
    });

    expect(session.originalVolume).toBe(0.4);
    expect(session.audioEngine).toBeNull();
    expect(session).toMatchObject(before);
    expect(controller.status()).not.toHaveProperty('originalVolume');
  });

  it.each([-1, 1.1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '0.5', null])(
    'rejects invalid original volume %p without mutation', volume => {
      const controller = new LiveDubbingController();
      controller.prepare('session-1', 'gemini', null, 0);
      const session = controller.currentSession;

      expect(controller.setOriginalVolume('session-1', 'gemini', volume, 0)).toMatchObject({
        success: false,
        error: 'LIVE_DUBBING_ORIGINAL_VOLUME_INVALID',
      });
      expect(session.originalVolume).toBe(0);
      expect(session.eventSequence).toBe(0);
      expect(session.status).toBe(LIVE_DUBBING_STATUS.PREPARING_CAPTURE);
    },
  );

  it('rejects wrong identity and sequence without changing the session fence', () => {
    const controller = new LiveDubbingController();
    controller.prepare('session-1', 'gemini', null, 0);
    const session = controller.currentSession;
    const before = {
      eventSequence: session.eventSequence,
      status: session.status,
      providerGeneration: session.providerGeneration,
      originalVolume: session.originalVolume,
    };

    expect(controller.setOriginalVolume('other-session', 'gemini', 0.5, 0)).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_SESSION_MISMATCH',
      ignored: true,
    });
    expect(controller.setOriginalVolume('session-1', 'openai', 0.5, 0)).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_SESSION_MISMATCH',
      ignored: true,
    });
    expect(controller.setOriginalVolume('session-1', 'gemini', 0.5, 1)).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_EVENT_SEQUENCE_MISMATCH',
      ignored: true,
    });
    expect(session).toMatchObject(before);
  });

  it('forwards active engine volume and commits only after success', async () => {
    const controller = new LiveDubbingController();
    controller.prepare('session-1', 'gemini', null, 0);
    const session = controller.currentSession;
    const audioEngine = { setOriginalVolume: vi.fn().mockResolvedValue(0.6) };
    session.audioEngine = audioEngine;
    session.audioPathReady = true;
    const before = {
      eventSequence: session.eventSequence,
      status: session.status,
      providerGeneration: session.providerGeneration,
      terminalRequested: session.terminalRequested,
    };

    await expect(controller.setOriginalVolume('session-1', 'gemini', 0.6, 0)).resolves.toEqual({
      success: true,
      sessionId: 'session-1',
      providerId: 'gemini',
      eventSequence: 0,
      status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
      originalVolume: 0.6,
    });
    expect(audioEngine.setOriginalVolume).toHaveBeenCalledWith(0.6);
    expect(session.originalVolume).toBe(0.6);
    expect(session).toMatchObject(before);
  });

  it('returns superseded latest-wins success when a newer volume commits first', async () => {
    const deferred = [];
    const controller = new LiveDubbingController();
    controller.prepare('session-1', 'gemini', null, 0);
    const session = controller.currentSession;
    const audioEngine = {
      setOriginalVolume: vi.fn(volume => new Promise(resolve => {
        deferred.push({ volume, resolve });
      })),
    };
    session.audioEngine = audioEngine;
    session.audioPathReady = true;

    const first = controller.setOriginalVolume('session-1', 'gemini', 0.2, 0);
    const second = controller.setOriginalVolume('session-1', 'gemini', 0.8, 0);
    await vi.waitFor(() => expect(audioEngine.setOriginalVolume).toHaveBeenCalledTimes(2));

    deferred[1].resolve(0.8);
    await expect(second).resolves.toEqual({
      success: true,
      sessionId: 'session-1',
      providerId: 'gemini',
      eventSequence: 0,
      status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
      originalVolume: 0.8,
    });
    expect(session.originalVolume).toBe(0.8);

    deferred[0].resolve(0.2);
    await expect(first).resolves.toEqual({
      success: true,
      ignored: true,
      superseded: true,
      sessionId: 'session-1',
      providerId: 'gemini',
      eventSequence: 0,
      status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
      originalVolume: 0.8,
    });
    expect(session.originalVolume).toBe(0.8);
    expect(session.eventSequence).toBe(0);
  });

  it('keeps an early completion superseded while a newer volume is still pending', async () => {
    const deferred = [];
    const controller = new LiveDubbingController();
    controller.prepare('session-1', 'gemini', null, 0);
    const session = controller.currentSession;
    const audioEngine = {
      setOriginalVolume: vi.fn(volume => new Promise(resolve => {
        deferred.push({ volume, resolve });
      })),
    };
    session.audioEngine = audioEngine;
    session.audioPathReady = true;

    const first = controller.setOriginalVolume('session-1', 'gemini', 0.2, 0);
    const second = controller.setOriginalVolume('session-1', 'gemini', 0.8, 0);
    await vi.waitFor(() => expect(audioEngine.setOriginalVolume).toHaveBeenCalledTimes(2));

    deferred[0].resolve(0.2);
    await expect(first).resolves.toEqual({
      success: true,
      ignored: true,
      superseded: true,
      sessionId: 'session-1',
      providerId: 'gemini',
      eventSequence: 0,
      status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
      originalVolume: 0,
    });
    expect(session.originalVolume).toBe(0);

    deferred[1].resolve(0.8);
    await expect(second).resolves.toEqual({
      success: true,
      sessionId: 'session-1',
      providerId: 'gemini',
      eventSequence: 0,
      status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
      originalVolume: 0.8,
    });
    expect(session.originalVolume).toBe(0.8);
    expect(session.eventSequence).toBe(0);
  });

  it('reconciles the real engine back to silence after a failed volume command', async () => {
    const notify = vi.fn();
    const controller = new LiveDubbingController({ notify });
    controller.prepare('session-1', 'gemini', null, 0);
    const session = controller.currentSession;
    const track = new FakeTrack();
    const stream = createStream(track);
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.MEDIA_STREAM,
      originalAudioMonitorFactory: async () => {
        throw new Error('monitor boom');
      },
    });
    await engine.start(stream);
    session.audioEngine = engine;
    session.audioPathReady = true;
    const beforeGeneration = controller.providerGeneration;

    await expect(controller.setOriginalVolume('session-1', 'gemini', 0.6, 0)).resolves.toEqual({
      success: false,
      error: 'LIVE_DUBBING_ORIGINAL_AUDIO_UNAVAILABLE',
      sessionId: 'session-1',
      providerId: 'gemini',
      eventSequence: 0,
      status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
    });

    expect(session.originalVolume).toBe(0);
    expect(engine.getOriginalVolume()).toBe(0);
    expect(session.status).toBe(LIVE_DUBBING_STATUS.PREPARING_CAPTURE);
    expect(session.eventSequence).toBe(0);
    expect(session.terminalRequested).toBe(false);
    expect(session.disposing).toBe(false);
    expect(session.providerClient).toBeNull();
    expect(controller.providerGeneration).toBe(beforeGeneration);
    expect(controller.currentSession).toBe(session);
    expect(notify).not.toHaveBeenCalled();
    expect(track.stop).not.toHaveBeenCalled();

    await engine.stop();
    await controller.dispose('session-1', 'gemini');
  });

  it('rolls the real engine back to a prior non-zero volume after a failed command', async () => {
    const controller = new LiveDubbingController({ notify: vi.fn() });
    controller.prepare('session-1', 'gemini', null, 0);
    const session = controller.currentSession;
    const stream = createStream(new FakeTrack());
    let failVolume = null;
    const monitor = {
      start: vi.fn(async () => {}),
      setVolume: vi.fn(volume => {
        if (volume === failVolume) throw new Error('gain boom');
      }),
      stop: vi.fn(async () => {}),
    };
    const engine = new LiveDubbingAudioEngine({
      audioMode: LIVE_DUBBING_AUDIO_MODES.MEDIA_STREAM,
      originalAudioMonitor: monitor,
    });
    await engine.start(stream);
    session.audioEngine = engine;
    session.audioPathReady = true;

    await expect(controller.setOriginalVolume('session-1', 'gemini', 0.4, 0)).resolves.toMatchObject({
      success: true,
      originalVolume: 0.4,
    });
    expect(session.originalVolume).toBe(0.4);
    expect(engine.getOriginalVolume()).toBe(0.4);

    failVolume = 0.9;
    await expect(controller.setOriginalVolume('session-1', 'gemini', 0.9, 0)).resolves.toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_ORIGINAL_AUDIO_UNAVAILABLE',
    });
    expect(session.originalVolume).toBe(0.4);
    expect(engine.getOriginalVolume()).toBe(0.4);
    expect(session.status).toBe(LIVE_DUBBING_STATUS.PREPARING_CAPTURE);
    expect(session.terminalRequested).toBe(false);
    expect(controller.currentSession).toBe(session);

    await engine.stop();
    await controller.dispose('session-1', 'gemini');
  });

  it('bounds engine failures without terminalizing or cleaning up the session', async () => {
    const controller = new LiveDubbingController({ notify: vi.fn() });
    controller.prepare('session-1', 'gemini', null, 0);
    const session = controller.currentSession;
    session.audioEngine = {
      setOriginalVolume: vi.fn().mockRejectedValue(new Error('monitor unavailable')),
    };
    session.audioPathReady = true;
    const beforeGeneration = controller.providerGeneration;

    await expect(controller.setOriginalVolume('session-1', 'gemini', 0.6, 0)).resolves.toEqual({
      success: false,
      error: 'LIVE_DUBBING_ORIGINAL_AUDIO_UNAVAILABLE',
      sessionId: 'session-1',
      providerId: 'gemini',
      eventSequence: 0,
      status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
    });
    expect(session.originalVolume).toBe(0);
    expect(session.status).toBe(LIVE_DUBBING_STATUS.PREPARING_CAPTURE);
    expect(session.terminalRequested).toBe(false);
    expect(controller.providerGeneration).toBe(beforeGeneration);
    expect(controller.currentSession).toBe(session);
  });

  it('does not publish a late volume completion after disposal', async () => {
    let resolveVolume;
    const controller = new LiveDubbingController();
    controller.prepare('session-1', 'gemini', null, 0);
    const session = controller.currentSession;
    session.audioEngine = {
      setOriginalVolume: vi.fn(() => new Promise(resolve => { resolveVolume = resolve; })),
    };
    session.audioPathReady = true;

    const pending = controller.setOriginalVolume('session-1', 'gemini', 0.6, 0);
    await Promise.resolve();
    await controller.dispose('session-1', 'gemini');
    resolveVolume(0.6);

    await expect(pending).resolves.toMatchObject({
      success: false,
      ignored: true,
      error: 'LIVE_DUBBING_SESSION_DISPOSED',
    });
    expect(session.originalVolume).toBe(0);
    expect(controller.currentSession).toBeNull();
  });

  it('requires an explicit zero sequence for the initial prepare', () => {
    const controller = new LiveDubbingController();
    const missing = controller.handle({
      action: LIVE_DUBBING_ACTIONS.PREPARE,
      data: { sessionId: 'session-1' },
    });
    const future = controller.prepare('session-1', 'gemini', null, 1);

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

    expect(controller.prepare('session-1', 'gemini', null, 0)).toMatchObject({
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

    controller.prepare('session-1', 'gemini', null, 0);
    for (const eventSequence of [undefined, 0, 2]) {
      const response = controller.consume('session-1', 'gemini', 'stream-secret', eventSequence);
      expect(response).toMatchObject({
        success: false,
        error: 'LIVE_DUBBING_EVENT_SEQUENCE_MISMATCH',
      });
      expect(controller.currentSession.eventSequence).toBe(0);
      expect(controller.currentSession.status).toBe(LIVE_DUBBING_STATUS.PREPARING_CAPTURE);
    }
    expect(getUserMedia).not.toHaveBeenCalled();

    const firstConsume = controller.consume('session-1', 'gemini', 'stream-secret', 1);
    expect(controller.currentSession.eventSequence).toBe(1);
    expect(controller.consume('session-1', 'gemini', 'other-stream-secret', 1)).toBe(firstConsume);
    await expect(firstConsume).resolves.toMatchObject({
      success: true,
      ack: 'MEDIA_ACQUIRED',
    });

    expect(controller.consume('session-1', 'gemini', 'stream-secret', 0)).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_EVENT_SEQUENCE_MISMATCH',
    });
    expect(controller.consume('session-1', 'gemini', 'stream-secret', 2)).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_EVENT_SEQUENCE_MISMATCH',
    });
    expect(controller.consume('session-1', 'gemini', 'stream-secret', 1)).toMatchObject({
      success: true,
      ack: 'MEDIA_ACQUIRED',
    });
    expect(getUserMedia).toHaveBeenCalledOnce();

    await controller.dispose('session-1', 'gemini');
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
    let resolveBootstrap;
    const bootstrap = new Promise(resolve => {
      resolveBootstrap = resolve;
    });
    const provider = {
      connect: vi.fn(async () => provider.onSetupComplete()),
      close: vi.fn(),
    };
    const requestBootstrap = vi.fn(() => bootstrap);
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(track)) },
      inputPipeline,
      outputPlayer,
      providerClient: provider,
      requestBootstrap,
    });

    controller.prepare('session-1', 'gemini', 'en', 0);
    await controller.consume('session-1', 'gemini', 'stream-secret', 1);
    for (const eventSequence of [undefined, 1, 3]) {
      const response = controller.connectProvider('session-1', 'gemini', 'en', eventSequence);
      expect(response).toMatchObject({
        success: false,
        error: 'LIVE_DUBBING_EVENT_SEQUENCE_MISMATCH',
      });
      expect(controller.currentSession.eventSequence).toBe(1);
      expect(controller.currentSession.status).toBe(LIVE_DUBBING_STATUS.CONNECTING_PROVIDER);
    }
    expect(requestBootstrap).not.toHaveBeenCalled();

    const firstConnect = controller.connectProvider('session-1', 'gemini', 'en', 2);
    expect(controller.connectProvider('session-1', 'gemini', 'en', 2)).toBe(firstConnect);
    expect(controller.currentSession.eventSequence).toBe(2);
    expect(controller.connectProvider('session-1', 'gemini', 'en', 1)).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_EVENT_SEQUENCE_MISMATCH',
    });

    resolveBootstrap({
      success: true,
      providerId: 'gemini',
      targetLanguage: 'en',
      bootstrap: { accessToken: 'test-token' },
    });
    await expect(firstConnect).resolves.toMatchObject({
      success: true,
      ack: 'PROVIDER_READY',
      eventSequence: 3,
    });
    expect(controller.connectProvider('session-1', 'gemini', 'en', 2)).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_EVENT_SEQUENCE_MISMATCH',
    });
    expect(controller.connectProvider('session-1', 'gemini', 'en', 3)).toMatchObject({
      success: true,
      ack: 'PROVIDER_READY',
    });

    await controller.dispose('session-1', 'gemini');
  });

  it('clears settled bootstrap before pending provider setup resolves', async () => {
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
    const requestBootstrap = vi.fn().mockResolvedValue({
      success: true,
      providerId: 'gemini',
      targetLanguage: 'en',
      bootstrap: { accessToken: 'test-token' },
    });
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(track)) },
      inputPipeline,
      outputPlayer,
      providerClientFactory,
      requestBootstrap,
    });

    controller.prepare('session-1', 'gemini', 'en', 0);
    await controller.consume('session-1', 'gemini', 'stream-secret', 1);
    const connecting = controller.connectProvider('session-1', 'gemini', 'en', 2);
    await vi.waitFor(() => expect(providerClientFactory).toHaveBeenCalledOnce());
    expect(requestBootstrap).not.toHaveBeenCalled();
    expect(controller.currentSession.bootstrapRequestPromise).toBeNull();

    resolveClient(provider);
    await setupStarted;

    const session = controller.currentSession;
    expect(provider.connect).toHaveBeenCalledWith({
      bootstrap: { accessToken: 'test-token' },
      targetLanguage: 'en',
    });
    expect(session.bootstrapRequestPromise).toBeNull();
    expect(session.bootstrapRequested).toBe(true);
    await expect(controller.requestProviderBootstrapForSession(session)).resolves.toBeNull();
    expect(requestBootstrap).toHaveBeenCalledOnce();
    expect(session).not.toHaveProperty('bootstrap');
    expect(session).not.toHaveProperty('accessToken');
    expect(JSON.stringify(session)).not.toContain('test-token');

    provider.onSetupComplete();
    resolveSetup();
    await expect(connecting).resolves.toMatchObject({
      success: true,
      ack: 'PROVIDER_READY',
    });
    expect(session.bootstrapRequestPromise).toBeNull();
    expect(JSON.stringify(session)).not.toContain('test-token');

    await controller.dispose('session-1', 'gemini');
  });

  it('calls getUserMedia immediately with Chrome tab constraints', async () => {
    const stream = createStream(new FakeTrack());
    const getUserMedia = vi.fn(() => Promise.resolve(stream));
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia },
    });

    controller.prepare('session-1', 'gemini', null, 0);
    const consume = controller.consume('session-1', 'gemini', 'stream-secret', 1);

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

    controller.prepare('session-1', 'gemini', null, 0);
    const firstConsume = controller.consume('session-1', 'gemini', 'stream-secret', 1);
    const duplicateConsume = controller.consume('session-1', 'gemini', 'other-stream-secret', 1);

    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(duplicateConsume).toBe(firstConsume);

    resolveCapture(stream);
    await expect(firstConsume).resolves.toMatchObject({
      success: true,
      ack: 'MEDIA_ACQUIRED',
      status: LIVE_DUBBING_INTERNAL_STATUS.CAPTURING,
    });
    expect(track.listeners.has('ended')).toBe(true);

    await controller.dispose('session-1', 'gemini');
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('disposes pending capture immediately and stops a stream that resolves late', async () => {
    const track = new FakeTrack();
    let resolveCapture;
    const capture = new Promise(resolve => { resolveCapture = resolve; });
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(() => capture) },
    });

    controller.prepare('session-1', 'gemini', null, 0);
    const consume = controller.consume('session-1', 'gemini', 'stream-secret', 1);
    const disposed = await controller.dispose('session-1', 'gemini', 'STOP_REQUESTED');

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

    controller.prepare('session-1', 'gemini', null, 0);
    await expect(controller.consume('session-1', 'gemini', 'stream-secret', 1)).resolves.toMatchObject({
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

    controller.prepare('session-1', 'gemini', null, 0);
    const result = await controller.consume('session-1', 'gemini', streamId, 1);

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

    controller.prepare('session-1', 'gemini', null, 0);
    await controller.consume('session-1', 'gemini', 'stream-secret', 1);

    const stale = await controller.handle({
      action: LIVE_DUBBING_ACTIONS.DISPOSE,
      data: { sessionId: 'stale-session', providerId: 'gemini', reason: 'STALE' },
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

    const disposed = await controller.dispose('session-1', 'gemini', 'STOP');
    const repeated = await controller.dispose('session-1', 'gemini', 'STOP');
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

    controller.prepare('session-1', 'gemini', null, 0);
    await controller.consume('session-1', 'gemini', 'stream-secret', 1);
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
        providerId: 'gemini',
        eventSequence: 1,
        status: LIVE_DUBBING_STATUS.ERROR,
        event: 'TRACK_ENDED',
        error: 'LIVE_DUBBING_CAPTURE_TRACK_ENDED',
      },
    });

    await controller.dispose('session-1', 'gemini');
    track.end();
    expect(controller.status().sessionId).toBeNull();
    expect(notify).toHaveBeenCalledOnce();
  });

  it('delivers a successful terminal notification immediately and only once', async () => {
    const notify = vi.fn();
    const controller = new LiveDubbingController({ notify });

    controller.prepare('session-1', 'gemini', null, 0);
    const session = controller.currentSession;
    session.status = LIVE_DUBBING_STATUS.ERROR;
    session.lastError = 'LIVE_DUBBING_INPUT_PIPELINE_ERROR';
    controller._notifyTerminal(session, 'INPUT_PIPELINE_ERROR');
    await Promise.resolve();

    expect(notify).toHaveBeenCalledOnce();
    expect(session.terminalDelivery).toMatchObject({
      attempts: 1,
      cancelled: false,
      delivered: true,
    });
    expect(Object.isFrozen(notify.mock.calls[0][0])).toBe(true);
    expect(Object.isFrozen(notify.mock.calls[0][0].data)).toBe(true);
  });

  it.each([
    ['INPUT_PIPELINE_ERROR', 'LIVE_DUBBING_INPUT_PIPELINE_ERROR'],
    ['OUTPUT_PIPELINE_ERROR', 'LIVE_DUBBING_OUTPUT_PIPELINE_ERROR'],
    ['INPUT_SEND_ERROR', 'LIVE_DUBBING_INPUT_SEND_ERROR'],
    ['OUTPUT_AUDIO_ERROR', 'LIVE_DUBBING_OUTPUT_AUDIO_ERROR'],
    ['TRACK_ENDED', 'LIVE_DUBBING_CAPTURE_TRACK_ENDED'],
  ])('retries terminal %s with the same sanitized immutable payload', async (event, error) => {
    vi.useFakeTimers();
    try {
      const notify = vi.fn()
        .mockRejectedValueOnce(new Error('transport-secret'))
        .mockResolvedValueOnce(undefined);
      const controller = new LiveDubbingController({ notify });

      controller.prepare('session-1', 'gemini', null, 0);
      const session = controller.currentSession;
      session.status = LIVE_DUBBING_STATUS.ERROR;
      session.lastError = error;
      session.providerDiagnostic = {
        stage: 'CONNECT_PROVIDER',
        code: 'SAFE_PROVIDER_ERROR',
        closeCode: null,
        wasClean: null,
        terminalCategory: 'PROVIDER_ERROR',
        malformedAt: null,
        wsOpen: true,
        setupSent: true,
        setupComplete: false,
        message: 'provider-secret',
      };
      controller._notifyTerminal(session, event, {
        cleanupCause: `LIVE_DUBBING_${event}`,
        capturedFrames: 1,
        inputSentFrames: 1,
        inputPendingFrames: 0,
        providerLastSendReason: null,
        providerAudioChunks: 1,
        playbackAccepted: false,
        outputSafetyDrops: 0,
        interruptions: 0,
        providerTerminalCategory: event,
        secret: 'cleanup-secret',
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(notify).toHaveBeenCalledOnce();
      const payload = notify.mock.calls[0][0];
      expect(payload).toMatchObject({
        action: LIVE_DUBBING_ACTIONS.TERMINAL,
        data: {
          event,
          error,
        },
      });
      expect(JSON.stringify(payload)).not.toContain('provider-secret');
      expect(JSON.stringify(payload)).not.toContain('cleanup-secret');
      expect(Object.isFrozen(payload)).toBe(true);
      expect(Object.isFrozen(payload.data)).toBe(true);

      await vi.advanceTimersByTimeAsync(25);
      expect(notify).toHaveBeenCalledTimes(2);
      expect(notify.mock.calls[1][0]).toBe(payload);
      expect(session.terminalDelivery).toMatchObject({ attempts: 2, delivered: true });
      await vi.advanceTimersByTimeAsync(100);
      expect(notify).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops after exactly three failed terminal notification attempts', async () => {
    vi.useFakeTimers();
    try {
      const debug = vi.fn();
      const notify = vi.fn(() => Promise.reject(new Error('transport-secret')));
      const controller = new LiveDubbingController({ notify, logger: { debug } });

      controller.prepare('session-1', 'gemini', null, 0);
      const session = controller.currentSession;
      session.status = LIVE_DUBBING_STATUS.ERROR;
      session.lastError = 'LIVE_DUBBING_OUTPUT_AUDIO_ERROR';
      controller._notifyTerminal(session, 'OUTPUT_AUDIO_ERROR');

      await vi.advanceTimersByTimeAsync(25);
      await vi.advanceTimersByTimeAsync(50);
      expect(notify).toHaveBeenCalledTimes(3);
      expect(session.terminalDelivery).toMatchObject({ attempts: 3, delivered: false });
      expect(debug).toHaveBeenCalledWith(
        'Live dubbing terminal notification delivery exhausted',
        { attempts: 3 },
      );

      await vi.advanceTimersByTimeAsync(100);
      expect(notify).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts cleanup without waiting for terminal notification retry', async () => {
    vi.useFakeTimers();
    try {
      const notify = vi.fn(() => Promise.reject(new Error('transport-secret')));
      const controller = new LiveDubbingController({ notify });
      controller.prepare('session-1', 'gemini', null, 0);
      const session = controller.currentSession;
      session.status = LIVE_DUBBING_STATUS.ERROR;
      session.lastError = 'LIVE_DUBBING_PROVIDER_ERROR';

      controller._providerFailed(session, { code: 'LIVE_DUBBING_PROVIDER_ERROR' }, 'PROVIDER_ERROR');
      await session.cleanupPromise;

      expect(notify).toHaveBeenCalledOnce();
      expect(session.telemetry.milestones.cleanupComplete).not.toBeNull();
      await vi.advanceTimersByTimeAsync(25);
      expect(notify).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels late terminal delivery when disposing and replacing a session', async () => {
    vi.useFakeTimers();
    try {
      let rejectNotification;
      const notify = vi.fn(() => new Promise((resolve, reject) => {
        void resolve;
        rejectNotification = reject;
      }));
      const controller = new LiveDubbingController({ notify });

      controller.prepare('session-1', 'gemini', null, 0);
      const oldSession = controller.currentSession;
      oldSession.status = LIVE_DUBBING_STATUS.ERROR;
      oldSession.lastError = 'LIVE_DUBBING_PROVIDER_ERROR';
      controller._notifyTerminal(oldSession, 'PROVIDER_ERROR');

      await controller.dispose('session-1', 'gemini');
      expect(oldSession.terminalDelivery.cancelled).toBe(true);
      controller.prepare('session-2', 'gemini', null, 0);
      rejectNotification(new Error('late-transport-secret'));
      await vi.advanceTimersByTimeAsync(100);

      expect(notify).toHaveBeenCalledOnce();
      expect(controller.currentSession).toMatchObject({
        sessionId: 'session-2',
        terminalDelivery: null,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps provider, pipeline, and track terminal paths single-flight', () => {
    const notify = vi.fn();
    const controller = new LiveDubbingController({ notify });
    const track = new FakeTrack();

    controller.prepare('session-1', 'gemini', null, 0);
    const session = controller.currentSession;
    session.status = LIVE_DUBBING_STATUS.RUNNING;
    session.stream = createStream(track);
    controller._providerFailed(session, { code: 'LIVE_DUBBING_PROVIDER_ERROR' }, 'PROVIDER_ERROR');
    controller._handlePipelineError(session, { code: 'LIVE_DUBBING_INPUT_PIPELINE_ERROR' }, 'INPUT_PIPELINE_ERROR');
    controller._handleTrackEnded(session);

    expect(notify).toHaveBeenCalledOnce();
  });

  it('rejects status requests for another session with explicit mismatch proof', async () => {
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(new FakeTrack())) },
    });

    controller.prepare('session-1', 'gemini', null, 0);
    const response = controller.handle({
      action: LIVE_DUBBING_ACTIONS.STATUS,
      data: { sessionId: 'stale-session', providerId: 'gemini' },
    });

    expect(response).toMatchObject({
      success: false,
      ignored: true,
      error: 'LIVE_DUBBING_SESSION_MISMATCH',
      sessionId: 'stale-session',
      providerId: 'gemini',
      requestedSessionId: 'stale-session',
      actualSessionId: 'session-1',
      requestedProviderId: 'gemini',
      actualProviderId: 'gemini',
    });
  });

  it('rejects status requests with explicit provider mismatch proof', async () => {
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(new FakeTrack())) },
    });

    controller.prepare('session-1', 'gemini', null, 0);
    // Simulate a future provider owning the active session while the caller
    // still presents the same sessionId with the fixed background provider.
    controller.currentSession.providerId = 'future-provider';
    const response = controller.status('session-1', 'gemini');

    expect(response).toMatchObject({
      success: false,
      ignored: true,
      error: 'LIVE_DUBBING_SESSION_MISMATCH',
      sessionId: 'session-1',
      providerId: 'gemini',
      requestedSessionId: 'session-1',
      actualSessionId: 'session-1',
      requestedProviderId: 'gemini',
      actualProviderId: 'future-provider',
    });
  });

  it('does not request provider bootstrap before capture pipelines are ready', async () => {
    const requestBootstrap = vi.fn().mockResolvedValue({
      success: true,
      providerId: 'gemini',
      targetLanguage: 'fil',
      bootstrap: { accessToken: 'test-token' },
    });
    const controller = new LiveDubbingController({ requestBootstrap });

    controller.prepare('session-1', 'gemini', 'fil', 0);
    const first = await controller.requestProviderBootstrap();

    expect(first).toEqual({
      success: false,
      error: 'LIVE_DUBBING_AUDIO_PIPELINES_UNAVAILABLE',
    });
    expect(requestBootstrap).not.toHaveBeenCalled();
  });

  it('passes bootstrap opaquely to the provider adapter', async () => {
    const bootstrap = {};
    Object.defineProperty(bootstrap, 'accessToken', {
      get() {
        throw new Error('generic controller must not inspect accessToken');
      },
    });
    const provider = {
      connect: vi.fn(async options => {
        expect(options.bootstrap).toBe(bootstrap);
      }),
      close: vi.fn(),
    };
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(new FakeTrack())) },
      inputPipeline: { start: vi.fn(async () => {}), stop: vi.fn(async () => {}) },
      outputPlayer: { start: vi.fn(async () => {}), stop: vi.fn(async () => {}), clear: vi.fn() },
      providerClient: provider,
      requestBootstrap: vi.fn().mockResolvedValue({
        success: true,
        providerId: 'gemini',
        targetLanguage: 'en',
        bootstrap,
      }),
    });

    controller.prepare('opaque-session', 'gemini', 'en', 0);
    await controller.consume('opaque-session', 'gemini', 'stream-secret', 1);

    await expect(controller.connectProvider('opaque-session', 'gemini', 'en', 2))
      .resolves.toMatchObject({ success: true, ack: 'PROVIDER_READY' });
    expect(provider.connect).toHaveBeenCalledOnce();
    expect(provider.connect.mock.calls[0][0].bootstrap).toBe(bootstrap);
    expect(provider.connect.mock.calls[0][0].targetLanguage).toBe('en');
    await controller.dispose('opaque-session', 'gemini');
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
    const requestBootstrap = vi.fn().mockResolvedValue({
      success: true,
      providerId: 'gemini',
      targetLanguage: 'fr',
      bootstrap: { accessToken: 'test-token' },
    });
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => stream) },
      requestBootstrap,
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

    controller.prepare('session-1', 'gemini', 'fr', 0);
    const captured = await controller.consume('session-1', 'gemini', 'stream-secret', 1);
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

    const connected = await controller.connectProvider('session-1', 'gemini', 'fr', 2);
    expect(connected).toMatchObject({
        ack: 'PROVIDER_READY',
        status: LIVE_DUBBING_STATUS.RUNNING,
        setupComplete: true,
    });
    expect(requestBootstrap).toHaveBeenCalledOnce();
    expect(provider.connect).toHaveBeenCalledWith({
      bootstrap: { accessToken: 'test-token' },
      targetLanguage: 'fr',
    });
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

    await controller.dispose('session-1', 'gemini');
    expect(provider.close).toHaveBeenCalledOnce();
    expect(inputPipeline.stop).toHaveBeenCalledOnce();
    expect(outputPlayer.stop).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('keeps status readiness closed while one local graph start is pending', async () => {
    const track = new FakeTrack();
    let resolveOutputStart;
    const inputPipeline = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    };
    const outputPlayer = {
      start: vi.fn(() => new Promise(resolve => { resolveOutputStart = resolve; })),
      stop: vi.fn(async () => {}),
      clear: vi.fn(),
    };
    const inputPipelineFactory = vi.fn(options => {
      expect(options.sessionId).toBe('session-1');
      expect(options).not.toHaveProperty('factoryContext');
      return inputPipeline;
    });
    const outputPlayerFactory = vi.fn(options => {
      expect(options.sessionId).toBe('session-1');
      expect(options).not.toHaveProperty('factoryContext');
      return outputPlayer;
    });
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(track)) },
      inputPipelineFactory,
      outputPlayerFactory,
    });

    controller.prepare('session-1', 'gemini', null, 0);
    const capture = controller.consume('session-1', 'gemini', 'stream-secret', 1);
    await vi.waitFor(() => expect(controller.currentSession.telemetry.milestones.inputReady)
      .not.toBeNull());

    expect(controller.status()).toMatchObject({
      active: true,
      status: LIVE_DUBBING_INTERNAL_STATUS.CAPTURING,
      audioPathReady: false,
      inputPipelineReady: false,
      outputPipelineReady: false,
    });
    expect(controller.currentSession.telemetry.milestones.outputReady).toBeNull();

    resolveOutputStart();
    await expect(capture).resolves.toMatchObject({
      status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
      audioPathReady: true,
      inputPipelineReady: true,
      outputPipelineReady: true,
    });
    await controller.dispose('session-1', 'gemini');
  });

  it('captures output metrics baseline before reused player start notifications', async () => {
    const track = new FakeTrack();
    let metrics = {
      queuedSamples: 2_400,
      peakQueuedSamples: 2_400,
      underruns: 7,
      underrunSamples: 70,
      safetyDrops: 2,
      epochResets: 1,
      acceptedChunks: 3,
    };
    const inputPipeline = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    };
    const outputPlayer = {
      onMetrics: null,
      start: vi.fn(() => {
        metrics = {
          ...metrics,
          queuedSamples: 4_800,
          peakQueuedSamples: 4_800,
          underruns: 8,
          underrunSamples: 90,
          safetyDrops: 3,
          epochResets: 2,
          acceptedChunks: 4,
        };
        outputPlayer.onMetrics(metrics);
      }),
      stop: vi.fn(async () => {}),
      clear: vi.fn(),
      getMetrics: vi.fn(() => ({ ...metrics })),
    };
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(track)) },
      inputPipelineFactory: vi.fn(() => inputPipeline),
      outputPlayerFactory: vi.fn(() => outputPlayer),
    });

    controller.prepare('session-1', 'gemini', null, 0);
    await controller.consume('session-1', 'gemini', 'stream-secret', 1);

    expect(controller.getTelemetry()).toMatchObject({
      outputQueueCurrentDurationMs: 200,
      outputQueuePeakDurationMs: 200,
      underruns: 1,
      underrunSamples: 20,
      outputSafetyDrops: 1,
    });
    await controller.dispose('session-1', 'gemini');
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
      requestBootstrap: vi.fn().mockResolvedValue({
        success: true,
        providerId: 'gemini',
        targetLanguage: 'en',
        bootstrap: { accessToken: 'test-token' },
      }),
      onPlaybackAccepted,
    });

    controller.prepare('session-1', 'gemini', 'en', 0);
    await controller.consume('session-1', 'gemini', 'stream-secret', 1);
    inputPipeline.onFrame({ buffer: new ArrayBuffer(2), sampleCount: 1, sampleRate: 16_000 });
    await controller.connectProvider('session-1', 'gemini', 'en', 2);
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
    expect(JSON.stringify(telemetry)).not.toContain('test-token');
    expect(JSON.stringify(telemetry)).not.toContain('stream-secret');
    expect(JSON.stringify(telemetry)).not.toContain('AQ==');

    const session = controller.currentSession;
    await controller.dispose('session-1', 'gemini');
    expect(session.bootstrapRequested).toBe(false);
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
    const debug = vi.fn();
    const notify = vi.fn();
    const controller = new LiveDubbingController({ logger: { debug }, notify });
    controller.prepare('session-1', 'gemini', 'en', 0);
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

    expect(debug).toHaveBeenCalledOnce();
    expect(debug).toHaveBeenCalledWith('Live dubbing ended without translated playback', {
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
    const diagnostic = debug.mock.calls[0][1];
    expect(Object.values(diagnostic).every(value => value === null || ['string', 'number', 'boolean'].includes(typeof value))).toBe(true);
    expect(JSON.stringify(diagnostic)).not.toContain('session-secret');
    expect(JSON.stringify(diagnostic)).not.toContain('stream-secret');
    expect(JSON.stringify(diagnostic)).not.toContain('AQ==');
    expect(JSON.stringify(diagnostic)).not.toContain('private transcript');
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ cleanupDiagnostic: diagnostic }),
    }));

    await controller.dispose('session-1', 'gemini');

    controller.prepare('session-2', 'gemini', 'en', 0);
    const playedSession = controller.currentSession;
    playedSession.setupComplete = true;
    playedSession.telemetry.milestones.setupComplete = 1;
    playedSession.telemetry.milestones.firstTranslatedAudioAcceptedByPlayback = 2;
    await controller.dispose('session-2', 'gemini');

    expect(debug).toHaveBeenCalledOnce();
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
      requestBootstrap: vi.fn().mockResolvedValue({
        success: true,
        providerId: 'gemini',
        targetLanguage: 'de',
        bootstrap: { accessToken: 'test-token' },
      }),
      notify,
    });

    controller.prepare('session-1', 'gemini', 'de', 0);
    await controller.consume('session-1', 'gemini', 'stream-secret', 1);
    await controller.connectProvider('session-1', 'gemini', 'de', 2);
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
    await controller.dispose('session-1', 'gemini');
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
      requestBootstrap: vi.fn().mockResolvedValue({
        success: true,
        providerId: 'gemini',
        targetLanguage: 'fr',
        bootstrap: { accessToken: 'test-token' },
      }),
      notify,
    });

    controller.prepare('session-1', 'gemini', 'fr', 0);
    await controller.consume('session-1', 'gemini', 'stream-secret', 1);
    await controller.connectProvider('session-1', 'gemini', 'fr', 2);
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

    await controller.dispose('session-1', 'gemini');
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
      requestBootstrap: vi.fn().mockResolvedValue({
        success: true,
        providerId: 'gemini',
        targetLanguage: 'fr',
        bootstrap: { accessToken: 'test-token' },
      }),
      notify,
    });

    controller.prepare('session-1', 'gemini', 'fr', 0);
    await controller.consume('session-1', 'gemini', 'stream-secret', 1);
    const result = await controller.connectProvider('session-1', 'gemini', 'fr', 2);
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

    await controller.dispose('session-1', 'gemini');
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
      requestBootstrap: vi.fn().mockResolvedValue({
        success: true,
        providerId: 'gemini',
        targetLanguage: 'fr',
        bootstrap: { accessToken: 'test-token' },
      }),
      notify,
    });

    controller.prepare('session-1', 'gemini', 'fr', 0);
    await controller.consume('session-1', 'gemini', 'stream-secret', 1);
    await controller.connectProvider('session-1', 'gemini', 'fr', 2);

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

    await controller.dispose('session-1', 'gemini');
  });
});

describe('LiveDubbingController media-stream audio path', () => {
  function createMediaStreamHarness({
    makeClient,
    registryMode = LIVE_DUBBING_AUDIO_MODES.MEDIA_STREAM,
    controllerOptions = {},
    targetLanguage = 'fr',
  } = {}) {
    const track = new FakeTrack();
    const stream = createStream(track);
    const accepted = vi.fn();
    const notify = vi.fn();
    const clients = [];
    let providerCallbacks;
    const registry = {
      // Mirrors the real registry signature: create(providerId, options).
      create: vi.fn((providerId, options) => {
        expect(providerId).toBe('gemini');
        providerCallbacks = options.callbacks;
        const client = makeClient
          ? makeClient(providerCallbacks)
          : {
            connect: vi.fn(async () => providerCallbacks.onSetupComplete()),
            dispose: vi.fn(async () => {}),
          };
        clients.push(client);
        return client;
      }),
      getAudioMode: vi.fn(() => registryMode),
    };
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => stream) },
      providerRegistry: registry,
      requestBootstrap: vi.fn().mockResolvedValue({
        success: true,
        providerId: 'gemini',
        targetLanguage,
        bootstrap: { accessToken: 'test-token' },
      }),
      onPlaybackAccepted: accepted,
      notify,
      ...controllerOptions,
    });
    return {
      controller,
      track,
      stream,
      registry,
      clients,
      accepted,
      notify,
      callbacks: () => providerCallbacks,
    };
  }

  it('drives a media-stream provider without local pipelines', async () => {
    const inputPipelineFactory = vi.fn();
    const outputPlayerFactory = vi.fn();
    const { controller, track, stream, registry, clients, accepted, callbacks } = createMediaStreamHarness({
      controllerOptions: { inputPipelineFactory, outputPlayerFactory },
    });

    const prepared = controller.prepare('session-1', 'gemini', 'fr', 0);
    expect(prepared.success).toBe(true);
    expect(controller.currentSession.audioMode).toBe(LIVE_DUBBING_AUDIO_MODES.MEDIA_STREAM);
    expect(registry.getAudioMode).toHaveBeenCalledOnce();
    const repeatedPrepare = controller.prepare('session-1', 'gemini', 'fr', 0);
    expect(repeatedPrepare).toMatchObject({ success: true, ready: true });
    expect(controller.currentSession.audioMode).toBe(LIVE_DUBBING_AUDIO_MODES.MEDIA_STREAM);
    expect(registry.getAudioMode).toHaveBeenCalledOnce();
    const captured = await controller.consume('session-1', 'gemini', 'stream-secret', 1);
    const audioEngine = controller.currentSession.audioEngine;
    expect(audioEngine).toBeTruthy();
    vi.spyOn(audioEngine, 'setOriginalVolume').mockResolvedValue(0.35);
    await expect(controller.setOriginalVolume('session-1', 'gemini', 0.35, 1)).resolves.toMatchObject({
      success: true,
      originalVolume: 0.35,
    });
    expect(captured).toMatchObject({
      ack: 'MEDIA_ACQUIRED',
      status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
      audioPathReady: true,
      // Truthful: no local pipelines exist in media-stream mode; the
      // generic audioPathReady alone carries readiness.
      inputPipelineReady: false,
      outputPipelineReady: false,
      captureReady: true,
    });
    expect(controller.currentSession.audioMode).toBe(LIVE_DUBBING_AUDIO_MODES.MEDIA_STREAM);
    expect(controller.currentSession.inputPipeline).toBeNull();
    expect(controller.currentSession.outputPlayer).toBeNull();
    expect(audioEngine.inputPipeline).toBeNull();
    expect(audioEngine.outputPlayer).toBeNull();
    expect(registry.getAudioMode).toHaveBeenCalledOnce();
    expect(inputPipelineFactory).not.toHaveBeenCalled();
    expect(outputPlayerFactory).not.toHaveBeenCalled();

    const connected = await controller.connectProvider('session-1', 'gemini', 'fr', 2);
    expect(connected).toMatchObject({
      ack: 'PROVIDER_READY',
      status: LIVE_DUBBING_STATUS.RUNNING,
      audioPathReady: true,
      inputPipelineReady: false,
      outputPipelineReady: false,
      setupComplete: true,
    });
    expect(registry.create).toHaveBeenCalledOnce();
    const mediaClient = clients[0];
    expect(mediaClient.connect).toHaveBeenCalledOnce();
    const connectInput = mediaClient.connect.mock.calls[0][0];
    expect(connectInput.sourceStream).toBe(stream);
    expect(connectInput).not.toHaveProperty('streamId');
    expect(connectInput.bootstrap).toEqual({ accessToken: 'test-token' });
    expect(mediaClient.sendAudio).toBeUndefined();

    // The PCM pending queue stays inert even when poked directly.
    controller._handleInputFrame(controller.currentSession, {
      buffer: new ArrayBuffer(2),
      sampleCount: 1,
      sampleRate: 16_000,
    });
    expect(controller.getTelemetry()).toMatchObject({ inputFrames: 0, inputSentFrames: 0 });

    // Provider-managed playback acceptance keeps milestone semantics.
    // inputReady/outputReady stay null: they describe local PCM graph
    // starts, and media-stream readiness is audioPathReady alone.
    expect(controller.getTelemetry().milestones.inputReady).toBeNull();
    expect(controller.getTelemetry().milestones.outputReady).toBeNull();
    callbacks().onPlaybackAccepted({ accepted: true, sampleCount: 480 });
    expect(controller.getTelemetry().milestones.firstTranslatedAudioAcceptedByPlayback)
      .toEqual(expect.any(Number));
    expect(accepted).toHaveBeenCalledWith({ accepted: true, sampleCount: 480 });

    expect(controller.status()).toMatchObject({
      active: true,
      status: LIVE_DUBBING_STATUS.RUNNING,
      audioPathReady: true,
      inputPipelineReady: false,
      outputPipelineReady: false,
      captureReady: true,
    });

    const engineStop = vi.spyOn(audioEngine, 'stop');
    await controller.dispose('session-1', 'gemini');
    expect(mediaClient.dispose).toHaveBeenCalledOnce();
    expect(engineStop).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();

    await controller.dispose('session-1', 'gemini');
    expect(mediaClient.dispose).toHaveBeenCalledOnce();
  });

  it('drives the production OpenAI identity through the media-stream path', async () => {
    const track = new FakeTrack();
    const stream = createStream(track);
    const inputPipelineFactory = vi.fn();
    const outputPlayerFactory = vi.fn();
    const accepted = vi.fn();
    const providerClientFactory = vi.fn();
    const client = {
      connect: vi.fn(),
      dispose: vi.fn(async () => {}),
    };
    let providerCallbacks;
    providerClientFactory.mockImplementation(options => {
      expect(options.providerId).toBe('openai');
      providerCallbacks = options.callbacks;
      client.connect.mockImplementationOnce(async () => providerCallbacks.onSetupComplete());
      return client;
    });
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => stream) },
      inputPipelineFactory,
      outputPlayerFactory,
      providerClientFactory,
      requestBootstrap: vi.fn().mockResolvedValue({
        success: true,
        providerId: 'openai',
        targetLanguage: 'en-US',
        bootstrap: { secret: 'openai-secret' },
      }),
      onPlaybackAccepted: accepted,
      notify: vi.fn(),
    });

    expect(controller.prepare('session-openai', 'openai', 'en-US', 0)).toMatchObject({
      success: true,
      providerId: 'openai',
    });
    expect(controller.currentSession.audioMode).toBe(LIVE_DUBBING_AUDIO_MODES.MEDIA_STREAM);

    const captured = await controller.consume('session-openai', 'openai', 'stream-secret', 1);
    expect(captured).toMatchObject({
      ack: 'MEDIA_ACQUIRED',
      status: LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
      audioPathReady: true,
      inputPipelineReady: false,
      outputPipelineReady: false,
    });
    expect(inputPipelineFactory).not.toHaveBeenCalled();
    expect(outputPlayerFactory).not.toHaveBeenCalled();

    const connected = await controller.connectProvider('session-openai', 'openai', 'en-US', 2);
    expect(connected).toMatchObject({
      ack: 'PROVIDER_READY',
      providerId: 'openai',
      status: LIVE_DUBBING_STATUS.RUNNING,
      audioPathReady: true,
      inputPipelineReady: false,
      outputPipelineReady: false,
      setupComplete: true,
    });
    expect(client.connect).toHaveBeenCalledWith({
      bootstrap: { secret: 'openai-secret' },
      targetLanguage: 'en-US',
      sourceStream: stream,
    });
    expect(JSON.stringify(controller.currentSession)).not.toContain('openai-secret');

    providerCallbacks.onPlaybackAccepted({ accepted: true, sampleCount: 480 });
    expect(accepted).toHaveBeenCalledWith({ accepted: true, sampleCount: 480 });
    expect(controller.getTelemetry().milestones.firstTranslatedAudioAcceptedByPlayback)
      .toEqual(expect.any(Number));
    expect(controller.status()).toMatchObject({
      active: true,
      providerId: 'openai',
      status: LIVE_DUBBING_STATUS.RUNNING,
      audioPathReady: true,
      inputPipelineReady: false,
      outputPipelineReady: false,
    });

    await controller.dispose('session-openai', 'openai');
    expect(client.dispose).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('rejects a same-session PREPARE that changes provider identity', () => {
    const { controller, registry } = createMediaStreamHarness();

    expect(controller.prepare('session-1', 'gemini', 'en', 0)).toMatchObject({ success: true });
    expect(controller.prepare('session-1', 'openai', 'en-US', 0)).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_SESSION_MISMATCH',
      requestedProviderId: 'openai',
      actualProviderId: 'gemini',
    });
    expect(controller.currentSession.providerId).toBe('gemini');
    expect(registry.getAudioMode).toHaveBeenCalledOnce();
  });

  it('awaits async provider dispose and fences late callbacks', async () => {
    let resolveDispose;
    const { controller, track, clients, callbacks } = createMediaStreamHarness({
      makeClient: (clientCallbacks) => ({
        connect: vi.fn(async () => clientCallbacks.onSetupComplete()),
        dispose: vi.fn(() => new Promise(resolve => { resolveDispose = resolve; })),
      }),
    });

    controller.prepare('session-1', 'gemini', 'fr', 0);
    await controller.consume('session-1', 'gemini', 'stream-secret', 1);
    await controller.connectProvider('session-1', 'gemini', 'fr', 2);

    const stopped = controller.dispose('session-1', 'gemini');
    expect(clients[0].dispose).toHaveBeenCalledOnce();

    // Late provider callbacks while dispose is in flight are fenced.
    callbacks().onPlaybackAccepted({ accepted: true, sampleCount: 1 });
    callbacks().onAudio(new Uint8Array([1]));
    expect(controller.getTelemetry().milestones.firstTranslatedAudioAcceptedByPlayback).toBeNull();
    expect(controller.getTelemetry()).toMatchObject({ translatedAudioChunks: 0 });

    resolveDispose();
    await expect(stopped).resolves.toMatchObject({ ack: 'DISPOSED' });
    expect(track.stop).toHaveBeenCalledOnce();
    expect(clients[0].dispose).toHaveBeenCalledOnce();
  });

  it('joins exact pending disposal and blocks PREPARE through its tombstone', async () => {
    let resolveDispose;
    const { controller, clients } = createMediaStreamHarness({
      makeClient: clientCallbacks => ({
        connect: vi.fn(async () => clientCallbacks.onSetupComplete()),
        dispose: vi.fn(() => new Promise(resolve => { resolveDispose = resolve; })),
      }),
    });

    controller.prepare('session-1', 'gemini', 'fr', 0);
    await controller.consume('session-1', 'gemini', 'stream-secret', 1);
    await controller.connectProvider('session-1', 'gemini', 'fr', 2);

    const first = controller.dispose('session-1', 'gemini');
    const repeated = controller.dispose('session-1', 'gemini');
    let repeatedResult;
    repeated.then(result => { repeatedResult = result; });
    await Promise.resolve();

    expect(clients[0].dispose).toHaveBeenCalledOnce();
    expect(repeatedResult).toBeUndefined();
    expect(controller.disposedSession.cleanupPromise).toBe(controller.disposedSession.session.cleanupPromise);
    expect(controller.prepare('session-2', 'gemini', 'fr', 0)).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_SESSION_DISPOSED',
      ignored: true,
    });
    expect(controller.prepare('session-1', 'gemini', 'fr', 0)).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_SESSION_DISPOSED',
      ignored: true,
    });

    resolveDispose();
    await expect(first).resolves.toMatchObject({ ack: 'DISPOSED' });
    await expect(repeated).resolves.toMatchObject({ ack: 'DISPOSED', idempotent: true });
    expect(clients[0].dispose).toHaveBeenCalledOnce();
  });

  it('blocks a new session until stale cleanup settles', async () => {
    let resolveDispose;
    const { controller, clients } = createMediaStreamHarness({
      makeClient: clientCallbacks => ({
        connect: vi.fn(async () => clientCallbacks.onSetupComplete()),
        dispose: vi.fn(() => new Promise(resolve => { resolveDispose = resolve; })),
      }),
    });

    controller.prepare('session-1', 'gemini', 'fr', 0);
    await controller.consume('session-1', 'gemini', 'stream-secret', 1);
    await controller.connectProvider('session-1', 'gemini', 'fr', 2);
    controller.currentSession.metrics.outputChunks = 7;

    const oldCleanup = controller.dispose('session-1', 'gemini');
    while (!resolveDispose) await Promise.resolve();
    expect(controller.prepare('session-2', 'gemini', 'fr', 0)).toMatchObject({
      success: false,
      error: 'LIVE_DUBBING_SESSION_DISPOSED',
      ignored: true,
    });

    const repeatedOldCleanup = controller.dispose('session-1', 'gemini');
    resolveDispose();
    await expect(oldCleanup).resolves.toMatchObject({ ack: 'DISPOSED' });
    await expect(repeatedOldCleanup).resolves.toMatchObject({ ack: 'DISPOSED' });

    expect(controller.prepare('session-2', 'gemini', 'fr', 0)).toMatchObject({
      success: true,
      sessionId: 'session-2',
    });

    expect(clients[0].dispose).toHaveBeenCalledOnce();
    expect(controller.currentSession).toMatchObject({ sessionId: 'session-2' });
    expect(controller.getTelemetry()).toMatchObject({ translatedAudioChunks: 0 });
  });

  it('bounds repeated exact DISPOSE while provider teardown is slow/delayed', async () => {
    vi.useFakeTimers();
    try {
      let resolveDispose;
      const { controller, clients } = createMediaStreamHarness({
        makeClient: clientCallbacks => ({
          connect: vi.fn(async () => clientCallbacks.onSetupComplete()),
          dispose: vi.fn(() => new Promise(resolve => { resolveDispose = resolve; })),
        }),
      });

      controller.prepare('session-1', 'gemini', 'fr', 0);
      await controller.consume('session-1', 'gemini', 'stream-secret', 1);
      await controller.connectProvider('session-1', 'gemini', 'fr', 2);

      const first = controller.dispose('session-1', 'gemini');
      // Let the first disposal reach its bounded wait so the physical
      // teardown is provably single-flight before the retry joins it.
      await vi.advanceTimersByTimeAsync(0);
      expect(clients[0].dispose).toHaveBeenCalledOnce();

      const second = controller.dispose('session-1', 'gemini');
      await vi.advanceTimersByTimeAsync(0);
      expect(clients[0].dispose).toHaveBeenCalledOnce();

      // Both externally visible waits are bounded even though the single
      // physical teardown is slow/delayed. Neither falsely reports DISPOSED
      // and neither reruns provider.dispose.
      await vi.advanceTimersByTimeAsync(LIVE_DUBBING_STOP_TIMEOUT);
      await expect(first).resolves.toMatchObject({
        success: false,
        error: 'LIVE_DUBBING_CLEANUP_PENDING',
        cleanupPending: true,
        retryable: true,
        sessionId: 'session-1',
        providerId: 'gemini',
        disposed: false,
      });
      await expect(second).resolves.toMatchObject({
        success: false,
        error: 'LIVE_DUBBING_CLEANUP_PENDING',
        cleanupPending: true,
        retryable: true,
        sessionId: 'session-1',
        providerId: 'gemini',
        disposed: false,
      });
      expect(clients[0].dispose).toHaveBeenCalledOnce();
      expect(controller.disposedSession.cleanupComplete).toBe(false);
      // Ownership is retained via the pending tombstone: any new PREPARE
      // is rejected while physical cleanup is unresolved.
      expect(controller.prepare('session-2', 'gemini', 'fr', 0)).toMatchObject({
        success: false,
        error: 'LIVE_DUBBING_SESSION_DISPOSED',
        ignored: true,
      });

      // Authoritative success: resolving the single physical teardown lets
      // a fresh exact DISPOSE acknowledge and unblocks the next session.
      // Stale pending results above never become DISPOSED on their own.
      resolveDispose();
      await vi.advanceTimersByTimeAsync(0);
      expect(controller.disposedSession.cleanupComplete).toBe(true);

      await expect(controller.dispose('session-1', 'gemini')).resolves.toMatchObject({
        success: true,
        ack: 'DISPOSED',
        disposed: true,
      });
      expect(clients[0].dispose).toHaveBeenCalledOnce();
      expect(controller.prepare('session-2', 'gemini', 'fr', 0)).toMatchObject({
        success: true,
        sessionId: 'session-2',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds repeated exact DISPOSE while pipeline teardown is slow/delayed', async () => {
    vi.useFakeTimers();
    try {
      const track = new FakeTrack();
      let resolvePipelineStop;
      const inputPipeline = {
        start: vi.fn(async () => {}),
        stop: vi.fn(() => new Promise(resolve => { resolvePipelineStop = resolve; })),
      };
      const outputPlayer = {
        start: vi.fn(async () => {}),
        stop: vi.fn(async () => {}),
        clear: vi.fn(),
      };
      const controller = new LiveDubbingController({
        mediaDevices: { getUserMedia: vi.fn(async () => createStream(track)) },
        inputPipeline,
        outputPlayer,
        providerClient: { connect: vi.fn(), close: vi.fn() },
        requestBootstrap: vi.fn(),
      });

      controller.prepare('session-1', 'gemini', null, 0);
      await controller.consume('session-1', 'gemini', 'stream-secret', 1);

      const first = controller.dispose('session-1', 'gemini');
      await vi.advanceTimersByTimeAsync(0);
      expect(inputPipeline.stop).toHaveBeenCalledOnce();

      // Same single-flight mode as AudioContext.close() inside pipeline
      // teardown: the retry joins the canonical promise, it does not rerun
      // stop while the old teardown is still executing.
      const second = controller.dispose('session-1', 'gemini');
      await vi.advanceTimersByTimeAsync(LIVE_DUBBING_STOP_TIMEOUT);
      await expect(first).resolves.toMatchObject({
        success: false,
        error: 'LIVE_DUBBING_CLEANUP_PENDING',
        cleanupPending: true,
        retryable: true,
      });
      await expect(second).resolves.toMatchObject({
        success: false,
        error: 'LIVE_DUBBING_CLEANUP_PENDING',
        cleanupPending: true,
        retryable: true,
      });
      expect(inputPipeline.stop).toHaveBeenCalledOnce();
      expect(outputPlayer.stop).toHaveBeenCalledOnce();

      resolvePipelineStop();
      await vi.advanceTimersByTimeAsync(0);
      await expect(controller.dispose('session-1', 'gemini')).resolves.toMatchObject({
        success: true,
        ack: 'DISPOSED',
      });
      expect(inputPipeline.stop).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('settles cleanup canonically when pipeline and player stops throw synchronously', async () => {
    const track = new FakeTrack();
    const inputPipeline = {
      start: vi.fn(async () => {}),
      stop: vi.fn(() => { throw new Error('input stop failed'); }),
    };
    const outputPlayer = {
      start: vi.fn(async () => {}),
      stop: vi.fn(() => { throw new Error('output stop failed'); }),
      clear: vi.fn(),
    };
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(track)) },
      inputPipeline,
      outputPlayer,
    });

    controller.prepare('session-1', 'gemini', null, 0);
    await controller.consume('session-1', 'gemini', 'stream-secret', 1);
    const disposed = await controller.dispose('session-1', 'gemini');

    expect(disposed).toMatchObject({ success: true, ack: 'DISPOSED' });
    expect(inputPipeline.stop).toHaveBeenCalledOnce();
    expect(outputPlayer.stop).toHaveBeenCalledOnce();
    expect(controller.disposedSession.cleanupComplete).toBe(true);
  });

  it('clears failed engine output once before stopping each local graph', async () => {
    const track = new FakeTrack();
    const inputPipeline = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    };
    const outputPlayer = {
      start: vi.fn(async () => { throw new Error('output start failed'); }),
      stop: vi.fn(async () => {}),
      clear: vi.fn(),
    };
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(track)) },
      inputPipeline,
      outputPlayer,
    });

    controller.prepare('session-1', 'gemini', null, 0);
    const result = await controller.consume('session-1', 'gemini', 'stream-secret', 1);
    const session = controller.currentSession;
    controller._cleanupSessionResources(session);

    expect(result).toMatchObject({ success: false });
    expect(outputPlayer.clear).toHaveBeenCalledOnce();
    expect(inputPipeline.stop).toHaveBeenCalledOnce();
    expect(outputPlayer.stop).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('orders provider shutdown, track stop, output clear, and graph stops', async () => {
    const events = [];
    const track = new FakeTrack();
    track.stop = vi.fn(() => events.push('tracks'));
    const inputPipeline = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => events.push('input-stop')),
    };
    const outputPlayer = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => events.push('output-stop')),
      clear: vi.fn(() => events.push('output-clear')),
    };
    const provider = {
      connect: vi.fn(async () => provider.onSetupComplete()),
      dispose: vi.fn(() => events.push('provider-dispose')),
    };
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(track)) },
      inputPipeline,
      outputPlayer,
      providerClient: provider,
      requestBootstrap: vi.fn().mockResolvedValue({
        success: true,
        providerId: 'gemini',
        targetLanguage: 'en',
        bootstrap: { accessToken: 'test-token' },
      }),
    });

    controller.prepare('session-1', 'gemini', 'en', 0);
    await controller.consume('session-1', 'gemini', 'stream-secret', 1);
    await controller.connectProvider('session-1', 'gemini', 'en', 2);
    await controller.dispose('session-1', 'gemini');

    expect(events).toEqual([
      'provider-dispose',
      'tracks',
      'output-clear',
      'input-stop',
      'output-stop',
    ]);
  });

  it('keeps legacy direct cleanup clearing output before stopping resources', async () => {
    const events = [];
    const track = new FakeTrack();
    track.stop = vi.fn(() => events.push('tracks'));
    const controller = new LiveDubbingController();
    controller.prepare('legacy-session', 'gemini', null, 0);
    const activeSession = controller.currentSession;
    activeSession.stream = createStream(track);
    activeSession.inputPipeline = { stop: vi.fn(() => events.push('input-stop')) };
    activeSession.outputPlayer = {
      clear: vi.fn(() => events.push('output-clear')),
      stop: vi.fn(() => events.push('output-stop')),
    };

    await controller._cleanupSessionResources(activeSession);

    expect(events).toEqual([
      'tracks',
      'output-clear',
      'input-stop',
      'output-stop',
    ]);
    expect(activeSession.outputPlayer).toBeNull();
  });

  it('ignores late provider callbacks after disposal', async () => {
    const { controller, track, clients, accepted, notify, callbacks } = createMediaStreamHarness();

    controller.prepare('session-1', 'gemini', 'fr', 0);
    await controller.consume('session-1', 'gemini', 'stream-secret', 1);
    await controller.connectProvider('session-1', 'gemini', 'fr', 2);
    await controller.dispose('session-1', 'gemini');

    expect(() => {
      callbacks().onSetupComplete();
      callbacks().onPlaybackAccepted({ accepted: true });
      callbacks().onError(new Error('late'));
      callbacks().onClose({ code: 1000 });
    }).not.toThrow();
    expect(notify).not.toHaveBeenCalled();
    expect(accepted).not.toHaveBeenCalled();
    expect(clients[0].dispose).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(controller.getTelemetry().milestones.firstTranslatedAudioAcceptedByPlayback).toBeNull();
  });

  it('stops a pending provider connection without publishing', async () => {
    let resolveConnect;
    const { controller, track, clients } = createMediaStreamHarness({
      makeClient: () => ({
        connect: vi.fn(() => new Promise(resolve => { resolveConnect = resolve; })),
        dispose: vi.fn(async () => {}),
      }),
    });

    controller.prepare('session-1', 'gemini', 'fr', 0);
    await controller.consume('session-1', 'gemini', 'stream-secret', 1);
    const connecting = controller.connectProvider('session-1', 'gemini', 'fr', 2);
    await vi.waitFor(() => expect(clients[0].connect).toHaveBeenCalledOnce());

    await controller.dispose('session-1', 'gemini');
    expect(clients[0].dispose).toHaveBeenCalledOnce();

    resolveConnect();
    await expect(connecting).resolves.toMatchObject({ success: false, ignored: true });
    expect(clients[0].dispose).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('restarts with a fresh session after dispose', async () => {
    const track1 = new FakeTrack();
    const track2 = new FakeTrack();
    const { controller, clients } = createMediaStreamHarness({
      controllerOptions: {
        mediaDevices: {
          getUserMedia: vi.fn()
            .mockResolvedValueOnce(createStream(track1))
            .mockResolvedValueOnce(createStream(track2)),
        },
      },
    });

    controller.prepare('session-1', 'gemini', 'fr', 0);
    await controller.consume('session-1', 'gemini', 'stream-secret', 1);
    await controller.connectProvider('session-1', 'gemini', 'fr', 2);
    await controller.dispose('session-1', 'gemini');
    expect(clients).toHaveLength(1);
    expect(clients[0].dispose).toHaveBeenCalledOnce();
    expect(track1.stop).toHaveBeenCalledOnce();

    controller.prepare('session-2', 'gemini', 'fr', 0);
    await controller.consume('session-2', 'gemini', 'stream-secret', 1);
    await controller.connectProvider('session-2', 'gemini', 'fr', 2);
    expect(clients).toHaveLength(2);
    expect(clients[1].connect).toHaveBeenCalledOnce();
    expect(clients[1].connect.mock.calls[0][0].sourceStream.getAudioTracks()[0]).toBe(track2);
    expect(track2.stop).not.toHaveBeenCalled();
    expect(controller.status()).toMatchObject({ active: true, status: LIVE_DUBBING_STATUS.RUNNING });

    await controller.dispose('session-2', 'gemini');
    expect(clients[1].dispose).toHaveBeenCalledOnce();
    expect(track2.stop).toHaveBeenCalledOnce();
  });

  it('fails PREPARE on an unsupported provider audio mode, before any audio resource', async () => {
    const track = new FakeTrack();
    const getUserMedia = vi.fn(async () => createStream(track));
    const create = vi.fn(() => ({ connect: vi.fn(), close: vi.fn() }));
    const requestBootstrap = vi.fn();
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia },
      providerRegistry: { create, getAudioMode: () => 'bogus-mode' },
      requestBootstrap,
      notify: vi.fn(),
    });

    expect(controller.prepare('session-1', 'gemini', 'fr', 0))
      .toMatchObject({ success: false, error: 'LIVE_DUBBING_AUDIO_MODE_UNSUPPORTED' });
    expect(controller.currentSession).toBeNull();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(requestBootstrap).not.toHaveBeenCalled();
    expect(track.stop).not.toHaveBeenCalled();

    // Repeat PREPARE fails identically without creating anything.
    expect(controller.prepare('session-1', 'gemini', 'fr', 0))
      .toMatchObject({ success: false, error: 'LIVE_DUBBING_AUDIO_MODE_UNSUPPORTED' });
    expect(controller.currentSession).toBeNull();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('keeps the pcm path explicit end to end', async () => {
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
    const accepted = vi.fn();
    const controller = new LiveDubbingController({
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
      requestBootstrap: vi.fn().mockResolvedValue({
        success: true,
        providerId: 'gemini',
        targetLanguage: 'fr',
        bootstrap: { accessToken: 'test-token' },
      }),
      onPlaybackAccepted: accepted,
      notify: vi.fn(),
    });

    controller.prepare('session-1', 'gemini', 'fr', 0);
    const captured = await controller.consume('session-1', 'gemini', 'stream-secret', 1);
    expect(controller.currentSession.audioMode).toBe(LIVE_DUBBING_AUDIO_MODES.PCM);
    vi.spyOn(controller.currentSession.audioEngine, 'setOriginalVolume').mockResolvedValue(0.35);
    await expect(controller.setOriginalVolume('session-1', 'gemini', 0.35, 1)).resolves.toMatchObject({
      success: true,
      originalVolume: 0.35,
    });
    expect(captured).toMatchObject({
      ack: 'MEDIA_ACQUIRED',
      audioPathReady: true,
      inputPipelineReady: true,
      outputPipelineReady: true,
    });

    await controller.connectProvider('session-1', 'gemini', 'fr', 2);
    expect(provider.connect).toHaveBeenCalledWith({
      bootstrap: { accessToken: 'test-token' },
      targetLanguage: 'fr',
    });
    expect(provider.connect.mock.calls[0][0]).not.toHaveProperty('sourceStream');

    inputPipeline.onFrame({ buffer: new ArrayBuffer(2), sampleCount: 1, sampleRate: 16_000 });
    expect(provider.sendAudio).toHaveBeenCalledOnce();
    providerCallbacks.onAudio(new Uint8Array([1]));
    expect(outputPlayer.enqueuePcm16).toHaveBeenCalledOnce();
    expect(controller.getTelemetry()).toMatchObject({ inputSentFrames: 1, translatedAudioChunks: 1 });

    // Player-driven acceptance still owns the milestone on the pcm path.
    outputPlayer.onPlaybackAccepted({ accepted: true, sampleCount: 5 });
    expect(controller.getTelemetry().milestones.firstTranslatedAudioAcceptedByPlayback)
      .toEqual(expect.any(Number));
    expect(accepted).toHaveBeenCalledWith({ accepted: true, sampleCount: 5 });

    await controller.dispose('session-1', 'gemini');
    expect(provider.close).toHaveBeenCalledOnce();
    expect(provider.dispose).toBeUndefined();
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('rejects playback claims from a pcm provider callback', async () => {
    const track = new FakeTrack();
    const provider = {
      connect: vi.fn(async () => providerCallbacks.onSetupComplete()),
      sendAudio: vi.fn(() => true),
      close: vi.fn(),
    };
    let providerCallbacks;
    const accepted = vi.fn();
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(track)) },
      inputPipelineFactory: vi.fn(() => ({
        start: vi.fn(async () => {}),
        stop: vi.fn(async () => {}),
      })),
      outputPlayerFactory: vi.fn(() => ({
        start: vi.fn(async () => {}),
        stop: vi.fn(async () => {}),
        clear: vi.fn(),
      })),
      providerClientFactory: vi.fn(options => {
        providerCallbacks = options.callbacks;
        return provider;
      }),
      requestBootstrap: vi.fn().mockResolvedValue({
        success: true,
        providerId: 'gemini',
        targetLanguage: 'fr',
        bootstrap: { accessToken: 'test-token' },
      }),
      onPlaybackAccepted: accepted,
      notify: vi.fn(),
    });

    controller.prepare('session-1', 'gemini', 'fr', 0);
    await controller.consume('session-1', 'gemini', 'stream-secret', 1);
    await controller.connectProvider('session-1', 'gemini', 'fr', 2);

    // The provider callback is exposed but must not claim playback on the
    // pcm path, where the player owns the milestone.
    providerCallbacks.onPlaybackAccepted({ accepted: true, sampleCount: 5 });
    expect(controller.getTelemetry().milestones.firstTranslatedAudioAcceptedByPlayback).toBeNull();
    expect(accepted).not.toHaveBeenCalled();

    await controller.dispose('session-1', 'gemini');
  });

  it('routes factory exceptions to the controller error boundary', async () => {
    const track = new FakeTrack();
    const failure = new Error('factory boom');
    const notify = vi.fn();
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(track)) },
      inputPipeline: { start: vi.fn(async () => {}), stop: vi.fn(async () => {}) },
      outputPlayer: { start: vi.fn(async () => {}), stop: vi.fn(async () => {}), clear: vi.fn() },
      providerRegistry: {
        getAudioMode: () => LIVE_DUBBING_AUDIO_MODES.PCM,
        create: () => { throw failure; },
      },
      requestBootstrap: vi.fn().mockResolvedValue({
        success: true,
        providerId: 'gemini',
        targetLanguage: 'fr',
        bootstrap: { accessToken: 'test-token' },
      }),
      notify,
    });

    controller.prepare('session-1', 'gemini', 'fr', 0);
    await controller.consume('session-1', 'gemini', 'stream-secret', 1);
    // Not masked as unavailable: the exception reaches the connect error
    // boundary and terminalizes the session like any provider failure.
    await expect(controller.connectProvider('session-1', 'gemini', 'fr', 2))
      .resolves.toMatchObject({ success: false, error: 'LIVE_DUBBING_PROVIDER_ERROR' });
    expect(controller.status()).toMatchObject({
      status: LIVE_DUBBING_STATUS.ERROR,
      lastError: 'LIVE_DUBBING_PROVIDER_ERROR',
    });
    expect(notify).toHaveBeenCalledOnce();
    expect(JSON.stringify(notify.mock.calls)).not.toContain('factory boom');
    expect(track.stop).toHaveBeenCalledOnce();

    await controller.dispose('session-1', 'gemini');
  });
});
