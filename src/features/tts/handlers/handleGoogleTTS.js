// Background Google TTS handler
// Optimized for new modular architecture and centralized PROVIDER_CONFIGS

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { initializebrowserAPI } from '@/features/tts/core/useBrowserAPI.js';
import { isChromium } from '@/core/browserHandlers.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { ttsStateManager } from '@/features/tts/services/TTSStateManager.js';
import { TTS_ENGINES } from '@/shared/config/constants.js';
import { PROVIDER_CONFIGS } from '@/features/tts/constants/ttsProviders.js';

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'GoogleTTSHandler');

/**
 * Internal helper to generate Google TTS URL from central config
 */
const buildGoogleTTSUrl = (text, language) => {
  const config = PROVIDER_CONFIGS[TTS_ENGINES.GOOGLE];
  const url = new URL(config.baseUrl);
  url.searchParams.append('ie', config.encoding);
  url.searchParams.append('q', text);
  url.searchParams.append('tl', language);
  url.searchParams.append('client', config.clientParam);
  return url.toString();
};

/**
 * Handle Google TTS requests
 */
export const handleGoogleTTSSpeak = async (message, sender, overrideLanguage = null) => {
  const config = PROVIDER_CONFIGS[TTS_ENGINES.GOOGLE];
  
  try {
    const { text, language: originalLanguage } = message.data || {};
    const language = overrideLanguage || originalLanguage;
    
    // 1. Deduplication
    if (ttsStateManager.currentTTSRequest && 
        text === ttsStateManager.lastTTSText && 
        language === ttsStateManager.lastTTSLanguage) {
      return await ttsStateManager.currentTTSRequest;
    }
    
    // 2. Interrupt previous
    if (ttsStateManager.currentTTSRequest) {
      await ttsStateManager.notifyTTSEnded('interrupted');
      try { await ttsStateManager.currentTTSRequest; } catch { /* ignore */ }
    }
    
    if (!text || !text.trim()) {
      throw new Error('No valid text provided for Google TTS');
    }
    
    // 3. Validate language support via central config
    const targetLanguage = language || config.defaultLanguage;
    const isSupported = config.supportedLanguages.has(targetLanguage.split('-')[0].toLowerCase()) || 
                        config.supportedLanguages.has(targetLanguage.toLowerCase());

    const ttsId = message.data?.ttsId || overrideLanguage?.ttsId || null;

    if (!isSupported) {
      logger.warn(`[GoogleTTS] Unsupported language: ${targetLanguage}`);
      return {
        success: false,
        error: `Language '${targetLanguage}' is not supported by Google TTS`,
        errorType: 'ERRORS_NOT_SUPPORTED',
        unsupportedLanguage: true
      };
    }
    
    // 4. Text cleaning using central regex
    let finalText = text.trim()
      .replace(/\*\*(.*?)\*\*/g, '$1') // remove markdown bold
      .replace(/\s+/g, ' ')
      .replace(config.cleaningRegex, '')
      .trim();
    
    if (finalText.length > config.maxTextLength) {
      finalText = finalText.substring(0, config.maxTextLength - 3) + '...';
    }
    
    const ttsUrl = buildGoogleTTSUrl(finalText, targetLanguage);
    
    // 5. Set Shared State
    ttsStateManager.lastTTSText = text;
    ttsStateManager.lastTTSLanguage = targetLanguage;
    ttsStateManager.currentTTSId = ttsId;
    ttsStateManager.currentTTSSender = sender;
    
    ttsStateManager.currentTTSRequest = (async () => {
      try {
        const isChromiumBrowser = isChromium();
        const browserAPI = await initializebrowserAPI();

        if (isChromiumBrowser) {
          await ttsStateManager.ensureOffscreenDocument();
          
          const response = await browserAPI.runtime.sendMessage({
            action: MessageActions.PLAY_OFFSCREEN_AUDIO,
            url: ttsUrl,
            target: 'offscreen'
          });

          if (response && response.success === false) {
            throw new Error(response.error || 'Offscreen playback failed');
          }
        } else {
          // Play directly in Firefox using the unified state manager
          await ttsStateManager.playFirefoxAudio(ttsUrl);
        }
        
        return { success: true, processedVia: 'google-tts' };
      } finally {
        ttsStateManager.resetSpeakState();
      }
    })();
    
    return await ttsStateManager.currentTTSRequest;
    
  } catch (error) {
    logger.warn('[GoogleTTS] Request failed:', error);
    ttsStateManager.fullReset();
    
    const isUnsupported = error.message?.includes('400') || error.message?.includes('supported source');
    
    return { 
      success: false, 
      error: error.message,
      unsupportedLanguage: isUnsupported
    };
  }
};

/**
 * Handle TTS Stop request
 */
export const handleGoogleTTSStopAll = async (message) => {
  try {
    const { ttsId } = message.data || {};
    const isSpecificStop = ttsId && ttsId !== 'all';
    
    if (isSpecificStop && ttsStateManager.currentTTSId !== ttsId) {
      return { success: true, skipped: true };
    }
    
    await ttsStateManager.notifyTTSEnded('stopped');
    ttsStateManager.fullReset();
    
    if (isChromium()) {
      await ttsStateManager.stopAudioOnly();
    } else {
      // Direct call to state manager for Firefox cleanup
      ttsStateManager.stopFirefoxAudio();
    }
    
    return { success: true, action: 'stopped' };
  } catch (error) {
    logger.warn('[GoogleTTS] Stop failed:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Handle TTS End notification from Offscreen
 */
export const handleGoogleTTSEnded = async () => {
  try {
    await ttsStateManager.notifyTTSEnded('completed');
    return { success: true, action: 'cleared' };
  } catch (error) {
    logger.warn('[GoogleTTS] End handling failed:', error);
    return { success: false, error: error.message };
  }
};
