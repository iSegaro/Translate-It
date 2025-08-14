// src/utils/textDetection.js
import browser from "webextension-polyfill";
import { CONFIG } from "../../config.js";
import { languageList } from "../i18n/languages.js";
// import  from "./helpers.js";

import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'textDetection');


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
  // استفاده از "start" یا "end" برای textAlign می‌تواند گزینه بهتری باشد،
  // اما "left" و "right" رایج هستند.
  const textAlign = isRtl ? "right" : "left"; // یا "start"

  if (element.style) {
    element.style.direction = direction;
    element.style.textAlign = textAlign;
  } else {
    // این حالت ممکن است برای spanها کمتر رایج باشد اما برای استحکام کد خوب است
    element.setAttribute(
      "style",
      `direction: ${direction}; text-align: ${textAlign};`,
    );
  }
  // بسیار مهم: ویژگی 'dir' را برای مدیریت صحیح bidi توسط مرورگر تنظیم می شود
  element.setAttribute("dir", direction);
};

export async function detectTextLanguage(text) {
  try {
    const langInfo = await browser.i18n.detectLanguage(text);
    if (langInfo && langInfo.languages && langInfo.languages.length > 0) {
      // زبان با بالاترین درصد اطمینان را به عنوان زبان تشخیص داده شده در نظر می‌گیریم
      const detectedLanguage = langInfo.languages[0].language;
      // const confidencePercentage = langInfo.languages[0].percentage;
      // logME(
      //   `زبان تشخیص داده شده: ${detectedLanguage} (اطمینان: ${confidencePercentage}%)`
      // );
      return detectedLanguage; // برگرداندن کد زبان تشخیص داده شده
    } else {
  // logger.debug('امکان تشخیص زبان وجود ندارد.');
      return null;
    }
  } catch {
  // logger.debug('خطا در تشخیص زبان:', error);
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
