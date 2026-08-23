import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BingTranslateProvider } from './BingTranslate.js';
import { ProviderNames } from '@/features/translation/providers/ProviderConstants.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { getProviderConfiguration } from '@/features/translation/core/ProviderConfigurations.js';

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
    debugLazy: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    init: vi.fn(),
    operation: vi.fn(),
    performance: vi.fn(),
  }),
}));

const proxyFetch = vi.hoisted(() => vi.fn());
vi.mock('@/shared/proxy/ProxyManager.js', () => ({
  proxyManager: {
    fetch: proxyFetch,
    setConfig: vi.fn(),
  },
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
  const defaultProviderConfig = {
    rateLimit: { maxConcurrent: 1, delayBetweenRequests: 0 },
    batching: { strategy: 'character_limit', characterLimit: 1000, maxChunksPerBatch: 10 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getProviderConfiguration.mockReturnValue(defaultProviderConfig);
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

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should initialize with correct name', () => {
    expect(provider.providerName).toBe(ProviderNames.BING_TRANSLATE);
  });

  it('resetSessionContext clears shared cached token state', () => {
    BingTranslateProvider.bingAccessToken = {
      token: 'cached-token',
      tokenTs: Date.now(),
      tokenExpiryInterval: 60000,
      count: 3,
    };

    provider.resetSessionContext();

    expect(BingTranslateProvider.bingAccessToken).toBeNull();
  });

  it('should correctly map language codes', () => {
    expect(provider._getLangCode('auto')).toBe('auto-detect');
    expect(provider._getLangCode('en')).toBe('en');
    expect(provider._getLangCode('fa')).toBe('fa');
  });

  describe('_translateChunk', () => {
    const runResponse = (response, options) => {
      provider._executeApiCall.mockImplementation(async (request) => request.extractResponse({
        headers: { get: () => 'application/json' },
        text: () => Promise.resolve(JSON.stringify(response)),
      }));
      return provider._translateChunk(['Hello'], 'en', 'fa', 'selection', null, 0, 1, 0, 1, options);
    };

    it('writes valid response detection into execution metadata', async () => {
      const options = { providerMetadataRef: { metadata: {} } };
      await runResponse([
        { translations: [{ text: 'translated' }], detectedLanguage: { language: 'en' } },
      ], options);

      expect(options.providerMetadataRef.metadata.detectedLanguage).toBe('en');
      expect(provider).not.toHaveProperty('lastDetectedLanguage');
    });

    it('does not write missing or invalid response detection', async () => {
      const missingOptions = { providerMetadataRef: { metadata: {} } };
      await runResponse([
        { translations: [{ text: 'translated' }] },
      ], missingOptions);
      expect(missingOptions.providerMetadataRef.metadata).toEqual({});

      const invalidOptions = { providerMetadataRef: { metadata: {} } };
      await expect(runResponse([
        { detectedLanguage: { language: 'en' } },
      ], invalidOptions))
        .rejects.toMatchObject({ type: 'API_RESPONSE_INVALID' });
      expect(invalidOptions.providerMetadataRef.metadata).toEqual({});
    });

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

    it.each([
      ['document-replaced', { operationAborted: true, cancellationReason: 'document-replaced' }],
      ['user-cancelled', { type: ErrorTypes.USER_CANCELLED }],
    ])('preserves %s provenance when abort occurs after token acquisition', async (reason, expectedError) => {
      const controller = new AbortController();
      provider._getBingAccessToken.mockImplementation(async () => {
        controller.abort(reason);
        return { token: 'token', key: 'key', IG: 'ig', IID: 'iid' };
      });

      let caughtError;
      try {
        await provider._translateChunk(
          ['Hello'], 'en', 'fa', 'selection', controller, 0, 1, 0, 1
        );
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toMatchObject(expectedError);
      if (reason === 'document-replaced') {
        expect(caughtError.type).not.toBe(ErrorTypes.USER_CANCELLED);
      }
      expect(provider._executeApiCall).not.toHaveBeenCalled();
    });

    it('should handle API errors and throw API_ERROR', async () => {
      vi.spyOn(provider, '_executeApiCall').mockRejectedValue(new Error('Network error'));
      
      await expect(provider._translateChunk(['text'], 'en', 'fa'))
        .rejects.toThrow();
    });

    it.each([undefined, '', '   '])('throws when Bing response has %p translation text', async (text) => {
      vi.spyOn(provider, '_executeApiCall').mockImplementation(async (options) => options.extractResponse({
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify([{ translations: [{ text }] }])
      }));

      await expect(provider._translateChunk(['source'], 'en', 'fa')).rejects.toMatchObject({ type: 'API_RESPONSE_INVALID' });
    });

    it('accepts a valid Bing translation equal to source', async () => {
      vi.spyOn(provider, '_executeApiCall').mockImplementation(async (options) => options.extractResponse({
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify([{ translations: [{ text: 'URL' }] }])
      }));

      await expect(provider._translateChunk(['URL'], 'en', 'fa')).resolves.toEqual(['URL']);
    });

    it('normalizes application 400 and does not adaptively retry', async () => {
      provider._executeApiCall.mockImplementation(async (request) => request.extractResponse({
        statusCode: 400,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ statusCode: 400 }),
      }));

      await expect(provider._translateChunk(['first', 'second'], 'en', 'fa', 'selection', null, 0, 2, 0, 1))
        .rejects.toMatchObject({
          name: 'BingApiError',
          type: ErrorTypes.HTTP_ERROR,
          statusCode: 400,
        });
      expect(provider._executeApiCall).toHaveBeenCalledTimes(1);
    });

    it('preserves application 400 identity for a single text', async () => {
      let producedError;
      provider._executeApiCall.mockImplementation(async (request) => {
        try {
          return await request.extractResponse({
            statusCode: 400,
            headers: { get: () => 'application/json' },
            text: async () => JSON.stringify({ statusCode: 400 }),
          });
        } catch (error) {
          producedError = error;
          throw error;
        }
      });

      let caughtError;
      try {
        await provider._translateChunk(['single'], 'en', 'fa', 'selection', null, 0, 1, 0, 1);
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toBe(producedError);
      expect(producedError).toMatchObject({
        name: 'BingApiError',
        type: ErrorTypes.HTTP_ERROR,
        statusCode: 400,
      });
      expect(provider._executeApiCall).toHaveBeenCalledTimes(1);
    });

    it('preserves one adaptive retry when maxRetries is one', async () => {
      getProviderConfiguration.mockReturnValue({
        ...defaultProviderConfig,
        batching: { ...defaultProviderConfig.batching, maxRetries: 1 },
      });
      provider._executeApiCall.mockImplementation(async (request) => request.extractResponse({
        headers: { get: () => 'text/html' },
        text: async () => '<html>blocked</html>',
      }));

      await expect(provider._translateChunk(['a', 'b', 'c', 'd'], 'en', 'fa', 'selection', null, 0, 4, 0, 1))
        .rejects.toMatchObject({ name: 'BingHtmlResponseError' });
      expect(provider._executeApiCall).toHaveBeenCalledTimes(2);
    });

    it('keeps default adaptive retry behavior when maxRetries is absent', async () => {
      provider._executeApiCall.mockImplementation(async (request) => request.extractResponse({
        headers: { get: () => 'application/json' },
        text: async () => 'not-json',
      }));

      await expect(provider._translateChunk(['a', 'b', 'c', 'd'], 'en', 'fa', 'selection', null, 0, 4, 0, 1))
        .rejects.toMatchObject({ name: 'BingJsonParseError' });
      expect(provider._executeApiCall).toHaveBeenCalledTimes(3);
    });

    it('keeps transport HTTP 400 canonical identity', async () => {
      provider._executeApiCall.mockRestore();
      proxyFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: { get: () => 'application/json' },
        clone() { return this; },
        json: async () => ({ error: { message: 'Bad Request' } }),
      });

      await expect(provider._translateChunk(['source'], 'en', 'fa', 'selection'))
        .rejects.toMatchObject({ type: ErrorTypes.HTTP_ERROR, statusCode: 400 });
      expect(proxyFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('_getBingAccessToken', () => {
    const createResponse = (status, body = '') => ({
      ok: status >= 200 && status < 300,
      status,
      text: vi.fn().mockResolvedValue(body),
    });

    const validTokenPage = 'IG:"ig-value" EventID:"iid-value" var params_AbusePreventionHelper = ["internal-key","token-value",3600000];';

    beforeEach(() => {
      provider._getBingAccessToken.mockRestore();
      BingTranslateProvider.bingAccessToken = null;
      vi.stubGlobal('fetch', vi.fn());
    });

    it.each([
      [401, ErrorTypes.HTTP_ERROR],
      [403, ErrorTypes.FORBIDDEN_ERROR],
      [429, ErrorTypes.RATE_LIMIT_REACHED],
      [500, ErrorTypes.SERVER_ERROR],
      [503, ErrorTypes.SERVER_ERROR],
    ])('classifies token HTTP %s without API-key semantics', async (status, type) => {
      fetch.mockResolvedValue(createResponse(status));

      await expect(provider._getBingAccessToken())
        .rejects.toMatchObject({
          type,
          statusCode: status,
          context: 'bingtranslate-token-fetch',
        });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('classifies ordinary token fetch rejection as NETWORK_ERROR', async () => {
      fetch.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(provider._getBingAccessToken()).rejects.toMatchObject({
        type: ErrorTypes.NETWORK_ERROR,
        context: 'bingtranslate-token-fetch',
      });
    });

    it.each([
      ['user-cancelled', { type: ErrorTypes.USER_CANCELLED }],
      ['document-replaced', { operationAborted: true, cancellationReason: 'document-replaced' }],
    ])('normalizes pre-aborted %s token request', async (reason, expectedError) => {
      const controller = new AbortController();
      controller.abort(reason);

      await expect(provider._getBingAccessToken(controller)).rejects.toMatchObject(expectedError);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('normalizes an in-flight user abort without API_ERROR', async () => {
      const controller = new AbortController();
      fetch.mockImplementation(async () => {
        controller.abort('user-cancelled');
        throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
      });

      await expect(provider._getBingAccessToken(controller)).rejects.toMatchObject({
        type: ErrorTypes.USER_CANCELLED,
      });
    });

    it.each([
      ['missing markers', 'not a token page'],
      ['malformed params JSON', 'IG:"ig-value" EventID:"iid-value" var params_AbusePreventionHelper = ["key",;'],
      ['missing token value', 'IG:"ig-value" EventID:"iid-value" var params_AbusePreventionHelper = ["key","",3600000];'],
    ])('classifies %s successful response as API_RESPONSE_INVALID and does not cache it', async (_label, body) => {
      fetch.mockResolvedValue(createResponse(200, body));

      await expect(provider._getBingAccessToken()).rejects.toMatchObject({
        type: ErrorTypes.API_RESPONSE_INVALID,
        context: 'bingtranslate-token-fetch',
      });
      expect(BingTranslateProvider.bingAccessToken).toBeNull();
    });

    it('extracts and caches valid token-page data', async () => {
      fetch.mockResolvedValue(createResponse(200, validTokenPage));

      await expect(provider._getBingAccessToken()).resolves.toMatchObject({
        IG: 'ig-value',
        IID: 'iid-value',
        key: 'internal-key',
        token: 'token-value',
        tokenExpiryInterval: 3600000,
      });
      await provider._getBingAccessToken();

      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });
});
