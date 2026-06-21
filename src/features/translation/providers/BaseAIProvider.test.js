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
import { isFatalError, isTransientError, matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';

// Mock AIResponseParser
vi.mock("./utils/AIResponseParser.js", () => ({
  AIResponseParser: {
    parseBatchResult: vi.fn((res) => res),
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
    it('should return original text on non-fatal AND non-transient error', async () => {
      provider._callAI = vi.fn().mockRejectedValue(new Error('Non-Fatal-Non-Transient'));
      vi.mocked(isFatalError).mockReturnValue(false);
      vi.mocked(isTransientError).mockReturnValue(false);

      const texts = ['Original 1', 'Original 2'];
      const result = await provider._translateBatch(texts, 'en', 'fa', 'selection', null, null, null, 'session-123');

      expect(result).toEqual(['Original 1', 'Original 2']);
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

    it('should call _callAI with correct parameters', async () => {
      const spy = vi.spyOn(provider, '_callAI');
      const texts = ['Hello'];
      
      await provider._translateBatch(texts, 'en', 'fa', 'selection');

      expect(spy).toHaveBeenCalled();
      const userText = spy.mock.calls[0][1];
      expect(userText).toContain('Hello');
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
