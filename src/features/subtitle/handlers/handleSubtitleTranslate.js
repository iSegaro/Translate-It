import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { TranslationEngine } from "@/features/translation/core/translation-engine.js";
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'SubtitleTranslateHandler');

export async function handleSubtitleTranslate(message) {
  logger.debug('Subtitle translation request received', { 
    textLength: message.data?.text?.length,
    targetLang: message.data?.targetLanguage,
    provider: message.data?.provider
  });

  try {
    const { text, sourceLanguage = 'auto', targetLanguage = 'fa', provider = 'google' } = message.data;

    if (!text || text.trim() === '') {
      throw new Error('No text provided for translation');
    }

    const translationEngine = new TranslationEngine();
    await translationEngine.initialize();

    const result = await translationEngine.translate({
      text,
      sourceLanguage,
      targetLanguage,
      provider,
      mode: 'subtitle'
    });

    logger.debug('Subtitle translation completed', {
      originalLength: text.length,
      translatedLength: result.translatedText?.length,
      provider: result.provider
    });

    return {
      success: true,
      translatedText: result.translatedText,
      sourceLanguage: result.sourceLanguage,
      targetLanguage: result.targetLanguage,
      provider: result.provider
    };

  } catch (error) {
    logger.error('Subtitle translation failed', error);
    
    const errorHandler = ErrorHandler.getInstance();
    errorHandler.handle(error, { 
      type: ErrorTypes.TRANSLATION, 
      context: 'subtitle-translate' 
    });

    return {
      success: false,
      error: error.message || 'Translation failed',
      translatedText: message.data?.text || ''
    };
  }
}