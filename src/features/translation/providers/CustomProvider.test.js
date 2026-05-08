import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CustomProvider } from './CustomProvider.js';
import { proxyManager } from '@/shared/proxy/ProxyManager.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

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
