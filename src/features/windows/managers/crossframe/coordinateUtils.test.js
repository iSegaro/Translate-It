import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { adjustForDirectChild } from './coordinateUtils.js';

describe('adjustForDirectChild', () => {
  const stubIframes = (frames) => {
    vi.spyOn(document, 'querySelectorAll').mockImplementation((selector) => {
      if (selector === 'iframe') return frames;
      return [];
    });
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds the direct child iframe rect offset exactly once', () => {
    const sourceWindow = { frame: true };
    stubIframes([{
      contentWindow: sourceWindow,
      getBoundingClientRect: () => ({ left: 150, top: 300 })
    }]);

    const adjusted = adjustForDirectChild(sourceWindow, { x: 100, y: 200 });

    expect(adjusted).toEqual({
      x: 250,
      y: 500,
      _isViewportRelative: true,
      _isAbsolute: false
    });
  });

  it('returns null when the sender is not a direct child iframe', () => {
    stubIframes([{
      contentWindow: { other: true },
      getBoundingClientRect: () => ({ left: 150, top: 300 })
    }]);

    expect(adjustForDirectChild({ frame: true }, { x: 1, y: 2 })).toBeNull();
  });

  it('returns null when there are no iframes', () => {
    stubIframes([]);

    expect(adjustForDirectChild({ frame: true }, { x: 1, y: 2 })).toBeNull();
  });

  it('skips iframes whose contentWindow cannot be compared', () => {
    const throwingFrame = {};
    Object.defineProperty(throwingFrame, 'contentWindow', {
      get() { throw new Error('cross-origin'); }
    });
    stubIframes([throwingFrame]);

    expect(adjustForDirectChild({ frame: true }, { x: 1, y: 2 })).toBeNull();
  });

  it('does not mutate the original position object', () => {
    const sourceWindow = { frame: true };
    stubIframes([{
      contentWindow: sourceWindow,
      getBoundingClientRect: () => ({ left: 150, top: 300 })
    }]);

    const original = { x: 100, y: 200, foo: 'bar' };
    const adjusted = adjustForDirectChild(sourceWindow, original);

    expect(original).toEqual({ x: 100, y: 200, foo: 'bar' });
    expect(adjusted.foo).toBe('bar');
  });
});
