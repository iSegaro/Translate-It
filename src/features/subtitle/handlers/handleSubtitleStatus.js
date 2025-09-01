import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
import { getSettingsAsync } from '@/shared/config/config.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'SubtitleStatusHandler');

export async function handleSubtitleStatus(message, sender) {
  logger.debug('Subtitle status request received', { 
    site: message.data?.site,
    url: sender?.tab?.url
  });

  try {
    const settings = await getSettingsAsync();
    
    const status = {
      extensionEnabled: settings.EXTENSION_ENABLED ?? true,
      subtitleTranslationEnabled: settings.ENABLE_SUBTITLE_TRANSLATION ?? true,
      showSubtitleIcon: settings.SHOW_SUBTITLE_ICON ?? true,
      targetLanguage: settings.TARGET_LANGUAGE ?? 'fa',
      provider: settings.TRANSLATION_API ?? 'google'
    };

    logger.debug('Subtitle status retrieved', status);

    return {
      success: true,
      status
    };

  } catch (error) {
    logger.error('Failed to get subtitle status', error);
    
    const errorHandler = ErrorHandler.getInstance();
    errorHandler.handle(error, { 
      type: ErrorTypes.STORAGE, 
      context: 'subtitle-status' 
    });

    return {
      success: false,
      error: error.message || 'Failed to get subtitle status',
      status: {
        extensionEnabled: true,
        subtitleTranslationEnabled: true,
        showSubtitleIcon: true,
        targetLanguage: 'fa',
        provider: 'google'
      }
    };
  }
}