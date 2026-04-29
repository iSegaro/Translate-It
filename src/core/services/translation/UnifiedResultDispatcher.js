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
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import browser from 'webextension-polyfill';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'UnifiedResultDispatcher');

export class UnifiedResultDispatcher {
  constructor() {
    this.processedResults = new Set(); // Set of processed messageIds to prevent duplicates
    // Modes that should NOT be recorded in history
    this.EXCLUDED_MODES = new Set([
      TranslationMode.Page,           // Batch page translation
      TranslationMode.Select_Element,  // Element selection (batch)
      TranslationMode.Field           // Real-time field replacement
    ]);
  }

  /**
   * Check if translation should be recorded in history
   * @private
   */
  async _shouldRecordHistory(request) {
    try {
      // Check if history is enabled in settings
      const settings = await storageManager.get(['ENABLE_TRANSLATION_HISTORY']);
      if (!settings.ENABLE_TRANSLATION_HISTORY) {
        return false;
      }

      // Check if mode is excluded
      if (this.EXCLUDED_MODES.has(request.mode)) {
        return false;
      }

      // Check if translation was successful
      return true;
    } catch (error) {
      logger.warn('[History] Failed to check history settings:', error);
      return false; // Fail safe: don't record if settings check fails
    }
  }

  /**
   * Add translation to history if conditions are met
   * @private
   */
  async _addToHistoryIfNeeded(request, result) {
    if (!(await this._shouldRecordHistory(request))) {
      return;
    }

    try {
      // Get translation engine instance
      const backgroundService = globalThis.backgroundService;
      if (!backgroundService?.translationEngine) {
        logger.warn('[History] Translation engine not available for history recording');
        return;
      }

      // Prepare history data
      const historyData = {
        text: request.data?.text || '',
        provider: result.provider || request.data?.provider,
        sourceLanguage: result.sourceLanguage || request.data?.sourceLanguage,
        targetLanguage: result.targetLanguage || request.data?.targetLanguage,
        mode: request.mode
      };

      // Add to history via TranslationEngine
      await backgroundService.translationEngine.addToHistory(historyData, result);
      logger.debug(`[History] Added translation to history: ${historyData.text.slice(0, 30)}...`);
    } catch (error) {
      // Don't let history errors affect main translation flow
      logger.error('[History] Failed to add translation to history:', error);
    }
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

    // Add to history if conditions are met (async, non-blocking)
    if (result.success && result.translatedText) {
      this._addToHistoryIfNeeded(request, result).catch(error => {
        logger.error('[History] Async history recording failed:', error);
      });
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
    const shouldBroadcast = 
      result.success === false || 
      result.streaming || 
      (result.translatedText && result.translatedText.length > 2000);

    if (shouldBroadcast) {
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
