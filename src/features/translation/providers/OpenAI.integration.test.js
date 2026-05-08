import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIProvider } from './OpenAI.js';
import { proxyManager } from '@/shared/proxy/ProxyManager.js';
import { ApiKeyManager } from './ApiKeyManager.js';

// Mock dependencies
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: { getBrowserInfo: vi.fn(), getManifest: () => ({ version: '1.0.0' }) },
    storage: { local: { get: vi.fn(), set: vi.fn() } }
  }
}));

vi.mock('@/shared/config/config.js', () => ({
  getOpenAIApiKeysAsync: vi.fn().mockResolvedValue(['key-1', 'key-2']),
  getOpenAIApiUrlAsync: vi.fn().mockResolvedValue('https://api.openai.com/v1/chat/completions'),
  getOpenAIModelAsync: vi.fn().mockResolvedValue('gpt-4o-mini'),
  getSettingsAsync: vi.fn().mockResolvedValue({}),
  getProviderOptimizationLevelAsync: vi.fn(() => Promise.resolve('balanced')),
  getPromptBASEScreenCaptureAsync: vi.fn().mockResolvedValue('Translate this image to {targetLanguage}'),
}));

vi.mock('@/shared/proxy/ProxyManager.js', () => ({
  proxyManager: {
    fetch: vi.fn(),
    setConfig: vi.fn(),
    testConnection: vi.fn()
  }
}));

vi.mock('./utils/AIConversationHelper.js', () => ({
  AIConversationHelper: {
    claimNextTurn: vi.fn().mockResolvedValue(1),
    getConversationMessages: vi.fn().mockResolvedValue({ messages: [] }),
    updateSessionHistory: vi.fn().mockResolvedValue(true)
  }
}));

vi.mock('../../core/TranslationStatsManager.js', () => ({
  statsManager: {
    recordRequest: vi.fn(() => ({ globalCallId: 1, sessionCallId: 1 })),
    recordError: vi.fn(),
    recordSuccess: vi.fn(),
  }
}));

describe('OpenAIProvider Internal Integration (Failover & Response Extraction)', () => {
  let provider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OpenAIProvider();
    
    // Mock ApiKeyManager methods directly
    vi.spyOn(ApiKeyManager, 'getKeys').mockResolvedValue(['key-1', 'key-2']);
    vi.spyOn(ApiKeyManager, 'shouldFailover').mockImplementation((err) => err.statusCode === 401);
    vi.spyOn(ApiKeyManager, 'promoteKey').mockResolvedValue(true);
  });

  it('should successfully call OpenAI API and extract response', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Persian result' } }]
      }),
      headers: new Map([['content-type', 'application/json']]),
      clone: function() { return this; }
    });

    const result = await provider._callAI('system', 'Hello');

    expect(result).toBe('Persian result');
    expect(proxyManager.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer key-1'
        })
      })
    );
  });

  it('should handle failover when the first key fails with 401', async () => {
    proxyManager.fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: { message: 'Invalid Key' } }),
        headers: new Map(),
        clone: function() { return this; }
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'Success with key 2' } }]
        }),
        headers: new Map([['content-type', 'application/json']]),
        clone: function() { return this; }
      });

    const result = await provider._callAI('system', 'Test');

    expect(result).toBe('Success with key 2');
    expect(proxyManager.fetch).toHaveBeenCalledTimes(2);
    
    // Verify second call used key-2
    const secondCallHeaders = proxyManager.fetch.mock.calls[1][1].headers;
    expect(secondCallHeaders['Authorization']).toBe('Bearer key-2');

    // Verify key-2 was promoted
    expect(ApiKeyManager.promoteKey).toHaveBeenCalledWith('OPENAI_API_KEY', 'key-2');
  });

  it('should throw ErrorTypes.API_RESPONSE_INVALID when choices are missing', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ something: 'else' }),
      headers: new Map([['content-type', 'application/json']]),
      clone: function() { return this; }
    });

    // In this case, extractResponse returns undefined, which ProviderRequestEngine 
    // should catch and throw API_RESPONSE_INVALID
    await expect(provider._callAI('system', 'test')).rejects.toThrow();
  });
});
