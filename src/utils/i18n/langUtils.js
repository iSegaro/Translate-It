// src/utils/langUtils.js

import { detectTextLanguage } from "../text/textDetection.js";
import { AUTO_DETECT_VALUE } from "../constants.js";
import { getLanguageInfoFromName } from "../text/textDetection.js";

import { getScopedLogger } from '@/shared/logging/logger.js';
const logger = getScopedLogger('Background', 'langUtils');


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
  label = AUTO_DETECT_VALUE,
) {
  if (selectedLang && selectedLang !== AUTO_DETECT_VALUE) {
  logger.debug(`: Using selected ${label} language: ${selectedLang}`);
    return selectedLang;
  }

  try {
  logger.debug(`: Detecting ${label} language from text...`);
    const detectedLang = await detectTextLanguage(text);
    if (detectedLang) {
      logger.debug(`Auto-detected ${label} language: ${detectedLang}`);
      return detectedLang;
    } else {
      logger.warn(`Failed to detect ${label} language. Fallback to 'en'.`);
      return "en"; // fallback
    }
  } catch (error) {
  logger.error(`: Error detecting ${label} language:`, error);
    return "en"; // fallback on error
  }
}
