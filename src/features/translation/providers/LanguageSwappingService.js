import browser from 'webextension-polyfill';
import { isPersianText } from "@/shared/utils/text/textAnalysis.js";
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'LanguageSwappingService');

export class LanguageSwappingService {
  static _normalizeLangValue(lang) {
    if (!lang || typeof lang !== 'string') return AUTO_DETECT_VALUE;
    const raw = lang.trim();
    if (!raw) return AUTO_DETECT_VALUE;

    const lower = raw.toLowerCase();
    const autoAliases = new Set(['auto', 'auto-detect', 'autodetect', 'auto detect', 'detect']);
    if (autoAliases.has(lower)) return AUTO_DETECT_VALUE;

    const langNameToCodeMap = {
      afrikaans: "af", albanian: "sq", arabic: "ar", azerbaijani: "az",
      belarusian: "be", bengali: "bn", bulgarian: "bg", catalan: "ca",
      cebuano: "ceb", "chinese (simplified)": "zh-CN", chinese: "zh-CN",
      croatian: "hr", czech: "cs", danish: "da", dutch: "nl",
      english: "en", estonian: "et", farsi: "fa", persian: "fa",
      filipino: "fil", finnish: "fi", french: "fr", german: "de",
      greek: "el", hebrew: "he", hindi: "hi", hungarian: "hu",
      indonesian: "id", italian: "it", japanese: "ja", kannada: "kn",
      kazakh: "kk", korean: "ko", latvian: "lv", lithuanian: "lt",
      malay: "ms", malayalam: "ml", marathi: "mr", nepali: "ne",
      norwegian: "no", odia: "or", pashto: "ps", polish: "pl",
      portuguese: "pt", punjabi: "pa", romanian: "ro", russian: "ru",
      serbian: "sr", sinhala: "si", slovak: "sk", slovenian: "sl",
      spanish: "es", swahili: "sw", swedish: "sv", tagalog: "tl",
      tamil: "ta", telugu: "te", thai: "th", turkish: "tr",
      ukrainian: "uk", urdu: "ur", uzbek: "uz", vietnamese: "vi"
    };

    if (langNameToCodeMap[lower]) return langNameToCodeMap[lower];
    return lower;
  }

  static async applyLanguageSwapping(text, sourceLang, targetLang, originalSourceLang = 'English', originalTargetLang = 'Farsi', options = {}) {
    const { providerName = 'LanguageSwapping', useRegexFallback = true } = options;

    try {
      const detectionResult = await browser.i18n.detectLanguage(text);
      if (detectionResult?.isReliable && detectionResult.languages.length > 0) {
        const mainDetection = detectionResult.languages[0];
        const detectedLangCode = mainDetection.language.split("-")[0];

        const targetNorm = this._normalizeLangValue(targetLang);
        const sourceNorm = this._normalizeLangValue(sourceLang);
        const targetLangCode = targetNorm.split("-")[0];
        // Language detection details logged at TRACE level

        // Only swap if text detected as target language AND source is auto-detect
        if (detectedLangCode === targetLangCode && sourceNorm === AUTO_DETECT_VALUE) {
          let newTargetLang;

          if (this._normalizeLangValue(originalSourceLang) !== AUTO_DETECT_VALUE) {
            newTargetLang = originalSourceLang;
          } else {
            // Default to English when user has auto-detect and target matches detected language
            newTargetLang = "en";
          }

          logger.debug(`${providerName}: Languages swapped due to detection from ${targetLang} to ${newTargetLang}`);
          return [targetNorm, newTargetLang];
        }

        // No language swapping needed
      } else if (useRegexFallback) {
        return this._applyRegexFallback(text, sourceLang, targetLang, originalSourceLang, originalTargetLang, providerName);
      }
    } catch (error) {
      logger.error(`${providerName}: Language detection failed:`, error);
      if (useRegexFallback) {
        return this._applyRegexFallback(text, sourceLang, targetLang, originalSourceLang, originalTargetLang, providerName);
      }
    }

    // No language swapping applied
    return [sourceLang, targetLang];
  }

  static _applyRegexFallback(text, sourceLang, targetLang, originalSourceLang, originalTargetLang, providerName) {
    const targetNorm = this._normalizeLangValue(targetLang);
    const sourceNorm = this._normalizeLangValue(sourceLang);
    const targetLangCode = targetNorm.split("-")[0];
    const sourceLangCode = sourceNorm.split("-")[0];

    // Only swap languages if:
    // 1. Text is Persian AND
    // 2. Source is auto-detect AND
    // 3. Target is Persian or Arabic AND
    // 4. Target language is NOT what the user actually wants (not explicit source)
    if (
      isPersianText(text) &&
      sourceNorm === AUTO_DETECT_VALUE &&
      (targetLangCode === "fa" || targetLangCode === "ar") &&
      targetLangCode !== sourceLangCode
    ) {
      let newTargetLang;

      if (this._normalizeLangValue(originalSourceLang) !== AUTO_DETECT_VALUE) {
        newTargetLang = originalSourceLang;
      } else {
        // Default to English when source is auto and target is Persian/Arabic
        newTargetLang = "en";
      }

      logger.debug(`${providerName}: Languages swapped using regex fallback from ${targetLang} to ${newTargetLang} (originalSource: ${originalSourceLang}, originalTarget: ${originalTargetLang})`);
      return [targetNorm, newTargetLang];
    }

    return [sourceLang, targetLang];
  }
}