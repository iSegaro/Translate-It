import { describe, expect, it, vi } from 'vitest';
import { GenericHtmlMediaStrategy } from './GenericHtmlMediaStrategy.js';
import { MediaSourceResolver } from './MediaSourceResolver.js';
import { MEDIA_SOURCE_ERRORS, MEDIA_READY_STATES } from './mediaConstants.js';

function media(overrides = {}) {
  return {
    isConnected: true,
    paused: false,
    ended: false,
    readyState: MEDIA_READY_STATES.HAVE_CURRENT_DATA,
    ...overrides,
  };
}

function documentWith({ video = [], audio = [] } = {}) {
  return {
    querySelectorAll: vi.fn(selector => (selector === 'video' ? video : audio)),
  };
}

describe('GenericHtmlMediaStrategy', () => {
  it('scans only current-document video/audio elements and selects the eligible one', () => {
    const selected = media();
    const documentRef = documentWith({
      video: [
        media({ paused: true }),
        media({ isConnected: false }),
        media({ ended: true }),
        media({ readyState: MEDIA_READY_STATES.HAVE_CURRENT_DATA - 1 }),
        selected,
      ],
      audio: [media({ paused: true })],
    });
    const result = new GenericHtmlMediaStrategy({ documentRef }).resolve();

    expect(result).toEqual({ success: true, source: selected });
    expect(documentRef.querySelectorAll).toHaveBeenNthCalledWith(1, 'video');
    expect(documentRef.querySelectorAll).toHaveBeenNthCalledWith(2, 'audio');
    expect(selected).toEqual({
      isConnected: true,
      paused: false,
      ended: false,
      readyState: MEDIA_READY_STATES.HAVE_CURRENT_DATA,
    });
  });

  it('returns the canonical not-found failure when no candidate is eligible', () => {
    const documentRef = documentWith({
      video: [media({ paused: true })],
      audio: [media({ ended: true })],
    });

    expect(new GenericHtmlMediaStrategy({ documentRef }).resolve()).toEqual({
      success: false,
      error: MEDIA_SOURCE_ERRORS.NOT_FOUND,
    });
  });

  it('returns the canonical ambiguity failure for multiple eligible candidates', () => {
    const documentRef = documentWith({ video: [media(), media()] });

    expect(new GenericHtmlMediaStrategy({ documentRef }).resolve()).toEqual({
      success: false,
      error: MEDIA_SOURCE_ERRORS.AMBIGUOUS,
    });
  });

  it('keeps strategy order explicit and stops after the first successful strategy', () => {
    const source = media();
    const first = { resolve: vi.fn(() => ({ success: true, source })) };
    const second = { resolve: vi.fn(() => ({ success: true, source: media() })) };
    const documentRef = documentWith();

    const result = new MediaSourceResolver({
      documentRef,
      strategies: [first, second],
    }).resolve();

    expect(result).toEqual({ success: true, source });
    expect(first.resolve).toHaveBeenCalledWith(documentRef);
    expect(second.resolve).not.toHaveBeenCalled();
  });

  it('does not let a later strategy hide an earlier ambiguity', () => {
    const first = {
      resolve: vi.fn(() => ({ success: false, error: MEDIA_SOURCE_ERRORS.AMBIGUOUS })),
    };
    const second = { resolve: vi.fn(() => ({ success: true, source: media() })) };

    expect(new MediaSourceResolver({ strategies: [first, second] }).resolve()).toEqual({
      success: false,
      error: MEDIA_SOURCE_ERRORS.AMBIGUOUS,
    });
    expect(second.resolve).not.toHaveBeenCalled();
  });
});
