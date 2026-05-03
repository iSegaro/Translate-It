import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  CONFIG, 
  getSettingsAsync, 
  getApiKeyAsync, 
  getDebugModeAsync,
  TranslationMode,
  IsDebug 
} from './config.js';
import { storageManager } from '../storage/core/StorageCore.js';

// Mock StorageCore
vi.mock('../storage/core/StorageCore.js', () => ({
  storageManager: {
    get: vi.fn(),
    on: vi.fn(),
    hasCached: vi.fn(),
    getCached: vi.fn()
  }
}));

// Mock ExtensionContextManager
vi.mock('@/core/extensionContext.js', () => ({
  default: {
    isContextError: vi.fn().mockReturnValue(false),
    handleContextError: vi.fn()
  }
}));

// Mock logger
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn()
  })
}));

describe('Config Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Constants', () => {
    it('should have correct TranslationMode values', () => {
      expect(TranslationMode.Select_Element).toBe('select-element');
      expect(TranslationMode.Page).toBe('page-translation-batch');
    });

    it('should have basic app info in CONFIG', () => {
      expect(CONFIG.APP_NAME).toBe('Translate It');
    });
  });

  describe('Async Getters', () => {
    it('getSettingsAsync should merge storage data with CONFIG defaults', async () => {
      const mockStoredItems = {
        API_KEY: 'test-api-key',
        DEBUG_MODE: true
      };
      storageManager.get.mockResolvedValue(mockStoredItems);

      const settings = await getSettingsAsync();

      expect(settings.API_KEY).toBe('test-api-key');
      expect(settings.DEBUG_MODE).toBe(true);
      // Verify defaults are still there
      expect(settings.APP_NAME).toBe('Translate It');
    });

    it('getApiKeyAsync should return value from storage', async () => {
      storageManager.get.mockResolvedValue({ API_KEY: 'secret-key' });
      const apiKey = await getApiKeyAsync();
      expect(apiKey).toBe('secret-key');
    });

    it('getDebugModeAsync should return default if storage fails', async () => {
      storageManager.get.mockRejectedValue(new Error('Storage fail'));
      const debugMode = await getDebugModeAsync();
      expect(debugMode).toBe(CONFIG.DEBUG_MODE);
    });
  });

  describe('Advanced Logic', () => {
    it('IsDebug should use cache if available', async () => {
      storageManager.hasCached.mockReturnValue(true);
      storageManager.getCached.mockReturnValue(true);
      
      const result = await IsDebug();
      
      expect(storageManager.getCached).toHaveBeenCalledWith('DEBUG_MODE', false);
      expect(result).toBe(true);
    });

    it('getOpenAIApiKeysAsync should retrieve keys via ApiKeyManager', async () => {
      // Note: We need to mock the dynamic import result
      const mockKeys = ['key1', 'key2'];
      vi.mock('@/features/translation/providers/ApiKeyManager.js', () => ({
        ApiKeyManager: {
          getKeys: vi.fn().mockResolvedValue(['key1', 'key2'])
        }
      }));

      const { getOpenAIApiKeysAsync } = await import('./config.js');
      const keys = await getOpenAIApiKeysAsync();
      
      expect(keys).toEqual(mockKeys);
    });
  });

  describe('Error Handling', () => {
    it('getSettingsAsync should return defaults if storage returns null', async () => {
      storageManager.get.mockResolvedValue(null);
      const settings = await getSettingsAsync();
      expect(settings.APP_NAME).toBe(CONFIG.APP_NAME);
      expect(settings.THEME).toBe(CONFIG.THEME);
    });
  });
});
