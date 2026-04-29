/**
 * Base AI Provider - Enhanced base class for AI translation services (Gemini, OpenAI, etc.)
 * Provides centralized batching, prompt preparation, and streaming support for AI models.
 */

import { BaseProvider } from "@/features/translation/providers/BaseProvider.js";
import { 
  getProviderStreaming, 
  getProviderBatching,
  getProviderFeatures
} from "@/features/translation/core/ProviderConfigurations.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ResponseFormat } from "@/shared/config/translationConstants.js";
import { AIConversationHelper } from "./utils/AIConversationHelper.js";
import { AIResponseParser } from "./utils/AIResponseParser.js";
import { AITextProcessor } from "./utils/AITextProcessor.js";
import { TranslationMode, getProviderOptimizationLevelAsync } from "@/shared/config/config.js";

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'BaseAIProvider');

export class BaseAIProvider extends BaseProvider {
  // AI-specific capabilities - to be overridden by subclasses
  static isAI = true;
  static supportsDictionary = true;

  /**
   * Configuration Resolvers - Unified with ProviderConfigurations.js and User Levels
   */
  async getSupportsStreaming() {
    const level = await getProviderOptimizationLevelAsync(this.providerName);
    return getProviderStreaming(this.providerName, level).enabled;
  }

  async getBatchingConfig(mode = null) {
    const level = await getProviderOptimizationLevelAsync(this.providerName);
    return getProviderBatching(this.providerName, mode, level);
  }

  async getBatchStrategy(mode = null) {
    const config = await this.getBatchingConfig(mode);
    return config.strategy || 'json';
  }

  async getSupportsImageTranslation() {
    const level = await getProviderOptimizationLevelAsync(this.providerName);
    return getProviderFeatures(this.providerName, level).supportsImageTranslation;
  }

  constructor(providerName) {
    super(providerName);
  }

  /**
   * Enhanced batch translation with streaming support
   */
  async _batchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority, sessionId, expectedFormat) {
    const supportsStreaming = await this.getSupportsStreaming();
    const batchStrategy = await this.getBatchStrategy(translateMode);

    // 1. Try streaming if supported and beneficial
    if (supportsStreaming && await this._shouldUseStreaming(texts, messageId, engine, translateMode)) {
      return this._streamingBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority, sessionId, expectedFormat);
    }

    // 2. If not streaming but segments exist, use the provider's batch strategy (e.g. smart JSON batching)
    if (texts.length >= 1 && (batchStrategy === 'json' || batchStrategy === 'smart')) {
      return this._translateBatch(texts, sourceLang, targetLang, translateMode, abortController, engine, messageId, sessionId, null, expectedFormat, priority);
    }

    // 3. Fallback to traditional sequential batching for single segments or non-JSON providers
    return this._traditionalBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority, sessionId, expectedFormat);
  }

  /**
   * Entry point for image translation with rate limiting
   */
  async translateImage(base64Image, sourceLang, targetLang, options = {}) {
    const { priority, sessionId, abortController, messageId } = options;
    const context = `${this.providerName.toLowerCase()}-image-translation`;

    return await this._executeWithRateLimit(
      (opts) => this._translateImageInternal(base64Image, sourceLang, targetLang, { ...opts, ...options }),
      context,
      priority,
      { sessionId, abortController, messageId }
    );
  }

  /**
   * Abstract method for internal image translation logic
   * @protected
   */
  async _translateImageInternal() {
    throw new Error(`translateImage not supported by ${this.providerName}`);
  }

  /**
   * Determine if streaming should be used for this request
   */
  async _shouldUseStreaming(texts, messageId, engine, translateMode) {
    // Disable internal AI streaming for Select Element or Page modes 
    if (translateMode === TranslationMode.Select_Element || translateMode === TranslationMode.Page) {
      return false;
    }

    const supportsStreaming = await this.getSupportsStreaming();
    return supportsStreaming && 
           messageId && 
           engine && 
           (texts.length > 1 || AITextProcessor.getTotalComplexity(texts) > 100);
  }

  /**
   * Batch translation implementation (e.g. using JSON)
   * @protected
   */
  async _translateBatch(texts, sourceLang, targetLang, translateMode, abortController, engine, messageId, sessionId, contextMetadata = null, expectedFormat = null, priority = null) {
    try {
      const { systemPrompt, userText } = await this._preparePromptAndText(texts, sourceLang, targetLang, translateMode, contextMetadata, sessionId);
      
      logger.debugLazy(() => [`[${this.providerName}] Batch Prompt preparation complete`, { 
        systemPrompt, 
        userText: typeof userText === 'string' ? userText : JSON.parse(userText) 
      }]);

      // Ensure promptText is a string for the AI API
      const finalUserText = typeof userText === 'string' ? userText : JSON.stringify(userText);
      const context = `${this.providerName.toLowerCase()}-batch-translation`;

      const response = await this._executeWithRateLimit(
        (opts) => this._callAI(systemPrompt, finalUserText, {
          ...opts,
          abortController,
          messageId,
          sessionId,
          mode: translateMode,
          sourceLang,
          targetLang,
          isBatch: true,
          expectedFormat: expectedFormat || ResponseFormat.JSON_ARRAY
        }),
        context,
        priority,
        { sessionId, abortController, messageId }
      );

      // Stats recording is handled by ProviderRequestEngine. 
      // Orchestrators (like OptimizedJsonHandler or UnifiedService) handle the reporting.
      return AIResponseParser.parseBatchResult(response, texts.length, texts, this.providerName, expectedFormat || ResponseFormat.JSON_ARRAY);
    } catch (error) {
      if (sessionId) {
        import('../core/TranslationStatsManager.js').then(m => {
          m.statsManager.recordError(this.providerName, sessionId);
        }).catch(() => { /* ignore */ });
      }
      
      const { matchErrorToType, isFatalError } = await import('@/shared/error-management/ErrorMatcher.js');
      const errorType = error.type || matchErrorToType(error);
      const isFatal = isFatalError(error) || isFatalError(errorType);

      logger.error(`[${this.providerName}] Batch translation failed:`, error.message);
      
      // CRITICAL FALLBACK: ONLY return clean original text if the error is non-fatal (like parsing error)
      // For fatal errors (502, 429, 401), we MUST throw to inform the UI and stop the process.
      if (!isFatal && Array.isArray(texts)) {
        logger.warn(`[${this.providerName}] Non-fatal error, falling back to original text for mapping safety`);
        return texts.map(t => typeof t === 'object' ? (t.t || t.text || "") : (t || ""));
      }
      
      throw error;
    }
  }

  /**
   * Traditional sequential translation for small segments
   */
  async _traditionalBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority, sessionId, expectedFormat) {
    const results = [];
    const context = `${this.providerName.toLowerCase()}-traditional-sequential`;

    for (let i = 0; i < texts.length; i++) {
      if (abortController?.signal?.aborted) throw new Error('Cancelled');
      
      const text = texts[i];
      const { systemPrompt, userText } = await this._preparePromptAndText(text, sourceLang, targetLang, translateMode, null, sessionId);
      
      logger.debugLazy(() => [`[${this.providerName}] Traditional Prompt preparation complete`, { systemPrompt, userText }]);
      const chunkContext = `${context}-segment-${i + 1}/${texts.length}`;

      try {
        const response = await this._executeWithRateLimit(
          (opts) => this._callAI(systemPrompt, userText, {
            ...opts,
            abortController,
            messageId,
            sessionId,
            mode: translateMode,
            sourceLang,
            targetLang,
            expectedFormat: expectedFormat || ResponseFormat.STRING
          }),
          chunkContext,
          priority,
          { sessionId, abortController, messageId }
        );
        
        results.push(AIResponseParser.cleanAIResponse(response, expectedFormat || ResponseFormat.STRING));
      } catch (error) {
        logger.error(`[${this.providerName}] Traditional segment translation failed:`, error.message);
        // Return clean original text as fallback for this segment
        results.push(typeof text === 'object' ? (text.t || text.text || "") : (text || ""));
      }
    }
    return results.length === 1 && texts.length === 1 ? results[0] : results;
  }

  /**
   * Streaming batch translation implementation
   * To be implemented by subclasses (e.g. OpenAI, Gemini)
   * @protected
   */
  async _streamingBatchTranslate() {
    throw new Error(`_streamingBatchTranslate not implemented by ${this.providerName}`);
  }

  /**
   * Helper to prepare the prompt and text for AI models
   * @protected
   */
  async _preparePromptAndText(texts, sourceLang, targetLang, translateMode, contextMetadata, sessionId = null) {
    const isBatch = Array.isArray(texts);
    return await AIConversationHelper.preparePromptAndText(texts, sourceLang, targetLang, translateMode, this.constructor.type, sessionId, isBatch, contextMetadata);
  }

  /**
   * Abstract method to call the actual AI API
   * @protected
   */
  async _callAI() {
    throw new Error(`_callAI not implemented by ${this.providerName}`);
  }
}
