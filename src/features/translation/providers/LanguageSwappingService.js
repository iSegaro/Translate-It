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
    const { providerName = 'LanguageSwapping', mode, originalMode } = options;

    try {
      const bilingualEnabled = await getBilingualTranslationEnabledAsync();
      const bilingualModes = await getBilingualTranslationModesAsync();

      // Check the switch for the CURRENT mode and the ORIGINAL mode
      // If we're in Dictionary mode but came from MouseHover, we must respect the MouseHover switch
      const effectiveMode = originalMode || mode;
      
      // Determine if bilingual mode is enabled for this specific interaction
      let isModeEnabled = effectiveMode ? (bilingualModes[effectiveMode] === true) : true;
      
      // Backward compatibility: Handle legacy 'field' key if 'content' (TranslationMode.Field) is not found
      if (!isModeEnabled && effectiveMode === TranslationMode.Field && bilingualModes['field'] === true) {
        isModeEnabled = true;
      }

      const isDictionaryMode = mode === TranslationMode.Dictionary_Translation;

      // If bilingual is disabled AND it's not a dictionary-specific swap, skip detection
      if ((!bilingualEnabled || !isModeEnabled) && !isDictionaryMode) {
        return [sourceLang, targetLang];
      }

      // Detection is only needed if bilingual is active OR it's dictionary mode
      const accurateDetectedLang = await this.getDetectedLanguage(text);

      if (accurateDetectedLang) {
        const detectedLangCode = getCanonicalCode(accurateDetectedLang);
        const targetNorm = this._normalizeLangValue(targetLang);
        const targetLangCode = getCanonicalCode(targetNorm);

        // --- DICTIONARY MODE SPECIAL HANDLING ---
        // In dictionary mode, if detected language matches target language, we MUST swap to get dictionary data
        // Google Translate API doesn't return dictionary info when source and target are the same
        const shouldSwapForDictionary = isDictionaryMode && detectedLangCode === targetLangCode;

        // --- BILINGUAL & AUTO-SWAP LOGIC ---
        // BILINGUAL_TRANSLATION is the master switch.
        // We swap if detected language MATCHES target (meaning text is ALREADY in target language).
        // This applies both to 'auto' source and manually set source languages.
        const shouldSwap = bilingualEnabled && isModeEnabled && detectedLangCode === targetLangCode;

        if (shouldSwap || shouldSwapForDictionary) {
           let newTargetLang;
           const originalSourceNorm = this._normalizeLangValue(originalSourceLang);
           
           // If original source was not auto, and it's different from what we just detected, use it as new target
           if (originalSourceNorm !== AUTO_DETECT_VALUE && getCanonicalCode(originalSourceNorm) !== detectedLangCode) {
             newTargetLang = originalSourceNorm;
           } else {
             // Fallback to English if original source was auto-detect or same as detected
             // If detected is already English, fallback to Persian as a sensible default for this extension
             newTargetLang = (detectedLangCode === 'en') ? 'fa' : 'en';
           }

           const swapReason = shouldSwapForDictionary ? 'Dictionary swap' : 'Bilingual swap';
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
