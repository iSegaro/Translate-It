import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
// Use literal component name to avoid circular TDZ on LOG_COMPONENTS during early store evaluation
const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'translation-store');

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
  const translateText = async () => {
    // This store is currently not directly handling translation requests.
    // Translation logic is handled by composables (e.g., useSidepanelTranslation, usePopupTranslation)
    // which use UnifiedMessenger directly.
    logger.warn("TranslationStore: translateText is a placeholder. Use composables for translation.");
    return Promise.resolve(null);

    /* 
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
      // Use UnifiedTranslationClient for messaging with background service worker
      const client = new UnifiedTranslationClient('store')
      const response = await client.translate(text, {
        provider,
        sourceLanguage: from,
        targetLanguage: to,
        mode
      })
    */
      /*
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
      logger.error('Translation error:', err)
      throw new Error(`Translation failed: ${err.message}`)
    } finally {
      isLoading.value = false
    }
    */
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
    // This store is currently not directly setting providers.
    // Provider selection is handled by useApiProvider composable.
    logger.warn("TranslationStore: setProvider is a placeholder. Use useApiProvider for provider selection.");
    selectedProvider.value = provider; // Still update local state
  }

  const resetProviders = async () => {
    // This store is currently not directly resetting providers.
    logger.warn("TranslationStore: resetProviders is a placeholder.");
  }

  const isProviderSupported = async () => {
    // This store is currently not directly checking provider support.
    logger.warn("TranslationStore: isProviderSupported is a placeholder.");
    return false;
  }

  const clearCache = () => {
    cache.value.clear();
  }

  const clearError = () => {
    error.value = null;
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
    addToHistory,
    clearHistory,
    clearCache,
    clearError,
    setProvider,
    resetProviders,
    isProviderSupported
  }
})