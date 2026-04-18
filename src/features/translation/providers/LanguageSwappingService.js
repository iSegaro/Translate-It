import browser from 'webextension-polyfill';
import { isPersianText, isArabicScriptText, detectArabicScriptLanguage, isChineseScriptText, detectChineseScriptLanguage } from "@/shared/utils/text/textAnalysis.js";
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { getBilingualTranslationEnabledAsync, getLanguageDetectionPreferencesAsync } from "@/shared/config/config.js";
import { LANGUAGE_NAME_TO_CODE_MAP, getCanonicalCode } from "@/shared/config/languageConstants.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'LanguageSwappingService');

export class LanguageSwappingService {
  static _normalizeLangValue(lang) {
    if (!lang || typeof lang !== 'string') return AUTO_DETECT_VALUE;
    const raw = lang.trim();
    if (!raw) return AUTO_DETECT_VALUE;

    const lower = raw.toLowerCase();
    const autoAliases = new Set(['auto', 'auto-detect', 'autodetect', 'auto detect', 'detect']);
    if (autoAliases.has(lower)) return AUTO_DETECT_VALUE;

    if (LANGUAGE_NAME_TO_CODE_MAP[lower]) return LANGUAGE_NAME_TO_CODE_MAP[lower];
    return lower;
  }

  /**
   * Get detected language for a text without performing swap
   * Used to provide accurate source language when source='auto'
   */
  static async getDetectedLanguage(text) {
    try {
      const preferences = await getLanguageDetectionPreferencesAsync();

      // 1. Try Arabic script detection with preferences
      const arabicDetected = detectArabicScriptLanguage(text, preferences);
      if (arabicDetected) {
        logger.debug(`[LanguageSwappingService] Detected Arabic script language: ${arabicDetected}`);
        return arabicDetected;
      }

      // 2. Try Chinese script detection with preferences
      const chineseDetected = detectChineseScriptLanguage(text, preferences);
      if (chineseDetected) {
        logger.debug(`[LanguageSwappingService] Detected Chinese script language: ${chineseDetected}`);
        return chineseDetected;
      }

      // 3. Fallback to browser API detection
      const detectionResult = await browser.i18n.detectLanguage(text);
      if (detectionResult?.isReliable && detectionResult.languages.length > 0) {
        const mainDetection = detectionResult.languages[0];
        const detectedLangCode = getCanonicalCode(mainDetection.language);
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

      // Get user language detection preferences for accurate script detection
      const preferences = await getLanguageDetectionPreferencesAsync();
      
      const arabicDetected = detectArabicScriptLanguage(text, preferences);
      const chineseDetected = detectChineseScriptLanguage(text, preferences);
      const accurateDetectedLang = arabicDetected || chineseDetected;

      if (detectionResult?.isReliable && detectionResult.languages.length > 0) {
        const mainDetection = detectionResult.languages[0];
        const detectedLangCode = getCanonicalCode(mainDetection.language);

        const targetNorm = this._normalizeLangValue(targetLang);
        const sourceNorm = this._normalizeLangValue(sourceLang);
        const targetLangCode = getCanonicalCode(targetNorm);

        // --- BILINGUAL & AUTO-SWAP LOGIC ---
        // BILINGUAL_TRANSLATION is the master switch.
        // Use accurate script detection (Arabic/Chinese) for bilingual logic.
        // Only swap when source is AUTO to respect user's explicit source choice.
        const accurateLangCode = getCanonicalCode(accurateDetectedLang || detectedLangCode);

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
    const targetLangCode = getCanonicalCode(targetNorm);

    const bilingualEnabled = await getBilingualTranslationEnabledAsync();

    // Get user language detection preferences
    const preferences = await getLanguageDetectionPreferencesAsync();

    // Detect language with user preferences (Arabic and Chinese scripts)
    const arabicDetected = detectArabicScriptLanguage(text, preferences);
    const chineseDetected = detectChineseScriptLanguage(text, preferences);
    const detectedLanguage = getCanonicalCode(arabicDetected || chineseDetected);

    // Only swap languages if:
    // 1. Text script is recognized (detectedLanguage exists) AND
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