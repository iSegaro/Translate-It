// src/composables/useBrowserAPI.js
// Vue composable for reliable browser API access with Vue lifecycle integration

import { ref, onMounted, onUnmounted } from 'vue'
import { getBrowserAPI } from '@/utils/browser-unified.js'

// Global state for API readiness
const globalApiReady = ref(false)
const globalBrowserAPI = ref(null)
const globalReadyPromise = ref(null)

// Singleton initialization
const initializeBrowserAPI = async () => {
  if (globalReadyPromise.value) {
    return globalReadyPromise.value
  }

  globalReadyPromise.value = new Promise(async (resolve, reject) => {
    try {
      // Multiple retry attempts for sidepanel context
      let attempts = 0
      const maxAttempts = 10
      const retryDelay = 100

      while (attempts < maxAttempts) {
        try {
          const browser = await getBrowserAPI()
          
          // Verify essential APIs are available
          if (browser && browser.storage && browser.runtime) {
            // Test storage access
            await browser.storage.local.get(['test'])
            
            globalBrowserAPI.value = browser
            globalApiReady.value = true
            
            console.log('✅ [useBrowserAPI] Browser API initialized successfully')
            resolve(browser)
            return
          }
        } catch (error) {
          console.warn(`[useBrowserAPI] Attempt ${attempts + 1} failed:`, error.message)
        }

        attempts++
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, retryDelay))
        }
      }

      throw new Error(`Failed to initialize browser API after ${maxAttempts} attempts`)
    } catch (error) {
      console.error('❌ [useBrowserAPI] Browser API initialization failed:', error)
      globalApiReady.value = false
      reject(error)
    }
  })

  return globalReadyPromise.value
}

export function useBrowserAPI() {
  // Local state
  const isReady = ref(globalApiReady.value)
  const api = ref(globalBrowserAPI.value)
  const error = ref('')
  const isLoading = ref(!globalApiReady.value)

  // Reactive updates
  const updateState = () => {
    isReady.value = globalApiReady.value
    api.value = globalBrowserAPI.value
    isLoading.value = !globalApiReady.value
  }

  // Initialize on mount
  onMounted(async () => {
    try {
      if (!globalApiReady.value) {
        await initializeBrowserAPI()
      }
      updateState()
    } catch (err) {
      error.value = err.message
      isLoading.value = false
      console.error('[useBrowserAPI] Mount initialization failed:', err)
    }
  })

  // Ensure browser API is ready before operations
  const ensureReady = async () => {
    if (globalApiReady.value) {
      return globalBrowserAPI.value
    }

    try {
      return await initializeBrowserAPI()
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  // Safe storage operations
  const safeStorageGet = async (keys) => {
    try {
      const browser = await ensureReady()
      return await browser.storage.local.get(keys)
    } catch (err) {
      console.error('[useBrowserAPI] Storage get failed:', err)
      throw err
    }
  }

  const safeStorageSet = async (data) => {
    try {
      const browser = await ensureReady()
      return await browser.storage.local.set(data)
    } catch (err) {
      console.error('[useBrowserAPI] Storage set failed:', err)
      throw err
    }
  }

  // Safe message sending with retry mechanism
  const safeSendMessage = async (message) => {
    const maxRetries = message.action === 'fetchTranslation' || message.action === 'fetchTranslationBackground' ? 3 : 1
    let lastError = null
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const browser = await ensureReady()
        
        console.log(`[useBrowserAPI] Sending message (attempt ${attempt}/${maxRetries}):`, message.action)
        console.log(`[useBrowserAPI] Browser API state:`, { initialized: globalApiReady.value, api: !!globalBrowserAPI.value })
        
        // Use the unified browser API which handles promisification correctly
        // Increase timeout for translation operations which can take longer
        const timeoutMs = message.action === 'fetchTranslation' || message.action === 'fetchTranslationBackground' ? 15000 : 5000
        
        const response = await Promise.race([
          browser.runtime.sendMessage(message),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Message timeout')), timeoutMs)
          )
        ])

        console.log(`[useBrowserAPI] Received response (attempt ${attempt}):`, response)
        
        // Check if response is valid and not "Unknown action"
        if (response && response.success === true && response.data) {
          console.log(`[useBrowserAPI] Success response received on attempt ${attempt}`)
          return response
        } else if (response && response.error === 'Unknown action' && attempt < maxRetries) {
          console.warn(`[useBrowserAPI] Received "Unknown action" on attempt ${attempt}, retrying...`)
          lastError = new Error('Unknown action received')
          // Wait longer for background script to initialize
          const waitTime = attempt * 2000 // 2s, 4s progression
          console.log(`[useBrowserAPI] Waiting ${waitTime}ms before retry...`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
          continue
        } else if (response && response.success === false && response.error !== 'Unknown action') {
          // This is a real error from the handler, return it immediately
          console.log(`[useBrowserAPI] Handler error received on attempt ${attempt}:`, response.error)
          return response
        } else {
          // On last attempt or unknown response, return what we got
          return response
        }
        
      } catch (err) {
        console.error(`[useBrowserAPI] Send message failed (attempt ${attempt}/${maxRetries}):`, err)
        lastError = err
        
        if (attempt < maxRetries) {
          console.log(`[useBrowserAPI] Retrying in 1 second...`)
          await new Promise(resolve => setTimeout(resolve, 1000))
          continue
        }
      }
    }
    
    // If all retries failed, handle the error
    if (lastError) {
      console.error('[useBrowserAPI] All retry attempts failed:', lastError)
      
      // Handle common connection errors gracefully
      if (lastError.message.includes('message port closed') || 
          lastError.message.includes('Could not establish connection') ||
          lastError.message.includes('Extension context invalidated')) {
        return { error: 'Connection lost', _isConnectionError: true }
      }
      
      throw lastError
    }
    
    return { error: 'All retry attempts failed', _isConnectionError: true }
  }

  // Storage change listener setup
  const setupStorageListener = async (callback) => {
    try {
      const browser = await ensureReady()
      if (browser.storage && browser.storage.onChanged) {
        const listener = (changes, areaName) => {
          if (areaName === 'local') {
            callback(changes)
          }
        }
        browser.storage.onChanged.addListener(listener)
        return listener
      } else {
        console.warn('[useBrowserAPI] browser.storage.onChanged is not available. Settings cache might become stale.')
        return null
      }
    } catch (err) {
      console.warn('[useBrowserAPI] Storage listener setup failed:', err)
      return null
    }
  }

  const removeStorageListener = async (listener) => {
    if (!listener) return
    
    try {
      const browser = await ensureReady()
      if (browser.storage && browser.storage.onChanged) {
        browser.storage.onChanged.removeListener(listener)
      }
    } catch (err) {
      console.warn('[useBrowserAPI] Storage listener removal failed:', err)
    }
  }

  return {
    // State
    isReady,
    api,
    error,
    isLoading,

    // Methods
    ensureReady,
    safeStorageGet,
    safeStorageSet,
    safeSendMessage,
    setupStorageListener,
    removeStorageListener,

    // Utilities
    updateState
  }
}

// Export singleton initialization for direct use
export { initializeBrowserAPI }