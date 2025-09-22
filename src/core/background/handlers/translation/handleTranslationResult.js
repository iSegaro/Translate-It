import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { TranslationMode } from '@/shared/config/config.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import browser from 'webextension-polyfill';
import { unifiedTranslationService } from '@/core/services/translation/UnifiedTranslationService.js';

// Track processed results to prevent duplicates
const processedResults = new Set();

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'handleTranslationResult');

/**
 * Handle translation result updates using UnifiedTranslationService
 * This function now delegates to the UnifiedTranslationService for proper result dispatch
 */
export async function handleTranslationResult(message) {
  try {
    logger.debug('Handling TRANSLATION_RESULT_UPDATE via UnifiedService:', message.messageId);

    // Check for duplicate processing
    if (processedResults.has(message.messageId)) {
      logger.debug('Skipping duplicate translation result:', message.messageId);
      return { success: true, skipped: true, reason: 'duplicate' };
    }

    // Mark as processed
    processedResults.add(message.messageId);

    // Clean up old processed results (prevent memory leak)
    if (processedResults.size > 1000) {
      const oldest = processedResults.values().next().value;
      processedResults.delete(oldest);
    }

    // Check if this is a streaming update
    if (message.data?.streaming) {
      // Handle streaming updates
      await unifiedTranslationService.handleStreamingUpdate(message);
      return { success: true, handled: true, streaming: true };
    }

    // For regular results, delegate to UnifiedTranslationService's dispatcher
    const request = unifiedTranslationService.requestTracker.getRequest(message.messageId);
    if (request) {
      // Update request with result
      unifiedTranslationService.requestTracker.updateRequest(message.messageId, {
        status: message.data?.success ? 'completed' : 'failed',
        result: message.data
      });

      // Dispatch result using ResultDispatcher
      const dispatchResult = await unifiedTranslationService.resultDispatcher.dispatchResult({
        messageId: message.messageId,
        result: message.data,
        request: request,
        options: {
          forceBroadcast: message.data?.needsBroadcast || message.data?.streaming
        }
      });

      return { success: true, ...dispatchResult };
    } else {
      // No request found, check if this is a broadcast-only result
      // Skip field mode results as they're handled via direct response
      const needsBroadcast = message.data?.needsBroadcast ||
                            message.data?.context === 'select-element' ||
                            (message.data?.translatedText && message.data?.translatedText.length > 2000) &&
                            !(message.data?.translationMode === 'field' || message.data?.translationMode === TranslationMode.Field);

      if (needsBroadcast) {
        // Broadcast to all tabs
        const tabs = await browser.tabs.query({});
        let handled = false;

        for (const tab of tabs) {
          try {
            const response = await browser.tabs.sendMessage(tab.id, {
              action: MessageActions.TRANSLATION_RESULT_UPDATE,
              messageId: message.messageId,
              data: message.data
            });

            if (response?.handled) {
              handled = true;
            }
          } catch {
            // Tab might not have content script, ignore
          }
        }

        return { success: true, handled, broadcast: true };
      }

      logger.debug('No request found for translation result:', message.messageId);
      return { success: true, handled: false, reason: 'no-request-found' };
    }
  } catch (error) {
    logger.error('Error handling translation result:', error);
    return { success: false, error: error.message };
  }
}