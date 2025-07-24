import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useProvidersStore = defineStore('providers', () => {
  // State
  const selectedProvider = ref('google')
  const availableProviders = ref([
    { id: 'google', name: 'Google Translate', type: 'free', enabled: true },
    { id: 'openai', name: 'OpenAI GPT', type: 'ai', enabled: false },
    { id: 'gemini', name: 'Google Gemini', type: 'ai', enabled: false },
    { id: 'deepseek', name: 'DeepSeek', type: 'ai', enabled: false },
    { id: 'bing', name: 'Bing Translator', type: 'free', enabled: true },
    { id: 'yandex', name: 'Yandex Translate', type: 'free', enabled: true }
  ])
  const apiKeys = ref({})
  
  // Getters
  const enabledProviders = computed(() => 
    availableProviders.value.filter(p => p.enabled)
  )
  
  const freeProviders = computed(() => 
    availableProviders.value.filter(p => p.type === 'free')
  )
  
  const aiProviders = computed(() => 
    availableProviders.value.filter(p => p.type === 'ai')
  )
  
  const currentProvider = computed(() => 
    availableProviders.value.find(p => p.id === selectedProvider.value)
  )
  
  // Actions
  const setProvider = (providerId) => {
    const provider = availableProviders.value.find(p => p.id === providerId)
    if (provider && provider.enabled) {
      selectedProvider.value = providerId
    }
  }
  
  const enableProvider = (providerId, enabled = true) => {
    const provider = availableProviders.value.find(p => p.id === providerId)
    if (provider) {
      provider.enabled = enabled
    }
  }
  
  const setApiKey = (providerId, apiKey) => {
    apiKeys.value[providerId] = apiKey
  }
  
  const getApiKey = (providerId) => {
    return apiKeys.value[providerId] || ''
  }
  
  const hasApiKey = (providerId) => {
    return Boolean(apiKeys.value[providerId])
  }
  
  return {
    // State
    selectedProvider,
    availableProviders,
    apiKeys,
    
    // Getters
    enabledProviders,
    freeProviders,
    aiProviders,
    currentProvider,
    
    // Actions
    setProvider,
    enableProvider,
    setApiKey,
    getApiKey,
    hasApiKey
  }
})