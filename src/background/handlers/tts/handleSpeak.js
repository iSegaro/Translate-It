import { featureLoader } from '../../feature-loader.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';
import browser from 'webextension-polyfill';

let errorHandlerInstance = null;

export const initializeSpeakHandler = (handler) => {
  errorHandlerInstance = handler;
};

export const handleSpeak = async (request) => {
  try {
    console.log('[TTSHandler] Processing speak request:', request);
    
    // Skip processing if this message was forwarded from offscreen to avoid duplicates
    if (request.forwardedFromOffscreen) {
      console.log('[TTSHandler] Skipping forwarded message to avoid duplicate processing');
      return { success: true, skipped: true };
    }

    // If message is from TTS manager (no target) or targeted for offscreen, ensure offscreen document is ready first
    if (request.target === 'offscreen' || !request.target) {
      console.log('[TTSHandler] Message targeted for offscreen, ensuring offscreen document is ready...');
      
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
        
        console.log('[TTSHandler] Processing offscreen TTS:', text.substring(0, 50), 'with options:', options);
        
        // Check if offscreen document actually exists before sending
        const existingContexts = await browser.runtime.getContexts({
          contextTypes: ["OFFSCREEN_DOCUMENT"],
        });

        if (existingContexts.length === 0) {
          console.log('[TTSHandler] No offscreen document found, recreating...');
          // Only try to create offscreen document if we have OffscreenTTSManager
          if (typeof ttsManager.createOffscreenDocument === 'function') {
            await ttsManager.createOffscreenDocument();
            // Small delay for initialization
            await new Promise(resolve => setTimeout(resolve, 200));
          } else {
            console.log('[TTSHandler] TTS manager does not support offscreen documents');
          }
        }

        // Check if we should use offscreen or direct TTS manager
        if (typeof ttsManager.createOffscreenDocument === 'function') {
          // OffscreenTTSManager: forward to offscreen document
          console.log('[TTSHandler] Sending TTS message to offscreen document...');
          const response = await browser.runtime.sendMessage({
            action: 'TTS_SPEAK',
            target: 'offscreen',
            data: {
              text: text,
              language: options.lang,
              rate: options.rate,
              pitch: options.pitch,
              volume: options.volume
            },
            timestamp: Date.now()
          });
          
          console.log('[TTSHandler] Response from offscreen:', response);
          return response || { success: true, processedVia: 'offscreen' };
        } else {
          // BackgroundTTSManager: use directly
          console.log('[TTSHandler] Using background TTS manager directly...');
          await ttsManager.speak(text, options);
          return { success: true, processedVia: 'background' };
        }
      } catch (error) {
        console.error('[TTSHandler] Failed to ensure offscreen readiness:', error);
        throw error; // Let error handling below handle this
      }
    }
    
    // If not targeted for offscreen, this shouldn't happen with current architecture
    console.warn('[TTSHandler] Unexpected: TTS message not targeted for offscreen');
    throw new Error('TTS messages should be targeted for offscreen processing');
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