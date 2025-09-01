import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import browser from 'webextension-polyfill';

const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'SubtitleToggleHandler');

export async function handleSubtitleToggle(message) {
  logger.debug('Subtitle toggle request received', { 
    enabled: message.data?.enabled,
    site: message.data?.site
  });

  try {
    const { enabled, site } = message.data;

    if (typeof enabled !== 'boolean') {
      throw new Error('Invalid enabled state provided');
    }

    // Update subtitle translation setting
    await storageManager.set({
      'ENABLE_SUBTITLE_TRANSLATION': enabled
    });

    logger.debug('Subtitle setting updated', { enabled, site });

    // Broadcast setting change to all content scripts
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      try {
        await browser.tabs.sendMessage(tab.id, {
          action: 'subtitleSettingChanged',
          data: { enabled, site }
        });
      } catch {
        // Ignore errors for tabs that don't have content scripts
        logger.debug('Could not send message to tab', { tabId: tab.id });
      }
    }

    return {
      success: true,
      enabled,
      message: `Subtitle translation ${enabled ? 'enabled' : 'disabled'}`
    };

  } catch (error) {
    logger.error('Subtitle toggle failed', error);
    
    const errorHandler = ErrorHandler.getInstance();
    errorHandler.handle(error, { 
      type: ErrorTypes.STORAGE, 
      context: 'subtitle-toggle' 
    });

    return {
      success: false,
      error: error.message || 'Failed to toggle subtitle setting'
    };
  }
}