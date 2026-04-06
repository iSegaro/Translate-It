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
   * Determine the best engine to use based on support and settings
   */
  static resolveTTSSettings(language, preferredEngine = TTS_ENGINES.GOOGLE, fallbackEnabled = true) {
    if (TTSLanguageService.supportsLanguage(preferredEngine, language)) {
      return { engine: preferredEngine, language };
    }

    if (fallbackEnabled) {
      const otherEngine = preferredEngine === TTS_ENGINES.GOOGLE ? TTS_ENGINES.EDGE : TTS_ENGINES.GOOGLE;
      if (TTSLanguageService.supportsLanguage(otherEngine, language)) {
        logger.debug(`[TTSLanguageService] Switching engine to ${otherEngine} for language ${language}`);
        return { engine: otherEngine, language };
      }
    }

    return { engine: preferredEngine, language };
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
