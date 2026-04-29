import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiProvider } from './GoogleGemini.js';
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
  CONFIG: { GEMINI_API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro' },
  getGeminiApiKeysAsync: vi.fn().mockResolvedValue(['key-1', 'key-2']),
  getGeminiModelAsync: vi.fn().mockResolvedValue('gemini-pro'),
  getGeminiThinkingEnabledAsync: vi.fn().mockResolvedValue(false),
  getGeminiApiUrlAsync: vi.fn().mockResolvedValue(''),
  getPromptBASEScreenCaptureAsync: vi.fn().mockResolvedValue(''),
  getSettingsAsync: vi.fn().mockResolvedValue({})
}));

vi.mock('@/shared/proxy/ProxyManager.js', () => ({
  proxyManager: {
    fetch: vi.fn(),
    setConfig: vi.fn()
  }
}));

vi.mock('./utils/AIConversationHelper.js', () => ({
  AIConversationHelper: {
    claimNextTurn: vi.fn().mockResolvedValue(1),
    getConversationHistory: vi.fn().mockResolvedValue([]),
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

describe('GeminiProvider Internal Integration', () => {
  let provider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GeminiProvider();
    
    // Mock ApiKeyManager methods directly
    vi.spyOn(ApiKeyManager, 'getKeys').mockResolvedValue(['key-1', 'key-2']);
    vi.spyOn(ApiKeyManager, 'shouldFailover').mockImplementation((err) => err.statusCode === 401);
    vi.spyOn(ApiKeyManager, 'promoteKey').mockResolvedValue(true);
  });

  it('should successfully call Gemini API and get result', async () => {
    // We test _callAI because it uses ProviderRequestEngine directly
    const mockGeminiResponse = {
      candidates: [{ content: { parts: [{ text: 'سلام دنیا' }] } }]
    };

    proxyManager.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockGeminiResponse,
      headers: new Map([['content-type', 'application/json']]),
      clone: function() { return this; }
    });

    const result = await provider._callAI('system prompt', 'Hello World', {});

    expect(result).toBe('سلام دنیا');
    expect(proxyManager.fetch).toHaveBeenCalledWith(
      expect.stringContaining('key=key-1'),
      expect.any(Object)
    );
  });

  it('should verify failover works correctly with real Gemini implementation', async () => {
    // Fail first, succeed second
    proxyManager.fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: { message: 'API_KEY_INVALID' } }),
        headers: new Map(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'ترجمه موفق' }] } }]
        }),
        headers: new Map([['content-type', 'application/json']]),
        clone: function() { return this; }
      });

    const result = await provider._callAI('system', 'Test', {});

    expect(result).toBe('ترجمه موفق');
    
    // Verify first call used key-1
    expect(proxyManager.fetch).toHaveBeenNthCalledWith(1, 
      expect.stringContaining('key=key-1'), 
      expect.any(Object)
    );

    // Verify second call used key-2
    expect(proxyManager.fetch).toHaveBeenNthCalledWith(2, 
      expect.stringContaining('key=key-2'), 
      expect.any(Object)
    );

    // Verify key-2 was promoted (Confirming our fix in ProviderRequestEngine)
    expect(ApiKeyManager.promoteKey).toHaveBeenCalledWith('GEMINI_API_KEY', 'key-2');
  });
});
