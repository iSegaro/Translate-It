import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock webextension-polyfill
vi.mock('webextension-polyfill', () => ({
  default: {
    tabs: {
      sendMessage: vi.fn().mockResolvedValue(true)
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(true)
      }
    },
    runtime: {
      getManifest: () => ({ version: '1.0.0' })
    }
  }
}));

vi.mock('@/shared/error-management/ErrorMatcher.js');

import { OptimizedJsonHandler } from './OptimizedJsonHandler.js';
import { isFatalError, matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';

// Mock dependencies
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

vi.mock('@/features/translation/core/TranslationStatsManager.js', () => ({
  statsManager: {
    getSessionSummary: vi.fn(() => ({ chars: 100, originalChars: 80 })),
    printSummary: vi.fn()
  }
}));

// Partial mocks for dynamic imports
vi.mock('@/features/translation/core/ProviderConfigurations.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getProviderConfiguration: vi.fn(() => ({
      batching: { optimalSize: 2, maxChars: 1000 },
      rateLimit: { maxConcurrent: 2 }
    }))
  };
});

vi.mock('@/shared/config/config.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getProviderOptimizationLevelAsync: vi.fn().mockResolvedValue(3)
  };
});

describe('OptimizedJsonHandler', () => {
  let handler;
  let mockEngine;
  let mockProvider;
  let mockAbortController;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock behavior for ErrorMatcher
    isFatalError.mockImplementation((err) => err?.isFatal || false);
    matchErrorToType.mockImplementation((err) => err?.type || 'UNKNOWN_ERROR');

    handler = new OptimizedJsonHandler();

    mockAbortController = {
      signal: { aborted: false },
      abort: vi.fn(() => { mockAbortController.signal.aborted = true; })
    };

    mockEngine = {
      lifecycleRegistry: {
        getAbortController: vi.fn(() => mockAbortController),
        registerRequest: vi.fn(() => mockAbortController),
        unregisterRequest: vi.fn()
      },
      createIntelligentBatches: vi.fn((segments) => [
        [segments[0]], 
        [segments[1]]
      ]),
      isCancelled: vi.fn(() => false)
    };

    mockProvider = {
      providerName: 'TestProvider',
      constructor: { batchStrategy: 'json', isAI: true },
      translate: vi.fn()
    };
  });

  describe('_mapResults', () => {
    it('should map array results back to segments', () => {
      const original = ['s1', 's2'];
      const translated = ['t1', 't2'];
      const result = handler._mapResults(original, translated);
      expect(result).toEqual(['t1', 't2']);
    });

    it('should reject malformed JSON-like strings to prevent UI corruption', () => {
      const original = ['s1'];
      // A string that:
      // 1. Starts with {" or ["
      // 2. Fails JSON.parse (malformed)
      // 3. Contains ": or ",
      // 4. Is longer than 20 chars
      const malformedJson = '{"this is malformed": and fails parse ", but has markers and is long enough }';
      
      const result = handler._mapResults(original, malformedJson);
      expect(result).toEqual(['s1']);
    });
  });

  describe('execute', () => {
    const mockData = {
      text: JSON.stringify(['s1', 's2']),
      sourceLanguage: 'auto',
      targetLanguage: 'fa',
      mode: 'select_element',
      messageId: 'msg-1',
      sessionId: 'sess-1'
    };
    const mockSender = { tab: { id: 123 } };

    it('should execute translation batches and update detected language', async () => {
      // Mock first call with detectedLanguage
      mockProvider.translate
        .mockResolvedValueOnce({ 
          translatedText: ['t1'], 
          detectedLanguage: 'fr' 
        })
        .mockResolvedValueOnce({ 
          translatedText: ['t2'] 
        });

      await handler.execute(mockEngine, mockData, mockProvider, 'auto', 'fa', 'msg-1', mockSender);

      expect(mockProvider.translate).toHaveBeenCalledTimes(2);
      // Second call should use 'fr'
      expect(mockProvider.translate.mock.calls[1][1]).toBe('fr');
    });

    it('should handle fatal errors by aborting other batches', async () => {
      const fatalError = new Error('429');
      fatalError.isFatal = true;

      mockProvider.translate.mockRejectedValueOnce(fatalError);

      await handler.execute(mockEngine, mockData, mockProvider, 'en', 'fa', 'msg-1', mockSender);

      expect(mockAbortController.abort).toHaveBeenCalled();
    });
  });
});
