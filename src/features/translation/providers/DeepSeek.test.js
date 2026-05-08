import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeepSeekProvider } from './DeepSeek.js';
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
    getDeepSeekApiKeysAsync: vi.fn().mockResolvedValue(['test-key']),
    getDeepSeekApiUrlAsync: vi.fn().mockResolvedValue('https://api.deepseek.com/chat/completions'),
    getDeepSeekApiModelAsync: vi.fn().mockResolvedValue('deepseek-chat'),
    getSettingsAsync: vi.fn().mockResolvedValue({}),
  };
});

describe('DeepSeekProvider Error Handling', () => {
  let provider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new DeepSeekProvider();
  });

  it('should handle successful translation', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({
        choices: [{ message: { content: 'DeepSeek Result' } }]
      }),
      clone: function() { return this; }
    });

    const result = await provider._callAI('system', 'Hello World');
    expect(result).toBe('DeepSeek Result');
  });

  it('should detect API_ERROR wrapped in 200 OK response', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({
        error: { message: 'Insufficient Balance', code: 'insufficient_balance' }
      }),
      clone: function() { return this; }
    });

    await expect(provider._callAI('system', 'text'))
      .rejects.toThrow('API_ERROR: Insufficient Balance');
  });

  it('should handle HTTP 401 Unauthorized', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({
        error: { message: 'Invalid API Key' }
      }),
      clone: function() { return this; }
    });

    try {
      await provider._callAI('system', 'text');
    } catch (error) {
      expect(error.type).toBe(ErrorTypes.API_KEY_INVALID);
      expect(error.statusCode).toBe(401);
    }
  });
});
