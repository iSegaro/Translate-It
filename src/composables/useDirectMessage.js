// src/composables/useDirectMessage.js
// Direct message sending without complex wrappers for debugging

import { ref } from 'vue'
import { getBrowserAPI } from '@/utils/browser-unified.js'

export function useDirectMessage() {
  const isReady = ref(false)

  /**
   * Direct message sending for debugging
   */
  const directSendMessage = async (message) => {
    try {
      console.log('[useDirectMessage] Getting browser API...')
      const browser = await getBrowserAPI()
      console.log('[useDirectMessage] Browser API obtained:', !!browser)
      
      if (!browser || !browser.runtime) {
        throw new Error('Browser API not available')
      }

      console.log('[useDirectMessage] Sending direct message:', message)
      
      // Direct call without Promise.race or timeout wrapper
      const response = await browser.runtime.sendMessage(message)
      
      console.log('[useDirectMessage] Direct response received:', response)
      return response
      
    } catch (error) {
      console.error('[useDirectMessage] Direct message failed:', error)
      
      // Return a simple error object
      return { 
        success: false, 
        error: 'Direct message failed: ' + error.message,
        _isConnectionError: true 
      }
    }
  }

  /**
   * Send translation message with minimal wrapping
   */
  const sendTranslation = async (payload, abortSignal) => {
    console.log('[useDirectMessage] Sending translation with payload:', payload)
    
    // Check if request was cancelled before starting
    if (abortSignal?.aborted) {
      throw new Error('Request was cancelled before sending')
    }
    
    const message = {
      action: 'fetchTranslation',
      target: 'background', // Explicitly target background service worker
      payload: payload
    }
    
    // If abort signal provided, race the request against cancellation
    if (abortSignal) {
      return new Promise((resolve, reject) => {
        // Set up abort handler
        const abortHandler = () => {
          const abortError = new Error('Request cancelled')
          abortError.name = 'AbortError'
          reject(abortError)
        }
        
        if (abortSignal.aborted) {
          abortHandler()
          return
        }
        
        abortSignal.addEventListener('abort', abortHandler)
        
        // Send the actual request
        directSendMessage(message)
          .then(resolve)
          .catch(reject)
          .finally(() => {
            abortSignal.removeEventListener('abort', abortHandler)
          })
      })
    }
    
    return await directSendMessage(message)
  }

  return {
    isReady,
    directSendMessage,
    sendTranslation
  }
}