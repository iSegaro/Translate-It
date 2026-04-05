import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { TTSLanguageService } from '@/features/tts/services/TTSLanguageService.js';
import { handleGoogleTTSSpeak } from '@/features/tts/handlers/handleGoogleTTS.js';
import { handleEdgeTTSSpeak } from '@/features/tts/handlers/handleEdgeTTS.js';

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'TTSDispatcher');

export class TTSDispatcher {
  static async dispatchTTSRequest(message, sender) {
    try {
      const { text, language } = message.data || {};
      
      // Get user settings (defaults if not found)
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      const settings = await browserAPI.storage.local.get(['TTS_ENGINE', 'TTS_FALLBACK_ENABLED']);
      const preferredEngine = settings.TTS_ENGINE || 'google';
      const fallbackEnabled = settings.TTS_FALLBACK_ENABLED !== false; // Default true

      // Resolve language and engine
      const resolution = TTSLanguageService.resolveTTSSettings(language || 'en', preferredEngine, fallbackEnabled);
      
      logger.info(`[TTSDispatcher] Routing TTS request to engine: ${resolution.engine}, language: ${resolution.language}`);

      // Modify message data with resolved language
      const dispatchedMessage = {
        ...message,
        data: {
          ...message.data,
          language: resolution.language
        }
      };

      if (resolution.engine === 'edge') {
        return await handleEdgeTTSSpeak(dispatchedMessage, sender);
      } else {
        return await handleGoogleTTSSpeak(dispatchedMessage, sender);
      }
    } catch (error) {
      logger.error('[TTSDispatcher] Failed to dispatch TTS request:', error);
      return {
        success: false,
        error: error.message || 'TTS Dispatcher failed'
      };
    }
  }
}
