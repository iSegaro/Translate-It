// src/composables/useUnifiedI18n.js
// Unified i18n composable that bridges legacy system with vue-i18n

import { computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { settingsManager } from '@/shared/managers/SettingsManager.js'
import { utilsFactory } from '@/utils/UtilsFactory.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import browser from 'webextension-polyfill'

import { UI_LOCALE_TO_CODE_MAP } from '@/shared/config/languageConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'useUnifiedI18n')

/**
 * Convert language name to locale code
 * @param {string} lang - Language name or code
 * @returns {string} Locale code
 */
function normalizeLocale(lang) {
  if (!lang) return 'en'
  return UI_LOCALE_TO_CODE_MAP[lang] || lang.toLowerCase() || 'en'
}

/**
 * Unified i18n composable that works with both legacy system and vue-i18n
 * @returns {Object} Unified i18n interface
 */
export function useUnifiedI18n() {
  const { t: vueT, locale } = useI18n()
  const settingsStore = useSettingsStore()

  /**
   * Unified translation function that tries vue-i18n first, then falls back to legacy
   * @param {string} key - Translation key
   * @param {string|Object} fallback - Fallback text or vue-i18n options
   * @returns {string} Translated text
   */
  const t = (key, fallback = key) => {
    try {
      // Try vue-i18n first
      const vueTranslation = vueT(key)
      if (vueTranslation && vueTranslation !== key) {
        return vueTranslation
      }

      // If it's an object with options, handle it
      if (typeof fallback === 'object') {
        return vueT(key, fallback)
      }

      // Return fallback if vue-i18n didn't find the key
      return fallback || key
    } catch (error) {
      logger.debug('Translation failed for key:', key, error)
      return fallback || key
    }
  }

  /**
   * Get translation asynchronously from legacy system
   * @param {string} key - Translation key
   * @param {string} langCode - Language code (optional)
   * @returns {Promise<string>} Translated text
   */
  const tAsync = async (key, langCode) => {
    try {
      const { getTranslationString } = await utilsFactory.getI18nUtils()
      const translation = await getTranslationString(key, langCode)
      return translation || key
    } catch (error) {
      logger.debug('Async translation failed for key:', key, error)
      return key
    }
  };

  /**
   * Change language across the entire extension
   * @param {string} langCode - Language code (e.g., 'en', 'fa') or name (e.g., 'English')
   */
  const changeLanguage = async (langCode) => {
    try {
      logger.debug('Changing unified language to:', langCode)

      // Normalize the locale code
      const normalizedLocale = normalizeLocale(langCode)
      logger.debug('Normalized locale:', normalizedLocale)

      // Get utils from factory
      const { clearTranslationCache, setI18nLocale } = await utilsFactory.getI18nUtils()

      // 1. Clear legacy translations cache to ensure fresh translations
      await clearTranslationCache()

      // 2. Update vue-i18n locale and load messages if needed
      await setI18nLocale(normalizedLocale)

      // 3. Update settings store with original value (for backward compatibility)
      await settingsStore.updateSettingAndPersist('APPLICATION_LOCALIZE', langCode)

      // 4. Send message to background to refresh context menus with new locale
      try {
        await browser.runtime.sendMessage({
          action: MessageActions.REFRESH_CONTEXT_MENUS,
          locale: normalizedLocale
        })
      } catch (err) {
        logger.warn('Failed to refresh context menus:', err.message)
      }

      // 5. Wait for next tick to ensure reactivity
      await nextTick()

      logger.debug('Language change completed:', normalizedLocale)
    } catch (error) {
      logger.error('Failed to change language:', error)
      throw error
    }
  }

  /**
   * Get current locale
   */
  const currentLocale = computed(() => {
    // 1. Primary source: settingsManager (most reliable in content scripts)
    const directStored = settingsManager.get('APPLICATION_LOCALIZE')
    if (directStored) {
      return normalizeLocale(directStored)
    }

    // 2. Fallback: store settings
    const storedLang = settingsStore.settings?.APPLICATION_LOCALIZE
    if (storedLang) {
      return normalizeLocale(storedLang)
    }
    
    // 3. Last resort: vue-i18n locale
    return locale.value || 'en'
  })

  /**
   * Check if i18n is ready
   */
  const isReady = computed(() => {
    return !!locale.value
  })

  // Watch for settings changes to sync with vue-i18n
  // Use settingsManager's reactive cache for immediate updates in all contexts
  watch(
    () => settingsManager.get('APPLICATION_LOCALIZE'),
    async (newLang) => {
      if (newLang) {
        const normalizedLang = normalizeLocale(newLang)
        if (normalizedLang !== locale.value) {
          const { setI18nLocale } = await utilsFactory.getI18nUtils()
          setI18nLocale(normalizedLang).catch(err =>
            logger.warn('Failed to sync locale from settings change:', err)
          )
        }
      }
    },
    { immediate: true }
  )

  return {
    t,
    tAsync,
    changeLanguage,
    locale: currentLocale,
    isReady
  }
}