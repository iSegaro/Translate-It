/**
 * Optimized JSON Handler - Specialized strategy for Select Element translation
 * Manages complex batching, adaptive delays, and real-time result streaming.
 */

import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageFormat } from '@/shared/messaging/core/MessagingCore.js';
import { matchErrorToType, isFatalError } from '@/shared/error-management/ErrorMatcher.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ComplexityAnalyzer } from '../utils/ComplexityAnalyzer.js';
import { TranslationBatcher } from '../utils/TranslationBatcher.js';
import browser from 'webextension-polyfill';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'OptimizedJsonHandler');

export class OptimizedJsonHandler {
  /**
   * Executes optimized translation for JSON payloads (Select Element mode).
   * Orchestrates the entire streaming process with adaptive error handling.
   * 
   * @param {object} engine - Reference to the translation engine
   * @param {object} data - The translation request data
   * @param {object} providerInstance - The initialized provider instance
   * @param {string} originalSourceLang - Global source language from settings
   * @param {string} originalTargetLang - Global target language from settings
   * @param {string} messageId - The request ID
   * @param {number} tabId - The ID of the tab to stream results back to
   * @returns {Promise<object>} Status object (success and streaming flag)
   */
  async execute(engine, data, providerInstance, originalSourceLang, originalTargetLang, messageId = null, tabId = null) {
    const { text, provider, sourceLanguage, targetLanguage, mode, contextMetadata, contextSummary } = data;
    
    // 1. Parse and validate input
    let originalJson;
    try {
      originalJson = JSON.parse(text);
    } catch {
      throw new Error('Invalid JSON format for SelectElement mode');
    }

    if (!Array.isArray(originalJson)) {
      throw new Error('SelectElement JSON must be an array');
    }

    const segments = originalJson;

    // 2. Prepare for batching
    const { rateLimitManager } = await import("@/features/translation/core/RateLimitManager.js");
    rateLimitManager.reloadConfigurations();
    
    const OPTIMAL_BATCH_SIZE = 25; 
    const batches = TranslationBatcher.createIntelligentBatches(segments, OPTIMAL_BATCH_SIZE);

    // 3. Resolve actual languages (handling swapping logic)
    const firstItem = segments[0];
    const firstText = typeof firstItem === 'object' ? (firstItem.t || firstItem.text || '') : (firstItem || '');
    const { LanguageSwappingService } = await import("@/features/translation/providers/LanguageSwappingService.js");
    
    const [actualSource, actualTarget] = await LanguageSwappingService.applyLanguageSwapping(
      firstText, sourceLanguage, targetLanguage, data.originalSourceLang || sourceLanguage, data.originalTargetLang || targetLanguage,
      { providerName: provider }
    );

    const effectiveSource = actualSource;
    const effectiveTarget = actualTarget;
    const sessionId = data.sessionId || messageId; 

    // 4. Start Background Processing Loop (Silent)
    (async () => {
      let hasErrors = false;
      let lastError = null;
      let consecutiveFailures = 0;
      const MAX_CONSECUTIVE_FAILURES = 3;
      let adaptiveDelay = 0;

      try {
        for (let i = 0; i < batches.length; i++) {
          // Check for cancellation
          if (engine.isCancelled(messageId)) {
            logger.info(`[JsonHandler] Translation cancelled for messageId: ${messageId}`);
            break;
          }

          const batch = batches[i];
          const batchSize = batch.length;
          const batchComplexity = ComplexityAnalyzer.calculateBatchComplexity(batch);
          const batchCharCount = batch.reduce((sum, item) => {
            const text = typeof item === 'object' ? (item.t || item.text || '') : (item || '');
            return sum + (text?.length || 0);
          }, 0);
          
          const abortController = engine.lifecycleRegistry.getAbortController(messageId);
          if (abortController) {
            abortController.sessionId = sessionId;
          }

          // A. Apply intelligent delay
          if (i > 0) {
            const baseDelay = Math.min(2000 + (batchSize * 150), 5000); 
            const complexityMultiplier = batchComplexity > 50 ? 1.5 : 1.0;
            const failureMultiplier = Math.pow(2, consecutiveFailures);
            
            adaptiveDelay = Math.min(
              baseDelay * complexityMultiplier * failureMultiplier + adaptiveDelay * 0.3,
              20000 
            );
            
            logger.debug(`[JsonHandler] Intelligent delay: ${Math.round(adaptiveDelay)}ms (batch: ${i + 1}/${batches.length}, complexity: ${batchComplexity})`);
            await new Promise(resolve => setTimeout(resolve, adaptiveDelay));
          }
          
          // B. Execute batch translation
          try {
            const { statsManager } = await import('@/features/translation/core/TranslationStatsManager.js');
            const statsBefore = statsManager.getSessionSummary(sessionId);
            const charsBefore = statsBefore ? statsBefore.chars : 0;

            const batchResult = await rateLimitManager.executeWithRateLimit(
              provider,
              () => this._performBatchCall(providerInstance, batch, effectiveSource, effectiveTarget, mode, abortController, messageId, sessionId, contextMetadata, contextSummary),
              `batch-${i + 1}/${batches.length}`,
              mode
            );

            // Success - reduce delay pressure
            consecutiveFailures = 0;
            adaptiveDelay = Math.max(adaptiveDelay * 0.8, 0);

            // Update stats
            const statsAfter = statsManager.getSessionSummary(sessionId);
            const batchNetworkChars = statsAfter ? (statsAfter.chars - charsBefore) : batchCharCount;
            statsManager.printSummary(sessionId, { status: 'Batch', batchChars: batchNetworkChars, batchOriginalChars: batchCharCount });

            // C. Map and Stream results back to tab
            const mappedResults = this._mapResults(batch, batchResult);
            this._sendStreamUpdate(tabId, messageId, mappedResults, batch, i, provider, effectiveSource, effectiveTarget, mode);

          } catch (error) {
            // D. Error handling and retry logic
            consecutiveFailures++;
            hasErrors = true;
            lastError = error;
            const errorType = error.type || matchErrorToType(error);

            if (errorType !== ErrorTypes.USER_CANCELLED) {
              await ErrorHandler.getInstance().handle(error, {
                context: 'JsonHandler.batch',
                showToast: false,
                metadata: { batchIndex: i + 1, consecutiveFailures, providerName: provider }
              });
            }
            
            this._sendStreamError(tabId, messageId, error, i, batch);
            
            if (isFatalError(error) || errorType === 'CIRCUIT_BREAKER_OPEN' || consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
              logger.error(`[JsonHandler] Stopping due to fatal error or failure threshold: ${errorType}`);
              break;
            }
          }
        }
      } catch (error) {
        logger.error(`[JsonHandler] Critical error in processing loop:`, error);
      } finally {
        // E. Cleanup and Finalize session
        this._finalizeSession(sessionId, messageId, tabId, hasErrors, lastError, effectiveTarget);
      }
    })();

    return { success: true, streaming: true };
  }

  /**
   * Internal helper to perform the actual provider call.
   * @private
   */
  async _performBatchCall(providerInstance, batch, source, target, mode, abortController, messageId, sessionId, contextMetadata, contextSummary) {
    const providerClass = providerInstance?.constructor;
    const isAIProvider = providerClass?.type === "ai" || typeof providerInstance?._translateBatch === 'function';

    if (isAIProvider) {
      return providerInstance._translateBatch(
        batch, source, target, mode, abortController, null, messageId, sessionId,
        { ...contextMetadata, contextSummary }
      );
    } else if (typeof providerInstance?._translateChunk === 'function') {
      const chunkTexts = batch.map(item => typeof item === 'object' ? (item.t || item.text || '') : (item || ''));
      return providerInstance._translateChunk(
        chunkTexts, source, target, mode, abortController, 0, batch.length, 1, 1,
        { sessionId, contextSummary }
      );
    } else {
      throw new Error(`Provider method not available for optimized translation`);
    }
  }

  /**
   * Map raw translation results back to the original objects.
   * @private
   */
  _mapResults(originalBatch, translatedResults) {
    let results = Array.isArray(translatedResults) ? translatedResults : [String(translatedResults)];
    
    return results.map((text, idx) => {
      const translatedContent = text?.text || text;
      if (typeof originalBatch[idx] === 'object') {
        return { ...originalBatch[idx], t: translatedContent, text: translatedContent };
      }
      return translatedContent;
    });
  }

  /**
   * Send progress update to the source tab.
   * @private
   */
  _sendStreamUpdate(tabId, messageId, mappedResults, originalBatch, batchIndex, provider, source, target, mode) {
    if (!tabId) return;
    
    const message = MessageFormat.create(
      MessageActions.TRANSLATION_STREAM_UPDATE,
      {
        success: true,
        data: mappedResults,
        originalData: originalBatch,
        batchIndex,
        provider,
        sourceLanguage: source,
        targetLanguage: target,
        timestamp: Date.now(),
        translationMode: mode,
      },
      'background-stream',
      messageId
    );
    
    browser.tabs.sendMessage(tabId, message).catch(err => logger.debug('Stream update failed (tab closed?):', err.message));
  }

  /**
   * Send error update for a specific batch.
   * @private
   */
  _sendStreamError(tabId, messageId, error, batchIndex, originalBatch) {
    if (!tabId) return;
    
    const message = MessageFormat.create(
      MessageActions.TRANSLATION_STREAM_UPDATE,
      {
        success: false,
        error: { message: error.message, type: error.type || matchErrorToType(error) },
        batchIndex,
        originalData: originalBatch,
      },
      'background-stream',
      messageId
    );
    
    browser.tabs.sendMessage(tabId, message).catch(() => {});
  }

  /**
   * Clean up and send the final STREAM_END message.
   * @private
   */
  async _finalizeSession(sessionId, messageId, tabId, hasErrors, lastError, targetLanguage) {
    try {
      const { statsManager } = await import('@/features/translation/core/TranslationStatsManager.js');
      statsManager.printSummary(sessionId, { status: 'Streaming', success: !hasErrors, clear: true });
    } catch (e) { /* ignore */ }

    if (!tabId) return;

    const endMessage = MessageFormat.create(
      MessageActions.TRANSLATION_STREAM_END,
      { 
        success: !hasErrors,
        error: hasErrors ? { 
          message: lastError?.message || 'Translation failed', 
          type: lastError?.type || matchErrorToType(lastError) || 'TRANSLATION_ERROR'
        } : null,
        targetLanguage
      },
      'background-stream',
      messageId
    );
    
    browser.tabs.sendMessage(tabId, endMessage).catch(() => {});
  }
}
