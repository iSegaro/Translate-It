import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiProvider } from './GoogleGemini.js';
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
    getGeminiApiKeysAsync: vi.fn().mockResolvedValue(['test-key']),
    getGeminiModelAsync: vi.fn().mockResolvedValue('gemini-1.5-flash'),
    getGeminiThinkingEnabledAsync: vi.fn().mockResolvedValue(false),
    getGeminiApiUrlAsync: vi.fn().mockResolvedValue('https://generativelanguage.googleapis.com/v1beta/models'),
    getSettingsAsync: vi.fn().mockResolvedValue({}),
    getPromptBASEScreenCaptureAsync: vi.fn().mockResolvedValue('Translate this image to {targetLanguage}'),
  };
});

describe('GeminiProvider Error Handling', () => {
  let provider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GeminiProvider();
  });

  it('should handle successful translation', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: 'سلام دنیا' }] } }]
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
        error: { message: 'API Key not valid', status: 'INVALID_ARGUMENT' }
      }),
      clone: function() { return this; }
    });

    await expect(provider._callAI('system', 'text'))
      .rejects.toThrow('API_ERROR: API Key not valid');
  });

  it('should detect SAFETY filter block', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({
        candidates: [{ finishReason: 'SAFETY' }]
      }),
      clone: function() { return this; }
    });

    await expect(provider._callAI('system', 'text'))
      .rejects.toThrow('API_ERROR: Content blocked by Gemini safety filters');
  });

  it('should handle HTTP 429 Too Many Requests', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({
        error: { message: 'Quota exceeded' }
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

  it('should handle thinking config fallback', async () => {
    // 1. First call fails with 400 because of thinking_config
    proxyManager.fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({
        error: { message: 'Invalid field: thinking_config' }
      }),
      clone: function() { return this; }
    });

    // 2. Second call (retry) succeeds
    proxyManager.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: 'fallback result' }] } }]
      }),
      clone: function() { return this; }
    });

    // Mock config to enable thinking so fallback is triggered
    const { getGeminiThinkingEnabledAsync, getGeminiModelAsync } = await import('@/shared/config/config.js');
    getGeminiThinkingEnabledAsync.mockResolvedValue(true);
    getGeminiModelAsync.mockResolvedValue('gemini-2.0-flash-thinking-exp');

    const result = await provider._callAI('system', 'text');
    expect(result).toBe('fallback result');
    expect(proxyManager.fetch).toHaveBeenCalledTimes(2);
  });
});
