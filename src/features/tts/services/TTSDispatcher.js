import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { TTSLanguageService } from '@/features/tts/services/TTSLanguageService.js';
import { areLanguagesSimilar } from '@/shared/utils/language/languageUtils.js';
import { ARABIC_SCRIPT_LANGUAGES, CHINESE_SCRIPT_LANGUAGES, DEVANAGARI_SCRIPT_LANGUAGES } from '@/shared/utils/text/textAnalysis.js';
import { AUTO_DETECT_VALUE } from '@/shared/constants/core.js';
import { TTS_ENGINES } from '@/shared/constants/tts.js';
import { ttsCircuitBreaker } from '@/features/tts/services/TTSCircuitBreaker.js';
import { LanguageDetectionService } from '@/shared/services/LanguageDetectionService.js';
import storageCore from '@/shared/storage/core/StorageCore.js';
import { ttsQueueManager } from '@/features/tts/services/TTSQueueManager.js';

import { ttsStateManager } from '@/features/tts/services/TTSStateManager.js';

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'TTSDispatcher');

export class TTSDispatcher {
  static async dispatchTTSRequest(message, sender) {
    try {
      const { text, language, ttsId } = message.data || {};
      
      // Update state manager with the current ID so it knows what to notify
      ttsStateManager.currentTTSId = ttsId;

      // 1. Get user settings using StorageCore
      const settings = await storageCore.get({
        'TTS_ENGINE': TTS_ENGINES.GOOGLE,
        'TTS_FALLBACK_ENABLED': true,
        'TTS_AUTO_DETECT_ENABLED': true,
        'TTS_PREFERRED_VOICES': {}
      });

      const preferredEngine = settings.TTS_ENGINE || TTS_ENGINES.GOOGLE;
      const fallbackEnabled = settings.TTS_FALLBACK_ENABLED !== false;
      const globalAutoDetectEnabled = settings.TTS_AUTO_DETECT_ENABLED !== false;
      const preferredVoices = message.data?.preferredVoices || settings.TTS_PREFERRED_VOICES || {};

      const incomingLang = (language || '').toLowerCase().trim();
      const isExplicitAuto = incomingLang === AUTO_DETECT_VALUE || 
                             incomingLang === 'auto' || 
                             incomingLang === 'unknown' || 
                             !incomingLang;

      let targetLanguage = language;

      // 2. Proactive Language Detection (Context-aware)
      // Only perform proactive detection if:
      // a) Language is explicitly 'auto'
      // b) OR 'Smart Detection' is enabled and we DON'T have a valid language yet
      const shouldDetect = isExplicitAuto || (globalAutoDetectEnabled && !targetLanguage);

      if (shouldDetect) {
        const detected = await LanguageDetectionService.detect(text);

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

            const isTargetDevanagariScript = DEVANAGARI_SCRIPT_LANGUAGES.includes(targetLanguage);
            const isDetectedDevanagariScript = DEVANAGARI_SCRIPT_LANGUAGES.includes(detected);
            
            const isScriptMismatch = (isTargetArabicScript !== isDetectedArabicScript) || 
                                     (isTargetChineseScript !== isDetectedChineseScript) ||
                                     (isTargetDevanagariScript !== isDetectedDevanagariScript);
            
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
      let resolution = TTSLanguageService.resolveTTSSettings(targetLanguage, preferredEngine, fallbackEnabled, preferredVoices);
      
      // Check if the resolved engine is actually allowed (not blocked)
      const isEngineAllowed = await ttsCircuitBreaker.isAllowed(resolution.engine);
      
      if (!isEngineAllowed && fallbackEnabled) {
        const otherEngine = resolution.engine === TTS_ENGINES.GOOGLE ? TTS_ENGINES.EDGE : TTS_ENGINES.GOOGLE;
        logger.info(`[TTSDispatcher] Engine ${resolution.engine} is BLOCKED. Trying fallback to ${otherEngine}.`);
        
        if (await ttsCircuitBreaker.isAllowed(otherEngine)) {
          resolution.engine = otherEngine;
        } else {
          // Both engines blocked!
          const errorInfo = { error: 'Circuit Breaker Open', errorType: 'ERRORS_CIRCUIT_BREAKER_OPEN' };
          await ttsStateManager.notifyTTSEnded('error', errorInfo);
          return { success: false, ...errorInfo };
        }
      } else if (!isEngineAllowed) {
        // Primary engine blocked and fallback is disabled
        const errorInfo = { error: 'Circuit Breaker Open', errorType: 'ERRORS_CIRCUIT_BREAKER_OPEN' };
        await ttsStateManager.notifyTTSEnded('error', errorInfo);
        return { success: false, ...errorInfo };
      }

      // Notify UI immediately about the detected language for tooltip updates
      // Only broadcast if we actually performed a detection (was auto)
      if (isExplicitAuto && targetLanguage !== 'auto') {
        ttsStateManager.lastTTSLanguage = targetLanguage;
        ttsStateManager.broadcastStatus('playing', { 
          action: 'TTS_LANG_DETECTED', 
          detectedSourceLanguage: targetLanguage 
        });
      }

      // 3. Resolve BEST ENGINE with Circuit Breaker awareness
      resolution = TTSLanguageService.resolveTTSSettings(targetLanguage, preferredEngine, fallbackEnabled, preferredVoices);
      
      // Update state manager with the resolved language for accurate broadcasting
      ttsStateManager.lastTTSLanguage = resolution.language;

      // CRITICAL: Start playback via QueueManager to support chunking for large texts
      return await ttsQueueManager.start(text, resolution.language, resolution.engine, message, sender);
    } catch (error) {
      logger.error('[TTSDispatcher] Dispatch critical failure:', error);
      await ttsStateManager.notifyTTSEnded('error', { error: error.message });
      return { success: false, error: error.message };
    }
  }
}
