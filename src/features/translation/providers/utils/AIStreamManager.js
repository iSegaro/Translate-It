/**
 * AI Stream Manager - Handles streaming translation results and lifecycle
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { MessageFormat } from '@/shared/messaging/core/MessagingCore.js';
import { matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';
import browser from 'webextension-polyfill';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'AIStreamManager');

export const AIStreamManager = {
  /**
   * Stream batch results to content script
   */
  async streamBatchResults(providerName, batchResults, originalBatch, batchIndex, messageId, engine, sourceLanguage = null, targetLanguage = null) {
    if (!engine || !messageId) {
      logger.warn(`[${providerName}] Cannot stream results - missing engine or messageId`);
      return;
    }

    try {
      const streamMessage = MessageFormat.create(
        MessageActions.TRANSLATION_STREAM_UPDATE,
        {
          success: true,
          data: batchResults,
          originalData: originalBatch,
          batchIndex: batchIndex,
          provider: providerName,
          sourceLanguage,
          targetLanguage,
          timestamp: Date.now()
        },
        'background-streaming',
        messageId
      );

      const senderInfo = engine.getStreamingSender?.(messageId);
      if (senderInfo && senderInfo.tab?.id) {
        await browser.tabs.sendMessage(senderInfo.tab.id, streamMessage);
        logger.debug(`[${providerName}] Stream update sent to tab ${senderInfo.tab.id} for batch ${batchIndex}`);
      }
    } catch (error) {
      logger.error(`[${providerName}] Failed to stream batch results:`, error);
    }
  },

  /**
   * Send streaming end notification
   */
  async sendStreamEnd(providerName, messageId, engine, options = {}) {
    if (!engine || !messageId) return;

    try {
      const streamEndMessage = MessageFormat.create(
        MessageActions.TRANSLATION_STREAM_END,
        {
          success: !options.error,
          completed: true,
          error: options.error ? {
            message: options.error.message || 'Translation failed',
            type: options.error.type || matchErrorToType(options.error) || 'TRANSLATION_ERROR'
          } : null,
          provider: providerName,
          targetLanguage: options.targetLanguage,
          timestamp: Date.now()
        },
        'background-streaming',
        messageId
      );

      const senderInfo = engine.getStreamingSender?.(messageId);
      if (senderInfo && senderInfo.tab?.id) {
        await browser.tabs.sendMessage(senderInfo.tab.id, streamEndMessage);
        logger.debug(`[${providerName}] Stream end sent to tab ${senderInfo.tab.id}`);
      }
    } catch (error) {
      logger.error(`[${providerName}] Failed to send stream end:`, error);
    }
  },

  /**
   * Send error stream message to content script
   */
  async streamErrorResults(providerName, error, batchIndex, messageId, engine) {
    if (!engine || !messageId) return;
    try {
      const streamErrorMessage = MessageFormat.create(
        MessageActions.TRANSLATION_STREAM_UPDATE,
        {
          success: false,
          error: {
            message: error.message || 'Translation failed',
            type: error.type || matchErrorToType(error) || 'TRANSLATION_ERROR'
          },
          batchIndex: batchIndex,
          provider: providerName,
          timestamp: Date.now()
        },
        'background-streaming',
        messageId
      );
      const senderInfo = engine.getStreamingSender?.(messageId);
      if (senderInfo && senderInfo.tab?.id) {
        await browser.tabs.sendMessage(senderInfo.tab.id, streamErrorMessage);
        logger.debug(`[${providerName}] Stream error sent to tab ${senderInfo.tab.id}`);
      }
    } catch (sendError) {
      logger.error(`[${providerName}] Failed to send stream error:`, sendError);
    }
  },

  /**
   * Stream fallback result to content script
   */
  async streamFallbackResult(providerName, result, original, segmentIndex, messageId, engine, sourceLanguage = null, targetLanguage = null) {
    try {
      const streamMessage = MessageFormat.create(
        MessageActions.TRANSLATION_STREAM_UPDATE,
        {
          success: true,
          data: result,
          originalData: original,
          batchIndex: segmentIndex,
          provider: providerName,
          sourceLanguage,
          targetLanguage,
          timestamp: Date.now()
        },
        'background-streaming',
        messageId
      );

      const senderInfo = engine.getStreamingSender?.(messageId);
      if (senderInfo && senderInfo.tab?.id) {
        await browser.tabs.sendMessage(senderInfo.tab.id, streamMessage);
        logger.debug(`[${providerName}] Fallback result streamed for segment ${segmentIndex + 1}`);
      }
    } catch (error) {
      logger.error(`[${providerName}] Failed to stream fallback result for segment ${segmentIndex + 1}:`, error);
    }
  }
};
