/**
 * TTS Language Service - Manages language support and engine capabilities
 */
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { SUPPORTED_TTS_LANGUAGES } from '@/features/tts/constants/googleTTS.js';

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'TTSLanguageService');

// Edge TTS native voices mapping (Standard high-quality voices)
const EDGE_TTS_VOICES = {
  'fa': 'fa-IR-DilaraNeural', 
  'en': 'en-US-AriaNeural',
  'ar': 'ar-SA-HamedNeural',
  'ru': 'ru-RU-SvetlanaNeural',
  'tr': 'tr-TR-EmelNeural',
  'de': 'de-DE-KatjaNeural',
  'fr': 'fr-FR-DeniseNeural',
  'ja': 'ja-JP-NanamiNeural',
  'ko': 'ko-KR-SunHiNeural',
  'zh': 'zh-CN-XiaoxiaoNeural'
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

    if (engine === 'google') {
      return SUPPORTED_TTS_LANGUAGES.has(baseLang) || SUPPORTED_TTS_LANGUAGES.has(language.toLowerCase());
    }
    
    if (engine === 'edge') {
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
  static resolveTTSSettings(language, preferredEngine = 'google', fallbackEnabled = true) {
    // If the preferred engine supports the language, use it. No questions asked.
    if (TTSLanguageService.supportsLanguage(preferredEngine, language)) {
      return { engine: preferredEngine, language };
    }

    // If preferred doesn't support, but fallback is enabled, try the other engine
    if (fallbackEnabled) {
      const otherEngine = preferredEngine === 'google' ? 'edge' : 'google';
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
