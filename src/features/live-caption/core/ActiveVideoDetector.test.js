import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ActiveVideoDetector,
  collectActiveVideoCandidates,
  rankActiveVideoCandidates,
  selectActiveVideoCandidate
} from './index.js';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

function setViewport(width = 1280, height = 720) {
  Object.defineProperty(window, 'innerWidth', {
    value: width,
    configurable: true
  });
  Object.defineProperty(window, 'innerHeight', {
    value: height,
    configurable: true
  });
}

function createVideo({
  rect,
  paused = true,
  ended = false,
  muted = false,
  volume = 1,
  lastInteractionAt = 0,
  label = 'video'
} = {}) {
  const video = document.createElement('video');
  video.setAttribute('data-label', label);

  Object.defineProperties(video, {
    paused: { value: paused, configurable: true },
    ended: { value: ended, configurable: true },
    muted: { value: muted, configurable: true },
    volume: { value: volume, configurable: true }
  });

  if (lastInteractionAt) {
    video.dataset.liveCaptionLastInteraction = String(lastInteractionAt);
  }

  video.getBoundingClientRect = vi.fn(() => rect || ({
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0
  }));

  return video;
}

describe('ActiveVideoDetector', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    setViewport();
  });

  it('collects video candidates with metadata in DOM order', () => {
    const first = createVideo({
      rect: { top: 10, left: 10, right: 210, bottom: 110, width: 200, height: 100 },
      paused: true,
      label: 'first'
    });
    const second = createVideo({
      rect: { top: 20, left: 20, right: 320, bottom: 220, width: 300, height: 200 },
      paused: true,
      label: 'second'
    });

    document.body.append(first, second);

    const candidates = collectActiveVideoCandidates(document);

    expect(ActiveVideoDetector.collectCandidates).toBe(collectActiveVideoCandidates);
    expect(ActiveVideoDetector.selectVideo).toBe(selectActiveVideoCandidate);
    expect(candidates).toHaveLength(2);
    expect(candidates[0].domIndex).toBe(0);
    expect(candidates[1].domIndex).toBe(1);
    expect(candidates[0].ranking.visibleArea).toBeGreaterThan(0);
    expect(candidates[1].element).toBe(second);
  });

  it('prefers playing over paused videos', () => {
    const paused = createVideo({
      rect: { top: 10, left: 10, right: 210, bottom: 110, width: 200, height: 100 },
      paused: true,
      muted: false,
      label: 'paused'
    });
    const playing = createVideo({
      rect: { top: 10, left: 10, right: 210, bottom: 110, width: 200, height: 100 },
      paused: false,
      muted: false,
      label: 'playing'
    });

    document.body.append(paused, playing);

    expect(selectActiveVideoCandidate(document)).toBe(playing);
    expect(rankActiveVideoCandidates(document)[0].element).toBe(playing);
  });

  it('prefers visible videos over hidden videos', () => {
    const hidden = createVideo({
      rect: { top: 2000, left: 0, right: 100, bottom: 2100, width: 100, height: 100 },
      paused: false,
      label: 'hidden'
    });
    const visible = createVideo({
      rect: { top: 50, left: 50, right: 250, bottom: 150, width: 200, height: 100 },
      paused: false,
      label: 'visible'
    });

    document.body.append(hidden, visible);

    expect(selectActiveVideoCandidate(document)).toBe(visible);
  });

  it('prefers audible videos over muted videos', () => {
    const muted = createVideo({
      rect: { top: 10, left: 10, right: 210, bottom: 110, width: 200, height: 100 },
      paused: false,
      muted: true,
      volume: 0,
      label: 'muted'
    });
    const audible = createVideo({
      rect: { top: 10, left: 10, right: 210, bottom: 110, width: 200, height: 100 },
      paused: false,
      muted: false,
      volume: 1,
      label: 'audible'
    });

    document.body.append(muted, audible);

    expect(selectActiveVideoCandidate(document)).toBe(audible);
  });

  it('prefers the largest visible area when all higher priorities are equal', () => {
    const small = createVideo({
      rect: { top: 10, left: 10, right: 110, bottom: 60, width: 100, height: 50 },
      paused: false,
      label: 'small'
    });
    const large = createVideo({
      rect: { top: 10, left: 10, right: 310, bottom: 210, width: 300, height: 200 },
      paused: false,
      label: 'large'
    });

    document.body.append(small, large);

    expect(selectActiveVideoCandidate(document)).toBe(large);
  });

  it('prefers the most recent interaction when visible area is equal', () => {
    const older = createVideo({
      rect: { top: 10, left: 10, right: 210, bottom: 110, width: 200, height: 100 },
      paused: false,
      lastInteractionAt: 1000,
      label: 'older'
    });
    const newer = createVideo({
      rect: { top: 10, left: 10, right: 210, bottom: 110, width: 200, height: 100 },
      paused: false,
      lastInteractionAt: 2000,
      label: 'newer'
    });

    document.body.append(older, newer);

    expect(selectActiveVideoCandidate(document)).toBe(newer);
  });

  it('uses DOM order as the final fallback', () => {
    const first = createVideo({
      rect: { top: 10, left: 10, right: 210, bottom: 110, width: 200, height: 100 },
      paused: true,
      muted: true,
      volume: 0,
      label: 'first'
    });
    const second = createVideo({
      rect: { top: 10, left: 10, right: 210, bottom: 110, width: 200, height: 100 },
      paused: true,
      muted: true,
      volume: 0,
      label: 'second'
    });

    document.body.append(first, second);

    expect(selectActiveVideoCandidate(document)).toBe(first);
  });
});
