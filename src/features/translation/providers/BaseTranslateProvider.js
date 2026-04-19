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
    return TraditionalTextProcessor.needsChunking(texts, this.constructor.chunkingStrategy, this.constructor.characterLimit, this.constructor.maxChunksPerBatch);
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
    
    const chunks = this._createChunks(texts);
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
          { sessionId }
        );

        const statsAfter = sessionId ? statsManager.getSessionSummary(sessionId) : null;
        const actualChunkChars = statsAfter ? (statsAfter.chars - charsBefore) : this._calculateTraditionalCharCount(chunk.texts);
        const originalChunkChars = chunk.texts.reduce((sum, t) => sum + (t?.length || 0), 0);

        allResults.push(...chunkResponse);
        await TraditionalStreamManager.streamChunkResults(this.providerName, chunkResponse, chunk.texts, chunkIndex, messageId, sourceLang, targetLang, actualChunkChars, originalChunkChars);
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

  _createChunks(texts) {
    return TraditionalTextProcessor.createChunks(texts, this.providerName, this.constructor.chunkingStrategy, this.constructor.characterLimit, this.constructor.maxChunksPerBatch);
  }

  async _traditionalBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority, sessionId, expectedFormat) {
    logger.debug(`[${this.providerName}] Starting traditional batch translation for ${texts.length} texts (Format: ${expectedFormat || 'default'})`);
    const context = `${this.providerName.toLowerCase()}-traditional-batch`;
    const chunks = this._createChunks(texts);
    const allResults = [];

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
        { sessionId }
      );

      // Handle different response formats (Array, results object, or raw String)
      let chunkResults;
      if (Array.isArray(chunkResponse)) {
        chunkResults = chunkResponse;
      } else if (chunkResponse?.results && Array.isArray(chunkResponse.results)) {
        chunkResults = chunkResponse.results;
      } else if (typeof chunkResponse === 'string') {
        chunkResults = [chunkResponse];
      } else {
        chunkResults = chunk.texts.map(() => '');
      }

      allResults.push(...chunkResults);
    }
    return allResults;
  }

  _calculateTraditionalCharCount(texts) { return TraditionalTextProcessor.calculateTraditionalCharCount(texts); }
  
  async _translateChunk() { throw new Error(`_translateChunk not implemented by ${this.providerName}`); }
}
