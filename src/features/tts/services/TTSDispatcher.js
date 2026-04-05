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
      
      // 1. Get user settings
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      const settings = await browserAPI.storage.local.get([
        'TTS_ENGINE', 
        'TTS_FALLBACK_ENABLED',
        'TTS_AUTO_DETECT_ENABLED'
      ]);
      
      const preferredEngine = settings.TTS_ENGINE || 'google';
      const fallbackEnabled = settings.TTS_FALLBACK_ENABLED !== false;
      const globalAutoDetectEnabled = settings.TTS_AUTO_DETECT_ENABLED !== false;

      // Check if user specifically requested detection in Sidepanel/UI
      const incomingLang = (language || '').toLowerCase().trim();
      const isExplicitAuto = incomingLang === AUTO_DETECT_VALUE || 
                             incomingLang === 'auto' || 
                             incomingLang === 'unknown' || 
                             !incomingLang;

      let targetLanguage = language;

      // 2. Proactive Language Detection
      // Priority: Explicit UI 'auto' choice ALWAYS triggers detection, regardless of Options settings.
      // Otherwise, follow globalAutoDetectEnabled for background/automatic contexts.
      if (isExplicitAuto || globalAutoDetectEnabled) {
        const detected = await TTSDispatcher._detectLanguage(text);
        
        if (detected) {
          // If explicit auto was requested, or if we detected a mismatch and are allowed to be smart
          if (isExplicitAuto || (globalAutoDetectEnabled && targetLanguage !== detected)) {
            logger.debug(`[TTSDispatcher] Language identification: ${targetLanguage} -> ${detected}`);
            targetLanguage = detected;
          }
        } else if (isExplicitAuto) {
          targetLanguage = 'en'; // Safe bet for explicit auto if detection yields nothing
        }
      }

      // 3. Resolve engine and mapping
      let resolution = TTSLanguageService.resolveTTSSettings(targetLanguage, preferredEngine, fallbackEnabled);
      logger.info(`[TTSDispatcher] Routing request: engine=${resolution.engine}, lang=${resolution.language}`);

      // 4. First Attempt
      let response;
      if (resolution.engine === 'edge') {
        response = await handleEdgeTTSSpeak(message, sender, resolution.language);
        
        // 5. Reactive Recovery (Fallback between providers/languages)
        // Triggered ONLY IF fallback is enabled in options
        if (!response.success && fallbackEnabled && response.error?.includes('empty audio data')) {
          logger.info('[TTSDispatcher] Edge failed. Fallback is ENABLED, attempting recovery...');
          
          const redetected = await TTSDispatcher._detectLanguage(text);
          
          if (redetected && redetected !== resolution.language) {
            logger.info(`[TTSDispatcher] Recovery: Re-detected language as ${redetected}. Retrying...`);
            const retryRes = TTSLanguageService.resolveTTSSettings(redetected, preferredEngine, fallbackEnabled);
            response = await (retryRes.engine === 'edge' ? handleEdgeTTSSpeak : handleGoogleTTSSpeak)(message, sender, retryRes.language);
          } else {
            // Final safety: switch to Google if everything else fails and fallback is allowed
            logger.info('[TTSDispatcher] Recovery: Switching to Google TTS as final safety.');
            response = await handleGoogleTTSSpeak(message, sender, resolution.language);
          }
        }
      } else {
        response = await handleGoogleTTSSpeak(message, sender, resolution.language);
      }

      return response;
    } catch (error) {
      logger.error('[TTSDispatcher] Dispatch failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * High-Precision Language Detection with Script Validation
   */
  static async _detectLanguage(text) {
    if (!text || !text.trim()) return null;
    
    const sample = text.trim();

    // Strategy 1: Arabic/Persian Script Check (Direct Regex)
    if (/[\u0600-\u06FF]/.test(sample)) {
      const persianExclusive = /[\u067E\u0686\u0698\u06AF\u06CC\u06A9]/;
      const arabicExclusive = /[\u0629\u064A\u0643\u064B-\u065F]/;

      if (persianExclusive.test(sample)) return 'fa';
      if (arabicExclusive.test(sample)) return 'ar';
      if (isPersianText(sample)) return 'fa';
      return 'ar';
    }

    // Strategy 2: East Asian Script Analysis
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(sample)) return 'ja';
    if (/[\uAC00-\uD7AF]/.test(sample)) return 'ko';
    if (/[\u4E00-\u9FFF]/.test(sample)) return 'zh';

    // Strategy 3: Specific Latin Diacritics (Instant markers for short strings)
    if (/[ß]/.test(sample)) return 'de'; // German unique
    if (/[ñ]/.test(sample)) return 'es'; // Spanish unique
    if (/[ç]/.test(sample)) {
      if (/[ığşİ]/i.test(sample)) return 'tr'; // Turkish markers
      return 'fr'; // Fallback to French for ç
    }
    if (/[åøæ]/.test(sample)) return 'no'; // Nordic languages

    // Strategy 4: Native Browser API with validation
    try {
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      const result = await browserAPI.i18n.detectLanguage(sample);
      if (result && result.languages && result.languages.length > 0) {
        const top = result.languages[0];
        if (result.isReliable || top.percentage > 15) {
          const lang = top.language.split('-')[0].toLowerCase();
          
          // Script validation to avoid false positives for short strings
          if (lang === 'ko' && !/[\uAC00-\uD7AF]/.test(sample)) return 'en';
          if (lang === 'ja' && !/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(sample)) return 'en';
          if (lang === 'zh' && !/[\u4E00-\u9FFF]/.test(sample)) return 'en';
          
          return lang;
        }
      }
    } catch (e) {
      // ignore native errors
    }
    
    if (/[а-яё]/i.test(sample)) return 'ru';
    
    return null;
  }
}
