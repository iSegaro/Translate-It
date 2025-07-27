import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ErrorTypes } from '@/services/ErrorTypes.js'

// Lazy load factory to avoid circular dependencies
let translationProviderFactory = null
const getTranslationProviderFactory = async () => {
  if (!translationProviderFactory) {
    const module = await import('@/providers/factory/TranslationProviderFactory.js')
    translationProviderFactory = module.translationProviderFactory
  }
  return translationProviderFactory
}

export const useTranslationStore = defineStore('translation', () => {
  // State
  const currentTranslation = ref(null)
  const history = ref([])
  const isLoading = ref(false)
  const selectedProvider = ref('google')
  const cache = ref(new Map())
  const error = ref(null)

  // Getters
  const recentTranslations = computed(() => 
    history.value.slice(0, 10)
  )
  
  const hasCache = computed(() => 
    cache.value.size > 0
  )

  const supportedProviders = computed(() =>
    translationProviderFactory.getSupportedProviders()
  )

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
      // Use real provider system
      const factory = await getTranslationProviderFactory()
      const providerInstance = factory.getProvider(provider)
      const translatedText = await providerInstance.translate(text, from, to, mode)
      
      const result = {
        text: translatedText,
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
    const factory = await getTranslationProviderFactory()
    if (factory.isProviderSupported(provider)) {
      selectedProvider.value = provider
      error.value = null
    } else {
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
      const factory = await getTranslationProviderFactory()
      const providerInstance = factory.getProvider(provider)
      
      // Check if provider supports image translation
      if (typeof providerInstance.translateImage !== 'function') {
        throw new Error(`Provider ${provider} does not support image translation`)
      }
      
      const translatedText = await providerInstance.translateImage(imageData, from, to, mode)
      
      const result = {
        text: translatedText,
        sourceText: '[Image]',
        fromLanguage: from,
        toLanguage: to,
        provider: provider,
        mode: mode,
        timestamp: Date.now(),
        confidence: 0.85, // Lower confidence for OCR+translation
        isImageTranslation: true
      }
      
      currentTranslation.value = result
      addToHistory(result)
      
      return result
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
    const factory = await getTranslationProviderFactory()
    factory.resetProviders(apiType)
  }

  const isProviderSupported = async (provider) => {
    const factory = await getTranslationProviderFactory()
    return factory.isProviderSupported(provider)
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