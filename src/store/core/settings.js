import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getBrowserAPI } from '@/utils/browser-unified.js'

export const useSettingsStore = defineStore('settings', () => {
  // State
  const theme = ref('auto')
  const language = ref('en')
  const extensionEnabled = ref(true)
  const selectedProvider = ref('google')
  const sourceLanguage = ref('auto')
  const targetLanguage = ref('en')
  const translationMode = ref('popup')
  const copyReplaceMode = ref('replace')
  
  // Loading states
  const isLoading = ref(false)
  const isInitialized = ref(false)
  
  // Getters
  const isDarkTheme = computed(() => {
    if (theme.value === 'auto') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return theme.value === 'dark'
  })
  
  const canTranslate = computed(() => {
    return extensionEnabled.value && selectedProvider.value && !isLoading.value
  })
  
  // Actions
  const loadSettings = async () => {
    if (isInitialized.value) {
      console.log('🔄 Settings already initialized, skipping load')
      return
    }
    
    console.log('📥 Loading settings from storage...')
    isLoading.value = true
    try {
      // Get browser API
      console.log('🌐 Getting browser API...')
      const browser = await getBrowserAPI()
      console.log('✅ Browser API ready')
      
      // Load from extension storage
      console.log('📦 Reading from extension storage...')
      const stored = await browser.storage.local.get([
        'theme',
        'language',
        'EXTENSION_ENABLED',
        'SELECTED_PROVIDER',
        'SOURCE_LANGUAGE',
        'TARGET_LANGUAGE',
        'TRANSLATION_MODE',
        'COPY_REPLACE'
      ])
      console.log('📋 Storage data:', stored)
      
      // Update state with stored values
      if (stored.theme) theme.value = stored.theme
      if (stored.language) language.value = stored.language
      if (typeof stored.EXTENSION_ENABLED === 'boolean') extensionEnabled.value = stored.EXTENSION_ENABLED
      if (stored.SELECTED_PROVIDER) selectedProvider.value = stored.SELECTED_PROVIDER
      if (stored.SOURCE_LANGUAGE) sourceLanguage.value = stored.SOURCE_LANGUAGE
      if (stored.TARGET_LANGUAGE) targetLanguage.value = stored.TARGET_LANGUAGE
      if (stored.TRANSLATION_MODE) translationMode.value = stored.TRANSLATION_MODE
      if (stored.COPY_REPLACE) copyReplaceMode.value = stored.COPY_REPLACE
      
      console.log('✅ Settings applied to store')
      isInitialized.value = true
    } catch (error) {
      console.error('❌ Failed to load settings:', error)
      throw error
    } finally {
      isLoading.value = false
      console.log('📥 Settings loading complete')
    }
  }
  
  const saveSettings = async () => {
    try {
      // Get browser API
      const browser = await getBrowserAPI()
      
      await browser.storage.local.set({
        theme: theme.value,
        language: language.value,
        EXTENSION_ENABLED: extensionEnabled.value,
        SELECTED_PROVIDER: selectedProvider.value,
        SOURCE_LANGUAGE: sourceLanguage.value,
        TARGET_LANGUAGE: targetLanguage.value,
        TRANSLATION_MODE: translationMode.value,
        COPY_REPLACE: copyReplaceMode.value
      })
    } catch (error) {
      console.error('Failed to save settings:', error)
      throw error
    }
  }
  
  const updateSetting = async (key, value) => {
    try {
      // Update local state
      switch (key) {
        case 'theme':
          theme.value = value
          break
        case 'language':
          language.value = value
          break
        case 'extensionEnabled':
          extensionEnabled.value = value
          break
        case 'selectedProvider':
          selectedProvider.value = value
          break
        case 'sourceLanguage':
          sourceLanguage.value = value
          break
        case 'targetLanguage':
          targetLanguage.value = value
          break
        case 'translationMode':
          translationMode.value = value
          break
        case 'copyReplaceMode':
          copyReplaceMode.value = value
          break
      }
      
      // Save to storage
      await saveSettings()
    } catch (error) {
      console.error(`Failed to update setting ${key}:`, error)
      throw error
    }
  }
  
  const swapLanguages = async () => {
    if (sourceLanguage.value === 'auto') return
    
    const temp = sourceLanguage.value
    sourceLanguage.value = targetLanguage.value
    targetLanguage.value = temp
    
    await saveSettings()
  }
  
  const resetToDefaults = async () => {
    theme.value = 'auto'
    language.value = 'en'
    extensionEnabled.value = true
    selectedProvider.value = 'google'
    sourceLanguage.value = 'auto'
    targetLanguage.value = 'en'
    translationMode.value = 'popup'
    copyReplaceMode.value = 'replace'
    
    await saveSettings()
  }
  
  // Initialize on store creation
  loadSettings()
  
  return {
    // State
    theme,
    language,
    extensionEnabled,
    selectedProvider,
    sourceLanguage,
    targetLanguage,
    translationMode,
    copyReplaceMode,
    isLoading,
    isInitialized,
    
    // Getters
    isDarkTheme,
    canTranslate,
    
    // Actions
    loadSettings,
    saveSettings,
    updateSetting,
    swapLanguages,
    resetToDefaults
  }
})