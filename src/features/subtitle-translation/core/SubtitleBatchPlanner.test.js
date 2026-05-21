import { describe, it, expect } from 'vitest';
import { SubtitleBatchPlanner } from './SubtitleBatchPlanner.js';

describe('SubtitleBatchPlanner', () => {
  const mockCues = Array.from({ length: 50 }, (_, i) => ({
    id: `cue-${i + 1}`,
    index: i + 1,
    text: `This is cue number ${i + 1}.`,
    status: 'pending',
    warnings: []
  }));

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
});
