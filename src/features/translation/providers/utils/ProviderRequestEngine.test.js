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
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

describe('ProviderRequestEngine', () => {
  const mockProvider = {
    providerName: 'TestProvider',
    providerSettingKey: 'test_key_setting',
    _initializeProxy: vi.fn().mockResolvedValue(true),
  };

  const mockExtractResponse = vi.fn((data) => data.translated);

  beforeEach(() => {
    vi.clearAllMocks();
    delete mockProvider.classifyProviderHttpError;
  });

  describe('HTTP error classification hook', () => {
    const httpErrorResponse = (body, status = 400, statusText = 'Bad Request') => ({
      ok: false,
      status,
      statusText,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => body,
      clone() { return this; },
    });

    it('passes only bounded structured fields to provider hook', async () => {
      const classifyProviderHttpError = vi.fn(() => ErrorTypes.API_RESPONSE_INVALID);
      mockProvider.classifyProviderHttpError = classifyProviderHttpError;
      proxyManager.fetch.mockResolvedValue(httpErrorResponse({
        code: 4001,
        type: 'top-level-type',
        detail: 'must not be passed',
        arbitrary: { secret: true },
        error: {
          code: 'nested-code',
          type: 'nested-type',
          message: 'must not be passed',
        },
      }));

      await expect(ProviderRequestEngine.executeApiCall(mockProvider, {
        url: 'https://api.test.com',
        fetchOptions: { headers: {} },
        context: 'hook-test',
      })).rejects.toMatchObject({ type: ErrorTypes.API_RESPONSE_INVALID });

      expect(classifyProviderHttpError).toHaveBeenCalledWith({
        statusCode: 400,
        topLevelCode: 4001,
        nestedErrorCode: 'nested-code',
        topLevelType: 'top-level-type',
        nestedErrorType: 'nested-type',
      });
      expect(Object.isFrozen(classifyProviderHttpError.mock.calls[0][0])).toBe(true);
      expect(classifyProviderHttpError.mock.calls[0][0]).not.toHaveProperty('detail');
      expect(classifyProviderHttpError.mock.calls[0][0]).not.toHaveProperty('error');
      expect(classifyProviderHttpError.mock.calls[0][0]).not.toHaveProperty('arbitrary');
    });

    it('excludes absent, non-scalar, and overlong provider fields', async () => {
      const classifyProviderHttpError = vi.fn(() => null);
      mockProvider.classifyProviderHttpError = classifyProviderHttpError;
      proxyManager.fetch.mockResolvedValue(httpErrorResponse({
        code: { invalid: true },
        type: 'x'.repeat(129),
        error: {
          code: ['invalid'],
          type: 503,
        },
      }));

      await expect(ProviderRequestEngine.executeApiCall(mockProvider, {
        url: 'https://api.test.com',
        fetchOptions: { headers: {} },
      })).rejects.toBeDefined();

      expect(classifyProviderHttpError).toHaveBeenCalledWith({
        statusCode: 400,
        nestedErrorType: 503,
      });
    });

    it('uses hook type before ErrorMatcher classification', async () => {
      mockProvider.classifyProviderHttpError = vi.fn(() => ErrorTypes.MODEL_MISSING);
      proxyManager.fetch.mockResolvedValue(httpErrorResponse({}, 404, 'Not Found'));

      await expect(ProviderRequestEngine.executeApiCall(mockProvider, {
        url: 'https://api.test.com',
        fetchOptions: { headers: {} },
        context: 'hook-precedence',
      })).rejects.toMatchObject({
        type: ErrorTypes.MODEL_MISSING,
        statusCode: 404,
        context: 'hook-precedence',
        providerName: 'TestProvider',
        message: 'Not Found',
      });
    });

    it.each([null, undefined])('falls back to ErrorMatcher for %s hook result', async (result) => {
      mockProvider.classifyProviderHttpError = vi.fn(() => result);
      proxyManager.fetch.mockResolvedValue(httpErrorResponse({ error: { message: 'Invalid API key' } }, 401, 'Unauthorized'));

      await expect(ProviderRequestEngine.executeApiCall(mockProvider, {
        url: 'https://api.test.com',
        fetchOptions: { headers: {} },
      })).rejects.toMatchObject({
        type: ErrorTypes.API_KEY_INVALID,
        statusCode: 401,
      });
    });

    it('falls back to ErrorMatcher when provider hook throws', async () => {
      mockProvider.classifyProviderHttpError = vi.fn(() => {
        throw new Error('hook failure');
      });
      proxyManager.fetch.mockResolvedValue(httpErrorResponse({}, 400, 'Bad Request'));

      await expect(ProviderRequestEngine.executeApiCall(mockProvider, {
        url: 'https://api.test.com',
        fetchOptions: { headers: {} },
      })).rejects.toMatchObject({
        type: ErrorTypes.HTTP_ERROR,
        statusCode: 400,
      });
    });

    it('does not attach extracted provider fields to thrown error', async () => {
      mockProvider.classifyProviderHttpError = vi.fn(() => ErrorTypes.HTTP_ERROR);
      proxyManager.fetch.mockResolvedValue(httpErrorResponse({
        code: 'provider-code',
        type: 'provider-type',
        error: { code: 'nested-code', type: 'nested-type' },
      }));

      const error = await ProviderRequestEngine.executeApiCall(mockProvider, {
        url: 'https://api.test.com',
        fetchOptions: { headers: {} },
      }).catch((value) => value);

      expect(error).toMatchObject({
        message: 'Bad Request',
        type: ErrorTypes.HTTP_ERROR,
        statusCode: 400,
        providerName: 'TestProvider',
      });
      expect(error).not.toHaveProperty('topLevelCode');
      expect(error).not.toHaveProperty('nestedErrorCode');
      expect(error).not.toHaveProperty('providerErrorInfo');
      expect(error).not.toHaveProperty('code');
      expect(error).not.toHaveProperty('errorCode');
    });

    it('keeps providers without hook on existing ErrorMatcher path', async () => {
      proxyManager.fetch.mockResolvedValue(httpErrorResponse({ error: { message: 'Invalid API key' } }, 401, 'Unauthorized'));

      await expect(ProviderRequestEngine.executeApiCall(mockProvider, {
        url: 'https://api.test.com',
        fetchOptions: { headers: {} },
        context: 'existing-path',
      })).rejects.toMatchObject({
        message: 'Invalid API key',
        type: ErrorTypes.API_KEY_INVALID,
        statusCode: 401,
        context: 'existing-path',
        providerName: 'TestProvider',
      });
    });

    it('classifies a real HTTP 402 response as insufficient balance', async () => {
      proxyManager.fetch.mockResolvedValue(httpErrorResponse(
        { error: { code: 'billing_required', privateDetail: 'must not escape' } },
        402,
        'Payment Required'
      ));

      const error = await ProviderRequestEngine.executeApiCall(mockProvider, {
        url: 'https://api.test.com',
        fetchOptions: { headers: {} },
      }).catch((value) => value);

      expect(error).toMatchObject({
        message: 'Payment Required',
        type: ErrorTypes.INSUFFICIENT_BALANCE,
        statusCode: 402,
        providerName: 'TestProvider',
      });
      expect(error).not.toHaveProperty('privateDetail');
      expect(error).not.toHaveProperty('providerErrorInfo');
      expect(error).not.toHaveProperty('errorCode');
    });
  });

  describe('executeRequest - Failover Logic', () => {
    it.each([undefined, 'INVALID_PURPOSE'])('normalizes %p purpose to primary before physical accounting', async (callPurpose) => {
      const apiCallSpy = vi.spyOn(ProviderRequestEngine, 'executeApiCall').mockResolvedValue('translated');
      try {
        await ProviderRequestEngine.executeRequest(mockProvider, {
          url: 'https://api.test.com', fetchOptions: { headers: {} }, extractResponse: mockExtractResponse, callPurpose
        });
        expect(apiCallSpy).toHaveBeenCalledWith(mockProvider, expect.objectContaining({ callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION }));
      } finally {
        apiCallSpy.mockRestore();
      }
    });
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
        updateApiKey,
        callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY
      });

      // 4. Verification
      expect(result).toBe('سلام');
      expect(proxyManager.fetch).toHaveBeenCalledTimes(2);
      
      // Check if updateApiKey was called with the second key
      expect(updateApiKey).toHaveBeenCalledWith('good-key', expect.any(Object));
      
      // Check if the working key was promoted
      expect(ApiKeyManager.promoteKey).toHaveBeenCalledWith('test_key_setting', 'good-key');
      const { statsManager } = await import('../../core/TranslationStatsManager.js');
      expect(statsManager.recordRequest).toHaveBeenCalledTimes(2);
      expect(statsManager.recordError).toHaveBeenCalledTimes(1);
      expect(statsManager.recordRequest.mock.calls.every(([, , , , purpose]) => purpose === TranslationCallPurpose.STRUCTURED_RECOVERY)).toBe(true);
      expect(statsManager.recordError).toHaveBeenCalledWith('TestProvider', null, TranslationCallPurpose.STRUCTURED_RECOVERY);
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

    it.each([
      [undefined, TranslationCallPurpose.PRIMARY_TRANSLATION],
      [null, TranslationCallPurpose.PRIMARY_TRANSLATION],
      ['', TranslationCallPurpose.PRIMARY_TRANSLATION],
      ['UNKNOWN', TranslationCallPurpose.PRIMARY_TRANSLATION],
      [TranslationCallPurpose.PRIMARY_TRANSLATION, TranslationCallPurpose.PRIMARY_TRANSLATION],
      [TranslationCallPurpose.STRUCTURED_RECOVERY, TranslationCallPurpose.STRUCTURED_RECOVERY],
      [TranslationCallPurpose.PARENT_RECOVERY, TranslationCallPurpose.PARENT_RECOVERY],
    ])('attributes direct physical %p purpose as %s', async (callPurpose, expectedPurpose) => {
      proxyManager.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        clone() { return this; },
        json: async () => ({ translated: 'translated' })
      });
      const { statsManager } = await import('../../core/TranslationStatsManager.js');

      await ProviderRequestEngine.executeApiCall(mockProvider, { ...baseParams(), callPurpose });

      expect(statsManager.recordRequest).toHaveBeenCalledWith(
        'TestProvider',
        's1',
        10,
        5,
        expectedPurpose
      );
    });

    it('should record exactly one error for a non-cancellation transport failure and rethrow', async () => {
      proxyManager.fetch.mockRejectedValue(new TypeError('NetworkError: Failed to fetch'));
      const { statsManager } = await import('../../core/TranslationStatsManager.js');

      await expect(ProviderRequestEngine.executeApiCall(mockProvider, baseParams()))
        .rejects.toThrow('NetworkError');

      expect(statsManager.recordRequest).toHaveBeenCalledTimes(1);
      expect(statsManager.recordError).toHaveBeenCalledTimes(1);
      expect(statsManager.recordRequest).toHaveBeenCalledWith('TestProvider', 's1', 10, 5, TranslationCallPurpose.PRIMARY_TRANSLATION);
      expect(statsManager.recordError).toHaveBeenCalledWith('TestProvider', 's1', TranslationCallPurpose.PRIMARY_TRANSLATION);
    });

    it('should not record an error for an aborted transport call', async () => {
      proxyManager.fetch.mockRejectedValue(new DOMException('Aborted', 'AbortError'));
      const { statsManager } = await import('../../core/TranslationStatsManager.js');

      await expect(ProviderRequestEngine.executeApiCall(mockProvider, baseParams()))
        .rejects.toThrow('Translation cancelled by user');

      expect(statsManager.recordRequest).toHaveBeenCalledTimes(1);
      expect(statsManager.recordError).not.toHaveBeenCalled();
    });

    it('attributes a recovery transport failure to recovery exactly once', async () => {
      proxyManager.fetch.mockRejectedValue(new TypeError('NetworkError: Failed to fetch'));
      const { statsManager } = await import('../../core/TranslationStatsManager.js');
      await expect(ProviderRequestEngine.executeApiCall(mockProvider, {
        ...baseParams(), callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY
      })).rejects.toThrow('NetworkError');
      expect(statsManager.recordRequest).toHaveBeenCalledWith('TestProvider', 's1', 10, 5, TranslationCallPurpose.STRUCTURED_RECOVERY);
      expect(statsManager.recordError).toHaveBeenCalledWith('TestProvider', 's1', TranslationCallPurpose.STRUCTURED_RECOVERY);
    });

    it('attributes parent recovery transport calls to parent recovery', async () => {
      proxyManager.fetch.mockRejectedValue(new TypeError('NetworkError: Failed to fetch'));
      const { statsManager } = await import('../../core/TranslationStatsManager.js');
      await expect(ProviderRequestEngine.executeApiCall(mockProvider, {
        ...baseParams(), callPurpose: TranslationCallPurpose.PARENT_RECOVERY
      })).rejects.toThrow('NetworkError');
      expect(statsManager.recordRequest).toHaveBeenCalledWith('TestProvider', 's1', 10, 5, TranslationCallPurpose.PARENT_RECOVERY);
      expect(statsManager.recordError).toHaveBeenCalledWith('TestProvider', 's1', TranslationCallPurpose.PARENT_RECOVERY);
    });

    it('attributes a recovery abort without recording a recovery error', async () => {
      proxyManager.fetch.mockRejectedValue(new DOMException('Aborted', 'AbortError'));
      const { statsManager } = await import('../../core/TranslationStatsManager.js');
      await expect(ProviderRequestEngine.executeApiCall(mockProvider, {
        ...baseParams(), callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY
      })).rejects.toThrow('Translation cancelled by user');
      expect(statsManager.recordRequest).toHaveBeenCalledWith('TestProvider', 's1', 10, 5, TranslationCallPurpose.STRUCTURED_RECOVERY);
      expect(statsManager.recordError).not.toHaveBeenCalled();
    });
  });
});
