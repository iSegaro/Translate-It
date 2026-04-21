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
   * 
   * The order of layers is dynamically adjusted based on text length to optimize accuracy.
   */
  static async getDetectedLanguage(text) {
    if (!text || typeof text !== 'string') return null;
    
    try {
      const preferences = await getLanguageDetectionPreferencesAsync();
      const textLength = text.trim().length;
      
      // Threshold for when statistical detection (Browser API) becomes highly reliable
      const STATISTICAL_RELIABILITY_THRESHOLD = 60;
      const isLongText = textLength > STATISTICAL_RELIABILITY_THRESHOLD;

      // Helper for Layer 1: Deterministic Detection
      const getDeterministicResult = () => {
        const arabic = detectArabicScriptLanguage(text, preferences, { useDefaults: false });
        if (arabic) return arabic;
        
        const chinese = detectChineseScriptLanguage(text, preferences, { useDefaults: false });
        if (chinese) return chinese;
        
        const devanagari = detectDevanagariScriptLanguage(text, preferences, { useDefaults: false });
        if (devanagari) return devanagari;
        
        return null;
      };

      // Helper for Layer 2: Statistical Detection
      const getStatisticalResult = async () => {
        const result = await browser.i18n.detectLanguage(text);
        if (result?.isReliable && result.languages.length > 0) {
          return getCanonicalCode(result.languages[0].language);
        }
        return null;
      };

      // Helper for Layer 3: Heuristic Fallback
      const getHeuristicResult = () => {
        const arabic = detectArabicScriptLanguage(text, preferences, { useDefaults: true });
        if (arabic) return arabic;
        
        const chinese = detectChineseScriptLanguage(text, preferences, { useDefaults: true });
        if (chinese) return chinese;
        
        return null;
      };

      // --- DYNAMIC FLOW EXECUTION ---

      if (isLongText) {
        // For long text: Layer 2 (Statistical) -> Layer 1 (Deterministic) -> Layer 3 (Heuristic)
        const statistical = await getStatisticalResult();
        if (statistical) {
          logger.debug(`[LanguageSwappingService] Long text detection - Statistical: ${statistical}`);
          return statistical;
        }

        const deterministic = getDeterministicResult();
        if (deterministic) {
          logger.debug(`[LanguageSwappingService] Long text detection - Deterministic: ${deterministic}`);
          return deterministic;
        }
      } else {
        // For short text: Layer 1 (Deterministic) -> Layer 2 (Statistical) -> Layer 3 (Heuristic)
        const deterministic = getDeterministicResult();
        if (deterministic) {
          logger.debug(`[LanguageSwappingService] Short text detection - Deterministic: ${deterministic}`);
          return deterministic;
        }

        const statistical = await getStatisticalResult();
        if (statistical) {
          logger.debug(`[LanguageSwappingService] Short text detection - Statistical: ${statistical}`);
          return statistical;
        }
      }

      // Final fallback for both cases
      const heuristic = getHeuristicResult();
      if (heuristic) {
        logger.debug(`[LanguageSwappingService] Final heuristic fallback: ${heuristic}`);
        return heuristic;
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