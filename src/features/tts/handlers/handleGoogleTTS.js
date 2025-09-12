// Background Google TTS handler for content scripts
// Avoids CSP issues by running Google TTS in background context

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { initializebrowserAPI } from '@/features/tts/core/useBrowserAPI.js';
import { isChromium } from '@/core/browserHandlers.js';

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'GoogleTTSHandler');

// Use a global promise to ensure offscreen document is created only once.
let offscreenDocumentPromise = null;

// Request deduplication to prevent duplicate TTS calls
let currentTTSRequest = null;
let lastTTSText = null;
let lastTTSLanguage = null;
let currentTTSId = null;

// Google TTS supported languages (major ones)
const SUPPORTED_TTS_LANGUAGES = new Set([
  'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'zh-cn', 'zh-tw',
  'ar', 'hi', 'tr', 'pl', 'nl', 'sv', 'da', 'no', 'fi', 'el', 'he', 'th',
  'vi', 'id', 'ms', 'tl', 'uk', 'cs', 'sk', 'hu', 'ro', 'bg', 'hr', 'sl',
  'et', 'lv', 'lt', 'mt', 'ga', 'cy', 'is', 'mk', 'sq', 'az', 'be', 'ka',
  'hy', 'ne', 'si', 'my', 'km', 'lo', 'gu', 'ta', 'te', 'kn', 'ml', 'pa',
  'bn', 'ur', 'fa', 'ps', 'sd', 'ckb', 'ku', 'am', 'om', 'so', 'sw', 'rw',
  'ny', 'mg', 'st', 'zu', 'xh', 'af', 'sq', 'eu', 'ca', 'co', 'eo', 'fy',
  'gl', 'haw', 'hmn', 'is', 'ig', 'jw', 'kk', 'ky', 'lb', 'mi', 'mn', 'sm',
  'gd', 'sn', 'su', 'tg', 'tt', 'to', 'uz', 'yi', 'yo'
]);

/**
 * Validate if language is supported by Google TTS
 * @param {string} language - Language code
 * @returns {boolean}
 */
const isLanguageSupported = (language) => {
  if (!language) return false;
  const cleanLang = language.toLowerCase().replace('_', '-');
  return SUPPORTED_TTS_LANGUAGES.has(cleanLang) || SUPPORTED_TTS_LANGUAGES.has(cleanLang.split('-')[0]);
};

/**
 * Handle Google TTS requests from content scripts
 * @param {Object} request - Request object
 * @returns {Promise<Object>} Response
 */
export const handleGoogleTTSSpeak = async (message, sender) => {
  try {
    logger.debug('[GoogleTTSHandler] 🎤 Processing Google TTS request:', message);
    
    const { text, language } = message.data || {};
    
    // Request deduplication - prevent duplicate requests with same text/language
    if (currentTTSRequest && text === lastTTSText && language === lastTTSLanguage) {
      logger.debug('[GoogleTTSHandler] 🚫 Duplicate request detected, using existing promise');
      return await currentTTSRequest;
    }
    
    // If there's a different request in progress, wait for it to complete first
    if (currentTTSRequest) {
      logger.debug('[GoogleTTSHandler] ⏳ Waiting for current TTS request to complete');
      try {
        await currentTTSRequest;
      } catch {
        logger.debug('[GoogleTTSHandler] Previous request failed, continuing with new one');
      }
    }
    
    if (!text || !text.trim() || text.trim().length === 0) {
      logger.error('[GoogleTTSHandler] ❌ No valid text provided for Google TTS');
      throw new Error('No valid text provided for Google TTS');
    }
    
    // Validate language support
    const targetLanguage = language || 'en';
    if (!isLanguageSupported(targetLanguage)) {
      logger.warn('[GoogleTTSHandler] ⚠️ Unsupported language for TTS:', targetLanguage);
      return {
        success: false,
        error: `Language '${targetLanguage}' is not supported by Google TTS`,
        unsupportedLanguage: true
      };
    }
    
    const trimmedText = text.trim();
    logger.debug('[GoogleTTSHandler] 📝 Text to speak:', trimmedText.substring(0, 100) + (trimmedText.length > 100 ? '...' : ''));
    logger.debug('[GoogleTTSHandler] 🌍 Language:', targetLanguage, '(validated)');
    
    // Create Google TTS URL with better parameters to avoid HTTP 400
    let finalText = trimmedText;
    
    // Clean text for TTS (remove markdown, extra whitespace, special chars)
    finalText = finalText
      // Remove markdown formatting
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove **bold**
      .replace(/\*(.*?)\*/g, '$1')     // Remove *italic*
      .replace(/__(.*?)__/g, '$1')     // Remove __underline__
      .replace(/_([^_]+)_/g, '$1')     // Remove _emphasis_
      // Remove definition patterns (noun:, verb:, adj:, etc.)
      .replace(/\*\*\w+:\*\*/g, '')    // Remove **noun:** etc.
      .replace(/\w+:/g, '')            // Remove noun:, verb:, etc.
      // Remove extra whitespace and newlines
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ')
      // Remove special characters that might cause issues (be more restrictive)
      .replace(/[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFFa-zA-Z0-9\s.,!?-]/g, '')
      .trim();
    
    if (finalText.length > 200) {
      // Truncate very long text to avoid 400 errors
      finalText = finalText.substring(0, 197) + '...';
    }
    
    if (finalText.length < 1) {
      logger.error('[GoogleTTSHandler] ❌ Text became empty after cleaning');
      throw new Error('Text became empty after cleaning');
    }
    
    logger.debug('[GoogleTTSHandler] 🧹 Cleaned text:', finalText.substring(0, 100) + (finalText.length > 100 ? '...' : ''));
    
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(finalText)}&tl=${targetLanguage}&client=tw-ob`;
    logger.debug('[GoogleTTSHandler] 🔗 TTS URL created:', ttsUrl.substring(0, 100) + '...');
    
    // Store current request info for deduplication
    lastTTSText = text;
    lastTTSLanguage = targetLanguage;
    currentTTSId = message.data?.ttsId || null;
    
    // Create and store the request promise
    currentTTSRequest = (async () => {
      try {
        // Chrome: delegate to offscreen document
        // Firefox: play directly in background
        logger.debug('[GoogleTTSHandler] 🚀 Starting browser-specific TTS playback...');
        await playGoogleTTSWithBrowserDetection(ttsUrl);
        
        logger.debug('[GoogleTTSHandler] ✅ Google TTS completed successfully');
        return { success: true, processedVia: 'background-google-tts' };
      } catch (error) {
        // Clear ID on error
        currentTTSId = null;
        throw error;
      } finally {
        // Clear current request when done, but keep currentTTSId until audio actually ends
        currentTTSRequest = null;
        lastTTSText = null;
        lastTTSLanguage = null;
      }
    })();
    
    return await currentTTSRequest;
    
  } catch (error) {
    logger.error('[GoogleTTSHandler] ❌ Google TTS failed:', error);
    
    // Clear request state on error
    currentTTSRequest = null;
    lastTTSText = null;
    lastTTSLanguage = null;
    currentTTSId = null;
    
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
        
        // Chrome MV3 has bugs with sendResponse - ignore empty responses
        // Audio will play and send GOOGLE_TTS_ENDED when complete
        if (response === undefined || response === null || (typeof response === 'object' && Object.keys(response).length === 0)) {
          logger.debug('[GoogleTTSHandler] Empty response from offscreen (Chrome MV3 issue) - assuming success');
          resolve(); // Assume success, audio will play
          return;
        }
        
        if (response?.success !== false) {
          // Only resolve if success is not explicitly false
          // This handles both { success: true } and successful completion messages
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
      // Stop any existing audio first
      if (currentFirefoxAudio) {
        currentFirefoxAudio.pause();
        currentFirefoxAudio.src = '';
      }
      
      const audio = new Audio(ttsUrl);
      currentFirefoxAudio = audio;
      
      // Add timeout
      const timeout = setTimeout(() => {
        audio.pause();
        audio.src = "";
        reject(new Error('Background Google TTS timeout'));
      }, 15000);
      
      audio.onended = () => {
        clearTimeout(timeout);
        currentFirefoxAudio = null; // Clear reference when ended
        currentTTSId = null; // Clear TTS ID when audio actually ends
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

/**
 * Handle Google TTS Stop All request
 * @param {Object} request - Request object
 * @returns {Promise<Object>} Response
 */
export const handleGoogleTTSStopAll = async (message, sender) => {
  try {
    const { ttsId } = message.data || {};
    const isSpecificStop = ttsId && ttsId !== 'all';
    
    logger.debug(`[GoogleTTSHandler] 🛑 Processing TTS Stop request - ${isSpecificStop ? `Specific: ${ttsId}` : 'All TTS'}`);
    logger.debug(`[GoogleTTSHandler] 📊 Current TTS state - currentTTSId: ${currentTTSId}, isSpecificStop: ${isSpecificStop}`);
    
    // Check if we should stop this TTS
    const shouldStop = !isSpecificStop || currentTTSId === ttsId;
    
    if (!shouldStop) {
      logger.debug(`[GoogleTTSHandler] ⏭️ Skipping stop - requested ttsId ${ttsId} doesn't match current ${currentTTSId}`);
      return { success: true, skipped: true, reason: 'No matching TTS instance' };
    }
    
    // Clear any pending requests to prevent stuck states
    currentTTSRequest = null;
    lastTTSText = null;
    lastTTSLanguage = null;
    if (!isSpecificStop) {
      currentTTSId = null; // Only clear ID if stopping all
    }
    
    const isChromiumBrowser = isChromium();
    
    if (isChromiumBrowser) {
      logger.debug('[GoogleTTSHandler] 🟢 Stopping TTS via offscreen document');
      await stopWithOffscreenDocument();
    } else {
      logger.debug('[GoogleTTSHandler] 🟠 Stopping TTS directly in Firefox');
      await stopGoogleTTSAudio();
    }
    
    logger.debug('[GoogleTTSHandler] ✅ Google TTS stopped successfully');
    return { success: true, action: 'stopped' };
    
  } catch (error) {
    logger.error('[GoogleTTSHandler] ❌ Google TTS stop failed:', error);
    return {
      success: false,
      error: error.message || 'Background Google TTS stop failed'
    };
  }
};

/**
 * Handle Google TTS Pause request
 * @param {Object} request - Request object
 * @returns {Promise<Object>} Response
 */
export const handleGoogleTTSPause = async (message, sender) => {
  try {
    logger.debug('[GoogleTTSHandler] ⏸️ Processing Google TTS Pause request');
    
    const isChromiumBrowser = isChromium();
    
    if (isChromiumBrowser) {
      logger.debug('[GoogleTTSHandler] 🟢 Pausing TTS via offscreen document');
      await pauseWithOffscreenDocument();
    } else {
      logger.debug('[GoogleTTSHandler] 🟠 Pausing TTS directly in Firefox');
      await pauseGoogleTTSAudio();
    }
    
    logger.debug('[GoogleTTSHandler] ✅ Google TTS paused successfully');
    return { success: true, action: 'paused' };
    
  } catch (error) {
    logger.error('[GoogleTTSHandler] ❌ Google TTS pause failed:', error);
    return {
      success: false,
      error: error.message || 'Background Google TTS pause failed'
    };
  }
};

/**
 * Handle Google TTS Resume request
 * @param {Object} request - Request object
 * @returns {Promise<Object>} Response
 */
export const handleGoogleTTSResume = async (message, sender) => {
  try {
    logger.debug('[GoogleTTSHandler] ▶️ Processing Google TTS Resume request');
    
    const isChromiumBrowser = isChromium();
    
    if (isChromiumBrowser) {
      logger.debug('[GoogleTTSHandler] 🟢 Resuming TTS via offscreen document');
      await resumeWithOffscreenDocument();
    } else {
      logger.debug('[GoogleTTSHandler] 🟠 Resuming TTS directly in Firefox');
      await resumeGoogleTTSAudio();
    }
    
    logger.debug('[GoogleTTSHandler] ✅ Google TTS resumed successfully');
    return { success: true, action: 'resumed' };
    
  } catch (error) {
    logger.error('[GoogleTTSHandler] ❌ Google TTS resume failed:', error);
    return {
      success: false,
      error: error.message || 'Background Google TTS resume failed'
    };
  }
};

/**
 * Handle Google TTS End notification
 * @param {Object} request - Request object
 * @returns {Promise<Object>} Response
 */
export const handleGoogleTTSEnded = async (message, sender) => {
  try {
    logger.debug('[GoogleTTSHandler] 🏁 Processing Google TTS End notification');
    
    // Clear the current TTS ID when audio ends
    currentTTSId = null;
    logger.debug('[GoogleTTSHandler] 🧹 Cleared currentTTSId on completion');
    
    return { success: true, action: 'cleared' };
  } catch (error) {
    logger.error('[GoogleTTSHandler] ❌ Google TTS end handling failed:', error);
    return {
      success: false,
      error: error.message || 'Background Google TTS end handling failed'
    };
  }
};

/**
 * Handle Google TTS Get Status request
 * @param {Object} request - Request object
 * @returns {Promise<Object>} Response
 */
export const handleGoogleTTSGetStatus = async (message, sender) => {
  try {
    logger.debug('[GoogleTTSHandler] 📊 Processing Google TTS Get Status request');
    
    const isChromiumBrowser = isChromium();
    
    let status = 'idle';
    
    if (isChromiumBrowser) {
      logger.debug('[GoogleTTSHandler] 🟢 Getting TTS status via offscreen document');
      status = await getStatusWithOffscreenDocument();
    } else {
      logger.debug('[GoogleTTSHandler] 🟠 Getting TTS status directly in Firefox');
      status = await getGoogleTTSAudioStatus();
    }
    
    logger.debug('[GoogleTTSHandler] ✅ Google TTS status retrieved:', status);
    return { success: true, status };
    
  } catch (error) {
    logger.error('[GoogleTTSHandler] ❌ Google TTS get status failed:', error);
    return {
      success: false,
      error: error.message || 'Background Google TTS get status failed',
      status: 'error'
    };
  }
};

// Offscreen document communication helpers for new actions
/**
 * Stop TTS via offscreen document by closing it.
 */
const stopWithOffscreenDocument = async () => {
  try {
    const browserAPI = await initializebrowserAPI();

    if (browserAPI.offscreen && typeof browserAPI.offscreen.hasDocument === 'function') {
      if (await browserAPI.offscreen.hasDocument()) {
        logger.debug('[GoogleTTSHandler] Closing offscreen document to stop TTS.');
        await browserAPI.offscreen.closeDocument();
        // Reset the promise so a new document can be created next time.
        offscreenDocumentPromise = null;
      } else {
        logger.debug('[GoogleTTSHandler] No offscreen document to close, stop is successful.');
      }
    }
  } catch (error) {
    logger.debug('[GoogleTTSHandler] Error closing offscreen document:', error);
    // Reset promise on error as well.
    offscreenDocumentPromise = null;
    // We don't re-throw because for a "stop" operation, we don't want to surface an error.
    // The goal is to stop the audio, and if closing fails, the audio is likely already stopped.
  }
};

/**
 * Pause TTS via offscreen document
 */
const pauseWithOffscreenDocument = async () => {
  const browserAPI = await initializebrowserAPI();
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Offscreen TTS pause timeout'));
    }, 3000);

    browserAPI.runtime.sendMessage({
      action: 'handleTTSPause',
      target: 'offscreen'
    }).then((response) => {
      clearTimeout(timeout);
      
      if (response?.success !== false) {
        resolve();
      } else {
        reject(new Error(response?.error || 'Offscreen TTS pause failed'));
      }
    }).catch((err) => {
      clearTimeout(timeout);
      
      // Handle connection errors gracefully
      if (err.message && err.message.includes('Receiving end does not exist')) {
        logger.debug('[GoogleTTSHandler] Offscreen document already disconnected for pause');
        resolve();
      } else {
        reject(err);
      }
    });
  });
};

/**
 * Resume TTS via offscreen document
 */
const resumeWithOffscreenDocument = async () => {
  const browserAPI = await initializebrowserAPI();
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Offscreen TTS resume timeout'));
    }, 3000);

    browserAPI.runtime.sendMessage({
      action: 'handleTTSResume',
      target: 'offscreen'
    }).then((response) => {
      clearTimeout(timeout);
      
      if (response?.success !== false) {
        resolve();
      } else {
        reject(new Error(response?.error || 'Offscreen TTS resume failed'));
      }
    }).catch((err) => {
      clearTimeout(timeout);
      
      // Handle connection errors gracefully
      if (err.message && err.message.includes('Receiving end does not exist')) {
        logger.debug('[GoogleTTSHandler] Offscreen document already disconnected for resume');
        resolve();
      } else {
        reject(err);
      }
    });
  });
};

/**
 * Get TTS status via offscreen document
 */
const getStatusWithOffscreenDocument = async () => {
  const browserAPI = await initializebrowserAPI();
  
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve('idle'); // Default fallback
    }, 3000);

    browserAPI.runtime.sendMessage({
      action: 'handleTTSGetStatus',
      target: 'offscreen'
    }).then((response) => {
      clearTimeout(timeout);
      
      if (response?.status) {
        resolve(response.status);
      } else {
        resolve('idle');
      }
    }).catch(() => {
      clearTimeout(timeout);
      resolve('idle'); // Fallback on error
    });
  });
};

// Firefox direct audio helpers for new actions
let currentFirefoxAudio = null;

/**
 * Stop TTS audio directly (Firefox)
 */
const stopGoogleTTSAudio = async () => {
  try {
    if (currentFirefoxAudio) {
      currentFirefoxAudio.pause();
      currentFirefoxAudio.currentTime = 0;
      currentFirefoxAudio.src = '';
      currentFirefoxAudio = null;
      logger.debug('[GoogleTTSHandler] Firefox TTS audio stopped');
    } else {
      logger.debug('[GoogleTTSHandler] No Firefox TTS audio to stop');
    }
  } catch (error) {
    logger.warn('[GoogleTTSHandler] Firefox TTS stop error (ignoring):', error.message);
    // Reset reference anyway
    currentFirefoxAudio = null;
  }
};

/**
 * Pause TTS audio directly (Firefox)
 */
const pauseGoogleTTSAudio = async () => {
  if (currentFirefoxAudio && !currentFirefoxAudio.paused) {
    currentFirefoxAudio.pause();
    logger.debug('[GoogleTTSHandler] Firefox TTS audio paused');
  }
};

/**
 * Resume TTS audio directly (Firefox)
 */
const resumeGoogleTTSAudio = async () => {
  if (currentFirefoxAudio && currentFirefoxAudio.paused) {
    try {
      await currentFirefoxAudio.play();
      logger.debug('[GoogleTTSHandler] Firefox TTS audio resumed');
    } catch (error) {
      logger.error('[GoogleTTSHandler] Firefox TTS resume failed:', error);
      throw error;
    }
  }
};

/**
 * Get TTS audio status (Firefox)
 */
const getGoogleTTSAudioStatus = async () => {
  if (!currentFirefoxAudio) {
    return 'idle';
  }
  
  if (currentFirefoxAudio.paused) {
    return currentFirefoxAudio.currentTime > 0 ? 'paused' : 'idle';
  }
  
  return 'playing';
};