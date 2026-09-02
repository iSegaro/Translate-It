/**
 * Unified Result Dispatcher - Handles delivery of translation results
 * Manages broadcasting to tabs, streaming updates, and cancellation notifications.
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { TranslationMode } from '@/shared/config/config.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import ExtensionContextManager from '@/core/extensionContext.js';
import { RequestStatus } from './TranslationRequestTracker.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import browser from 'webextension-polyfill';
import { isPermanentContextInvalidation } from '@/core/contextCore.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'UnifiedResultDispatcher');

function createSelectElementDeliveryError(messageId, cause = null, reason = 'transport_failure') {
  const causeMessage = String(cause?.message || cause || '').toLowerCase();
  const contextError = cause && (
    isPermanentContextInvalidation(cause)
    || cause.type === ErrorTypes.EXTENSION_CONTEXT_INVALIDATED
    || causeMessage.includes('extension context invalidated')
  );
  const error = new Error(contextError ? 'Extension context invalidated' : 'Select Element result delivery failed');
  error.type = contextError ? ErrorTypes.EXTENSION_CONTEXT_INVALIDATED : ErrorTypes.CONNECTION_LOST;
  error.messageId = messageId;
  error.dispatchStage = 'select-element-result';
  error.reason = reason;
  return error;
}

export async function dispatchTranslationCancellation({ messageId, request }) {
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

export class UnifiedResultDispatcher {
  constructor() {
    this.processedResults = new Set(); // Set of processed messageIds to prevent duplicates
    // Modes that should NOT be recorded in history
    this.EXCLUDED_MODES = new Set([
      TranslationMode.Page,           // Batch page translation
      TranslationMode.Select_Element,  // Element selection (batch)
      TranslationMode.PDF,             // Dedicated PDF translation
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
    const isSelectElement = request.mode === TranslationMode.Select_Element;

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

    try {
      if (request.mode === TranslationMode.Field) {
        await this.dispatchFieldResult({ messageId, result, request, originalMessage });
      } else if (isSelectElement) {
        await this.dispatchSelectElementResult({ messageId, result, request, originalMessage });
      } else if (request.mode === TranslationMode.Selection || request.mode === TranslationMode.Dictionary_Translation) {
        await this.dispatchSelectionResult({ messageId, result, request, originalMessage });
      }
    } catch (error) {
      if (isSelectElement) this.processedResults.delete(messageId);
      throw error;
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
   * Dispatch selection or dictionary translation result back to the original tab.
   */
  async dispatchSelectionResult({ messageId, result, request }) {
    try {
      if (request?.sender?.tab?.id) {
        await browser.tabs.sendMessage(request.sender.tab.id, {
          action: MessageActions.TRANSLATION_RESULT_UPDATE,
          messageId,
          data: {
            ...result,
            translationMode: request.mode,
            context: 'selection-direct',
            isBroadcast: false
          }
        });
      }
    } catch (sendError) {
      if (!ExtensionContextManager.isContextError(sendError)) {
        logger.warn(`[ResultDispatcher] Failed to send selection result:`, sendError.message);
      }
    }
  }

  async _sendSelectElementResult({ messageId, data, request, context }) {
    const tabId = request?.sender?.tab?.id;
    const frameId = request?.sender?.frameId;
    if (typeof tabId !== 'number' || typeof frameId !== 'number') {
      logger.warn('[ResultDispatcher] Missing Select Element tab/frame identity', { messageId, tabId, frameId });
      throw createSelectElementDeliveryError(messageId, null, 'missing_route_identity');
    }

    try {
      await browser.tabs.sendMessage(tabId, {
        action: MessageActions.TRANSLATION_RESULT_UPDATE,
        messageId,
        data: {
          ...data,
          translationMode: TranslationMode.Select_Element,
          context,
          isBroadcast: false
        }
      }, { frameId });
      // A resolved send only proves transport handoff. Receiver may buffer the
      // result until its streaming handler registers.
      return true;
    } catch (sendError) {
      if (!ExtensionContextManager.isContextError(sendError)) {
        logger.warn(`[ResultDispatcher] Failed to send Select Element result:`, sendError.message);
      }
      if (sendError?.type === ErrorTypes.CONNECTION_LOST
          || sendError?.type === ErrorTypes.EXTENSION_CONTEXT_INVALIDATED) {
        throw sendError;
      }
      throw createSelectElementDeliveryError(messageId, sendError);
    }
  }

  /**
   * Dispatch select-element translation result (handles large payloads surgically).
   */
  async dispatchSelectElementResult({ messageId, result, request }) {
    // Select Element results target originating tab and frame; never broadcast.
    return this._sendSelectElementResult({
      messageId,
      data: result,
      request,
      context: 'select-element-direct'
    });
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
      if (request.mode === TranslationMode.Select_Element) {
        await this._sendSelectElementResult({
          messageId,
          data: { streaming: true, ...data },
          request,
          context: 'select-element-streaming'
        });
      } else {
        await this.broadcastResult({
          messageId,
          result: { streaming: true, ...data },
          request
        });
      }
    }
  }

  /**
   * Notify the original tab that a request has been cancelled.
   */
  async dispatchCancellation({ messageId, request }) {
    return await dispatchTranslationCancellation({ messageId, request });
  }
}
