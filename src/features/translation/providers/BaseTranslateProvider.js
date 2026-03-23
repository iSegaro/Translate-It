/**
 * Base Translate Provider - Enhanced base class for translation services (Google, Yandex, etc.)
 * Provides streaming support for chunk-based translation with real-time DOM updates
 */

import { BaseProvider } from "@/features/translation/providers/BaseProvider.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
// import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
// import { MessageFormat } from '@/shared/messaging/core/MessagingCore.js';
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { TranslationMode } from "@/shared/config/config.js";
// import browser from 'webextension-polyfill';
import { LanguageSwappingService } from "@/features/translation/providers/LanguageSwappingService.js";
import { streamingManager } from "@/features/translation/core/StreamingManager.js";
import { matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'BaseTranslateProvider');

export class BaseTranslateProvider extends BaseProvider {
  // Provider capabilities - to be overridden by subclasses
  static supportsStreaming = true;
  static chunkingStrategy = 'character_limit'; // 'character_limit', 'segment_count'
  static characterLimit = 5000;
  static maxChunksPerBatch = 150;

  constructor(providerName) {
    super(providerName);
  }

  /**
   * Override translate method to disable JSON mode for traditional providers
   * Traditional providers use delimiter-based approach, not JSON
   */
  async translate(text, sourceLang, targetLang, options) {
    const {
      mode: translateMode,
      originalSourceLang,
      originalTargetLang,
      messageId,
      engine,
      priority
    } = typeof options === 'object' && options !== null ? options : { mode: options };

    const abortController = (messageId && engine) ? engine.activeTranslations.get(messageId) : null;

    logger.debug(`[${this.providerName}] Traditional provider translate call - Mode: ${translateMode}`);

    // 1. Language swapping and normalization
    if (translateMode === TranslationMode.Field || translateMode === TranslationMode.Subtitle) {
      sourceLang = AUTO_DETECT_VALUE;
    }

    [sourceLang, targetLang] = await LanguageSwappingService.applyLanguageSwapping(
      text, sourceLang, targetLang, originalSourceLang, originalTargetLang,
      { providerName: this.providerName, useRegexFallback: true }
    );

    const sl = this._getLangCode(sourceLang);
    const tl = this._getLangCode(targetLang);

    if (sl === tl) return text;

    // 2. Handle input format
    let textsToTranslate;
    let isJson = false;
    let parsedJson = null;

    try {
      const parsed = JSON.parse(text);
      if (this._isSpecificTextJsonFormat(parsed)) {
        isJson = true;
        parsedJson = parsed;
        textsToTranslate = parsed.map((item) => item.text || '');
      } else {
        textsToTranslate = [text];
      }
    } catch {
      textsToTranslate = [text];
    }

    // 3. Perform batch translation
    const translatedSegments = await this._batchTranslate(
      textsToTranslate, 
      sl, 
      tl, 
      translateMode, 
      engine, 
      messageId, 
      abortController,
      priority
    );

    // 4. Reconstruct output
    if (isJson && Array.isArray(translatedSegments)) {
      // If mismatch, try to fix by padding or truncating to match original length
      let finalSegments = translatedSegments;
      if (translatedSegments.length !== parsedJson.length) {
        logger.debug(`[${this.providerName}] JSON segment mismatch: expected ${parsedJson.length}, got ${translatedSegments.length}`);
        if (translatedSegments.length > parsedJson.length) {
          finalSegments = translatedSegments.slice(0, parsedJson.length);
        } else {
          // Pad with original text if translation failed for some segments
          finalSegments = [
            ...translatedSegments,
            ...parsedJson.slice(translatedSegments.length).map(item => item.text || '')
          ];
        }
      }

      const translatedJson = parsedJson.map((item, index) => ({
        ...item,
        text: finalSegments[index] || "",
      }));
      return JSON.stringify(translatedJson, null, 2);
    }

    return translatedSegments[0];
  }

  /**
   * Robustly splits translated text into segments by using TranslationSegmentMapper.
   * Ensures the returned array matches the expected count by padding or truncating.
   * @param {string} translatedText - The full translated text string
   * @param {string[]} originalSegments - Original segments for pattern reference
   * @returns {string[]} - Array of translated segments matching original count
   */
  async _robustSplit(translatedText, originalSegments) {
    const expectedCount = originalSegments.length;
    if (expectedCount <= 1) return [translatedText];
    
    const { TranslationSegmentMapper } = await import("@/utils/translation/TranslationSegmentMapper.js");
    const { TRANSLATION_CONSTANTS } = await import("@/shared/config/translationConstants.js");
    
    // Use the advanced mapper to recover segments
    let segments = TranslationSegmentMapper.mapTranslationToOriginalSegments(
      translatedText,
      originalSegments,
      TRANSLATION_CONSTANTS.TEXT_DELIMITER,
      this.providerName
    );
    
    // Final validation and normalization to ensure exactly expectedCount segments
    if (segments.length !== expectedCount) {
      logger.debug(`[${this.providerName}] Segment count mismatch after advanced mapping: expected ${expectedCount}, got ${segments.length}`);
      
      if (segments.length > expectedCount) {
        segments = segments.slice(0, expectedCount);
      } else {
        // Pad with empty strings if we still have a mismatch
        while (segments.length < expectedCount) {
          segments.push("");
        }
      }
    }
    
    return segments.map(s => s ? s.trim() : "");
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
  async _batchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority) {
    // Check if streaming is supported and beneficial
    if (this.constructor.supportsStreaming && this._shouldUseStreaming(texts, messageId, engine, translateMode)) {
      return this._streamingBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority);
    }

    // Fall back to traditional translation (original implementation)
    return this._traditionalBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority);
  }

  /**
   * Determine if streaming should be used for this request
   * @param {string[]} texts - Texts to translate
   * @param {string} messageId - Message ID
   * @param {object} engine - Translation engine
   * @returns {boolean} - Whether to use streaming
   */
  _shouldUseStreaming(texts, messageId, engine, translateMode = null) {
    // 1. Provider must support streaming
    if (!this.constructor.supportsStreaming || !messageId || !engine) return false;

    // 2. CRITICAL: Never use internal streaming for WHOLE PAGE translation
    // Page translation is already batched by PageTranslationBatcher and handled by processPageTranslation.
    // Double streaming causes context mismatches and result rejection.
    if (translateMode === TranslationMode.Page) return false;

    // 3. Use streaming for multiple texts (like Select Element) or if chunking is needed
    return texts.length > 1 || this._needsChunking(texts);
  }

  /**
   * Check if texts need chunking based on provider strategy
   * @param {string[]} texts - Texts to translate
   * @returns {boolean} - Whether chunking is needed
   */
  _needsChunking(texts) {
    if (this.constructor.chunkingStrategy === 'character_limit') {
      const totalChars = texts.reduce((sum, text) => sum + text.length, 0);
      return totalChars > this.constructor.characterLimit;
    }
    return texts.length > this.constructor.maxChunksPerBatch;
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
  async _streamingBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority) {
    logger.debug(`[${this.providerName}] Starting streaming translation for ${texts.length} texts`);
    
    // Initialize streaming session if messageId is available
    if (messageId && engine) {
      try {
        // Get sender info from engine if available
        const sender = engine.streamingSenders?.get(messageId) || null;
        streamingManager.initializeStream(messageId, sender, this, texts);
      } catch (error) {
        logger.error(`[${this.providerName}] Failed to initialize streaming session:`, error);
      }
    }
    
    // Create chunks based on provider strategy
    const chunks = this._createChunks(texts);
    const allResults = [];
    
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      // Check for cancellation
      if (abortController && abortController.signal.aborted) {
        const error = new Error('Translation cancelled by user');
        error.type = ErrorTypes.USER_CANCELLED;
        throw error;
      }
      if (engine && engine.isCancelled(messageId)) {
        const error = new Error('Translation cancelled by user');
        error.type = ErrorTypes.USER_CANCELLED;
        throw error;
      }

      const chunk = chunks[chunkIndex];
      logger.debug(`[${this.providerName}] Processing streaming chunk ${chunkIndex + 1}/${chunks.length} (${chunk.texts.length} texts)`);

      try {
        // Get rate limit manager
        const { rateLimitManager } = await import("@/features/translation/core/RateLimitManager.js");
        
        // Translate this chunk using provider's original implementation
        const chunkResults = await rateLimitManager.executeWithRateLimit(
          this.providerName,
          () => this._translateChunk(chunk.texts, sourceLang, targetLang, translateMode, abortController, 0, chunk.texts.length, chunkIndex, chunks.length),
          `streaming-chunk-${chunkIndex + 1}/${chunks.length}`,
          priority
        );

        // Add results to collection
        allResults.push(...chunkResults);

        // Stream results immediately to content script
        await this._streamChunkResults(
          chunkResults,
          chunk.texts,
          chunkIndex,
          messageId,
          sourceLang,
          targetLang
        );

        // Streamed chunk progress

      } catch (error) {
        // Log cancellation as debug instead of error using proper error management
        const errorType = error.type || matchErrorToType(error);

        if (errorType === ErrorTypes.USER_CANCELLED) {
          logger.debug(`[${this.providerName}] Streaming chunk ${chunkIndex + 1} cancelled:`, error);
        } else {
          logger.error(`[${this.providerName}] Streaming chunk ${chunkIndex + 1} failed:`, error);
        }

        // Send error stream message to content script
        await this._streamChunkError(error, chunkIndex, messageId, engine);

        // Send streaming end notification with error details
        await this._sendStreamEnd(messageId, {
          error: {
            message: error.message,
            type: error.type || errorType
          }
        });

        // Stop streaming on error - don't continue with other chunks
        throw error;
      }
    }

    // Send streaming end notification
    await this._sendStreamEnd(messageId, { sourceLanguage: sourceLang, targetLanguage: targetLang });
    
    // Streaming translation completed
    return allResults;
  }

  /**
   * Create chunks based on provider strategy
   * @param {string[]} texts - Texts to translate
   * @returns {Array} - Array of chunk objects with texts and metadata
   */
  _createChunks(texts) {
    const chunks = [];

    if (this.constructor.chunkingStrategy === 'character_limit') {
      // Character-based chunking with segment limit (like Google Translate, DeepL)
      let currentChunk = [];
      let currentCharCount = 0;

      for (const text of texts) {
        // Check if adding this text would exceed character limit OR segment limit
        const wouldExceedCharLimit = currentChunk.length > 0 &&
            currentCharCount + text.length > this.constructor.characterLimit;
        const wouldExceedSegmentLimit = currentChunk.length >= this.constructor.maxChunksPerBatch;

        if (wouldExceedCharLimit || wouldExceedSegmentLimit) {
          chunks.push({
            texts: currentChunk,
            charCount: currentCharCount
          });
          currentChunk = [];
          currentCharCount = 0;
        }
        currentChunk.push(text);
        currentCharCount += text.length;
      }

      if (currentChunk.length > 0) {
        chunks.push({
          texts: currentChunk,
          charCount: currentCharCount
        });
      }
    } else {
      // Segment count-based chunking
      for (let i = 0; i < texts.length; i += this.constructor.maxChunksPerBatch) {
        const chunkTexts = texts.slice(i, i + this.constructor.maxChunksPerBatch);
        chunks.push({
          texts: chunkTexts,
          charCount: chunkTexts.reduce((sum, text) => sum + text.length, 0)
        });
      }
    }

    logger.debug(`[${this.providerName}] Created ${chunks.length} chunks from ${texts.length} texts`);
    return chunks;
  }

  /**
   * Translate a single chunk - to be implemented by subclasses
   * @param {string[]} chunkTexts - Texts in this chunk
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {AbortController} abortController - Cancellation controller
   * @returns {Promise<string[]>} - Translated texts for this chunk
   */
  _translateChunk(/*chunkTexts, sourceLang, targetLang, translateMode, abortController*/) {
    // This should be overridden by subclasses to call their existing chunk translation logic
    throw new Error(`_translateChunk not implemented by ${this.providerName}`);
  }

  /**
   * Stream chunk results to content script immediately
   * @param {string[]} chunkResults - Results from this chunk
   * @param {string[]} originalChunkTexts - Original texts for this chunk
   * @param {number} chunkIndex - Index of this chunk
   * @param {string} messageId - Message ID
   * @param {string} sourceLanguage - Actual source language
   * @param {string} targetLanguage - Actual target language
   */
  async _streamChunkResults(chunkResults, originalChunkTexts, chunkIndex, messageId, sourceLanguage = null, targetLanguage = null) {
    try {
      // Stream the results
      await streamingManager.streamBatchResults(
        messageId,
        chunkResults,
        originalChunkTexts,
        chunkIndex,
        sourceLanguage,
        targetLanguage
      );
      
      logger.debug(`[${this.providerName}] Successfully streamed chunk ${chunkIndex + 1} results`);
    } catch (error) {
      logger.error(`[${this.providerName}] Failed to stream chunk ${chunkIndex + 1} results:`, error);
    }
  }

  /**
   * Stream error for a chunk
   * @param {Error} error - Error that occurred
   * @param {number} chunkIndex - Index of failed chunk
   * @param {string} messageId - Message ID
   * @param {object} engine - Translation engine instance
   */
  async _streamChunkError(error, chunkIndex, messageId /* , engine = null */) {
    try {
      // Use streamingManager for error streaming
      await streamingManager.streamBatchError(messageId, error, chunkIndex);
      
      logger.debug(`[${this.providerName}] Error streamed for chunk ${chunkIndex + 1}`);
    } catch (streamError) {
      logger.error(`[${this.providerName}] Failed to stream error for chunk ${chunkIndex + 1}:`, streamError);
    }
  }

  /**
   * Send streaming end notification
   * @param {string} messageId - Message ID
   * @param {object} options - Options (error: boolean)
   */
  async _sendStreamEnd(messageId, options = {}) {
    try {
      // Complete the stream
      await streamingManager.completeStream(messageId, !options.error, options);
      
      logger.debug(`[${this.providerName}] Streaming session completed`);
    } catch (error) {
      logger.error(`[${this.providerName}] Failed to complete streaming session:`, error);
    }
  }

  /**
   * Traditional batch processing (fallback) - calls original implementation
   * @param {string[]} texts - Texts to translate
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {AbortController} abortController - Cancellation controller
   * @returns {Promise<string[]>} - Translated texts
   */
  async _traditionalBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority) {
    // Default implementation with chunking and rate limiting
    const context = `${this.providerName.toLowerCase()}-traditional-batch`;
    const chunks = this._createChunks(texts);
    const allResults = [];

    // Import rate limiting manager
    const { rateLimitManager } = await import("@/features/translation/core/RateLimitManager.js");

    // Process chunks sequentially
    for (let i = 0; i < chunks.length; i++) {
      // Check for cancellation
      if (abortController && abortController.signal.aborted) {
        const cancelError = new Error('Translation cancelled by user');
        cancelError.name = 'AbortError';
        cancelError.type = ErrorTypes.USER_CANCELLED;
        throw cancelError;
      }

      const chunk = chunks[i];
      const chunkContext = `${context}-chunk-${i + 1}/${chunks.length}`;

      try {
        // Execute chunk translation with rate limiting
        const result = await rateLimitManager.executeWithRateLimit(
          this.providerName,
          () => this._translateChunk(chunk.texts, sourceLang, targetLang, translateMode, abortController, 0, chunk.texts.length, i, chunks.length),
          chunkContext,
          priority
        );

        allResults.push(...(result || chunk.texts.map(() => '')));
      } catch (error) {
        logger.error(`[${this.providerName}] Chunk ${i + 1} failed:`, error);
        // Enhanced error handling - throw to be handled by system error management
        throw error;
      }
    }

    return allResults;
  }
}