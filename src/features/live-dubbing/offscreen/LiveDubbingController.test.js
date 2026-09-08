import { describe, expect, it, vi } from 'vitest';
import { LiveDubbingController } from './LiveDubbingController.js';
import {
  LIVE_DUBBING_ACTIONS,
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
  it('calls getUserMedia immediately with Chrome tab constraints', async () => {
    const stream = createStream(new FakeTrack());
    const getUserMedia = vi.fn(() => Promise.resolve(stream));
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia },
    });

    controller.prepare('session-1');
    const consume = controller.consume('session-1', 'stream-secret');

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
      status: LIVE_DUBBING_STATUS.CAPTURING,
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

    controller.prepare('session-1');
    const firstConsume = controller.consume('session-1', 'stream-secret');
    const duplicateConsume = controller.consume('session-1', 'other-stream-secret');

    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(duplicateConsume).toBe(firstConsume);

    resolveCapture(stream);
    await expect(firstConsume).resolves.toMatchObject({
      success: true,
      ack: 'MEDIA_ACQUIRED',
      status: LIVE_DUBBING_STATUS.CAPTURING,
    });
    expect(track.listeners.has('ended')).toBe(true);

    controller.dispose('session-1');
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('disposes pending capture immediately and stops a stream that resolves late', async () => {
    const track = new FakeTrack();
    let resolveCapture;
    const capture = new Promise(resolve => { resolveCapture = resolve; });
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(() => capture) },
    });

    controller.prepare('session-1');
    const consume = controller.consume('session-1', 'stream-secret');
    const disposed = controller.dispose('session-1', 'STOP_REQUESTED');

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

    controller.prepare('session-1');
    await expect(controller.consume('session-1', 'stream-secret')).resolves.toMatchObject({
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

    controller.prepare('session-1');
    const result = await controller.consume('session-1', streamId);

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

    controller.prepare('session-1');
    await controller.consume('session-1', 'stream-secret');

    const stale = controller.handle({
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
      status: LIVE_DUBBING_STATUS.CAPTURING,
    });

    const disposed = controller.dispose('session-1', 'STOP');
    const repeated = controller.dispose('session-1', 'STOP');
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

    controller.prepare('session-1');
    await controller.consume('session-1', 'stream-secret');
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
        status: LIVE_DUBBING_STATUS.ERROR,
        event: 'TRACK_ENDED',
        error: 'LIVE_DUBBING_CAPTURE_TRACK_ENDED',
      },
    });

    controller.dispose('session-1');
    track.end();
    expect(controller.status().sessionId).toBeNull();
    expect(notify).toHaveBeenCalledOnce();
  });

  it('rejects status requests for another session without exposing current ownership', async () => {
    const controller = new LiveDubbingController({
      mediaDevices: { getUserMedia: vi.fn(async () => createStream(new FakeTrack())) },
    });

    controller.prepare('session-1');
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
});
