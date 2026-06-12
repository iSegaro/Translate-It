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

vi.mock('@/features/translation/providers/ApiKeyManager.js', () => ({
  ApiKeyManager: {
    getKeys: vi.fn().mockResolvedValue(['key1', 'key2'])
  }
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

    it('should include live-caption scaffolding defaults in CONFIG', () => {
      expect(CONFIG.LIVE_CAPTION_ENABLED).toBe(false);
      expect(CONFIG.LIVE_CAPTION_QUALITY_PROFILE).toBe('balanced');
      expect(CONFIG.LIVE_CAPTION_CACHE_MAX_ITEMS).toBe(500);
      expect(CONFIG.LIVE_CAPTION_CACHE_MAX_BYTES).toBe(10485760);
      expect(CONFIG.LIVE_CAPTION_STT_PROVIDER).toBe('openai_whisper');
      expect(CONFIG.LIVE_CAPTION_RETRY_LIMIT).toBe(2);
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
      const { getOpenAIApiKeysAsync } = await import('./config.js');
      const keys = await getOpenAIApiKeysAsync();

      expect(keys).toEqual(['key1', 'key2']);
    });

    it('getLiveCaptionSttProviderAsync should fall back to OpenAI Whisper when the stored provider is invalid', async () => {
      storageManager.get.mockResolvedValue({ LIVE_CAPTION_STT_PROVIDER: 'browser_speech' });
      const { getLiveCaptionSttProviderAsync } = await import('./config.js');

      await expect(getLiveCaptionSttProviderAsync()).resolves.toBe('openai_whisper');
    });

    it('getLiveCaptionSttProviderAsync should return Local Whisper only in debug mode', async () => {
      storageManager.get.mockResolvedValue({ LIVE_CAPTION_STT_PROVIDER: 'local_whisper' });
      storageManager.hasCached.mockReturnValue(true);
      storageManager.getCached.mockReturnValue(true);
      const { getLiveCaptionSttProviderAsync } = await import('./config.js');

      await expect(getLiveCaptionSttProviderAsync()).resolves.toBe('local_whisper');
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
