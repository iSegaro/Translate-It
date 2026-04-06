/**
 * Base Translate Provider - Enhanced base class for translation services (Google, Yandex, etc.)
 * Provides streaming support for chunk-based translation with real-time DOM updates
 */

import { BaseProvider } from "@/features/translation/providers/BaseProvider.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { TranslationMode } from "@/shared/config/config.js";
import { LanguageSwappingService } from "@/features/translation/providers/LanguageSwappingService.js";
import { streamingManager } from "@/features/translation/core/StreamingManager.js";
import { matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { TraditionalTextProcessor } from "./utils/TraditionalTextProcessor.js";
import { TraditionalStreamManager } from "./utils/TraditionalStreamManager.js";
import { TRANSLATION_CONSTANTS } from "@/shared/config/translationConstants.js";

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
   * Override translate method to handle traditional delimiter-based batching
   */
  async translate(text, sourceLang, targetLang, options) {
    const { mode: translateMode, originalSourceLang, originalTargetLang, messageId, engine, priority } = 
      typeof options === 'object' && options !== null ? options : { mode: options };

    const abortController = (messageId && engine) ? engine.getAbortController(messageId) : null;
    const sessionId = options?.sessionId || null;

    if (translateMode === TranslationMode.Field || translateMode === TranslationMode.Subtitle) sourceLang = AUTO_DETECT_VALUE;

    [sourceLang, targetLang] = await LanguageSwappingService.applyLanguageSwapping(
      text, sourceLang, targetLang, originalSourceLang, originalTargetLang,
      { providerName: this.providerName, useRegexFallback: true }
    );

    const sl = this._getLangCode(sourceLang);
    const tl = this._getLangCode(targetLang);
    if (sl === tl) return text;

    let textsToTranslate;
    let isJson = false;
    let parsedJson = null;

    try {
      const parsed = JSON.parse(text);
      if (this._isSpecificTextJsonFormat(parsed)) {
        isJson = true;
        parsedJson = parsed;
        textsToTranslate = parsed.map((item) => item.text || '');
      } else textsToTranslate = [text];
    } catch { textsToTranslate = [text]; }

    const translatedSegments = await this._batchTranslate(textsToTranslate, sl, tl, translateMode, engine, messageId, abortController, priority, sessionId);

    if (isJson && Array.isArray(translatedSegments)) {
      let finalSegments = translatedSegments;
      if (translatedSegments.length !== parsedJson.length) {
        if (translatedSegments.length > parsedJson.length) finalSegments = translatedSegments.slice(0, parsedJson.length);
        else finalSegments = [...translatedSegments, ...parsedJson.slice(translatedSegments.length).map(item => item.text || '')];
      }
      return JSON.stringify(parsedJson.map((item, index) => ({ ...item, text: finalSegments[index] || "" })), null, 2);
    }

    return translatedSegments[0];
  }

  /**
   * Enhanced batch translation with streaming support
   */
  async _batchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority, sessionId) {
    if (this.constructor.supportsStreaming && this._shouldUseStreaming(texts, messageId, engine, translateMode)) {
      return this._streamingBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority, sessionId);
    }
    return this._traditionalBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority, sessionId);
  }

  /**
   * Determine if streaming should be used
   */
  _shouldUseStreaming(texts, messageId, engine, translateMode = null) {
    if (!this.constructor.supportsStreaming || !messageId || !engine) return false;
    if (translateMode === TranslationMode.Page) return false;
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
  async _streamingBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority, sessionId) {
    logger.debug(`[${this.providerName}] Starting streaming translation for ${texts.length} texts`);
    
    if (messageId && engine) {
      try {
        const sender = engine.streamingSenders?.get(messageId) || null;
        streamingManager.initializeStream(messageId, sender, this, texts, sessionId);
      } catch (error) { logger.error(`[${this.providerName}] Failed to initialize streaming session:`, error); }
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
        const { rateLimitManager } = await import("@/features/translation/core/RateLimitManager.js");
        const { statsManager } = await import("@/features/translation/core/TranslationStatsManager.js");
        const statsBefore = sessionId ? statsManager.getSessionSummary(sessionId) : null;
        const charsBefore = statsBefore ? statsBefore.chars : 0;

        if (abortController) abortController.sessionId = sessionId;

        const chunkResults = await rateLimitManager.executeWithRateLimit(
          this.providerName,
          (opts) => this._translateChunk(chunk.texts, sourceLang, targetLang, translateMode, abortController, 0, chunk.texts.length, chunkIndex, chunks.length, { ...opts, originalCharCount: chunk.texts.reduce((sum, t) => sum + (t?.length || 0), 0) }),
          chunkContext,
          priority,
          { sessionId }
        );

        const statsAfter = sessionId ? statsManager.getSessionSummary(sessionId) : null;
        const actualChunkChars = statsAfter ? (statsAfter.chars - charsBefore) : this._calculateTraditionalCharCount(chunk.texts);
        const originalChunkChars = chunk.texts.reduce((sum, t) => sum + (t?.length || 0), 0);

        allResults.push(...chunkResults);
        await TraditionalStreamManager.streamChunkResults(this.providerName, chunkResults, chunk.texts, chunkIndex, messageId, sourceLang, targetLang, actualChunkChars, originalChunkChars);
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

  async _traditionalBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority, sessionId) {
    const context = `${this.providerName.toLowerCase()}-traditional-batch`;
    const chunks = this._createChunks(texts);
    const allResults = [];
    const { rateLimitManager } = await import("@/features/translation/core/RateLimitManager.js");

    for (let i = 0; i < chunks.length; i++) {
      if (abortController && abortController.signal.aborted) {
        const cancelError = new Error('Translation cancelled by user');
        cancelError.name = 'AbortError';
        cancelError.type = ErrorTypes.USER_CANCELLED;
        throw cancelError;
      }

      const chunk = chunks[i];
      const chunkContext = `${context}-chunk-${i + 1}/${chunks.length}`;

      try {
        if (abortController) abortController.sessionId = sessionId;
        const originalCharCount = chunk.texts.reduce((sum, t) => sum + (t?.length || 0), 0);

        const chunkResponse = await rateLimitManager.executeWithRateLimit(
          this.providerName,
          (opts) => this._translateChunk(chunk.texts, sourceLang, targetLang, translateMode, abortController, 0, chunk.texts.length, i, chunks.length, { ...opts, originalCharCount }),
          chunkContext,
          priority,
          { sessionId }
        );

        const chunkResults = Array.isArray(chunkResponse) ? chunkResponse : (chunkResponse?.results || []);
        allResults.push(...(chunkResults || chunk.texts.map(() => '')));
      } catch (error) { throw error; }
    }
    return allResults;
  }

  _calculateTraditionalCharCount(texts) { return TraditionalTextProcessor.calculateTraditionalCharCount(texts); }
  async _robustSplit(translatedText, originalSegments) {
    const expectedCount = originalSegments.length;
    if (expectedCount <= 1) return [translatedText];
    const { TranslationSegmentMapper } = await import("@/utils/translation/TranslationSegmentMapper.js");
    let segments = TranslationSegmentMapper.mapTranslationToOriginalSegments(translatedText, originalSegments, TRANSLATION_CONSTANTS.TEXT_DELIMITER, this.providerName);

    if (segments.length !== expectedCount) {
      if (segments.length > expectedCount) segments = segments.slice(0, expectedCount);
      else while (segments.length < expectedCount) segments.push("");
    }
    return segments.map(s => s ? s.trim() : "");
  }

  async _translateChunk() { throw new Error(`_translateChunk not implemented by ${this.providerName}`); }
}
