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
   * @param {string|string[]} text - Text or array of texts to translate
   * @param {string} sourceLang - Requested source language
   * @param {string} targetLang - Requested target language
   * @param {object} options - Translation options and engine reference
   * @returns {Promise<string|string[]|object>} Translated text or status object
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
    const isArrayInput = Array.isArray(text);
    const inputCount = isArrayInput ? text.length : 1;

    // 1. Language Pre-processing
    const detectionText = isArrayInput ? text.join(' ') : text;
    let [sl, tl] = await this._prepareLanguages(detectionText, sourceLang, targetLang, globalSource, globalTarget, translateMode, providerName);

    // 2. Normalize to provider-specific codes
    const providerSourceLang = provider._getLangCode(sl);
    const providerTargetLang = provider._getLangCode(tl);

    if (providerSourceLang === providerTargetLang && providerSourceLang !== AUTO_DETECT_VALUE) {
      logger.debug(`[Coordinator] Identical languages (${providerSourceLang}). Skipping.`);
      return text;
    }

    // 3. Handle JSON Detection & Strategy
    const jsonInfo = options.rawJsonPayload ? { isJson: false, parsed: null } : this._detectJsonMode(text, provider);
    
    // 4. Determine Execution Strategy
    const strategy = this._resolveExecutionStrategy(provider, jsonInfo.isJson, options);
    
    logger.debug(`[Coordinator] 🚀 Start: ${providerName} | Mode: ${translateMode} | Segments: ${inputCount} | Stream: ${strategy.useStreaming}`);

    // 5. Initialize Streaming if needed
    if (strategy.useStreaming && !jsonInfo.isJson) {
      await this._initializeStreaming(provider, text, messageId, engine, sessionId, options.sender);
    }

    // 6. Execute based on strategy
    try {
      let result;
      if (jsonInfo.isJson && !options.rawJsonPayload) {
        logger.debug(`[Coordinator] Strategy: JSON Wrapped`);
        result = await this._executeJsonWrapped(provider, jsonInfo.parsed, providerSourceLang, providerTargetLang, translateMode, options);
      } else {
        result = await this._executeStandard(provider, text, providerSourceLang, providerTargetLang, translateMode, options, strategy);
      }

      // If we are in streaming mode, we return a status object so the Engine knows
      if (strategy.useStreaming && !jsonInfo.isJson) {
        return { success: true, streaming: true, messageId };
      }

      // 7. Post-processing & Normalization
      let finalResult = result;
      const isTraditional = strategy.type === ProviderTypes.TRANSLATE;

      // A. AI Post-processing
      if (strategy.type === ProviderTypes.AI && typeof result === 'string') {
        finalResult = AIResponseParser.cleanAIResponse(result);
      } 
      
      // B. Traditional Splitting Logic
      if (isTraditional && isArrayInput && inputCount > 1) {
        const isAlreadyCorrectArray = Array.isArray(finalResult) && finalResult.length === inputCount;
        if (!isAlreadyCorrectArray) {
          logger.debug(`[Coordinator] Result count mismatch (${Array.isArray(finalResult) ? finalResult.length : 'string'} vs ${inputCount}). Applying split.`);
          const rawString = Array.isArray(finalResult) ? finalResult[0] : finalResult;
          if (typeof rawString === 'string') {
            finalResult = await providerCoordinator._robustSplit(rawString, text, provider);
          }
        }
      }

      // 8. Output Normalization (Prevent [object Object])
      if (!isArrayInput && !jsonInfo.isJson) {
        const singleVal = Array.isArray(finalResult) ? finalResult[0] : finalResult;
        return this._ensureString(singleVal);
      }

      if (Array.isArray(finalResult)) {
        return finalResult.map(item => this._ensureString(item));
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
   * Helper to ensure any value is converted to a clean string.
   * @private
   */
  _ensureString(val) {
    if (val === null || val === undefined) return "";
    if (typeof val === 'string') return val;
    if (typeof val === 'object') {
      return val.text || val.t || val.translatedText || JSON.stringify(val);
    }
    return String(val);
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
      logger.warn(`[Coordinator] Split mismatch: got ${segments.length}, expected ${expectedCount}`);
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
      if (typeof text !== 'string') return { isJson: false, parsed: null };
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
    const providerType = providerClass.type;

    // Decide if we should use streaming
    const supportsStreaming = providerClass.supportsStreaming !== false;
    const isSelectElement = mode === TranslationMode.Select_Element;
    const isPageBatch = mode === TranslationMode.Page;
    
    let useStreaming = false;
    // Don't stream for Page Batch as it has its own collector
    if (messageId && engine && supportsStreaming && !isPageBatch) {
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
    const results = Array.isArray(translatedSegments) ? translatedSegments : [translatedSegments];
    if (results.length === jsonArray.length) {
      const translatedJson = jsonArray.map((item, index) => ({
        ...item,
        text: results[index] || "",
      }));
      return JSON.stringify(translatedJson, null, 2);
    }
    
    logger.error(`[Coordinator] JSON mismatch: ${results.length} vs ${jsonArray.length}`);
    return results.join('\n');
  }

  /**
   * The core execution logic that delegates to the provider's batching or single translation.
   * @private
   */
  async _executeStandard(provider, text, sourceLang, targetLang, mode, options, strategy) {
    const { messageId, engine, sessionId, priority } = options;
    const texts = Array.isArray(text) ? text : [text];

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
