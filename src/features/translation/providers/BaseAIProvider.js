/**
 * Base AI Provider - Enhanced base class for all AI-powered translation providers
 * Provides streaming support, smart batching, and provider-specific optimizations
 */

import { BaseProvider } from "@/features/translation/providers/BaseProvider.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { createTimeoutPromise, calculateBatchTimeout } from '@/features/translation/utils/timeoutCalculator.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { MessageFormat } from '@/shared/messaging/core/MessagingCore.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import browser from 'webextension-polyfill';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'BaseAIProvider');

export class BaseAIProvider extends BaseProvider {
  // Provider capabilities - to be overridden by subclasses
  static supportsStreaming = false;
  static preferredBatchStrategy = 'smart'; // 'smart', 'fixed', 'single'
  static optimalBatchSize = 15;
  static maxComplexity = 300;
  static supportsImageTranslation = false;
  
  // Batch processing strategy - to be overridden by subclasses
  static batchStrategy = 'json'; // 'json' or 'numbered'
  static errorHandlingLevel = 'standard'; // 'standard' or 'advanced'

  constructor(providerName) {
    super(providerName);
  }

  /**
   * Enhanced batch translation with streaming support
   * @param {string[]} texts - Array of texts to translate
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language  
   * @param {string} translateMode - Translation mode
   * @param {object} engine - Translation engine instance
   * @param {string} messageId - Message ID for streaming
   * @param {AbortController} abortController - Cancellation controller
   * @returns {Promise<string[]>} - Translated texts
   */
  async _batchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController) {
    // Check if streaming is supported and beneficial
    if (this.constructor.supportsStreaming && this._shouldUseStreaming(texts, messageId, engine)) {
      return this._streamingBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController);
    }
    
    // Fall back to traditional batch processing
    return this._traditionalBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController);
  }

  /**
   * Determine if streaming should be used for this request
   * @param {string[]} texts - Texts to translate
   * @param {string} messageId - Message ID
   * @param {object} engine - Translation engine
   * @returns {boolean} - Whether to use streaming
   */
  _shouldUseStreaming(texts, messageId, engine) {
    // Only use streaming if:
    // 1. Provider supports it
    // 2. We have a valid messageId for streaming
    // 3. Engine is available for streaming notifications
    // 4. There are multiple segments or complex content
    return this.constructor.supportsStreaming && 
           messageId && 
           engine && 
           (texts.length > 1 || this._getTotalComplexity(texts) > 100);
  }

  /**
   * Streaming batch translation with real-time results
   * @param {string[]} texts - Texts to translate
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {object} engine - Translation engine instance
   * @param {string} messageId - Message ID for streaming
   * @param {AbortController} abortController - Cancellation controller
   * @returns {Promise<string[]>} - All translated texts
   */
  async _streamingBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController) {
    logger.debug(`[${this.providerName}] Starting streaming translation for ${texts.length} segments`);
    
    // Create optimal batches based on provider strategy
    const batches = this._createOptimalBatches(texts);
    const allResults = [];
    let processedCount = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      // Check for cancellation
      if (abortController && abortController.signal.aborted) {
        throw new Error('Translation cancelled by user');
      }
      if (engine && engine.isCancelled(messageId)) {
        throw new Error('Translation cancelled by user');
      }

      const batch = batches[batchIndex];
      logger.debug(`[${this.providerName}] Processing streaming batch ${batchIndex + 1}/${batches.length} (${batch.length} segments)`);

      try {
        // Get rate limit manager
        const { rateLimitManager } = await import("@/features/translation/core/RateLimitManager.js");
        
        // Translate this batch with timeout
        const batchResults = await Promise.race([
          rateLimitManager.executeWithRateLimit(
            this.providerName,
            () => this._translateBatch(batch, sourceLang, targetLang, translateMode, abortController, engine, messageId),
            `streaming-batch-${batchIndex + 1}/${batches.length}`
          ),
          this._createBatchTimeoutPromise(batch.length)
        ]);

        // Add results to collection
        allResults.push(...batchResults);

        // Stream results immediately to content script
        await this._streamBatchResults(
          batchResults,
          batch,
          batchIndex,
          messageId,
          engine
        );

        processedCount += batch.length;
        logger.debug(`[${this.providerName}] Streamed batch ${batchIndex + 1}/${batches.length}, total processed: ${processedCount}/${texts.length}`);

      } catch (error) {
        logger.error(`[${this.providerName}] Streaming batch ${batchIndex + 1} failed:`, error);
        
        // Send error stream message to content script
        await this._streamErrorResults(error, batchIndex, messageId, engine);
        
        // Send streaming end notification with error status
        await this._sendStreamEnd(messageId, engine, { error: true });
        
        // Stop streaming on error - don't continue with other batches
        throw error;
      }
    }

    // Send streaming end notification
    await this._sendStreamEnd(messageId, engine);
    
    logger.info(`[${this.providerName}] Streaming translation completed: ${allResults.length} segments`);
    return allResults;
  }

  /**
   * Traditional sequential batch processing (fallback)
   * @param {string[]} texts - Texts to translate
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {object} engine - Translation engine instance
   * @param {string} messageId - Message ID
   * @param {AbortController} abortController - Cancellation controller
   * @returns {Promise<string[]>} - Translated texts
   */
  async _traditionalBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController) {
    const { rateLimitManager } = await import("@/features/translation/core/RateLimitManager.js");
    const results = [];
    
    for (let i = 0; i < texts.length; i++) {
      if (abortController && abortController.signal.aborted) {
        throw new Error('Translation cancelled by user');
      }
      if (engine && engine.isCancelled(messageId)) {
        throw new Error('Translation cancelled by user');
      }
      
      try {
        const result = await rateLimitManager.executeWithRateLimit(
          this.providerName,
          () => this._translateSingle(texts[i], sourceLang, targetLang, translateMode, abortController),
          `segment-${i + 1}/${texts.length}`
        );
        results.push(result || texts[i]);
      } catch (error) {
        logger.warn(`[${this.providerName}] Segment ${i + 1} failed:`, error);
        // Instead of returning original text, throw the error to be handled properly
        throw error;
      }
    }
    
    return results;
  }

  /**
   * Create optimal batches based on provider strategy
   * @param {string[]} texts - Texts to translate
   * @returns {string[][]} - Array of batches
   */
  _createOptimalBatches(texts) {
    const strategy = this.constructor.preferredBatchStrategy;
    const optimalSize = this.constructor.optimalBatchSize;
    const maxComplexity = this.constructor.maxComplexity;
    
    switch (strategy) {
      case 'smart':
        return this._createSmartBatches(texts, optimalSize, maxComplexity);
      case 'single':
        return [texts]; // All texts in one batch
      case 'fixed':
      default:
        return this._createFixedBatches(texts, optimalSize);
    }
  }

  /**
   * Create smart batches based on complexity and segment count
   * @param {string[]} texts - Texts to translate
   * @param {number} optimalSize - Optimal batch size
   * @param {number} maxComplexity - Maximum complexity per batch
   * @returns {string[][]} - Array of batches
   */
  _createSmartBatches(texts, optimalSize, maxComplexity) {
    const totalSegments = texts.length;
    const totalComplexity = this._getTotalComplexity(texts);
    
    // Smart batching logic (similar to Gemini's approach)
    if (totalSegments <= Math.min(20, optimalSize) || totalComplexity < Math.min(300, maxComplexity)) {
      logger.debug(`[${this.providerName}] Using single batch for ${totalSegments} segments (complexity: ${totalComplexity})`);
      return [texts];
    }
    
    // Create multiple batches
    const batches = [];
    let currentBatch = [];
    let currentComplexity = 0;
    
    for (const text of texts) {
      const textComplexity = this._calculateTextComplexity(text);
      
      if (currentBatch.length >= optimalSize || 
          (currentComplexity + textComplexity > maxComplexity && currentBatch.length > 0)) {
        batches.push(currentBatch);
        currentBatch = [];
        currentComplexity = 0;
      }
      
      currentBatch.push(text);
      currentComplexity += textComplexity;
    }
    
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }
    
    logger.debug(`[${this.providerName}] Created ${batches.length} smart batches for ${totalSegments} segments`);
    return batches;
  }

  /**
   * Create fixed-size batches
   * @param {string[]} texts - Texts to translate
   * @param {number} batchSize - Fixed batch size
   * @returns {string[][]} - Array of batches
   */
  _createFixedBatches(texts, batchSize) {
    const batches = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      batches.push(texts.slice(i, i + batchSize));
    }
    logger.debug(`[${this.providerName}] Created ${batches.length} fixed batches (size: ${batchSize})`);
    return batches;
  }

  /**
   * Calculate total complexity of all texts
   * @param {string[]} texts - Texts to analyze
   * @returns {number} - Total complexity score
   */
  _getTotalComplexity(texts) {
    return texts.reduce((sum, text) => sum + this._calculateTextComplexity(text), 0);
  }

  /**
   * Create a timeout promise for batch processing
   * Uses dynamic timeout calculation based on batch size
   * @private
   */
  _createBatchTimeoutPromise(batchSize) {
    const timeoutMs = calculateBatchTimeout(batchSize, this.providerName);
    return createTimeoutPromise(timeoutMs, `Rate limit execution`);
  }

  /**
   * Calculate complexity of a single text
   * @param {string} text - Text to analyze
   * @returns {number} - Complexity score
   */
  _calculateTextComplexity(text) {
    if (!text || typeof text !== 'string') return 0;
    
    const length = text.length;
    const sentences = (text.match(/[.!?]+/g) || []).length;
    const words = text.trim().split(/\s+/).length;
    
    // Base complexity from character count
    let complexity = Math.min(length * 0.5, 100);
    
    // Bonus for sentence structure
    complexity += sentences * 2;
    
    // Bonus for word density
    complexity += Math.min(words * 0.5, 20);
    
    return Math.round(complexity);
  }

  /**
   * Stream batch results to content script
   * @param {string[]} batchResults - Translated results for this batch
   * @param {string[]} originalBatch - Original texts for this batch
   * @param {number} batchIndex - Index of this batch
   * @param {string} messageId - Message ID
   * @param {object} engine - Translation engine
   */
  async _streamBatchResults(batchResults, originalBatch, batchIndex, messageId, engine) {
    if (!engine || !messageId) {
      logger.warn(`[${this.providerName}] Cannot stream results - missing engine or messageId`);
      return;
    }

    try {
      // Send stream update message to content script
      const streamMessage = MessageFormat.create(
        MessageActions.TRANSLATION_STREAM_UPDATE,
        {
          success: true,
          data: batchResults,
          originalData: originalBatch,
          batchIndex: batchIndex,
          provider: this.providerName,
          timestamp: Date.now()
        },
        'background-streaming',
        { messageId }
      );

      // Get sender info from engine's active translations
      const senderInfo = engine.getStreamingSender?.(messageId);
      if (senderInfo && senderInfo.tab?.id) {
        await browser.tabs.sendMessage(senderInfo.tab.id, streamMessage);
        logger.debug(`[${this.providerName}] Stream update sent to tab ${senderInfo.tab.id} for batch ${batchIndex}`);
      } else {
        logger.warn(`[${this.providerName}] No tab info available for streaming messageId: ${messageId}`);
      }
    } catch (error) {
      logger.error(`[${this.providerName}] Failed to stream batch results:`, error);
    }
  }

  /**
   * Send streaming end notification
   * @param {string} messageId - Message ID
   * @param {object} engine - Translation engine
   * @param {object} options - Options (error: boolean)
   */
  async _sendStreamEnd(messageId, engine, options = {}) {
    if (!engine || !messageId) return;

    try {
      const streamEndMessage = MessageFormat.create(
        MessageActions.TRANSLATION_STREAM_END,
        {
          success: !options.error,
          completed: true,
          error: options.error,
          provider: this.providerName,
          timestamp: Date.now()
        },
        'background-streaming',
        { messageId }
      );

      const senderInfo = engine.getStreamingSender?.(messageId);
      if (senderInfo && senderInfo.tab?.id) {
        await browser.tabs.sendMessage(senderInfo.tab.id, streamEndMessage);
        logger.debug(`[${this.providerName}] Stream end sent to tab ${senderInfo.tab.id}`);
      }
    } catch (error) {
      logger.error(`[${this.providerName}] Failed to send stream end:`, error);
    }
  }

  /**
   * Send error stream message to content script
   * @param {Error} error - The error that occurred
   * @param {number} batchIndex - Index of the failed batch
   * @param {string} messageId - Message ID
   * @param {object} engine - Translation engine instance
   */
  async _streamErrorResults(error, batchIndex, messageId, engine) {
    if (!engine || !messageId) return;
    try {
      const streamErrorMessage = MessageFormat.create(
        MessageActions.TRANSLATION_STREAM_UPDATE,
        {
          success: false,
          error: {
            message: error.message || 'Translation failed',
            type: error.type || 'TRANSLATION_ERROR'
          },
          batchIndex: batchIndex,
          provider: this.providerName,
          timestamp: Date.now()
        },
        'background-streaming',
        { messageId }
      );
      const senderInfo = engine.getStreamingSender?.(messageId);
      if (senderInfo && senderInfo.tab?.id) {
        await browser.tabs.sendMessage(senderInfo.tab.id, streamErrorMessage);
        logger.debug(`[${this.providerName}] Stream error sent to tab ${senderInfo.tab.id}`);
      }
    } catch (sendError) {
      logger.error(`[${this.providerName}] Failed to send stream error:`, sendError);
    }
  }

  /**
   * Abstract method to translate a batch - must be implemented by subclasses
   * This differs from _batchTranslate in that it handles a single batch optimally
   * @param {string[]} batch - Batch of texts to translate
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {AbortController} abortController - Cancellation controller
   * @param {object} engine - Translation engine instance (optional)
   * @param {string} messageId - Message ID (optional)
   * @returns {Promise<string[]>} - Translated texts
   */
  async _translateBatch(batch, sourceLang, targetLang, translateMode, abortController, engine = null, messageId = null) {
    // Check if provider supports batch translation
    const batchStrategy = this.constructor.batchStrategy || 'single';
    
    // Single text fallback
    if (batch.length === 1) {
      const result = await this._translateSingle(batch[0], sourceLang, targetLang, translateMode, abortController);
      return [result || batch[0]];
    }
    
    // Use strategy pattern based on provider configuration
    try {
      let result;
      
      if (batchStrategy === 'json') {
        // JSON batch strategy (used by Gemini, OpenAI)
        const batchPrompt = this._buildBatchPrompt(batch, sourceLang, targetLang);
        result = await this._translateSingle(batchPrompt, sourceLang, targetLang, translateMode, abortController);
        
        // Parse JSON batch result
        const parsedResults = this._parseBatchResult(result, batch.length, batch);
        if (parsedResults.length === batch.length) {
          logger.debug(`[${this.providerName}] JSON batch translation successful: ${batch.length} segments`);
          return parsedResults;
        } else {
          throw new Error('JSON batch result count mismatch');
        }
        
      } else if (batchStrategy === 'numbered') {
        // Numbered batch strategy (used by OpenRouter, DeepSeek, WebAI)
        const batchPrompt = this._buildNumberedBatchPrompt(batch, sourceLang, targetLang, translateMode);
        result = await this._translateSingle(batchPrompt, sourceLang, targetLang, translateMode, abortController);
        
        // Parse numbered batch result
        const parsedResults = this._parseNumberedBatchResult(result, batch.length);
        if (parsedResults.length === batch.length) {
          logger.debug(`[${this.providerName}] Numbered batch translation successful: ${batch.length} segments`);
          return parsedResults;
        } else {
          throw new Error('Numbered batch result count mismatch');
        }
      }
      
      throw new Error(`Unknown batch strategy: ${batchStrategy}`);
      
    } catch (error) {
      logger.warn(`[${this.providerName}] Batch translation failed, falling back to individual requests:`, error);
      return this._fallbackSingleRequests(batch, sourceLang, targetLang, translateMode, engine, messageId, abortController);
    }
  }

  /**
   * Abstract method for single text translation - must be implemented by subclasses
   * @param {string} text - Text to translate
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {AbortController} abortController - Cancellation controller
   * @returns {Promise<string>} - Translated text
   */
  async _translateSingle(text, sourceLang, targetLang, translateMode, abortController) {
    throw new Error(`_translateSingle method must be implemented by ${this.constructor.name}`);
  }

  /**
   * Build batch prompt for providers that support batch translation
   * @param {string[]} textBatch - Batch of texts
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @returns {string} - Batch prompt
   */
  _buildBatchPrompt(textBatch, sourceLang, targetLang) {
    const jsonInput = textBatch.map((text, index) => ({
      id: index,
      text: text
    }));
    
    return `Translate the following JSON array of texts from ${sourceLang} to ${targetLang}. Your response MUST be a valid JSON array with the exact same number of items, each containing the translated text. Maintain the original JSON structure.

${JSON.stringify(jsonInput, null, 2)}

Important: Return only the JSON array with translated texts, no additional text or explanations.`;
  }

  /**
   * Parse batch translation results from JSON response
   * @param {string} result - API response
   * @param {number} expectedCount - Expected number of results
   * @param {string[]} originalBatch - Original texts for fallback
   * @returns {string[]} - Parsed results
   */
  _parseBatchResult(result, expectedCount, originalBatch) {
    try {
      // Find the JSON array in the response, allowing for markdown code blocks
      const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```|(\[[\s\S]*\])/);
      if (!jsonMatch) {
        throw new Error('No JSON array found in the response.');
      }
      
      // Use the first captured group that is not undefined
      const jsonString = jsonMatch[1] || jsonMatch[2];
      const parsed = JSON.parse(jsonString);
      
      if (Array.isArray(parsed) && parsed.length === expectedCount) {
        // Ensure the order is correct based on id
        const sortedResults = parsed.sort((a, b) => a.id - b.id);
        return sortedResults.map(item => item.text);
      }
      
      throw new Error(`Invalid batch result format. Expected ${expectedCount} items, got ${parsed.length}.`);
    } catch (error) {
      logger.warn(`[${this.providerName}] Failed to parse batch result: ${error.message}. Falling back to splitting by lines.`);
      return this._fallbackParsing(result, expectedCount, originalBatch);
    }
  }

  /**
   * Fallback parsing when JSON parsing fails
   * @param {string} result - API response
   * @param {number} expectedCount - Expected number of results
   * @param {string[]} originalBatch - Original texts for fallback
   * @returns {string[]} - Parsed results or original texts
   */
  _fallbackParsing(result, expectedCount, originalBatch) {
    // Simple fallback: split the result by newlines
    const lines = result.split('\\n').filter(line => line.trim() !== '');
    if (lines.length === expectedCount) {
      return lines;
    }
    // If all else fails, return the original texts for this batch
    logger.warn(`[${this.providerName}] Fallback parsing failed, returning original texts`);
    return originalBatch;
  }

  /**
   * Parse numbered batch results (for numbered strategy providers)
   * @param {string} result - API response
   * @param {number} expectedCount - Expected number of results
   * @param {string[]} originalBatch - Original texts for fallback
   * @returns {string[]} - Parsed results
   */
  _parseNumberedBatchResult(result, expectedCount, originalBatch) {
    if (!result) return originalBatch;
    
    // Split by lines and process numbered format
    const rawLines = result.split('\n');
    const lines = [];
    
    for (let line of rawLines) {
      line = line.trim();
      if (!line) continue;
      
      // Check if line starts with number format like "1. ", "2. ", etc.
      const numberMatch = line.match(/^(\d+)\.\s*(.*)$/);
      if (numberMatch) {
        const content = numberMatch[2].trim();
        if (content) {
          lines.push(content);
        }
      }
    }
    
    logger.debug(`[${this.providerName}] Parsed ${lines.length} translations from numbered response (expected: ${expectedCount})`);
    
    // If we got the expected number of translations, return them
    if (lines.length === expectedCount) {
      logger.info(`[${this.providerName}] Successfully parsed numbered response: ${lines.length} translations`);
      return lines;
    } else {
      logger.warn(`[${this.providerName}] Numbered response parsing failed. Expected: ${expectedCount}, Got: ${lines.length}`);
      return this._fallbackParsing(result, expectedCount, originalBatch);
    }
  }

  /**
   * Build numbered batch prompt (for numbered strategy providers)
   * @param {string[]} textBatch - Batch of texts
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @returns {string} - Numbered batch prompt
   */
  _buildNumberedBatchPrompt(textBatch, sourceLang, targetLang) {
    const numberedText = textBatch.map((text, index) => `${index + 1}. ${text}`).join('\n');
    return numberedText + '\n\nPlease return the translations in the same order, one per line, numbered 1. 2. 3. etc.';
  }

  /**
   * Enhanced fallback to individual requests with streaming support (from Gemini)
   * @param {string[]} batch - Batch of texts to translate
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {object} engine - Translation engine instance
   * @param {string} messageId - Message ID
   * @param {AbortController} abortController - Cancellation controller
   * @returns {Promise<string[]>} - Translated texts
   */
  async _fallbackSingleRequests(batch, sourceLang, targetLang, translateMode, engine, messageId, abortController) {
    logger.debug(`[${this.providerName}] Starting fallback for ${batch.length} segments`);
    const { rateLimitManager } = await import("@/features/translation/core/RateLimitManager.js");
    const results = [];
    
    for (let i = 0; i < batch.length; i++) {
      if (abortController && abortController.signal.aborted) {
        throw new Error('Translation cancelled during fallback');
      }
      
      try {
        logger.debug(`[${this.providerName}] Fallback processing segment ${i + 1}/${batch.length}: "${batch[i]}"`);
        
        // Manual delay for fallback to prevent overload
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay between fallback segments
        }
        
        const result = await Promise.race([
          this._translateSingle(batch[i], sourceLang, targetLang, translateMode, abortController),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Fallback segment ${i + 1} timeout after 8 seconds`)), 8000)
          )
        ]);
        
        logger.debug(`[${this.providerName}] Fallback segment ${i + 1} completed`);
        const translatedResult = result || batch[i];
        results.push(translatedResult);
        
        // Stream the result immediately for this segment
        if (engine && messageId) {
          await this._streamFallbackResult([translatedResult], [batch[i]], i, messageId, engine);
        }
      } catch (error) {
        logger.warn(`[${this.providerName}] Fallback segment ${i + 1} failed:`, error);
        
        // Throw error to be handled by system error management
        throw error;
      }
    }
    
    return results;
  }

  /**
   * Stream fallback result to content script (from Gemini)
   * @param {string[]} result - Translated result for this segment
   * @param {string[]} original - Original text for this segment
   * @param {number} segmentIndex - Index of this segment in the batch
   * @param {string} messageId - Message ID
   * @param {object} engine - Translation engine instance
   */
  async _streamFallbackResult(result, original, segmentIndex, messageId, engine) {
    try {
      const { MessageFormat } = await import('@/shared/messaging/core/MessagingCore.js');
      const { MessageActions } = await import('@/shared/messaging/core/MessageActions.js');
      
      const streamMessage = MessageFormat.create(
        MessageActions.TRANSLATION_STREAM_UPDATE,
        {
          success: true,
          data: result,
          originalData: original,
          batchIndex: segmentIndex,
          provider: this.providerName,
          timestamp: Date.now()
        },
        'background-streaming',
        { messageId }
      );

      const senderInfo = engine.getStreamingSender?.(messageId);
      if (senderInfo && senderInfo.tab?.id) {
        await browser.tabs.sendMessage(senderInfo.tab.id, streamMessage);
        logger.debug(`[${this.providerName}] Fallback result streamed for segment ${segmentIndex + 1}`);
      }
    } catch (error) {
      logger.error(`[${this.providerName}] Failed to stream fallback result for segment ${segmentIndex + 1}:`, error);
    }
  }

  /**
   * Abstract method for getting provider configuration
   * Must be implemented by subclasses
   * @returns {Promise<Object>} - Provider configuration
   * @protected
   */
  async _getConfig() {
    throw new Error(`_getConfig method must be implemented by ${this.constructor.name}`);
  }
 
  /**
   * Enhanced API call execution with centralized error handling (from Gemini)
   * @param {Object} params - API call parameters
   * @returns {Promise<any>} - API response
   * @protected
   */
  async _executeWithErrorHandling(params) {
    try {
      return await this._executeApiCall(params);
    } catch (error) {
      // Let ErrorHandler automatically detect and handle all error types
      await ErrorHandler.getInstance().handle(error, {
        context: params.context || `${this.providerName.toLowerCase()}-translation`
      });
      
      logger.error(`[${this.providerName}] API call failed:`, error);
      error.context = params.context || `${this.providerName.toLowerCase()}-translation`;
      error.provider = this.providerName;
      throw error;
    }
  }
}