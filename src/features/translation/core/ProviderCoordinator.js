/**
 * Provider Coordinator - The orchestration hub for all translation activities.
 * Centralizes language swapping, JSON detection, mode resolution, and execution strategies.
 * 
 * Goals:
 * 1. Decouple orchestration logic from individual providers.
 * 2. Standardize translation workflow across AI and Traditional providers.
 * 3. Reduce bloat in BaseProvider and TranslationEngine.
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { LanguageSwappingService } from "@/features/translation/providers/LanguageSwappingService.js";
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { TranslationMode, getSourceLanguageAsync, getTargetLanguageAsync } from "@/shared/config/config.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';
import { ProviderTypes } from "@/features/translation/providers/ProviderConstants.js";
import { TRANSLATION_CONSTANTS } from "@/shared/config/translationConstants.js";
import { AIResponseParser } from "@/features/translation/providers/utils/AIResponseParser.js";

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'ProviderCoordinator');

export class ProviderCoordinator {
  /**
   * Orchestrates the translation process for any provider.
   * 
   * @param {object} provider - The provider instance (AI or Traditional)
   * @param {string} text - Text to translate
   * @param {string} sourceLang - Requested source language
   * @param {string} targetLang - Requested target language
   * @param {object} options - Translation options and engine reference
   * @returns {Promise<string|object>} Translated text or result object
   */
  async execute(provider, text, sourceLang, targetLang, options = {}) {
    const {
      mode: translateMode = TranslationMode.Selection,
      originalSourceLang: globalSource,
      originalTargetLang: globalTarget,
      messageId,
      engine,
      sessionId = options.messageId || null
    } = options;

    const providerName = provider.providerName || provider.constructor.name;
    logger.debug(`[Coordinator] Executing translation via ${providerName} (Mode: ${translateMode})`);

    // 1. Language Pre-processing
    // Ensure we pass a string for language detection, even if text is an array
    const detectionText = Array.isArray(text) ? text.join(' ') : text;
    let [sl, tl] = await this._prepareLanguages(detectionText, sourceLang, targetLang, globalSource, globalTarget, translateMode, providerName);

    // 2. Normalize to provider-specific codes
    const providerSourceLang = provider._getLangCode(sl);
    const providerTargetLang = provider._getLangCode(tl);

    if (providerSourceLang === providerTargetLang && providerSourceLang !== AUTO_DETECT_VALUE) {
      return text;
    }

    // 3. Handle JSON Detection & Strategy
    // If rawJsonPayload is true, it means the caller (like OptimizedJsonHandler) is already handling the structure
    const jsonInfo = options.rawJsonPayload ? { isJson: false, parsed: null } : this._detectJsonMode(text, provider);
    
    // 4. Determine Execution Strategy
    const strategy = this._resolveExecutionStrategy(provider, jsonInfo.isJson, options);
    
    // 5. Initialize Streaming if needed
    if (strategy.useStreaming && !jsonInfo.isJson) {
      await this._initializeStreaming(provider, text, messageId, engine, sessionId, options.sender);
    }

    // 6. Execute based on strategy
    try {
      let result;
      if (jsonInfo.isJson && !options.rawJsonPayload) {
        // Transparently handle JSON-in-text (e.g. from context menu)
        result = await this._executeJsonWrapped(provider, jsonInfo.parsed, providerSourceLang, providerTargetLang, translateMode, options);
      } else {
        // Standard execution (Single, Batch, or Stream)
        result = await this._executeStandard(provider, text, providerSourceLang, providerTargetLang, translateMode, options, strategy);
      }

      // 7. Post-processing
      let finalResult = result;
      const wasArrayInput = Array.isArray(text);
      const isTraditional = strategy.type === ProviderTypes.TRANSLATE;

      if (strategy.type === ProviderTypes.AI && typeof result === 'string') {
        finalResult = AIResponseParser.cleanAIResponse(result);
      } 
      
      // Handle Traditional Splitting: If we have a single string but expected multiple results
      if (isTraditional && wasArrayInput && text.length > 1) {
        const rawString = Array.isArray(finalResult) ? finalResult[0] : finalResult;
        if (typeof rawString === 'string') {
          finalResult = await providerCoordinator._robustSplit(rawString, text, provider);
        }
      }

      // 8. Output normalization: Return string if input was string (and not JSON mode)
      if (!wasArrayInput && !jsonInfo.isJson && Array.isArray(finalResult)) {
        return finalResult[0] || "";
      }

      return finalResult;
    } catch (error) {
      if (strategy.useStreaming) {
        await this._handleStreamError(messageId, error);
      }
      this._handleError(error, providerName);
      throw error;
    }
  }

  /**
   * Robustly splits a translated string back into segments based on original text.
   * @private
   */
  async _robustSplit(translatedText, originalSegments, provider) {
    const expectedCount = originalSegments.length;
    if (expectedCount <= 1) return [translatedText];
    
    const { TranslationSegmentMapper } = await import("@/utils/translation/TranslationSegmentMapper.js");
    
    let segments = TranslationSegmentMapper.mapTranslationToOriginalSegments(
      translatedText, 
      originalSegments, 
      TRANSLATION_CONSTANTS.TEXT_DELIMITER, 
      provider.providerName
    );

    if (segments.length !== expectedCount) {
      if (segments.length > expectedCount) segments = segments.slice(0, expectedCount);
      else while (segments.length < expectedCount) segments.push("");
    }
    return segments.map(s => s ? s.trim() : "");
  }

  /**
   * Initializes streaming session.
   * @private
   */
  async _initializeStreaming(provider, text, messageId, engine, sessionId, sender) {
    const { streamingManager } = await import("./StreamingManager.js");
    const texts = Array.isArray(text) ? text : [text];
    
    streamingManager.initializeStream(messageId, sender, provider, texts, sessionId);
    if (engine && engine.lifecycleRegistry) {
      engine.lifecycleRegistry.registerStreamingSender(messageId, sender);
    }
    logger.debug(`[Coordinator] Streaming initialized for messageId: ${messageId}`);
  }

  /**
   * Handles stream-specific errors.
   * @private
   */
  async _handleStreamError(messageId, error) {
    try {
      const { streamingManager } = await import("./StreamingManager.js");
      await streamingManager.handleStreamError(messageId, error);
    } catch (e) {
      logger.error(`[Coordinator] Failed to report stream error:`, e.message);
    }
  }

  /**
   * Prepares languages including swapping logic and mode-specific defaults.
   * @private
   */
  async _prepareLanguages(text, sourceLang, targetLang, globalSource, globalTarget, mode, providerName) {
    let sl = sourceLang;
    let tl = targetLang;

    // Mode-specific overrides
    if (mode === TranslationMode.Field || mode === TranslationMode.Subtitle) {
      sl = AUTO_DETECT_VALUE;
    }

    // Get globals if not provided
    const [gSource, gTarget] = await Promise.all([
      globalSource || getSourceLanguageAsync(),
      globalTarget || getTargetLanguageAsync()
    ]);

    // Apply swapping logic
    return LanguageSwappingService.applyLanguageSwapping(
      text, sl, tl, gSource, gTarget,
      { providerName, useRegexFallback: true }
    );
  }

  /**
   * Detects if the input text is a specific JSON format used by the extension.
   * @private
   */
  _detectJsonMode(text, provider) {
    try {
      const parsed = JSON.parse(text);
      const isJson = (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.every(item => typeof item === "object" && item !== null && typeof item.text === "string")
      );
      return { isJson, parsed };
    } catch {
      return { isJson: false, parsed: null };
    }
  }

  /**
   * Determines the best execution strategy for the given request.
   * @private
   */
  _resolveExecutionStrategy(provider, isJson, options) {
    const { mode, messageId, engine } = options;
    const providerClass = provider.constructor;
    const providerType = providerClass.type; // 'ai' or 'translate'

    // Decide if we should use streaming
    const supportsStreaming = providerClass.supportsStreaming !== false;
    const isSelectElement = mode === TranslationMode.Select_Element;
    
    let useStreaming = false;
    if (messageId && engine && supportsStreaming) {
      if (providerType === ProviderTypes.AI) {
        useStreaming = isSelectElement || (options.textLength > TRANSLATION_CONSTANTS.STREAMING_THRESHOLDS.AI);
      } else {
        useStreaming = isSelectElement && (options.textLength > TRANSLATION_CONSTANTS.STREAMING_THRESHOLDS.TRADITIONAL);
      }
    }

    return {
      type: providerType,
      isJson,
      useStreaming,
      isSelectElement
    };
  }

  /**
   * Executes translation for JSON-wrapped text.
   * @private
   */
  async _executeJsonWrapped(provider, jsonArray, sourceLang, targetLang, mode, options) {
    const textsToTranslate = jsonArray.map(item => item.text || '');
    
    // Re-use standard execution for the texts
    const translatedSegments = await this._executeStandard(
      provider, 
      textsToTranslate, 
      sourceLang, 
      targetLang, 
      mode, 
      options,
      this._resolveExecutionStrategy(provider, false, options)
    );

    // Reconstruct JSON
    if (Array.isArray(translatedSegments) && translatedSegments.length === jsonArray.length) {
      const translatedJson = jsonArray.map((item, index) => ({
        ...item,
        text: translatedSegments[index] || "",
      }));
      return JSON.stringify(translatedJson, null, 2);
    }
    
    logger.error(`[Coordinator] JSON mismatch: ${translatedSegments.length} vs ${jsonArray.length}`);
    return Array.isArray(translatedSegments) ? translatedSegments.join('\n') : translatedSegments;
  }

  /**
   * The core execution logic that delegates to the provider's batching or single translation.
   * @private
   */
  async _executeStandard(provider, text, sourceLang, targetLang, mode, options, strategy) {
    const { messageId, engine, sessionId, priority } = options;
    const texts = Array.isArray(text) ? text : [text];

    // Delegate to the provider's internal batching logic
    // Providers know best how to batch themselves, but we coordinate the call
    if (typeof provider._batchTranslate === 'function') {
      return await provider._batchTranslate(
        texts,
        sourceLang,
        targetLang,
        mode,
        engine,
        messageId,
        options.abortController || (engine ? engine.getAbortController(messageId) : null),
        priority,
        sessionId
      );
    }

    // Fallback/Legacy: direct translate call (rarely used now)
    throw new Error(`Provider ${provider.providerName} does not implement _batchTranslate`);
  }

  /**
   * Standard error handling and mapping.
   * @private
   */
  _handleError(error, providerName) {
    const errorType = error.type || matchErrorToType(error);
    logger.error(`[Coordinator] Error during translation via ${providerName}:`, error.message, `Type: ${errorType}`);
  }
}

// Export singleton
export const providerCoordinator = new ProviderCoordinator();
