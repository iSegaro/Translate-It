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
  isFatalError: vi.fn(() => false),
  matchErrorToType: vi.fn(() => 'API_ERROR')
}));

// 2. Import BaseAIProvider and Constants
// Mock AIResponseParser
vi.mock("./utils/AIResponseParser.js", () => ({
  AIResponseParser: {
    parseBatchResult: vi.fn((res) => res),
    cleanAIResponse: vi.fn((res) => res)
  }
}));

import { BaseAIProvider } from './BaseAIProvider.js';
import { isFatalError } from '@/shared/error-management/ErrorMatcher.js';
import { statsManager } from '../core/TranslationStatsManager.js';
import { AIResponseParser } from "./utils/AIResponseParser.js";

// 3. Define local constants to avoid circular mock issues
const ResponseFormat = {
  STRING: 'string',
  JSON_ARRAY: 'json_array',
  JSON_OBJECT: 'json_object'
};

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
  });

  describe('_translateBatch', () => {
    it('should execute translation with rate limit and return original on non-fatal error', async () => {
      provider._callAI = vi.fn().mockRejectedValue(new Error('AI Failure'));
      vi.mocked(isFatalError).mockReturnValue(false);
      
      const texts = ['Original 1', 'Original 2'];
      const result = await provider._translateBatch(texts, 'en', 'fa', 'selection', null, null, null, 'session-123');

      expect(result).toEqual(['Original 1', 'Original 2']);
      
      // Wait for dynamic import inside _translateBatch
      await new Promise(r => setTimeout(r, 50));
      expect(statsManager.recordError).toHaveBeenCalledWith('MockAI', 'session-123');
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

  describe('_traditionalBatchTranslate', () => {
    it('should process segments sequentially when fallback is used', async () => {
      const texts = ['seg1', 'seg2'];
      const spy = vi.spyOn(provider, '_callAI');
      
      await provider._traditionalBatchTranslate(texts, 'en', 'fa', 'selection');

      expect(spy).toHaveBeenCalledTimes(2);
    });
  });
});
