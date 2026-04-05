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

      // Normalize input language and check if it's any form of "auto"
      const incomingLang = (language || '').toLowerCase().trim();
      const isExplicitAuto = incomingLang === AUTO_DETECT_VALUE || 
                             incomingLang === 'auto' || 
                             incomingLang === 'unknown' || 
                             !incomingLang;

      let targetLanguage = language;

      // 2. Initial Smart Detection (Proactive - Before any attempt)
      // If user requested auto OR if global smart detection is enabled, try to be smart from the start
      if (isExplicitAuto || globalAutoDetectEnabled) {
        logger.debug(`[TTSDispatcher] Proactive detection triggered (ExplicitAuto: ${isExplicitAuto})`);
        const detected = await TTSDispatcher._detectLanguage(text);
        
        if (detected) {
          logger.debug(`[TTSDispatcher] Language detected BEFORE attempt: ${detected}`);
          targetLanguage = detected;
        } else if (isExplicitAuto) {
          targetLanguage = 'en'; // Safe default for auto if detection fails completely
        }
      }

      // 3. Resolve engine and mapping
      let resolution = TTSLanguageService.resolveTTSSettings(targetLanguage, preferredEngine, fallbackEnabled);
      logger.info(`[TTSDispatcher] Final Routing: engine=${resolution.engine}, lang=${resolution.language}`);

      // 4. First Attempt
      let response;
      if (resolution.engine === 'edge') {
        response = await handleEdgeTTSSpeak(message, sender, resolution.language);
        
        // 5. Smart Recovery (Reactive - If first attempt still failed)
        const shouldAttemptRecovery = !response.success && 
                                    response.error?.includes('empty audio data') && 
                                    (isExplicitAuto || globalAutoDetectEnabled);

        if (shouldAttemptRecovery) {
          logger.info('[TTSDispatcher] Edge failed (empty audio). Attempting reactive re-detection...');
          const redetected = await TTSDispatcher._detectLanguage(text);
          
          if (redetected && redetected !== resolution.language) {
            logger.info(`[TTSDispatcher] Reactive recovery: Found correct language (${redetected}). Retrying...`);
            const retryRes = TTSLanguageService.resolveTTSSettings(redetected, preferredEngine, fallbackEnabled);
            response = await (retryRes.engine === 'edge' ? handleEdgeTTSSpeak : handleGoogleTTSSpeak)(message, sender, retryRes.language);
          } else {
            logger.info('[TTSDispatcher] Reactive recovery: Switching to Google TTS as safety fallback.');
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
   * Comprehensive language detection strategy
   * @private
   */
  static async _detectLanguage(text) {
    if (!text || !text.trim()) return null;
    
    const sample = text.trim();

    // 1. High-Precision Regex (Arabic/Persian Script)
    if (isPersianText(sample)) {
      return 'fa';
    }
    
    // Check general Arabic script (if not specifically Persian)
    if (/[\u0600-\u06FF]/.test(sample)) {
      return 'ar';
    }

    // 2. Native Browser API
    try {
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      const result = await browserAPI.i18n.detectLanguage(sample);
      if (result && result.languages && result.languages.length > 0) {
        const top = result.languages[0];
        // For short text, even 15% confidence from browser is better than guessing
        if (result.isReliable || top.percentage > 15) {
          return top.language.split('-')[0].toLowerCase();
        }
      }
    } catch (e) {
      logger.debug('[TTSDispatcher] Native detection skipped');
    }
    
    // 3. Script Heuristics
    if (/[\u4e00-\u9fff]/.test(sample)) return 'zh';
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(sample)) return 'ja';
    if (/[\uac00-\ud7af]/.test(sample)) return 'ko';
    
    return null;
  }
}
