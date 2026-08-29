/**
 * Translation Engine - Centralized translation hub for background service worker
 * Handles all translation requests from UI contexts via messaging.
 * Modularized version - delegates logic to specialized managers and utilities.
 */

import { ProviderFactory } from "@/features/translation/providers/ProviderFactory.js";
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import { MessageFormat, reconstructTranslationError, isStructuredTranslationError } from "@/shared/messaging/core/MessagingCore.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { isEmptyTranslationInput, isStructuredBatchInput } from "./translationInputHelpers.js";
import { 
  getSourceLanguageAsync, 
  getTargetLanguageAsync, 
  TranslationMode,
  getPopupMaxCharsAsync,
  getSidepanelMaxCharsAsync,
  getSelectionMaxCharsAsync,
  getSelectElementMaxCharsAsync
} from "@/shared/config/config.js";
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { resolveTranslationMode } from "../utils/translationModeHelper.js";
import { TranslationLifecycleRegistry } from "./managers/TranslationLifecycleRegistry.js";
import { TranslationHistoryManager } from "./managers/TranslationHistoryManager.js";
import { OptimizedJsonHandler } from "./managers/OptimizedJsonHandler.js";
import { TranslationBatcher } from "./utils/TranslationBatcher.js";

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'translation-engine');

function createPreCancelledResult(reason) {
  if (reason === 'user-cancelled') {
    return {
      success: false,
      cancelled: true,
      error: {
        type: ErrorTypes.USER_CANCELLED,
        message: 'Translation cancelled by user',
      },
    };
  }

  if (reason === 'timeout') {
    return {
      success: false,
      timedOut: true,
      error: {
        type: ErrorTypes.TRANSLATION_TIMEOUT,
        message: 'Translation timed out',
      },
    };
  }

  return {
    success: false,
    cancelled: true,
    error: {
      operationAborted: true,
      cancellationReason: reason || 'operation-abort',
      message: 'Translation operation aborted before execution',
    },
  };
}

export class TranslationEngine {
  constructor() {
    this.factory = new ProviderFactory();
    this.lifecycleRegistry = new TranslationLifecycleRegistry();
    this.historyManager = new TranslationHistoryManager();
    this.jsonHandler = new OptimizedJsonHandler();
    this.cache = new Map(); // Keep simple cache for now
  }

  /**
   * Handle incoming messages from UI contexts
   */
  async handleMessage(request, sender) {
    if (request.action === MessageActions.TRANSLATE) {
      try {
        return await this.handleTranslateMessage(request, sender);
      } catch (error) {
        logger.error("[TranslationEngine] Error handling message:", error);
        return this.formatError(error, request.context);
      }
    }
    return undefined;
  }

  /**
   * Handle translation request messages
   */
  async handleTranslateMessage(request, sender, executionContext = null) {
    if (!request || typeof request !== "object") {
      throw new Error(`Invalid request: expected object, got ${typeof request}`);
    }

    // Extract context and data with robust fallbacks
    let context = request.context || "unknown";
    let data = request.data || (request.text ? {
      text: request.text,
      provider: request.provider,
      sourceLanguage: request.sourceLanguage,
      targetLanguage: request.targetLanguage,
      mode: request.mode,
      options: request.options,
    } : null);

    if (!data) throw new Error("Invalid request: missing translation data");

    const messageId = request.messageId || data.messageId || `msg-${Date.now()}`;
    data.messageId = messageId;

    // Register and detect duplicate with context awareness
    const registration = this.lifecycleRegistry.registerRequest(messageId, data.text, context);
    if (registration === null) {
      return createPreCancelledResult(this.lifecycleRegistry.getCancellationReason(messageId));
    }

    try {
      const result = await this.executeTranslation(data, sender, context, executionContext);

      if (!result || typeof result !== "object") {
        throw new Error(`Translation failed: invalid result format (${typeof result})`);
      }

      if (result.success === undefined) {
        throw new Error(`Translation result missing 'success' property`);
      }
      
      this.lifecycleRegistry.unregisterRequest(messageId);
      return result;
    } catch (error) {
      this.lifecycleRegistry.unregisterRequest(messageId);
      return this.formatError(error, context);
    }
  }

  /**
   * Core translation execution logic with streaming and JSON optimization support
   */
  async executeTranslation(data, sender, uiContext = 'unknown', executionContext = null) {
    const { text, provider, sourceLanguage, targetLanguage } = data;
    let { mode } = data;

    if (typeof text === 'string' && text.trim() === '') {
      const error = new Error("Text to translate is required");
      error.type = ErrorTypes.TEXT_EMPTY;
      throw error;
    }

    if (isEmptyTranslationInput(text)) {
      throw new Error("Text to translate is required");
    }

    // Get provider instance
    const providerInstance = await this.getProvider(provider);
    if (!providerInstance) {
      throw new Error(`Provider '${provider}' not found or failed to initialize`);
    }

    const providerClass = providerInstance.constructor;
    const originalMode = mode; // Preserve the original mode (e.g., MouseHover)

    // 1. Dictionary / Mode Downgrade logic
    mode = await this._resolveTranslationMode(data, providerClass);
    data.mode = mode;

    // 2. Length Validation
    const lengthError = await this._validateTextLength(text, mode, provider);
    if (lengthError) return lengthError;

    // 3. Resolve global languages for context (Coordinator will handle swapping)
    const [originalSourceLang, originalTargetLang] = await Promise.all([
      getSourceLanguageAsync(),
      getTargetLanguageAsync()
    ]);

    // 4. Handle Optimized JSON strategy (structured batch modes)
    const isSelectJson = mode === TranslationMode.Select_Element && data.options?.rawJsonPayload;
    const isPdfJson = mode === TranslationMode.PDF && data.options?.rawJsonPayload;
    if (isSelectJson || isPdfJson) {
      logger.debug('[TranslationEngine] Using optimized structured batch strategy for provider:', provider);
      return await this.jsonHandler.execute(this, data, providerInstance, originalSourceLang, originalTargetLang, data.messageId, sender, uiContext, executionContext);
    }

    // 5. Standard execution via ProviderCoordinator
    let result = await providerInstance.translate(text, sourceLanguage, targetLanguage, {
      mode: mode,
      originalMode: originalMode, // Pass original mode for bilingual/swap logic
      uiContext: uiContext, // Pass UI context (popup, sidepanel, etc.)
      originalSourceLang,
      originalTargetLang,
      messageId: data.messageId,
      sessionId: data.sessionId || data.messageId,
      textLength: text.length,
      engine: this,
       sender: sender,
       executionContext
    });

    // Coordinator contract: returns a successful unified result OR throws.
    // Do NOT infer success from a raw string / missing success flag - that would be
    // silent success. These guards keep the contract loud.
    if (typeof result === 'string') {
      const invalidResult = new Error('Translation result was a raw string instead of a unified response');
      invalidResult.type = ErrorTypes.TRANSLATION_FAILED;
      throw invalidResult;
    }

    if (result.success === false) {
      const errorSource = isStructuredTranslationError(result.errorDetails)
        ? result.errorDetails
        : result.error || result;
      throw reconstructTranslationError(errorSource);
    }

    // Extract values from the unified coordinator response
    const { translatedText, detectedLanguage, targetLanguage: finalTargetLanguage, sourceLanguage: finalSourceLanguage } = result;

    // An empty string also represents "no translation". Earlier normalization
    // layers may convert missing provider output into "", so treat it the same
    // as null/undefined to avoid classifying an empty translation as success.
    if (translatedText === null || translatedText === undefined || translatedText === '') {
      const emptyResult = new Error('Translation returned no text');
      emptyResult.type = ErrorTypes.TRANSLATION_FAILED;
      throw emptyResult;
    }

    // Resolve the final source language, prioritizing the detected one if the requested one was 'auto'
    const resolvedSourceLanguage = (finalSourceLanguage === 'auto' || !finalSourceLanguage) 
      ? (detectedLanguage || finalSourceLanguage || sourceLanguage) 
      : (finalSourceLanguage || detectedLanguage || sourceLanguage);

    return {
      success: true,
      translatedText: translatedText,
      streaming: result.streaming,
      provider,
      sourceLanguage: resolvedSourceLanguage, 
      targetLanguage: finalTargetLanguage || targetLanguage, // Use swapped target language if available
      originalText: text,
      timestamp: Date.now(),
      mode: mode || "simple",
    };
  }

  async _resolveTranslationMode(data, providerClass) {
    return await resolveTranslationMode(data, providerClass);
  }

  /**
   * Validate text length against mode-specific limits.
   * @private
   */
  async _validateTextLength(text, mode, provider) {
    if (isStructuredBatchInput(text)) return null

    const isSelectElementMode = mode === TranslationMode.Select_Element || mode === TranslationMode.PDF;
    const isSelectionMode = mode === TranslationMode.Selection;
    const isPopupMode = mode === TranslationMode.Popup_Translate;
    const isSidepanelMode = mode === TranslationMode.Sidepanel_Translate;

    let maxChars = 50000; // Default safety limit
    
    if (isSelectElementMode) {
      maxChars = await getSelectElementMaxCharsAsync();
    } else if (isSidepanelMode) {
      maxChars = await getSidepanelMaxCharsAsync();
    } else if (isPopupMode) {
      maxChars = await getPopupMaxCharsAsync();
    } else if (isSelectionMode) {
      maxChars = await getSelectionMaxCharsAsync();
    }

    if (text.length > maxChars) {
      logger.warn(`[TranslationEngine] Text too long for mode ${mode}: ${text.length} > ${maxChars}`);
      return {
        success: false,
        error: {
          type: ErrorTypes.TEXT_TOO_LONG,
          message: `Text too long (${text.length.toLocaleString()} chars). Max allowed for this mode is ${maxChars.toLocaleString()} chars.`,
          context: mode,
          timestamp: Date.now()
        },
        translatedText: text, 
        provider, 
        mode
      };
    }

    // Still log a warning for large texts even if within limits
    if (text.length > 10000 && !isSelectElementMode) {
      logger.warn(`[TranslationEngine] Large text detected (${text.length.toLocaleString()} chars).`);
    }

    return null;
  }

  /**
   * Get or create provider instance from factory.
   */
  async getProvider(providerId) {
    try {
      return await this.factory.getProvider(providerId);
    } catch (error) {
      logger.error(`[TranslationEngine] Failed to get provider '${providerId}':`, error);
      return null;
    }
  }

  /**
   * Utility to format error responses consistently.
   */
  formatError(error, context) {
    return { 
      success: false, 
      error: MessageFormat.serializeTranslationError(error, {
        context: error?.context || context || "unknown",
      })
    };
  }

  // --- Delegation Methods ---
  
  async cancelTranslation(messageId, timeout = false, timeoutType, reason) {
    return await this.lifecycleRegistry.cancelTranslation(messageId, timeout, timeoutType, reason);
  }
  async cancelAllTranslations(context = null) { return await this.lifecycleRegistry.cancelAllTranslations(context); }
  getActiveTranslationIds(context = null) { return this.lifecycleRegistry.getActiveTranslationIds(context); }
  getAbortController(messageId) { return this.lifecycleRegistry.getAbortController(messageId); }
  getCancellationReason(messageId) { return this.lifecycleRegistry.getCancellationReason(messageId); }
  registerStreamingSender(messageId, sender) { return this.lifecycleRegistry.registerStreamingSender(messageId, sender); }
  getStreamingSender(messageId) { return this.lifecycleRegistry.getStreamingSender(messageId); }
  isCancelled(messageId) { return this.lifecycleRegistry.isCancelled(messageId); }
  
  async addToHistory(data, result) { await this.historyManager.addToHistory(data, result); }
  async clearHistory() { await this.historyManager.clearHistory(); }
  getHistory() { return this.historyManager.getHistory(); }
  
  async initialize() {
    try { 
      await this.historyManager.loadHistoryFromStorage(); 
      logger.debug("[TranslationEngine] Initialized successfully"); 
    } catch (error) { 
      logger.error("[TranslationEngine] Initialization failed:", error); 
    }
  }

  // --- Cache & Stats (Keep for compatibility) ---
  clearCache() { this.cache.clear(); }
  getCacheStats() { return { size: this.cache.size, providers: this.factory.providers?.size || 0 }; }

  /**
   * Proxy to TranslationBatcher for intelligent batch creation.
   */
  createIntelligentBatches(segments, baseBatchSize, maxCharsPerBatch) {
    return TranslationBatcher.createIntelligentBatches(segments, baseBatchSize, maxCharsPerBatch);
  }

  createIntelligentMembershipBatches(segments, manifestUnits, baseBatchSize, maxCharsPerBatch) {
    return TranslationBatcher.createIntelligentMembershipBatches(segments, manifestUnits, baseBatchSize, maxCharsPerBatch);
  }
}
