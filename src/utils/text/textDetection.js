// src/utils/textDetection.js
import browser from "webextension-polyfill";
import { CONFIG } from "@/shared/config/config.js";
import { languageList } from "../i18n/languages.js";
// import  from "./helpers.js";

import { getScopedLogger } from '@/shared/logging/logger.js';
const logger = getScopedLogger('Background', 'textDetection');


export const isPersianText = (text) => {
  return CONFIG.PERSIAN_REGEX.test(text);
};

export const isRtlText = (text) => {
  return CONFIG.RTL_REGEX.test(text);
};

export const containsPersian = (text) => {
  return /[\u0600-\u06FF]/.test(text);
};

export const shouldApplyRtl = (text) => {
  return containsPersian(text) || isRtlText(text);
};

export const applyTextDirection = (element, text) => {
  if (!element || !element.style) return;

  const isRtl = isRtlText(text);
  element.style.direction = isRtl ? "rtl" : "ltr";
  element.style.textAlign = isRtl ? "right" : "left";
};

export const applyElementDirection = (element, rtl_direction = false) => {
  if (!element || !element.style) return;

  const isRtl = rtl_direction;
  element.style.direction = isRtl ? "rtl" : "ltr";
  element.style.textAlign = isRtl ? "right" : "left";
};

export const correctTextDirection = (element, text) => {
  if (!element) return;

  // اگر 'text' آرایه‌ای از خطوط است، آن‌ها را برای بررسی جهت کلی به هم متصل کنید.
  const textToCheck = Array.isArray(text) ? text.join("\n") : text;

  const isRtl = shouldApplyRtl(textToCheck);
  const direction = isRtl ? "rtl" : "ltr";

  // Only set the dir attribute and let CSS inherit from it
  // This prevents conflicts between CSS direction and dir attribute
  element.setAttribute("dir", direction);
  
  // Remove any conflicting inline styles to prevent override issues
  if (element.style) {
    element.style.removeProperty('direction');
    element.style.removeProperty('text-align');
  }
  
  // Add CSS class for styling instead of inline styles
  element.classList.add('aiwc-translated-text');
  if (isRtl) {
    element.classList.add('aiwc-rtl-text');
  } else {
    element.classList.add('aiwc-ltr-text');
  }
};

export async function detectTextLanguage(text) {
  try {
    const langInfo = await browser.i18n.detectLanguage(text);
    if (langInfo && langInfo.languages && langInfo.languages.length > 0) {
      // زبان با بالاترین درصد اطمینان را به عنوان زبان تشخیص داده شده در نظر می‌گیریم
      const detectedLanguage = langInfo.languages[0].language;
      // const confidencePercentage = langInfo.languages[0].percentage;
      logger.debug(`Language detected: ${detectedLanguage}`);
      return detectedLanguage; // Return detected language code
    } else {
      logger.debug('Language detection not available');
      return null;
    }
  } catch (error) {
    logger.debug('Error in language detection:', error);
    return null;
  }
}

export function getLanguageInfoFromCode(detectedLanguageCode) {
  if (!detectedLanguageCode) {
    return null; // یا می‌توانید یک مقدار پیش‌فرض برگردانید
  }

  // تبدیل کد تشخیص داده شده به حروف کوچک برای تطابق بهتر
  const normalizedDetectedCode = detectedLanguageCode.toLowerCase();

  for (const lang of languageList) {
    if (lang.code === normalizedDetectedCode) {
      return lang;
    }
  }

  return null; // اگر زبانی با این کد پیدا نشد
}

export function getLanguageInfoFromName(detectedLanguageName) {
  if (!detectedLanguageName) {
    return null; // یا می‌توانید یک مقدار پیش‌فرض برگردانید
  }

  // تبدیل کد تشخیص داده شده به حروف کوچک برای تطابق بهتر
  const normalizedDetectedCode = detectedLanguageName.toLowerCase();

  for (const lang of languageList) {
    if (lang.name.toLocaleLowerCase() === normalizedDetectedCode) {
      return lang;
    }
  }

  return null; // اگر زبانی با این کد پیدا نشد
}
