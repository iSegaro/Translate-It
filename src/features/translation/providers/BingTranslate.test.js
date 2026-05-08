import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BingTranslateProvider } from './BingTranslate.js';
import { ProviderNames } from '@/features/translation/providers/ProviderConstants.js';

// Mock dependencies
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: { sendMessage: vi.fn(), onMessage: { addListener: vi.fn() } },
    storage: { local: { get: vi.fn(), set: vi.fn() } }
  }
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    init: vi.fn(),
    operation: vi.fn(),
    performance: vi.fn(),
  }),
}));

vi.mock('@/shared/config/config.js', () => ({
  getSettingsAsync: vi.fn(() => Promise.resolve({})),
  getProviderOptimizationLevelAsync: vi.fn(() => Promise.resolve(3)),
}));

vi.mock('@/features/translation/core/ProviderConfigurations.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getProviderBatching: vi.fn(() => ({
      strategy: 'character_limit',
      characterLimit: 1000,
      maxChunksPerBatch: 10,
    })),
    getProviderConfiguration: vi.fn(() => ({
      rateLimit: { maxConcurrent: 1, delayBetweenRequests: 0 },
      batching: { strategy: 'character_limit', characterLimit: 1000, maxChunksPerBatch: 10 }
    })),
  };
});

describe('BingTranslateProvider', () => {
  let provider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new BingTranslateProvider();
    
    // Initialize static property to avoid null pointer
    BingTranslateProvider.bingAccessToken = { count: 0 };

    // Mock _getBingAccessToken to avoid real fetch
    vi.spyOn(provider, '_getBingAccessToken').mockResolvedValue({
      token: 'mock-token',
      key: 'mock-key',
      IG: 'mock-IG',
      IID: 'mock-IID'
    });

    // Mock _executeApiCall to simulate fetch
    vi.spyOn(provider, '_executeApiCall').mockResolvedValue('translated-1\n[[---]]\ntranslated-2');
  });

  it('should initialize with correct name', () => {
    expect(provider.providerName).toBe(ProviderNames.BING_TRANSLATE);
  });

  it('should correctly map language codes', () => {
    expect(provider._getLangCode('auto')).toBe('auto-detect');
    expect(provider._getLangCode('en')).toBe('en');
    expect(provider._getLangCode('fa')).toBe('fa');
  });

  describe('_translateChunk', () => {
    it('should call API with correctly formatted body', async () => {
      const texts = ['Hello', 'World'];
      await provider._translateChunk(texts, 'en', 'fa');

      expect(provider._executeApiCall).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('bing.com'),
          fetchOptions: expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('Hello')
          })
        })
      );
    });

    it('should return translated joined string in an array', async () => {
      const texts = ['A', 'B'];
      const results = await provider._translateChunk(texts, 'en', 'fa');
      expect(results).toEqual(['translated-1\n[[---]]\ntranslated-2']);
    });

    it('should handle API errors and throw API_ERROR', async () => {
      vi.spyOn(provider, '_executeApiCall').mockRejectedValue(new Error('Network error'));
      
      await expect(provider._translateChunk(['text'], 'en', 'fa'))
        .rejects.toThrow();
    });
  });
});
