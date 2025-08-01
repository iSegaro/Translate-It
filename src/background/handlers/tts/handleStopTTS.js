import { featureLoader } from '../../feature-loader.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';

let errorHandlerInstance = null;

export const initializeStopTTSHandler = (handler) => {
  errorHandlerInstance = handler;
};

export const handleStopTTS = async () => {
  try {
    const ttsManager = await featureLoader.loadTTSManager();
    await ttsManager.stop();
    return { success: true };
  } catch (error) {
    console.error('[TTSHandler] Error handling stopTTS message:', error);
    
    // Handle case when errorHandlerInstance is not initialized
    if (errorHandlerInstance) {
      return errorHandlerInstance.handle(error, {
        type: ErrorTypes.TTS_ERROR,
        message: error.message || 'Failed to stop TTS',
        context: 'stopTTS',
      });
    } else {
      // Fallback error response when error handler not available
      return {
        success: false,
        error: error.message || 'Failed to stop TTS'
      };
    }
  }
};