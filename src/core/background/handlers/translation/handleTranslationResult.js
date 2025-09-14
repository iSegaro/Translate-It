import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import browser from 'webextension-polyfill';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'handleTranslationResult');

/**
 * Handle translation result updates and forward to appropriate handlers
 * This replaces the temporary listener pattern in TranslationHandler
 */
export async function handleTranslationResult(message, sender) {
  try {
    logger.debug('Handling TRANSLATION_RESULT_UPDATE:', message.messageId);
    
    // Get all active content scripts that might have pending translation requests
    const tabs = await browser.tabs.query({});
    let handled = false;
    
    for (const tab of tabs) {
      try {
        // Send to content script to handle if they have pending requests
        const response = await browser.tabs.sendMessage(tab.id, {
          action: 'HANDLE_TRANSLATION_RESULT',
          messageId: message.messageId,
          data: message.data
        });
        
        if (response?.handled) {
          handled = true;
          break;
        }
            } catch {
        // Tab might not have content script, ignore
      }
    }
    
    if (!handled) {
      logger.debug(`No handler found for translation result: ${message.messageId}`);
    }
    
    return { success: true, handled };
  } catch (error) {
    logger.error('Error handling translation result:', error);
    return { success: false, error: error.message };
  }
}