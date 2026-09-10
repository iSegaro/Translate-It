import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CustomProvider,
  clearCustomResponseFormatSupportCache,
  normalizeCustomResponseFormatCacheKey,
} from './CustomProvider.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { proxyManager } from '@/shared/proxy/ProxyManager.js';
import { getCustomApiKeysAsync, getCustomApiUrlAsync, getCustomApiModelAsync } from '@/shared/config/config.js';
import { ResponseFormat } from '@/shared/config/translationConstants.js';

vi.mock('@/shared/proxy/ProxyManager.js', () => ({
  proxyManager: {
    fetch: vi.fn(),
    setConfig: vi.fn(),
    testConnection: vi.fn()
  }
}));

vi.mock('@/shared/config/config.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getCustomApiKeysAsync: vi.fn().mockResolvedValue(['test-key']),
    getCustomApiUrlAsync: vi.fn().mockResolvedValue('https://custom-api.com/v1/chat/completions'),
    getCustomApiModelAsync: vi.fn().mockResolvedValue('custom-model'),
  };
});

vi.mock('@/shared/proxy/ProxySettings.js', () => ({
  getProxySettingsAsync: vi.fn().mockResolvedValue({}),
  resolveProxyConfig: vi.fn().mockResolvedValue({})
}));

const DEFAULT_URL = 'https://custom-api.com/v1/chat/completions';
const DEFAULT_MODEL = 'custom-model';

function unsupportedError(message, statusCode = 400) {
  return Object.assign(new Error(message), {
    statusCode,
    type: ErrorTypes.HTTP_ERROR,
  });
}

function payloadOf(call) {
  return JSON.parse(call[0].fetchOptions.body);
}

describe('CustomProvider response_format capability (Phase 1)', () => {
  let provider;

  beforeEach(() => {
    vi.clearAllMocks();
    clearCustomResponseFormatSupportCache();
    vi.mocked(getCustomApiUrlAsync).mockResolvedValue(DEFAULT_URL);
    vi.mocked(getCustomApiModelAsync).mockResolvedValue(DEFAULT_MODEL);
    vi.mocked(getCustomApiKeysAsync).mockResolvedValue(['test-key']);
    provider = new CustomProvider();
  });

  it.each([
    'Unknown parameter: response_format',
    'response_format is not supported',
    'unsupported response_format',
    "'response_format.type' must be 'json_schema' or 'text'",
  ])('falls back once for classified rejection: %s', async (message) => {
    const executeRequest = vi.spyOn(provider, '_executeRequest')
      .mockRejectedValueOnce(unsupportedError(message, 400))
      .mockResolvedValueOnce('translated');

    await expect(provider._callAI('system', 'source', {
      expectedFormat: ResponseFormat.JSON_OBJECT,
    })).resolves.toBe('translated');

    expect(executeRequest).toHaveBeenCalledTimes(2);
    expect(payloadOf(executeRequest.mock.calls[0])).toHaveProperty('response_format');
    expect(payloadOf(executeRequest.mock.calls[1])).not.toHaveProperty('response_format');
  });

  it('retries LM Studio 400 and marks the endpoint unsupported for reuse', async () => {
    const lmStudio = unsupportedError("'response_format.type' must be 'json_schema' or 'text'", 400);
    const executeRequest = vi.spyOn(provider, '_executeRequest')
      .mockRejectedValueOnce(lmStudio)
      .mockResolvedValue('translated');

    const capabilityRef = { responseFormatUnsupported: false };
    await expect(provider._callAI('system', 'source', {
      expectedFormat: ResponseFormat.JSON_OBJECT,
      customResponseFormatCapabilityRef: capabilityRef,
    })).resolves.toBe('translated');
    expect(capabilityRef.responseFormatUnsupported).toBe(true);

    // Same endpoint + model reuses the cached decision and omits upfront.
    await expect(provider._callAI('system', 'next', {
      expectedFormat: ResponseFormat.JSON_OBJECT,
    })).resolves.toBe('translated');

    expect(executeRequest).toHaveBeenCalledTimes(3);
    expect(payloadOf(executeRequest.mock.calls[0])).toHaveProperty('response_format');
    expect(payloadOf(executeRequest.mock.calls[1])).not.toHaveProperty('response_format');
    expect(payloadOf(executeRequest.mock.calls[2])).not.toHaveProperty('response_format');
  });

  it.each([
    'Invalid max_tokens',
    'Invalid model: foo',
    'Malformed messages array',
    'Bad Request',
    'Unsupported parameter `temperature`',
  ])('does not fallback for unrelated 400: %s', async (message) => {
    const error = unsupportedError(message, 400);
    const executeRequest = vi.spyOn(provider, '_executeRequest').mockRejectedValue(error);

    await expect(provider._callAI('system', 'source', {
      expectedFormat: ResponseFormat.JSON_OBJECT,
    })).rejects.toBe(error);

    expect(executeRequest).toHaveBeenCalledTimes(1);
    expect(payloadOf(executeRequest.mock.calls[0])).toHaveProperty('response_format');
  });

  it.each([401, 403, 429, 500])(
    'does not fallback for non-400/422 status %s even when response_format is mentioned',
    async (statusCode) => {
      const error = unsupportedError('Unknown parameter `response_format`', statusCode);
      const executeRequest = vi.spyOn(provider, '_executeRequest').mockRejectedValue(error);

      await expect(provider._callAI('system', 'source', {
        expectedFormat: ResponseFormat.JSON_OBJECT,
      })).rejects.toBe(error);

      expect(executeRequest).toHaveBeenCalledTimes(1);
    },
  );

  it('does not fallback when the request did not contain response_format', async () => {
    const error = unsupportedError('Unknown parameter `response_format`', 400);
    const executeRequest = vi.spyOn(provider, '_executeRequest').mockRejectedValue(error);

    await expect(provider._callAI('system', 'source', {
      expectedFormat: ResponseFormat.STRING,
    })).rejects.toBe(error);

    expect(executeRequest).toHaveBeenCalledTimes(1);
    expect(payloadOf(executeRequest.mock.calls[0])).not.toHaveProperty('response_format');
  });

  it('does not retry when an omitted-upfront call fails with a response_format message', async () => {
    const firstFailure = unsupportedError('Unknown parameter: response_format', 400);
    const executeRequest = vi.spyOn(provider, '_executeRequest')
      .mockRejectedValueOnce(firstFailure)
      .mockResolvedValueOnce('translated');

    await provider._callAI('system', 'first', { expectedFormat: ResponseFormat.JSON_OBJECT });
    expect(executeRequest).toHaveBeenCalledTimes(2);

    // Cache now omits upfront; a 400 mentioning response_format must not retry
    // because this request never sent the field.
    const staleMention = unsupportedError('Unknown parameter: response_format', 400);
    executeRequest.mockRejectedValueOnce(staleMention);
    await expect(provider._callAI('system', 'second', {
      expectedFormat: ResponseFormat.JSON_OBJECT,
    })).rejects.toBe(staleMention);

    expect(executeRequest).toHaveBeenCalledTimes(3);
    expect(payloadOf(executeRequest.mock.calls[2])).not.toHaveProperty('response_format');
  });

  it('marks structured success as supported and keeps sending on reuse', async () => {
    const executeRequest = vi.spyOn(provider, '_executeRequest').mockResolvedValue('translated');

    await provider._callAI('system', 'first', { expectedFormat: ResponseFormat.JSON_OBJECT });
    await provider._callAI('system', 'second', { expectedFormat: ResponseFormat.JSON_OBJECT });

    expect(executeRequest).toHaveBeenCalledTimes(2);
    expect(payloadOf(executeRequest.mock.calls[0])).toHaveProperty('response_format');
    expect(payloadOf(executeRequest.mock.calls[1])).toHaveProperty('response_format');
  });

  it('keeps different models independent', async () => {
    const executeRequest = vi.spyOn(provider, '_executeRequest')
      .mockRejectedValueOnce(unsupportedError('Unknown parameter: response_format', 400))
      .mockResolvedValue('translated');

    await provider._callAI('system', 'first', { expectedFormat: ResponseFormat.JSON_OBJECT });
    expect(executeRequest).toHaveBeenCalledTimes(2);

    vi.mocked(getCustomApiModelAsync).mockResolvedValue('other-model');
    await provider._callAI('system', 'second', { expectedFormat: ResponseFormat.JSON_OBJECT });

    expect(executeRequest).toHaveBeenCalledTimes(3);
    expect(payloadOf(executeRequest.mock.calls[2])).toHaveProperty('response_format');
  });

  it('keeps different URLs independent', async () => {
    const executeRequest = vi.spyOn(provider, '_executeRequest')
      .mockRejectedValueOnce(unsupportedError('Unknown parameter: response_format', 400))
      .mockResolvedValue('translated');

    await provider._callAI('system', 'first', { expectedFormat: ResponseFormat.JSON_OBJECT });
    expect(executeRequest).toHaveBeenCalledTimes(2);

    vi.mocked(getCustomApiUrlAsync).mockResolvedValue('https://other-host.example/v1/chat/completions');
    await provider._callAI('system', 'second', { expectedFormat: ResponseFormat.JSON_OBJECT });

    expect(executeRequest).toHaveBeenCalledTimes(3);
    expect(payloadOf(executeRequest.mock.calls[2])).toHaveProperty('response_format');
  });

  it('normalizes trailing slashes and surrounding whitespace into one key', () => {
    expect(normalizeCustomResponseFormatCacheKey(`${DEFAULT_URL}/`, DEFAULT_MODEL))
      .toBe(normalizeCustomResponseFormatCacheKey(DEFAULT_URL, DEFAULT_MODEL));
    expect(normalizeCustomResponseFormatCacheKey(`  ${DEFAULT_URL}  `, ` ${DEFAULT_MODEL} `))
      .toBe(normalizeCustomResponseFormatCacheKey(DEFAULT_URL, DEFAULT_MODEL));
    expect(normalizeCustomResponseFormatCacheKey(DEFAULT_URL, 'other-model'))
      .not.toBe(normalizeCustomResponseFormatCacheKey(DEFAULT_URL, DEFAULT_MODEL));
  });

  it('shares one trailing slash across reuse without an extra 400', async () => {
    vi.mocked(getCustomApiUrlAsync).mockResolvedValue(`${DEFAULT_URL}/`);
    const executeRequest = vi.spyOn(provider, '_executeRequest')
      .mockRejectedValueOnce(unsupportedError('Unknown parameter: response_format', 400))
      .mockResolvedValue('translated');

    await provider._callAI('system', 'first', { expectedFormat: ResponseFormat.JSON_OBJECT });
    vi.mocked(getCustomApiUrlAsync).mockResolvedValue(DEFAULT_URL);
    await provider._callAI('system', 'second', { expectedFormat: ResponseFormat.JSON_OBJECT });

    expect(executeRequest).toHaveBeenCalledTimes(3);
    expect(payloadOf(executeRequest.mock.calls[2])).not.toHaveProperty('response_format');
  });

  it('does not let a stale ref suppress probing after URL change', async () => {
    const sharedRef = { responseFormatUnsupported: false };
    const executeRequest = vi.spyOn(provider, '_executeRequest')
      .mockRejectedValueOnce(unsupportedError('Unknown parameter: response_format', 400))
      .mockResolvedValue('translated');

    await provider._callAI('system', 'first', {
      expectedFormat: ResponseFormat.JSON_OBJECT,
      customResponseFormatCapabilityRef: sharedRef,
    });
    expect(sharedRef.responseFormatUnsupported).toBe(true);
    expect(executeRequest).toHaveBeenCalledTimes(2);

    // Same ref object reused after endpoint change must probe the new key.
    vi.mocked(getCustomApiUrlAsync).mockResolvedValue('https://other-host.example/v1/chat/completions');
    await provider._callAI('system', 'second', {
      expectedFormat: ResponseFormat.JSON_OBJECT,
      customResponseFormatCapabilityRef: sharedRef,
    });

    expect(executeRequest).toHaveBeenCalledTimes(3);
    expect(payloadOf(executeRequest.mock.calls[2])).toHaveProperty('response_format');
    expect(sharedRef.responseFormatUnsupported).toBe(false);
  });

  it('does not let a stale ref suppress probing after model change', async () => {
    const sharedRef = { responseFormatUnsupported: false };
    const executeRequest = vi.spyOn(provider, '_executeRequest')
      .mockRejectedValueOnce(unsupportedError('Unknown parameter: response_format', 400))
      .mockResolvedValue('translated');

    await provider._callAI('system', 'first', {
      expectedFormat: ResponseFormat.JSON_OBJECT,
      customResponseFormatCapabilityRef: sharedRef,
    });
    expect(sharedRef.responseFormatUnsupported).toBe(true);

    // Same ref object reused with a different model must probe independently.
    vi.mocked(getCustomApiModelAsync).mockResolvedValue('other-model');
    await provider._callAI('system', 'second', {
      expectedFormat: ResponseFormat.JSON_OBJECT,
      customResponseFormatCapabilityRef: sharedRef,
    });

    expect(payloadOf(executeRequest.mock.calls[2])).toHaveProperty('response_format');
    expect(sharedRef.responseFormatUnsupported).toBe(false);
  });

  it('reuses unsupported for the same key when the same ref object is passed', async () => {
    const sharedRef = { responseFormatUnsupported: false };
    const executeRequest = vi.spyOn(provider, '_executeRequest')
      .mockRejectedValueOnce(unsupportedError('Unknown parameter: response_format', 400))
      .mockResolvedValue('translated');

    await provider._callAI('system', 'first', {
      expectedFormat: ResponseFormat.JSON_OBJECT,
      customResponseFormatCapabilityRef: sharedRef,
    });
    await provider._callAI('system', 'second', {
      expectedFormat: ResponseFormat.JSON_OBJECT,
      customResponseFormatCapabilityRef: sharedRef,
    });

    expect(executeRequest).toHaveBeenCalledTimes(3);
    expect(payloadOf(executeRequest.mock.calls[0])).toHaveProperty('response_format');
    expect(payloadOf(executeRequest.mock.calls[1])).not.toHaveProperty('response_format');
    expect(payloadOf(executeRequest.mock.calls[2])).not.toHaveProperty('response_format');
    expect(sharedRef.responseFormatUnsupported).toBe(true);
  });

  it('handles parallel same-key batches without shared mutable ref state', async () => {
    const refs = [{ responseFormatUnsupported: false }, { responseFormatUnsupported: false }];
    const executeRequest = vi.spyOn(provider, '_executeRequest')
      .mockImplementation(async (request) => {
        if (payloadOf([request]).response_format) {
          throw unsupportedError("'response_format.type' must be 'json_schema' or 'text'", 400);
        }
        return 'translated';
      });

    const [first, second] = await Promise.all([
      provider._callAI('system', 'first', {
        expectedFormat: ResponseFormat.JSON_OBJECT,
        customResponseFormatCapabilityRef: refs[0],
      }),
      provider._callAI('system', 'second', {
        expectedFormat: ResponseFormat.JSON_OBJECT,
        customResponseFormatCapabilityRef: refs[1],
      }),
    ]);

    expect(first).toBe('translated');
    expect(second).toBe('translated');
    // No requirement of exactly-one 400: each parallel batch may probe once.
    // Assert only safe behavior: both refs converge to unsupported, retries omit,
    // and exactly two fallbacks happened (one per batch).
    expect(refs[0].responseFormatUnsupported).toBe(true);
    expect(refs[1].responseFormatUnsupported).toBe(true);
    const withFormat = executeRequest.mock.calls.filter((call) => payloadOf(call).response_format);
    const withoutFormat = executeRequest.mock.calls.filter((call) => !payloadOf(call).response_format);
    expect(withFormat.length).toBe(2);
    expect(withoutFormat.length).toBe(2);
    expect(executeRequest).toHaveBeenCalledTimes(4);
  });

  it('recovers end-to-end from an LM Studio string-error 400 through the real request engine', async () => {
    const lmStudioBody = { error: "'response_format.type' must be 'json_schema' or 'text'" };
    proxyManager.fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => lmStudioBody,
        clone() { return this; },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ choices: [{ message: { content: 'translated' } }] }),
        clone() { return this; },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ choices: [{ message: { content: 'translated' } }] }),
        clone() { return this; },
      });

    await expect(provider._callAI('system', 'source', {
      expectedFormat: ResponseFormat.JSON_OBJECT,
    })).resolves.toBe('translated');

    expect(proxyManager.fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(proxyManager.fetch.mock.calls[0][1].body)).toHaveProperty('response_format');
    expect(JSON.parse(proxyManager.fetch.mock.calls[1][1].body)).not.toHaveProperty('response_format');

    // Same URL+model reuses the learned unsupported decision and omits upfront.
    await expect(provider._callAI('system', 'next', {
      expectedFormat: ResponseFormat.JSON_OBJECT,
    })).resolves.toBe('translated');

    expect(proxyManager.fetch).toHaveBeenCalledTimes(3);
    expect(JSON.parse(proxyManager.fetch.mock.calls[2][1].body)).not.toHaveProperty('response_format');
  });
});
