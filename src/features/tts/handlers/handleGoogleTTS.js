// Background Google TTS handler
// Optimized for new modular architecture and StateManager

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { initializebrowserAPI } from '@/features/tts/core/useBrowserAPI.js';
import { isChromium } from '@/core/browserHandlers.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { ttsStateManager } from '@/features/tts/services/TTSStateManager.js';
import { 
  SUPPORTED_TTS_LANGUAGES, 
  TTS_CLEANING_REGEX, 
  MAX_TTS_TEXT_LENGTH, 
  DEFAULT_TTS_LANGUAGE,
  getGoogleTTSUrl
} from '@/features/tts/constants/googleTTS.js';

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'GoogleTTSHandler');

/**
 * Validate if language is supported by Google TTS
 */
const isLanguageSupported = (language) => {
  if (!language) return false;
  const cleanLang = language.toLowerCase().replace('_', '-');
  return SUPPORTED_TTS_LANGUAGES.has(cleanLang) || SUPPORTED_TTS_LANGUAGES.has(cleanLang.split('-')[0]);
};

/**
 * Handle Google TTS requests
 */
export const handleGoogleTTSSpeak = async (message, sender, overrideLanguage = null) => {
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
      try { await ttsStateManager.currentTTSRequest; } catch (e) {}
    }
    
    if (!text || !text.trim()) {
      throw new Error('No valid text provided for Google TTS');
    }
    
    // 3. Validate language support
    const targetLanguage = language || DEFAULT_TTS_LANGUAGE;
    if (!isLanguageSupported(targetLanguage)) {
      logger.warn(`[GoogleTTS] Unsupported language: ${targetLanguage}`);
      return {
        success: false,
        error: `Language '${targetLanguage}' is not supported by Google TTS`,
        unsupportedLanguage: true
      };
    }
    
    const trimmedText = text.trim();
    let finalText = trimmedText;

    // Smart Extraction & Cleaning
    const lines = finalText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length > 1 && (finalText.includes('**') || lines[0].includes(':'))) {
      finalText = lines[0];
      if (finalText.toLowerCase().includes('translation:') && lines.length > 1) {
        finalText = lines[1];
      }
    }
    
    finalText = finalText
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\s+/g, ' ')
      .replace(TTS_CLEANING_REGEX, '')
      .trim();
    
    if (finalText.length > MAX_TTS_TEXT_LENGTH) {
      finalText = finalText.substring(0, MAX_TTS_TEXT_LENGTH - 3) + '...';
    }
    
    const ttsUrl = getGoogleTTSUrl(finalText, targetLanguage);
    
    // 4. Set Shared State
    ttsStateManager.lastTTSText = text;
    ttsStateManager.lastTTSLanguage = targetLanguage;
    ttsStateManager.currentTTSId = message.data?.ttsId || null;
    ttsStateManager.currentTTSSender = sender;
    
    ttsStateManager.currentTTSRequest = (async () => {
      try {
        const isChromiumBrowser = isChromium();
        const browserAPI = await initializebrowserAPI();

        if (isChromiumBrowser) {
          // Ensure Offscreen is ready via shared manager
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
          await playGoogleTTSAudio(ttsUrl);
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
    return { success: false, error: error.message };
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
      await stopGoogleTTSAudio();
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

// Firefox-specific direct audio helpers
let currentFirefoxAudio = null;

const playGoogleTTSAudio = (ttsUrl) => {
  return new Promise((resolve, reject) => {
    try {
      if (currentFirefoxAudio) {
        currentFirefoxAudio.pause();
        currentFirefoxAudio.src = '';
        currentFirefoxAudio = null;
      }
      
      const audio = new Audio(ttsUrl);
      currentFirefoxAudio = audio;
      
      audio.onended = () => {
        currentFirefoxAudio = null;
        ttsStateManager.notifyTTSEnded('completed');
        resolve();
      };
      
      audio.onerror = (error) => {
        currentFirefoxAudio = null;
        reject(new Error(`Firefox Google TTS failed: ${error.message}`));
      };
      
      audio.play().then(() => resolve()).catch(reject);
    } catch (error) {
      reject(error);
    }
  });
};

const stopGoogleTTSAudio = async () => {
  if (currentFirefoxAudio) {
    currentFirefoxAudio.pause();
    currentFirefoxAudio.src = '';
    currentFirefoxAudio = null;
  }
};
