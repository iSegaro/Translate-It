import { LanguageDetectionService } from "@/shared/services/LanguageDetectionService.js";
import { AUTO_DETECT_VALUE } from "@/shared/constants/core.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { getBilingualTranslationEnabledAsync, getBilingualTranslationModesAsync, TranslationMode } from "@/shared/config/config.js";
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
   * Get detected language for a text using centralized service
   */
  static async getDetectedLanguage(text) {
    return await LanguageDetectionService.detect(text);
  }

  static async applyLanguageSwapping(text, sourceLang, targetLang, originalSourceLang = 'English', options = {}) {
    const { providerName = 'LanguageSwapping', mode } = options;

    try {
      const bilingualEnabled = await getBilingualTranslationEnabledAsync();
      const bilingualModes = await getBilingualTranslationModesAsync();

      // CRITICAL FIX: Only enable bilingual if mode is explicitly set to true
      // getBilingualTranslationModesAsync already falls back to CONFIG defaults if not in storage
      const isModeEnabled = mode ? (bilingualModes[mode] === true) : true;

      // If bilingual is disabled for this mode/globally, skip detection and return original languages
      if (!bilingualEnabled || !isModeEnabled) {
        return [sourceLang, targetLang];
      }

      // Detection is only needed if bilingual is active
      const accurateDetectedLang = await this.getDetectedLanguage(text);

      if (accurateDetectedLang) {
        const detectedLangCode = getCanonicalCode(accurateDetectedLang);
        const targetNorm = this._normalizeLangValue(targetLang);
        const sourceNorm = this._normalizeLangValue(sourceLang);
        const targetLangCode = getCanonicalCode(targetNorm);

        // --- BILINGUAL & AUTO-SWAP LOGIC ---
        // BILINGUAL_TRANSLATION is the master switch.
        // Only swap when source is AUTO to respect user's explicit source choice.
        // CRITICAL FIX: Only swap when detected language MATCHES target (meaning text is ALREADY in target language)
        // This prevents incorrect swaps when translating mixed-language text
        const shouldSwap = bilingualEnabled && isModeEnabled && detectedLangCode === targetLangCode && sourceNorm === AUTO_DETECT_VALUE;

        // --- MANUAL SOURCE BILINGUAL ---
        // When user manually sets a source language that doesn't match the detected language and target,
        // we should swap to get the correct translation
        const sourceCode = getCanonicalCode(sourceNorm);
        const shouldSwapManual = bilingualEnabled && isModeEnabled && detectedLangCode === targetLangCode && sourceCode !== detectedLangCode && sourceCode === targetLangCode;

        // --- DICTIONARY MODE SPECIAL HANDLING ---
        // In dictionary mode, if detected language matches target language, we MUST swap to get dictionary data
        // Google Translate API doesn't return dictionary info when source and target are the same
        const isDictionaryMode = mode === TranslationMode.Dictionary_Translation;
        const shouldSwapForDictionary = isDictionaryMode && detectedLangCode === targetLangCode;

        if (shouldSwap || shouldSwapManual || shouldSwapForDictionary) {
           let newTargetLang;
           if (this._normalizeLangValue(originalSourceLang) !== AUTO_DETECT_VALUE) {
             newTargetLang = originalSourceLang;
           } else {
             // Fallback to English if original source was auto-detect
             newTargetLang = "en";
           }

           const swapReason = shouldSwapForDictionary ? 'Dictionary swap' : (shouldSwapManual ? 'Manual source swap' : 'Bilingual swap');
           logger.debug(`${providerName}: ${swapReason} applied for mode ${mode}. Detected ${detectedLangCode} matches target ${targetLangCode}. Swapping target to ${newTargetLang}`);
           return [targetNorm, newTargetLang];
        } else {
          // CRITICAL FIX: No language swapping needed - return original languages WITHOUT calling fallback
          // The fallback was causing incorrect swaps when detected != target
          logger.debug(`${providerName}: No swap needed (detected: ${detectedLangCode} != target: ${targetLangCode})`);
          return [sourceLang, targetLang];
        }
      } else {
        return [sourceLang, targetLang];
      }
    } catch (error) {
        logger.error(`${providerName}: Language detection failed:`, error);

        // CRITICAL FIX: On error, return original languages WITHOUT swapping
        return [sourceLang, targetLang];
      }
  }
}
