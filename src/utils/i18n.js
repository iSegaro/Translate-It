// src/utils/i18n.js

import Browser from "webextension-polyfill";
import { applyElementDirection, isRtlText } from "./textDetection.js";
import { getApplication_LocalizeAsync } from "../config.js";
import { languageList } from "./languages.js";

// تابع کمکی برای بارگذاری فایل ترجمه messages.json مربوط به زبان مشخص
async function loadTranslationsForLanguage(lang) {
  try {
    const url = Browser.runtime.getURL(`_locales/${lang}/messages.json`);
    const response = await fetch(url);
    if (!response.ok) {
      console.error(
        `Failed to load translations for language "${lang}". HTTP code: ${response.status}`
      );
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(`Error loading translations for language "${lang}":`, error);
    return null;
  }
}

function parseBoolean(value) {
  return String(value).trim().toLowerCase() === "true";
}

export async function app_localize(lang_code) {
  let translations = null;
  let isRtl = false;
  let App_Language = await getApplication_LocalizeAsync();
  let langCode = lang_code;

  if (langCode?.length !== 2) {
    languageList.forEach((language) => {
      if (language.name === App_Language) {
        langCode = language.code;
      }
    });
  }

  // در صورت ارائه زبان به عنوان ورودی، تلاش می‌کنیم فایل ترجمه مربوطه را بارگذاری کنیم
  if (langCode) {
    translations = await loadTranslationsForLanguage(langCode);
    isRtl = parseBoolean(translations["IsRTL"]?.message);
  } else {
    isRtl = parseBoolean(Browser.i18n.getMessage("IsRTL"));
  }

  const container = document.body;

  container.style.display = "none";

  if (isRtl) {
    applyElementDirection(container, true);
  } else {
    applyElementDirection(container, false);
  }

  // لوکالایز کردن متون (برای المان‌هایی که data-i18n دارند)
  const textItems = container.querySelectorAll("[data-i18n]");
  textItems.forEach((item) => {
    const key = item.getAttribute("data-i18n");
    let translation = "";
    // اگر ترجمه برای زبان موردنظر وجود داشته باشد از آن استفاده می‌کنیم
    if (translations && translations[key] && translations[key].message) {
      translation = translations[key].message;
    } else {
      // در غیر این صورت از ترجمه پیش‌فرض (API i18n مرورگر) استفاده می‌شود
      translation = Browser.i18n.getMessage(key);
    }

    if (item.matches("input, textarea")) {
      // برای المان‌های ورودی یا textarea مقدار value تغییر می‌کند.
      item.value = translation;
    } else {
      // برای سایر المان‌ها از textContent استفاده می‌شود.
      item.textContent = translation;
    }
  });

  applyElementDirection(container.querySelector("#promptTemplate"), false);

  // لوکالایز کردن placeholderها (برای المان‌هایی که data-i18n-placeholder دارند)
  const placeholderItems = container.querySelectorAll(
    "[data-i18n-placeholder]"
  );
  placeholderItems.forEach((item) => {
    const key = item.getAttribute("data-i18n-placeholder");
    let translation = "";
    if (translations && translations[key] && translations[key].message) {
      translation = translations[key].message;
    } else {
      translation = Browser.i18n.getMessage(key);
    }
    if (translation) {
      item.placeholder = translation;
    }
  });

  container.style.display = "";
}

export async function app_localize_popup(lang_code) {
  let translations = null;
  let App_Language = await getApplication_LocalizeAsync();
  let langCode = lang_code;

  if (langCode?.length !== 2) {
    languageList.forEach((language) => {
      if (language.name === App_Language) {
        langCode = language.code;
      }
    });
  }

  const container = document.body;

  container.style.display = "none";

  // لوکالایز کردن متون (برای المان‌هایی که data-i18n دارند)
  const textItems = container.querySelectorAll("[data-i18n]");
  textItems.forEach((item) => {
    const key = item.getAttribute("data-i18n");
    let translation = "";
    // اگر ترجمه برای زبان موردنظر وجود داشته باشد از آن استفاده می‌کنیم
    if (translations && translations[key] && translations[key].message) {
      translation = translations[key].message;
    } else {
      // در غیر این صورت از ترجمه پیش‌فرض (API i18n مرورگر) استفاده می‌شود
      translation = Browser.i18n.getMessage(key);
    }

    if (item.matches("input, textarea")) {
      // برای المان‌های ورودی یا textarea مقدار value تغییر می‌کند.
      item.value = translation;
    } else {
      // برای سایر المان‌ها از textContent استفاده می‌شود.
      item.textContent = translation;
    }
  });

  // لوکالایز کردن placeholderها (برای المان‌هایی که data-i18n-placeholder دارند)
  const placeholderItems = container.querySelectorAll(
    "[data-i18n-placeholder]"
  );
  placeholderItems.forEach((item) => {
    const key = item.getAttribute("data-i18n-placeholder");
    let translation = "";
    if (translations && translations[key] && translations[key].message) {
      translation = translations[key].message;
    } else {
      translation = Browser.i18n.getMessage(key);
    }
    if (translation) {
      item.placeholder = translation;
    }
  });

  container.style.display = "";
}

document.addEventListener("DOMContentLoaded", () => {
  app_localize("fa");
});
