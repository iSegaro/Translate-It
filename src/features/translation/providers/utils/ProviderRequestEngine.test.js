import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. Mock dependencies at TOP LEVEL (hoisted)
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: { getBrowserInfo: vi.fn() },
    storage: { local: { get: vi.fn(), set: vi.fn() } }
  }
}));

vi.mock('../ApiKeyManager.js', () => ({
  ApiKeyManager: {
    getKeys: vi.fn(),
    promoteKey: vi.fn(),
    shouldFailover: vi.fn(),
  }
}));

vi.mock('@/shared/proxy/ProxyManager.js', () => ({
  proxyManager: {
    fetch: vi.fn(),
  }
}));

vi.mock('../../core/TranslationStatsManager.js', () => ({
  statsManager: {
    recordRequest: vi.fn(() => ({ globalCallId: 1, sessionCallId: 1 })),
    recordError: vi.fn(),
  }
}));

// Mock browser compatibility to avoid real navigator/UA calls
vi.mock('@/utils/browser/compatibility.js', () => ({
  getBrowserInfoSync: vi.fn(() => ({ isFirefox: false, isMobile: false }))
}));

import { ProviderRequestEngine } from './ProviderRequestEngine.js';
import { ApiKeyManager } from '../ApiKeyManager.js';
import { proxyManager } from '@/shared/proxy/ProxyManager.js';
import { getBrowserInfoSync } from '@/utils/browser/compatibility.js';

describe('ProviderRequestEngine', () => {
  const mockProvider = {
    providerName: 'TestProvider',
    providerSettingKey: 'test_key_setting',
    _initializeProxy: vi.fn().mockResolvedValue(true),
  };

  const mockExtractResponse = vi.fn((data) => data.translated);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executeRequest - Failover Logic', () => {
    it('should failover to the second key if the first one fails with a retryable error', async () => {
      // 1. Setup: Two keys available
      const keys = ['bad-key', 'good-key'];
      ApiKeyManager.getKeys.mockResolvedValue(keys);
      ApiKeyManager.shouldFailover.mockReturnValue(true);

      // 2. Mock fetch: First call fails (401), second call succeeds (200)
      proxyManager.fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: async () => ({ error: { message: 'Invalid Key' } }),
          headers: new Map(),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ translated: 'سلام' }),
          headers: new Map([['content-type', 'application/json']]),
          clone: function() { return this; }
        });

      const updateApiKey = vi.fn();
      
      // 3. Execute request
      const result = await ProviderRequestEngine.executeRequest(mockProvider, {
        url: 'https://api.test.com/translate?key=bad-key',
        fetchOptions: { 
          method: 'POST', 
          headers: { 'Authorization': 'Bearer bad-key' } 
        },
        extractResponse: mockExtractResponse,
        updateApiKey
      });

      // 4. Verification
      expect(result).toBe('سلام');
      expect(proxyManager.fetch).toHaveBeenCalledTimes(2);
      
      // Check if updateApiKey was called with the second key
      expect(updateApiKey).toHaveBeenCalledWith('good-key', expect.any(Object));
      
      // Check if the working key was promoted
      expect(ApiKeyManager.promoteKey).toHaveBeenCalledWith('test_key_setting', 'good-key');
    });

    it('should throw error immediately if shouldFailover is false', async () => {
      ApiKeyManager.getKeys.mockResolvedValue(['key1', 'key2']);
      ApiKeyManager.shouldFailover.mockReturnValue(false); // Don't retry for this error

      proxyManager.fetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ message: 'Fatal Error' }),
        headers: new Map(),
      });

      await expect(ProviderRequestEngine.executeRequest(mockProvider, {
        url: 'https://api.test.com',
        fetchOptions: { headers: {} },
        extractResponse: mockExtractResponse,
        updateApiKey: vi.fn()
      })).rejects.toThrow('Bad Request');

      expect(proxyManager.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('prepareHeaders', () => {
    it('should remove chrome-specific headers on Firefox', () => {
      // Set mock to Firefox
      getBrowserInfoSync.mockReturnValue({ isFirefox: true, isMobile: false });

      const inputHeaders = {
        'Content-Type': 'application/json',
        'Sec-Fetch-Mode': 'cors',
        'Referer': 'https://google.com'
      };

      const result = ProviderRequestEngine.prepareHeaders(inputHeaders, 'TestProvider');
      
      expect(result['Content-Type']).toBe('application/json');
      expect(result['Sec-Fetch-Mode']).toBeUndefined();
      expect(result['Referer']).toBeUndefined();
    });
  });
});
