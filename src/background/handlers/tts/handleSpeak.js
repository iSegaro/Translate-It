import { featureLoader } from '../../feature-loader.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';
import browser from 'webextension-polyfill';
import { createLogger } from '@/utils/core/logger.js';
import { isFirefox } from '@/utils/browser/compatibility.js';

const logger = createLogger('Core', 'handleSpeak');

let errorHandlerInstance = null;

export const initializeSpeakHandler = (handler) => {
  errorHandlerInstance = handler;
};

/**
 * Enhanced offscreen TTS handler with timeout and retry logic
 * @param {string} text - Text to speak
 * @param {Object} options - TTS options
 * @returns {Promise<Object>} Response from offscreen
 */
const handleOffscreenTTS = async (text, options, retryCount = 0) => {
  const maxRetries = 2;
  const timeout = 5000; // 5 second timeout
  
  logger.debug(`[TTSHandler] Attempting offscreen TTS (attempt ${retryCount + 1}/${maxRetries + 1})`);
  
  try {
    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Offscreen TTS timeout after ${timeout}ms`));
      }, timeout);
    });

    // Create TTS message promise
    const ttsPromise = browser.runtime.sendMessage({
      action: 'TTS_SPEAK',
      target: 'offscreen',
      data: {
        text: text,
        language: options.lang,
        rate: options.rate,
        pitch: options.pitch,
        volume: options.volume
      },
      timestamp: Date.now(),
      attemptNumber: retryCount + 1
    });

    // Race between timeout and TTS
    const response = await Promise.race([ttsPromise, timeoutPromise]);
    
    logger.debug('[TTSHandler] Response from offscreen:', response);
    return response || { success: true, processedVia: 'offscreen' };
    
  } catch (error) {
    logger.warn(`[TTSHandler] Offscreen TTS failed (attempt ${retryCount + 1}):`, error.message);
    
    // Retry logic
    if (retryCount < maxRetries) {
      logger.debug(`[TTSHandler] Retrying offscreen TTS (${retryCount + 1}/${maxRetries})`);
      
      // Small delay before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Try to recreate offscreen document before retry
      try {
        const ttsManager = await featureLoader.loadTTSManager();
        if (typeof ttsManager.createOffscreenDocument === 'function') {
          await ttsManager.createOffscreenDocument();
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch (recreateError) {
        logger.warn('[TTSHandler] Failed to recreate offscreen document:', recreateError.message);
      }
      
      return await handleOffscreenTTS(text, options, retryCount + 1);
    } else {
      // All retries failed - throw the error to be handled by main handler
      logger.error('[TTSHandler] All offscreen TTS attempts failed');
      throw new Error(`Offscreen TTS failed after ${maxRetries + 1} attempts: ${error.message}`);
    }
  }
};

export const handleSpeak = async (request) => {
  try {
    logger.debug('[TTSHandler] Processing speak request:', request);
    
    // Skip processing if this message was forwarded from offscreen to avoid duplicates
    if (request.forwardedFromOffscreen) {
      logger.debug('[TTSHandler] Skipping forwarded message to avoid duplicate processing');
      return { success: true, skipped: true };
    }

    // If message is from TTS manager (no target) or targeted for offscreen, ensure offscreen document is ready first
    if (request.target === 'offscreen' || !request.target) {
      logger.debug('[TTSHandler] Message targeted for offscreen, ensuring offscreen document is ready...');
      
      try {
        // Load TTS manager for offscreen document management
        const ttsManager = await featureLoader.loadTTSManager();
        await ttsManager.initialize();
        
        // Extract text and options from request
        let text, options;
        if (request.data && request.data.text) {
          text = request.data.text;
          options = {
            lang: request.data.language || request.data.lang || 'en-US',
            rate: request.data.rate || 1,
            pitch: request.data.pitch || 1,
            volume: request.data.volume || 1
          };
        } else {
          throw new Error('No text provided for TTS');
        }
        
        logger.debug('[TTSHandler] Processing offscreen TTS:', text.substring(0, 50), 'with options:', options);
        
        // Check if offscreen document exists (Chrome only)
        const isFirefoxBrowser = await isFirefox();
        
        if (!isFirefoxBrowser && browser.runtime.getContexts) {
          try {
            const existingContexts = await browser.runtime.getContexts({
              contextTypes: ["OFFSCREEN_DOCUMENT"],
            });

            if (existingContexts.length === 0) {
              logger.debug('[TTSHandler] No offscreen document found, recreating...');
              // Only try to create offscreen document if we have OffscreenTTSManager
              if (typeof ttsManager.createOffscreenDocument === 'function') {
                await ttsManager.createOffscreenDocument();
                // Small delay for initialization
                await new Promise(resolve => setTimeout(resolve, 200));
              } else {
                logger.debug('[TTSHandler] TTS manager does not support offscreen documents');
              }
            }
          } catch (contextError) {
            logger.warn('[TTSHandler] Could not check offscreen contexts:', contextError.message);
            // Continue without offscreen check - likely Firefox or unsupported browser
          }
        } else {
          logger.debug('[TTSHandler] Firefox detected or getContexts not available, skipping offscreen check');
        }

        // Check if we should use offscreen or direct TTS manager
        if (!isFirefoxBrowser && typeof ttsManager.createOffscreenDocument === 'function') {
          // Chrome: OffscreenTTSManager - forward to offscreen document with timeout and retry
          return await handleOffscreenTTS(text, options);
        } else {
          // Firefox or BackgroundTTSManager: use directly
          logger.debug('[TTSHandler] Using background TTS manager directly (Firefox or no offscreen support)...');
          await ttsManager.speak(text, options);
          return { success: true, processedVia: 'background' };
        }
      } catch (error) {
        logger.error('[TTSHandler] Failed to ensure offscreen readiness:', error);
        throw error; // Let error handling below handle this
      }
    }
    
    // If not targeted for offscreen, this shouldn't happen with current architecture
    logger.warn('[TTSHandler] Unexpected: TTS message not targeted for offscreen');
    throw new Error('TTS messages should be targeted for offscreen processing');
  } catch (error) {
    logger.error('[TTSHandler] Error handling speak message:', error);
    
    // Handle case when errorHandlerInstance is not initialized
    if (errorHandlerInstance) {
      return errorHandlerInstance.handle(error, {
        type: ErrorTypes.TTS_ERROR,
        message: error.message || 'TTS service temporarily unavailable',
        context: 'speak',
      });
    } else {
      // Fallback error response when error handler not available
      return {
        success: false,
        error: error.message || 'TTS service temporarily unavailable'
      };
    }
  }
};