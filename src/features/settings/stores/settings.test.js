import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { nextTick } from 'vue';
import useSettingsStore from './settings.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import secureStorage from '@/shared/storage/core/SecureStorage.js';
import { SelectionTranslationMode } from '@/shared/config/config.js';
import { LIVE_CAPTION_SETTINGS_KEYS } from '@/features/live-caption/constants/liveCaptionSettings.js';
import { STT_PROVIDER_IDS } from '@/features/live-caption/stt/STTProviderManifest.js';

// Mock Dependencies
vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  storageManager: {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(true),
    clear: vi.fn().mockResolvedValue(true),
    on: vi.fn(),
    off: vi.fn()
  }
}));

vi.mock('@/shared/storage/core/SecureStorage.js', () => ({
  default: {
    prepareForExport: vi.fn().mockResolvedValue({ encrypted: 'data' }),
    processImportedSettings: vi.fn().mockResolvedValue({ THEME: 'dark' })
  }
}));

vi.mock('@/core/extensionContext.js', () => ({
  default: {
    isContextError: vi.fn().mockReturnValue(false),
    handleContextError: vi.fn(),
    isContentScript: vi.fn().mockReturnValue(false)
  }
}));

// Mock logger to avoid console noise
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn()
  })
}));

vi.mock('@/shared/config/settingsMigrations.js', () => ({
  runSettingsMigrations: vi.fn().mockResolvedValue({ updates: { THEME: 'dark' }, logs: [] })
}));

describe('Settings Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('should initialize with default settings', () => {
    const store = useSettingsStore();
    expect(store.settings.THEME).toBe('auto');
  });

  it('should initialize live-caption scaffolding defaults', () => {
    const store = useSettingsStore();
    expect(store.settings.LIVE_CAPTION_ENABLED).toBe(false);
    expect(store.settings.LIVE_CAPTION_DISPLAY_MODE).toBe('translated_only');
    expect(store.settings.LIVE_CAPTION_QUALITY_PROFILE).toBe('balanced');
    expect(store.settings.LIVE_CAPTION_CACHE_MAX_ITEMS).toBe(500);
    expect(store.settings.LIVE_CAPTION_CACHE_MAX_BYTES).toBe(10485760);
    expect(store.settings.LIVE_CAPTION_STT_PROVIDER).toBe('openai_whisper');
    expect(store.settings.LIVE_CAPTION_RETRY_LIMIT).toBe(2);
    expect(store.settings.OPENAI_API_KEY).toBe('');
  });

  it('should load settings from storage', async () => {
    storageManager.get.mockResolvedValue({ THEME: 'dark', API_KEY: 'test-key' });
    const store = useSettingsStore();
    
    // Force reset and reload to ensure storage mock is used
    store.isInitialized = false;
    await store.loadSettings();
    await nextTick();
    
    expect(store.settings.THEME).toBe('dark');
    expect(store.settings.API_KEY).toBe('test-key');
  });

  it('should sanitize settings: fallback to ON_CLICK if FABs disabled', async () => {
    const store = useSettingsStore();
    store.settings.SHOW_DESKTOP_FAB = false;
    store.settings.SHOW_MOBILE_FAB = false;
    store.settings.selectionTranslationMode = SelectionTranslationMode.ON_FAB_CLICK;

    await store.saveAllSettings(true);
    await nextTick();

    expect(store.settings.selectionTranslationMode).toBe(SelectionTranslationMode.ON_CLICK);
  });

  it('updateSettingAndPersist should update local state and call storage', async () => {
    const store = useSettingsStore();
    store.settings.THEME = 'dark';
    await nextTick();
    
    await store.updateSettingAndPersist('THEME', 'light');
    await nextTick();

    expect(store.settings.THEME).toBe('light');
    expect(storageManager.set).toHaveBeenCalledWith({ THEME: 'light' });
  });

  it('should handle complex merge for EXCLUDED_SITES with various data types', async () => {
    // Case 1: Object format (legacy/migration)
    storageManager.get.mockResolvedValueOnce({ 
      EXCLUDED_SITES: { '0': 'google.com', '1': 'github.com' } 
    });
    const store = useSettingsStore();
    store.isInitialized = false;
    await store.loadSettings();
    expect(store.settings.EXCLUDED_SITES).toEqual(['google.com', 'github.com']);

    // Case 2: Array format (modern)
    storageManager.get.mockResolvedValueOnce({ 
      EXCLUDED_SITES: ['bing.com'] 
    });
    store.isInitialized = false;
    await store.loadSettings();
    expect(store.settings.EXCLUDED_SITES).toEqual(['bing.com']);

    // Case 3: Invalid format (fallback to empty)
    storageManager.get.mockResolvedValueOnce({ 
      EXCLUDED_SITES: 'invalid' 
    });
    store.isInitialized = false;
    await store.loadSettings();
    expect(store.settings.EXCLUDED_SITES).toEqual([]);
  });

  it('should handle translationHistory merge properly', async () => {
    const mockHistory = [{ text: 'hi', translated: 'سلام' }];
    storageManager.get.mockResolvedValue({ 
      translationHistory: mockHistory 
    });
    const store = useSettingsStore();
    store.isInitialized = false;
    await store.loadSettings();
    
    expect(store.settings.translationHistory).toEqual(mockHistory);
  });

  it('should persist and load advanced prompt templates', async () => {
    const store = useSettingsStore();
    const customPrompt = 'Custom Base Field Template $_{TEXT}';
    
    // 1. Update locally
    store.updateSettingLocally('PROMPT_BASE_FIELD', customPrompt);
    
    // 2. Save
    await store.saveAllSettings(true);
    expect(storageManager.set).toHaveBeenCalledWith(expect.objectContaining({
      PROMPT_BASE_FIELD: customPrompt
    }));
    
    // 3. Mock storage return for load
    storageManager.get.mockResolvedValue({ PROMPT_BASE_FIELD: customPrompt });
    
    // 4. Reload
    store.isInitialized = false;
    await store.loadSettings();
    await nextTick();
    
    expect(store.settings.PROMPT_BASE_FIELD).toBe(customPrompt);
  });

  describe('Import & Migration Flow', () => {
    it('importSettings should merge defaults and run migrations', async () => {
      const mockImportData = { THEME: 'dark', TRANSLATION_API: 'google' };
      const store = useSettingsStore();

      await store.importSettings(mockImportData);

      expect(store.settings.THEME).toBe('dark');
      expect(storageManager.set).toHaveBeenCalled();
    });  });

  describe('Strict Validation', () => {
    it('validateSettings should reject prompt without placeholder', () => {
      const store = useSettingsStore();
      store.settings.PROMPT_TEMPLATE = 'Translate this: hello'; // Missing $_{TEXT}
      
      const result = store.validateSettings();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('prompt:PROMPT_TEMPLATE:validation_prompt_template_missing_placeholders');
    });

    it('validateSettings should allow subtitle prompt without $_{TEXT}', () => {
      const store = useSettingsStore();
      // Only SOURCE and TARGET are required for subtitles in the registry
      store.settings.PROMPT_SUBTITLE_USER = 'Translate from $_{SOURCE} to $_{TARGET}.';
      
      const result = store.validateSettings();
      
      // Filter out other potential errors to focus on the subtitle prompt
      const subtitleErrors = result.errors.filter(e => e.includes('PROMPT_SUBTITLE_USER'));
      expect(subtitleErrors).toHaveLength(0);
    });

    it('validateSettings should reject subtitle prompt missing required language placeholders', () => {
      const store = useSettingsStore();
      store.settings.PROMPT_SUBTITLE_USER = 'Translate this.'; // Missing SOURCE and TARGET
      
      const result = store.validateSettings();
      expect(result.errors).toContain('prompt:PROMPT_SUBTITLE_USER:validation_prompt_template_missing_placeholders');
    });
  });

  it('resetSettings should clear storage and restore defaults', async () => {
    const store = useSettingsStore();
    store.settings.THEME = 'dark';
    
    await store.resetSettings();
    await nextTick();
    
    expect(storageManager.clear).toHaveBeenCalled();
    expect(store.settings.THEME).toBe('auto');
  });

  it('exportSettings should call secureStorage', async () => {
    const store = useSettingsStore();
    const result = await store.exportSettings('password123');
    
    expect(secureStorage.prepareForExport).toHaveBeenCalled();
    expect(result._exported).toBe(true);
  });

  describe('Debug Mode Cleanup', () => {
    it('should revert Live Caption STT provider from Mock to Whisper when Debug Mode is disabled', async () => {
      const store = useSettingsStore();
      
      // Set to mock while debug is enabled
      store.settings.DEBUG_MODE = true;
      store.settings[LIVE_CAPTION_SETTINGS_KEYS.STT_PROVIDER] = STT_PROVIDER_IDS.MOCK;
      await nextTick();

      // Disable debug mode
      await store.updateSettingAndPersist('DEBUG_MODE', false);
      await nextTick();

      expect(store.settings[LIVE_CAPTION_SETTINGS_KEYS.STT_PROVIDER]).toBe(STT_PROVIDER_IDS.OPENAI_WHISPER);
      expect(storageManager.set).toHaveBeenCalledWith(expect.objectContaining({
        [LIVE_CAPTION_SETTINGS_KEYS.STT_PROVIDER]: STT_PROVIDER_IDS.OPENAI_WHISPER
      }));
    });

    it('should not change STT provider when Debug Mode is disabled if not using Mock', async () => {
      const store = useSettingsStore();
      
      store.settings.DEBUG_MODE = true;
      store.settings[LIVE_CAPTION_SETTINGS_KEYS.STT_PROVIDER] = STT_PROVIDER_IDS.OPENAI_WHISPER;
      await nextTick();

      storageManager.set.mockClear();
      await store.updateSettingAndPersist('DEBUG_MODE', false);
      await nextTick();

      expect(store.settings[LIVE_CAPTION_SETTINGS_KEYS.STT_PROVIDER]).toBe(STT_PROVIDER_IDS.OPENAI_WHISPER);
      // Ensure STT_PROVIDER was NOT part of the update call
      const setCall = storageManager.set.mock.calls[0][0];
      expect(setCall).not.toHaveProperty(LIVE_CAPTION_SETTINGS_KEYS.STT_PROVIDER);
    });
  });

  it('should reactively update isDarkTheme in auto mode when system theme changes', async () => {
    let mediaQueryListener = null;
    window.matchMedia = vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn((event, handler) => {
        if (event === 'change') {
          mediaQueryListener = handler;
        }
      }),
      removeEventListener: vi.fn(),
      addListener: vi.fn((handler) => {
        mediaQueryListener = handler;
      }),
      removeListener: vi.fn(),
    }));

    storageManager.get.mockResolvedValue({});
    const store = useSettingsStore();
    store.settings.THEME = 'auto';

    await store.loadSettings();
    await nextTick();

    expect(store.isDarkTheme).toBe(false);

    mediaQueryListener({ matches: true });
    await nextTick();
    expect(store.isDarkTheme).toBe(true);

    mediaQueryListener({ matches: false });
    await nextTick();
    expect(store.isDarkTheme).toBe(false);
  });
});
