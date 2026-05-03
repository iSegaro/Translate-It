import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { nextTick } from 'vue';
import useSettingsStore from './settings.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import secureStorage from '@/shared/storage/core/SecureStorage.js';
import { SelectionTranslationMode } from '@/shared/config/config.js';

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

describe('Settings Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('should initialize with default settings', () => {
    const store = useSettingsStore();
    expect(store.settings.THEME).toBe('auto');
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

  describe('Import & Migration Flow', () => {
    it('importSettings should merge defaults and run migrations', async () => {
      const mockImportData = { THEME: 'dark', TRANSLATION_API: 'google' };
      const store = useSettingsStore();
      
      // Mock migration logic
      vi.mock('@/shared/config/settingsMigrations.js', () => ({
        runSettingsMigrations: vi.fn().mockResolvedValue({ updates: { THEME: 'dark' }, logs: [] })
      }));

      await store.importSettings(mockImportData);
      
      expect(store.settings.THEME).toBe('dark');
      expect(storageManager.set).toHaveBeenCalled();
    });
  });

  describe('Strict Validation', () => {
    it('validateSettings should reject prompt without placeholder', () => {
      const store = useSettingsStore();
      store.settings.PROMPT_TEMPLATE = 'Translate this: hello'; // Missing $_{TEXT}
      
      const result = store.validateSettings();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Prompt template must include $_{TEXT} placeholder');
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
});
