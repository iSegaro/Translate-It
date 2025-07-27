import { featureLoader } from '../../feature-loader.js';
import { ErrorHandler } from '../../../error-management/ErrorHandler.js'; // Assuming renamed path
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';

let errorHandlerInstance = null;

export const initializeTTSHandler = (handler) => {
  errorHandlerInstance = handler;
};

export const handleSpeak = async (request, sender) => {
  try {
    const ttsManager = await featureLoader.loadTTSManager();
    await ttsManager.speak(request.text, request.lang, request.options);
    return { success: true };
  } catch (error) {
    console.error('[TTSHandler] Error handling speak message:', error);
    return errorHandlerInstance.handle(error, {
      type: ErrorTypes.TTS_ERROR,
      message: error.message || 'TTS service temporarily unavailable',
      context: 'speak',
    });
  }
};