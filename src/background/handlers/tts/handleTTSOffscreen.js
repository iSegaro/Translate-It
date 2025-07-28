// src/background/handlers/tts/handleTTSOffscreen.js
// Handler for offscreen document TTS operations

import { getBrowserAPI } from '../../../utils/browser-unified.js';
import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';

let errorHandlerInstance = null;

export const initializeTTSOffscreenHandler = (handler) => {
  errorHandlerInstance = handler;
};

/**
 * Handle TTS operations targeted for offscreen document
 * @param {Object} request - Message request
 * @param {Object} sender - Message sender
 * @returns {Promise<Object>} Response
 */
export const handleTTSOffscreen = async (request, sender) => {
  try {
    console.log('[TTSOffscreenHandler] 🎯 Processing offscreen TTS request:', request.action);
    console.log('[TTSOffscreenHandler] 📨 Request data:', request.data ? 'Present' : 'Missing');

    const browser = await getBrowserAPI();
    
    // Forward message to offscreen document with explicit target
    const forwardedMessage = {
      ...request,
      target: 'offscreen',
      forwardedFromBackground: true
    };
    
    console.log('[TTSOffscreenHandler] 📤 Forwarding to offscreen:', forwardedMessage.action);
    
    const response = await Promise.race([
      browser.runtime.sendMessage(forwardedMessage),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Offscreen TTS timeout')), 10000)
      )
    ]);

    console.log('[TTSOffscreenHandler] 📥 Offscreen response:', response);

    if (response && response.success !== false) {
      console.log('[TTSOffscreenHandler] ✅ Offscreen TTS operation successful');
      return response;
    } else {
      throw new Error(response?.error || 'Offscreen TTS operation failed');
    }

  } catch (error) {
    console.error('[TTSOffscreenHandler] ❌ Error handling offscreen TTS:', error);
    
    if (errorHandlerInstance) {
      return errorHandlerInstance.handle(error, {
        type: ErrorTypes.TTS_ERROR,
        message: error.message || 'Offscreen TTS operation failed',
        context: `handleTTSOffscreen:${request.action}`
      });
    } else {
      return {
        success: false,
        error: error.message || 'Offscreen TTS handler failed'
      };
    }
  }
};