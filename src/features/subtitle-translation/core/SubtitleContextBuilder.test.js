import { describe, it, expect } from 'vitest';
import { SubtitleContextBuilder } from './SubtitleContextBuilder.js';

describe('SubtitleContextBuilder', () => {
  const mockCues = Array.from({ length: 50 }, (_, i) => ({
    id: `cue-${i + 1}`,
    index: i + 1,
    text: `This is cue number ${i + 1}.`,
    status: 'pending',
    warnings: []
  }));

  it('should build context for cues', () => {
    const context = SubtitleContextBuilder.buildContext(9, mockCues, { windowSize: 2 });
    expect(context.previous.length).toBe(2);
    expect(context.next.length).toBe(2);
    expect(context.previous[0]).toContain('cue number 8');
    expect(context.next[0]).toContain('cue number 11');
  });
});
