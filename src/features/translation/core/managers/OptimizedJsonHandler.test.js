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
import { getProviderConfiguration } from '@/features/translation/core/ProviderConfigurations.js';
import { TranslationBatcher } from '@/features/translation/core/utils/TranslationBatcher.js';

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
      signal: { 
        aborted: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      },
      abort: vi.fn(function() { this.signal.aborted = true; })
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

    it('should throw a fatal validation error on segment count mismatch', () => {
      const original = ['s1', 's2'];
      const translated = ['t1'];
      expect(() => handler._mapResults(original, translated)).toThrow(/Segment count mismatch/);
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

    it('should abort execution and bubble validation error on count mismatch', async () => {
      mockProvider.translate.mockResolvedValueOnce({
        translatedText: []
      });

      const result = await handler.execute(mockEngine, mockData, mockProvider, 'en', 'fa', 'msg-1', mockSender);

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('Segment count mismatch');
      expect(mockAbortController.abort).toHaveBeenCalled();
    });

    it('should respect select_element overrides from provider configurations', async () => {
      getProviderConfiguration.mockReturnValueOnce({
        batching: {
          optimalSize: 10,
          characterLimit: 2000,
          modeOverrides: {
            select_element: {
              optimalSize: 15,
              characterLimit: 1200
            }
          }
        },
        rateLimit: { maxConcurrent: 2 }
      });

      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: ['t1'] })
        .mockResolvedValueOnce({ translatedText: ['t2'] });

      await handler.execute(mockEngine, mockData, mockProvider, 'en', 'fa', 'msg-1', mockSender);

      expect(mockEngine.createIntelligentBatches).toHaveBeenCalledWith(
        expect.any(Array),
        15, // override.optimalSize
        1200 // override.characterLimit
      );
    });

    it('should forward original source language metadata to provider translate calls', async () => {
      mockEngine.createIntelligentBatches = vi.fn((segments) => [segments]);

      mockProvider.translate.mockResolvedValueOnce({
        translatedText: ['t1', 't2'],
        detectedLanguage: 'fa'
      });

      await handler.execute(mockEngine, mockData, mockProvider, 'de', 'fa', 'msg-1', mockSender);

      expect(mockProvider.translate).toHaveBeenCalledTimes(1);
      expect(mockProvider.translate).toHaveBeenCalledWith(
        expect.any(Array),
        'auto',
        'fa',
        expect.objectContaining({
          originalSourceLang: 'de',
          originalTargetLang: 'fa'
        })
      );
    });

    it('should correctly scale and batch for Level 5 (Turbo) in an end-to-end flow', async () => {
      mockEngine.createIntelligentBatches = (segments, size, chars) => TranslationBatcher.createIntelligentBatches(segments, size, chars);

      // Mock a realistic AI provider config scaled to Level 5 (Turbo)
      // At Level 5, multiplier is 0.3
      // Scaled mode override: optimalSize: Math.max(5, Math.round(25 * 0.3)) = 8
      // Scaled characterLimit: Math.max(500, Math.round(3500 * 0.3)) = 1050
      getProviderConfiguration.mockReturnValueOnce({
        batching: {
          optimalSize: 6, // scaled base
          characterLimit: 5000,
          modeOverrides: {
            select_element: {
              optimalSize: 8, // scaled override
              characterLimit: 1050 // scaled override
            }
          }
        },
        rateLimit: { maxConcurrent: 2 }
      });

      // Prepare a larger set of segments (e.g., 20 segments of ~10 chars each)
      const testSegments = Array.from({ length: 20 }, (_, index) => ({
        t: `Segment ${index} text content.`,
        i: `uid-${index}`
      }));

      const customMockData = {
        ...mockData,
        text: JSON.stringify(testSegments)
      };

      // Mock translate responses for the expected number of batches (20 segments / 8 size = 3 batches)
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: testSegments.slice(0, 8).map(s => s.t) })
        .mockResolvedValueOnce({ translatedText: testSegments.slice(8, 16).map(s => s.t) })
        .mockResolvedValueOnce({ translatedText: testSegments.slice(16, 20).map(s => s.t) });

      const result = await handler.execute(mockEngine, customMockData, mockProvider, 'en', 'fa', 'msg-1', mockSender);

      expect(result.success).toBe(true);
      expect(mockProvider.translate).toHaveBeenCalledTimes(3); // 3 batches (8, 8, 4)
    });

    it('should correctly scale and batch for Level 1 (Economy) in an end-to-end flow', async () => {
      mockEngine.createIntelligentBatches = (segments, size, chars) => TranslationBatcher.createIntelligentBatches(segments, size, chars);

      // Mock a realistic AI provider config scaled to Level 1 (Economy)
      // At Level 1, multiplier is 2.5
      // Scaled mode override: optimalSize: Math.max(5, Math.round(25 * 2.5)) = 62
      // Scaled characterLimit: Math.max(500, Math.round(3500 * 2.5)) = 8750
      getProviderConfiguration.mockReturnValueOnce({
        batching: {
          optimalSize: 50, // scaled base
          characterLimit: 5000,
          modeOverrides: {
            select_element: {
              optimalSize: 62, // scaled override
              characterLimit: 8750 // scaled override
            }
          }
        },
        rateLimit: { maxConcurrent: 1 }
      });

      // Prepare 20 segments
      const testSegments = Array.from({ length: 20 }, (_, index) => ({
        t: `Segment ${index} text content.`,
        i: `uid-${index}`
      }));

      const customMockData = {
        ...mockData,
        text: JSON.stringify(testSegments)
      };

      // Mock translate response for 1 batch (20 segments < 62 optimalSize)
      mockProvider.translate
        .mockResolvedValueOnce({ translatedText: testSegments.map(s => s.t) });

      const result = await handler.execute(mockEngine, customMockData, mockProvider, 'en', 'fa', 'msg-1', mockSender);

      expect(result.success).toBe(true);
      expect(mockProvider.translate).toHaveBeenCalledTimes(1); // 1 single batch
    });
  });
});
