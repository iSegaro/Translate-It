import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { EdgeTTSClient } from '@/features/tts/services/EdgeTTSClient.js';
import { TTSLanguageService } from '@/features/tts/services/TTSLanguageService.js';
import { isChromium } from '@/core/browserHandlers.js';
import { initializebrowserAPI } from '@/features/tts/core/useBrowserAPI.js';
import { ttsStateManager } from '@/features/tts/services/TTSStateManager.js';

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'EdgeTTSHandler');

export const handleEdgeTTSSpeak = async (message, sender, overrideLanguage = null) => {
  try {
    const { text, language: originalLanguage } = message.data || {};
    const language = overrideLanguage || originalLanguage;
    
    // Deduplication
    if (ttsStateManager.currentTTSRequest && 
        text === ttsStateManager.lastTTSText && 
        language === ttsStateManager.lastTTSLanguage) {
      return await ttsStateManager.currentTTSRequest;
    }

    // Interrupt previous
    if (ttsStateManager.currentTTSRequest) {
      await ttsStateManager.notifyTTSEnded('interrupted');
      try { await ttsStateManager.currentTTSRequest; } catch { /* ignore */ }
    }

    if (!text || !text.trim()) {
      throw new Error('No valid text provided for Edge TTS');
    }

    // Set state
    ttsStateManager.lastTTSText = text;
    ttsStateManager.lastTTSLanguage = language;
    ttsStateManager.currentTTSSender = sender;
    ttsStateManager.currentTTSId = message.data?.ttsId || overrideLanguage?.ttsId || null;

    const voiceName = await TTSLanguageService.getEdgeVoiceForLanguage(language) || 
                      await TTSLanguageService.getEdgeVoiceForLanguage('en') || 
                      undefined;
    
    ttsStateManager.currentTTSRequest = (async () => {
      try {
        const audioBlob = await EdgeTTSClient.synthesize(text, voiceName);
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioData = Array.from(new Uint8Array(arrayBuffer));
        
        const isChromiumBrowser = isChromium();
        const browserAPI = await initializebrowserAPI();

        if (isChromiumBrowser) {
          // Ensure Offscreen is ready via shared manager
          await ttsStateManager.ensureOffscreenDocument();

          // Play via offscreen document
          const response = await browserAPI.runtime.sendMessage({
            action: 'playCachedAudio',
            audioData: audioData,
            target: 'offscreen'
          });

          if (response && response.success === false) {
            throw new Error(response.error || 'Offscreen cached playback failed');
          }
        } else {
          // Play directly in Firefox using the unified state manager
          await ttsStateManager.playFirefoxAudio(audioBlob);
        }
        
        return { success: true, processedVia: 'edge-tts' };
      } finally {
        ttsStateManager.resetSpeakState();
      }
    })();
    
    return await ttsStateManager.currentTTSRequest;
  } catch (error) {
    logger.warn('Edge TTS failed:', error);
    ttsStateManager.fullReset();
    return {
      success: false,
      error: error.message || 'Background Edge TTS failed',
      errorType: error.errorType
    };
  }
};

/**
 * Handle TTS Stop request for Edge TTS
 */
export const handleEdgeTTSStopAll = async (message) => {
  try {
    const { ttsId } = message.data || {};
    const isSpecificStop = ttsId && ttsId !== 'all';
    
    if (isSpecificStop && ttsStateManager.currentTTSId !== ttsId) {
      return { success: true, skipped: true };
    }
    
    // notifyTTSEnded will check sender internal state
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
    logger.warn('[EdgeTTS] Stop failed:', error);
    return { success: false, error: error.message };
  }
};

