import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiKeyManager } from './ApiKeyManager.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

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
});
