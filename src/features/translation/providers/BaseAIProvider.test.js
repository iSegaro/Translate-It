import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. Mock minimal dependencies
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: { getBrowserInfo: vi.fn(), getManifest: () => ({ version: '1.0.0' }) },
    storage: { local: { get: vi.fn(), set: vi.fn() } }
  }
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debugLazy: vi.fn(),
    init: vi.fn(),
    operation: vi.fn(),
    performance: vi.fn(),
  })
}));

// Mock StatsManager early
vi.mock('../core/TranslationStatsManager.js', () => ({
  statsManager: { recordError: vi.fn() }
}));

// Mock ErrorMatcher
vi.mock('@/shared/error-management/ErrorMatcher.js', () => ({
  matchErrorToType: vi.fn(),
  isFatalError: vi.fn(),
  isTransientError: vi.fn()
}));

import { BaseAIProvider } from './BaseAIProvider.js';
import { ResponseFormat } from '@/shared/config/translationConstants.js';
import { isFatalError, isTransientError, matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';

// Mock AIResponseParser
vi.mock("./utils/AIResponseParser.js", () => ({
  AIResponseParser: {
    parseBatchResult: vi.fn((res) => ({ results: res, contractViolation: false })),
    cleanAIResponse: vi.fn((res) => res)
  }
}));

// 4. Concrete implementation for testing
class MockAIProvider extends BaseAIProvider {
  constructor() {
    super('MockAI');
  }
  
  // Override abstract or problematic methods
  async getSupportsStreaming() { return false; }
  async getBatchStrategy() { return 'smart'; }
  async _executeWithRateLimit(task) { return await task({}); }
  async _callAI() { return "Mock Response"; }
  
  // Manual override for prompt preparation to avoid helper dependency
  async _preparePromptAndText(texts) {
    return { systemPrompt: 'Sys', userText: JSON.stringify(texts) };
  }
}

describe('BaseAIProvider', () => {
  let provider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new MockAIProvider();
    vi.mocked(isFatalError).mockReturnValue(false);
    vi.mocked(isTransientError).mockReturnValue(false);
    vi.mocked(matchErrorToType).mockReturnValue('UNKNOWN');
  });

  describe('_translateBatch', () => {
    it('should throw on non-fatal AND non-transient error instead of returning original text', async () => {
      provider._callAI = vi.fn().mockRejectedValue(new Error('Non-Fatal-Non-Transient'));
      vi.mocked(isFatalError).mockReturnValue(false);
      vi.mocked(isTransientError).mockReturnValue(false);

      const texts = ['Original 1', 'Original 2'];
      await expect(provider._translateBatch(texts, 'en', 'fa', 'selection', null, null, null, 'session-123'))
        .rejects.toThrow('Non-Fatal-Non-Transient');
    });

    it('should throw and NOT fallback if error is transient', async () => {
      provider._callAI = vi.fn().mockRejectedValue(new Error('Transient Error'));
      vi.mocked(isFatalError).mockReturnValue(false);
      vi.mocked(isTransientError).mockReturnValue(true);

      const texts = ['Original 1'];
      await expect(provider._translateBatch(texts, 'en', 'fa', 'selection'))
        .rejects.toThrow('Transient Error');
    });

    it('should throw immediately if error is fatal', async () => {
      provider._callAI = vi.fn().mockRejectedValue(new Error('FATAL 401'));
      vi.mocked(isFatalError).mockReturnValue(true);

      await expect(provider._translateBatch(['test'], 'en', 'fa', 'selection'))
        .rejects.toThrow('FATAL 401');
    });

    it('should not record a TranslationStatsManager error from the batch boundary (ownership: transport only)', async () => {
      const { statsManager } = await import('../core/TranslationStatsManager.js');
      provider._callAI = vi.fn().mockRejectedValue(new Error('Transport Failure'));

      await expect(provider._translateBatch(['seg1'], 'en', 'fa', 'selection', null, null, null, 'session-1'))
        .rejects.toThrow('Transport Failure');

      await new Promise(resolve => setTimeout(resolve, 0));
      expect(statsManager.recordError).not.toHaveBeenCalled();
    });

    it('should call _callAI with correct parameters', async () => {
      const spy = vi.spyOn(provider, '_callAI');
      const texts = ['Hello'];
      
      await provider._translateBatch(texts, 'en', 'fa', 'selection');

      expect(spy).toHaveBeenCalled();
      const userText = spy.mock.calls[0][1];
      expect(userText).toContain('Hello');
    });

    it('should return parsed results without recovery when contract is honored', async () => {
      const { AIResponseParser } = await import("./utils/AIResponseParser.js");
      AIResponseParser.parseBatchResult.mockReturnValue({ results: ['R1', 'R2'], contractViolation: false });
      const fallbackSpy = vi.spyOn(provider, '_traditionalBatchTranslate').mockResolvedValue(['F1', 'F2']);

      const texts = ['seg1', 'seg2'];
      const result = await provider._translateBatch(texts, 'en', 'fa', 'selection', null, null, null, 'session-1');

      expect(result).toEqual(['R1', 'R2']);
      expect(fallbackSpy).not.toHaveBeenCalled();
    });

    it('should perform exactly one sequential recovery when the contract is violated', async () => {
      const { AIResponseParser } = await import("./utils/AIResponseParser.js");
      AIResponseParser.parseBatchResult.mockReturnValue({ results: ['seg1'], contractViolation: true });
      const fallbackSpy = vi.spyOn(provider, '_traditionalBatchTranslate').mockResolvedValue(['F1']);

      const result = await provider._translateBatch(
        ['seg1', 'seg2'], 'en', 'fa', 'selection', null, null, null, 'session-1', { metadata: true }
      );

      expect(fallbackSpy).toHaveBeenCalledTimes(1);
      expect(fallbackSpy).toHaveBeenCalledWith(
        ['seg1', 'seg2'], 'en', 'fa', 'selection', null, null, null, null,
        'session-1', ResponseFormat.STRING, { metadata: true }
      );
      expect(result).toEqual(['F1']);
    });

    it('should normalize single-segment sequential recovery output to the structured-batch array shape (JSON_OBJECT)', async () => {
      const { AIResponseParser } = await import("./utils/AIResponseParser.js");
      AIResponseParser.parseBatchResult.mockReturnValue({ results: ['Bonjour'], contractViolation: true });
      provider._callAI = vi.fn()
        .mockResolvedValueOnce('structured-response')
        .mockResolvedValueOnce('Bonjour');
      const recoverySpy = vi.spyOn(provider, '_traditionalBatchTranslate');

      const result = await provider._translateBatch(
        ['Bonjour'], 'en', 'fa', 'selection', null, null, null, 'session-1', null, ResponseFormat.JSON_OBJECT
      );

      expect(recoverySpy).toHaveBeenCalledTimes(1);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual(['Bonjour']);
    });

    it('should keep multi-segment sequential recovery output as a flat array (no nesting)', async () => {
      const { AIResponseParser } = await import("./utils/AIResponseParser.js");
      AIResponseParser.parseBatchResult.mockReturnValue({ results: ['F1', 'F2'], contractViolation: true });
      provider._callAI = vi.fn()
        .mockResolvedValueOnce('structured-response')
        .mockResolvedValueOnce('F1')
        .mockResolvedValueOnce('F2');
      const recoverySpy = vi.spyOn(provider, '_traditionalBatchTranslate');

      const result = await provider._translateBatch(
        ['seg1', 'seg2'], 'en', 'fa', 'selection', null, null, null, 'session-1', null, ResponseFormat.JSON_OBJECT
      );

      expect(recoverySpy).toHaveBeenCalledTimes(1);
      expect(result).toEqual(['F1', 'F2']);
      expect(result[0]).not.toBeInstanceOf(Array);
    });
  });

  describe('_shouldUseStreaming', () => {
    it('should not use streaming for PDF mode', async () => {
      const shouldStream = await provider._shouldUseStreaming(['a', 'b'], 'msg-1', { name: 'engine' }, 'pdf-translation');
      expect(shouldStream).toBe(false);
    });
  });

  describe('_traditionalBatchTranslate', () => {
    it('should process segments sequentially', async () => {
      const texts = ['seg1', 'seg2'];
      const spy = vi.spyOn(provider, '_callAI');
      
      await provider._traditionalBatchTranslate(texts, 'en', 'fa', 'selection');

      expect(spy).toHaveBeenCalledTimes(2);
    });
  });
});
