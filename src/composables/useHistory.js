// src/composables/useHistory.js
// Vue composable for translation history management in sidepanel with improved API handling
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useBrowserAPI } from './useBrowserAPI.js'
import { useSettingsStore } from '@/store/core/settings.js'
import { SimpleMarkdown } from '@/utils/simpleMarkdown.js'
import { correctTextDirection } from '@/utils/textDetection.js'
import { getTranslationString } from '@/utils/i18n.js'

const MAX_HISTORY_ITEMS = 100

export function useHistory() {
  // State
  const historyItems = ref([])
  const isLoading = ref(false)
  const historyError = ref('')
  const isHistoryPanelOpen = ref(false)

  // Composables
  const browserAPI = useBrowserAPI()
  const settingsStore = useSettingsStore()

  // Computed
  const hasHistory = computed(() => historyItems.value.length > 0)
  const sortedHistoryItems = computed(() => {
    // Show newest items first
    return [...historyItems.value].reverse()
  })

  // Load history from storage
  const loadHistory = async () => {
    try {
      isLoading.value = true
      historyError.value = ''

      await settingsStore.loadSettings()
      const settings = settingsStore.settings
      historyItems.value = settings.translationHistory || []
      
      console.log(`[useHistory] Loaded ${historyItems.value.length} history items`)
    } catch (error) {
      console.error('[useHistory] Error loading history:', error)
      historyError.value = 'Failed to load history'
      historyItems.value = []
    } finally {
      isLoading.value = false
    }
  }

  // Add item to history
  const addToHistory = async (translationData) => {
    try {
      const historyItem = {
        sourceText: translationData.sourceText,
        translatedText: translationData.translatedText,
        sourceLanguage: translationData.sourceLanguage,
        targetLanguage: translationData.targetLanguage,
        timestamp: Date.now()
      }

      // Add to local state
      historyItems.value.push(historyItem)

      // Limit history size
      if (historyItems.value.length > MAX_HISTORY_ITEMS) {
        historyItems.value.splice(0, historyItems.value.length - MAX_HISTORY_ITEMS)
      }

      // Save to storage
      await browserAPI.safeStorageSet({ translationHistory: historyItems.value })
      
      console.log('[useHistory] Added to history:', translationData.sourceText)
    } catch (error) {
      console.error('[useHistory] Error adding to history:', error)
      historyError.value = 'Failed to save to history'
    }
  }

  // Delete specific history item
  const deleteHistoryItem = async (index) => {
    try {
      if (index >= 0 && index < historyItems.value.length) {
        historyItems.value.splice(index, 1)
        
        await browserAPI.safeStorageSet({ translationHistory: historyItems.value })
        
        console.log('[useHistory] Deleted history item at index:', index)
      }
    } catch (error) {
      console.error('[useHistory] Error deleting history item:', error)
      historyError.value = 'Failed to delete history item'
    }
  }

  // Clear all history
  const clearAllHistory = async () => {
    try {
      const confirmMessage = await getTranslationString('CONFIRM_CLEAR_ALL_HISTORY') || 
                           'Are you sure you want to clear all translation history?'

      const userConfirmed = window.confirm(confirmMessage)

      if (userConfirmed) {
        historyItems.value = []
        
        await browserAPI.safeStorageSet({ translationHistory: [] })
        
        console.log('[useHistory] Cleared all history')
        return true
      }
      return false
    } catch (error) {
      console.error('[useHistory] Error clearing history:', error)
      historyError.value = 'Failed to clear history'
      return false
    }
  }

  // Format timestamp for display
  const formatTime = (timestamp) => {
    if (!timestamp) return ''

    const date = new Date(timestamp)
    const now = new Date()
    const diff = now - date

    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`

    return date.toLocaleDateString()
  }

  // Create markdown content safely
  const createMarkdownContent = (text) => {
    if (!text) return null

    try {
      return SimpleMarkdown.render(text)
    } catch (error) {
      console.error('[useHistory] Error parsing markdown:', error)
      return null
    }
  }

  // Handle history item selection
  const selectHistoryItem = (item, onSelectCallback) => {
    if (onSelectCallback && typeof onSelectCallback === 'function') {
      onSelectCallback(item)
    }
  }

  // Set history panel open state externally
  const setHistoryPanelOpen = (value) => {
    isHistoryPanelOpen.value = value
  }

  // Handle storage changes from other parts of extension
  const handleStorageChange = (changes) => {
    if (changes.translationHistory) {
      const newHistory = changes.translationHistory.newValue || []
      if (JSON.stringify(newHistory) !== JSON.stringify(historyItems.value)) {
        historyItems.value = newHistory
        console.log('[useHistory] History updated from storage')
      }
    }
  }

  // Storage change listener
  let storageListener = null

  // Setup storage listener
  const setupStorageListener = async () => {
    try {
      storageListener = await browserAPI.setupStorageListener(handleStorageChange)
      if (storageListener) {
        console.log('[useHistory] Storage listener setup successfully')
      } else {
        console.warn('[useHistory] Browser storage API not available, skipping listener setup')
      }
    } catch (error) {
      console.warn('[useHistory] Unable to setup storage listener:', error.message)
    }
  }

  // Cleanup storage listener
  const cleanupStorageListener = async () => {
    if (storageListener) {
      try {
        await browserAPI.removeStorageListener(storageListener)
        storageListener = null
      } catch (error) {
        console.error('[useHistory] Error cleaning up storage listener:', error)
      }
    }
  }

  // Initialize
  const initialize = async () => {
    await loadHistory()
    await setupStorageListener()
  }

  // Cleanup
  const cleanup = async () => {
    await cleanupStorageListener()
  }

  // Lifecycle
  onMounted(() => {
    initialize()
  })

  onUnmounted(() => {
    cleanup()
  })

  return {
    // State
    historyItems,
    isLoading,
    historyError,
    isHistoryPanelOpen,

    // Computed
    hasHistory,
    sortedHistoryItems,

    // Methods
    loadHistory,
    addToHistory,
    deleteHistoryItem,
    clearAllHistory,
    selectHistoryItem,
    
    // Panel Management
    setHistoryPanelOpen,

    // Utilities
    formatTime,
    createMarkdownContent,
    initialize,
    cleanup
  }
}