import { LanguageDetectionService } from "@/shared/services/LanguageDetectionService.js";
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { getBilingualTranslationEnabledAsync, getBilingualTranslationModesAsync } from "@/shared/config/config.js";
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
      const isModeEnabled = mode ? (bilingualModes[mode] !== false) : true;

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
