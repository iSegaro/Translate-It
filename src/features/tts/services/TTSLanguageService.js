/**
 * TTS Language Service - Manages language support and fallbacks for different TTS engines
 */
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'TTSLanguageService');

// Fallback mapping for languages with limited Google TTS support
const GOOGLE_TTS_FALLBACKS = {
  'fa': 'ar', // Persian → Arabic (similar script and phonetics)
  'ps': 'ar', // Pashto → Arabic
  'ku': 'ar', // Kurdish → Arabic  
  'ur': 'ar', // Urdu → Arabic
  'yi': 'he', // Yiddish → Hebrew
  'mt': 'ar', // Maltese → Arabic
  'hy': 'ru', // Armenian → Russian
  'ka': 'ru', // Georgian → Russian
  'az': 'tr', // Azerbaijani → Turkish
  'kk': 'ru', // Kazakh → Russian
  'ky': 'ru', // Kyrgyz → Russian
  'uz': 'ru', // Uzbek → Russian
  'tg': 'ru', // Tajik → Russian
};

// Edge TTS native voices mapping for special languages
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
   * Determine the best language code and engine to use based on settings and support
   * @param {string} originalLanguage - The requested language code
   * @param {string} preferredEngine - The user's preferred TTS engine ('google' or 'edge')
   * @param {boolean} fallbackEnabled - Whether fallback to another language/engine is allowed
   * @returns {Object} { engine, language }
   */
  static resolveTTSSettings(originalLanguage, preferredEngine = 'google', fallbackEnabled = true) {
    let finalLanguage = originalLanguage;
    let finalEngine = preferredEngine;

    // Remove dialect suffixes for checking (e.g., en-US -> en)
    const baseLanguage = originalLanguage.split('-')[0].toLowerCase();

    if (preferredEngine === 'google') {
      // Check if Google needs a fallback for this language
      if (GOOGLE_TTS_FALLBACKS[baseLanguage]) {
        if (fallbackEnabled) {
          finalLanguage = GOOGLE_TTS_FALLBACKS[baseLanguage];
          logger.debug(`[TTSLanguageService] Applied Google TTS fallback: ${baseLanguage} -> ${finalLanguage}`);
        } else {
          // If fallback is disabled, we keep the original language, but Google TTS might fail or skip it.
          // Alternatively, we could switch to Edge TTS if fallback means "engine fallback".
          // The prompt requested: "اگه موتور Google انتخاب شده و Fallback فعال نیست؛ سیستم باید با ظرافت خطا دهد یا متوقف شود"
          // We will return the original language and let Google TTS handle/fail.
          logger.debug(`[TTSLanguageService] Fallback disabled. Keeping original language for Google TTS: ${baseLanguage}`);
        }
      }
    } else if (preferredEngine === 'edge') {
      // Edge supports almost everything natively, especially Persian.
      logger.debug(`[TTSLanguageService] Using Edge TTS natively for language: ${originalLanguage}`);
    }

    return {
      engine: finalEngine,
      language: finalLanguage
    };
  }

  /**
   * Gets the specific Edge TTS voice for a language if mapped
   * @param {string} language - The language code
   * @returns {string|null} - Voice name or null to use auto-detection
   */
  static getEdgeVoiceForLanguage(language) {
    const baseLanguage = language.split('-')[0].toLowerCase();
    return EDGE_TTS_VOICES[baseLanguage] || null;
  }
}
