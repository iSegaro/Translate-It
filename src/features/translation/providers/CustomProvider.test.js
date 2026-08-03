import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CustomProvider } from './CustomProvider.js';
import { proxyManager } from '@/shared/proxy/ProxyManager.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { getCustomApiKeysAsync } from '@/shared/config/config.js';
import { TranslationCallPurpose } from './ProviderConstants.js';

// Mock Dependencies
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
    getSettingsAsync: vi.fn().mockResolvedValue({}),
  };
});

describe('CustomProvider Error Handling', () => {
  let provider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new CustomProvider();
  });

  it('should handle successful translation', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({
        choices: [{ message: { content: 'Custom AI Result' } }]
      }),
      clone: function() { return this; }
    });

    const result = await provider._callAI('system', 'Hello World');
    expect(result).toBe('Custom AI Result');
  });

  it('forwards call purpose outside the provider payload', async () => {
    const executeRequest = vi.spyOn(provider, '_executeRequest').mockResolvedValue('translated');
    await provider._callAI('system', 'text', { callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY });
    const request = executeRequest.mock.calls[0][0];
    expect(request).toMatchObject({ callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY });
    expect(request.fetchOptions.headers).not.toHaveProperty('callPurpose');
    expect(JSON.parse(request.fetchOptions.body)).not.toHaveProperty('callPurpose');
  });

  it('should allow anonymous OpenAI-compatible requests without an API key', async () => {
    vi.mocked(getCustomApiKeysAsync).mockResolvedValueOnce([]);

    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({
        choices: [{ message: { content: 'Anonymous Custom AI Result' } }]
      }),
      clone: function() { return this; }
    });

    const result = await provider._callAI('system', 'Hello World');
    const fetchOptions = proxyManager.fetch.mock.calls[0][1];

    expect(result).toBe('Anonymous Custom AI Result');
    expect(fetchOptions.headers.Authorization).toBeUndefined();
  });

  it('should detect API_ERROR wrapped in 200 OK response', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({
        error: { message: 'Internal Model Error', code: 'model_error' }
      }),
      clone: function() { return this; }
    });

    await expect(provider._callAI('system', 'text'))
      .rejects.toThrow('API_ERROR: Internal Model Error');
  });

  it('should handle HTTP 503 Service Unavailable', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({
        error: { message: 'Server is overloaded' }
      }),
      clone: function() { return this; }
    });

    try {
      await provider._callAI('system', 'text');
    } catch (error) {
      expect(error.type).toBe(ErrorTypes.MODEL_OVERLOADED);
    }
  });
});
