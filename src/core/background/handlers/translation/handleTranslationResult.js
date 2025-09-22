import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { TranslationMode } from '@/shared/config/config.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import browser from 'webextension-polyfill';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'handleTranslationResult');

/**
 * Handle translation result updates and forward to appropriate handlers
 * This function now only handles streaming translation results that need broadcast
 * Non-streaming results are returned directly by handleTranslate.js
 */
export async function handleTranslationResult(message) {
  try {
    logger.debug('Handling TRANSLATION_RESULT_UPDATE:', message.messageId);

    // Broadcast for streaming translations, select-element mode, field mode, or when explicitly marked as needsBroadcast
    // Field mode translations use fire-and-forget pattern and need broadcast to notify content script
    const needsBroadcast = message.data?.streaming ||
                          message.data?.needsBroadcast ||
                          message.data?.context === 'select-element' ||
                          message.data?.translationMode === 'field' ||
                          message.data?.translationMode === TranslationMode.Field ||
                          (message.data?.translatedText && message.data?.translatedText.length > 2000);

    if (!needsBroadcast) {
      logger.debug('Skipping broadcast for non-streaming translation result:', message.messageId);
      return { success: true, handled: false, reason: 'non-streaming' };
    }

    // Get all active content scripts that might have pending translation requests
    const tabs = await browser.tabs.query({});
    let handled = false;

    for (const tab of tabs) {
      try {
        // Send to content script to handle if they have pending requests
        const response = await browser.tabs.sendMessage(tab.id, {
          action: MessageActions.TRANSLATION_RESULT_UPDATE,
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
      logger.debug(`No handler found for streaming translation result: ${message.messageId}`);
    }

    return { success: true, handled, streaming: true };
  } catch (error) {
    logger.error('Error handling translation result:', error);
    return { success: false, error: error.message };
  }
}