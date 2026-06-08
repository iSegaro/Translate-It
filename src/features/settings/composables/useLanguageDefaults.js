import { computed } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'

/**
 * Composable for persisting the currently selected translation languages
 * as the user's stored defaults.
 */
export function useLanguageDefaults() {
  const settingsStore = useSettingsStore()
  const requestTokens = {
    SOURCE_LANGUAGE: 0,
    TARGET_LANGUAGE: 0
  }

  const savedSourceLanguage = computed(() => settingsStore.settings?.SOURCE_LANGUAGE)
  const savedTargetLanguage = computed(() => settingsStore.settings?.TARGET_LANGUAGE)
  const isReady = computed(() => settingsStore.isInitialized)

  const persistLanguageDefault = async (key, language) => {
    const requestToken = (requestTokens[key] || 0) + 1
    requestTokens[key] = requestToken
    const previousValue = settingsStore.settings?.[key]

    try {
      await settingsStore.updateSettingAndPersist(key, language)
      return true
    } catch (error) {
      // Only roll back if this request is still the latest write for the key.
      // Older failures must not overwrite a newer successful default.
      if (requestTokens[key] === requestToken) {
        settingsStore.updateSettingLocally(key, previousValue)
      }
      throw error
    }
  }

  const setSourceLanguageAsDefault = (language) => persistLanguageDefault('SOURCE_LANGUAGE', language)
  const setTargetLanguageAsDefault = (language) => persistLanguageDefault('TARGET_LANGUAGE', language)

  return {
    savedSourceLanguage,
    savedTargetLanguage,
    isReady,
    setSourceLanguageAsDefault,
    setTargetLanguageAsDefault
  }
}
