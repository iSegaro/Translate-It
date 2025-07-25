import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getBrowserAPI } from '@/utils/browser-unified.js'
import { CONFIG } from '@/config.js'

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
    EXTENSION_VERSION: null
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
    if (isInitialized.value) return settings.value
    
    isLoading.value = true
    try {
      // Get browser API
      const browser = await getBrowserAPI()
      
      // Get all settings from storage
      const stored = await browser.storage.local.get(null)
      console.log('📦 Loaded from storage:', stored)
      
      // Merge with defaults, preserving existing values
      Object.keys(settings.value).forEach(key => {
        if (Object.prototype.hasOwnProperty.call(stored, key) && stored[key] !== undefined) {
          settings.value[key] = stored[key]
        }
      })
      
      console.log('✅ Settings after merge:', settings.value)
      isInitialized.value = true
      return settings.value
    } catch (error) {
      console.error('Failed to load settings:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }
  
  const saveSettings = async (settingsToSave = null) => {
    isSaving.value = true
    try {
      // Get browser API
      const browser = await getBrowserAPI()
      
      const dataToSave = settingsToSave || settings.value
      await browser.storage.local.set(dataToSave)
      
      // If we're saving external settings, update our local state
      if (settingsToSave) {
        Object.assign(settings.value, settingsToSave)
      }
      
      return true
    } catch (error) {
      console.error('Failed to save settings:', error)
      throw error
    } finally {
      isSaving.value = false
    }
  }
  
  const updateSetting = async (key, value) => {
    try {
      // Update local state immediately
      settings.value[key] = value
      
      // Get browser API and save to storage
      const browser = await getBrowserAPI()
      await browser.storage.local.set({ [key]: value })
      
      return true
    } catch (error) {
      console.error(`Failed to update setting ${key}:`, error)
      throw error
    }
  }
  
  const updateMultipleSettings = async (updates) => {
    try {
      // Update local state
      Object.assign(settings.value, updates)
      
      // Get browser API and save to storage
      const browser = await getBrowserAPI()
      await browser.storage.local.set(updates)
      
      return true
    } catch (error) {
      console.error('Failed to update multiple settings:', error)
      throw error
    }
  }
  
  const resetSettings = async () => {
    try {
      // Get browser API and clear all storage
      const browser = await getBrowserAPI()
      await browser.storage.local.clear()
      
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
        EXCLUDED_SITES: CONFIG.EXCLUDED_SITES || []
      }
      
      settings.value = { ...defaultSettings }
      await saveSettings()
      
      return true
    } catch (error) {
      console.error('Failed to reset settings:', error)
      throw error
    }
  }
  
  const exportSettings = async (password = '') => {
    try {
      const exportData = {
        ...settings.value,
        _exported: true,
        _timestamp: new Date().toISOString(),
        _version: '0.10.0'
      }
      
      // Note: In real implementation, encrypt API keys if password provided
      if (password) {
        exportData._hasEncryptedKeys = true
        // Actual encryption would happen here
      }
      
      return exportData
    } catch (error) {
      console.error('Failed to export settings:', error)
      throw error
    }
  }
  
  const importSettings = async (importData, password = '') => {
    try {
      // Validate import data
      if (!importData._exported) {
        throw new Error('Invalid settings file format')
      }
      
      // Note: In real implementation, decrypt if password provided
      if (importData._hasEncryptedKeys && !password) {
        throw new Error('Password required for encrypted settings')
      }
      
      // Remove metadata
      const { _exported, _timestamp, _version, _hasEncryptedKeys, ...cleanData } = importData
      
      // Update settings
      await saveSettings(cleanData)
      
      return true
    } catch (error) {
      console.error('Failed to import settings:', error)
      throw error
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
      const browser = await getBrowserAPI()
      const manifest = browser.runtime.getManifest()
      
      const migrationData = {
        VUE_MIGRATED: true,
        MIGRATION_DATE: new Date().toISOString(),
        MIGRATION_FROM_VERSION: fromVersion,
        EXTENSION_VERSION: manifest.version
      }
      
      await updateMultipleSettings(migrationData)
      
      console.log('Migration status updated:', migrationData)
      return true
    } catch (error) {
      console.error('Failed to mark migration complete:', error)
      throw error
    }
  }
  
  // Initialize settings on store creation (with error handling)
  loadSettings().catch(error => {
    console.error('Failed to initialize settings store:', error)
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
    saveSettings,
    updateSetting,
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