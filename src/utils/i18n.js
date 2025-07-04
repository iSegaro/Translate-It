// src/utils/i18n.js

import Browser from "webextension-polyfill";
import { applyElementDirection } from "./textDetection.js";
import { getApplication_LocalizeAsync } from "../config.js";
import { languageList } from "./languages.js";
import { fadeOutInElement, animatePopupEffect } from "./i18n.helper.js";
import { marked } from "marked";
import DOMPurify from "dompurify";
// import { logME } from "./helpers.js";

export function parseBoolean(value) {
  return String(value).trim().toLowerCase() === "true";
}

// حافظه کش برای ذخیره ترجمه‌ها (با استفاده از Map برای کلیدگذاری با کد زبان)
const translationsCache = new Map();

/**
 * بارگذاری ترجمه‌ها برای زبان مشخص به همراه استفاده از کش.
 * اگر ترجمه‌های زبان موردنظر قبلاً بارگذاری شده باشند، مستقیماً آن‌ها را از کش برمی‌گرداند.
 *
 * @param {string} lang - کد زبان، مثلاً 'fa' یا 'en'
 * @returns {Promise<Object|null>} - شیء ترجمه‌ها یا null در صورت خطا
 */
async function loadTranslationsForLanguageCached(lang) {
  if (translationsCache.has(lang)) {
    return translationsCache.get(lang);
  }

  try {
    const url = Browser.runtime.getURL(`_locales/${lang}/messages.json`);
    const response = await fetch(url);
    if (!response.ok) {
      // logME(`⚠️ ترجمه برای زبان "${lang}" یافت نشد.`);
      return null;
    }
    const translations = await response.json();
    // ذخیره ترجمه‌ها در کش برای دفعات بعدی
    translationsCache.set(lang, translations);
    return translations;
  } catch {
    // logME(`⚠️ خطا در بارگذاری ترجمه‌های "${lang}":`, error);
    return null;
  }
}

/**
 * دریافت رشته ترجمه‌شده برای یک کلید از messages.json.
 * ابتدا چک می‌کند که ترجمه‌های زبان موردنظر در کش موجود باشد؛ در غیر این صورت، فایل را بارگذاری و در کش ذخیره می‌کند.
 *
 * @param {string} key - کلید مربوط به رشته موردنظر در فایل messages.json
 * @param {string} [lang] - کد زبان (اختیاری). در صورت عدم ارائه، از تنظیمات افزونه یا مقدار پیش‌فرض استفاده می‌شود.
 * @returns {Promise<string|null>} - رشته ترجمه‌شده یا null در صورت عدم یافتن
 */
export async function getTranslationString(key, lang) {
  let langCode = lang;

  if (!langCode || langCode.length !== 2) {
    const App_Language = await getApplication_LocalizeAsync();

    const foundLang = languageList.find(
      (language) =>
        language.name === App_Language || language.locale === App_Language
    );

    // اگر App_Language به‌صورت کد دو حرفی (مثلاً "en") نباشد، به صورت پیش‌فرض از "en" استفاده می‌کنیم.
    langCode =
      foundLang?.code || (App_Language?.length === 2 ? App_Language : "en");
  }

  const translations = await loadTranslationsForLanguageCached(langCode);
  if (translations && translations[key]?.message) {
    return translations[key].message;
  }

  return null;
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
    translations = await loadTranslationsForLanguageCached(langCode);
    isRtl = parseBoolean(translations["IsRTL"]?.message);
  } else {
    isRtl = parseBoolean(Browser.i18n.getMessage("IsRTL"));
  }

  const bodyContainer = document.body;
  const headContainer = document.head;

  // استفاده از افکت fade-out/fade-in برای بدنه صفحه
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

  // خالی کردن متن status در صفحه تنظیمات
  const statusElement = document.getElementById("status");
  if (statusElement) {
    statusElement.textContent = "";
  }
}

/**
 * تابع کمکی برای لوکالایز کردن المان‌های داخل یک container.
 * این تابع به ترتیب المان‌هایی با data-i18n، data-i18n-title و data-i18n-placeholder را پردازش می‌کند.
 */
function localizeContainer(container, translations) {
  // --- Part 1: Handle standard text content (data-i18n) ---
  const textItems = container.querySelectorAll("[data-i18n]");
  textItems.forEach((item) => {
    const key = item.getAttribute("data-i18n");
    const translation = translations?.[key]?.message || Browser.i18n.getMessage(key);
    
    if (item.matches("input, textarea")) {
      item.value = translation;
    } else if (item.matches("img")) {
      item.setAttribute("alt", translation);
    } else {
      item.textContent = translation;
    }
  });
  
  // --- Part 2: Handle titles (data-i18n-title) ---
  const titleItems = container.querySelectorAll("[data-i18n-title]");
  titleItems.forEach((item) => {
    const titleKey = item.getAttribute("data-i18n-title");
    const titleTranslation = translations?.[titleKey]?.message || Browser.i18n.getMessage(titleKey);
    item.setAttribute("title", titleTranslation);
  });
  
  // --- Part 3: Handle placeholders (data-i18n-placeholder) ---
  const placeholderItems = container.querySelectorAll("[data-i18n-placeholder]");
  placeholderItems.forEach((item) => {
    const key = item.getAttribute("data-i18n-placeholder");
    const translation = translations?.[key]?.message || Browser.i18n.getMessage(key);
    if (translation) {
      item.placeholder = translation;
    }
  });

  // --- Part 4: Handle Markdown content ---
  const markdownItems = container.querySelectorAll("[data-i18n-markdown]");
  markdownItems.forEach((item) => {
    const key = item.getAttribute("data-i18n-markdown");
    const markdownString = translations?.[key]?.message || Browser.i18n.getMessage(key);

    if (markdownString) {
      // Sanitize is recommended for security if the content is user-generated.
      // For internal content from messages.json, it's generally safe.
      const rawHtml = marked.parse(markdownString, { breaks: true });
      const sanitized = DOMPurify.sanitize(rawHtml, { RETURN_TRUSTED_TYPE: true });
      const parser = new DOMParser();
      const doc = parser.parseFromString(sanitized.toString(), "text/html");
      item.textContent = ""; // Clear existing content
      Array.from(doc.body.childNodes).forEach((node) => item.appendChild(node));
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
    translations = await loadTranslationsForLanguageCached(langCode);
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
