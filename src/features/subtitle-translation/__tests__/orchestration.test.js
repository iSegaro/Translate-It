import { describe, it, expect } from 'vitest';
import { SubtitleBatchPlanner } from '../core/SubtitleBatchPlanner.js';
import { SubtitleProviderLimitsResolver } from '../core/SubtitleProviderLimitsResolver.js';
import { SubtitleContextBuilder } from '../core/SubtitleContextBuilder.js';

describe('Subtitle Orchestration Logic', () => {
  const mockCues = Array.from({ length: 50 }, (_, i) => ({
    id: `cue-${i + 1}`,
    index: i + 1,
    text: `This is cue number ${i + 1}.`,
    status: 'pending',
    warnings: []
  }));

  it('should resolve provider limits correctly', () => {
    const geminiLimits = SubtitleProviderLimitsResolver.resolve('Gemini');
    expect(geminiLimits).toBeDefined();
    expect(geminiLimits.characterLimit).toBeGreaterThan(0);
    expect(geminiLimits.maxChunks).toBeGreaterThan(0);
  });

  it('should plan batches within limits', () => {
    const limits = { characterLimit: 100, maxChunks: 5 };
    const batches = SubtitleBatchPlanner.plan(mockCues, limits);
    
    expect(batches.length).toBeGreaterThan(0);
    batches.forEach(batch => {
      expect(batch.length).toBeLessThanOrEqual(limits.maxChunks);
      const chars = batch.reduce((sum, c) => sum + c.text.length, 0);
      expect(chars).toBeLessThanOrEqual(limits.characterLimit);
    });
  });

  it('should build context for cues', () => {
    const context = SubtitleContextBuilder.buildContext(9, mockCues, { windowSize: 2 });
    expect(context.previous.length).toBe(2);
    expect(context.next.length).toBe(2);
    expect(context.previous[0]).toContain('cue number 8');
    expect(context.next[0]).toContain('cue number 11');
  });
});
