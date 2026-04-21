import browser from 'webextension-polyfill';
import { 
  detectArabicScriptLanguage, 
  detectChineseScriptLanguage, 
  detectDevanagariScriptLanguage,
  detectLatinScriptLanguage,
  isArabicScriptText,
  isChineseScriptText,
  ARABIC_SCRIPT_LANGUAGES,
  CHINESE_SCRIPT_LANGUAGES,
  DEVANAGARI_SCRIPT_LANGUAGES
} from "@/shared/utils/text/textAnalysis.js";
import { getLanguageDetectionPreferencesAsync } from "@/shared/config/config.js";
import { getCanonicalCode, LANGUAGE_CODE_TO_NAME_MAP } from "@/shared/config/languageConstants.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'LanguageDetectionService');

/**
 * Centralized Language Detection Service
 * Provides a multi-layered, context-aware detection flow for the entire extension.
 */
export class LanguageDetectionService {
  /**
   * Main detection entry point
   * 1. Deterministic Layer (Unique Markers)
   * 2. Statistical Layer (Browser API)
   * 3. Heuristic Layer (Script Defaults & Preferences)
   * 
   * @param {string} text - Text to analyze
   * @returns {string|null} Detected language code
   */
  static async detect(text) {
    if (!text || typeof text !== 'string' || !text.trim()) return null;
    
    try {
      const preferences = await getLanguageDetectionPreferencesAsync();
      const sample = text.trim();
      const textLength = sample.length;
      
      // Threshold for when statistical detection (Browser API) becomes highly reliable
      const STATISTICAL_RELIABILITY_THRESHOLD = 60;
      const isLongText = textLength > STATISTICAL_RELIABILITY_THRESHOLD;

      // --- LAYER 1: DETERMINISTIC (Unique Markers) ---
      const getDeterministicResult = () => {
        // Arabic Script family
        const arabic = detectArabicScriptLanguage(sample, preferences, { useDefaults: false });
        if (arabic) return arabic;
        
        // Chinese Script family
        const chinese = detectChineseScriptLanguage(sample, preferences, { useDefaults: false });
        if (chinese) return chinese;
        
        // Devanagari Script family
        const devanagari = detectDevanagariScriptLanguage(sample, preferences, { useDefaults: false });
        if (devanagari) return devanagari;

        // Latin & Cyrillic Script markers (Enhanced European support)
        const latinVariant = detectLatinScriptLanguage(sample);
        if (latinVariant) return latinVariant;

        // Japanese/Korean specific ranges
        if (/[\u3040-\u309F\u30A0-\u30FF]/.test(sample)) return 'ja';
        if (/[\uAC00-\uD7AF]/.test(sample)) return 'ko';

        return null;
      };

      // --- LAYER 2: STATISTICAL (Browser API) ---
      const getStatisticalResult = async () => {
        try {
          const result = await browser.i18n.detectLanguage(sample);
          if (result && result.languages && result.languages.length > 0) {
            const top = result.languages[0];
            // Only trust if reliable or very high percentage
            if (result.isReliable || top.percentage > 50) {
              const lang = getCanonicalCode(top.language);
              
              // Validation 1: Script/Language consistency
              const isTextArabic = isArabicScriptText(sample);
              const isResultArabic = ARABIC_SCRIPT_LANGUAGES.includes(lang);

              // Prevention of common false positives
              if (lang === 'ko' && !/[\uAC00-\uD7AF]/.test(sample)) return null;
              if (lang === 'ja' && !/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(sample)) return null;
              if (lang === 'zh' && !isChineseScriptText(sample)) return null;
              if ((lang === 'fa' || lang === 'ar') && !isTextArabic) return null;

              // Validation 2: Script Consistency Check
              // If text is Arabic script but API detected a non-Arabic script language, it's a false positive.
              if (isTextArabic && !isResultArabic) return null;
              
              // Validation 3: Dynamic Trust Filter for Short/Unreliable Strings
              // For short strings, the browser API is often probabilistic but not certain (isReliable: false).
              // We only trust these "guesses" if they align with the user's context.
              if (textLength < 25 && !result.isReliable) {
                const uiLang = browser.i18n.getUILanguage().split('-')[0].toLowerCase();
                const targetLang = preferences.targetLanguage ? getCanonicalCode(preferences.targetLanguage) : null;
                
                // The "Dynamic Trust Set" consists of languages the user is actually likely to encounter:
                // 1. User's UI Language
                // 2. User's chosen Target Language
                // 3. English (The global bridge for Latin script)
                const DYNAMIC_TRUST_SET = new Set([uiLang, targetLang, 'en'].filter(Boolean));
                
                if (!DYNAMIC_TRUST_SET.has(lang)) {
                  logger.debug(`[LanguageDetectionService] Statistical guess '${lang}' rejected for short string (not in user context).`);
                  return null;
                }
              }

              // Validation 4: Final SSOT Check
              // Ensure the language is actually known to the extension constants.
              if (!LANGUAGE_CODE_TO_NAME_MAP[lang]) {
                logger.debug(`[LanguageDetectionService] Unrecognized language code '${lang}' rejected.`);
                return null;
              }
              
              return lang;
            }
          }
        } catch (err) {
          logger.debug('[LanguageDetectionService] Browser API error:', err);
        }
        return null;
      };

      // --- LAYER 3: HEURISTIC (Fallbacks & Defaults) ---
      const getHeuristicResult = () => {
        const arabic = detectArabicScriptLanguage(sample, preferences, { useDefaults: true });
        if (arabic) return arabic;
        
        const chinese = detectChineseScriptLanguage(sample, preferences, { useDefaults: true });
        if (chinese) return chinese;

        const devanagari = detectDevanagariScriptLanguage(sample, preferences, { useDefaults: true });
        if (devanagari) return devanagari;
        
        return null;
      };

      // --- DYNAMIC FLOW EXECUTION ---
      if (isLongText) {
        // Long text: Statistical -> Deterministic -> Heuristic
        const statistical = await getStatisticalResult();
        if (statistical) {
          logger.debug(`[LanguageDetectionService] Long text detection - Statistical: ${statistical}`);
          return statistical;
        }

        const deterministic = getDeterministicResult();
        if (deterministic) {
          logger.debug(`[LanguageDetectionService] Long text detection - Deterministic: ${deterministic}`);
          return deterministic;
        }
      } else {
        // Short text: Deterministic -> Statistical -> Heuristic
        const deterministic = getDeterministicResult();
        if (deterministic) {
          logger.debug(`[LanguageDetectionService] Short text detection - Deterministic: ${deterministic}`);
          return deterministic;
        }

        const statistical = await getStatisticalResult();
        if (statistical) {
          logger.debug(`[LanguageDetectionService] Short text detection - Statistical: ${statistical}`);
          return statistical;
        }
      }

      // Final fallback
      const heuristic = getHeuristicResult();
      if (heuristic) {
        logger.debug(`[LanguageDetectionService] Final heuristic fallback: ${heuristic}`);
        return heuristic;
      }

      logger.debug(`[LanguageDetectionService] Could not detect language reliably`);
      return null;
    } catch (error) {
      logger.error(`[LanguageDetectionService] Error in detection flow:`, error);
      return null;
    }
  }
}
