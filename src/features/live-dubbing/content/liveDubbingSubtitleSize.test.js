import { describe, expect, it } from 'vitest';
import {
  LIVE_DUBBING_SUBTITLE_SIZE_DEFAULT,
  LIVE_DUBBING_SUBTITLE_SIZE_PRESETS,
  normalizeLiveDubbingSubtitleSize,
} from './liveDubbingSubtitleSize.js';

describe('live dubbing subtitle size presets', () => {
  it('exposes the four canonical presets', () => {
    expect(Object.keys(LIVE_DUBBING_SUBTITLE_SIZE_PRESETS))
      .toEqual(['small', 'medium', 'large', 'xlarge']);
  });

  it.each([undefined, null, '', 'invalid', 'default'])('normalizes %s to medium', (value) => {
    expect(normalizeLiveDubbingSubtitleSize(value)).toBe(LIVE_DUBBING_SUBTITLE_SIZE_DEFAULT);
  });

  it('keeps valid preset values unchanged', () => {
    Object.keys(LIVE_DUBBING_SUBTITLE_SIZE_PRESETS).forEach(value => {
      expect(normalizeLiveDubbingSubtitleSize(value)).toBe(value);
    });
  });
});
