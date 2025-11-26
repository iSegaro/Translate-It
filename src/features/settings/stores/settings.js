import { defineStore } from 'pinia'
import { ref, computed, onUnmounted, getCurrentInstance } from 'vue'
import browser from 'webextension-polyfill'
import { CONFIG } from '@/shared/config/config.js'
import secureStorage from '@/shared/storage/core/SecureStorage.js'
import { storageManager } from '@/shared/storage/core/StorageCore.js'
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.SETTINGS, 'settings');

// --- Helpers ------------------------------------------------------------
function getDefaultSettings() {
  return {
    THEME: CONFIG.THEME || 'auto',
    APPLICATION_LOCALIZE: CONFIG.APPLICATION_LOCALIZE || 'English',
    EXTENSION_ENABLED: CONFIG.EXTENSION_ENABLED ?? true,
    TRANSLATION_API: CONFIG.TRANSLATION_API || 'google',
    SOURCE_LANGUAGE: CONFIG.SOURCE_LANGUAGE || 'auto',
    TARGET_LANGUAGE: CONFIG.TARGET_LANGUAGE || 'English',
    selectionTranslationMode: CONFIG.selectionTranslationMode || 'onClick',
    COPY_REPLACE: CONFIG.COPY_REPLACE || 'copy',
    REPLACE_SPECIAL_SITES: CONFIG.REPLACE_SPECIAL_SITES ?? true,
    PROMPT_TEMPLATE: CONFIG.PROMPT_TEMPLATE || 'Please translate the following text from $_{SOURCE} to $_{TARGET}:\n\n$_{TEXT}',
    API_KEY: CONFIG.API_KEY || '',
    GEMINI_API_URL: CONFIG.GEMINI_API_URL || '',
    GEMINI_MODEL: CONFIG.GEMINI_MODEL || 'gemini-2.5-flash',
    GEMINI_THINKING_ENABLED: CONFIG.GEMINI_THINKING_ENABLED ?? true,
    WEBAI_API_URL: CONFIG.WEBAI_API_URL || 'http://localhost:6969/translate',
    WEBAI_API_MODEL: CONFIG.WEBAI_API_MODEL || 'gemini-2.0-flash',
    OPENAI_API_KEY: CONFIG.OPENAI_API_KEY || '',
    OPENAI_API_MODEL: CONFIG.OPENAI_API_MODEL || 'gpt-4o',
    OPENROUTER_API_KEY: CONFIG.OPENROUTER_API_KEY || '',
    OPENROUTER_API_MODEL: CONFIG.OPENROUTER_API_MODEL || 'openai/gpt-4o',
    DEEPSEEK_API_KEY: CONFIG.DEEPSEEK_API_KEY || '',
    DEEPSEEK_API_MODEL: CONFIG.DEEPSEEK_API_MODEL || 'deepseek-chat',
    CUSTOM_API_URL: CONFIG.CUSTOM_API_URL || '',
    CUSTOM_API_KEY: CONFIG.CUSTOM_API_KEY || '',
    CUSTOM_API_MODEL: CONFIG.CUSTOM_API_MODEL || '',
    TRANSLATE_ON_TEXT_FIELDS: CONFIG.TRANSLATE_ON_TEXT_FIELDS ?? false,
    ENABLE_SHORTCUT_FOR_TEXT_FIELDS: CONFIG.ENABLE_SHORTCUT_FOR_TEXT_FIELDS ?? true,
    TRANSLATE_WITH_SELECT_ELEMENT: CONFIG.TRANSLATE_WITH_SELECT_ELEMENT ?? true,
    TRANSLATE_ON_TEXT_SELECTION: CONFIG.TRANSLATE_ON_TEXT_SELECTION ?? true,
    REQUIRE_CTRL_FOR_TEXT_SELECTION: CONFIG.REQUIRE_CTRL_FOR_TEXT_SELECTION ?? false,
    ENABLE_DICTIONARY: CONFIG.ENABLE_DICTIONARY ?? true,
    ACTIVE_SELECTION_ICON_ON_TEXTFIELDS: CONFIG.ACTIVE_SELECTION_ICON_ON_TEXTFIELDS ?? false,
    ENHANCED_TRIPLE_CLICK_DRAG: CONFIG.ENHANCED_TRIPLE_CLICK_DRAG ?? false,
    DEBUG_MODE: CONFIG.DEBUG_MODE ?? false,
    USE_MOCK: CONFIG.USE_MOCK ?? false,
    EXCLUDED_SITES: CONFIG.EXCLUDED_SITES || [],
    // Proxy Settings
    PROXY_ENABLED: CONFIG.PROXY_ENABLED ?? false,
    PROXY_TYPE: CONFIG.PROXY_TYPE || 'http',
    PROXY_HOST: CONFIG.PROXY_HOST || '',
    PROXY_PORT: CONFIG.PROXY_PORT || 8080,
    PROXY_USERNAME: CONFIG.PROXY_USERNAME || '',
    PROXY_PASSWORD: CONFIG.PROXY_PASSWORD || '',
    // Font Settings
    TRANSLATION_FONT_FAMILY: CONFIG.TRANSLATION_FONT_FAMILY || 'auto',
    TRANSLATION_FONT_SIZE: CONFIG.TRANSLATION_FONT_SIZE || '14',
    translationHistory: []
  };
}

export const useSettingsStore = defineStore('settings', () => {
  // State - complete settings object with CONFIG defaults
  const settings = ref(getDefaultSettings())
  
  // Loading states
  const isLoading = ref(false)
  const isInitialized = ref(false)
  const isSaving = ref(false)
  
  // Getters
  const isDarkTheme = computed(() => {
    if (settings.value.THEME === 'auto') {
      return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return settings.value.THEME === 'dark'
  })
  
  const canTranslate = computed(() => {
    return settings.value.EXTENSION_ENABLED && settings.value.TRANSLATION_API && !isLoading.value
  })
  
  const sourceLanguage = computed(() => settings.value.SOURCE_LANGUAGE)
  const targetLanguage = computed(() => settings.value.TARGET_LANGUAGE)
  const selectedProvider = computed(() => settings.value.TRANSLATION_API)
  
  // Font settings getters
  const fontFamily = computed(() => settings.value.TRANSLATION_FONT_FAMILY)
  const fontSize = computed(() => settings.value.TRANSLATION_FONT_SIZE)
  
  // Actions
  let __loadInFlight = null;
  const loadSettings = async () => {
    if (isInitialized.value) return settings.value;
    if (__loadInFlight) return __loadInFlight;
    isLoading.value = true;
    __loadInFlight = (async () => {
      try {
        const stored = await storageManager.get(null);
        const current = settings.value;

  
        // Merge settings from storage (after potential migrations)
        Object.keys(current).forEach(key => {
          if (Object.prototype.hasOwnProperty.call(stored, key) && stored[key] !== undefined) {
            if (key === 'EXCLUDED_SITES') {
              if (Array.isArray(stored[key])) current[key] = stored[key];
              else if (typeof stored[key] === 'object' && stored[key] !== null) current[key] = Object.values(stored[key]).filter(s => typeof s === 'string');
              else current[key] = [];
            } else if (key === 'translationHistory') {
              current[key] = Array.isArray(stored[key]) ? stored[key] : [];
            } else {
              current[key] = stored[key];
            }
          }
        });

        logger.debug('Settings merged from storage');

        isInitialized.value = true;
        return current;
      } catch (error) {
        logger.error('Failed to load settings:', error);
        throw error;
      } finally {
        isLoading.value = false;
        __loadInFlight = null;
      }
    })();
    return __loadInFlight;
  }
  
  // Debounced save (simple trailing debounce)
  let __saveTimer = null;
  const saveAllSettings = async (immediate = false) => {
    if (immediate) {
      clearTimeout(__saveTimer);
      return performSave();
    }
    return new Promise((resolve, reject) => {
      clearTimeout(__saveTimer);
      __saveTimer = setTimeout(() => performSave().then(resolve).catch(reject), 120);
    });
  }
  async function performSave() {
    isSaving.value = true;
    try {
      await storageManager.set(settings.value);
      return true;
    } catch (error) {
      logger.error('Failed to save all settings:', error);
      throw error;
    } finally {
      isSaving.value = false;
    }
  }
  
  // Action to update a single setting in the local store state (without immediate persistence)
  const updateSettingLocally = (key, value) => {
    settings.value[key] = value
  }

  // Action to update a single setting and immediately persist it to storage
  const updateSettingAndPersist = async (key, value) => {
    try {
      settings.value[key] = value // Update local state
      await storageManager.set({ [key]: value }) // Persist immediately
      return true
    } catch (error) {
      logger.error(`Failed to update and persist setting ${key}:`, error)
      throw error
    }
  }
  
  const updateMultipleSettings = async (updates) => {
    try {
      // Update local state
      Object.assign(settings.value, updates)
      
      // Get browser API and save to storage
  await storageManager.set(settings.value)
      
      return true
    } catch (error) {
      logger.error('Failed to update multiple settings:', error)
      throw error
    }
  }
  
  const resetSettings = async () => {
    try {
      await storageManager.clear();
      const defaults = getDefaultSettings();
      // Preserve reference to reactive object
      Object.keys(settings.value).forEach(k => delete settings.value[k]);
      Object.assign(settings.value, defaults);
      await saveAllSettings(true);
      return true;
    } catch (error) {
      logger.error('Failed to reset settings:', error);
      throw error;
    }
  }
  
  const exportSettings = async (password = '') => {
    try {
      // Lazy read manifest version (avoid hardcoding); fallback to undefined if runtime not available.
      let version;
      try { 
        version = browser.runtime.getManifest()?.version; 
      } catch {
        // Browser runtime not available, use undefined
      }
      const exportData = {
        ...settings.value,
        _exported: true,
        _timestamp: new Date().toISOString(),
        _version: version
      };
      if (password) {
        exportData._hasEncryptedKeys = true; // placeholder flag
      }
      return exportData;
    } catch (error) {
      logger.error('Failed to export settings:', error);
      throw error;
    }
  }
  
  const importSettings = async (importData, password = '') => {
    try {
      logger.info('[Import] Starting');
      const processedSettings = await secureStorage.processImportedSettings(importData, password);
      Object.assign(settings.value, processedSettings);
      // Normalize possible empty regex placeholders
      if (typeof settings.value.RTL_REGEX === 'object' && settings.value.RTL_REGEX !== null && Object.keys(settings.value.RTL_REGEX).length === 0) {
        settings.value.RTL_REGEX = CONFIG.RTL_REGEX;
      }
      if (typeof settings.value.PERSIAN_REGEX === 'object' && settings.value.PERSIAN_REGEX !== null && Object.keys(settings.value.PERSIAN_REGEX).length === 0) {
        settings.value.PERSIAN_REGEX = CONFIG.PERSIAN_REGEX;
      }
      await saveAllSettings();
      logger.info('[Import] Completed – reloading UI');
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
      return true;
    } catch (error) {
      logger.error('[Import] Failed:', error);
      throw error;
    }
  }
  
  const getSetting = (key, defaultValue = null) => {
    return settings.value[key] !== undefined ? settings.value[key] : defaultValue
  }
  
  const validateSettings = () => {
    const errors = []
    
    // Validate languages
    if (!settings.value.SOURCE_LANGUAGE) {
      errors.push('Source language is required')
    }
    
    if (!settings.value.TARGET_LANGUAGE) {
      errors.push('Target language is required')
    }
    
    if (settings.value.SOURCE_LANGUAGE === settings.value.TARGET_LANGUAGE) {
      errors.push('Source and target languages cannot be the same')
    }
    
    // Validate API keys for selected provider
  const provider = settings.value.TRANSLATION_API
    if (['gemini', 'openai', 'openrouter', 'deepseek', 'custom'].includes(provider)) {
      const keyField = provider === 'custom' ? 'CUSTOM_API_KEY' : 'API_KEY'
      if (!settings.value[keyField]) {
        errors.push(`API key is required for ${provider}`)
      }
    }
    
    // Validate prompt template
    if (!settings.value.PROMPT_TEMPLATE || !settings.value.PROMPT_TEMPLATE.includes('$_{TEXT}')) {
      errors.push('Prompt template must include $_{TEXT} placeholder')
    }
    
    return {
      isValid: errors.length === 0,
      errors
    }
  }
  
    
  // Storage change listener
  let storageListener = null

  // Handle storage changes from other parts of extension
  const handleStorageChange = (changes, areaName) => {
    if (areaName === 'local') {
      for (const key in changes) {
        if (Object.prototype.hasOwnProperty.call(changes, key)) {
          const newValue = changes[key].newValue
          // Update the reactive settings ref
          if (settings.value[key] !== newValue) {
            const oldValue = settings.value[key]
            settings.value[key] = newValue

            // Special handling for DEBUG_MODE - sync with logging system
            if (key === 'DEBUG_MODE' && oldValue !== newValue) {
              handleDebugModeChange(Boolean(newValue))
            }
          }
        }
      }
    }
  }

  // Handle DEBUG_MODE changes and sync with logging system
  const handleDebugModeChange = async (debugMode) => {
    try {
      // Import and initialize DebugModeBridge
      const { debugModeBridge } = await import('@/shared/logging/DebugModeBridge.js')

      // Apply debug mode to logging system
      debugModeBridge.handleDebugModeChange(debugMode)

      logger.info('[SettingsStore] DEBUG_MODE changed and synced with logging system', {
        debugMode,
        source: 'storage_change'
      })
    } catch (error) {
      logger.warn('[SettingsStore] Failed to sync DEBUG_MODE with logging system:', error)
    }
  }

  // Setup storage listener using StorageManager
  const setupStorageListener = async () => {
    try {
      storageListener = handleStorageChange
  storageManager.on('change', storageListener)
  if (settings.value.DEBUG_MODE) logger.info('[SettingsStore] Listener setup')
    } catch (error) {
      logger.warn('[SettingsStore] Unable to setup storage listener:', error.message)
    }
  }

  // Cleanup storage listener using StorageManager
  const cleanupStorageListener = async () => {
    if (!storageListener) return;
    try {
      storageManager.off('change', storageListener);
      storageListener = null;
  if (settings.value.DEBUG_MODE) logger.info('[SettingsStore] Listener cleaned up');
    } catch (error) {
      logger.error('[SettingsStore] Error cleaning up storage listener:', error);
    }
  }

  // Initialize settings on store creation and setup listener
  loadSettings().then(async () => {
    setupStorageListener()

    // Initialize DebugModeBridge after settings are loaded
    try {
      const { debugModeBridge } = await import('@/shared/logging/DebugModeBridge.js')
      await debugModeBridge.initialize()

      logger.info('[SettingsStore] DebugModeBridge initialized successfully', {
        currentDebugMode: settings.value.DEBUG_MODE
      })
    } catch (error) {
      logger.warn('[SettingsStore] Failed to initialize DebugModeBridge:', error)
    }
  }).catch(error => {
    logger.error('Failed to initialize settings store:', error)
  })

  // Cleanup listener on store destruction - only if we're in a component context
  const instance = getCurrentInstance()
  if (instance) {
    onUnmounted(() => {
      cleanupStorageListener()
    })
  }
  // Note: If not in component context, cleanup will happen when browser extension unloads
  
  return {
    // State
    settings,
    isLoading,
    isInitialized,
    isSaving,
    
    // Getters
    isDarkTheme,
    canTranslate,
    sourceLanguage,
    targetLanguage,
    selectedProvider,
    fontFamily,
    fontSize,
    
    // Actions
    loadSettings,
    saveAllSettings,
    updateSettingLocally,
    updateSettingAndPersist,
    updateMultipleSettings,
    resetSettings,
    exportSettings,
    importSettings,
    getSetting,
    validateSettings
  }
})

export default useSettingsStore