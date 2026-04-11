/**
 * Optimized JSON Handler - Specialized strategy for Select Element translation
 * Manages complex batching, adaptive delays, and real-time result streaming.
 */

import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import { ResponseFormat, TRANSLATION_CONSTANTS } from "@/shared/config/translationConstants.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { isFatalError } from "@/shared/error-management/ErrorMatcher.js";
import { TranslationMode } from "@/shared/config/config.js";
import browser from "webextension-polyfill";
import { statsManager } from '@/features/translation/core/TranslationStatsManager.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'OptimizedJsonHandler');

export class OptimizedJsonHandler {
  /**
   * Orchestrates the optimized translation process.
   */
  async execute(engine, data, providerInstance, originalSourceLang, originalTargetLang, messageId, sender) {
    const { text, sourceLanguage, targetLanguage, mode, options } = data;
    const sessionId = data.sessionId || messageId;
    const tabId = sender?.tab?.id;
    const abortController = engine.lifecycleRegistry.registerRequest(messageId, typeof text === 'string' ? text.substring(0, 100) : '');

    let hasErrors = false;
    let lastError = null;

    try {
      const segments = typeof text === 'string' ? JSON.parse(text) : text;
      const providerConfig = (await import('@/features/translation/core/ProviderConfigurations.js')).getProviderConfiguration(providerInstance.providerName);
      
      const batches = engine.createIntelligentBatches(
        segments, 
        providerConfig?.batching?.optimalSize || 25, 
        providerConfig?.batching?.maxChars || 5000
      );

      logger.debug(`[JsonHandler] Executing ${batches.length} batches for ${segments.length} segments`);

      for (let i = 0; i < batches.length; i++) {
        if (engine.isCancelled(messageId)) break;

        const batch = batches[i];
        
        // Intelligent delay between batches
        if (i > 0) {
          const delay = this._calculateDelay(batch, i, batches.length, providerConfig);
          if (delay > 0) {
            logger.debug(`[JsonHandler] Intelligent delay: ${delay}ms (batch: ${i + 1}/${batches.length})`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }

        try {
          const statsBefore = statsManager.getSessionSummary(sessionId);
          const charsBefore = statsBefore ? statsBefore.chars : 0;
          const originalCharsBefore = statsBefore ? statsBefore.originalChars : 0;

          const translatedBatch = await this._performBatchCall(
            providerInstance, 
            batch, 
            sourceLanguage, 
            targetLanguage, 
            mode, 
            abortController, 
            messageId, 
            sessionId, 
            options?.contextMetadata, 
            options?.contextSummary,
            engine,
            sender
          );

          const mappedResults = this._mapResults(batch, translatedBatch);
          
          // Stream results back to the tab
          await this._streamResults(tabId, messageId, mappedResults, i, batches.length, targetLanguage);
          
          // Log batch statistics
          const statsAfter = statsManager.getSessionSummary(sessionId);
          if (statsAfter) {
            statsManager.printSummary(sessionId, {
              status: 'Batch',
              batchChars: statsAfter.chars - charsBefore,
              batchOriginalChars: statsAfter.originalChars - originalCharsBefore
            });
          }
          
        } catch (batchError) {
          logger.error(`[JsonHandler] Batch ${i + 1} failed:`, batchError.message);
          hasErrors = true;
          lastError = batchError;

          // Fallback: stream original text for this batch
          await this._streamResults(tabId, messageId, batch, i, batches.length, targetLanguage);
          
          // If the very first batch fails or it's a fatal error, we stop and report
          if (i === 0 || isFatalError(batchError)) {
            await this._sendStreamError(tabId, messageId, batchError, targetLanguage);
            throw batchError;
          }
        }
      }

      // Tactical delay to ensure the last data packet is processed before the end signal
      if (batches.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Notify the UI that streaming has ended
      if (hasErrors) {
        await this._sendStreamError(tabId, messageId, lastError, targetLanguage);
      } else {
        await this._sendStreamEnd(tabId, messageId, providerInstance.providerName, targetLanguage);
      }

      // Log session summary
      statsManager.printSummary(sessionId, {
        status: 'Streaming',
        success: !hasErrors,
        clear: true
      });

      return { success: !hasErrors, streaming: true, error: lastError };
    } finally {
      engine.lifecycleRegistry.unregisterRequest(messageId);
    }
  }

  /**
   * Internal helper to perform the actual provider call.
   * @private
   */
  async _performBatchCall(providerInstance, batch, source, target, mode, abortController, messageId, sessionId, contextMetadata, contextSummary, engine, sender) {
    const isArrayInput = Array.isArray(batch);
    
    // For Select Element, we pass the array of texts
    const textsToTranslate = isArrayInput 
      ? batch.map(item => typeof item === 'object' ? (item.t || item.text || '') : (item || ''))
      : (typeof batch === 'object' ? (batch.t || batch.text || '') : (batch || ''));

    return await providerInstance.translate(
      textsToTranslate,
      source,
      target,
      {
        mode,
        abortController,
        messageId,
        sessionId,
        contextMetadata,
        contextSummary,
        engine,
        sender,
        priority: 'high',
        rawJsonPayload: true,
        expectedFormat: ResponseFormat.JSON_OBJECT // Explicit contract enforcement
      }
    );
  }

  /**
   * Map raw translation results back to the original objects.
   * @private
   */
  _mapResults(originalBatch, translatedResults) {
    // Ensure we have an array of results
    let results = Array.isArray(translatedResults) ? translatedResults : [translatedResults];
    
    // If results length doesn't match original batch, it means splitting failed or wasn't needed
    if (results.length !== originalBatch.length && originalBatch.length > 1) {
      logger.warn(`[JsonHandler] Result count mismatch: ${results.length} vs ${originalBatch.length}`);
    }

    return originalBatch.map((item, idx) => {
      const translatedContent = results[idx] !== undefined ? results[idx] : "";
      if (typeof item === 'object') {
        return { ...item, t: translatedContent, text: translatedContent };
      }
      return translatedContent;
    });
  }

  /**
   * Calculate adaptive delay between batches to respect rate limits.
   * @private
   */
  _calculateDelay(batch, index, total, config) {
    if (!config?.batching?.delayBetweenRequests) return 0;
    
    const baseDelay = config.batching.delayBetweenRequests;
    const batchComplexity = batch.reduce((sum, item) => sum + (typeof item === 'object' ? (item.t || item.text || '').length : item?.length || 0), 0);
    
    // Increase delay for complex batches or AI providers
    if (batchComplexity > 1000) return baseDelay * 1.5;
    return baseDelay;
  }

  /**
   * Send streamed results back to the requesting tab.
   * @private
   */
  async _streamResults(tabId, messageId, translatedData, batchIndex, totalBatches, targetLanguage) {
    if (!tabId) return;

    // USE TRANSLATION_STREAM_UPDATE for packets to trigger onStreamUpdate callback
    const streamMessage = {
      action: MessageActions.TRANSLATION_STREAM_UPDATE,
      messageId: messageId,
      data: {
        success: true,
        data: translatedData,
        batchIndex,
        totalBatches,
        isComplete: batchIndex === totalBatches - 1,
        targetLanguage,
        translationMode: TranslationMode.Select_Element,
        timestamp: Date.now()
      }
    };

    try {
      await browser.tabs.sendMessage(tabId, streamMessage);
    } catch (err) {
      logger.warn(`[JsonHandler] Failed to stream to tab ${tabId}:`, err.message);
    }
  }

  /**
   * Notify the UI that the streaming session has completed.
   * @private
   */
  async _sendStreamEnd(tabId, messageId, providerName, targetLanguage) {
    if (!tabId) return;

    const endMessage = {
      action: MessageActions.TRANSLATION_STREAM_END,
      messageId,
      data: {
        success: true,
        completed: true,
        provider: providerName,
        targetLanguage,
        translationMode: TranslationMode.Select_Element,
        timestamp: Date.now()
      }
    };

    try {
      await browser.tabs.sendMessage(tabId, endMessage);
    } catch (e) {
      logger.debug(`[JsonHandler] Failed to send stream end:`, e.message);
    }
  }

  /**
   * Report a fatal error to the UI and end the stream.
   * @private
   */
  async _sendStreamError(tabId, messageId, lastError, targetLanguage) {
    if (!tabId) return;

    const endMessage = {
      action: MessageActions.TRANSLATION_STREAM_END,
      messageId,
      data: {
        success: false,
        error: lastError ? {
          message: lastError.message || String(lastError),
          type: lastError.type || 'TRANSLATION_ERROR'
        } : null,
        targetLanguage,
        translationMode: TranslationMode.Select_Element,
        timestamp: Date.now()
      }
    };
    
    try {
      await browser.tabs.sendMessage(tabId, endMessage);
    } catch (e) {}
  }
}
