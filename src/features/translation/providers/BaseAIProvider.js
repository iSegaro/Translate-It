/**
 * Base AI Provider - Enhanced base class for AI translation services (Gemini, OpenAI, etc.)
 * Provides centralized batching, prompt preparation, and streaming support for AI models.
 */

import { BaseProvider } from "@/features/translation/providers/BaseProvider.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ResponseFormat } from "@/shared/config/translationConstants.js";
import { AIConversationHelper } from "./utils/AIConversationHelper.js";
import { AIResponseParser } from "./utils/AIResponseParser.js";
import { AITextProcessor } from "./utils/AITextProcessor.js";
import { TranslationMode } from "@/shared/config/config.js";

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'BaseAIProvider');

export class BaseAIProvider extends BaseProvider {
  // AI-specific capabilities - to be overridden by subclasses
  static isAI = true;
  static supportsStreaming = true;
  static batchStrategy = 'json'; // default to JSON batching for AI
  static supportsDictionary = false;

  constructor(providerName) {
    super(providerName);
  }

  /**
   * Enhanced batch translation with streaming support
   */
  async _batchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority, sessionId, expectedFormat) {
    // 1. Try streaming if supported and beneficial
    if (this.constructor.supportsStreaming && this._shouldUseStreaming(texts, messageId, engine, translateMode)) {
      return this._streamingBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority, sessionId, expectedFormat);
    }

    // 2. If not streaming but multiple segments exist, use the provider's batch strategy (e.g. JSON batching)
    if (texts.length > 1 && this.constructor.batchStrategy === 'json') {
      return this._translateBatch(texts, sourceLang, targetLang, translateMode, abortController, engine, messageId, sessionId, null, expectedFormat);
    }

    // 3. Fallback to traditional sequential batching for single segments or non-JSON providers
    return this._traditionalBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority, sessionId, expectedFormat);
  }

  /**
   * Determine if streaming should be used for this request
   */
  _shouldUseStreaming(texts, messageId, engine, translateMode) {
    // Disable internal AI streaming for Select Element or Page modes 
    if (translateMode === TranslationMode.Select_Element || translateMode === TranslationMode.Page) {
      return false;
    }

    return this.constructor.supportsStreaming && 
           messageId && 
           engine && 
           (texts.length > 1 || AITextProcessor.getTotalComplexity(texts) > 100);
  }

  /**
   * Batch translation implementation (e.g. using JSON)
   * @protected
   */
  async _translateBatch(texts, sourceLang, targetLang, translateMode, abortController, engine, messageId, sessionId, contextMetadata = null, expectedFormat = null) {
    try {
      const { systemPrompt, userText } = await this._preparePromptAndText(texts, sourceLang, targetLang, translateMode, contextMetadata, sessionId);
      
      logger.debugLazy(() => [`[${this.providerName}] Batch Prompt preparation complete`, { 
        systemPrompt, 
        userText: typeof userText === 'string' ? userText : JSON.parse(userText) 
      }]);

      // Ensure promptText is a string for the AI API
      const finalUserText = typeof userText === 'string' ? userText : JSON.stringify(userText);

      const response = await this._callAI(systemPrompt, finalUserText, {
        abortController,
        messageId,
        sessionId,
        mode: translateMode,
        sourceLang,
        targetLang,
        isBatch: true,
        expectedFormat: expectedFormat || ResponseFormat.JSON_ARRAY
      });

      // Stats recording is handled by ProviderRequestEngine. 
      // Orchestrators (like OptimizedJsonHandler or UnifiedService) handle the reporting.
      return AIResponseParser.parseBatchResult(response, texts.length, texts, this.providerName, expectedFormat || ResponseFormat.JSON_ARRAY);
    } catch (error) {
      logger.error(`[${this.providerName}] Batch translation failed:`, error.message);
      throw error;
    }
  }

  /**
   * Traditional sequential translation for small segments
   */
  async _traditionalBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority, sessionId, expectedFormat) {
    const results = [];
    for (const text of texts) {
      if (abortController?.signal?.aborted) throw new Error('Cancelled');
      
      const { systemPrompt, userText } = await this._preparePromptAndText(text, sourceLang, targetLang, translateMode, null, sessionId);
      
      logger.debugLazy(() => [`[${this.providerName}] Traditional Prompt preparation complete`, { systemPrompt, userText }]);

      const response = await this._callAI(systemPrompt, userText, {
        abortController,
        messageId,
        sessionId,
        mode: translateMode,
        sourceLang,
        targetLang,
        expectedFormat: expectedFormat || ResponseFormat.STRING
      });
      
      results.push(AIResponseParser.cleanAIResponse(response, expectedFormat || ResponseFormat.STRING));
    }
    return results.length === 1 && texts.length === 1 ? results[0] : results;
  }

  /**
   * Streaming batch translation implementation
   * @protected
   */
  async _streamingBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority, sessionId, expectedFormat) {
    // To be implemented by subclasses (e.g. OpenAI, Gemini)
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
