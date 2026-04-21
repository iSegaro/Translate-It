import browser from 'webextension-polyfill';
import { detectArabicScriptLanguage, detectChineseScriptLanguage, detectDevanagariScriptLanguage } from "@/shared/utils/text/textAnalysis.js";
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { getBilingualTranslationEnabledAsync, getBilingualTranslationModesAsync, getLanguageDetectionPreferencesAsync } from "@/shared/config/config.js";
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
   * Get detected language for a text using a multi-layered approach:
   * 1. Deterministic: Unique script markers (e.g., 'پ' for Persian)
   * 2. Statistical: Browser i18n API
   * 3. Heuristic: Script-based defaults and User preferences
   */
  static async getDetectedLanguage(text) {
    try {
      const preferences = await getLanguageDetectionPreferencesAsync();

      // LAYER 1: Deterministic Detection (Unique Markers)
      // We check for unique characters that definitively identify a language.
      const arabicUnique = detectArabicScriptLanguage(text, preferences, { useDefaults: false });
      if (arabicUnique) {
        logger.debug(`[LanguageSwappingService] Deterministic detection (Arabic script): ${arabicUnique}`);
        return arabicUnique;
      }

      const chineseUnique = detectChineseScriptLanguage(text, preferences, { useDefaults: false });
      if (chineseUnique) {
        logger.debug(`[LanguageSwappingService] Deterministic detection (Chinese script): ${chineseUnique}`);
        return chineseUnique;
      }

      const devanagariUnique = detectDevanagariScriptLanguage(text, preferences, { useDefaults: false });
      if (devanagariUnique) {
        logger.debug(`[LanguageSwappingService] Deterministic detection (Devanagari script): ${devanagariUnique}`);
        return devanagariUnique;
      }

      // LAYER 2: Statistical Detection (Browser API)
      // Use the browser's language detection for general cases or ambiguous short strings.
      const detectionResult = await browser.i18n.detectLanguage(text);
      if (detectionResult?.isReliable && detectionResult.languages.length > 0) {
        const mainDetection = detectionResult.languages[0];
        const detectedLangCode = getCanonicalCode(mainDetection.language);
        logger.debug(`[LanguageSwappingService] Statistical detection (Browser API): ${detectedLangCode}`);
        return detectedLangCode;
      }

      // LAYER 3: Heuristic Fallback (Preferences & Defaults)
      // If everything else fails or is unreliable, use script detection with preferences/defaults.
      const arabicFallback = detectArabicScriptLanguage(text, preferences, { useDefaults: true });
      if (arabicFallback) {
        logger.debug(`[LanguageSwappingService] Heuristic fallback (Arabic script): ${arabicFallback}`);
        return arabicFallback;
      }

      const chineseFallback = detectChineseScriptLanguage(text, preferences, { useDefaults: true });
      if (chineseFallback) {
        logger.debug(`[LanguageSwappingService] Heuristic fallback (Chinese script): ${chineseFallback}`);
        return chineseFallback;
      }

      logger.debug(`[LanguageSwappingService] Could not detect language reliably`);
      return null;
    } catch (error) {
      logger.error(`[LanguageSwappingService] Error getting detected language:`, error);
      return null;
    }
  }

  static async applyLanguageSwapping(text, sourceLang, targetLang, originalSourceLang = 'English', originalTargetLang = 'Farsi', options = {}) {
    const { providerName = 'LanguageSwapping', useRegexFallback = true, mode } = options;

    try {
      const bilingualEnabled = await getBilingualTranslationEnabledAsync();
      const bilingualModes = await getBilingualTranslationModesAsync();
      const isModeEnabled = mode ? (bilingualModes[mode] !== false) : true;

      const accurateDetectedLang = await this.getDetectedLanguage(text);

      if (accurateDetectedLang) {
        const detectedLangCode = getCanonicalCode(accurateDetectedLang);
        const targetNorm = this._normalizeLangValue(targetLang);
        const sourceNorm = this._normalizeLangValue(sourceLang);
        const targetLangCode = getCanonicalCode(targetNorm);

        // --- BILINGUAL & AUTO-SWAP LOGIC ---
        // BILINGUAL_TRANSLATION is the master switch.
        // Only swap when source is AUTO to respect user's explicit source choice.
        const shouldSwap = bilingualEnabled && isModeEnabled && detectedLangCode === targetLangCode && sourceNorm === AUTO_DETECT_VALUE;

        if (shouldSwap) {
           let newTargetLang;
           if (this._normalizeLangValue(originalSourceLang) !== AUTO_DETECT_VALUE) {
             newTargetLang = originalSourceLang;
           } else {
             // Fallback to English if original source was auto-detect
             newTargetLang = "en";
           }

           logger.debug(`${providerName}: Bilingual swap applied for mode ${mode}. Detected ${detectedLangCode} matches target ${targetLangCode}. Swapping target to ${newTargetLang}`);
           return [targetNorm, newTargetLang];
        }

        // No language swapping needed or allowed
      } else if (useRegexFallback) {
        return await this._applyRegexFallback(text, sourceLang, targetLang, originalSourceLang, originalTargetLang, providerName, mode);
      }
    } catch (error) {
      logger.error(`${providerName}: Language detection failed:`, error);
      if (useRegexFallback) {
        return await this._applyRegexFallback(text, sourceLang, targetLang, originalSourceLang, originalTargetLang, providerName, mode);
      }
    }

    // No language swapping applied
    return [sourceLang, targetLang];
  }

  static async _applyRegexFallback(text, sourceLang, targetLang, originalSourceLang, originalTargetLang, providerName, mode) {
    const targetNorm = this._normalizeLangValue(targetLang);
    const sourceNorm = this._normalizeLangValue(sourceLang);
    const targetLangCode = getCanonicalCode(targetNorm);

    const bilingualEnabled = await getBilingualTranslationEnabledAsync();
    const bilingualModes = await getBilingualTranslationModesAsync();
    const isModeEnabled = mode ? (bilingualModes[mode] !== false) : true;

    // Detect language using the centralized multi-layered approach
    const detectedLanguageRaw = await this.getDetectedLanguage(text);
    const detectedLanguage = getCanonicalCode(detectedLanguageRaw);

    // Only swap languages if:
    // 1. Text script is recognized (detectedLanguage exists) AND
    // 2. Bilingual is enabled AND
    // 3. Mode flag is enabled AND
    // 4. Detected language matches target language (meaning text is already in target language) AND
    // 5. Source is AUTO (only apply swap when auto-detect is selected)
    if (
      detectedLanguage &&
      bilingualEnabled &&
      isModeEnabled &&
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

      logger.debug(`${providerName}: Regex fallback swap for mode ${mode}: ${targetLang} → ${newTargetLang} (detected: ${detectedLanguage})`);
      return [targetNorm, newTargetLang];
    }

    return [sourceLang, targetLang];
  }
}