// src/composables/useUnifiedI18n.js
// Unified i18n composable that bridges legacy system with vue-i18n

import { computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/store/core/settings'
import { getTranslationString, clearTranslationsCache } from '@/utils/i18n/i18n.js'
import { setI18nLocale } from '@/plugins/i18n.js'
import { getScopedLogger } from '@/utils/core/logger.js'
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js'
import { MessageActions } from '@/messaging/core/MessageActions.js'
import browser from 'webextension-polyfill'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'useUnifiedI18n')

/**
 * Map language names to locale codes
 */
const LANGUAGE_MAP = {
  'English': 'en',
  'Farsi': 'fa',
  'فارسی': 'fa',
  'en': 'en',
  'fa': 'fa'
}

/**
 * Convert language name to locale code
 * @param {string} lang - Language name or code
 * @returns {string} Locale code
 */
function normalizeLocale(lang) {
  return LANGUAGE_MAP[lang] || lang || 'en'
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
      const translation = await getTranslationString(key, langCode)
      return translation || key
    } catch (error) {
      logger.debug('Async translation failed for key:', key, error)
      return key
    }
  }

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

      // 1. Clear legacy translations cache to ensure fresh translations
      clearTranslationsCache()
      
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
    const storedLang = settingsStore.settings?.APPLICATION_LOCALIZE
    const normalizedStored = normalizeLocale(storedLang)
    return locale.value || normalizedStored || 'en'
  })

  /**
   * Check if i18n is ready
   */
  const isReady = computed(() => {
    return !!locale.value
  })

  // Watch for settings store changes to sync with vue-i18n
  watch(
    () => settingsStore.settings?.APPLICATION_LOCALIZE,
    (newLang) => {
      if (newLang) {
        const normalizedLang = normalizeLocale(newLang)
        if (normalizedLang !== locale.value) {
          setI18nLocale(normalizedLang).catch(err => 
            logger.warn('Failed to sync locale from settings:', err)
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