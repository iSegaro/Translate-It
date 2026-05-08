import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CustomProvider } from './CustomProvider.js';
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
  getCustomApiKeysAsync: vi.fn().mockResolvedValue(['custom-key-1', 'custom-key-2']),
  getCustomApiUrlAsync: vi.fn().mockResolvedValue('https://my-local-ai.com/v1/chat/completions'),
  getCustomApiModelAsync: vi.fn().mockResolvedValue('local-llama-3'),
  getSettingsAsync: vi.fn().mockResolvedValue({}),
  getProviderOptimizationLevelAsync: vi.fn(() => Promise.resolve('balanced')),
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

describe('CustomProvider Internal Integration (Endpoint & Failover)', () => {
  let provider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new CustomProvider();
    
    // Mock ApiKeyManager methods directly
    vi.spyOn(ApiKeyManager, 'getKeys').mockResolvedValue(['custom-key-1', 'custom-key-2']);
    vi.spyOn(ApiKeyManager, 'shouldFailover').mockImplementation((err) => err.statusCode === 401);
    vi.spyOn(ApiKeyManager, 'promoteKey').mockResolvedValue(true);
  });

  it('should use custom URL and include Bearer token', async () => {
    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Local result' } }]
      }),
      headers: new Map([['content-type', 'application/json']]),
      clone: function() { return this; }
    });

    const result = await provider._callAI('system', 'Hello');

    expect(result).toBe('Local result');
    expect(proxyManager.fetch).toHaveBeenCalledWith(
      'https://my-local-ai.com/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer custom-key-1'
        })
      })
    );
  });

  it('should handle failover to second custom key', async () => {
    proxyManager.fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: { message: 'Token Expired' } }),
        headers: new Map(),
        clone: function() { return this; }
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'Recovered with key 2' } }]
        }),
        headers: new Map([['content-type', 'application/json']]),
        clone: function() { return this; }
      });

    const result = await provider._callAI('system', 'Test');

    expect(result).toBe('Recovered with key 2');
    expect(proxyManager.fetch).toHaveBeenCalledTimes(2);
    
    // Verify second call used key-2
    const secondCallHeaders = proxyManager.fetch.mock.calls[1][1].headers;
    expect(secondCallHeaders['Authorization']).toBe('Bearer custom-key-2');

    // Verify key-2 was promoted
    expect(ApiKeyManager.promoteKey).toHaveBeenCalledWith('CUSTOM_API_KEY', 'custom-key-2');
  });
});
