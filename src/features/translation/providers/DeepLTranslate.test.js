import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeepLTranslateProvider } from './DeepLTranslate.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { ApiKeyManager } from './ApiKeyManager.js';
import { ProviderRequestEngine } from './utils/ProviderRequestEngine.js';
import { getProviderLanguageCode } from '@/shared/config/languageConstants.js';

const deeplConfigMocks = vi.hoisted(() => ({
  getApiKeys: vi.fn(),
  getApiTier: vi.fn(),
  getFormality: vi.fn(),
  getBetaLanguagesEnabled: vi.fn(),
  getFreeApiUrl: vi.fn(),
  getProApiUrl: vi.fn(),
  getAIContextEnabled: vi.fn(),
  getAIHistoryEnabled: vi.fn(),
}));

vi.mock('@/shared/config/config.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getDeeplApiKeysAsync: deeplConfigMocks.getApiKeys,
    getDeeplApiTierAsync: deeplConfigMocks.getApiTier,
    getDeeplFormalityAsync: deeplConfigMocks.getFormality,
    getDeeplBetaLanguagesEnabledAsync: deeplConfigMocks.getBetaLanguagesEnabled,
    getDeeplFreeApiUrlAsync: deeplConfigMocks.getFreeApiUrl,
    getDeeplProApiUrlAsync: deeplConfigMocks.getProApiUrl,
    getAIContextTranslationEnabledAsync: deeplConfigMocks.getAIContextEnabled,
    getAIConversationHistoryEnabledAsync: deeplConfigMocks.getAIHistoryEnabled,
  };
});

vi.mock('webextension-polyfill', () => ({ default: { storage: { local: { get: vi.fn(), set: vi.fn() } } } }));
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ init: vi.fn(), debug: vi.fn(), debugLazy: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

const proxyFetch = vi.hoisted(() => vi.fn());
vi.mock('@/shared/proxy/ProxyManager.js', () => ({
  proxyManager: { fetch: proxyFetch, setConfig: vi.fn() },
}));

const createJsonResponse = (status, body, statusText = `HTTP ${status}`) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText,
  headers: new Map([['content-type', 'application/json']]),
  clone() { return this; },
  json: async () => body,
});

const createMalformedJsonResponse = () => {
  const createResponse = () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    clone: createResponse,
    json: async () => {
      throw new SyntaxError('Unexpected token in JSON');
    },
  });

  return createResponse();
};

describe('DeepLTranslateProvider response contract', () => {
  let provider;

  beforeEach(() => {
    proxyFetch.mockReset();
    deeplConfigMocks.getApiKeys.mockReset().mockResolvedValue(['key']);
    deeplConfigMocks.getApiTier.mockReset().mockResolvedValue('free');
    deeplConfigMocks.getFormality.mockReset().mockResolvedValue('default');
    deeplConfigMocks.getBetaLanguagesEnabled.mockReset().mockResolvedValue(false);
    deeplConfigMocks.getFreeApiUrl.mockReset().mockResolvedValue('https://api-free.deepl.test/translate');
    deeplConfigMocks.getProApiUrl.mockReset().mockResolvedValue('https://api.deepl.test/translate');
    deeplConfigMocks.getAIContextEnabled.mockReset().mockResolvedValue(false);
    deeplConfigMocks.getAIHistoryEnabled.mockReset().mockResolvedValue(false);
    provider = new DeepLTranslateProvider();
    vi.spyOn(provider, '_getConfig').mockResolvedValue({
      apiKey: 'key',
      apiTier: 'free',
      apiUrl: 'https://api.deepl.test',
    });
    vi.spyOn(provider, '_initializeProxy').mockResolvedValue(null);
  });

  const runWithRuntime = async (keys, apiTier, callback) => {
    const apiKey = keys.find(key => apiTier === 'pro' ? !key.endsWith(':fx') : true) || '';
    const apiUrl = apiTier === 'pro'
      ? 'https://api.deepl.test/translate'
      : 'https://api-free.deepl.test/translate';
    provider._getConfig.mockResolvedValue({ apiKey, apiTier, apiUrl });

    const getKeysSpy = vi.spyOn(ApiKeyManager, 'getKeys').mockResolvedValue(keys);
    const promoteKeySpy = vi.spyOn(ApiKeyManager, 'promoteKey').mockResolvedValue();
    const executeRequestSpy = vi.spyOn(provider, '_executeRequest')
      .mockImplementation(params => ProviderRequestEngine.executeRequest(provider, params));

    try {
      return await callback({ apiUrl, getKeysSpy, promoteKeySpy, executeRequestSpy });
    } finally {
      getKeysSpy.mockRestore();
      promoteKeySpy.mockRestore();
      executeRequestSpy.mockRestore();
    }
  };

  describe('language mapping', () => {
    it.each([
      ['zh', 'ZH'],
      ['zh-cn', 'ZH'],
      ['zh-tw', 'ZH'],
      ['zh-Hans', 'ZH'],
      ['zh-Hant', 'ZH'],
    ])('maps Chinese source %s to %s in the request body', async (sourceLang, expectedSource) => {
      await runWithRuntime(['key'], 'free', async () => {
        proxyFetch.mockResolvedValue(createJsonResponse(200, { translations: [{ text: 'translated' }] }, 'OK'));

        await expect(provider._translateChunk(['source'], sourceLang, 'en', 'selection', null, 0, 1, 0, 1, {}))
          .resolves.toEqual(['translated']);

        const body = proxyFetch.mock.calls[0][1].body;
        expect(body.get('source_lang')).toBe(expectedSource);
      });
    });

    it.each([
      ['zh', 'ZH'],
      ['zh-cn', 'ZH-HANS'],
      ['zh-tw', 'ZH-HANT'],
    ])('maps Chinese target %s to %s in the request body', async (targetLang, expectedTarget) => {
      await runWithRuntime(['key'], 'free', async () => {
        proxyFetch.mockResolvedValue(createJsonResponse(200, { translations: [{ text: 'translated' }] }, 'OK'));

        await expect(provider._translateChunk(['source'], 'en', targetLang, 'selection', null, 0, 1, 0, 1, {}))
          .resolves.toEqual(['translated']);

        const body = proxyFetch.mock.calls[0][1].body;
        expect(body.get('target_lang')).toBe(expectedTarget);
      });
    });

    it.each([
      ['en', 'de'],
      ['fa', 'en'],
      ['ar', 'en'],
      ['de', 'en'],
    ])('preserves pre-directional mapping for %s to %s', async (sourceLang, targetLang) => {
      const expectedSource = getProviderLanguageCode(sourceLang, 'DEEPL');
      const expectedTarget = getProviderLanguageCode(targetLang, 'DEEPL');

      await runWithRuntime(['key'], 'free', async () => {
        proxyFetch.mockResolvedValue(createJsonResponse(200, { translations: [{ text: 'translated' }] }, 'OK'));

        await expect(provider._translateChunk(['source'], sourceLang, targetLang, 'selection', null, 0, 1, 0, 1, {}))
          .resolves.toEqual(['translated']);

        const body = proxyFetch.mock.calls[0][1].body;
        expect(body.get('source_lang')).toBe(expectedSource);
        expect(body.get('target_lang')).toBe(expectedTarget);
      });
    });

    it('omits source_lang for auto-detection', async () => {
      await runWithRuntime(['key'], 'free', async () => {
        proxyFetch.mockResolvedValue(createJsonResponse(200, { translations: [{ text: 'translated' }] }, 'OK'));

        await expect(provider._translateChunk(['source'], 'auto', 'en', 'selection', null, 0, 1, 0, 1, {}))
          .resolves.toEqual(['translated']);

        const body = proxyFetch.mock.calls[0][1].body;
        expect(body.has('source_lang')).toBe(false);
      });
    });
  });

  describe('runtime key policy', () => {
    it('selects first Pro-compatible key without changing endpoint tier', async () => {
      provider._getConfig.mockRestore();
      deeplConfigMocks.getApiKeys.mockResolvedValue(['free-key:fx', 'pro-key-1', 'pro-key-2']);
      deeplConfigMocks.getApiTier.mockResolvedValue('pro');

      await expect(provider._getConfig()).resolves.toEqual({
        apiKey: 'pro-key-1',
        apiTier: 'pro',
        apiUrl: 'https://api.deepl.test/translate',
      });
    });

    it('returns missing-key configuration when Pro has no compatible keys', async () => {
      provider._getConfig.mockRestore();
      deeplConfigMocks.getApiKeys.mockResolvedValue(['free-key:fx']);
      deeplConfigMocks.getApiTier.mockResolvedValue('pro');

      await expect(provider._getConfig()).resolves.toMatchObject({
        apiKey: '',
        apiTier: 'pro',
        apiUrl: 'https://api.deepl.test/translate',
      });
    });

    it('keeps unsuffixed and :fx keys eligible for Free tier', () => {
      const context = { apiTier: 'free' };

      expect(provider.isApiKeyCandidateEligible('free-key:fx', context)).toBe(true);
      expect(provider.isApiKeyCandidateEligible('unsuffixed-key', context)).toBe(true);
    });

    it('rejects only :fx keys for Pro tier candidates', () => {
      const context = { apiTier: 'pro' };

      expect(provider.isApiKeyCandidateEligible('free-key:fx', context)).toBe(false);
      expect(provider.isApiKeyCandidateEligible('pro-key', context)).toBe(true);
    });

    it.each([
      [401, ErrorTypes.API_KEY_INVALID, true],
      [401, ErrorTypes.HTTP_ERROR, false],
      [403, ErrorTypes.FORBIDDEN_ERROR, false],
      [456, ErrorTypes.DEEPL_QUOTA_EXCEEDED, false],
      [429, ErrorTypes.RATE_LIMIT_REACHED, false],
      [529, ErrorTypes.RATE_LIMIT_REACHED, false],
      [500, ErrorTypes.SERVER_ERROR, false],
      [undefined, ErrorTypes.NETWORK_ERROR, false],
    ])('rotates only canonical HTTP 401 API_KEY_INVALID errors', (statusCode, type, expected) => {
      expect(provider.shouldFailoverApiKey({ statusCode, type })).toBe(expected);
    });
  });

  describe('runtime failover', () => {
    it('rotates invalid first key, preserves request, and promotes successful key', async () => {
      await runWithRuntime(['bad-key', 'good-key'], 'free', async ({ apiUrl, promoteKeySpy }) => {
        proxyFetch
          .mockResolvedValueOnce(createJsonResponse(401, { detail: 'Invalid API key' }, 'Unauthorized'))
          .mockResolvedValueOnce(createJsonResponse(200, { translations: [{ text: 'translated' }] }, 'OK'));

        await expect(provider._translateChunk(['source'], 'en', 'fa', 'selection', null, 0, 1, 0, 1, {}))
          .resolves.toEqual(['translated']);

        expect(proxyFetch).toHaveBeenCalledTimes(2);
        const firstRequest = proxyFetch.mock.calls[0];
        const secondRequest = proxyFetch.mock.calls[1];
        expect(firstRequest[0]).toBe(apiUrl);
        expect(secondRequest[0]).toBe(apiUrl);
        expect(firstRequest[1].headers.Authorization).toBe('DeepL-Auth-Key bad-key');
        expect(secondRequest[1].headers.Authorization).toBe('DeepL-Auth-Key good-key');
        expect(secondRequest[1].body).toBe(firstRequest[1].body);
        expect(promoteKeySpy).toHaveBeenCalledWith('DEEPL_API_KEY', 'good-key');
      });
    });

    it('preserves API_KEY_INVALID after all compatible keys fail', async () => {
      await runWithRuntime(['bad-key-1', 'bad-key-2'], 'free', async ({ promoteKeySpy }) => {
        proxyFetch
          .mockResolvedValueOnce(createJsonResponse(401, { detail: 'Invalid API key' }, 'Unauthorized'))
          .mockResolvedValueOnce(createJsonResponse(401, { detail: 'Invalid API key' }, 'Unauthorized'));

        await expect(provider._translateChunk(['source'], 'en', 'fa', 'selection', null, 0, 1, 0, 1, {}))
          .rejects.toMatchObject({ type: ErrorTypes.API_KEY_INVALID, statusCode: 401 });

        expect(proxyFetch).toHaveBeenCalledTimes(2);
        expect(promoteKeySpy).not.toHaveBeenCalled();
      });
    });

    it.each([
      [403, ErrorTypes.FORBIDDEN_ERROR, 'Forbidden'],
      [456, ErrorTypes.DEEPL_QUOTA_EXCEEDED, 'Quota exceeded'],
      [429, ErrorTypes.RATE_LIMIT_REACHED, 'Too Many Requests'],
      [529, ErrorTypes.RATE_LIMIT_REACHED, 'Too Many Requests'],
      [400, ErrorTypes.HTTP_ERROR, 'Invalid parameter'],
      [422, ErrorTypes.HTTP_ERROR, 'Invalid parameter'],
      [500, ErrorTypes.SERVER_ERROR, 'Internal Server Error'],
    ])('does not rotate DeepL key for HTTP %s', async (statusCode, type, message) => {
      await runWithRuntime(['first-key', 'second-key'], 'free', async ({ promoteKeySpy }) => {
        proxyFetch.mockResolvedValue(createJsonResponse(statusCode, { detail: message }, message));

        await expect(provider._translateChunk(['source'], 'en', 'fa', 'selection', null, 0, 1, 0, 1, {}))
          .rejects.toMatchObject({ type, statusCode });

        expect(proxyFetch).toHaveBeenCalledTimes(1);
        expect(promoteKeySpy).not.toHaveBeenCalled();
      });
    });

    it('does not rotate network failures', async () => {
      await runWithRuntime(['first-key', 'second-key'], 'free', async ({ promoteKeySpy }) => {
        proxyFetch.mockRejectedValue(new TypeError('NetworkError: Failed to fetch'));

        await expect(provider._translateChunk(['source'], 'en', 'fa', 'selection', null, 0, 1, 0, 1, {}))
          .rejects.toMatchObject({ type: ErrorTypes.NETWORK_ERROR });

        expect(proxyFetch).toHaveBeenCalledTimes(1);
        expect(promoteKeySpy).not.toHaveBeenCalled();
      });
    });

    it('skips :fx keys for Pro while keeping endpoint fixed', async () => {
      await runWithRuntime(['free-key:fx', 'pro-key-1', 'pro-key-2'], 'pro', async ({ apiUrl, promoteKeySpy }) => {
        proxyFetch
          .mockResolvedValueOnce(createJsonResponse(401, { detail: 'Invalid API key' }, 'Unauthorized'))
          .mockResolvedValueOnce(createJsonResponse(200, { translations: [{ text: 'translated' }] }, 'OK'));

        await expect(provider._translateChunk(['source'], 'en', 'fa', 'selection', null, 0, 1, 0, 1, {}))
          .resolves.toEqual(['translated']);

        expect(proxyFetch).toHaveBeenCalledTimes(2);
        expect(proxyFetch.mock.calls[0][0]).toBe(apiUrl);
        expect(proxyFetch.mock.calls[1][0]).toBe(apiUrl);
        expect(proxyFetch.mock.calls[0][1].headers.Authorization).toBe('DeepL-Auth-Key pro-key-1');
        expect(proxyFetch.mock.calls[1][1].headers.Authorization).toBe('DeepL-Auth-Key pro-key-2');
        expect(promoteKeySpy).toHaveBeenCalledWith('DEEPL_API_KEY', 'pro-key-2');
      });
    });

    it('isolates tier context across concurrent requests on one provider instance', async () => {
      const keys = ['free-key:fx', 'pro-key-1', 'pro-key-2'];
      const keyReadResolvers = [];
      let resolveBothKeyReads;
      const bothKeyReads = new Promise(resolve => {
        resolveBothKeyReads = resolve;
      });
      const getKeysSpy = vi.spyOn(ApiKeyManager, 'getKeys').mockImplementation(() => new Promise(resolve => {
        keyReadResolvers.push(resolve);
        if (keyReadResolvers.length === 2) resolveBothKeyReads();
      }));
      const promoteKeySpy = vi.spyOn(ApiKeyManager, 'promoteKey').mockResolvedValue();
      const eligibilitySpy = vi.spyOn(provider, 'isApiKeyCandidateEligible');
      provider._getConfig
        .mockResolvedValueOnce({
          apiKey: 'pro-key-1',
          apiTier: 'pro',
          apiUrl: 'https://api.deepl.test/translate',
        })
        .mockResolvedValueOnce({
          apiKey: 'free-key:fx',
          apiTier: 'free',
          apiUrl: 'https://api-free.deepl.test/translate',
        });

      const attempts = new Map();
      proxyFetch.mockImplementation(async (_url, options) => {
        const source = options.body.get('text');
        const attempt = (attempts.get(source) || 0) + 1;
        attempts.set(source, attempt);
        const authorization = options.headers.Authorization;

        if (source === 'pro-source' && authorization === 'DeepL-Auth-Key pro-key-1' && attempt === 1) {
          return createJsonResponse(401, { detail: 'Invalid API key' }, 'Unauthorized');
        }
        if (source === 'pro-source' && authorization === 'DeepL-Auth-Key pro-key-2') {
          return createJsonResponse(200, { translations: [{ text: 'pro-translated' }] }, 'OK');
        }
        if (source === 'free-source' && authorization === 'DeepL-Auth-Key free-key:fx' && attempt === 1) {
          return createJsonResponse(401, { detail: 'Invalid API key' }, 'Unauthorized');
        }
        if (source === 'free-source' && authorization === 'DeepL-Auth-Key pro-key-1') {
          return createJsonResponse(200, { translations: [{ text: 'free-translated' }] }, 'OK');
        }

        throw new Error(`Unexpected ${source} request authorization: ${authorization}`);
      });

      const proRequest = provider._translateChunk(['pro-source'], 'en', 'fa', 'selection', null, 0, 1, 0, 1, {});
      const freeRequest = provider._translateChunk(['free-source'], 'en', 'fa', 'selection', null, 0, 1, 0, 1, {});

      try {
        await bothKeyReads;

        // Resolve Free first while Pro remains suspended at key retrieval.
        keyReadResolvers[1](keys);
        await expect(freeRequest).resolves.toEqual(['free-translated']);

        keyReadResolvers[0](keys);
        await expect(proRequest).resolves.toEqual(['pro-translated']);

        expect(eligibilitySpy).toHaveBeenCalledWith('free-key:fx', { apiTier: 'pro' });
        expect(eligibilitySpy).toHaveBeenCalledWith('free-key:fx', { apiTier: 'free' });
        expect(proxyFetch.mock.calls
          .filter(([, options]) => options.body.get('text') === 'pro-source')
          .map(([, options]) => options.headers.Authorization))
          .toEqual(['DeepL-Auth-Key pro-key-1', 'DeepL-Auth-Key pro-key-2']);
        expect(proxyFetch.mock.calls
          .filter(([, options]) => options.body.get('text') === 'free-source')
          .map(([, options]) => options.headers.Authorization))
          .toEqual(['DeepL-Auth-Key free-key:fx', 'DeepL-Auth-Key pro-key-1']);
        expect(promoteKeySpy).toHaveBeenCalledWith('DEEPL_API_KEY', 'pro-key-2');
        expect(promoteKeySpy).toHaveBeenCalledWith('DEEPL_API_KEY', 'pro-key-1');
      } finally {
        getKeysSpy.mockRestore();
        promoteKeySpy.mockRestore();
        eligibilitySpy.mockRestore();
      }
    });

    it('fails safely without a request when Pro has only :fx keys', async () => {
      provider._getConfig.mockResolvedValue({
        apiKey: '',
        apiTier: 'pro',
        apiUrl: 'https://api.deepl.test/translate',
      });

      await expect(provider._translateChunk(['source'], 'en', 'fa', 'selection', null, 0, 1, 0, 1, {}))
        .rejects.toMatchObject({ type: ErrorTypes.API_KEY_MISSING });
      expect(proxyFetch).not.toHaveBeenCalled();
    });

    it('keeps :fx as the first eligible Free-tier key', async () => {
      await runWithRuntime(['free-key:fx', 'unsuffixed-key'], 'free', async () => {
        proxyFetch.mockResolvedValue(createJsonResponse(200, { translations: [{ text: 'translated' }] }, 'OK'));

        await expect(provider._translateChunk(['source'], 'en', 'fa', 'selection', null, 0, 1, 0, 1, {}))
          .resolves.toEqual(['translated']);

        expect(proxyFetch).toHaveBeenCalledTimes(1);
        expect(proxyFetch.mock.calls[0][1].headers.Authorization).toBe('DeepL-Auth-Key free-key:fx');
      });
    });

    it('resolves a fresh proxy snapshot for each physical key attempt', async () => {
      const firstProxy = { enabled: true, host: 'proxy-first' };
      const secondProxy = { enabled: true, host: 'proxy-second' };
      provider._initializeProxy
        .mockReset()
        .mockResolvedValueOnce(firstProxy)
        .mockResolvedValueOnce(secondProxy);

      await runWithRuntime(['bad-key', 'good-key'], 'free', async () => {
        proxyFetch
          .mockResolvedValueOnce(createJsonResponse(401, { detail: 'Invalid API key' }, 'Unauthorized'))
          .mockResolvedValueOnce(createJsonResponse(200, { translations: [{ text: 'translated' }] }, 'OK'));

        await expect(provider._translateChunk(['source'], 'en', 'fa', 'selection', null, 0, 1, 0, 1, {}))
          .resolves.toEqual(['translated']);

        expect(provider._initializeProxy).toHaveBeenCalledTimes(2);
        expect(proxyFetch.mock.calls[0][2]).toBe(firstProxy);
        expect(proxyFetch.mock.calls[1][2]).toBe(secondProxy);
      });
    });

    it('stops before second key when cancellation follows first failure', async () => {
      const abortController = new AbortController();

      await runWithRuntime(['bad-key', 'good-key'], 'free', async ({ promoteKeySpy }) => {
        proxyFetch.mockImplementationOnce(async () => {
          abortController.abort('user-cancelled');
          return createJsonResponse(401, { detail: 'Invalid API key' }, 'Unauthorized');
        });

        await expect(provider._translateChunk(['source'], 'en', 'fa', 'selection', abortController, 0, 1, 0, 1, {}))
          .rejects.toMatchObject({ type: ErrorTypes.USER_CANCELLED });

        expect(proxyFetch).toHaveBeenCalledTimes(1);
        expect(promoteKeySpy).not.toHaveBeenCalled();
      });
    });
  });

  const translate = async (response, texts = ['source'], options = {}) => {
    vi.spyOn(provider, '_executeRequest').mockImplementation(async (options) => options.extractResponse(response));
    return provider._translateChunk(texts, 'en', 'fa', 'selection', null, 0, texts.length, 0, 1, options);
  };

  const requestSizeError = (message = 'HTTP 400: request is too long', statusCode = 400) => Object.assign(
    new Error(message),
    { type: ErrorTypes.HTTP_ERROR, statusCode },
  );

  it('accepts valid source-equal output', async () => {
    await expect(translate({ translations: [{ text: 'URL' }] }, ['URL'])).resolves.toEqual(['URL']);
  });

  it('returns ordered valid multi-item translations with blank input preserved', async () => {
    await expect(translate({ translations: [{ text: 'one translated' }, { text: 'two translated' }] }, ['one', ' ', 'two']))
      .resolves.toEqual(['one translated', '', 'two translated']);
  });

  it('writes one detected source when all reported sources agree', async () => {
    const options = { providerMetadataRef: { metadata: {} } };

    await translate({
      translations: [
        { text: 'one translated', detected_source_language: 'EN' },
        { text: 'two translated', detected_source_language: 'en' },
      ],
    }, ['one', 'two'], options);

    expect(options.providerMetadataRef.metadata.detectedLanguage).toBe('en');
    expect(provider).not.toHaveProperty('lastDetectedLanguage');
  });

  it('does not publish conflicting or missing detected sources', async () => {
    const conflictingOptions = { providerMetadataRef: { metadata: {} } };
    await translate({
      translations: [
        { text: 'one translated', detected_source_language: 'en' },
        { text: 'two translated', detected_source_language: 'de' },
      ],
    }, ['one', 'two'], conflictingOptions);
    expect(conflictingOptions.providerMetadataRef.metadata).toEqual({});

    const missingOptions = { providerMetadataRef: { metadata: {} } };
    await translate({ translations: [{ text: 'translated' }] }, ['source'], missingOptions);
    expect(missingOptions.providerMetadataRef.metadata).toEqual({});
  });

  it.each([
    ['missing translations', {}],
    ['blank item', { translations: [{ text: '  ' }] }],
    ['wrong cardinality', { translations: [{ text: 'one' }] }],
  ])('throws API_RESPONSE_INVALID for %s', async (_label, response) => {
    const options = { providerMetadataRef: { metadata: {} } };
    await expect(translate(response, ['one', 'two'], options)).rejects.toMatchObject({ type: ErrorTypes.API_RESPONSE_INVALID });
    expect(options.providerMetadataRef.metadata).toEqual({});
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty array', []],
  ])('rejects unexpected final %s result with API_RESPONSE_INVALID', async (_label, response) => {
    vi.spyOn(provider, '_executeRequest').mockResolvedValue(response);

    await expect(provider._translateChunk(['source'], 'en', 'fa', 'selection', null, 0, 1, 0, 1, {}))
      .rejects.toMatchObject({ type: ErrorTypes.API_RESPONSE_INVALID });
  });

  it.each([
    [ErrorTypes.NETWORK_ERROR],
    [ErrorTypes.USER_CANCELLED],
    [ErrorTypes.TRANSLATION_TIMEOUT],
  ])('preserves %s failures from transport', async (type) => {
    const error = Object.assign(new Error(type), { type });
    vi.spyOn(provider, '_executeRequest').mockRejectedValue(error);

    await expect(provider._translateChunk(['source'], 'en', 'fa', 'selection', null, 0, 1, 0, 1, {}))
      .rejects.toMatchObject({ type });
  });

  it('rejects malformed successful JSON without key failover or source substitution', async () => {
    await runWithRuntime(['bad-key', 'good-key'], 'free', async ({ promoteKeySpy, executeRequestSpy }) => {
      proxyFetch.mockResolvedValue(createMalformedJsonResponse());

      await expect(provider._translateChunk(['source'], 'en', 'fa', 'selection', null, 0, 1, 0, 1, {}))
        .rejects.toMatchObject({
          type: ErrorTypes.JSON_PARSING_ERROR,
          statusCode: 200,
          providerName: 'DeepLTranslate',
        });

      expect(proxyFetch).toHaveBeenCalledTimes(1);
      expect(executeRequestSpy).toHaveBeenCalledTimes(1);
      expect(promoteKeySpy).not.toHaveBeenCalled();
    });
  });

  it.each([
    [529, ErrorTypes.RATE_LIMIT_REACHED, 'Too Many Requests'],
    [500, ErrorTypes.SERVER_ERROR, 'Internal Server Error'],
    [400, ErrorTypes.HTTP_ERROR, 'Bad Request'],
  ])('classifies DeepL HTTP %s as %s while preserving request metadata', async (statusCode, type, statusText) => {
    proxyFetch.mockResolvedValue({
      ok: false,
      status: statusCode,
      statusText,
      headers: { get: () => 'application/json' },
      clone() { return this; },
      json: async () => ({ message: statusText }),
    });

    await expect(provider._translateChunk(['source'], 'en', 'fa', 'selection', null, 0, 1, 0, 1, {}))
      .rejects.toMatchObject({
        type,
        statusCode,
        context: 'deepltranslate-translate-chunk',
        providerName: 'DeepLTranslate',
      });
  });

  it.each([
    ['source_lang', "Bad request. Reason: Value for 'source_lang' not supported."],
    ['target_lang', "Bad request. Reason: Value for 'target_lang' not supported."],
  ])('classifies unsupported %s as LANGUAGE_PAIR_NOT_SUPPORTED without fallback', async (_languageField, message) => {
    await runWithRuntime(['first-key', 'second-key'], 'free', async ({ promoteKeySpy }) => {
      proxyFetch.mockResolvedValue(createJsonResponse(400, { detail: message }, 'Bad Request'));

      await expect(provider._translateChunk(
        ['first', 'second'],
        'en',
        'de',
        'selection',
        null,
        0,
        2,
        0,
        1,
        {},
      )).rejects.toMatchObject({
        type: ErrorTypes.LANGUAGE_PAIR_NOT_SUPPORTED,
        statusCode: 400,
        context: 'deepltranslate-translate-chunk',
        providerName: 'DeepLTranslate',
        message,
      });

      expect(proxyFetch).toHaveBeenCalledTimes(1);
      expect(promoteKeySpy).not.toHaveBeenCalled();
    });
  });

  it('rejects the parent when a recursive HTTP-400 split child fails', async () => {
    const http400 = requestSizeError();
    let calls = 0;
    vi.spyOn(provider, '_executeRequest').mockImplementation(async (options) => {
      calls++;
      if (calls === 1 || calls === 3) throw http400;
      return options.extractResponse({ translations: [{ text: 'first translated' }] });
    });

    await expect(provider._translateChunk(['first', 'second'], 'en', 'fa', 'selection', null, 0, 2, 0, 1, {}))
      .rejects.toThrow('HTTP 400');
    expect(calls).toBe(3);
  });

  it('rejects the parent when a sequential fallback item fails', async () => {
    const http400 = requestSizeError();
    const network = Object.assign(new Error('network failed'), { type: ErrorTypes.NETWORK_ERROR });
    let calls = 0;
    vi.spyOn(provider, '_executeRequest').mockImplementation(async (options) => {
      calls++;
      if (calls === 1) throw http400;
      if (calls === 2) return options.extractResponse({ translations: [{ text: 'first translated' }] });
      throw network;
    });

    await expect(provider._translateChunk(['first', 'second'], 'en', 'fa', 'selection', null, 3, 2, 0, 1, {}))
      .rejects.toMatchObject({ type: ErrorTypes.NETWORK_ERROR });
    expect(calls).toBe(3);
  });

  it('does not split generic HTTP 400 without request-size evidence', async () => {
    const error = Object.assign(new Error('Invalid parameter'), {
      type: ErrorTypes.HTTP_ERROR,
      statusCode: 400,
      providerName: 'DeepLTranslate',
    });
    let calls = 0;
    vi.spyOn(provider, '_executeRequest').mockImplementation(async () => {
      calls++;
      throw error;
    });

    await expect(provider._translateChunk(['first', 'second'], 'en', 'fa', 'selection', null, 0, 2, 0, 1, {}))
      .rejects.toBe(error);
    expect(calls).toBe(1);
  });

  it.each([
    [ErrorTypes.API_KEY_INVALID, 401],
    [ErrorTypes.TEXT_EMPTY, 400],
  ])('does not split deterministic %s errors', async (type, statusCode) => {
    const error = Object.assign(new Error('HTTP 400: deterministic failure'), {
      type,
      statusCode,
    });
    let calls = 0;
    vi.spyOn(provider, '_executeRequest').mockImplementation(async () => {
      calls++;
      throw error;
    });

    await expect(provider._translateChunk(['first', 'second'], 'en', 'fa', 'selection', null, 0, 2, 0, 1, {}))
      .rejects.toBe(error);
    expect(calls).toBe(1);
  });

  it('does not split a single-item request-size failure', async () => {
    const error = requestSizeError();
    let calls = 0;
    vi.spyOn(provider, '_executeRequest').mockImplementation(async () => {
      calls++;
      throw error;
    });

    await expect(provider._translateChunk(['single'], 'en', 'fa', 'selection', null, 0, 1, 0, 1, {}))
      .rejects.toBe(error);
    expect(calls).toBe(1);
  });

  it.each([400, 422])('recovers from a top-level request-size message on HTTP %s', async (statusCode) => {
    const response = (status, body, statusText) => ({
      ok: status >= 200 && status < 300,
      status,
      statusText,
      headers: { get: () => 'application/json' },
      clone() { return this; },
      json: async () => body,
    });

    proxyFetch
      .mockResolvedValueOnce(response(statusCode, { message: 'HTTP request is too long' }, 'Bad Request'))
      .mockResolvedValue(response(200, { translations: [{ text: 'translated' }] }, 'OK'));

    await expect(provider._translateChunk(
      ['first', 'second'],
      'en',
      'fa',
      'selection',
      null,
      0,
      2,
      0,
      1,
      {},
    )).resolves.toEqual(['translated', 'translated']);

    expect(proxyFetch).toHaveBeenCalledTimes(3);
  });

  it('accepts a response that preserves prepared XML placeholders', async () => {
    vi.spyOn(provider, '_executeRequest').mockImplementation(async (options) => {
      expect(options.fetchOptions.body.getAll('text')).toEqual(['before <x id="SUB_TOKEN" /> after']);
      return options.extractResponse({ translations: [{ text: 'translated <x id="SUB_TOKEN" /> text' }] });
    });

    await expect(provider._translateChunk(['before @@SUB_TOKEN@@ after'], 'en', 'fa', 'selection', null, 0, 1, 0, 1, {}))
      .resolves.toEqual(['translated @@SUB_TOKEN@@text']);
  });

  it('rejects XML placeholder corruption without returning source text', async () => {
    vi.spyOn(provider, '_executeRequest').mockImplementation(async (options) =>
      options.extractResponse({ translations: [{ text: 'translated text without placeholder' }] })
    );

    await expect(provider._translateChunk(['before @@SUB_TOKEN@@ after'], 'en', 'fa', 'selection', null, 0, 1, 0, 1, {}))
      .rejects.toMatchObject({ type: ErrorTypes.API_RESPONSE_INVALID });
  });
});
