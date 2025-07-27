import { featureLoader } from '../../feature-loader.js';
import { ErrorHandler } from '../../../error-management/ErrorHandler.js'; // Assuming renamed path
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';

let errorHandlerInstance = null;

export const initializeTTSHandler = (handler) => {
  errorHandlerInstance = handler;
};

export const handleStopTTS = async (request, sender) => {
  try {
    const ttsManager = await featureLoader.loadTTSManager();
    await ttsManager.stop();
    return { success: true };
  } catch (error) {
    console.error('[TTSHandler] Error handling stopTTS message:', error);
    return errorHandlerInstance.handle(error, {
      type: ErrorTypes.TTS_ERROR,
      message: error.message || 'Failed to stop TTS',
      context: 'stopTTS',
    });
  }
};