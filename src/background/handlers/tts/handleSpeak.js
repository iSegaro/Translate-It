import { featureLoader } from '../../feature-loader.js';
import { ErrorHandler } from '../../../error-management/ErrorHandler.js'; // Assuming renamed path
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';

let errorHandlerInstance = null;

export const initializeTTSHandler = (handler) => {
  errorHandlerInstance = handler;
};

export const handleSpeak = async (request, sender) => {
  try {
    console.log('[TTSHandler] Processing speak request:', request);
    
    // Skip processing if this message was forwarded from offscreen to avoid duplicates
    if (request.forwardedFromOffscreen) {
      console.log('[TTSHandler] Skipping forwarded message to avoid duplicate processing');
      return { success: true, skipped: true };
    }
    
    const ttsManager = await featureLoader.loadTTSManager();
    
    // Handle both message formats:
    // 1. New format: { action: 'speak', data: { text, lang, rate, pitch, volume } }
    // 2. Old format: { action: 'speak', text, lang }
    let text, options;
    
    if (request.data && request.data.text) {
      // New format from popup
      text = request.data.text;
      options = {
        lang: request.data.lang || 'en-US',
        rate: request.data.rate || 1,
        pitch: request.data.pitch || 1,
        volume: request.data.volume || 1
      };
    } else if (request.text) {
      // Old format from sidepanel
      text = request.text;
      options = {
        lang: request.lang || 'en-US',
        rate: request.rate || 1,
        pitch: request.pitch || 1,
        volume: request.volume || 1
      };
    } else {
      throw new Error('No text provided for TTS');
    }
    
    console.log('[TTSHandler] Speaking text:', text.substring(0, 50), 'with options:', options);
    
    // Call TTS manager with unified format
    await ttsManager.speak(text, options);
    return { success: true };
  } catch (error) {
    console.error('[TTSHandler] Error handling speak message:', error);
    
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