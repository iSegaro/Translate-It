// src/composables/actions/useTTSAction.js
// Unified TTS action composable

import { ref } from 'vue'
import { getScopedLogger } from '@/utils/core/logger.js'
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js'
import { useBrowserAPI } from '@/composables/useBrowserAPI.js'
import { getLanguageCodeForTTS } from '@/utils/i18n/languages.js'
import { MessageActions } from '@/messaging/core/MessageActions.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'useTTSAction')

export function useTTSAction() {
  // Dependencies
  const browserAPI = useBrowserAPI()

  // State
  const isPlaying = ref(false)
  const currentText = ref('')
  const currentLanguage = ref('')
  const ttsError = ref(null)

  // TTS method priority
  const TTS_METHODS = {
    UNIFIED: 'unified',    // Background service (preferred)
    GOOGLE: 'google',      // Direct Google TTS
    WEBSPEECH: 'webspeech' // Web Speech API (fallback)
  }

  /**
   * Speak text using the best available method
   * @param {string} text - Text to speak
   * @param {string} language - Language code
   * @returns {Promise<boolean>} Success status
   */
  const speak = async (text, language = 'auto') => {
    if (!text || typeof text !== 'string' || !text.trim()) {
      logger.warn('[useTTSAction] Invalid text provided for TTS')
      return false
    }

    if (isPlaying.value) {
      logger.debug('[useTTSAction] Stopping current TTS before starting new one')
      await stop()
    }

    isPlaying.value = true
    currentText.value = text
    currentLanguage.value = language
    ttsError.value = null

    const langCode = getLanguageCodeForTTS(language) || 'en'
    logger.debug('[useTTSAction] Starting TTS:', {
      text: text.substring(0, 50) + '...',
      language: langCode
    })

    // Try methods in priority order
    const methods = [
      () => speakUnified(text, langCode),
      () => speakWebSpeech(text, langCode),
      () => speakGoogleDirect(text, langCode)
    ]

    for (const method of methods) {
      try {
        const success = await method()
        if (success) {
          logger.debug('[useTTSAction] TTS completed successfully')
          return true
        }
      } catch (error) {
        logger.warn('[useTTSAction] TTS method failed, trying next:', error.message)
        ttsError.value = error
      }
    }

    logger.error('[useTTSAction] All TTS methods failed')
    isPlaying.value = false
    return false
  }

  /**
   * Stop any currently playing TTS
   * @returns {Promise<boolean>} Success status
   */
  const stop = async () => {
    if (!isPlaying.value) return true

    try {
      logger.debug('[useTTSAction] Stopping TTS')

      // Stop Web Speech API
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }

      // Stop any audio elements (Google TTS)
      const audioElements = document.querySelectorAll('audio')
      audioElements.forEach(audio => {
        audio.pause()
        audio.src = ''
      })

      isPlaying.value = false
      currentText.value = ''
      currentLanguage.value = ''
      
      return true
    } catch (error) {
      logger.error('[useTTSAction] Error stopping TTS:', error)
      ttsError.value = error
      return false
    }
  }

  /**
   * Speak using unified background service (preferred method)
   * @param {string} text - Text to speak
   * @param {string} language - Language code
   * @returns {Promise<boolean>} Success status
   */
  const speakUnified = async (text, language) => {
    try {
      const { sendReliable } = await import('@/messaging/core/ReliableMessaging.js')
      const response = await sendReliable({
        action: MessageActions.GOOGLE_TTS_SPEAK,
        data: { text: text.trim(), language }
      })

      if (response?.success) {
        // Set playing state with timeout (since background TTS doesn't provide events)
        setTimeout(() => {
          if (isPlaying.value && currentText.value === text) {
            isPlaying.value = false
          }
        }, Math.min(text.length * 100, 10000)) // Estimate duration

        return true
      }

      throw new Error(response?.error || 'Unified TTS failed')
    } catch (error) {
      logger.warn('[useTTSAction] Unified TTS failed:', error)
      throw error
    }
  }

  /**
   * Speak using Web Speech API
   * @param {string} text - Text to speak
   * @param {string} language - Language code
   * @returns {Promise<boolean>} Success status
   */
  const speakWebSpeech = (text, language) => {
    return new Promise((resolve, reject) => {
      if (!window.speechSynthesis) {
        reject(new Error('Speech synthesis not supported'))
        return
      }

      try {
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = language
        utterance.rate = 0.9
        utterance.pitch = 1
        utterance.volume = 1

        utterance.onend = () => {
          if (isPlaying.value && currentText.value === text) {
            isPlaying.value = false
          }
          resolve(true)
        }

        utterance.onerror = (event) => {
          isPlaying.value = false
          reject(new Error(`Web Speech TTS failed: ${event.error}`))
        }

        utterance.onstart = () => {
          logger.debug('[useTTSAction] Web Speech TTS started')
        }

        // Cancel any existing speech
        window.speechSynthesis.cancel()
        
        // Start speaking
        window.speechSynthesis.speak(utterance)
        
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Speak using direct Google TTS (fallback)
   * @param {string} text - Text to speak
   * @param {string} language - Language code
   * @returns {Promise<boolean>} Success status
   */
  const speakGoogleDirect = (text, language) => {
    return new Promise((resolve, reject) => {
      try {
        const ttsUrl = `https://translate.google.com/translate_tts?client=tw-ob&q=${encodeURIComponent(text)}&tl=${language}`
        const audio = new Audio(ttsUrl)

        // Set timeout
        const timeout = setTimeout(() => {
          audio.pause()
          audio.src = ''
          isPlaying.value = false
          reject(new Error('Google TTS timeout'))
        }, 10000)

        audio.onended = () => {
          clearTimeout(timeout)
          if (isPlaying.value && currentText.value === text) {
            isPlaying.value = false
          }
          resolve(true)
        }

        audio.onerror = (error) => {
          clearTimeout(timeout)
          isPlaying.value = false
          reject(new Error(`Google TTS failed: ${error.message || 'Unknown error'}`))
        }

        audio.onloadstart = () => {
          logger.debug('[useTTSAction] Google TTS started')
        }

        audio.play().catch((playError) => {
          clearTimeout(timeout)
          isPlaying.value = false
          reject(new Error(`Google TTS play failed: ${playError.message}`))
        })

      } catch (error) {
        isPlaying.value = false
        reject(error)
      }
    })
  }

  /**
   * Check if TTS is supported
   * @returns {boolean} Whether TTS is supported
   */
  const isTTSSupported = () => {
    return !!(
      window.speechSynthesis ||
      (browserAPI?.sendMessage && MessageActions.GOOGLE_TTS_SPEAK) ||
      typeof Audio !== 'undefined'
    )
  }

  /**
   * Get available TTS voices (Web Speech API only)
   * @returns {Array} Available voices
   */
  const getAvailableVoices = () => {
    if (!window.speechSynthesis) return []
    return window.speechSynthesis.getVoices()
  }

  /**
   * Get TTS method priority list
   * @returns {Array} Method priority list
   */
  const getTTSMethodPriority = () => {
    return Object.values(TTS_METHODS)
  }

  return {
    // State
    isPlaying,
    currentText,
    currentLanguage,
    ttsError,
    
    // Methods
    speak,
    stop,
    speakUnified,
    speakWebSpeech,
    speakGoogleDirect,
    isTTSSupported,
    getAvailableVoices,
    getTTSMethodPriority,
    
    // Constants
    TTS_METHODS
  }
}
