import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  CONFIG, 
  getSettingsAsync, 
  getApiKeyAsync, 
  getDebugModeAsync,
  TranslationMode,
  IsDebug,
  getPromptBASESelectAsync,
  getPromptBASEBatchAsync,
  getPromptBASEAIBatchAsync,
  getPromptBASEAIBatchAutoAsync,
  getPromptBASEAIFollowupAsync,
  getPromptBASEAIFollowupAutoAsync,
  getPromptSubtitleBaseAsync,
  getPromptSubtitleBatchAsync,
  getPromptBASEScreenCaptureAsync,
  getPromptAsync,
  getPromptBASEFieldAsync
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
      expect(TranslationMode.PDF).toBe('pdf-translation');
    });

    it('should have basic app info in CONFIG', () => {
      expect(CONFIG.APP_NAME).toBe('Translate It');
    });

    it.each(['PROMPT_BASE_AI_BATCH', 'PROMPT_BASE_AI_BATCH_AUTO'])(
      '%s documents the runtime segment marker protocol',
      (key) => {
        expect(CONFIG[key]).toContain('@@TI_SEG_');
        expect(CONFIG[key]).toContain('@@TI_SEG_xxx_session_n5@@');
        expect(CONFIG[key]).not.toContain('[--SEG:nN--]');
      }
    );
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
  });

  describe('Error Handling', () => {
    it('getSettingsAsync should return defaults if storage returns null', async () => {
      storageManager.get.mockResolvedValue(null);
      const settings = await getSettingsAsync();
      expect(settings.APP_NAME).toBe(CONFIG.APP_NAME);
      expect(settings.THEME).toBe(CONFIG.THEME);
    });
  });

  describe('Prompt Getters', () => {
    const NON_EDITABLE_GETTERS = [
      ['PROMPT_BASE_SELECT', getPromptBASESelectAsync],
      ['PROMPT_BASE_BATCH', getPromptBASEBatchAsync],
      ['PROMPT_BASE_AI_BATCH', getPromptBASEAIBatchAsync],
      ['PROMPT_BASE_AI_BATCH_AUTO', getPromptBASEAIBatchAutoAsync],
      ['PROMPT_BASE_AI_FOLLOWUP', getPromptBASEAIFollowupAsync],
      ['PROMPT_BASE_AI_FOLLOWUP_AUTO', getPromptBASEAIFollowupAutoAsync],
      ['PROMPT_SUBTITLE_BASE', getPromptSubtitleBaseAsync],
      ['PROMPT_SUBTITLE_BATCH', getPromptSubtitleBatchAsync],
      ['PROMPT_BASE_SCREEN_CAPTURE', getPromptBASEScreenCaptureAsync]
    ];

    it.each(NON_EDITABLE_GETTERS)(
      'non-editable getter %s returns CONFIG and ignores stale storage',
      async (key, getter) => {
        storageManager.get.mockResolvedValue({ [key]: 'STALE_STORED_VALUE' });

        const result = await getter();

        expect(result).toBe(CONFIG[key]);
        expect(storageManager.get).not.toHaveBeenCalled();
      }
    );

    it('editable getter honors custom stored value', async () => {
      const customPrompt = 'My custom template $_{SOURCE} $_{TARGET} $_{TEXT}';
      storageManager.get.mockResolvedValue({ PROMPT_TEMPLATE: customPrompt });

      const result = await getPromptAsync();

      expect(result).toBe(customPrompt);
      expect(storageManager.get).toHaveBeenCalledWith(
        { PROMPT_TEMPLATE: CONFIG.PROMPT_TEMPLATE }
      );
    });

    it('editable base field getter honors custom stored value', async () => {
      const customPrompt = 'My custom base $_{PROMPT_INSTRUCTIONS} $_{TEXT}';
      storageManager.get.mockResolvedValue({ PROMPT_BASE_FIELD: customPrompt });

      const result = await getPromptBASEFieldAsync();

      expect(result).toBe(customPrompt);
    });
  });
});
