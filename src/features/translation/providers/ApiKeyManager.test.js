import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiKeyManager } from './ApiKeyManager.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

const { mockProxyFetch } = vi.hoisted(() => ({
  mockProxyFetch: vi.fn()
}));

// Mock storageManager
const mockStorage = new Map();
vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  storageManager: {
    get: vi.fn(keys => {
      const result = {};
      Object.keys(keys).forEach(key => {
        result[key] = mockStorage.get(key) || keys[key];
      });
      return Promise.resolve(result);
    }),
    set: vi.fn(data => {
      Object.entries(data).forEach(([key, value]) => {
        mockStorage.set(key, value);
      });
      return Promise.resolve();
    })
  }
}));

// Mock logger
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

vi.mock('@/shared/proxy/ProxyManager.js', () => ({
  proxyManager: {
    fetch: mockProxyFetch
  }
}));

describe('ApiKeyManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.clear();
  });

  describe('Key Parsing and Stringifying', () => {
    it('should parse newline-separated keys correctly', () => {
      const keyString = 'key1\n  key2  \n\nkey3';
      const keys = ApiKeyManager.parseKeys(keyString);
      expect(keys).toEqual(['key1', 'key2', 'key3']);
    });

    it('should return empty array for invalid input', () => {
      expect(ApiKeyManager.parseKeys(null)).toEqual([]);
      expect(ApiKeyManager.parseKeys('')).toEqual([]);
    });

    it('should stringify array of keys back to newline-separated string', () => {
      const keys = ['key1', 'key2'];
      expect(ApiKeyManager.stringifyKeys(keys)).toBe('key1\nkey2');
    });
  });

  describe('Storage Interaction', () => {
    it('should get keys from storage', async () => {
      mockStorage.set('API_KEY', 'gemini1\ngemini2');
      const keys = await ApiKeyManager.getKeys('API_KEY');
      expect(keys).toEqual(['gemini1', 'gemini2']);
    });

    it('should return empty array if no keys in storage', async () => {
      const keys = await ApiKeyManager.getKeys('NON_EXISTENT');
      expect(keys).toEqual([]);
    });
  });

  describe('Key Promotion', () => {
    it('should move successful key to the front and save it', async () => {
      mockStorage.set('OPENAI_KEY', 'key_old\nkey_new');
      
      await ApiKeyManager.promoteKey('OPENAI_KEY', 'key_new');
      
      const savedValue = mockStorage.get('OPENAI_KEY');
      expect(savedValue).toBe('key_new\nkey_old');
    });

    it('should not change anything if key is already at the front', async () => {
      mockStorage.set('OPENAI_KEY', 'key1\nkey2');
      await ApiKeyManager.promoteKey('OPENAI_KEY', 'key1');
      expect(mockStorage.get('OPENAI_KEY')).toBe('key1\nkey2');
    });
  });

  describe('Failover Logic', () => {
    it('should trigger failover for specific error types', () => {
      expect(ApiKeyManager.shouldFailover({ type: ErrorTypes.API_KEY_INVALID })).toBe(true);
      expect(ApiKeyManager.shouldFailover({ type: ErrorTypes.QUOTA_EXCEEDED })).toBe(true);
      expect(ApiKeyManager.shouldFailover({ type: ErrorTypes.NETWORK_ERROR })).toBe(false);
    });
  });

  describe('Key Reordering', () => {
    it('should test and reorder keys: valid first, then invalid', async () => {
      mockStorage.set('GEMINI_KEY', 'invalid_key\nvalid_key');
      
      // Mock the internal test function
      // Since ApiKeyManager uses dynamic imports and private-like static methods, 
      // we mock the specific test function on the class
      vi.spyOn(ApiKeyManager, '_testGeminiKey').mockImplementation(async (key) => {
        return key === 'valid_key';
      });

      const result = await ApiKeyManager.testAndReorderKeys('GEMINI_KEY', 'Gemini');

      expect(result.valid).toEqual(['valid_key']);
      expect(result.invalid).toEqual(['invalid_key']);
      
      // Check storage: valid should be first now
      expect(mockStorage.get('GEMINI_KEY')).toBe('valid_key\ninvalid_key');
    });
  });

  describe('Custom Provider Testing', () => {
    const context = {
      apiUrl: 'https://example.com/v1/chat/completions',
      apiModel: 'local-model'
    };

    const modelsResponse = (data) => ({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(data)
    });

    const chatResponse = (ok = true, status = ok ? 200 : 500) => ({
      ok,
      status,
      json: vi.fn().mockResolvedValue({})
    });

    it('tests anonymous Custom connectivity without Authorization', async () => {
      mockProxyFetch.mockResolvedValue(modelsResponse({ data: [{ id: 'local-model' }] }));

      const result = await ApiKeyManager.testKeysDirect('', 'Custom', context);

      expect(result).toMatchObject({ allInvalid: false, messageKey: 'api_test_custom_connection_success' });
      expect(mockProxyFetch).toHaveBeenCalledWith(
        'https://example.com/v1/models',
        expect.objectContaining({ method: 'GET', headers: {} })
      );
    });

    it('sends Authorization when testing a configured Custom key', async () => {
      mockProxyFetch.mockResolvedValue(modelsResponse({ data: [{ id: 'local-model' }] }));

      const result = await ApiKeyManager.testKeysDirect('secret-key', 'Custom', context);

      expect(result.allInvalid).toBe(false);
      expect(mockProxyFetch.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer secret-key' });
    });

    it('requires configured URL and model before making a remote request', async () => {
      const result = await ApiKeyManager.testKeysDirect('', 'Custom', { apiUrl: '', apiModel: '' });

      expect(result).toMatchObject({ allInvalid: true, messageKey: 'api_test_custom_config_missing' });
      expect(mockProxyFetch).not.toHaveBeenCalled();
    });

    it('requires exact configured model membership from a standard models response', async () => {
      mockProxyFetch.mockResolvedValue(modelsResponse({ data: [{ id: 'local-model-v2' }] }));

      const result = await ApiKeyManager.testKeysDirect('', 'Custom', context);

      expect(result).toMatchObject({ allInvalid: true, messageKey: 'api_test_custom_model_not_found' });
      expect(mockProxyFetch).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['malformed JSON', { ok: true, status: 200, json: vi.fn().mockRejectedValue(new Error('invalid json')) }],
      ['nonstandard shape', { ok: true, status: 200, json: vi.fn().mockResolvedValue({ models: [{ id: 'local-model' }] }) }],
      ['404', { ok: false, status: 404, json: vi.fn().mockResolvedValue({}) }],
      ['405', { ok: false, status: 405, json: vi.fn().mockResolvedValue({}) }]
    ])('falls back to configured model chat test for %s models response', async (_name, modelsFailure) => {
      mockProxyFetch
        .mockResolvedValueOnce(modelsFailure)
        .mockResolvedValueOnce(chatResponse());

      const result = await ApiKeyManager.testKeysDirect('', 'Custom', context);
      const chatRequest = mockProxyFetch.mock.calls[1];

      expect(result.allInvalid).toBe(false);
      expect(mockProxyFetch).toHaveBeenCalledTimes(2);
      expect(mockProxyFetch.mock.calls[0][0]).toBe('https://example.com/v1/models');
      expect(chatRequest[0]).toBe('https://example.com/v1/chat/completions');
      expect(JSON.parse(chatRequest[1].body)).toMatchObject({
        model: 'local-model',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1
      });
      expect(JSON.stringify(chatRequest[1].body)).not.toContain('gpt-3.5-turbo');
    });

    it('does not fall back after genuine authentication failure', async () => {
      mockProxyFetch.mockResolvedValue({ ok: false, status: 401, json: vi.fn() });

      const result = await ApiKeyManager.testKeysDirect('secret-key', 'Custom', context);

      expect(result.allInvalid).toBe(true);
      expect(mockProxyFetch).toHaveBeenCalledTimes(1);
    });
  });
});
