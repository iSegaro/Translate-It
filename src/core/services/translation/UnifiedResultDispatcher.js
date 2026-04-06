/**
 * Unified Result Dispatcher - Handles delivery of translation results
 * Manages broadcasting to tabs, streaming updates, and cancellation notifications.
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { TranslationMode } from '@/shared/config/config.js';
import ExtensionContextManager from '@/core/extensionContext.js';
import { RequestStatus } from './TranslationRequestTracker.js';
import browser from 'webextension-polyfill';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'UnifiedResultDispatcher');

export class UnifiedResultDispatcher {
  constructor() {
    this.processedResults = new Set(); // Set of processed messageIds to prevent duplicates
  }

  /**
   * Dispatch translation result to the appropriate context.
   * 
   * @param {object} params - { messageId, result, request, originalMessage }
   */
  async dispatchResult({ messageId, result, request, originalMessage }) {
    if (this.processedResults.has(messageId)) return;

    this.processedResults.add(messageId);

    // Clean up old processed results (prevent memory leak)
    if (this.processedResults.size > 1000) {
      const oldest = this.processedResults.values().next().value;
      this.processedResults.delete(oldest);
    }

    if (request.mode === TranslationMode.Field) {
      await this.dispatchFieldResult({ messageId, result, request, originalMessage });
    } else if (request.mode === TranslationMode.Select_Element) {
      await this.dispatchSelectElementResult({ messageId, result, request, originalMessage });
    }
  }

  /**
   * Dispatch field or page mode translation result back to the original tab.
   */
  async dispatchFieldResult({ messageId, result, request }) {
    try {
      const mode = request.mode === TranslationMode.Page ? TranslationMode.Page : TranslationMode.Field;
      
      await browser.tabs.sendMessage(request.sender.tab.id, {
        action: MessageActions.TRANSLATION_RESULT_UPDATE,
        messageId,
        data: {
          ...result,
          translationMode: mode,
          context: mode === TranslationMode.Page ? 'page-mode' : 'field-mode',
          elementData: request.elementData
        }
      });
    } catch (sendError) {
      if (ExtensionContextManager.isContextError(sendError)) {
        ExtensionContextManager.handleContextError(sendError, 'result-dispatcher');
      } else {
        logger.warn(`[ResultDispatcher] Failed to dispatch field result:`, sendError.message);
      }
    }
  }

  /**
   * Dispatch select-element translation result (handles large payloads via broadcast).
   */
  async dispatchSelectElementResult({ messageId, result, request }) {
    if (result.streaming || (result.translatedText && result.translatedText.length > 2000)) {
      await this.broadcastResult({ messageId, result, request });
    }
  }

  /**
   * Broadcast result to all tabs (necessary for streaming and large content synchronization).
   */
  async broadcastResult({ messageId, result, request }) {
    const tabs = await browser.tabs.query({});

    for (const tab of tabs) {
      try {
        await browser.tabs.sendMessage(tab.id, {
          action: MessageActions.TRANSLATION_RESULT_UPDATE,
          messageId,
          data: {
            ...result,
            translationMode: request?.mode || result?.translationMode || 'unknown',
            context: 'broadcast',
            isBroadcast: true 
          }
        });
      } catch (sendError) {
        if (!ExtensionContextManager.isContextError(sendError)) {
          logger.debug(`Could not broadcast to tab ${tab.id}:`, sendError.message);
        }
      }
    }
  }

  /**
   * Handle streaming updates while a translation is in progress.
   */
  async dispatchStreamingUpdate({ messageId, data, request }) {
    if (request && request.status === RequestStatus.PROCESSING) {
      await this.broadcastResult({
        messageId,
        result: { streaming: true, ...data },
        request
      });
    }
  }

  /**
   * Notify the original tab that a request has been cancelled.
   */
  async dispatchCancellation({ messageId, request }) {
    if (request?.sender?.tab?.id) {
      try {
        await browser.tabs.sendMessage(request.sender.tab.id, {
          action: MessageActions.TRANSLATION_CANCELLED,
          messageId
        });
      } catch (sendError) {
        if (ExtensionContextManager.isContextError(sendError)) {
          ExtensionContextManager.handleContextError(sendError, 'result-dispatcher');
        } else {
          logger.warn(`[ResultDispatcher] Failed to send cancellation:`, sendError.message);
        }
      }
    }
  }
}
