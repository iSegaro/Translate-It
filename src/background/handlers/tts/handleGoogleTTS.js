// Background Google TTS handler for content scripts
// Avoids CSP issues by running Google TTS in background context

import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
import { initializebrowserAPI } from '@/composables/useBrowserAPI.js';
import { isChromium } from '@/utils/core/browserHandlers.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'GoogleTTSHandler');

// Use a global promise to ensure offscreen document is created only once.
let offscreenDocumentPromise = null;

/**
 * Handle Google TTS requests from content scripts
 * @param {Object} request - Request object
 * @returns {Promise<Object>} Response
 */
export const handleGoogleTTSSpeak = async (request) => {
  try {
    logger.debug('[GoogleTTSHandler] 🎤 Processing Google TTS request:', request);
    
    const { text, language } = request.data || {};
    
    if (!text || !text.trim()) {
      logger.error('[GoogleTTSHandler] ❌ No text provided for Google TTS');
      throw new Error('No text provided for Google TTS');
    }
    
    logger.debug('[GoogleTTSHandler] 📝 Text to speak:', text.substring(0, 100) + (text.length > 100 ? '...' : ''));
    logger.debug('[GoogleTTSHandler] 🌍 Language:', language || 'auto-detect');
    
    // Create Google TTS URL
    const ttsUrl = `https://translate.google.com/translate_tts?client=tw-ob&q=${encodeURIComponent(text.trim())}&tl=${language || 'en'}`;
    logger.debug('[GoogleTTSHandler] 🔗 TTS URL created:', ttsUrl);
    
    // Chrome: delegate to offscreen document
    // Firefox: play directly in background
    logger.debug('[GoogleTTSHandler] 🚀 Starting browser-specific TTS playback...');
    await playGoogleTTSWithBrowserDetection(ttsUrl);
    
    logger.debug('[GoogleTTSHandler] ✅ Google TTS completed successfully');
    return { success: true, processedVia: 'background-google-tts' };
    
  } catch (error) {
    logger.error('[GoogleTTSHandler] ❌ Google TTS failed:', error);
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
  const isChromiumBrowser = isChromium();
  
  logger.debug('[GoogleTTSHandler] 🔍 Browser detection:', { isChromium: isChromiumBrowser, userAgent: navigator.userAgent });
  
  if (isChromiumBrowser) {
    logger.debug('[GoogleTTSHandler] 🟢 Using Chromium offscreen document method');
    // Chromium-based browsers: use offscreen document
    return await playWithOffscreenDocument(ttsUrl);
  } else {
    logger.debug('[GoogleTTSHandler] 🟠 Using Firefox direct audio method');
    // Firefox: play directly (Audio API available in background context)
    return await playGoogleTTSAudio(ttsUrl);
  }
};

/**
 * Play via offscreen document (Chromium-based browsers)
 * @param {string} ttsUrl - Google TTS URL
 * @returns {Promise}
 */
const playWithOffscreenDocument = async (ttsUrl) => {
  const OFFSCREEN_DOCUMENT_PATH = 'html/offscreen.html';

  // This function sends the message and handles the response, including timeouts.
  const sendMessageAndGetResponse = (browserAPI) => {
    return new Promise((resolve, reject) => {
      const responseTimeout = setTimeout(() => {
        logger.warn('[GoogleTTSHandler] Offscreen response timeout - but audio might have started playing');
        setTimeout(() => {
          logger.error('[GoogleTTSHandler] Final timeout - assuming failure');
          reject(new Error('Offscreen TTS response timeout'));
        }, 2000);
      }, 5000);

      browserAPI.runtime.sendMessage({
        action: 'playOffscreenAudio',
        url: ttsUrl,
        target: 'offscreen'
      }).then((response) => {
        clearTimeout(responseTimeout);
        logger.debug('[GoogleTTSHandler] Offscreen response received:', response);
        
        if (response === undefined || response === null || (typeof response === 'object' && Object.keys(response).length === 0)) {
          logger.info('[GoogleTTSHandler] Using MV3 workaround for empty response');
          setTimeout(() => {
            logger.debug('[GoogleTTSHandler] MV3 workaround completed successfully');
            resolve({ success: true, workaround: 'mv3-timing-fix' });
          }, 100);
          return;
        }
        
        if (response?.success) {
          resolve();
        } else {
          logger.error('[GoogleTTSHandler] Offscreen failed with response:', response);
          reject(new Error(response?.error || 'Offscreen TTS failed'));
        }
      }).catch((err) => {
        clearTimeout(responseTimeout);
        logger.error('[GoogleTTSHandler] Runtime sendMessage failed:', err);
        reject(err);
      });
    });
  };

  // This function ensures that the offscreen document is created only once.
  const setupOffscreenDocument = async (browserAPI) => {
    try {
      logger.debug('[GoogleTTSHandler] Starting setupOffscreenDocument...');
      
      // Check if offscreen API is available
      if (!browserAPI.offscreen) {
        logger.error('[GoogleTTSHandler] Offscreen API not available!');
        throw new Error('Offscreen API not available');
      }
      
      logger.debug('[GoogleTTSHandler] Offscreen API available, checking hasDocument...');
      const hasDocument = await browserAPI.offscreen.hasDocument();
      logger.debug('[GoogleTTSHandler] Checking if offscreen document exists:', hasDocument);
      
      if (hasDocument) {
          logger.debug('[GoogleTTSHandler] Offscreen document already exists.');
          return;
      }

      logger.debug('[GoogleTTSHandler] No offscreen document found. Creating new one...');
      await browserAPI.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Play Google TTS audio'
      });
      logger.debug('[GoogleTTSHandler] Offscreen document created successfully.');
    } catch (error) {
      logger.error('[GoogleTTSHandler] Error in setupOffscreenDocument:', error);
      throw error;
    }
  };

  try {
    const browserAPI = await initializebrowserAPI();
    
    logger.debug('[GoogleTTSHandler] Initializing offscreen document setup...');
    
    // Check if we have an existing promise but offscreen document doesn't actually exist
    if (offscreenDocumentPromise) {
      try {
        const hasDocument = await browserAPI.offscreen.hasDocument();
        logger.debug('[GoogleTTSHandler] Checking existing promise - hasDocument:', hasDocument);
        
        if (!hasDocument) {
          logger.debug('[GoogleTTSHandler] Existing promise but no offscreen document - resetting promise...');
          offscreenDocumentPromise = null;
        }
      } catch (error) {
        logger.warn('[GoogleTTSHandler] Error checking existing offscreen document - resetting promise:', error);
        offscreenDocumentPromise = null;
      }
    }
    
    // Use the promise to ensure setup is only called once.
    if (!offscreenDocumentPromise) {
      logger.debug('[GoogleTTSHandler] Creating new offscreen document promise...');
      offscreenDocumentPromise = setupOffscreenDocument(browserAPI);
    } else {
      logger.debug('[GoogleTTSHandler] Using existing offscreen document promise...');
    }
    
    logger.debug('[GoogleTTSHandler] Waiting for offscreen document setup...');
    await offscreenDocumentPromise;
    logger.debug('[GoogleTTSHandler] Offscreen document setup completed.');

    logger.debug('[GoogleTTSHandler] Sending to offscreen:', ttsUrl);
    return await sendMessageAndGetResponse(browserAPI);

  } catch (error) {
    logger.error('[GoogleTTSHandler] Offscreen document error:', error);
    // Reset the promise on error so we can try again.
    offscreenDocumentPromise = null;
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