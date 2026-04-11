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
          await this._streamResults(tabId, messageId, mappedResults, i, batches.length, targetLanguage);
          
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
          await this._streamResults(tabId, messageId, batch, i, batches.length, targetLanguage);
          if (i === 0 || isFatalError(batchError)) {
            await this._sendStreamError(tabId, messageId, batchError, targetLanguage);
            throw batchError;
          }
        }
      }

      if (batches.length > 0) await new Promise(resolve => setTimeout(resolve, 50));

      if (hasErrors) {
        await this._sendStreamError(tabId, messageId, lastError, targetLanguage);
      } else {
        await this._sendStreamEnd(tabId, messageId, providerInstance.providerName, targetLanguage);
      }

      statsManager.printSummary(sessionId, { status: 'Streaming', success: !hasErrors, clear: true });
      return { success: !hasErrors, streaming: true, error: lastError };
    } finally {
      engine.lifecycleRegistry.unregisterRequest(messageId);
    }
  }

  async _performBatchCall(providerInstance, batch, source, target, mode, abortController, messageId, sessionId, contextMetadata, contextSummary, engine, sender) {
    const isArrayInput = Array.isArray(batch);
    const textsToTranslate = isArrayInput 
      ? batch.map(item => typeof item === 'object' ? (item.t || item.text || '') : (item || ''))
      : (typeof batch === 'object' ? (batch.t || batch.text || '') : (batch || ''));

    // Strategy 1: AI Providers with JSON support
    if (providerInstance.constructor.batchStrategy === 'json' || providerInstance.constructor.isAI) {
      return await providerInstance.translate(
        textsToTranslate,
        source,
        target,
        {
          mode, abortController, messageId, sessionId, contextMetadata, contextSummary,
          engine, sender, priority: 'high', rawJsonPayload: true,
          expectedFormat: ResponseFormat.JSON_OBJECT
        }
      );
    } 
    
    // Strategy 2: Traditional Providers (Edge, Google, etc.)
    const { TranslationSegmentMapper } = await import("@/utils/translation/TranslationSegmentMapper.js");
    const delimiter = TranslationSegmentMapper.STANDARD_DELIMITER;
    const joinedText = textsToTranslate.join(delimiter);

    const translatedJoined = await providerInstance.translate(
      joinedText,
      source,
      target,
      { ...arguments[9], mode, abortController, messageId, sessionId, rawJsonPayload: true, expectedFormat: ResponseFormat.STRING }
    );

    return TranslationSegmentMapper.mapTranslationToOriginalSegments(
      translatedJoined,
      textsToTranslate,
      delimiter,
      providerInstance.providerName
    );
  }

  _mapResults(originalBatch, translatedResults) {
    let results = Array.isArray(translatedResults) ? translatedResults : [translatedResults];
    
    if (results.length !== originalBatch.length && originalBatch.length > 1) {
      logger.warn(`[JsonHandler] Result count mismatch: ${results.length} vs ${originalBatch.length}`);
    }

    return originalBatch.map((item, idx) => {
      const translatedContent = results[idx] !== undefined ? results[idx] : (typeof item === 'object' ? (item.t || item.text) : item);
      if (typeof item === 'object') {
        return { ...item, t: translatedContent, text: translatedContent };
      }
      return translatedContent;
    });
  }

  _calculateDelay(batch, index, total, config) {
    if (!config?.batching?.delayBetweenRequests) return 0;
    const baseDelay = config.batching.delayBetweenRequests;
    const batchComplexity = batch.reduce((sum, item) => sum + (typeof item === 'object' ? (item.t || item.text || '').length : item?.length || 0), 0);
    if (batchComplexity > 1000) return baseDelay * 1.5;
    return baseDelay;
  }

  async _streamResults(tabId, messageId, translatedData, batchIndex, totalBatches, targetLanguage) {
    if (!tabId) return;
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
    } catch (e) {}
  }

  async _sendStreamError(tabId, messageId, lastError, targetLanguage) {
    if (!tabId) return;
    const endMessage = {
      action: MessageActions.TRANSLATION_STREAM_END,
      messageId,
      data: {
        success: false,
        error: lastError ? { message: lastError.message || String(lastError), type: lastError.type || 'TRANSLATION_ERROR' } : null,
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
