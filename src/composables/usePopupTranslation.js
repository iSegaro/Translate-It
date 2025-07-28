// Lightweight translation composable specifically for popup
// Simplified version without heavy dependencies
import { ref, computed } from 'vue'
import { useSettingsStore } from '@/store/core/settings.js'
import { UnifiedTranslationClient } from '@/core/UnifiedTranslationClient.js'

export function usePopupTranslation() {
  // State
  const sourceText = ref('')
  const translatedText = ref('')
  const isTranslating = ref(false)
  const translationError = ref('')
  const lastTranslation = ref(null)

  // Store
  const settingsStore = useSettingsStore()
  
  // Translation client
  const translationClient = new UnifiedTranslationClient('popup')

  // Computed
  const hasTranslation = computed(() => Boolean(translatedText.value?.trim()))
  const canTranslate = computed(() => Boolean(sourceText.value?.trim()) && !isTranslating.value)

  // Methods
  const triggerTranslation = async () => {
    if (!canTranslate.value) return

    isTranslating.value = true
    translationError.value = ''

    try {
      // Use UnifiedTranslationClient for translation request
      const response = await translationClient.translate(sourceText.value, {
        provider: settingsStore.settings.TRANSLATION_API,
        sourceLanguage: settingsStore.settings.SOURCE_LANGUAGE,
        targetLanguage: settingsStore.settings.TARGET_LANGUAGE,
        mode: 'popup'
      })

      if (response?.translatedText) {
        translatedText.value = response.translatedText
        lastTranslation.value = {
          source: sourceText.value,
          target: response.translatedText,
          provider: response.provider || settingsStore.settings.TRANSLATION_API,
          timestamp: response.timestamp || Date.now()
        }
      } else {
        throw new Error(response?.error || 'Translation failed')
      }
    } catch (error) {
      console.error('Translation error:', error)
      translationError.value = error.message || 'Translation failed'
    } finally {
      isTranslating.value = false
    }
  }

  const clearTranslation = () => {
    sourceText.value = ''
    translatedText.value = ''
    translationError.value = ''
    lastTranslation.value = null
  }

  const loadLastTranslation = () => {
    if (lastTranslation.value) {
      sourceText.value = lastTranslation.value.source
      translatedText.value = lastTranslation.value.target
    }
  }

  return {
    // State
    sourceText,
    translatedText,
    isTranslating,
    translationError,
    hasTranslation,
    canTranslate,
    lastTranslation,

    // Methods
    triggerTranslation,
    clearTranslation,
    loadLastTranslation
  }
}