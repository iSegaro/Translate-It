/**
 * TTS Language Service - Manages language support and engine capabilities
 */
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { SUPPORTED_TTS_LANGUAGES } from '@/features/tts/constants/googleTTS.js';
import { TTS_ENGINES } from '@/shared/config/constants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'TTSLanguageService');

// Edge TTS native voices mapping (High-quality Neural voices)
const EDGE_TTS_VOICES = {
  // Middle East & Central Asia
  'fa': 'fa-IR-DilaraNeural', 
  'ar': 'ar-SA-HamedNeural',
  'he': 'he-IL-HilaNeural',
  'tr': 'tr-TR-EmelNeural',
  'uz': 'uz-UZ-MadinaNeural',

  // Europe (West & Central)
  'en': 'en-US-AriaNeural',
  'de': 'de-DE-KatjaNeural',
  'fr': 'fr-FR-DeniseNeural',
  'es': 'es-ES-ElviraNeural',
  'it': 'it-IT-ElsaNeural',
  'nl': 'nl-NL-ColetteNeural',
  'pt': 'pt-BR-FranciscaNeural',

  // Europe (North)
  'sv': 'sv-SE-SofieNeural',
  'da': 'da-DK-ChristelNeural',
  'no': 'nb-NO-PernilleNeural',
  'fi': 'fi-FI-NooraNeural',

  // Europe (East)
  'ru': 'ru-RU-SvetlanaNeural',
  'uk': 'uk-UA-PolinaNeural',
  'pl': 'pl-PL-AgnieszkaNeural',
  'ro': 'ro-RO-AlinaNeural',
  'hu': 'hu-HU-NoemiNeural',
  'cs': 'cs-CZ-VlastaNeural',
  'sk': 'sk-SK-ViktoriaNeural',
  'el': 'el-GR-AthinaNeural',

  // Asia (East)
  'ja': 'ja-JP-NanamiNeural',
  'ko': 'ko-KR-SunHiNeural',
  'zh': 'zh-CN-XiaoxiaoNeural',

  // Asia (South & Southeast)
  'hi': 'hi-IN-SwaraNeural',
  'bn': 'bn-IN-TanishaNeural',
  'ta': 'ta-IN-PallaviNeural',
  'te': 'te-IN-ShrutiNeural',
  'th': 'th-TH-PremwadeeNeural',
  'vi': 'vi-VN-HoaiMyNeural',
  'id': 'id-ID-GadisNeural',
  'ms': 'ms-MY-LatreeNeural'
};

export class TTSLanguageService {
  /**
   * Check if an engine supports a specific language
   * @param {string} engine - 'google' or 'edge'
   * @param {string} language - language code (e.g., 'fa')
   * @returns {boolean}
   */
  static supportsLanguage(engine, language) {
    if (!language) return false;
    const baseLang = language.split('-')[0].toLowerCase();

    if (engine === TTS_ENGINES.GOOGLE) {
      return SUPPORTED_TTS_LANGUAGES.has(baseLang) || SUPPORTED_TTS_LANGUAGES.has(language.toLowerCase());
    }
    
    if (engine === TTS_ENGINES.EDGE) {
      // Edge supports a vast range, we check our mapped high-quality voices first, 
      // but generally assume it supports standard ISO codes.
      return true; 
    }

    return false;
  }

  /**
   * Determine the best engine to use based on support and settings
   * @param {string} language - The requested language code
   * @param {string} preferredEngine - User's preferred engine
   * @param {boolean} fallbackEnabled - Whether switching engines is allowed
   * @returns {Object} { engine, language }
   */
  static resolveTTSSettings(language, preferredEngine = TTS_ENGINES.GOOGLE, fallbackEnabled = true) {
    // If the preferred engine supports the language, use it. No questions asked.
    if (TTSLanguageService.supportsLanguage(preferredEngine, language)) {
      return { engine: preferredEngine, language };
    }

    // If preferred doesn't support, but fallback is enabled, try the other engine
    if (fallbackEnabled) {
      const otherEngine = preferredEngine === TTS_ENGINES.GOOGLE ? TTS_ENGINES.EDGE : TTS_ENGINES.GOOGLE;
      if (TTSLanguageService.supportsLanguage(otherEngine, language)) {
        logger.debug(`[TTSLanguageService] Switching engine to ${otherEngine} for language ${language} (fallback enabled)`);
        return { engine: otherEngine, language };
      }
    }

    // No support found or fallback disabled
    return { engine: preferredEngine, language };
  }

  /**
   * Gets the specific Edge TTS voice for a language
   */
  static getEdgeVoiceForLanguage(language) {
    const baseLanguage = language.split('-')[0].toLowerCase();
    return EDGE_TTS_VOICES[baseLanguage] || null;
  }
}
