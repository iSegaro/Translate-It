import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getScopedLogger } from '@/utils/core/logger.js';
const logger = getScopedLogger('Core', 'subtitle');

export const useSubtitleStore = defineStore('subtitle', () => {
  // State
  const isEnabled = ref(false)
  const currentSubtitle = ref(null)
  const translatedSubtitle = ref(null)
  const isTranslating = ref(false)
  
  // Actions
  const enable = () => {
    isEnabled.value = true
    logger.debug('Subtitle translation enabled')
  }
  
  const disable = () => {
    isEnabled.value = false
    currentSubtitle.value = null
    translatedSubtitle.value = null
    logger.debug('Subtitle translation disabled')
  }
  
  const setCurrentSubtitle = (subtitle) => {
    currentSubtitle.value = subtitle
    if (isEnabled.value && subtitle) {
      translateSubtitle(subtitle)
    }
  }
  
  const translateSubtitle = async (subtitle) => {
    if (isTranslating.value) return
    
    isTranslating.value = true
    try {
      // Mock subtitle translation
      logger.debug('Translating subtitle:', subtitle)
      
      // Simulate translation delay
      await new Promise(resolve => setTimeout(resolve, 300))
      
      translatedSubtitle.value = {
        original: subtitle,
        translated: `[Translated] ${subtitle}`,
        timestamp: Date.now()
      }
      
      return translatedSubtitle.value
    } catch (error) {
      logger.error('Subtitle translation error:', error)
      throw error
    } finally {
      isTranslating.value = false
    }
  }
  
  const clearSubtitles = () => {
    currentSubtitle.value = null
    translatedSubtitle.value = null
  }
  
  return {
    // State
    isEnabled,
    currentSubtitle,
    translatedSubtitle,
    isTranslating,
    
    // Actions
    enable,
    disable,
    setCurrentSubtitle,
    translateSubtitle,
    clearSubtitles
  }
})