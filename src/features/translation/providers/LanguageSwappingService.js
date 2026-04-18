import browser from 'webextension-polyfill';
import { isPersianText, isArabicScriptText, detectArabicScriptLanguage } from "@/shared/utils/text/textAnalysis.js";
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { getBilingualTranslationEnabledAsync, getLanguageDetectionPreferencesAsync } from "@/shared/config/config.js";

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

  /**
   * Get detected language for a text without performing swap
   * Used to provide accurate source language when source='auto'
   */
  static async getDetectedLanguage(text) {
    try {
      const preferences = await getLanguageDetectionPreferencesAsync();

      // First try Arabic script detection with preferences
      const detected = detectArabicScriptLanguage(text, preferences);
      if (detected) {
        logger.debug(`[LanguageSwappingService] Detected Arabic script language: ${detected}`);
        return detected;
      }

      // Fallback to browser API detection
      const detectionResult = await browser.i18n.detectLanguage(text);
      if (detectionResult?.isReliable && detectionResult.languages.length > 0) {
        const mainDetection = detectionResult.languages[0];
        const detectedLangCode = mainDetection.language.split("-")[0];
        logger.debug(`[LanguageSwappingService] Fallback detected language (browser API): ${detectedLangCode}`);
        return detectedLangCode;
      }

      logger.debug(`[LanguageSwappingService] Could not detect language reliably`);
      return null;
    } catch (error) {
      logger.error(`[LanguageSwappingService] Error getting detected language:`, error);
      return null;
    }
  }

  static async applyLanguageSwapping(text, sourceLang, targetLang, originalSourceLang = 'English', originalTargetLang = 'Farsi', options = {}) {
    const { providerName = 'LanguageSwapping', useRegexFallback = true } = options;

    try {
      const bilingualEnabled = await getBilingualTranslationEnabledAsync();
      const detectionResult = await browser.i18n.detectLanguage(text);

      // Get user language detection preferences for accurate Arabic script detection
      const preferences = await getLanguageDetectionPreferencesAsync();
      const accurateDetectedLang = detectArabicScriptLanguage(text, preferences);

      if (detectionResult?.isReliable && detectionResult.languages.length > 0) {
        const mainDetection = detectionResult.languages[0];
        const detectedLangCode = mainDetection.language.split("-")[0];

        const targetNorm = this._normalizeLangValue(targetLang);
        const sourceNorm = this._normalizeLangValue(sourceLang);
        const targetLangCode = targetNorm.split("-")[0];

        // --- BILINGUAL & AUTO-SWAP LOGIC ---
        // BILINGUAL_TRANSLATION is the master switch.
        // Use accurate Arabic script detection for bilingual logic.
        // Only swap when source is AUTO to respect user's explicit source choice.
        const accurateLangCode = accurateDetectedLang || detectedLangCode;

        const shouldSwap = bilingualEnabled && accurateLangCode === targetLangCode && sourceNorm === AUTO_DETECT_VALUE;

        if (shouldSwap) {
           let newTargetLang;
           if (this._normalizeLangValue(originalSourceLang) !== AUTO_DETECT_VALUE) {
             newTargetLang = originalSourceLang;
           } else {
             // Fallback to English if original source was auto-detect
             newTargetLang = "en";
           }

           logger.debug(`${providerName}: Bilingual swap applied. Detected ${accurateLangCode} matches target ${targetLangCode}. Swapping target to ${newTargetLang}`);
           return [targetNorm, newTargetLang];
        }

        // No language swapping needed or allowed
      } else if (useRegexFallback) {
        return await this._applyRegexFallback(text, sourceLang, targetLang, originalSourceLang, originalTargetLang, providerName);
      }
    } catch (error) {
      logger.error(`${providerName}: Language detection failed:`, error);
      if (useRegexFallback) {
        return await this._applyRegexFallback(text, sourceLang, targetLang, originalSourceLang, originalTargetLang, providerName);
      }
    }

    // No language swapping applied
    return [sourceLang, targetLang];
  }

  static async _applyRegexFallback(text, sourceLang, targetLang, originalSourceLang, originalTargetLang, providerName) {
    const targetNorm = this._normalizeLangValue(targetLang);
    const sourceNorm = this._normalizeLangValue(sourceLang);
    const targetLangCode = targetNorm.split("-")[0];
    const sourceLangCode = sourceNorm.split("-")[0];

    const bilingualEnabled = await getBilingualTranslationEnabledAsync();

    // Get user language detection preferences using StorageManager
    const preferences = await getLanguageDetectionPreferencesAsync();

    // Detect language with user preferences
    const detectedLanguage = detectArabicScriptLanguage(text, preferences);

    // Only swap languages if:
    // 1. Text is Arabic script (detectedLanguage exists) AND
    // 2. Bilingual is enabled AND
    // 3. Detected language matches target language (meaning text is already in target language) AND
    // 4. Source is AUTO (only apply swap when auto-detect is selected)
    if (
      detectedLanguage &&
      bilingualEnabled &&
      detectedLanguage === targetLangCode &&
      sourceNorm === AUTO_DETECT_VALUE
    ) {
      let newTargetLang;

      if (this._normalizeLangValue(originalSourceLang) !== AUTO_DETECT_VALUE) {
        newTargetLang = originalSourceLang;
      } else {
        // Default to English when source is auto and target is Persian/Arabic
        newTargetLang = "en";
      }

      logger.debug(`${providerName}: Regex fallback swap: ${targetLang} → ${newTargetLang} (detected: ${detectedLanguage})`);
      return [targetNorm, newTargetLang];
    }

    return [sourceLang, targetLang];
  }
}