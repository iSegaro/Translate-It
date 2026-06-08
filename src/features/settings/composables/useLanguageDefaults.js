import { computed } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'

/**
 * Composable for persisting the currently selected translation languages
 * as the user's stored defaults.
 */
export function useLanguageDefaults() {
  const settingsStore = useSettingsStore()

  const savedSourceLanguage = computed(() => settingsStore.settings?.SOURCE_LANGUAGE)
  const savedTargetLanguage = computed(() => settingsStore.settings?.TARGET_LANGUAGE)
  const isReady = computed(() => settingsStore.isInitialized)

  const persistLanguageDefault = async (key, language) => {
    const previousValue = settingsStore.settings?.[key]

    try {
      await settingsStore.updateSettingAndPersist(key, language)
      return true
    } catch (error) {
      // Revert the optimistic local store mutation so the UI only reflects
      // a saved default after persistence succeeds.
      settingsStore.updateSettingLocally(key, previousValue)
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

