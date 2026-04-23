/**
 * TTS Language Service - Manages language support, engine capabilities, and phonetic mappings.
 * This service acts as the routing logic layer between detected languages and available TTS voices.
 */
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { TTS_ENGINES } from '@/shared/config/constants.js';
import { PROVIDER_CONFIGS } from '@/features/tts/constants/ttsProviders.js';
import { ttsVoiceService } from '@/features/tts/services/TTSVoiceService.js';

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'TTSLanguageService');

/**
 * Centralized mapping for languages that lack native TTS support in specific engines.
 * These are redirected to the nearest compatible language or a global bridge (like English).
 * 
 * @constant {Object.<string, string>}
 */
const TTS_MAPPINGS = {
  'lzh': 'zh-tw', // Classical Chinese -> Traditional Chinese (for pronunciation)
  'yue': 'zh-hk', // Cantonese -> Hong Kong (for Edge TTS compatibility)
  'ps': 'ps',     // Pashto (Directly supported by Edge)
  'ur': 'ur',     // Urdu (Directly supported by Edge)
  'gd': 'en',     // Scottish Gaelic (Latin script) -> English fallback
  'ace': 'en',    // Acehnese (Latin script) -> English fallback
  
  // NOTE: Non-Latin scripts like Armenian (hy) or Georgian (ka) should NOT be 
  // mapped to 'en' here because Edge returns empty audio when trying 
  // to read non-Latin characters with an English voice.
};

/**
 * Service class for handling TTS language resolution and compatibility.
 */
export class TTSLanguageService {
  /**
   * Check if a specific engine supports a language by having a dedicated voice or valid config.
   * 
   * @param {string} engine - The TTS engine (e.g., 'google', 'edge')
   * @param {string} language - ISO language code (e.g., 'fa', 'en-US')
   * @returns {boolean} True if the engine can process the language
   */
  static supportsLanguage(engine, language) {
    if (!language) return false;
    
    const baseLang = language.split('-')[0].toLowerCase();
    const config = PROVIDER_CONFIGS[engine];

    if (!config) return false;

    // Google relies on a predefined set of supported ISO codes
    if (engine === TTS_ENGINES.GOOGLE) {
      return config.supportedLanguages.has(baseLang) || config.supportedLanguages.has(language.toLowerCase());
    }
    
    // Edge relies on having a specific voice name mapped to the language
    if (engine === TTS_ENGINES.EDGE) {
      const voices = config.voices;
      return !!(voices[language.toLowerCase()] || voices[baseLang]);
    }

    return false;
  }

  /**
   * Maps a language code to the nearest supported one for a specific engine.
   * Handles variants and fallbacks for languages that lack native support.
   * 
   * @param {string} engine - The target TTS engine
   * @param {string} language - The detected language code
   * @returns {string} The canonical or mapped language code supported by the engine
   */
  static getSupportedLanguageCode(engine, language) {
    if (!language) return 'en';
    
    const lang = language.toLowerCase().split('-')[0];
    const mapped = TTS_MAPPINGS[lang];

    // If a mapping exists and the engine supports that mapping, use it.
    // This allows languages like 'gd' to be treated as 'en' if supported.
    if (mapped && TTSLanguageService.supportsLanguage(engine, mapped)) {
      return mapped;
    }

    return language;
  }

  /**
   * Determine the best engine and language code to use based on support and settings.
   * 
   * @param {string} language - The detected or requested language
   * @param {string} preferredEngine - The user's preferred TTS engine
   * @param {boolean} fallbackEnabled - Whether to switch engines if the preferred one fails
   * @returns {Object} { engine: string, language: string }
   */
  static resolveTTSSettings(language, preferredEngine = TTS_ENGINES.GOOGLE, fallbackEnabled = true) {
    // 1. First, attempt to normalize the language for the preferred engine
    const normalizedLang = TTSLanguageService.getSupportedLanguageCode(preferredEngine, language);

    if (TTSLanguageService.supportsLanguage(preferredEngine, normalizedLang)) {
      return { engine: preferredEngine, language: normalizedLang };
    }

    // 2. If preferred engine fails and fallback is enabled, try the alternative engine
    if (fallbackEnabled) {
      const otherEngine = preferredEngine === TTS_ENGINES.GOOGLE ? TTS_ENGINES.EDGE : TTS_ENGINES.GOOGLE;
      const otherNormalized = TTSLanguageService.getSupportedLanguageCode(otherEngine, language);

      if (TTSLanguageService.supportsLanguage(otherEngine, otherNormalized)) {
        logger.debug(`[TTSLanguageService] Switching engine to ${otherEngine} for language ${otherNormalized}`);
        return { engine: otherEngine, language: otherNormalized };
      }
    }

    // Final fallback to preferred engine defaults
    return { engine: preferredEngine, language: normalizedLang };
  }

  /**
   * Resolves the specific voice identifier for Microsoft Edge TTS.
   * Attempts dynamic resolution via live voice list, falling back to static config.
   * 
   * @param {string} language - ISO language code
   * @returns {Promise<string|null>} The voice name (e.g., 'en-US-AriaNeural') or null
   */
  static async getEdgeVoiceForLanguage(language) {
    if (!language) return null;
    const lowerLang = language.toLowerCase();

    // 1. Attempt dynamic resolution (live list from server)
    try {
      const dynamicVoice = await ttsVoiceService.getBestVoice(lowerLang);
      if (dynamicVoice) return dynamicVoice;
    } catch {
      logger.debug('[TTSLanguageService] Dynamic voice resolution failed, using static fallback');
    }

    // 2. Static fallback from PROVIDER_CONFIGS
    const voices = PROVIDER_CONFIGS[TTS_ENGINES.EDGE].voices;
    
    // Check for exact match (e.g., 'zh-hk') then base language (e.g., 'zh')
    const baseLanguage = lowerLang.split('-')[0];
    return voices[lowerLang] || voices[baseLanguage] || null;
  }
}
