import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { TTSLanguageService } from '@/features/tts/services/TTSLanguageService.js';
import { handleGoogleTTSSpeak } from '@/features/tts/handlers/handleGoogleTTS.js';
import { handleEdgeTTSSpeak } from '@/features/tts/handlers/handleEdgeTTS.js';
import { detectTextLanguage, areLanguagesSimilar } from '@/shared/utils/language/languageUtils.js';
import { isPersianText, isArabicScriptText, detectArabicScriptLanguage, ARABIC_SCRIPT_LANGUAGES, isChineseScriptText, detectChineseScriptLanguage, CHINESE_SCRIPT_LANGUAGES } from '@/shared/utils/text/textAnalysis.js';
import { AUTO_DETECT_VALUE, TTS_ENGINES } from '@/shared/config/constants.js';
import { ttsCircuitBreaker } from '@/features/tts/services/TTSCircuitBreaker.js';
import { getLanguageDetectionPreferencesAsync } from '@/shared/config/config.js';
import storageCore from '@/shared/storage/core/StorageCore.js';

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'TTSDispatcher');

export class TTSDispatcher {
  static async dispatchTTSRequest(message, sender) {
    try {
      const { text, language } = message.data || {};

      // 1. Get user settings using StorageCore
      const settings = await storageCore.get({
        'TTS_ENGINE': TTS_ENGINES.GOOGLE,
        'TTS_FALLBACK_ENABLED': true,
        'TTS_AUTO_DETECT_ENABLED': true
      });

      const preferredEngine = settings.TTS_ENGINE || TTS_ENGINES.GOOGLE;
      const fallbackEnabled = settings.TTS_FALLBACK_ENABLED !== false;
      const globalAutoDetectEnabled = settings.TTS_AUTO_DETECT_ENABLED !== false;

      const incomingLang = (language || '').toLowerCase().trim();
      const isExplicitAuto = incomingLang === AUTO_DETECT_VALUE || 
                             incomingLang === 'auto' || 
                             incomingLang === 'unknown' || 
                             !incomingLang;

      let targetLanguage = language;

      // 2. Proactive Language Detection (Context-aware)
      if (isExplicitAuto || globalAutoDetectEnabled) {
        const preferences = await getLanguageDetectionPreferencesAsync();
        const detected = await TTSDispatcher._detectLanguage(text, preferences);
        
        if (detected) {
          // Rule 1: Always override if user explicitly asked for 'auto'
          if (isExplicitAuto) {
            logger.debug(`[TTSDispatcher] Detected language for auto: ${detected}`);
            targetLanguage = detected;
          } 
          // Rule 2: If global auto-detect is enabled but user chose a specific language
          // We only override if there's a "strong mismatch" (NOT similar languages)
          // AND the user hasn't explicitly chosen a language (priority to user)
          else if (globalAutoDetectEnabled && targetLanguage !== detected) {
            
            // SCRIPT VALIDATION (Clean Logic): 
            // Check if both target language and detected language use the same script family.
            const isTargetArabicScript = ARABIC_SCRIPT_LANGUAGES.includes(targetLanguage);
            const isDetectedArabicScript = ARABIC_SCRIPT_LANGUAGES.includes(detected);
            
            const isTargetChineseScript = CHINESE_SCRIPT_LANGUAGES.includes(targetLanguage);
            const isDetectedChineseScript = CHINESE_SCRIPT_LANGUAGES.includes(detected);
            
            const isScriptMismatch = (isTargetArabicScript !== isDetectedArabicScript) || 
                                     (isTargetChineseScript !== isDetectedChineseScript);
            
            // Only override if there is a fundamental script mismatch (e.g. user selected 'en' but text is Arabic)
            if (isScriptMismatch && !areLanguagesSimilar(targetLanguage, detected)) {
              logger.debug(`[TTSDispatcher] Strong script mismatch: Chosen=${targetLanguage}, Detected=${detected}. Overriding.`);
              targetLanguage = detected;
            } else {
              logger.debug(`[TTSDispatcher] Detected ${detected} is similar to or script-compatible with chosen ${targetLanguage}. Respecting user choice.`);
            }
          }
        } else if (isExplicitAuto) {
          targetLanguage = 'en'; 
        }
      }

      // 3. Resolve BEST ENGINE with Circuit Breaker awareness
      let resolution = TTSLanguageService.resolveTTSSettings(targetLanguage, preferredEngine, fallbackEnabled);
      
      // Check if the resolved engine is actually allowed (not blocked)
      const isEngineAllowed = await ttsCircuitBreaker.isAllowed(resolution.engine);
      
      if (!isEngineAllowed && fallbackEnabled) {
        const otherEngine = resolution.engine === TTS_ENGINES.GOOGLE ? TTS_ENGINES.EDGE : TTS_ENGINES.GOOGLE;
        logger.info(`[TTSDispatcher] Engine ${resolution.engine} is BLOCKED. Trying fallback to ${otherEngine}.`);
        
        if (await ttsCircuitBreaker.isAllowed(otherEngine)) {
          resolution.engine = otherEngine;
        } else {
          // Both engines blocked!
          return { success: false, error: 'Circuit Breaker Open', errorType: 'ERRORS_CIRCUIT_BREAKER_OPEN' };
        }
      } else if (!isEngineAllowed) {
        // Primary engine blocked and fallback is disabled
        return { success: false, error: 'Circuit Breaker Open', errorType: 'ERRORS_CIRCUIT_BREAKER_OPEN' };
      }

      logger.info(`[TTSDispatcher] Final dispatch: engine=${resolution.engine}, lang=${resolution.language}`);

      // 4. Execution Attempt
      let response;
      if (resolution.engine === TTS_ENGINES.EDGE) {
        response = await handleEdgeTTSSpeak(message, sender, resolution.language);
        
        // 5. Smart Recovery (If Edge returns empty audio)
        if (!response.success && fallbackEnabled && response.error?.includes('empty audio data')) {
          logger.info('[TTSDispatcher] Edge failed. Fallback is ENABLED, attempting recovery...');
          
          // Check if Google is at least allowed before trying recovery
          if (await ttsCircuitBreaker.isAllowed(TTS_ENGINES.GOOGLE)) {
            const preferences = await getLanguageDetectionPreferencesAsync();
            const redetected = await TTSDispatcher._detectLanguage(text, preferences);
            
            // Apply similar language logic here too
            const shouldSwitch = redetected && 
                                redetected !== resolution.language && 
                                !areLanguagesSimilar(resolution.language, redetected);

            if (shouldSwitch) {
              logger.debug(`[TTSDispatcher] Recovery: Switching from ${resolution.language} to ${redetected}`);
              const retryRes = TTSLanguageService.resolveTTSSettings(redetected, preferredEngine, fallbackEnabled);
              response = await (retryRes.engine === TTS_ENGINES.EDGE ? handleEdgeTTSSpeak : handleGoogleTTSSpeak)(message, sender, retryRes.language);
            } else {
              response = await handleGoogleTTSSpeak(message, sender, resolution.language);
            }
          }
        }
      } else if (resolution.engine === TTS_ENGINES.GOOGLE) {
        // Explicitly try Google if resolved
        response = await handleGoogleTTSSpeak(message, sender, resolution.language);
        
        // If Google fails (e.g. Unsupported language) AND fallback is allowed
        if (!response.success && fallbackEnabled && response.unsupportedLanguage) {
          // Check if Edge is allowed
          if (await ttsCircuitBreaker.isAllowed(TTS_ENGINES.EDGE)) {
            logger.info(`[TTSDispatcher] Google doesn't support ${resolution.language}. Falling back to ${TTS_ENGINES.EDGE}.`);
            response = await handleEdgeTTSSpeak(message, sender, resolution.language);
          }
        }
      } else {
        throw new Error(`Unsupported TTS engine: ${resolution.engine}`);
      }

      return response;
    } catch (error) {
      logger.error('[TTSDispatcher] Dispatch critical failure:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * High-Precision Language Detection with Script Validation
   * @param {string} text - Text to analyze
   * @param {Object} preferences - User language detection preferences
   * @returns {string|null} Detected language code or null
   */
  static async _detectLanguage(text, preferences = {}) {
    if (!text || !text.trim()) return null;

    const sample = text.trim();

    // 1. Arabic Script Analysis with user preferences
    const arabicScriptLanguage = detectArabicScriptLanguage(sample, preferences);
    if (arabicScriptLanguage) return arabicScriptLanguage;

    // 2. Chinese Script Analysis with user preferences
    const chineseScriptLanguage = detectChineseScriptLanguage(sample, preferences);
    if (chineseScriptLanguage) return chineseScriptLanguage;

    // 3. East Asian Script Analysis (Fallback for JA/KO)
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(sample)) return 'ja';
    if (/[\uAC00-\uD7AF]/.test(sample)) return 'ko';

    // 3: Specific Latin Diacritics (Instant markers for short strings)
    if (/[ß]/.test(sample)) return 'de'; // German unique
    if (/[ñ]/.test(sample)) return 'es'; // Spanish unique
    if (/[ç]/.test(sample)) {
      if (/[ığşİ]/i.test(sample)) return 'tr'; // Turkish markers
      return 'fr'; // Fallback to French for ç
    }
    if (/[åøæ]/.test(sample)) return 'no'; // Nordic languages


    // 4. Native Browser API with validation
    try {
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      const result = await browserAPI.i18n.detectLanguage(sample);
      if (result && result.languages && result.languages.length > 0) {
        const top = result.languages[0];
        if (result.isReliable || top.percentage > 15) {
          const lang = top.language.split('-')[0].toLowerCase();
          
          if (lang === 'ko' && !/[\uAC00-\uD7AF]/.test(sample)) return 'en';
          if (lang === 'ja' && !/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(sample)) return 'en';
          if (lang === 'zh' && !isChineseScriptText(sample)) return 'en';
          if ((lang === 'fa' || lang === 'ar') && !isArabicScriptText(sample)) return 'en';
          
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
