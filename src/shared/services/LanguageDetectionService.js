import browser from 'webextension-polyfill';
import {
  detectArabicScriptLanguage,
  detectChineseScriptLanguage,
  detectDevanagariScriptLanguage,
  detectLatinScriptLanguage,
  isArabicScriptText,
  isCjkScriptText,
  isDevanagariScriptText,
  isLatinScriptText,
  isChineseScriptText,
  shouldApplyRtl,
  ARABIC_SCRIPT_LANGUAGES,
  LATIN_SCRIPT_PRIORITY_LANGUAGES
} from "@/shared/utils/text/textAnalysis.js";
import { getLanguageDetectionPreferencesAsync } from "@/shared/config/config.js";
import {
  getCanonicalCode,
  LANGUAGE_CODE_TO_NAME_MAP,
  LANGUAGE_NAME_TO_CODE_MAP,
  GLOBAL_TRUSTED_LANGUAGES,
  RTL_LANGUAGES
} from "@/shared/config/languageConstants.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'LanguageDetectionService');

// Pre-create trusted set for O(1) lookups
const GLOBAL_TRUSTED_SET = new Set(GLOBAL_TRUSTED_LANGUAGES);

/**
 * Session-based detection cache (Layer 0)
 * Stores verified detection results to avoid redundant processing.
 * Keys are a combination of Context (URL/Tab) and Script Family.
 */
const SESSION_CACHE = new Map();
const MAX_CACHE_SIZE = 500;

// Cleanup cache when provider or detection preferences change to ensure fresh detection
if (typeof browser !== 'undefined' && browser.storage && browser.storage.onChanged) {
  browser.storage.onChanged.addListener((changes) => {
    if (changes.translationApi || changes.targetLanguage || changes.LANGUAGE_DETECTION_PREFERENCES) {
      logger.debug('[LanguageDetectionService] Provider/Settings changed, clearing detection cache.');
      SESSION_CACHE.clear();
    }
  });
}

/**
 * Centralized Language Detection Service
 * Provides a multi-layered, context-aware detection flow for entire extension.
 */
export class LanguageDetectionService {
  /**
   * Checks if a language code or name is considered RTL (Right-to-Left).
   *
   * @param {string} langOrName - Language code or full name to check
   * @returns {boolean} True if language is RTL
   */
  static isRTL(langOrName) {
    if (!langOrName || langOrName === 'auto') return false;

    const input = langOrName.toLowerCase().trim();

    // 1. Try to get code from name mapping (e.g., 'Persian' -> 'fa')
    const codeFromName = LANGUAGE_NAME_TO_CODE_MAP[input];
    const code = codeFromName || input;

    const lang = getCanonicalCode(code);
    return RTL_LANGUAGES.has(lang);
  }

  /**
   * Determines text direction (rtl or ltr) based on language code and/or content.
   *
   * @param {string} text - Text to analyze (for content-based fallback)
   * @param {string} langCode - Explicit language code (primary source)
   * @returns {string} 'rtl' or 'ltr'
   */
  static getDirection(text, langCode = null) {
    // 1. Primary source: explicit language code
    if (langCode && langCode !== 'auto') {
      if (this.isRTL(langCode)) return 'rtl';
    }

    // 2. Secondary source: content analysis (for auto-detect or mixed content)
    if (text) {
      return shouldApplyRtl(text) ? 'rtl' : 'ltr';
    }

    // 3. Final default
    return 'ltr';
  }

  /**
   * Identifies general script family of text.
   * Used to partition cache by script type within the same URL.
   *
   * @param {string} text - Text to analyze
   * @returns {string} Script family code ('latin', 'arabic', 'cjk', 'devanagari', 'other')
   */
  static getScriptFamily(text) {
    if (!text) return 'other';
    if (isArabicScriptText(text)) return 'arabic';
    if (isCjkScriptText(text)) return 'cjk';
    if (isDevanagariScriptText(text)) return 'devanagari';
    if (isLatinScriptText(text)) return 'latin';
    return 'other';
  }

  /**
   * Registers a verified detection result (Feedback Loop from Providers).
   *
   * @param {string} text - The original text
   * @param {string} langCode - The verified language code
   * @param {Object} context - Optional context (url, tabId)
   */
  static registerDetectionResult(text, langCode, context = {}) {
    if (!text || !langCode || langCode === 'auto') return;

    const sample = text.trim();
    if (sample.length < 2) return;

    // We cache based on (URL + ScriptFamily) for high-performance context inheritance,
    // and also (TextHash) for exact matches in Popups/Sidepanels.
    const scriptFamily = this.getScriptFamily(sample);
    const lang = getCanonicalCode(langCode);

    // 1. Text-specific cache (Short term, exact match)
    if (sample.length < 500) {
      SESSION_CACHE.set(`text:${sample}`, lang);
    }

    // 2. Contextual cache (URL-based inheritance)
    if (context.url) {
      const urlKey = `url:${context.url}:${scriptFamily}`;
      SESSION_CACHE.set(urlKey, lang);
    }

    // Maintain cache size
    if (SESSION_CACHE.size > MAX_CACHE_SIZE) {
      const firstKey = SESSION_CACHE.keys().next().value;
      SESSION_CACHE.delete(firstKey);
    }

    logger.debug(`[LanguageDetectionService] Registered feedback: "${sample.substring(0, 20)}..." -> ${lang}`);
  }

  /**
   * Main detection entry point
   * 0. Layer 0: Session Cache (Contextual & Exact)
   * 1. Layer 1: Deterministic Layer (Unique Markers)
   * 2. Layer 2: Statistical Layer (Browser API)
   * 3. Layer 3: Heuristic Layer (Script Defaults & Preferences)
   *
   * @param {string} text - Text to analyze
   * @param {Object} options - Detection options (url, tabId)
   * @returns {string|null} Detected language code
   */
  static async detect(text, options = {}) {
    if (!text || typeof text !== 'string' || !text.trim()) return null;

    try {
      const sample = text.trim();

      // --- LAYER 0: SESSION CACHE ---
      // Check for exact text match first
      const exactCached = SESSION_CACHE.get(`text:${sample}`);
      if (exactCached) {
        logger.debug(`[LanguageDetectionService] Layer 0: Exact match cache hit: ${exactCached}`);
        return exactCached;
      }

      // Check for URL/Script-based inheritance
      if (options.url) {
        const scriptFamily = this.getScriptFamily(sample);
        const contextualCached = SESSION_CACHE.get(`url:${options.url}:${scriptFamily}`);
        if (contextualCached) {
          logger.debug(`[LanguageDetectionService] Layer 0: Contextual cache hit (${scriptFamily}): ${contextualCached}`);
          return contextualCached;
        }
      }

      const preferences = await getLanguageDetectionPreferencesAsync();
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
        const latinVariant = detectLatinScriptLanguage(sample, preferences, { useDefaults: false });
        if (latinVariant) return latinVariant;

        // Japanese/Korean specific ranges
        if (/[぀-ゟ゠-ヿ]/.test(sample)) return 'ja';
        if (/[가-힯]/.test(sample)) return 'ko';

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

              // Prevention of common false positives: Validate script consistency
              if (lang === 'ko' && !/[가-힯]/.test(sample)) return null;
              if (lang === 'ja' && !/[぀-ゟ゠-ヿ一-鿿]/.test(sample)) return null;
              if (lang === 'zh' && !isChineseScriptText(sample)) return null;

              // FA/AR validation: Only reject if detected as FA/AR but text has no Arabic script characters
              if ((lang === 'fa' || lang === 'ar') && !isTextArabic) {
                logger.debug(`[LanguageDetectionService] Rejected FA/AR: text is not Arabic script (lang=${lang})`);
                return null;
              }

              // Script consistency check: If text has Arabic script but detected as non-Arabic language, reject
              if (isTextArabic && !isResultArabic) return null;

              // Validation 3: Dynamic Trust Filter for Short Strings
              // For short strings, the browser API often makes mistakes or detects obscure languages (like 'ca' for 'articles').
              // We only trust these detections if they are 'reliable' AND in a trusted set, or if they are in the user's context.
              if (textLength < 25) {
                const uiLang = browser.i18n.getUILanguage().split('-')[0].toLowerCase();
                const targetLang = preferences.targetLanguage ? getCanonicalCode(preferences.targetLanguage) : null;

                const isInUserContext = uiLang === lang || targetLang === lang;
                const isGloballyTrusted = GLOBAL_TRUSTED_SET.has(lang);

                // For short strings, we apply extreme skepticism to obscure languages.
                // An obscure language (not in GLOBAL_TRUSTED_SET) MUST be in the User Context to be accepted.
                // A globally trusted language (like English) is accepted if it's high confidence or reliable.
                let isTrustworthy = false;

                if (isGloballyTrusted) {
                  // If it's a major language (EN, FA, FR, etc.), trust it if it's reliable or high confidence
                  isTrustworthy = result.isReliable || top.percentage > 85;
                } else {
                  // If it's an obscure language (like Catalan 'ca'), ONLY trust it if it's in user's active context (UI or Target)
                  isTrustworthy = isInUserContext && (result.isReliable || top.percentage > 85);
                }

                if (!isTrustworthy) {
                  logger.debug(`[LanguageDetectionService] Statistical guess '${lang}' rejected for short string (not globally trusted and not in user context).`);
                  return null;
                }
              }

              // Validation 4: Final SSOT Check
              // Ensure the language is actually known to the extension constants.
              if (!LANGUAGE_CODE_TO_NAME_MAP[lang]) {
                logger.debug(`[LanguageDetectionService] Unrecognized language code '${lang}' rejected.`);
                return null;
              }

              logger.debug(`[LanguageDetectionService] Statistical detection accepted: ${lang}`);
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
        if (arabic) {
          logger.debug(`[LanguageDetectionService] Heuristic detected Arabic script: ${arabic}`);
          return arabic;
        }

        const chinese = detectChineseScriptLanguage(sample, preferences, { useDefaults: true });
        if (chinese) {
          logger.debug(`[LanguageDetectionService] Heuristic detected Chinese script: ${chinese}`);
          return chinese;
        }

        const devanagari = detectDevanagariScriptLanguage(sample, preferences, { useDefaults: true });
        if (devanagari) {
          logger.debug(`[LanguageDetectionService] Heuristic detected Devanagari script: ${devanagari}`);
          return devanagari;
        }

        // Latin Script family (e.g. "articles" follow user preference)
        if (isLatinScriptText(sample)) {
          const latin = detectLatinScriptLanguage(sample, preferences, { useDefaults: true });
          if (latin) {
            logger.debug(`[LanguageDetectionService] Heuristic detected Latin script: ${latin}`);
            return latin;
          }
        }

        logger.debug(`[LanguageDetectionService] Heuristic layer - no detection found`);
        return null;
      };

      // --- DYNAMIC FLOW EXECUTION ---
      if (isLongText) {
        // Long text: Statistical -> Deterministic -> Heuristic
        const statistical = await getStatisticalResult();
        if (statistical) {
          return statistical;
        }

        const deterministic = getDeterministicResult();
        if (deterministic) {
          return deterministic;
        }
      } else {
        // Short text: Deterministic -> (User Priority for Latin) -> Statistical -> Heuristic
        const deterministic = getDeterministicResult();
        if (deterministic) {
          return deterministic;
        }

        // Special handling for Latin Script Priority:
        // If it's Latin and the user has a specific priority (NOT 'none'), apply it BEFORE statistical detection.
        // This solves the issue where Polish or Catalan is detected for short English strings.
        if (isLatinScriptText(sample)) {
          const userLatinPriority = preferences['latin-script'];
          if (userLatinPriority && LATIN_SCRIPT_PRIORITY_LANGUAGES.includes(userLatinPriority)) {
            logger.debug(`[LanguageDetectionService] Applying User Latin Priority: ${userLatinPriority}`);
            return userLatinPriority;
          }
        }

        const statistical = await getStatisticalResult();
        if (statistical) {
          return statistical;
        }
      }

      // Final fallback
      const heuristic = getHeuristicResult();
      if (heuristic) {
        return heuristic;
      }

      return null;
    } catch (error) {
      logger.error(`[LanguageDetectionService] Error in detection flow:`, error);
      return null;
    }
  }
}
