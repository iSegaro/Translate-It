/**
 * Base Translate Provider - Enhanced base class for translation services (Google, Yandex, etc.)
 * Provides streaming support for chunk-based translation with real-time DOM updates
 */

import { BaseProvider } from "@/features/translation/providers/BaseProvider.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { TranslationMode } from "@/shared/config/config.js";
import { streamingManager } from "@/features/translation/core/StreamingManager.js";
import { matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { TraditionalTextProcessor } from "./utils/TraditionalTextProcessor.js";
import { TraditionalStreamManager } from "./utils/TraditionalStreamManager.js";
import { statsManager } from '@/features/translation/core/TranslationStatsManager.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'BaseTranslateProvider');

export class BaseTranslateProvider extends BaseProvider {
  // Provider capabilities - to be overridden by subclasses
  static supportsStreaming = true;
  static chunkingStrategy = 'character_limit'; 
  static characterLimit = 5000;
  static maxChunksPerBatch = 150;

  constructor(providerName) {
    super(providerName);
  }

  /**
   * Enhanced batch translation with streaming support
   */
  async _batchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority, sessionId, expectedFormat) {
    if (this.constructor.supportsStreaming && this._shouldUseStreaming(texts, messageId, engine, translateMode)) {
      return this._streamingBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority, sessionId, expectedFormat);
    }
    return this._traditionalBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority, sessionId, expectedFormat);
  }

  /**
   * Determine if streaming should be used
   */
  _shouldUseStreaming(texts, messageId, engine, translateMode = null) {
    if (!this.constructor.supportsStreaming || !messageId || !engine) return false;
    
    // Disable internal streaming for modes that have specialized orchestrators (Page, Select Element)
    if (translateMode === TranslationMode.Page || translateMode === TranslationMode.Select_Element) {
      return false;
    }
    
    return texts.length > 1 || this._needsChunking(texts);
  }

  /**
   * Check if texts need chunking
   */
  _needsChunking(texts) {
    return texts.length > 1 || this._calculateTraditionalCharCount(texts) > 2000;
  }

  /**
   * Configuration Resolvers - Unified with ProviderConfigurations.js and User Levels
   */
  async getBatchingConfig(mode = null) {
    const { getProviderOptimizationLevelAsync } = await import("@/shared/config/config.js");
    const { getProviderBatching } = await import("@/features/translation/core/ProviderConfigurations.js");
    const level = await getProviderOptimizationLevelAsync(this.providerName);
    return getProviderBatching(this.providerName, mode, level);
  }

  /**
   * Create chunks for translation (Respecting Optimization Level)
   * @protected
   */
  async _createChunks(texts) {
    const config = await this.getBatchingConfig();
    return TraditionalTextProcessor.createChunks(texts, this.providerName, config.strategy, config.characterLimit, config.maxChunksPerBatch);
  }

  /**
   * Streaming batch translation with real-time results
   */
  async _streamingBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority, sessionId, expectedFormat) {
    logger.debug(`[${this.providerName}] Starting streaming translation for ${texts.length} texts (Format: ${expectedFormat || 'default'})`);
    
    if (messageId && engine) {
      try {
        const sender = typeof engine.getStreamingSender === 'function' ? engine.getStreamingSender(messageId) : null;
        if (sender) {
          streamingManager.initializeStream(messageId, sender, this, texts, sessionId);
        } else {
          logger.debug(`[${this.providerName}] No sender found for streaming messageId: ${messageId}`);
        }
      } catch { /* ignore */ }
    }
    
    const chunks = await this._createChunks(texts);
    const allResults = [];
    
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      if ((abortController && abortController.signal.aborted) || (engine && engine.isCancelled(messageId))) {
        const error = new Error('Translation cancelled by user');
        error.type = ErrorTypes.USER_CANCELLED;
        throw error;
      }

      const chunk = chunks[chunkIndex];
      const chunkContext = `streaming-chunk-${chunkIndex + 1}/${chunks.length}`;

      try {
        const statsBefore = sessionId ? statsManager.getSessionSummary(sessionId) : null;
        const charsBefore = statsBefore ? statsBefore.chars : 0;

        if (abortController) abortController.sessionId = sessionId;

        const chunkResponse = await this._executeWithRateLimit(
          (opts) => this._translateChunk(chunk.texts, sourceLang, targetLang, translateMode, abortController, 0, chunk.texts.length, chunkIndex, chunks.length, { ...opts, originalCharCount: chunk.texts.reduce((sum, t) => sum + (t?.length || 0), 0) }),
          chunkContext,
          priority,
          { sessionId, abortController, messageId }
        );

        // Scrub artifacts from streaming results
        const scrubbedResponse = Array.isArray(chunkResponse) 
          ? chunkResponse.map(r => {
              const text = typeof r === 'string' ? r : (r?.t || r?.text || r?.translatedText || '');
              return TraditionalTextProcessor.scrubBidiArtifacts(text);
            })
          : TraditionalTextProcessor.scrubBidiArtifacts(chunkResponse);

        const statsAfter = sessionId ? statsManager.getSessionSummary(sessionId) : null;
        const actualChunkChars = statsAfter ? (statsAfter.chars - charsBefore) : this._calculateTraditionalCharCount(chunk.texts);
        const originalChunkChars = chunk.texts.reduce((sum, t) => sum + (t?.length || 0), 0);

        allResults.push(...(Array.isArray(scrubbedResponse) ? scrubbedResponse : [scrubbedResponse]));
        await TraditionalStreamManager.streamChunkResults(this.providerName, scrubbedResponse, chunk.texts, chunkIndex, messageId, sourceLang, targetLang, actualChunkChars, originalChunkChars);
      } catch (error) {
        const errorType = error.type || matchErrorToType(error);
        if (errorType === ErrorTypes.USER_CANCELLED) logger.debug(`[${this.providerName}] Streaming chunk ${chunkIndex + 1} cancelled:`, error);
        else logger.error(`[${this.providerName}] Streaming chunk ${chunkIndex + 1} failed:`, error);

        await TraditionalStreamManager.streamChunkError(this.providerName, error, chunkIndex, messageId);
        await TraditionalStreamManager.sendStreamEnd(this.providerName, messageId, { error: { message: error.message, type: error.type || errorType } });
        throw error;
      }
    }

    await TraditionalStreamManager.sendStreamEnd(this.providerName, messageId, { sourceLanguage: sourceLang, targetLanguage: targetLang });
    return allResults;
  }

  async _traditionalBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority, sessionId, expectedFormat) {
    logger.debug(`[${this.providerName}] Starting traditional batch translation for ${texts.length} texts (Format: ${expectedFormat || 'default'})`);
    const context = `${this.providerName.toLowerCase()}-traditional-batch`;
    const chunks = await this._createChunks(texts);
    const allResults = [];

    const { TranslationSegmentMapper } = await import("@/utils/translation/TranslationSegmentMapper.js");

    for (let i = 0; i < chunks.length; i++) {
      if (abortController && abortController.signal.aborted) {
        const cancelError = new Error('Translation cancelled by user');
        cancelError.name = 'AbortError';
        cancelError.type = ErrorTypes.USER_CANCELLED;
        throw cancelError;
      }

      const chunk = chunks[i];
      const chunkContext = `${context}-chunk-${i + 1}/${chunks.length}`;

      if (abortController) abortController.sessionId = sessionId;
      const originalCharCount = chunk.texts.reduce((sum, t) => sum + (t?.length || 0), 0);

      const chunkResponse = await this._executeWithRateLimit(
        (opts) => this._translateChunk(chunk.texts, sourceLang, targetLang, translateMode, abortController, 0, chunk.texts.length, i, chunks.length, { ...opts, originalCharCount }),
        chunkContext,
        priority,
        { sessionId, abortController, messageId }
      );

      // Handle different response formats and CRITICAL: Split joined strings back into segments
      let chunkResults = [];
      const { TRANSLATION_CONSTANTS } = await import("@/shared/config/translationConstants.js");

      // Normalize chunkResponse to an array for consistent processing
      const responseArray = Array.isArray(chunkResponse) ? chunkResponse : [chunkResponse];
      
      if (responseArray.length === chunk.texts.length) {
        // IDEAL CASE: Provider returned exactly what we asked for
        chunkResults = responseArray.map(r => {
          const text = typeof r === 'string' ? r : (r?.t || r?.text || r?.translatedText || '');
          return TraditionalTextProcessor.scrubBidiArtifacts(text);
        });
      } else {
        // MISMATCH CASE: Provider did internal splitting or merged segments
        // Join everything and let the SegmentMapper redistribute it correctly
        const joinedResult = responseArray
          .map(r => {
            if (typeof r === 'string') return r;
            // Extract text from object but ensure it's not undefined
            return (r?.t || r?.text || r?.translatedText || '');
          })
          .join(TRANSLATION_CONSTANTS.TEXT_DELIMITER);

        chunkResults = TranslationSegmentMapper.mapTranslationToOriginalSegments(
          joinedResult,
          chunk.texts,
          TRANSLATION_CONSTANTS.TEXT_DELIMITER,
          this.providerName
        ).map(text => TraditionalTextProcessor.scrubBidiArtifacts(text));
      }

      allResults.push(...chunkResults);
    }
    
    // Final safety check: if somehow we still have a mismatch, log it
    if (allResults.length !== texts.length) {
      logger.warn(`[${this.providerName}] Final batch result count mismatch! Expected ${texts.length}, got ${allResults.length}`);
    }

    return allResults;
  }

  _calculateTraditionalCharCount(texts) { return TraditionalTextProcessor.calculateTraditionalCharCount(texts); }
  
  /**
   * Standardized helper to capture and log the language detected by the provider's API.
   * This property is inherited by the TranslationEngine and used for metadata (e.g., TTS).
   * @param {string|null|undefined} lang - The raw language code from the API response
   * @protected
   */
  _setDetectedLanguage(lang) {
    if (lang && typeof lang === 'string' && lang.trim() !== '') {
      this.lastDetectedLanguage = lang.toLowerCase().trim();
      logger.debug(`[${this.providerName}] API detected source language: ${this.lastDetectedLanguage}`);
    }
  }

  async _translateChunk() { throw new Error(`_translateChunk not implemented by ${this.providerName}`); }
}
