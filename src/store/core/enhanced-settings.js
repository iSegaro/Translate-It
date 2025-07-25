import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useEnhancedSettingsStore = defineStore('enhanced-settings', () => {
  // State - complete settings object
  const settings = ref({
    // Basic settings
    theme: 'auto',
    language: 'en',
    EXTENSION_ENABLED: true,
    
    // Translation settings
    SELECTED_PROVIDER: 'google',
    SOURCE_LANGUAGE: 'auto',
    TARGET_LANGUAGE: 'English',
    TRANSLATION_MODE: 'popup',
    COPY_REPLACE: 'replace',
    
    // Prompt settings
    PROMPT_TEMPLATE: 'Please translate the following text from $_{SOURCE} to $_{TARGET}:\n\n$_{TEXT}',
    
    // API keys and provider settings
    API_KEY: '',
    GEMINI_MODEL: 'gemini-2.5-flash',
    OPENAI_MODEL: 'gpt-4',
    OPENROUTER_MODEL: 'openai/gpt-4',
    DEEPSEEK_MODEL: 'deepseek-chat',
    CUSTOM_API_URL: '',
    CUSTOM_API_KEY: '',
    CUSTOM_API_MODEL: '',
    
    // Activation settings
    ENABLE_POPUP_TRANSLATION: true,
    ENABLE_ELEMENT_SELECTION: true,
    ENABLE_INSTANT_TRANSLATION: false,
    ENABLE_SHORTCUT: true,
    ENABLE_CONTEXT_MENU: true,
    ENABLE_FIELD_TRANSLATION: true,
    ENABLE_DICTIONARY: false,
    ENABLE_SUBTITLE_TRANSLATION: true,
    SHOW_SUBTITLE_ICON: true,
    
    // Advanced settings
    DEBUG_MODE: false,
    USE_MOCK: false,
    EXCLUDED_SITES: [],
    
    // Import/Export
    EXPORT_PASSWORD: '',
    IMPORT_PASSWORD: ''
  })
  
  // Loading states
  const isLoading = ref(false)
  const isInitialized = ref(false)
  const isSaving = ref(false)
  
  // Getters
  const isDarkTheme = computed(() => {
    if (settings.value.theme === 'auto') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return settings.value.theme === 'dark'
  })
  
  const canTranslate = computed(() => {
    return settings.value.EXTENSION_ENABLED && settings.value.SELECTED_PROVIDER && !isLoading.value
  })
  
  const sourceLanguage = computed(() => settings.value.SOURCE_LANGUAGE)
  const targetLanguage = computed(() => settings.value.TARGET_LANGUAGE)
  const selectedProvider = computed(() => settings.value.SELECTED_PROVIDER)
  
  // Actions
  const loadSettings = async () => {
    if (isInitialized.value) return settings.value
    
    isLoading.value = true
    try {
      // Get all settings from storage
      const stored = await browser.storage.local.get(null)
      
      // Merge with defaults, preserving existing values
      Object.keys(settings.value).forEach(key => {
        if (Object.prototype.hasOwnProperty.call(stored, key) && stored[key] !== undefined) {
          settings.value[key] = stored[key]
        }
      })
      
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
      
      // Save to storage
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
      
      // Save to storage
      await browser.storage.local.set(updates)
      
      return true
    } catch (error) {
      console.error('Failed to update multiple settings:', error)
      throw error
    }
  }
  
  const resetSettings = async () => {
    try {
      // Clear all storage
      await browser.storage.local.clear()
      
      // Reset to defaults
      const defaultSettings = {
        theme: 'auto',
        language: 'en',
        EXTENSION_ENABLED: true,
        SELECTED_PROVIDER: 'google',
        SOURCE_LANGUAGE: 'auto',
        TARGET_LANGUAGE: 'English',
        TRANSLATION_MODE: 'popup',
        COPY_REPLACE: 'replace',
        PROMPT_TEMPLATE: 'Please translate the following text from $_{SOURCE} to $_{TARGET}:\n\n$_{TEXT}',
        API_KEY: '',
        GEMINI_MODEL: 'gemini-2.5-flash',
        OPENAI_MODEL: 'gpt-4',
        OPENROUTER_MODEL: 'openai/gpt-4',
        DEEPSEEK_MODEL: 'deepseek-chat',
        CUSTOM_API_URL: '',
        CUSTOM_API_KEY: '',
        CUSTOM_API_MODEL: '',
        ENABLE_POPUP_TRANSLATION: true,
        ENABLE_ELEMENT_SELECTION: true,
        ENABLE_INSTANT_TRANSLATION: false,
        ENABLE_SHORTCUT: true,
        ENABLE_CONTEXT_MENU: true,
        ENABLE_FIELD_TRANSLATION: true,
        ENABLE_DICTIONARY: false,
        ENABLE_SUBTITLE_TRANSLATION: true,
        SHOW_SUBTITLE_ICON: true,
        DEBUG_MODE: false,
        USE_MOCK: false,
        EXCLUDED_SITES: [],
        EXPORT_PASSWORD: '',
        IMPORT_PASSWORD: ''
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
  
  // Initialize settings on store creation
  loadSettings()
  
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
    validateSettings
  }
})

export default useEnhancedSettingsStore