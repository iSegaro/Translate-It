import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranslationBatcher } from './TranslationBatcher.js';
import { ComplexityAnalyzer } from './ComplexityAnalyzer.js';

// Mock ComplexityAnalyzer
vi.mock('./ComplexityAnalyzer.js', () => ({
  ComplexityAnalyzer: {
    calculateTextComplexity: vi.fn(() => 10),
    getAdjustedBatchSize: vi.fn((complexity, baseSize) => baseSize),
    calculateBatchComplexity: vi.fn(() => 10)
  }
}));

// Mock Logger
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

describe('TranslationBatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default behavior for adjusted size
    ComplexityAnalyzer.getAdjustedBatchSize.mockImplementation((complexity, baseSize) => baseSize);
  });

  describe('splitOversizedSegment', () => {
    it('should return the original segment if it is within character limit', () => {
      const text = 'Hello world';
      const result = TranslationBatcher.splitOversizedSegment(text, 20);
      expect(result).toEqual([text]);
    });

    it('should split text at sentence boundaries', () => {
      const text = 'Sentence one. Sentence two! Sentence three? Last one.';
      // Limit 15, should break after "Sentence one. "
      const result = TranslationBatcher.splitOversizedSegment(text, 15);
      
      expect(result.length).toBeGreaterThan(1);
      expect(result[0]).toBe('Sentence one.');
      expect(result[1]).toBe('Sentence two!');
    });

    it('should fallback to space if no sentence boundary is found', () => {
      const text = 'This is a very long text without punctuation';
      const result = TranslationBatcher.splitOversizedSegment(text, 10);
      
      expect(result[0]).toBe('This is a');
      expect(result[1]).toBe('very long');
    });

    it('should preserve object properties and add part metadata when splitting objects', () => {
      const segment = { t: 'Part one. Part two.', id: 'seg-1', blockId: 'b1' };
      const result = TranslationBatcher.splitOversizedSegment(segment, 10);
      
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        t: 'Part one.',
        id: 'seg-1',
        isSplit: true,
        partIndex: 0
      });
      expect(result[1]).toMatchObject({
        t: 'Part two.',
        partIndex: 1
      });
    });
  });

  describe('createIntelligentBatches', () => {
    it('should group segments by baseBatchSize when limits are not reached', () => {
      const segments = ['s1', 's2', 's3', 's4'];
      const batches = TranslationBatcher.createIntelligentBatches(segments, 2, 1000);
      
      expect(batches.length).toBe(2);
      expect(batches[0]).toEqual(['s1', 's2']);
      expect(batches[1]).toEqual(['s3', 's4']);
    });

    it('should respect maxCharsPerBatch', () => {
      const segments = ['short', 'very long text that exceeds limit'];
      const batches = TranslationBatcher.createIntelligentBatches(segments, 10, 20);
      
      // 'very long text...' itself will be split by splitOversizedSegment first
      // 'very long text that ' is 20 chars.
      expect(batches.length).toBeGreaterThan(1);
      const totalTextInBatch1 = batches[0].join('');
      expect(totalTextInBatch1.length).toBeLessThanOrEqual(20);
    });

    it('should adjust batch size based on complexity', () => {
      ComplexityAnalyzer.getAdjustedBatchSize.mockReturnValue(1); 
      
      const segments = ['s1', 's2', 's3'];
      const batches = TranslationBatcher.createIntelligentBatches(segments, 10, 1000);
      
      expect(batches.length).toBe(3);
      expect(batches[0]).toEqual(['s1']);
    });

    it('should respect block boundaries and flush if batch is > 70% full', () => {
      const segments = [
        { t: 's1', blockId: 'b1' },
        { t: 's2', blockId: 'b1' },
        { t: 's3', blockId: 'b1' }, // 3/4 = 75% full (if baseBatchSize is 4)
        { t: 's4', blockId: 'b2' }  // Boundary here
      ];
      
      // baseBatchSize = 4. 70% of 4 is 2.8. 
      // After s3, length is 3. 3 > 2.8.
      // s4 has different blockId, so it should trigger a flush.
      const batches = TranslationBatcher.createIntelligentBatches(segments, 4, 1000);
      
      expect(batches.length).toBe(2);
      expect(batches[0].length).toBe(3);
      expect(batches[0][0].t).toBe('s1');
      expect(batches[1][0].t).toBe('s4');
    });

    it('should NOT flush at block boundary if batch is less than 70% full', () => {
      const segments = [
        { t: 's1', blockId: 'b1' }, // 1/4 = 25% full
        { t: 's2', blockId: 'b2' }  // Boundary here
      ];
      
      const batches = TranslationBatcher.createIntelligentBatches(segments, 4, 1000);
      
      expect(batches.length).toBe(1);
      expect(batches[0].length).toBe(2);
    });
  });

  describe('createOptimalBatches', () => {
    it('should slice segments into equal batches', () => {
      const segments = [1, 2, 3, 4, 5];
      const batches = TranslationBatcher.createOptimalBatches(segments, 2);
      
      expect(batches).toEqual([[1, 2], [3, 4], [5]]);
    });
  });
});
