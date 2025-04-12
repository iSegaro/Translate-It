// src/utils/textDetection.js
import Browser from "webextension-polyfill";
import { CONFIG } from "../config.js";
import { languageList } from "./languages.js";

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

  const isRtl = shouldApplyRtl(text);
  const direction = isRtl ? "rtl" : "ltr";
  const textAlign = isRtl ? "right" : "left";

  if (element.style) {
    element.style.direction = direction;
    element.style.textAlign = textAlign;
  } else {
    // اگر style وجود نداشت، با setAttribute مقدار دهی کنیم
    element.setAttribute(
      "style",
      `direction: ${direction}; text-align: ${textAlign};`
    );
  }
};

export async function detectTextLanguage(text) {
  try {
    const langInfo = await Browser.i18n.detectLanguage(text);
    if (langInfo && langInfo.languages && langInfo.languages.length > 0) {
      // زبان با بالاترین درصد اطمینان را به عنوان زبان تشخیص داده شده در نظر می‌گیریم
      const detectedLanguage = langInfo.languages[0].language;
      // const confidencePercentage = langInfo.languages[0].percentage;
      // console.log(
      //   `زبان تشخیص داده شده: ${detectedLanguage} (اطمینان: ${confidencePercentage}%)`
      // );
      return detectedLanguage; // برگرداندن کد زبان تشخیص داده شده
    } else {
      // console.log("امکان تشخیص زبان وجود ندارد.");
      return null;
    }
  } catch (error) {
    // console.error("خطا در تشخیص زبان:", error);
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
