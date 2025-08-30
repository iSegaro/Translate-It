import { createI18n } from 'vue-i18n';
import browser from 'webextension-polyfill';

import rawEn from '../../_locales/en/messages.json';
import rawFa from '../../_locales/fa/messages.json';

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
    console.warn(`Failed to load locale ${locale}:`, error);
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
 * @param {string} locale - The locale code
 */
export async function setI18nLocale(locale) {
  // Load messages if not already loaded
  if (!i18n.global.messages[locale]) {
    const localeMessages = await loadLocaleMessages(locale);
    i18n.global.setLocaleMessage(locale, localeMessages);
  }
  
  // Set the locale
  i18n.global.locale.value = locale;
}

export default i18n;
