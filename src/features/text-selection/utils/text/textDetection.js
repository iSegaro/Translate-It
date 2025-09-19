// src/features/text-selection/utils/text/textDetection.js
// Extended text detection utilities specific to text-selection feature
import browser from "webextension-polyfill";
import { CONFIG } from "@/shared/config/config.js";
import { languageList } from "../i18n/languages.js";
import {
  isPersianText as sharedIsPersianText,
  shouldApplyRtl as sharedShouldApplyRtl
} from "@/shared/utils/text/textAnalysis.js";

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

// Lazy initialization to avoid TDZ issues
let logger = null;
const getLogger = () => {
  if (!logger) {
    logger = getScopedLogger(LOG_COMPONENTS.TEXT, 'textDetection');
  }
  return logger;
};

// Re-export from shared for backward compatibility within text-selection
export const isPersianText = sharedIsPersianText;
export const shouldApplyRtl = sharedShouldApplyRtl;

// Text-selection specific utilities
export const isRtlText = (text) => {
  return CONFIG.RTL_REGEX.test(text);
};

export const containsPersian = (text) => {
  return /[\u0600-\u06FF]/.test(text);
};

export const applyTextDirection = (element, text) => {
  if (!element || !element.style) return;

  const isRtl = isRtlText(text);
  element.style.direction = isRtl ? "rtl" : "ltr";
  element.style.textAlign = isRtl ? "right" : "left";
};

export const applyElementDirection = (element, rtl_direction = false) => {
  if (!element || !element.style) return;

  element.style.direction = rtl_direction ? "rtl" : "ltr";
  element.style.textAlign = rtl_direction ? "right" : "left";
};

export const correctTextDirection = (element, text) => {
  if (!element) return;

  const isRtl = sharedShouldApplyRtl(text);
  applyElementDirection(element, isRtl);
};

// Language detection functions specific to text-selection
export async function detectTextLanguage(text) {
  try {
    const result = await browser.i18n.detectLanguage(text);
    if (result.languages.length > 0) {
      return result.languages[0].language;
    }
  } catch (error) {
    getLogger().error("Language detection failed:", error);
  }
  return null;
}

export function getLanguageInfoFromCode(detectedLanguageCode) {
  if (!detectedLanguageCode) return null;

  const language = languageList.find(
    (lang) => lang.code.toLowerCase() === detectedLanguageCode.toLowerCase()
  );

  if (language) {
    return {
      code: language.code,
      name: language.name,
      direction: language.direction || "ltr",
    };
  }

  // Fallback for common language codes
  const fallbackMap = {
    en: { code: "en", name: "English", direction: "ltr" },
    fa: { code: "fa", name: "Persian", direction: "rtl" },
    ar: { code: "ar", name: "Arabic", direction: "rtl" },
    zh: { code: "zh", name: "Chinese", direction: "ltr" },
    es: { code: "es", name: "Spanish", direction: "ltr" },
    fr: { code: "fr", name: "French", direction: "ltr" },
    de: { code: "de", name: "German", direction: "ltr" },
    ja: { code: "ja", name: "Japanese", direction: "ltr" },
    ko: { code: "ko", name: "Korean", direction: "ltr" },
    ru: { code: "ru", name: "Russian", direction: "ltr" },
  };

  return fallbackMap[detectedLanguageCode.toLowerCase()] || null;
}

export function getLanguageInfoFromName(detectedLanguageName) {
  if (!detectedLanguageName) return null;

  const language = languageList.find(
    (lang) => lang.name.toLowerCase() === detectedLanguageName.toLowerCase()
  );

  if (language) {
    return {
      code: language.code,
      name: language.name,
      direction: language.direction || "ltr",
    };
  }

  // Try to find by partial match
  const partialMatch = languageList.find((lang) =>
    lang.name.toLowerCase().includes(detectedLanguageName.toLowerCase())
  );

  if (partialMatch) {
    return {
      code: partialMatch.code,
      name: partialMatch.name,
      direction: partialMatch.direction || "ltr",
    };
  }

  return null;
}