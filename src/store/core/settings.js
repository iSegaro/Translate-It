import { defineStore } from 'pinia'
import { ref, computed, onUnmounted } from 'vue'
import browser from 'webextension-polyfill'
import { CONFIG } from '@/config.js'
import secureStorage from '@/storage/core/SecureStorage.js'
import { getScopedLogger } from '@/utils/core/logger.js';
// Lazy-load storageManager to avoid unnecessary upfront cost (no longer needed for circular safety, retained for perf)
let __storageManagerPromise = null;
async function getStorageManager() {
  if (!__storageManagerPromise) {
    __storageManagerPromise = import('@/storage/core/StorageCore.js').then(m => m.storageManager);
  }
  return __storageManagerPromise;
}
const logger = getScopedLogger('Core', 'settings');

export const useSettingsStore = defineStore('settings', () => {
  // State - complete settings object with CONFIG defaults
  const settings = ref({
    // Basic settings
    THEME: CONFIG.THEME || 'auto',
    APPLICATION_LOCALIZE: CONFIG.APPLICATION_LOCALIZE || 'English',
    EXTENSION_ENABLED: CONFIG.EXTENSION_ENABLED ?? true,
    
    // Translation settings
    TRANSLATION_API: CONFIG.TRANSLATION_API || 'google',
    SOURCE_LANGUAGE: CONFIG.SOURCE_LANGUAGE || 'auto',
    TARGET_LANGUAGE: CONFIG.TARGET_LANGUAGE || 'English',
    selectionTranslationMode: CONFIG.selectionTranslationMode || 'onClick',
    COPY_REPLACE: CONFIG.COPY_REPLACE || 'copy',
    REPLACE_SPECIAL_SITES: CONFIG.REPLACE_SPECIAL_SITES ?? true,
    
    // Prompt settings
    PROMPT_TEMPLATE: CONFIG.PROMPT_TEMPLATE || 'Please translate the following text from $_{SOURCE} to $_{TARGET}:\n\n$_{TEXT}',
    
    // API keys and provider settings
    API_KEY: CONFIG.API_KEY || '',
    API_URL: CONFIG.API_URL || '',
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
    
    // Activation settings
    TRANSLATE_ON_TEXT_FIELDS: CONFIG.TRANSLATE_ON_TEXT_FIELDS ?? false,
    ENABLE_SHORTCUT_FOR_TEXT_FIELDS: CONFIG.ENABLE_SHORTCUT_FOR_TEXT_FIELDS ?? true,
    TRANSLATE_WITH_SELECT_ELEMENT: CONFIG.TRANSLATE_WITH_SELECT_ELEMENT ?? true,
    TRANSLATE_ON_TEXT_SELECTION: CONFIG.TRANSLATE_ON_TEXT_SELECTION ?? true,
    REQUIRE_CTRL_FOR_TEXT_SELECTION: CONFIG.REQUIRE_CTRL_FOR_TEXT_SELECTION ?? false,
    ENABLE_DICTIONARY: CONFIG.ENABLE_DICTIONARY ?? true,
    ENABLE_SUBTITLE_TRANSLATION: CONFIG.ENABLE_SUBTITLE_TRANSLATION ?? false,
    SHOW_SUBTITLE_ICON: CONFIG.SHOW_SUBTITLE_ICON ?? true,
    
    // Advanced settings
    DEBUG_MODE: CONFIG.DEBUG_MODE ?? false,
    USE_MOCK: CONFIG.USE_MOCK ?? false,
    EXCLUDED_SITES: CONFIG.EXCLUDED_SITES || [],
    
    // Migration and versioning
    VUE_MIGRATED: false,
    MIGRATION_DATE: null,
    MIGRATION_FROM_VERSION: null,
    EXTENSION_VERSION: null,
    
    // History (newly added to settings for centralized management)
    translationHistory: []
  })
  
  // Loading states
  const isLoading = ref(false)
  const isInitialized = ref(false)
  const isSaving = ref(false)
  
  // Getters
  const isDarkTheme = computed(() => {
    if (settings.value.THEME === 'auto') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return settings.value.THEME === 'dark'
  })
  
  const canTranslate = computed(() => {
    return settings.value.EXTENSION_ENABLED && settings.value.TRANSLATION_API && !isLoading.value
  })
  
  const sourceLanguage = computed(() => settings.value.SOURCE_LANGUAGE)
  const targetLanguage = computed(() => settings.value.TARGET_LANGUAGE)
  const selectedProvider = computed(() => settings.value.TRANSLATION_API)
  
  // Actions
  const loadSettings = async () => {
    if (isInitialized.value) return settings.value // Temporarily disable cache
    
    isLoading.value = true
    try {
      // Get all settings from storage using StorageManager
  const storageManager = await getStorageManager();
  const stored = await storageManager.get(null)
      
      // Merge with defaults, preserving existing values
      Object.keys(settings.value).forEach(key => {
        if (Object.prototype.hasOwnProperty.call(stored, key) && stored[key] !== undefined) {
          if (key === 'EXCLUDED_SITES') {
            if (Array.isArray(stored[key])) {
              settings.value[key] = stored[key];
            } else if (typeof stored[key] === 'object' && stored[key] !== null) {
              // Attempt to convert object to array of strings
              settings.value[key] = Object.values(stored[key]).filter(s => typeof s === 'string');
            } else {
              settings.value[key] = [];
            }
          } else if (key === 'translationHistory') {
            if (Array.isArray(stored[key])) {
              settings.value[key] = stored[key];
            } else {
              settings.value[key] = []; // Default to empty array if not an array
            }
          } else {
            settings.value[key] = stored[key]
          }
        }
      })
      
      logger.debug('✅ Settings after merge:', settings.value)
      isInitialized.value = true
      return settings.value
    } catch (error) {
      logger.error('Failed to load settings:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }
  
  const saveAllSettings = async () => {
    isSaving.value = true
    try {
  const storageManager = await getStorageManager();
  await storageManager.set(settings.value)
      return true
    } catch (error) {
      logger.error('Failed to save all settings:', error)
      throw error
    } finally {
      isSaving.value = false
    }
  }
  
  // Action to update a single setting in the local store state (without immediate persistence)
  const updateSettingLocally = (key, value) => {
    settings.value[key] = value
  }

  // Action to update a single setting and immediately persist it to storage
  const updateSettingAndPersist = async (key, value) => {
    try {
      logger.debug(`[settingsStore] updateSettingAndPersist: ${key} = ${value}`)
      settings.value[key] = value // Update local state
  const storageManager = await getStorageManager();
  await storageManager.set({ [key]: value }) // Persist immediately
      logger.debug(`[settingsStore] Successfully saved ${key} to browser storage`)
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
  const storageManager = await getStorageManager();
  await storageManager.set(settings.value)
      
      return true
    } catch (error) {
      logger.error('Failed to update multiple settings:', error)
      throw error
    }
  }
  
  const resetSettings = async () => {
    try {
      // Clear all storage using StorageManager
  const storageManager = await getStorageManager();
  await storageManager.clear()
      
      // Reset to CONFIG defaults
      const defaultSettings = {
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
        API_URL: CONFIG.API_URL || '',
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
        ENABLE_SUBTITLE_TRANSLATION: CONFIG.ENABLE_SUBTITLE_TRANSLATION ?? false,
        SHOW_SUBTITLE_ICON: CONFIG.SHOW_SUBTITLE_ICON ?? true,
        DEBUG_MODE: CONFIG.DEBUG_MODE ?? false,
        USE_MOCK: CONFIG.USE_MOCK ?? false,
        EXCLUDED_SITES: CONFIG.EXCLUDED_SITES || [],
        translationHistory: []
      }
      
      settings.value = { ...defaultSettings }
      await saveAllSettings()
      
      return true
    } catch (error) {
      logger.error('Failed to reset settings:', error)
      throw error
    }
  }
  
  const exportSettings = async (password = '') => {
    try {
      // Lazy read manifest version (avoid hardcoding); fallback to undefined if runtime not available.
      let version;
      try { version = browser.runtime.getManifest()?.version; } catch(_) {}
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
      window.location.reload();
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
    const provider = settings.value.SELECTED_PROVIDER
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
  
  const checkMigrationStatus = () => {
    return {
      isVueMigrated: settings.value.VUE_MIGRATED || false,
      migrationDate: settings.value.MIGRATION_DATE,
      migrationFromVersion: settings.value.MIGRATION_FROM_VERSION,
      extensionVersion: settings.value.EXTENSION_VERSION,
      hasLegacyData: !!(settings.value.translationHistory || settings.value.lastTranslation)
    }
  }
  
  const markMigrationComplete = async (fromVersion = 'legacy') => {
    try {
      const manifest = browser.runtime.getManifest()
      
      const migrationData = {
        VUE_MIGRATED: true,
        MIGRATION_DATE: new Date().toISOString(),
        MIGRATION_FROM_VERSION: fromVersion,
        EXTENSION_VERSION: manifest.version
      }
      
      await saveAllSettings()
      
      logger.debug('Migration status updated:', migrationData)
      return true
    } catch (error) {
      logger.error('Failed to mark migration complete:', error)
      throw error
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
            settings.value[key] = newValue
            logger.debug(`[SettingsStore] Setting '${key}' updated from storage:`, newValue)
          }
        }
      }
    }
  }

  // Setup storage listener using StorageManager
  const setupStorageListener = async () => {
    try {
      storageListener = handleStorageChange
  const storageManager = await getStorageManager();
  storageManager.on('change', storageListener)
      logger.debug('[SettingsStore] Storage listener setup successfully with StorageManager')
    } catch (error) {
      logger.warn('[SettingsStore] Unable to setup storage listener:', error.message)
    }
  }

  // Cleanup storage listener using StorageManager
  const cleanupStorageListener = async () => {
    if (storageListener) {
      try {
  getStorageManager().then(sm => sm.off('change', storageListener))
        storageListener = null
        logger.debug('[SettingsStore] Storage listener cleaned up from StorageManager')
      } catch (error) {
        logger.error('[SettingsStore] Error cleaning up storage listener:', error)
      }
    }
  }

  // Initialize settings on store creation and setup listener
  loadSettings().then(() => {
    setupStorageListener()
  }).catch(error => {
    logger.error('Failed to initialize settings store:', error)
  })

  // Cleanup listener on store destruction
  onUnmounted(() => {
    cleanupStorageListener()
  })
  
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
    validateSettings,
    checkMigrationStatus,
    markMigrationComplete
  }
})

export default useSettingsStore