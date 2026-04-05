import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { TTSLanguageService } from '@/features/tts/services/TTSLanguageService.js';
import { handleGoogleTTSSpeak } from '@/features/tts/handlers/handleGoogleTTS.js';
import { handleEdgeTTSSpeak } from '@/features/tts/handlers/handleEdgeTTS.js';
import { detectTextLanguage } from '@/shared/utils/language/languageUtils.js';
import { isPersianText } from '@/shared/utils/text/textAnalysis.js';
import { AUTO_DETECT_VALUE } from '@/shared/config/constants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'TTSDispatcher');

export class TTSDispatcher {
  static async dispatchTTSRequest(message, sender) {
    try {
      const { text, language } = message.data || {};
      
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      const settings = await browserAPI.storage.local.get([
        'TTS_ENGINE', 
        'TTS_FALLBACK_ENABLED',
        'TTS_AUTO_DETECT_ENABLED'
      ]);
      
      const preferredEngine = settings.TTS_ENGINE || 'google';
      const fallbackEnabled = settings.TTS_FALLBACK_ENABLED !== false;
      const globalAutoDetectEnabled = settings.TTS_AUTO_DETECT_ENABLED !== false;

      const incomingLang = (language || '').toLowerCase().trim();
      const isExplicitAuto = incomingLang === AUTO_DETECT_VALUE || 
                             incomingLang === 'auto' || 
                             incomingLang === 'unknown' || 
                             !incomingLang;

      let targetLanguage = language;

      if (isExplicitAuto || globalAutoDetectEnabled) {
        const detected = await TTSDispatcher._detectLanguage(text);
        if (detected) {
          logger.debug(`[TTSDispatcher] Proactive detection success: ${detected}`);
          targetLanguage = detected;
        } else if (isExplicitAuto) {
          targetLanguage = 'en'; 
        }
      }

      let resolution = TTSLanguageService.resolveTTSSettings(targetLanguage, preferredEngine, fallbackEnabled);
      logger.info(`[TTSDispatcher] Final Routing: engine=${resolution.engine}, lang=${resolution.language}`);

      let response;
      if (resolution.engine === 'edge') {
        response = await handleEdgeTTSSpeak(message, sender, resolution.language);
        
        const shouldAttemptRecovery = !response.success && 
                                    response.error?.includes('empty audio data') && 
                                    (isExplicitAuto || globalAutoDetectEnabled);

        if (shouldAttemptRecovery) {
          logger.info('[TTSDispatcher] Edge failed. Attempting smart recovery...');
          const redetected = await TTSDispatcher._detectLanguage(text);
          
          if (redetected && redetected !== resolution.language) {
            logger.info(`[TTSDispatcher] Recovery: Found correct language (${redetected}). Retrying...`);
            const retryRes = TTSLanguageService.resolveTTSSettings(redetected, preferredEngine, fallbackEnabled);
            response = await (retryRes.engine === 'edge' ? handleEdgeTTSSpeak : handleGoogleTTSSpeak)(message, sender, retryRes.language);
          } else {
            logger.info('[TTSDispatcher] Recovery: Switching to Google TTS as final safety.');
            response = await handleGoogleTTSSpeak(message, sender, resolution.language);
          }
        }
      } else {
        response = await handleGoogleTTSSpeak(message, sender, resolution.language);
      }

      return response;
    } catch (error) {
      logger.error('[TTSDispatcher] Dispatch critical failure:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * High-Precision Language Detection
   * Uses distinct character markers for various languages to achieve high accuracy 
   * even on very short strings.
   * @private
   */
  static async _detectLanguage(text) {
    if (!text || !text.trim()) return null;

    const sample = text.trim();

    // 1. Arabic Script Analysis (Persian vs Arabic Distinction)
    if (/[\u0600-\u06FF]/.test(sample)) {
      // PERSIAN Markers: Unique letters (پ چ ژ گ) and Persian-specific encodings for Y/K
      const persianExclusive = /[\u067E\u0686\u0698\u06AF\u06CC\u06A9]/;
      // ARABIC Markers: Teh Marbuta (ة), Arabic Y/K (ي ك), and common diacritics (Harakat)
      const arabicExclusive = /[\u0629\u064A\u0643\u064B-\u065F]/;

      if (persianExclusive.test(sample)) {
        logger.debug('[TTSDispatcher] Detection: Confirmed Persian via unique characters');
        return 'fa';
      }

      if (arabicExclusive.test(sample)) {
        logger.debug('[TTSDispatcher] Detection: Confirmed Arabic via unique characters');
        return 'ar';
      }

      // If ambiguous (like "سلام"), we let the Native API decide later
    }

    // 2. East Asian Script Analysis
    // Japanese Hiragana/Katakana (Unique to Japanese)
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(sample)) return 'ja';
    // Korean Hangul
    if (/[\uAC00-\uD7AF]/.test(sample)) return 'ko';
    // Chinese (if no Japanese chars found but has CJK Kanji)
    if (/[\u4E00-\u9FFF]/.test(sample)) return 'zh';

    // 3. European/Latin Diacritics (Specific markers)
    if (/[ß]/.test(sample)) return 'de'; // German
    if (/[ñ]/.test(sample)) return 'es'; // Spanish
    if (/[ç]/.test(sample)) {
      // ç is in many, but we can guess French or Turkish
      if (/[ığş]/i.test(sample)) return 'tr';
      return 'fr';
    }

    // 4. Native Browser API (Best for English and plain Latin scripts)
    try {
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      const result = await browserAPI.i18n.detectLanguage(sample);
      if (result && result.languages && result.languages.length > 0) {
        const top = result.languages[0];
        if (result.isReliable || top.percentage > 15) {
          const detectedLang = top.language.split('-')[0].toLowerCase();
          
          // Script Validation: Prevent obvious false positives for short strings
          // If CJK is detected, ensure the text actually contains CJK characters
          if (detectedLang === 'ko' && !/[\uAC00-\uD7AF]/.test(sample)) return 'en';
          if (detectedLang === 'ja' && !/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(sample)) return 'en';
          if (detectedLang === 'zh' && !/[\u4E00-\u9FFF]/.test(sample)) return 'en';
          
          logger.debug(`[TTSDispatcher] Browser API detected: ${detectedLang}`);
          return detectedLang;
        }
      }
    } catch (e) {
      // Ignore native error
    }
    
    // 5. Final Heuristic fallback for common scripts
    if (/[а-яё]/i.test(sample)) return 'ru'; // Cyrillic
    
    return null;
  }
}
