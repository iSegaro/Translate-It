import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'SubtitleInitializer');

/**
 * Conditionally initializes subtitle handler based on site support and settings
 * @param {Object} translationHandler - The translation handler instance
 * @returns {Promise<void>}
 */
export async function initializeSubtitleHandler(translationHandler) {
  // Check if current site supports subtitles
  const hostname = window.location.hostname;
  const isSupportedSite = hostname.includes("youtube.") || hostname.includes("youtu.be") || hostname.includes("netflix.");
  
  if (!isSupportedSite) {
    logger.debug('SubtitleHandler skipped - unsupported site');
    return;
  }

  // Check if any subtitle features are enabled
  try {
    const { getSettingsAsync } = await import("../../config.js");
    const settings = await getSettingsAsync();
    
    const subtitleEnabled = settings.ENABLE_SUBTITLE_TRANSLATION ?? true;
    const iconEnabled = settings.SHOW_SUBTITLE_ICON ?? true;
    
    if (!subtitleEnabled && !iconEnabled) {
      logger.debug('SubtitleHandler skipped - all subtitle features disabled');
      return;
    }

    // Import and initialize SubtitleHandler only when needed
    const { SubtitleHandler } = await import("../../handlers/subtitleHandler.js");
    const subtitleHandler = new SubtitleHandler(translationHandler);
    window.subtitleHandlerInstance = subtitleHandler;
    
    logger.debug('SubtitleHandler initialized', { 
      site: hostname, 
      subtitleEnabled, 
      iconEnabled 
    });
    
  } catch (error) {
    logger.error('Failed to initialize SubtitleHandler:', error);
  }
}