// src/composables/useBackgroundWarmup.js
// Background script warm-up system for Chrome service worker

import { ref, onMounted } from 'vue'
import { useBrowserAPI } from './useBrowserAPI.js'

const isWarmedUp = ref(false)
const warmupInProgress = ref(false)
const warmupPromise = ref(null)

export function useBackgroundWarmup() {
  const browserAPI = useBrowserAPI()

  /**
   * Warm up the background script by sending ping messages
   */
  const warmupBackground = async () => {
    if (isWarmedUp.value || warmupInProgress.value) {
      return warmupPromise.value
    }

    warmupInProgress.value = true
    console.log('[useBackgroundWarmup] Starting background script warm-up...')

    warmupPromise.value = new Promise((resolve) => {
      const attemptWarmup = async () => {
        let attempts = 0
        const maxAttempts = 5
        const baseDelay = 500

        while (attempts < maxAttempts && !isWarmedUp.value) {
        attempts++
        console.log(`[useBackgroundWarmup] Warm-up attempt ${attempts}/${maxAttempts}`)

        try {
          const response = await browserAPI.safeSendMessage({ 
            action: 'ping',
            warmup: true 
          })

          if (response && response.success) {
            console.log('[useBackgroundWarmup] Background script is ready!')
            isWarmedUp.value = true
            warmupInProgress.value = false
            resolve(true)
            return
          }
        } catch (error) {
          console.warn(`[useBackgroundWarmup] Attempt ${attempts} failed:`, error.message)
        }

        if (attempts < maxAttempts) {
          const delay = baseDelay * attempts
          console.log(`[useBackgroundWarmup] Waiting ${delay}ms before next attempt...`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
        }

        // Even if we don't get a successful ping, assume it's ready after attempts
        console.log('[useBackgroundWarmup] Warm-up completed (assumed ready)')
        isWarmedUp.value = true
        warmupInProgress.value = false
        resolve(false)
      }
      
      attemptWarmup()
    })

    return warmupPromise.value
  }

  /**
   * Ensure background is warmed up before critical operations
   */
  const ensureWarmedUp = async () => {
    if (!isWarmedUp.value) {
      await warmupBackground()
    }
    return isWarmedUp.value
  }

  /**
   * Reset warm-up state (useful after extension reload)
   */
  const resetWarmup = () => {
    isWarmedUp.value = false
    warmupInProgress.value = false
    warmupPromise.value = null
    console.log('[useBackgroundWarmup] Warm-up state reset')
  }

  // Auto warm-up on mount for critical components
  onMounted(async () => {
    // Small delay to allow component to settle
    setTimeout(() => {
      warmupBackground().catch(error => {
        console.warn('[useBackgroundWarmup] Auto warm-up failed:', error)
      })
    }, 100)
  })

  return {
    isWarmedUp,
    warmupInProgress,
    warmupBackground,
    ensureWarmedUp,
    resetWarmup
  }
}