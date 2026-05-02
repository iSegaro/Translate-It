import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIProvider } from './OpenAI.js';
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
    getOpenAIApiKeysAsync: vi.fn().mockResolvedValue(['test-key']),
    getOpenAIApiUrlAsync: vi.fn().mockResolvedValue('https://api.openai.com/v1/chat/completions'),
    getOpenAIModelAsync: vi.fn().mockResolvedValue('gpt-4o-mini'),
    getSettingsAsync: vi.fn().mockResolvedValue({}),
    getPromptBASEScreenCaptureAsync: vi.fn().mockResolvedValue('Translate this image to {targetLanguage}'),
  };
});

describe('OpenAIProvider Error Handling', () => {
  let provider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OpenAIProvider();
  });

  it('should handle successful translation', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({
        choices: [{ message: { content: 'سلام دنیا' } }]
      }),
      clone: function() { return this; }
    });

    const result = await provider._callAI('system', 'Hello World');
    expect(result).toBe('سلام دنیا');
  });

  it('should detect API_ERROR wrapped in 200 OK response', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({
        error: { message: 'Rate limit reached', type: 'insufficient_quota' }
      }),
      clone: function() { return this; }
    });

    await expect(provider._callAI('system', 'text'))
      .rejects.toThrow('API_ERROR: Rate limit reached');
  });

  it('should handle HTTP 429 Too Many Requests', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({
        error: { message: 'Rate limit exceeded' }
      }),
      clone: function() { return this; }
    });

    try {
      await provider._callAI('system', 'text');
    } catch (error) {
      expect(error.type).toBe(ErrorTypes.RATE_LIMIT_REACHED);
      expect(error.statusCode).toBe(429);
    }
  });

  it('should handle HTTP 500 Server Error', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({
        error: { message: 'Something went wrong' }
      }),
      clone: function() { return this; }
    });

    try {
      await provider._callAI('system', 'text');
    } catch (error) {
      expect(error.type).toBe(ErrorTypes.SERVER_ERROR);
    }
  });

  it('should handle malformed JSON response', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
      text: () => Promise.resolve('Invalid JSON'),
      clone: function() { return this; }
    });

    await expect(provider._callAI('system', 'text'))
      .rejects.toThrow();
  });

  it('should handle network timeout/failure', async () => {
    proxyManager.fetch.mockRejectedValue(new TypeError('NetworkError when attempting to fetch resource.'));

    try {
      await provider._callAI('system', 'text');
    } catch (error) {
      expect(error.type).toBe(ErrorTypes.NETWORK_ERROR);
    }
  });

  it('should handle abortion/cancellation', async () => {
    const controller = new AbortController();
    const abortError = new Error('The user aborted a request.');
    abortError.name = 'AbortError';
    
    proxyManager.fetch.mockRejectedValue(abortError);

    try {
      await provider._callAI('system', 'text', { abortController: controller });
    } catch (error) {
      expect(error.type).toBe(ErrorTypes.USER_CANCELLED);
    }
  });
});
