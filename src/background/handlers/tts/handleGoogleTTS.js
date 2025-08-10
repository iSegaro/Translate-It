// Background Google TTS handler for content scripts
// Avoids CSP issues by running Google TTS in background context

import { createLogger } from '@/utils/core/logger.js';
import { initializebrowserAPI } from '@/composables/useBrowserAPI.js';

const logger = createLogger('Core', 'GoogleTTSHandler');

/**
 * Handle Google TTS requests from content scripts
 * @param {Object} request - Request object
 * @returns {Promise<Object>} Response
 */
export const handleGoogleTTSSpeak = async (request) => {
  try {
    logger.debug('[GoogleTTSHandler] Processing Google TTS request:', request);
    
    const { text, language } = request.data || {};
    
    if (!text || !text.trim()) {
      throw new Error('No text provided for Google TTS');
    }
    
    // Create Google TTS URL
    const ttsUrl = `https://translate.google.com/translate_tts?client=tw-ob&q=${encodeURIComponent(text.trim())}&tl=${language || 'en'}`;
    
    // Chrome: delegate to offscreen document
    // Firefox: play directly in background
    await playGoogleTTSWithBrowserDetection(ttsUrl);
    
    logger.debug('[GoogleTTSHandler] Google TTS completed successfully');
    return { success: true, processedVia: 'background-google-tts' };
    
  } catch (error) {
    logger.error('[GoogleTTSHandler] Google TTS failed:', error);
    return {
      success: false,
      error: error.message || 'Background Google TTS failed'
    };
  }
};

/**
 * Play Google TTS with browser-specific implementation
 * @param {string} ttsUrl - Google TTS URL
 * @returns {Promise}
 */
const playGoogleTTSWithBrowserDetection = async (ttsUrl) => {
  const isChrome = /chrome/i.test(navigator.userAgent || '') && !/edge/i.test(navigator.userAgent || '');
  
  if (isChrome) {
    // Chrome: use offscreen document
    return await playWithOffscreenDocument(ttsUrl);
  } else {
    // Firefox: play directly (Audio API available in background context)
    return await playGoogleTTSAudio(ttsUrl);
  }
};

/**
 * Play via offscreen document (Chrome)
 * @param {string} ttsUrl - Google TTS URL
 * @returns {Promise}
 */
const playWithOffscreenDocument = async (ttsUrl) => {
  try {
    const browserAPI = await initializebrowserAPI();
    
    // Ensure offscreen document exists
    const existingContexts = await browserAPI.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length === 0) {
      await browserAPI.offscreen.createDocument({
        url: '/html/offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Play Google TTS audio'
      });
      logger.debug('[GoogleTTSHandler] Created offscreen document for TTS');
    }

    // Send to offscreen
    return new Promise((resolve, reject) => {
      browserAPI.runtime.sendMessage({
        action: 'playOffscreenAudio',
        url: ttsUrl,
        target: 'offscreen'
      }).then((response) => {
        if (response?.success) {
          resolve();
        } else {
          reject(new Error(response?.error || 'Offscreen TTS failed'));
        }
      }).catch(reject);
    });
  } catch (error) {
    logger.error('[GoogleTTSHandler] Offscreen document error:', error);
    throw error;
  }
};

/**
 * Play Google TTS audio directly (Firefox background context)
 * @param {string} ttsUrl - Google TTS URL
 * @returns {Promise}
 */
const playGoogleTTSAudio = (ttsUrl) => {
  return new Promise((resolve, reject) => {
    try {
      const audio = new Audio(ttsUrl);
      
      // Add timeout
      const timeout = setTimeout(() => {
        audio.pause();
        audio.src = "";
        reject(new Error('Background Google TTS timeout'));
      }, 15000);
      
      audio.onended = () => {
        clearTimeout(timeout);
        logger.debug('[GoogleTTSHandler] Background Google TTS audio completed');
        resolve();
      };
      
      audio.onerror = (error) => {
        clearTimeout(timeout);
        logger.error('[GoogleTTSHandler] Background Google TTS audio error:', error);
        reject(new Error(`Background Google TTS failed: ${error.message}`));
      };
      
      audio.play().catch((playError) => {
        clearTimeout(timeout);
        reject(new Error(`Background Google TTS play failed: ${playError.message}`));
      });
      
      logger.debug('[GoogleTTSHandler] Background Google TTS audio started');
      
    } catch (error) {
      reject(error);
    }
  });
};