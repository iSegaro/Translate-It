import { ref, watch } from 'vue';
import browser from 'webextension-polyfill';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { CONFIG } from '@/shared/config/config.js';
import { UI_LOCALE_TO_CODE_MAP } from '@/shared/config/languageConstants.js';
import { getTranslationString, clearTranslationsCache } from '@/utils/i18n/i18n.js';
import { ExtensionContextManager } from '@/core/extensionContext.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT_APP, 'useContentAppLocalization');

/**
 * Composable for managing localization and RTL (Right-to-Left) state 
 * for the ContentApp, particularly for toast notifications.
 * 
 * @param {Object} settingsStore - The settings store instance
 * @returns {Object} Localization state and methods
 */
export function useContentAppLocalization(settingsStore) {
  // Reactive RTL value for toasts (sync access - optimal performance)
  const toastRTL = ref(false);

  /**
   * Get RTL value by reading directly from storage (bypasses SettingsManager cache)
   * Uses getTranslationString with explicit lang code to avoid cache issues
   * 
   * @returns {Promise<boolean>} Whether the current locale is RTL
   */
  const getRTLFromStorage = async () => {
    try {
      // Read locale directly from storage - bypass SettingsManager cache entirely
      // ۱. اولویت با تنظیمات کاربر
      const storage = await browser.storage.local.get({ 
        APPLICATION_LOCALIZE: CONFIG.APPLICATION_LOCALIZE || 'en' 
      });
      const locale = storage.APPLICATION_LOCALIZE;

      // Use centralized locale to language code mapping from languageConstants.js
      let langCode = UI_LOCALE_TO_CODE_MAP[locale];

      // Fallback: if not found, try to use locale directly if it's a 2-letter code
      if (!langCode) {
        langCode = locale.length === 2 ? locale : 'en';
      }

      // Clear cache and get RTL value with explicit language code
      clearTranslationsCache();
      const rtlValue = await getTranslationString('IsRTL', langCode);

      const isRTL = rtlValue === 'true';
      logger.debug('[Toast] RTL from storage:', { locale, langCode, isRTL });

      return isRTL;
    } catch (error) {
      if (ExtensionContextManager.isContextError(error)) {
        ExtensionContextManager.handleContextError(error, 'getRTLFromStorage');
      } else {
        logger.error('Error fetching RTL from storage:', error);
      }
      return false;
    }
  };

  /**
   * Function to update RTL (no delay, direct storage read)
   */
  const updateToastRTL = async () => {
    toastRTL.value = await getRTLFromStorage();
  };

  // Only watch for localization changes to update RTL (Performance Optimized)
  watch(() => settingsStore.settings?.APPLICATION_LOCALIZE, (newLocale) => {
    if (newLocale) {
      logger.info('[ContentApp] Language changed reactively:', newLocale);
      updateToastRTL();
    }
  });

  return {
    toastRTL,
    updateToastRTL,
    getRTLFromStorage
  };
}
