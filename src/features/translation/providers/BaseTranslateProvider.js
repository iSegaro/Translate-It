/**
 * Base Translate Provider - Enhanced base class for translation services (Google, Yandex, etc.)
 * Provides streaming support for chunk-based translation with real-time DOM updates
 */

import { BaseProvider } from "@/features/translation/providers/BaseProvider.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { MessageFormat } from '@/shared/messaging/core/MessagingCore.js';
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { TranslationMode } from "@/shared/config/config.js";
import browser from 'webextension-polyfill';
import { LanguageSwappingService } from "@/features/translation/providers/LanguageSwappingService.js";
import { streamingManager } from "@/features/translation/core/StreamingManager.js";

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'BaseTranslateProvider');

export class BaseTranslateProvider extends BaseProvider {
  // Provider capabilities - to be overridden by subclasses
  static supportsStreaming = true;
  static chunkingStrategy = 'character_limit'; // 'character_limit', 'segment_count'
  static characterLimit = 5000;
  static maxChunksPerBatch = 10;

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
    } = typeof options === 'object' && options !== null ? options : { mode: options };

    const abortController = (messageId && engine) ? engine.activeTranslations.get(messageId) : null;

    logger.debug(`[${this.providerName}] Traditional provider translate call - bypassing JSON mode`);

    // Language swapping and normalization
    [sourceLang, targetLang] = await LanguageSwappingService.applyLanguageSwapping(
      text, sourceLang, targetLang, originalSourceLang, originalTargetLang,
      { providerName: this.providerName, useRegexFallback: true }
    );

    // Field and subtitle modes
    if (translateMode === TranslationMode.Field || translateMode === TranslationMode.Subtitle) {
      sourceLang = AUTO_DETECT_VALUE;
    }

    // Convert to provider-specific language codes
    const sl = this._getLangCode(sourceLang);
    const tl = this._getLangCode(targetLang);

    if (sl === tl) return text;

    // For traditional providers, always treat as plain text array (no JSON mode)
    let textsToTranslate;
    try {
      const parsed = JSON.parse(text);
      if (this._isSpecificTextJsonFormat(parsed)) {
        // Extract texts from JSON structure
        textsToTranslate = parsed.map((item) => item.text || '');
        logger.debug(`[${this.providerName}] Extracted ${textsToTranslate.length} texts from JSON input for traditional processing`);
        
        // Perform batch translation
        const translatedSegments = await this._batchTranslate(textsToTranslate, sl, tl, translateMode, engine, messageId, abortController);
        
        // Reconstruct JSON structure
        if (translatedSegments.length !== parsed.length) {
          logger.error(`[${this.providerName}] JSON reconstruction failed due to segment mismatch.`);
          return translatedSegments.join('\n');
        }
        
        const translatedJson = parsed.map((item, index) => ({
          ...item,
          text: translatedSegments[index] || "",
        }));
        
        return JSON.stringify(translatedJson, null, 2);
      } else {
        // Single text
        textsToTranslate = [text];
      }
    } catch {
      // Not valid JSON, treat as single text
      textsToTranslate = [text];
    }

    // Perform batch translation  
    const translatedSegments = await this._batchTranslate(textsToTranslate, sl, tl, translateMode, engine, messageId, abortController);
    
    // Return single result for plain text
    return translatedSegments[0];
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
    
    // Fall back to traditional translation (original implementation)
    return this._traditionalBatchTranslate(texts, sourceLang, targetLang, translateMode, abortController);
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
    // 4. There are multiple texts or chunking is needed
    return this.constructor.supportsStreaming && 
           messageId && 
           engine && 
           (texts.length > 1 || this._needsChunking(texts));
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
  async _streamingBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController) {
    logger.debug(`[${this.providerName}] Starting streaming translation for ${texts.length} texts`);
    
    // Create chunks based on provider strategy
    const chunks = this._createChunks(texts);
    const allResults = [];
    let processedCount = 0;

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      // Check for cancellation
      if (abortController && abortController.signal.aborted) {
        throw new Error('Translation cancelled by user');
      }
      if (engine && engine.isCancelled(messageId)) {
        throw new Error('Translation cancelled by user');
      }

      const chunk = chunks[chunkIndex];
      logger.debug(`[${this.providerName}] Processing streaming chunk ${chunkIndex + 1}/${chunks.length} (${chunk.texts.length} texts)`);

      try {
        // Get rate limit manager
        const { rateLimitManager } = await import("@/features/translation/core/RateLimitManager.js");
        
        // Translate this chunk using provider's original implementation
        const chunkResults = await rateLimitManager.executeWithRateLimit(
          this.providerName,
          () => this._translateChunk(chunk.texts, sourceLang, targetLang, translateMode, abortController),
          `streaming-chunk-${chunkIndex + 1}/${chunks.length}`
        );

        // Add results to collection
        allResults.push(...chunkResults);

        // Stream results immediately to content script
        await this._streamChunkResults(
          chunkResults,
          chunk.texts,
          chunkIndex,
          messageId,
          engine
        );

        processedCount += chunk.texts.length;
        logger.debug(`[${this.providerName}] Streamed chunk ${chunkIndex + 1}/${chunks.length}, total processed: ${processedCount}/${texts.length}`);

      } catch (error) {
        logger.error(`[${this.providerName}] Streaming chunk ${chunkIndex + 1} failed:`, error);
        
        // On error, return original texts for this chunk
        const fallbackResults = chunk.texts;
        allResults.push(...fallbackResults);
        
        // Still stream the fallback results
        await this._streamChunkResults(
          fallbackResults,
          chunk.texts, 
          chunkIndex,
          messageId,
          engine
        );
      }
    }

    // Send streaming end notification
    await this._sendStreamEnd(messageId, engine);
    
    logger.info(`[${this.providerName}] Streaming translation completed: ${allResults.length} texts`);
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
      // Character-based chunking (like Google Translate)
      let currentChunk = [];
      let currentCharCount = 0;
      
      for (const text of texts) {
        if (currentChunk.length > 0 && 
            currentCharCount + text.length > this.constructor.characterLimit) {
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
  async _translateChunk(chunkTexts, sourceLang, targetLang, translateMode, abortController) {
    // This should be overridden by subclasses to call their existing chunk translation logic
    throw new Error(`_translateChunk not implemented by ${this.providerName}`);
  }

  /**
   * Stream chunk results to content script immediately
   * @param {string[]} chunkResults - Results from this chunk
   * @param {string[]} originalChunkTexts - Original texts for this chunk
   * @param {number} chunkIndex - Index of this chunk
   * @param {string} messageId - Message ID
   * @param {object} engine - Translation engine
   */
  async _streamChunkResults(chunkResults, originalChunkTexts, chunkIndex, messageId, engine) {
    try {
      // Stream the results
      await streamingManager.streamBatchResults(
        messageId,
        chunkResults,
        originalChunkTexts,
        chunkIndex,
        engine
      );
      
      logger.debug(`[${this.providerName}] Successfully streamed chunk ${chunkIndex + 1} results`);
    } catch (error) {
      logger.error(`[${this.providerName}] Failed to stream chunk ${chunkIndex + 1} results:`, error);
    }
  }

  /**
   * Send streaming end notification
   * @param {string} messageId - Message ID
   * @param {object} engine - Translation engine
   */
  async _sendStreamEnd(messageId, engine) {
    try {
      // Complete the stream
      await streamingManager.completeStream(messageId, engine);
      
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
  async _traditionalBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController) {
    // This should call the original _batchTranslate implementation
    // Will be overridden by subclasses to preserve existing functionality
    throw new Error(`_traditionalBatchTranslate not implemented by ${this.providerName}`);
  }
}
