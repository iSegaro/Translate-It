import { describe, expect, it } from 'vitest';
import {
  getVisibleLiveDubbingTranscript,
  LIVE_DUBBING_VISIBLE_CHARACTER_LIMIT,
} from './liveDubbingTranscriptPresentation.js';

describe('live dubbing transcript presentation', () => {
  it('keeps short text with whitespace unchanged', () => {
    expect(getVisibleLiveDubbingTranscript({ fragments: ['hello world'] })).toBe('hello world');
  });

  it('clips only the visible window while retaining newest text', () => {
    const retained = { fragments: ['a'.repeat(2000), 'b'.repeat(2000)] };

    expect(retained.fragments.join('').length).toBeGreaterThan(LIVE_DUBBING_VISIBLE_CHARACTER_LIMIT);
    expect(getVisibleLiveDubbingTranscript(retained)).toBe('b'.repeat(400));
  });

  it('starts at the first whitespace boundary in the recent suffix', () => {
    const text = 'older '.repeat(100) + 'newest words';
    const suffix = text.slice(-LIVE_DUBBING_VISIBLE_CHARACTER_LIMIT);
    const boundary = suffix.search(/\s/);

    expect(getVisibleLiveDubbingTranscript({ fragments: [text] })).toBe(suffix.slice(boundary + 1));
  });

  it('keeps a suffix unchanged when no whitespace boundary exists', () => {
    expect(getVisibleLiveDubbingTranscript({ fragments: ['x'.repeat(500)] })).toBe('x'.repeat(400));
  });
});
