import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useHistoryStore = defineStore('history', () => {
  // State
  const items = ref([])
  const maxItems = ref(100)
  
  // Getters
  const recentItems = computed(() => 
    items.value.slice(0, 10)
  )
  
  const itemCount = computed(() => 
    items.value.length
  )
  
  const isEmpty = computed(() => 
    items.value.length === 0
  )
  
  // Actions
  const addItem = (translation) => {
    const historyItem = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      sourceText: translation.sourceText,
      translatedText: translation.text,
      fromLanguage: translation.fromLanguage,
      toLanguage: translation.toLanguage,
      provider: translation.provider,
      confidence: translation.confidence
    }
    
    // Add to beginning of array
    items.value.unshift(historyItem)
    
    // Keep only max items
    if (items.value.length > maxItems.value) {
      items.value = items.value.slice(0, maxItems.value)
    }
    
    return historyItem
  }
  
  const removeItem = (itemId) => {
    const index = items.value.findIndex(item => item.id === itemId)
    if (index !== -1) {
      items.value.splice(index, 1)
    }
  }
  
  const clear = () => {
    items.value = []
  }
  
  const search = (query) => {
    const lowerQuery = query.toLowerCase()
    return items.value.filter(item => 
      item.sourceText.toLowerCase().includes(lowerQuery) ||
      item.translatedText.toLowerCase().includes(lowerQuery)
    )
  }
  
  const getByLanguagePair = (fromLang, toLang) => {
    return items.value.filter(item => 
      item.fromLanguage === fromLang && item.toLanguage === toLang
    )
  }
  
  const getByProvider = (provider) => {
    return items.value.filter(item => item.provider === provider)
  }
  
  return {
    // State
    items,
    maxItems,
    
    // Getters
    recentItems,
    itemCount,
    isEmpty,
    
    // Actions
    addItem,
    removeItem,
    clear,
    search,
    getByLanguagePair,
    getByProvider
  }
})