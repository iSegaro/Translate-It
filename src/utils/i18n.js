// src/utils/i18n.js

import Browser from "webextension-polyfill";
import { applyElementDirection, isRtlText } from "./textDetection.js";
import { getApplication_LocalizeAsync } from "../config.js";
import { languageList } from "./languages.js";
import { fadeOutInElement, animatePopupEffect } from "./i18n.helper.js";

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

// متد ترجمه صفحه تنظیمات / Settings
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

  if (langCode) {
    translations = await loadTranslationsForLanguage(langCode);
    isRtl = parseBoolean(translations["IsRTL"]?.message);
  } else {
    isRtl = parseBoolean(Browser.i18n.getMessage("IsRTL"));
  }

  const bodyContainer = document.body;
  const headContainer = document.head;

  // استفاده از افکت fade-out/fade-in به جای display none/"" برای بدنه صفحه
  fadeOutInElement(
    bodyContainer,
    () => {
      // تنظیم جهت صفحه بر اساس isRtl
      applyElementDirection(bodyContainer, isRtl);
      // لوکالایز کردن محتویات body
      localizeContainer(bodyContainer, translations);
      // تنظیم جهت مجدد برای المان خاص "promptTemplate" در صورت وجود
      const promptTemplate = bodyContainer.querySelector("#promptTemplate");
      if (promptTemplate) {
        applyElementDirection(promptTemplate, false);
      }
    },
    250
  );

  // لوکالایز کردن المان‌های موجود در head (مثلاً <title>)
  if (headContainer) {
    localizeContainer(headContainer, translations);
  }
}

/**
 * تابع کمکی برای لوکالایز کردن المان‌های داخل یک container.
 * این تابع به ترتیب المان‌هایی با data-i18n، data-i18n-title و data-i18n-placeholder را پردازش می‌کند.
 */
function localizeContainer(container, translations) {
  // لوکالایز کردن المان‌هایی که دارای data-i18n هستند
  const textItems = container.querySelectorAll("[data-i18n]");
  textItems.forEach((item) => {
    const key = item.getAttribute("data-i18n");
    let translation = "";
    if (translations && translations[key] && translations[key].message) {
      translation = translations[key].message;
    } else {
      translation = Browser.i18n.getMessage(key);
    }

    if (item.matches("input, textarea")) {
      item.value = translation;
    } else if (item.matches("img")) {
      item.setAttribute("alt", translation);
    } else {
      item.textContent = translation;
    }
  });

  // لوکالایز کردن المان‌هایی که دارای data-i18n-title هستند
  const titleItems = container.querySelectorAll("[data-i18n-title]");
  titleItems.forEach((item) => {
    const titleKey = item.getAttribute("data-i18n-title");
    let titleTranslation = "";
    if (
      translations &&
      translations[titleKey] &&
      translations[titleKey].message
    ) {
      titleTranslation = translations[titleKey].message;
    } else {
      titleTranslation = Browser.i18n.getMessage(titleKey);
    }
    item.setAttribute("title", titleTranslation);
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
}

// متد ترجمه برای پنجره Popup
export async function app_localize_popup(lang_code) {
  let translations = null;
  let App_Language = await getApplication_LocalizeAsync();
  let langCode = lang_code;

  if (!langCode || langCode?.length > 2) {
    languageList.forEach((language) => {
      if (language.name === App_Language || language.locale === App_Language) {
        langCode = language.locale;
      }
    });
  }

  // در صورت ارائه زبان، تلاش می‌کنیم فایل ترجمه مربوطه را بارگذاری کنیم
  if (langCode) {
    translations = await loadTranslationsForLanguage(langCode);
  }

  const bodyContainer = document.body;
  const headContainer = document.head;

  // به جای مخفی کردن کل body با display none،
  // به صورت اولیه به container حالت اولیه افکت داده می‌شود.
  // توجه کنید که نیازی به تغییر display نداریم.

  // اعمال ترجمه‌ها روی body
  localizeContainer(bodyContainer, translations);

  // همچنین المان‌های موجود در head مانند <title> را نیز لوکالایز می‌کنیم
  if (headContainer) {
    localizeContainer(headContainer, translations);
  }

  // اعمال افکت pop-in برای نمایش نرم Popup
  animatePopupEffect(bodyContainer, 300);
}

// در نسخه اولیه نیاز بود که تنظیمات بارگذاری شوند، ولی فعلا مطمین نیستم بهشون نیازی باشه یا خیر
// document.addEventListener("DOMContentLoaded", () => {
//   app_localize();
//   app_localize_popup();
// });
