import browser from 'webextension-polyfill';
import { isPersianText } from "@/utils/text/textDetection.js";
import { getLanguageCode } from "@/utils/i18n/languages.js";
import { AUTO_DETECT_VALUE } from "@/constants.js";
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
        const targetLangCode = getLanguageCode(targetNorm).split("-")[0];

        if (detectedLangCode === targetLangCode) {
          let newTargetLang;
          
          if (sourceNorm !== AUTO_DETECT_VALUE) {
            newTargetLang = sourceNorm;
          } else if (this._normalizeLangValue(originalSourceLang) !== AUTO_DETECT_VALUE) {
            newTargetLang = originalSourceLang;
          } else {
            const originalTargetLangCode = getLanguageCode(originalTargetLang).split("-")[0];
            if (detectedLangCode !== originalTargetLangCode) {
              newTargetLang = originalTargetLang;
            } else {
              newTargetLang = 'English';
            }
          }
          
          logger.debug(`${providerName}: Languages swapped from ${targetLang} to ${newTargetLang} (detected: ${detectedLangCode}, originalSource: ${originalSourceLang}, originalTarget: ${originalTargetLang})`);
          return [targetNorm, newTargetLang];
        }
        
        logger.debug(`${providerName}: No language swapping: detected=${detectedLangCode}, source=${sourceNorm}, target=${targetLangCode}`);
      } else if (useRegexFallback) {
        return this._applyRegexFallback(text, sourceLang, targetLang, originalSourceLang, originalTargetLang, providerName);
      }
    } catch (error) {
      logger.error(`${providerName}: Language detection failed:`, error);
      if (useRegexFallback) {
        return this._applyRegexFallback(text, sourceLang, targetLang, originalSourceLang, originalTargetLang, providerName);
      }
    }

    logger.debug(`${providerName}: No language swapping applied: source=${sourceLang}, target=${targetLang}`);
    return [sourceLang, targetLang];
  }

  static _applyRegexFallback(text, sourceLang, targetLang, originalSourceLang, originalTargetLang, providerName) {
    const targetNorm = this._normalizeLangValue(targetLang);
    const sourceNorm = this._normalizeLangValue(sourceLang);
    const targetLangCode = getLanguageCode(targetNorm).split("-")[0];

    if (
      isPersianText(text) &&
      (targetLangCode === "fa" || targetLangCode === "ar")
    ) {
      let newTargetLang;
      
      if (sourceNorm !== AUTO_DETECT_VALUE) {
        newTargetLang = sourceNorm;
      } else if (this._normalizeLangValue(originalSourceLang) !== AUTO_DETECT_VALUE) {
        newTargetLang = originalSourceLang;
      } else {
        const originalTargetLangCode = getLanguageCode(originalTargetLang).split("-")[0];
        if ("fa" !== originalTargetLangCode) {
          newTargetLang = originalTargetLang;
        } else {
          newTargetLang = 'English';
        }
      }
      
      logger.debug(`${providerName}: Languages swapped using regex fallback from ${targetLang} to ${newTargetLang} (originalSource: ${originalSourceLang}, originalTarget: ${originalTargetLang})`);
      return [targetNorm, newTargetLang];
    }

    return [sourceLang, targetLang];
  }
}