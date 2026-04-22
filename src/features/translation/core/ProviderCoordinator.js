/**
 * Provider Coordinator - Centralized orchestration hub for translation requests
 * Manages language normalization, JSON detection, streaming decisions, and post-processing.
 */

import { TRANSLATION_CONSTANTS, ResponseFormat } from "@/shared/config/translationConstants.js";
import { ProviderTypes } from "@/features/translation/providers/ProviderConstants.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { LanguageSwappingService } from "@/features/translation/providers/LanguageSwappingService.js";
import { LanguageDetectionService } from "@/shared/services/LanguageDetectionService.js";
import { AIResponseParser } from "@/features/translation/providers/utils/AIResponseParser.js";
import { TranslationMode } from "@/shared/config/config.js";
import { isFatalError, matchErrorToType } from "@/shared/error-management/ErrorMatcher.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'ProviderCoordinator');

export class ProviderCoordinator {
  /**
   * Orchestrates the translation process for a given provider and text.
   */
  async execute(provider, text, sourceLang, targetLang, options = {}) {
    const providerName = provider.providerName;
    const { messageId, engine, sessionId, mode } = options;
    const translateMode = mode || TranslationMode.Selection;

    // 1. Language Detection & Swapping (Bilingual logic / Auto-detect swap)
    // Perform this BEFORE normalization to use standard codes
    let processedSourceLang = sourceLang;
    let processedTargetLang = targetLang;
    
    // We only swap if we have original languages (usually from TranslationEngine)
    // If not provided, we assume current source/target are the "original" ones
    const originalSource = options.originalSourceLang || sourceLang;
    const originalTarget = options.originalTargetLang || targetLang;

    try {
      const sampleText = Array.isArray(text) ? text.join(' ') : (typeof text === 'string' ? text : '');

      // 1a. Apply Language Swapping (Bilingual Logic)
      // This will only perform detection if bilingual is enabled
      const [swappedSource, swappedTarget] = await LanguageSwappingService.applyLanguageSwapping(
        sampleText,
        sourceLang,
        targetLang,
        originalSource,
        originalTarget,
        { providerName, mode: translateMode }
      );

      processedSourceLang = swappedSource;
      processedTargetLang = swappedTarget;

      // 1b. Auto-Detection Fallback
      // If we are still at 'auto' (meaning bilingual was disabled or didn't swap),
      // we must detect the language now to provide a concrete code to the provider.
      if (processedSourceLang === AUTO_DETECT_VALUE) {
        const detectedLanguage = await LanguageDetectionService.detect(sampleText, { url: options.url });
        if (detectedLanguage) {
          logger.debug(`[Coordinator] Using detected source language: ${detectedLanguage} (instead of auto)`);
          processedSourceLang = detectedLanguage;
        }
      }

      if (processedSourceLang !== sourceLang || processedTargetLang !== targetLang) {
        logger.debug(`[Coordinator] Final language resolution: ${processedSourceLang} → ${processedTargetLang}`);
      }
    } catch (e) {
      logger.warn(`[Coordinator] Language swapping failed:`, e);
    }

    // 2. Language Normalization (Conversion to Provider-specific formats)
    const { source: providerSourceLang, target: providerTargetLang } = this._normalizeLanguages(provider, processedSourceLang, processedTargetLang);

    // 3. JSON Detection (Check if input is a wrapped JSON structure)
    const jsonInfo = this._detectJsonStructure(text);

    // 3. Metadata Awareness
    const inputCount = Array.isArray(text) ? text.length : (jsonInfo.isJson ? jsonInfo.parsed.length : 1);
    options.textLength = typeof text === 'string' ? text.length : (jsonInfo.isJson ? JSON.stringify(jsonInfo.parsed).length : 0);

    // 4. Resolve strategy and expected format
    const strategy = this._resolveExecutionStrategy(provider, jsonInfo.isJson, options);
    const expectedFormat = options.expectedFormat || (jsonInfo.isJson ? ResponseFormat.JSON_OBJECT : (Array.isArray(text) ? ResponseFormat.JSON_ARRAY : ResponseFormat.STRING));
    options.expectedFormat = expectedFormat;
    
    logger.debug(`[Coordinator] Start: ${providerName} | Mode: ${translateMode} | Segments: ${inputCount} | Format: ${expectedFormat}`);

    // 5. Initialize Streaming if needed
    // Only enable coordinator-level streaming if not already handled by an orchestrator (rawJsonPayload)
    if (strategy.useStreaming && expectedFormat !== ResponseFormat.JSON_OBJECT && !options.rawJsonPayload) {
      await this._initializeStreaming(provider, text, messageId, engine, sessionId, options.sender);
    }

    // 6. Execute based on strategy
    try {
      let result;
      if (jsonInfo.isJson && !options.rawJsonPayload) {
        logger.debug(`[Coordinator] Strategy: JSON Wrapped`);
        result = await this._executeJsonWrapped(provider, jsonInfo.parsed, providerSourceLang, providerTargetLang, translateMode, options);
      } else {
        result = await this._executeStandard(provider, text, providerSourceLang, providerTargetLang, translateMode, options);
      }

      // If we are in coordinator-level streaming mode, we return a status object
      if (strategy.useStreaming && expectedFormat !== ResponseFormat.JSON_OBJECT && !options.rawJsonPayload) {
        return { success: true, streaming: true, messageId };
      }

      // 7. Post-processing & Normalization
      // Use the strict Response Contract to determine cleaning strategy
      let finalResult = result;
      if (strategy.type === ProviderTypes.AI) {
        finalResult = this._cleanResult(result, expectedFormat);
      } else {
        // Traditional providers normalization: If the provider correctly returned an array matching the input count, preserve it.
        if (Array.isArray(result) && result.length === inputCount) {
          finalResult = inputCount === 1 ? result[0] : result;
        } else {
          finalResult = this._ensureString(result);
          
          // CRITICAL for Select Element/Page Translate: If result is a single string but we had multiple inputs, split it
          if (typeof finalResult === 'string' && inputCount > 1) {
            const { TranslationSegmentMapper } = await import("@/utils/translation/TranslationSegmentMapper.js");
            const segments = Array.isArray(text) ? text : [text];
            finalResult = TranslationSegmentMapper.mapTranslationToOriginalSegments(
              finalResult, 
              segments, 
              TranslationSegmentMapper.STANDARD_DELIMITER,
              providerName
            );
          }
        }
      }

      // 8. Capture Detected Language & Register Feedback
      const detectedLanguage = provider.lastDetectedLanguage || processedSourceLang;
      
      // Register detection result back to the service for future hits (Layer 0)
      // SECURITY: Only register feedback if the user's initial request was 'auto'.
      // This prevents manual user errors from poisoning the cache.
      const isAutoRequest = sourceLang === AUTO_DETECT_VALUE || !sourceLang;
      
      if (isAutoRequest && provider.lastDetectedLanguage && provider.lastDetectedLanguage !== AUTO_DETECT_VALUE) {
        const sampleText = Array.isArray(text) ? text[0] : (typeof text === 'string' ? text : '');
        if (sampleText) {
          LanguageDetectionService.registerDetectionResult(sampleText, provider.lastDetectedLanguage, {
            url: options.url,
            tabId: options.tabId
          });
        }
      }

      // Return unified response object
      return {
        translatedText: finalResult,
        detectedLanguage: detectedLanguage,
        provider: providerName,
        sourceLanguage: processedSourceLang,
        targetLanguage: processedTargetLang
      };
    } catch (error) {
      const errorType = matchErrorToType(error);
      
      if (errorType === ErrorTypes.USER_CANCELLED) {
        logger.debug(`[Coordinator] Execution cancelled by user for ${providerName}`);
      } else {
        logger.error(`[Coordinator] Execution failed for ${providerName}:`, error.message);
      }

      if (isFatalError(error)) throw error;
      return Array.isArray(text) ? text.map(t => typeof t === 'object' ? (t.t || t.text) : t) : text;
    }
  }

  /**
   * Internal helper to normalize languages using the provider's logic.
   * @private
   */
  _normalizeLanguages(provider, source, target) {
    if (typeof provider.convertLanguage === 'function') {
      return {
        source: provider.convertLanguage(source),
        target: provider.convertLanguage(target)
      };
    }
    return { source, target };
  }

  /**
   * Detects if the input string is a valid JSON array of segments.
   * @private
   */
  _detectJsonStructure(text) {
    if (typeof text !== 'string') return { isJson: false };
    
    const trimmed = text.trim();
    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      try {
        const parsed = JSON.parse(trimmed);
        return { isJson: true, parsed };
      } catch {
        return { isJson: false };
      }
    }
    return { isJson: false };
  }

  /**
   * Resolves the execution strategy (AI vs Traditional, Streaming, etc.)
   * @private
   */
  _resolveExecutionStrategy(provider, isJsonInput, options) {
    const providerClass = provider.constructor;
    const providerType = providerClass.isAI ? ProviderTypes.AI : ProviderTypes.TRANSLATE;
    const { mode, messageId, engine } = options;

    // Decide if we should use streaming
    const supportsStreaming = providerClass.supportsStreaming !== false;
    const isSelectElement = mode === TranslationMode.Select_Element;
    const isPageBatch = mode === TranslationMode.Page;
    const expectedFormat = options.expectedFormat;
    
    let useStreaming = false;
    // Don't use coordinator streaming for modes that have their own streaming orchestration (Select Element, Page)
    if (messageId && engine && supportsStreaming && !isSelectElement && !isPageBatch && expectedFormat !== ResponseFormat.JSON_OBJECT) {
      if (providerType === ProviderTypes.AI) {
        useStreaming = (options.textLength > TRANSLATION_CONSTANTS.STREAMING_THRESHOLDS.AI);
      } else {
        useStreaming = (options.textLength > TRANSLATION_CONSTANTS.STREAMING_THRESHOLDS.TRADITIONAL);
      }
    }

    return {
      type: providerType,
      useStreaming,
      isJsonInput
    };
  }

  /**
   * Initializes the streaming session using the global streaming manager.
   * @private
   */
  async _initializeStreaming(provider, text, messageId, engine, sessionId, sender) {
    if (!messageId || !engine) return;

    try {
      const { streamingManager } = await import("./StreamingManager.js");
      const segments = Array.isArray(text) ? text : [text];
      
      streamingManager.initializeStream(messageId, sender, provider, segments, sessionId);
      logger.debug(`[Coordinator] Streaming initialized for messageId: ${messageId}`);
    } catch (error) {
      logger.error(`[Coordinator] Failed to initialize streaming:`, error.message);
    }
  }

  /**
   * Executes translation for JSON-wrapped content (like Page Translation).
   * @private
   */
  async _executeJsonWrapped(provider, jsonArray, sourceLang, targetLang, mode, options) {
    // Determine the best way to translate the JSON array based on provider type
    // AI providers prefer the whole array, Traditional providers usually need segments
    const results = await provider.translate(jsonArray, sourceLang, targetLang, {
      ...options,
      rawJsonPayload: true // Tell provider not to re-wrap or re-detect JSON
    });

    if (Array.isArray(results) && results.length === jsonArray.length) {
      // Re-map back to original JSON structure
      const translatedJson = jsonArray.map((item, idx) => {
        if (typeof item === 'object') {
          return { ...item, t: results[idx] || (item.t || item.text) };
        }
        return results[idx];
      });
      return JSON.stringify(translatedJson, null, 2);
    }
    
    logger.error(`[Coordinator] JSON mismatch: ${results?.length} vs ${jsonArray.length}`);
    return Array.isArray(results) ? results.join('\n') : String(results);
  }

  /**
   * The core execution logic that delegates to the provider's batching or single translation.
   * @private
   */
  async _executeStandard(provider, text, sourceLang, targetLang, mode, options) {
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
        sessionId,
        options.expectedFormat
      );
    }

    // Fallback to single translate
    return await provider.translate(text, sourceLang, targetLang, options);
  }

  /**
   * Cleans the result using the AIResponseParser based on the expected contract.
   * @private
   */
  _cleanResult(result, expectedFormat) {
    if (!result) return "";

    // If result is already an array, clean each element
    if (Array.isArray(result)) {
      return result.map(item => AIResponseParser.cleanAIResponse(item, ResponseFormat.STRING));
    }

    // Use the contract-aware cleaner
    return AIResponseParser.cleanAIResponse(result, expectedFormat);
  }

  /**
   * Ensures the result is a clean string, avoiding [object Object] leaks.
   * @private
   */
  _ensureString(result) {
    if (result === null || result === undefined) return "";
    if (typeof result === 'string') return result;
    if (Array.isArray(result)) return result.join('\n');
    
    // If it's an object from a specialized orchestrator, try to find text
    if (typeof result === 'object') {
      return result.t || result.text || result.translatedText || JSON.stringify(result);
    }
    
    return String(result);
  }
}

// Export singleton instance
export const providerCoordinator = new ProviderCoordinator();
