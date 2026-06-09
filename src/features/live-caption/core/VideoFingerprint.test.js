import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VideoFingerprint,
  describeVideoFingerprint,
  createVideoFingerprint,
  createLiveCaptionVideoCacheKey,
  createLiveCaptionSegmentCacheKey,
  createLiveCaptionTranslatedSegmentCacheKey
} from './index.js';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

function createVideo({ currentSrc = '', sourceUrls = [], rect = { width: 640, height: 360 }, nested = false } = {}) {
  const video = document.createElement('video');

  Object.defineProperties(video, {
    currentSrc: { value: currentSrc, configurable: true },
    videoWidth: { value: rect.width, configurable: true },
    videoHeight: { value: rect.height, configurable: true },
    clientWidth: { value: rect.width, configurable: true },
    clientHeight: { value: rect.height, configurable: true }
  });

  video.getBoundingClientRect = vi.fn(() => ({
    top: 10,
    left: 10,
    right: 10 + rect.width,
    bottom: 10 + rect.height,
    width: rect.width,
    height: rect.height
  }));

  for (const sourceUrl of sourceUrls) {
    const source = document.createElement('source');
    source.setAttribute('src', sourceUrl);
    video.appendChild(source);
  }

  if (nested) {
    const wrapper = document.createElement('div');
    wrapper.appendChild(video);
    document.body.appendChild(wrapper);
  } else {
    document.body.appendChild(video);
  }

  return video;
}

describe('VideoFingerprint', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    window.history.replaceState({}, '', '/watch/demo?token=secret');
  });

  it('prefers currentSrc for fingerprints', () => {
    const video = createVideo({
      currentSrc: 'https://cdn.example.com/video.mp4'
    });

    const details = describeVideoFingerprint(video);

    expect(details.strategy).toBe('currentSrc');
    expect(details.fingerprint).toContain('https://cdn.example.com/video.mp4');
    expect(createVideoFingerprint(video)).toBe(details.fingerprint);
  });

  it('falls back to source URLs when currentSrc is unavailable', () => {
    const video = createVideo({
      sourceUrls: [
        '/videos/episode-1.webm',
        'https://cdn.example.com/alt/episode-1.mp4'
      ]
    });

    const details = describeVideoFingerprint(video);

    expect(details.strategy).toBe('sources');
    expect(details.sourceUrls).toEqual([
      `${window.location.origin}/videos/episode-1.webm`,
      'https://cdn.example.com/alt/episode-1.mp4'
    ]);
    expect(details.fingerprint).toMatch(/^live-caption:video:sources:/);
    expect(createVideoFingerprint(video)).toBe(details.fingerprint);
  });

  it('falls back to a synthesized fingerprint when no sources exist', () => {
    const video = createVideo({ nested: true });

    Object.defineProperties(video, {
      muted: { value: false, configurable: true },
      autoplay: { value: true, configurable: true },
      loop: { value: false, configurable: true },
      playsInline: { value: true, configurable: true },
      controls: { value: true, configurable: true },
      preload: { value: 'metadata', configurable: true },
      crossOrigin: { value: 'anonymous', configurable: true },
      poster: { value: 'https://cdn.example.com/poster.jpg', configurable: true },
      volume: { value: 0.75, configurable: true },
      readyState: { value: 4, configurable: true }
    });

    const details = describeVideoFingerprint(video);
    const repeatDetails = describeVideoFingerprint(video);

    expect(details.strategy).toBe('synthetic');
    expect(details.fingerprint).toBe(repeatDetails.fingerprint);
    expect(details.baseUrl).toBe(window.location.origin);
    expect(details.descriptor).toContain(window.location.origin);
    expect(details.descriptor.includes(window.location.href)).toBe(false);
    expect(details.fingerprint).toMatch(/^live-caption:video:synth:/);
  });

  it('builds cache keys from tab, video, and segment metadata only', () => {
    const videoFingerprint = 'live-caption:video:src:https://cdn.example.com/video.mp4';

    expect(createLiveCaptionVideoCacheKey(7, videoFingerprint)).toBe(
      'live-caption|tab:7|video:live-caption%3Avideo%3Asrc%3Ahttps%3A%2F%2Fcdn.example.com%2Fvideo.mp4'
    );
    expect(createLiveCaptionSegmentCacheKey({
      tabId: 7,
      videoFingerprint,
      segmentStartMs: 1000,
      segmentEndMs: 2500
    })).toBe(
      'live-caption|tab:7|video:live-caption%3Avideo%3Asrc%3Ahttps%3A%2F%2Fcdn.example.com%2Fvideo.mp4|segment:1000-2500'
    );
    expect(createLiveCaptionTranslatedSegmentCacheKey({
      tabId: 7,
      videoFingerprint,
      segmentStartMs: 1000,
      segmentEndMs: 2500,
      targetLanguage: 'es',
      providerId: 'openai'
    })).toBe(
      'live-caption|tab:7|video:live-caption%3Avideo%3Asrc%3Ahttps%3A%2F%2Fcdn.example.com%2Fvideo.mp4|segment:1000-2500|target:es|provider:openai'
    );
    expect(VideoFingerprint.create(document.createElement('video'))).toMatch(/^live-caption:video:synth:/);
  });
});
