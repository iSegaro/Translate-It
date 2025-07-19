// src/utils/langUtils.js

import { logME } from "./helpers.js";
import { detectTextLanguage } from "./textDetection.js";
import { AUTO_DETECT_VALUE } from "tts-utils";
import { getLanguageInfoFromName } from "./textDetection.js";

/**
 * دریافت کد زبان قابل استفاده در TTS
 * اگر مقدار ورودی یک نام زبان باشد (مثل "English")، به "en" تبدیل می‌شود.
 * اگر کد زبان بود (مثل "en")، تأیید و بازگردانده می‌شود.
 * اگر مقدار auto یا null بود، fallback به "en" انجام می‌شود.
 */
export function resolveLangCode(inputLang) {
  if (!inputLang || inputLang.toLowerCase() === AUTO_DETECT_VALUE) {
    return "en"; // Fallback پیش‌فرض
  }

  const lower = inputLang.trim().toLowerCase();

  // تلاش برای پیدا کردن توسط name، promptName یا code
  const langInfo = getLanguageInfoFromName(lower);
  if (langInfo?.code) return langInfo.code;

  return "en"; // اگر پیدا نشد fallback
}

export async function getEffectiveLanguage(
  text,
  selectedLang,
  label = AUTO_DETECT_VALUE
) {
  if (selectedLang && selectedLang !== AUTO_DETECT_VALUE) {
    logME(`[Lang Resolver]: Using selected ${label} language: ${selectedLang}`);
    return selectedLang;
  }

  try {
    logME(`[Lang Resolver]: Detecting ${label} language from text...`);
    const detectedLang = await detectTextLanguage(text);
    if (detectedLang) {
      logME(
        `[Lang Resolver]: Auto-detected ${label} language: ${detectedLang}`
      );
      return detectedLang;
    } else {
      logME(
        `[Lang Resolver]: Failed to detect ${label} language. Fallback to 'en'.`
      );
      return "en"; // fallback
    }
  } catch (error) {
    logME(`[Lang Resolver]: Error detecting ${label} language:`, error);
    return "en"; // fallback on error
  }
}
