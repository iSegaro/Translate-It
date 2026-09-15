import { describe, expect, it, vi } from 'vitest';
import { HtmlMediaCaptureAdapter } from './HtmlMediaCaptureAdapter.js';
import { MediaCaptureAdapter } from './MediaCaptureAdapter.js';
import { MEDIA_CAPTURE_ERRORS } from './mediaConstants.js';

function track({ kind = 'audio', readyState = 'live', stop = vi.fn() } = {}) {
  return { kind, readyState, stop };
}

function stream({ tracks, audioTracks = tracks } = {}) {
  return {
    getTracks: vi.fn(() => tracks),
    getAudioTracks: vi.fn(() => audioTracks),
  };
}

function mediaElement(methods = {}) {
  return {
    isConnected: true,
    paused: false,
    ended: false,
    pause: vi.fn(),
    ...methods,
  };
}

function expectFailure(result, error) {
  expect(result).toEqual({ success: false, error });
  for (const value of Object.values(result)) {
    expect(['string', 'number', 'boolean'].includes(typeof value) || value === null).toBe(true);
  }
}

describe('MediaCaptureAdapter', () => {
  it('returns the canonical unsupported failure by default', () => {
    expectFailure(new MediaCaptureAdapter().capture(), MEDIA_CAPTURE_ERRORS.UNSUPPORTED);
  });
});

describe('HtmlMediaCaptureAdapter', () => {
  it('prefers standard captureStream and returns an idempotent owned handle', () => {
    const audio = track();
    const video = track({ kind: 'video' });
    const unrelated = track();
    const capturedStream = stream({ tracks: [audio, video], audioTracks: [audio] });
    const captureStream = vi.fn(() => capturedStream);
    const mozCaptureStream = vi.fn(() => stream({ tracks: [unrelated] }));
    const element = mediaElement({ captureStream, mozCaptureStream });
    const adapter = new HtmlMediaCaptureAdapter();

    const handle = adapter.capture(element);

    expect(Object.keys(handle)).toEqual(['stream', 'dispose']);
    expect(handle.stream).toBe(capturedStream);
    expect(captureStream).toHaveBeenCalledOnce();
    expect(mozCaptureStream).not.toHaveBeenCalled();
    expect(element.pause).not.toHaveBeenCalled();
    expect(element.paused).toBe(false);

    handle.dispose();
    handle.dispose();

    expect(audio.stop).toHaveBeenCalledOnce();
    expect(video.stop).toHaveBeenCalledOnce();
    expect(unrelated.stop).not.toHaveBeenCalled();
    expect(element.paused).toBe(false);
  });

  it('uses mozCaptureStream only when standard capture is unavailable', () => {
    const audio = track();
    const capturedStream = stream({ tracks: [audio], audioTracks: [audio] });
    const mozCaptureStream = vi.fn(() => capturedStream);
    const handle = new HtmlMediaCaptureAdapter().capture(mediaElement({ mozCaptureStream }));

    expect(handle.stream).toBe(capturedStream);
    expect(mozCaptureStream).toHaveBeenCalledOnce();
  });

  it('returns canonical unsupported and exception failures', () => {
    expectFailure(
      new HtmlMediaCaptureAdapter().capture(mediaElement()),
      MEDIA_CAPTURE_ERRORS.UNSUPPORTED,
    );

    expectFailure(
      new HtmlMediaCaptureAdapter().capture(mediaElement({
        captureStream: vi.fn(() => { throw new Error('capture failed'); }),
      })),
      MEDIA_CAPTURE_ERRORS.EXCEPTION,
    );
  });

  it('stops returned tracks and returns invalid-stream for malformed streams', () => {
    const captured = track();
    const result = new HtmlMediaCaptureAdapter().capture(mediaElement({
      captureStream: vi.fn(() => ({
        getTracks: () => [captured],
        getAudioTracks: () => undefined,
      })),
    }));

    expectFailure(result, MEDIA_CAPTURE_ERRORS.INVALID_STREAM);
    expect(captured.stop).toHaveBeenCalledOnce();
  });

  it('uses valid audio tracks to clean up when getTracks is malformed', () => {
    const audio = track();
    const secondAudio = track();
    const result = new HtmlMediaCaptureAdapter().capture(mediaElement({
      captureStream: vi.fn(() => ({
        getTracks: () => ({ malformed: true }),
        getAudioTracks: () => [audio, secondAudio],
      })),
    }));

    expectFailure(result, MEDIA_CAPTURE_ERRORS.INVALID_STREAM);
    expect(audio.stop).toHaveBeenCalledOnce();
    expect(secondAudio.stop).toHaveBeenCalledOnce();
  });

  it('stops all returned tracks and returns no-audio for no live audio', () => {
    const endedAudio = track({ readyState: 'ended' });
    const video = track({ kind: 'video' });
    const result = new HtmlMediaCaptureAdapter().capture(mediaElement({
      captureStream: vi.fn(() => stream({
        tracks: [endedAudio, video],
        audioTracks: [endedAudio],
      })),
    }));

    expectFailure(result, MEDIA_CAPTURE_ERRORS.NO_AUDIO);
    expect(endedAudio.stop).toHaveBeenCalledOnce();
    expect(video.stop).toHaveBeenCalledOnce();
  });

  it('contains track-stop exceptions while cleaning an unusable capture', () => {
    const broken = track({ stop: vi.fn(() => { throw new Error('stop failed'); }) });
    const healthy = track();
    const result = new HtmlMediaCaptureAdapter().capture(mediaElement({
      captureStream: vi.fn(() => stream({
        tracks: [broken, healthy],
        audioTracks: [],
      })),
    }));

    expectFailure(result, MEDIA_CAPTURE_ERRORS.NO_AUDIO);
    expect(broken.stop).toHaveBeenCalledOnce();
    expect(healthy.stop).toHaveBeenCalledOnce();
  });
});
