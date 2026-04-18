/**
 * TTS Language Service - Manages language support and engine capabilities
 */
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { TTS_ENGINES } from '@/shared/config/constants.js';
import { PROVIDER_CONFIGS } from '@/features/tts/constants/ttsProviders.js';
import { ttsVoiceService } from '@/features/tts/services/TTSVoiceService.js';

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'TTSLanguageService');

export class TTSLanguageService {
  /**
   * Check if an engine supports a specific language
   */
  static supportsLanguage(engine, language) {
    if (!language) return false;
    const baseLang = language.split('-')[0].toLowerCase();
    const config = PROVIDER_CONFIGS[engine];

    if (!config) return false;

    if (engine === TTS_ENGINES.GOOGLE) {
      return config.supportedLanguages.has(baseLang) || config.supportedLanguages.has(language.toLowerCase());
    }
    
    if (engine === TTS_ENGINES.EDGE) {
      // Edge supports almost all standard ISO codes
      return true; 
    }

    return false;
  }

  /**
   * Maps a language code to the nearest supported one for a specific engine.
   * Helps with variants like lzh (Classical Chinese) which aren't natively supported.
   */
  static getSupportedLanguageCode(engine, language) {
    if (!language) return 'en';
    const lang = language.toLowerCase().split('-')[0];

    // Mapping for Near Languages that lack native TTS support
    const ttsMappings = {
      'lzh': 'zh-tw', // Classical Chinese -> Traditional Chinese (for pronunciation)
      'ps': 'ps',     // Pashto (Edge supports it)
      'ur': 'ur'      // Urdu (Edge supports it)
    };

    const mapped = ttsMappings[lang];

    // If we have a mapping and the engine supports it, use it
    if (mapped && TTSLanguageService.supportsLanguage(engine, mapped)) {
      return mapped;
    }

    return language;
  }

  /**
   * Determine the best engine to use based on support and settings
   */
  static resolveTTSSettings(language, preferredEngine = TTS_ENGINES.GOOGLE, fallbackEnabled = true) {
    // First, normalize the language code for TTS compatibility
    const normalizedLang = TTSLanguageService.getSupportedLanguageCode(preferredEngine, language);

    if (TTSLanguageService.supportsLanguage(preferredEngine, normalizedLang)) {
      return { engine: preferredEngine, language: normalizedLang };
    }

    if (fallbackEnabled) {
      const otherEngine = preferredEngine === TTS_ENGINES.GOOGLE ? TTS_ENGINES.EDGE : TTS_ENGINES.GOOGLE;
      // Also normalize for the other engine
      const otherNormalized = TTSLanguageService.getSupportedLanguageCode(otherEngine, language);

      if (TTSLanguageService.supportsLanguage(otherEngine, otherNormalized)) {
        logger.debug(`[TTSLanguageService] Switching engine to ${otherEngine} for language ${otherNormalized}`);
        return { engine: otherEngine, language: otherNormalized };
      }
    }

    return { engine: preferredEngine, language: normalizedLang };
  }


  /**
   * Gets the specific Edge TTS voice for a language
   * Now attempts dynamic resolution with static fallback.
   */
  static async getEdgeVoiceForLanguage(language) {
    // 1. Try dynamic service (live list)
    try {
      const dynamicVoice = await ttsVoiceService.getBestVoice(language);
      if (dynamicVoice) return dynamicVoice;
    } catch (e) {
      logger.debug('Dynamic voice resolution failed, using static fallback');
    }

    // 2. Static fallback from config
    const baseLanguage = language.split('-')[0].toLowerCase();
    return PROVIDER_CONFIGS[TTS_ENGINES.EDGE].voices[baseLanguage] || null;
  }
}
