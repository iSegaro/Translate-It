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
  getPromptBASEFieldAsync,
  getGeminiThinkingModeAsync
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

    it('should expose approved OpenAI text models in order', () => {
      expect(CONFIG.OPENAI_API_MODEL).toBe('gpt-5.6-luna');
      expect(CONFIG.OPENAI_MODELS.map(model => model.value)).toEqual([
        'gpt-5.6-terra',
        'gpt-5.6-luna',
        'gpt-5.6-sol',
        'gpt-4o-mini',
        'custom'
      ]);
      expect(CONFIG.OPENAI_MODELS).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ value: 'o1' }),
          expect.objectContaining({ value: 'o1-mini' }),
          expect.objectContaining({ value: 'o3-mini' }),
          expect.objectContaining({ value: 'gpt-4.5-preview' }),
          expect.objectContaining({ value: 'gpt-4o' }),
          expect.objectContaining({ value: 'chatgpt-4o-latest' })
        ])
      );
    });

    it('should expose approved Gemini selector models in order', () => {
      expect(CONFIG.GEMINI_MODEL).toBe('gemini-3.5-flash');
      expect(CONFIG.GEMINI_API_URL).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent'
      );
      expect(CONFIG.GEMINI_MODELS.map(model => model.value)).toEqual([
        'gemini-3.7-flash',
        'gemini-3.6-flash',
        'gemini-3.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite',
        'gemini-3.1-pro-preview',
        'gemini-3-flash-preview',
        'custom'
      ]);
      expect(CONFIG.GEMINI_MODELS.every(model => !model.value.startsWith('gemini-2.5-'))).toBe(true);
    });

    it('should retain exact Gemini model endpoints and Thinking metadata', () => {
      expect(CONFIG.GEMINI_MODELS).toEqual([
        expect.objectContaining({
          value: 'gemini-3.7-flash',
          name: 'Gemini 3.7 Flash',
          url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent',
          thinking: { minimal: null }
        }),
        expect.objectContaining({
          value: 'gemini-3.6-flash',
          name: 'Gemini 3.6 Flash',
          url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
          thinking: { minimal: { type: 'level', value: 'minimal' } }
        }),
        expect.objectContaining({
          value: 'gemini-3.5-flash',
          name: 'Gemini 3.5 Flash',
          url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
          thinking: { minimal: { type: 'level', value: 'minimal' } }
        }),
        expect.objectContaining({
          value: 'gemini-3.5-flash-lite',
          name: 'Gemini 3.5 Flash-Lite',
          url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
          thinking: { minimal: null }
        }),
        expect.objectContaining({
          value: 'gemini-3.1-flash-lite',
          name: 'Gemini 3.1 Flash-Lite',
          url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent',
          thinking: { minimal: { type: 'level', value: 'minimal' } }
        }),
        expect.objectContaining({
          value: 'gemini-3.1-pro-preview',
          name: 'Gemini 3.1 Pro Preview',
          url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent',
          thinking: { minimal: { type: 'level', value: 'minimal' } }
        }),
        expect.objectContaining({
          value: 'gemini-3-flash-preview',
          name: 'Gemini 3 Flash Preview',
          url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent',
          thinking: { minimal: { type: 'level', value: 'minimal' } }
        }),
        { value: 'custom', name: 'Custom Model', custom: true }
      ]);
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

    it('getGeminiThinkingModeAsync reads stored mode and uses CONFIG default', async () => {
      storageManager.get.mockResolvedValue({ GEMINI_THINKING_MODE: 'minimal' });
      await expect(getGeminiThinkingModeAsync()).resolves.toBe('minimal');
      expect(storageManager.get).toHaveBeenCalledWith({ GEMINI_THINKING_MODE: CONFIG.GEMINI_THINKING_MODE });

      storageManager.get.mockResolvedValue({ GEMINI_THINKING_MODE: CONFIG.GEMINI_THINKING_MODE });
      await expect(getGeminiThinkingModeAsync()).resolves.toBe('default');
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
