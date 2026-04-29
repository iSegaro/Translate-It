import { describe, it, expect, vi } from 'vitest';
import { TraditionalTextProcessor } from './TraditionalTextProcessor.js';

// Mock dependencies
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

vi.mock("@/shared/config/translationConstants.js", () => ({
  TRANSLATION_CONSTANTS: {
    TEXT_DELIMITER: '[[---]]'
  }
}));

describe('TraditionalTextProcessor', () => {
  describe('scrubBidiArtifacts', () => {
    it('should remove technical delimiters and bidi marks', () => {
      const input = 'Hello [[ --- ]] World';
      expect(TraditionalTextProcessor.scrubBidiArtifacts(input)).toBe('Hello World');
    });

    it('should preserve user brackets with content', () => {
      const input = 'Refer to [[Chapter 1]] for details';
      expect(TraditionalTextProcessor.scrubBidiArtifacts(input)).toBe('Refer to [[Chapter 1]] for details');
    });

    it('should handle multiple artifacts and isolated remnants', () => {
      const input = '[[ . ]]One[[ --- ]]Two[[...';
      expect(TraditionalTextProcessor.scrubBidiArtifacts(input)).toBe('OneTwo');
    });
  });

  describe('createChunks', () => {
    it('should split by character limit precisely', () => {
      const delimiter = '[[---]]'; // length 7
      const texts = ['aaaa', 'bbbb', 'cccc']; // each 4 chars
      const charLimit = 15; // 4 + 7 + 4 = 15 (fits 2 segments). 3rd would be 15 + 7 + 4 = 26 (exceeds)

      const chunks = TraditionalTextProcessor.createChunks(
        texts, 'Google', 'character_limit', charLimit, 50
      );

      expect(chunks.length).toBe(2);
      expect(chunks[0].texts).toEqual(['aaaa', 'bbbb']);
      expect(chunks[1].texts).toEqual(['cccc']);
    });

    it('should split by segment count limit', () => {
      const texts = Array(10).fill('a');
      const chunks = TraditionalTextProcessor.createChunks(
        texts, 'Google', 'fixed', 5000, 3 // Max 3 segments per chunk
      );

      expect(chunks.length).toBe(4); // 3 + 3 + 3 + 1
      expect(chunks[0].texts.length).toBe(3);
    });
  });

  describe('calculateTraditionalCharCount', () => {
    it('should include delimiters in calculation', () => {
      const texts = ['a', 'b']; // 1 + 1 = 2
      const delimiterLen = 7; // [[---]]
      const expected = 2 + delimiterLen; // 9

      expect(TraditionalTextProcessor.calculateTraditionalCharCount(texts)).toBe(expected);
    });

    it('should handle mixed input types', () => {
      const texts = ['str', { t: 'obj' }]; // 3 + 3 = 6
      const delimiterLen = 7;
      expect(TraditionalTextProcessor.calculateTraditionalCharCount(texts)).toBe(6 + delimiterLen);
    });
  });
});
