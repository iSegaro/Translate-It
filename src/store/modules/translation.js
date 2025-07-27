import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ErrorTypes } from '@/error-management/ErrorTypes.js'

// Translation client for messaging with background service worker
import { TranslationClient, TRANSLATION_CONTEXTS } from '@/core/translation-client.js'

let translationClient = null
const getTranslationClient = () => {
  if (!translationClient) {
    translationClient = new TranslationClient(TRANSLATION_CONTEXTS.POPUP)
  }
  return translationClient
}

export const useTranslationStore = defineStore('translation', () => {
  // State
  const currentTranslation = ref(null)
  const history = ref([])
  const isLoading = ref(false)
  const selectedProvider = ref('google')
  const cache = ref(new Map())
  const error = ref(null)
  const providers = ref([])

  // Getters
  const recentTranslations = computed(() => 
    history.value.slice(0, 10)
  )
  
  const hasCache = computed(() => 
    cache.value.size > 0
  )

  const supportedProviders = computed(() => {
    // In Vue context, we get providers via message to background service
    // This will be populated when the store loads provider data
    return providers.value || []
  })

  // Actions
  const translateText = async (text, options = {}) => {
    const { from = 'auto', to = 'en', provider = selectedProvider.value, mode = 'simple' } = options
    
    if (!text?.trim()) {
      throw new Error('Text to translate cannot be empty')
    }

    // Check cache first
    const cacheKey = `${text}-${from}-${to}-${provider}-${mode}`
    if (cache.value.has(cacheKey)) {
      const cachedResult = cache.value.get(cacheKey)
      currentTranslation.value = cachedResult
      return cachedResult
    }

    isLoading.value = true
    error.value = null
    
    try {
      // Use translation client for messaging with background service worker
      const client = getTranslationClient()
      const response = await client.translate(text, {
        provider,
        sourceLanguage: from,
        targetLanguage: to,
        mode
      })
      
      const result = {
        text: response.translatedText,
        sourceText: text,
        fromLanguage: from,
        toLanguage: to,
        provider: provider,
        mode: mode,
        timestamp: Date.now(),
        confidence: 0.95 // Default confidence, could be provider-specific
      }
      
      // Update state
      currentTranslation.value = result
      addToHistory(result)
      
      // Cache result
      cache.value.set(cacheKey, result)
      
      return result
    } catch (err) {
      error.value = err.message || 'Translation failed'
      console.error('Translation error:', err)
      throw new Error(`Translation failed: ${err.message}`)
    } finally {
      isLoading.value = false
    }
  }

  const addToHistory = (translation) => {
    history.value.unshift({
      ...translation,
      timestamp: Date.now(),
      id: crypto.randomUUID()
    })
    
    // Keep only last 100 translations
    if (history.value.length > 100) {
      history.value = history.value.slice(0, 100)
    }
  }

  const clearHistory = () => {
    history.value = []
  }

  const setProvider = async (provider) => {
    // Validate provider via background service
    const client = getTranslationClient()
    try {
      await client.sendMessage({
        action: 'VALIDATE_PROVIDER',
        provider
      })
      selectedProvider.value = provider
      error.value = null
    } catch (error) {
      throw new Error(`Unsupported provider: ${provider}`)
    }
  }

  const translateImage = async (imageData, options = {}) => {
    const { from = 'auto', to = 'en', provider = selectedProvider.value, mode = 'simple' } = options
    
    if (!imageData) {
      throw new Error('Image data cannot be empty')
    }

    isLoading.value = true
    error.value = null
    
    try {
      // Image translation not yet implemented in the new messaging architecture
      // This will be added in a future update
      throw new Error('Image translation is not available in the new architecture yet')
    } catch (err) {
      error.value = err.message || 'Image translation failed'
      console.error('Image translation error:', err)
      throw new Error(`Image translation failed: ${err.message}`)
    } finally {
      isLoading.value = false
    }
  }

  const clearCache = () => {
    cache.value.clear()
  }

  const clearError = () => {
    error.value = null
  }

  const resetProviders = async (apiType = null) => {
    // Reset providers via background service
    const client = getTranslationClient()
    await client.sendMessage({
      action: 'RESET_PROVIDERS',
      apiType
    })
  }

  const isProviderSupported = async (provider) => {
    // Check provider support via background service
    const client = getTranslationClient()
    try {
      const response = await client.sendMessage({
        action: 'IS_PROVIDER_SUPPORTED',
        provider
      })
      return response.supported
    } catch (error) {
      return false
    }
  }

  return {
    // State
    currentTranslation,
    history,
    isLoading,
    selectedProvider,
    error,
    
    // Getters
    recentTranslations,
    hasCache,
    supportedProviders,
    
    // Actions
    translateText,
    translateImage,
    addToHistory,
    clearHistory,
    clearCache,
    clearError,
    setProvider,
    resetProviders,
    isProviderSupported
  }
})