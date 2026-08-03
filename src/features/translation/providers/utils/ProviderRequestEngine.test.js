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
  getBrowserInfoSync: vi.fn(() => ({ isFirefox: false, isMobile: false })),
  detectOS: vi.fn(() => 'LINUX'),
  OS_PLATFORMS: {
    MAC: 'MAC',
    WINDOWS: 'WINDOWS',
    LINUX: 'LINUX',
    UNKNOWN: 'UNKNOWN'
  }
}));

import { ProviderRequestEngine } from './ProviderRequestEngine.js';
import { TranslationCallPurpose } from '../ProviderConstants.js';
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
          clone: function() { return this; }
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
        clone: function() { return this; }
      });

      await expect(ProviderRequestEngine.executeRequest(mockProvider, {
        url: 'https://api.test.com',
        fetchOptions: { headers: {} },
        extractResponse: mockExtractResponse,
        updateApiKey: vi.fn()
      })).rejects.toThrow('Bad Request');

      expect(proxyManager.fetch).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['missing purpose', undefined, TranslationCallPurpose.PRIMARY_TRANSLATION],
      ['invalid purpose', 'OTHER', TranslationCallPurpose.PRIMARY_TRANSLATION],
      ['recovery purpose', TranslationCallPurpose.STRUCTURED_RECOVERY, TranslationCallPurpose.STRUCTURED_RECOVERY],
    ])('should forward normalized %s to every physical call', async (_label, callPurpose, expectedPurpose) => {
      const apiCallSpy = vi.spyOn(ProviderRequestEngine, 'executeApiCall').mockResolvedValue('translated');

      await ProviderRequestEngine.executeRequest(mockProvider, {
        url: 'https://api.test.com',
        fetchOptions: { headers: {} },
        extractResponse: mockExtractResponse,
        callPurpose,
      });

      expect(apiCallSpy).toHaveBeenCalledWith(mockProvider, expect.objectContaining({ callPurpose: expectedPurpose }));
      apiCallSpy.mockRestore();
    });

    it('should preserve recovery purpose across key failover', async () => {
      ApiKeyManager.getKeys.mockResolvedValue(['bad-key', 'good-key']);
      ApiKeyManager.shouldFailover.mockReturnValue(true);
      const apiCallSpy = vi.spyOn(ProviderRequestEngine, 'executeApiCall')
        .mockRejectedValueOnce(Object.assign(new Error('bad key'), { type: 'API_ERROR' }))
        .mockResolvedValueOnce('translated');

      await ProviderRequestEngine.executeRequest(mockProvider, {
        url: 'https://api.test.com',
        fetchOptions: { headers: {} },
        extractResponse: mockExtractResponse,
        updateApiKey: vi.fn(),
        callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY,
      });

      expect(apiCallSpy).toHaveBeenCalledTimes(2);
      expect(apiCallSpy.mock.calls.every(([, params]) => params.callPurpose === TranslationCallPurpose.STRUCTURED_RECOVERY)).toBe(true);
      apiCallSpy.mockRestore();
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

  describe('Error Accounting', () => {
    const baseParams = () => ({
      url: 'https://api.test.com',
      fetchOptions: { headers: {} },
      extractResponse: mockExtractResponse,
      context: 'test',
      sessionId: 's1',
      charCount: 10,
      originalCharCount: 5
    });

    it('should record exactly one error for a non-cancellation transport failure and rethrow', async () => {
      proxyManager.fetch.mockRejectedValue(new TypeError('NetworkError: Failed to fetch'));
      const { statsManager } = await import('../../core/TranslationStatsManager.js');

      await expect(ProviderRequestEngine.executeApiCall(mockProvider, baseParams()))
        .rejects.toThrow('NetworkError');

      expect(statsManager.recordRequest).toHaveBeenCalledTimes(1);
      expect(statsManager.recordError).toHaveBeenCalledTimes(1);
    });

    it('should not record an error for an aborted transport call', async () => {
      proxyManager.fetch.mockRejectedValue(new DOMException('Aborted', 'AbortError'));
      const { statsManager } = await import('../../core/TranslationStatsManager.js');

      await expect(ProviderRequestEngine.executeApiCall(mockProvider, baseParams()))
        .rejects.toThrow('Translation cancelled by user');

      expect(statsManager.recordRequest).toHaveBeenCalledTimes(1);
      expect(statsManager.recordError).not.toHaveBeenCalled();
    });
  });
});
