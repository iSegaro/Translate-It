import { createI18n } from 'vue-i18n';
import browser from 'webextension-polyfill';
import { getScopedLogger } from '../../shared/logging/logger.js';
import { LOG_COMPONENTS } from '../../shared/logging/logConstants.js';
import { UI_LOCALE_TO_CODE_MAP } from '../../shared/config/languageConstants.js';
import { CONFIG } from '../../shared/config/config.js';

import rawEn from '../../../_locales/en/messages.json';
import rawFa from '../../../_locales/fa/messages.json';

function convertWebExtensionMessages(raw) {
  const result = {};
  for (const key in raw) {
    if (raw[key] && typeof raw[key] === 'object' && 'message' in raw[key]) {
      result[key] = raw[key].message;
    }
  }
  return result;
}

const messages = {
  en: convertWebExtensionMessages(rawEn),
  fa: convertWebExtensionMessages(rawFa),
};

/**
 * Dynamically load a locale's messages if not already loaded
 * @param {string} locale - The locale code (e.g., 'en', 'fa')
 * @returns {Promise<Object>} The messages object for the locale
 */
export async function loadLocaleMessages(locale) {
  if (messages[locale]) {
    return messages[locale];
  }

  try {
    const url = browser.runtime.getURL(`_locales/${locale}/messages.json`);
    const response = await fetch(url);
    if (response.ok) {
      const rawMessages = await response.json();
      messages[locale] = convertWebExtensionMessages(rawMessages);
      return messages[locale];
    }
  } catch (error) {
    const logger = getScopedLogger(LOG_COMPONENTS.I18N, 'i18n-plugin');
    logger.warn(`Failed to load locale ${locale}:`, error);
  }
  
  return messages.en; // fallback to English
}

const i18n = createI18n({
  legacy: false,
  locale: 'en', // زبان پیش‌فرض - will be updated in main.js
  fallbackLocale: 'en',
  messages,
  globalInjection: true, // Enable global $t
  warnHtmlMessage: false
});

/**
 * Set locale and load messages if needed
 * @param {string} localeCode - The locale code
 */
export async function setI18nLocale(localeCode) {
  // Load messages if not already loaded
  if (!i18n.global.messages[localeCode]) {
    const localeMessages = await loadLocaleMessages(localeCode);
    i18n.global.setLocaleMessage(localeCode, localeMessages);
  }
  
  // Set the locale safely (Composition API mode uses .value)
  if (typeof i18n.global.locale === 'object' && 'value' in i18n.global.locale) {
    i18n.global.locale.value = localeCode;
  } else {
    i18n.global.locale = localeCode;
  }
}

// Initialize locale from storage immediately to prevent Farsi-only issue
(async () => {
  try {
    const settings = await browser.storage.local.get('APPLICATION_LOCALIZE');
    const userLocale = settings.APPLICATION_LOCALIZE || CONFIG.APPLICATION_LOCALIZE || 'en';
    const langCode = UI_LOCALE_TO_CODE_MAP[userLocale] || 'en';
    await setI18nLocale(langCode);
  } catch {
    // Fail silently in non-extension environments (like tests)
    if (typeof console !== 'undefined') {
      console.debug('[i18n-plugin] Storage initialization skipped or failed');
    }
  }
})();

export default i18n;
