import { describe, it, expect, vi, beforeEach } from 'vitest';
// Mock ErrorMatcher
vi.mock('@/shared/error-management/ErrorMatcher.js');

import { TraditionalBatchProcessor } from './TraditionalBatchProcessor.js';
import { isFatalError } from '@/shared/error-management/ErrorMatcher.js';

// Mock dependencies
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

vi.mock('@/features/translation/core/RateLimitManager.js', () => ({
  rateLimitManager: {
    executeWithRateLimit: vi.fn((provider, task) => task())
  },
  TranslationPriority: { NORMAL: 5 }
}));

describe('TraditionalBatchProcessor', () => {
  const mockProvider = { providerName: 'GoogleFree' };
  const mockLimits = { CHUNK_SIZE: 10, CHAR_LIMIT: 100 };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Batch Splitting Logic', () => {
    it('should split segments based on CHUNK_SIZE', async () => {
      const segments = Array(15).fill('test'); // 15 segments
      const translateChunk = vi.fn((chunk) => chunk.map(s => s + '_tr'));

      const result = await TraditionalBatchProcessor.processInBatches(
        mockProvider, segments, translateChunk, mockLimits
      );

      // Should call translateChunk twice: one for 10 segments, one for 5
      expect(translateChunk).toHaveBeenCalledTimes(2);
      expect(result.length).toBe(15);
      expect(result[0]).toBe('test_tr');
    });

    it('should split segments based on CHAR_LIMIT', async () => {
      // 3 segments of 40 chars = 120 chars. Limit is 100.
      const segments = [
        'a'.repeat(40),
        'b'.repeat(40),
        'c'.repeat(40)
      ];
      const translateChunk = vi.fn((chunk) => chunk.map(s => s + '_tr'));

      await TraditionalBatchProcessor.processInBatches(
        mockProvider, segments, translateChunk, mockLimits
      );

      // Should split into 2 batches because a+b = 80 (fits), but a+b+c = 120 (exceeds 100)
      expect(translateChunk).toHaveBeenCalledTimes(2);
      expect(translateChunk).toHaveBeenNthCalledWith(1, [segments[0], segments[1]], expect.anything(), expect.anything());
      expect(translateChunk).toHaveBeenNthCalledWith(2, [segments[2]], expect.anything(), expect.anything());
    });

    it('should handle oversized segments by putting them in their own batch', async () => {
      const segments = ['a'.repeat(150)]; // Exceeds 100 CHAR_LIMIT
      const translateChunk = vi.fn((chunk) => chunk);

      await TraditionalBatchProcessor.processInBatches(
        mockProvider, segments, translateChunk, mockLimits
      );

      expect(translateChunk).toHaveBeenCalledTimes(1);
      expect(translateChunk).toHaveBeenCalledWith([segments[0]], 0, 1);
    });
  });

  describe('Index and Result Integrity', () => {
    it('should maintain correct ordering even with complex batches', async () => {
      const segments = ['s1', 's2', 's3', 's4'];
      const mockLimitsSmall = { CHUNK_SIZE: 2, CHAR_LIMIT: 100 };
      
      const translateChunk = async (chunk) => {
        // Return results in reverse order to ensure we map back by index correctly
        return chunk.map(s => s + '_tr');
      };

      const result = await TraditionalBatchProcessor.processInBatches(
        mockProvider, segments, translateChunk, mockLimitsSmall
      );

      expect(result).toEqual(['s1_tr', 's2_tr', 's3_tr', 's4_tr']);
    });
  });

  describe('Error Handling and Fallbacks', () => {
    it('should fallback to original text for a failed batch but continue others', async () => {
      const segments = ['batch1_s1', 'batch2_s1'];
      const mockLimitsSmall = { CHUNK_SIZE: 1, CHAR_LIMIT: 100 };

      const translateChunk = vi.fn()
        .mockResolvedValueOnce(['batch1_tr'])
        .mockRejectedValueOnce(new Error('Network Error'));

      const result = await TraditionalBatchProcessor.processInBatches(
        mockProvider, segments, translateChunk, mockLimitsSmall
      );

      expect(result[0]).toBe('batch1_tr');
      expect(result[1]).toBe('batch2_s1'); // Fallback to original
    });

    it('should throw immediately if a fatal error occurs', async () => {
      // Set mock to return true for this specific test
      vi.mocked(isFatalError).mockReturnValueOnce(true);

      const segments = ['s1'];
      const translateChunk = () => Promise.reject(new Error('API Key Expired'));

      await expect(TraditionalBatchProcessor.processInBatches(
        mockProvider, segments, translateChunk, mockLimits
      )).rejects.toThrow('API Key Expired');
    });
  });
});
