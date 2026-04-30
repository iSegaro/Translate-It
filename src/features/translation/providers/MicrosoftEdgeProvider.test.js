import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock extension polyfill before anything else
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: { getBrowserInfo: vi.fn(), getManifest: () => ({ version: '1.0.0' }) },
    storage: { local: { get: vi.fn(), set: vi.fn() } }
  }
}));

import { MicrosoftEdgeProvider } from './MicrosoftEdgeProvider.js';

// Mock dependencies
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    init: vi.fn(),
    operation: vi.fn(),
    performance: vi.fn(),
  })
}));

vi.mock("@/shared/config/config.js", () => ({
  getMicrosoftEdgeAuthUrlAsync: vi.fn().mockResolvedValue('https://auth.edge.com'),
  getMicrosoftEdgeTranslateUrlAsync: vi.fn().mockResolvedValue('https://api.edge.com/translate'),
  getProviderOptimizationLevelAsync: vi.fn(() => Promise.resolve('balanced')),
  getSettingsAsync: vi.fn(() => Promise.resolve({})),
}));

// Partial mock for language constants
vi.mock("@/shared/config/languageConstants.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getProviderLanguageCode: vi.fn((lang) => {
      if (lang === 'en-US') return 'en';
      return lang;
    })
  };
});

vi.mock("./utils/TraditionalTextProcessor.js", () => ({
  TraditionalTextProcessor: {
    calculateTraditionalCharCount: vi.fn(() => 10)
  }
}));

describe('MicrosoftEdgeProvider', () => {
  let provider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new MicrosoftEdgeProvider();
    MicrosoftEdgeProvider.accessToken = null;
    MicrosoftEdgeProvider.tokenExpiry = 0;
  });

  describe('_getLangCode', () => {
    it('should return null for auto-detect', () => {
      expect(provider._getLangCode('auto')).toBeNull();
    });

    it('should normalize language codes to base code or mapped code', () => {
      expect(provider._getLangCode('en-US')).toBe('en');
    });
  });

  describe('_getAuthToken', () => {
    it('should fetch and process a new token', async () => {
      const mockToken = 'header.eyJleHAiOjE3Nzc1MDUzNzZ9.signature'; // Payload with exp
      
      // We need to simulate _executeRequest calling the extractResponse callback
      vi.spyOn(provider, '_executeRequest').mockImplementation(async (opts) => {
        const mockResponse = { text: () => Promise.resolve(mockToken) };
        return await opts.extractResponse(mockResponse);
      });

      const token = await provider._getAuthToken();

      expect(token).toBe(mockToken);
      expect(MicrosoftEdgeProvider.accessToken).toBe(mockToken);
      expect(MicrosoftEdgeProvider.tokenExpiry).toBeGreaterThan(0);
    });
  });

  describe('_translateChunk', () => {
    it('should translate text and detect language', async () => {
      vi.spyOn(provider, '_getAuthToken').mockResolvedValue('valid-token');
      
      const mockApiResponse = [
        { translations: [{ text: 'سلام' }], detectedLanguage: { language: 'en' } }
      ];
      
      // Simulate _executeRequest returning the extracted data
      vi.spyOn(provider, '_executeRequest').mockImplementation(async (opts) => {
        return opts.extractResponse(mockApiResponse);
      });

      const result = await provider._translateChunk(['Hello'], 'en', 'fa', 'selection', null);

      expect(result).toEqual(['سلام']);
      expect(provider.lastDetectedLanguage).toBe('en');
    });

    it('should retry without "from" param if source language is rejected', async () => {
      vi.spyOn(provider, '_getAuthToken').mockResolvedValue('valid-token');
      
      const executeMock = vi.spyOn(provider, '_executeRequest');
      const langError = new Error('The source language is not valid');
      
      executeMock
        .mockRejectedValueOnce(langError)
        .mockImplementationOnce(async (opts) => {
          return opts.extractResponse([{ translations: [{ text: 'سلام' }] }]);
        });

      const result = await provider._translateChunk(['Hello'], 'invalid-lang', 'fa', 'selection', null);

      expect(result).toEqual(['سلام']);
      expect(executeMock).toHaveBeenCalledTimes(2);
      
      // Verify retry URL doesn't have 'from'
      const secondCallUrl = new URL(executeMock.mock.calls[1][0].url);
      expect(secondCallUrl.searchParams.has('from')).toBe(false);
    });
  });
});
