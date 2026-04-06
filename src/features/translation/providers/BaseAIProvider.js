/**
 * Base AI Provider - Enhanced base class for all AI-powered translation providers
 * Provides streaming support, smart batching, and provider-specific optimizations
 */

import { BaseProvider } from "@/features/translation/providers/BaseProvider.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { createTimeoutPromise, calculateBatchTimeout } from '@/features/translation/utils/timeoutCalculator.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { matchErrorToType, isFatalError } from '@/shared/error-management/ErrorMatcher.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { getLanguageNameFromCode } from '@/shared/config/languageConstants.js';
import { AUTO_DETECT_VALUE } from '@/shared/config/constants.js';
import { AIResponseParser } from "./utils/AIResponseParser.js";
import { AIConversationHelper } from "./utils/AIConversationHelper.js";
import { AITextProcessor } from "./utils/AITextProcessor.js";
import { AIStreamManager } from "./utils/AIStreamManager.js";

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'BaseAIProvider');

export class BaseAIProvider extends BaseProvider {
  // Provider capabilities - to be overridden by subclasses
  static supportsStreaming = false;
  static preferredBatchStrategy = 'smart'; 
  static optimalBatchSize = 15;
  static maxComplexity = 300;
  static supportsImageTranslation = false;
  
  // Batch processing strategy - to be overridden by subclasses
  static batchStrategy = 'json'; 
  static errorHandlingLevel = 'standard'; 

  constructor(providerName) {
    super(providerName);
  }

  /**
   * Convert language to AI provider format (full language names)
   */
  _getLangCode(lang) {
    if (!lang) return AUTO_DETECT_VALUE;
    const languageName = getLanguageNameFromCode(lang);
    logger.debug(`[${this.providerName}] Language conversion: "${lang}" → "${languageName}"`);
    return languageName || AUTO_DETECT_VALUE;
  }

  /**
   * Enhanced batch translation with streaming support
   */
  async _batchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, contextMetadata = null) {
    if (this.constructor.supportsStreaming && this._shouldUseStreaming(texts, messageId, engine)) {
      return this._streamingBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, contextMetadata);
    }
    return this._traditionalBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, contextMetadata);
  }

  /**
   * Determine if streaming should be used for this request
   */
  _shouldUseStreaming(texts, messageId, engine) {
    return this.constructor.supportsStreaming && 
           messageId && 
           engine && 
           (texts.length > 1 || AITextProcessor.getTotalComplexity(texts) > 100);
  }

  /**
   * Streaming batch translation with real-time results
   */
  async _streamingBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, contextMetadata = null) {
    const startTime = Date.now();
    const sessionId = messageId; 
    const totalChars = texts.reduce((sum, text) => sum + (typeof text === 'object' ? (text.t || text.text || '').length : text?.length || 0), 0);
    logger.debug(`[${this.providerName}] Starting streaming translation for ${texts.length} segments (${totalChars} chars, mode: ${translateMode})`);

    const batches = this._createOptimalBatches(texts, translateMode);
    const allResults = [];
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      if ((abortController && abortController.signal.aborted) || (engine && engine.isCancelled(messageId))) {
        const error = new Error('Translation cancelled by user');
        error.type = ErrorTypes.USER_CANCELLED;
        throw error;
      }

      const batch = batches[batchIndex];
      logger.debug(`[${this.providerName}] Processing streaming batch ${batchIndex + 1}/${batches.length} (${batch.length} segments)`);

      try {
        const { rateLimitManager } = await import("@/features/translation/core/RateLimitManager.js");
        
        const batchResults = await Promise.race([
          rateLimitManager.executeWithRateLimit(
            this.providerName,
            () => this._translateBatch(batch, sourceLang, targetLang, translateMode, abortController, engine, messageId, sessionId, contextMetadata),
            `streaming-batch-${batchIndex + 1}/${batches.length}`,
            translateMode
          ),
          this._createBatchTimeoutPromise(batch.length)
        ]);

        allResults.push(...batchResults);

        await AIStreamManager.streamBatchResults(
          this.providerName,
          batchResults,
          batch,
          batchIndex,
          messageId,
          engine,
          sourceLang,
          targetLang
        );
      } catch (error) {
        const errorType = matchErrorToType(error);
        if (errorType === ErrorTypes.USER_CANCELLED) {
          logger.debug(`[${this.providerName}] Streaming batch ${batchIndex + 1} cancelled:`, error);
        } else {
          logger.error(`[${this.providerName}] Streaming batch ${batchIndex + 1} failed:`, error);
        }
        
        await AIStreamManager.streamErrorResults(this.providerName, error, batchIndex, messageId, engine);
        await AIStreamManager.sendStreamEnd(this.providerName, messageId, engine, { error: { message: error.message, type: errorType } });
        throw error;
      }
    }

    await AIStreamManager.sendStreamEnd(this.providerName, messageId, engine, { targetLanguage: targetLang });

    const totalTime = Date.now() - startTime;
    if (translateMode === 'select_element') {
      const { rateLimitManager } = await import("@/features/translation/core/RateLimitManager.js");
      const perfStats = rateLimitManager.getPerformanceStats(this.providerName);
      logger.info(`[${this.providerName}] Select Element performance: ${texts.length} segments, ${totalChars} chars, ${batches.length} batches, ${totalTime}ms, ${(totalChars / totalTime * 1000).toFixed(1)} chars/s`);
    }

    return allResults;
  }

  /**
   * Traditional sequential batch processing (fallback)
   */
  async _traditionalBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, contextMetadata = null) {
    const { rateLimitManager } = await import("@/features/translation/core/RateLimitManager.js");
    const results = [];
    const sessionId = messageId; 
    
    for (let i = 0; i < texts.length; i++) {
      if ((abortController && abortController.signal.aborted) || (engine && engine.isCancelled(messageId))) {
        const error = new Error('Translation cancelled by user');
        error.type = ErrorTypes.USER_CANCELLED;
        throw error;
      }
      
      try {
        const content = typeof texts[i] === 'object' ? (texts[i].t || texts[i].text || '') : texts[i];
        const result = await rateLimitManager.executeWithRateLimit(
          this.providerName,
          () => this._translateSingle(content, sourceLang, targetLang, translateMode, abortController, false, sessionId, content?.length || 0, contextMetadata),
          `segment-${i + 1}/${texts.length}`,
          translateMode
        );
        results.push(result || content);
      } catch (error) {
        throw error;
      }
    }
    
    return results;
  }

  /**
   * Create optimal batches based on provider strategy
   */
  _createOptimalBatches(texts, translateMode = null) {
    return AITextProcessor.createOptimalBatches(texts, this.providerName, translateMode, {
      strategy: this.constructor.preferredBatchStrategy,
      optimalSize: this.constructor.optimalBatchSize,
      maxComplexity: this.constructor.maxComplexity
    });
  }

  /**
   * Create a timeout promise for batch processing
   */
  _createBatchTimeoutPromise(batchSize) {
    const timeoutMs = calculateBatchTimeout(batchSize, this.providerName);
    return createTimeoutPromise(timeoutMs, `Rate limit execution`);
  }

  /**
   * Abstract method to translate a batch
   */
  async _translateBatch(batch, sourceLang, targetLang, translateMode, abortController, engine = null, messageId = null, sessionId = null, contextMetadata = null) {
    const batchStrategy = this.constructor.batchStrategy || 'single';
    
    try {
      if (batchStrategy === 'json') {
        const jsonInput = batch.map((item, i) => {
          if (typeof item === 'object') {
            return { id: item.i || item.uid || i, text: item.t || item.text, role: item.r || item.role };
          }
          return { id: i, text: item };
        });
        const batchText = JSON.stringify(jsonInput, null, 2);
        const originalChars = batch.reduce((sum, item) => sum + (typeof item === 'object' ? (item.t || item.text || '').length : item?.length || 0), 0);
        
        const result = await this._translateSingle(batchText, sourceLang, targetLang, translateMode, abortController, true, sessionId, originalChars, contextMetadata);
        const parsedResults = this._parseBatchResult(result, batch.length, batch);
        if (parsedResults.length === batch.length) return parsedResults;
        throw new Error('JSON batch result count mismatch');
      }
      
      if (batch.length === 1) {
        const content = typeof batch[0] === 'object' ? (batch[0].t || batch[0].text || '') : batch[0];
        return [await this._translateSingle(content, sourceLang, targetLang, translateMode, abortController, false, sessionId, content?.length || 0, contextMetadata)];
      }

      throw new Error(`Unsupported batch strategy: ${batchStrategy}`);
    } catch (error) {
      const isFatal = isFatalError(error) || [429, 401, 403, 402, 404].includes(error.statusCode);
      if (isFatal) throw error;
      
      logger.warn(`[${this.providerName}] Batch failed, falling back to individual requests:`, error.message);
      return this._fallbackSingleRequests(batch, sourceLang, targetLang, translateMode, engine, messageId, abortController, sessionId, contextMetadata);
    }
  }

  /**
   * Fallback to individual requests
   */
  async _fallbackSingleRequests(batch, sourceLang, targetLang, translateMode, engine, messageId, abortController, sessionId = null, contextMetadata = null) {
    const results = [];
    for (let i = 0; i < batch.length; i++) {
      if (abortController && abortController.signal.aborted) {
        const cancelError = new Error('Translation cancelled');
        cancelError.name = 'AbortError';
        throw cancelError;
      }
      
      try {
        const content = typeof batch[i] === 'object' ? (batch[i].t || batch[i].text || '') : batch[i];
        if (i > 0) await new Promise(resolve => setTimeout(resolve, 3000));
        
        const result = await Promise.race([
          this._translateSingle(content, sourceLang, targetLang, translateMode, abortController, false, sessionId, content?.length || 0, contextMetadata),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`Segment timeout`)), 8000))
        ]);
        
        const translatedResult = result || content;
        results.push(translatedResult);
        if (engine && messageId) {
          await AIStreamManager.streamFallbackResult(this.providerName, [translatedResult], [batch[i]], i, messageId, engine, sourceLang, targetLang);
        }
      } catch (error) {
        throw error;
      }
    }
    return results;
  }

  /**
   * Helper methods delegated to specialized utilities
   */
  async _isFirstTurn(sessionId) { return AIConversationHelper.isFirstTurn(sessionId); }
  async _getConversationHistory(sessionId, translateMode = '') { return AIConversationHelper.getConversationHistory(sessionId, translateMode); }
  async _preparePromptAndText(text, sourceLang, targetLang, translateMode, sessionId = null, isBatch = false, contextMetadata = null) {
    return AIConversationHelper.preparePromptAndText(text, sourceLang, targetLang, translateMode, this.constructor.type, sessionId, isBatch, contextMetadata);
  }
  async _getConversationMessages(sessionId, providerName, currentText, systemPrompt, translateMode = '') {
    return AIConversationHelper.getConversationMessages(sessionId, providerName, currentText, systemPrompt, translateMode);
  }
  async _updateSessionHistory(sessionId, userContent, assistantContent) { return AIConversationHelper.updateSessionHistory(sessionId, userContent, assistantContent); }
  
  _cleanAIResponse(result) { return AIResponseParser.cleanAIResponse(result); }
  _parseBatchResult(result, expectedCount, originalBatch) { return AIResponseParser.parseBatchResult(result, expectedCount, originalBatch, this.providerName); }
  _fallbackParsing(result, expectedCount, originalBatch) { return AIResponseParser.fallbackParsing(result, expectedCount, originalBatch); }

  _hasPlaceholders(texts) { return AITextProcessor.hasPlaceholders(texts); }
  _getTotalComplexity(texts) { return AITextProcessor.getTotalComplexity(texts); }
  _calculateTextComplexity(text) { return AITextProcessor.calculateTextComplexity(text); }
  splitIntoSentences(text, sourceLanguage = 'en') { return AITextProcessor.splitIntoSentences(text, sourceLanguage); }
  smartChunkWithPlaceholders(text, limit, sourceLanguage = 'en') { return AITextProcessor.smartChunkWithPlaceholders(text, limit, sourceLanguage); }

  /**
   * Enhanced API call execution with centralized error handling
   */
  async _executeWithErrorHandling(params) {
    try {
      return await this._executeApiCall(params);
    } catch (error) {
      const errorType = matchErrorToType(error);
      if (errorType === ErrorTypes.USER_CANCELLED || errorType === ErrorTypes.TRANSLATION_CANCELLED) {
        throw error;
      }
      await ErrorHandler.getInstance().handle(error, { context: params.context || `${this.providerName.toLowerCase()}-translation` });
      throw error;
    }
  }

  _calculateAIPayloadChars(messages) {
    if (!messages) return 0;
    if (typeof messages === 'string') return messages.length;
    if (Array.isArray(messages)) {
      return messages.reduce((sum, msg) => {
        if (msg && msg.content) return sum + (typeof msg.content === 'string' ? msg.content.length : JSON.stringify(msg.content).length);
        if (msg && Array.isArray(msg.parts)) return sum + msg.parts.reduce((pSum, part) => pSum + (part.text?.length || 0), 0);
        return sum;
      }, 0);
    }
    try { return JSON.stringify(messages).length; } catch { return 0; }
  }
  
  async _translateSingle() { throw new Error(`_translateSingle must be implemented by ${this.constructor.name}`); }
  async _getConfig() { throw new Error(`_getConfig method must be implemented by ${this.constructor.name}`); }
}
