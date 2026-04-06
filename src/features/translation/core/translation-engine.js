/**
 * Translation Engine - Centralized translation hub for background service worker
 * Handles all translation requests from UI contexts via messaging.
 * Modularized version - delegates logic to specialized managers and utilities.
 */

import { ProviderFactory } from "@/features/translation/providers/ProviderFactory.js";
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { getSourceLanguageAsync, getTargetLanguageAsync, TranslationMode } from "@/shared/config/config.js";
import { MessageFormat } from '@/shared/messaging/core/MessagingCore.js';
import { isFatalError, matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { TranslationLifecycleRegistry } from "./managers/TranslationLifecycleRegistry.js";
import { TranslationHistoryManager } from "./managers/TranslationHistoryManager.js";
import { OptimizedJsonHandler } from "./managers/OptimizedJsonHandler.js";
import { ComplexityAnalyzer } from "./utils/ComplexityAnalyzer.js";
import { TranslationBatcher } from "./utils/TranslationBatcher.js";
import browser from 'webextension-polyfill';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'translation-engine');

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
  async handleTranslateMessage(request, sender) {
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

    // Register and detect duplicate
    const abortController = this.lifecycleRegistry.registerRequest(messageId, data.text);

    try {
      const result = await this.executeTranslation(data, sender);

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
  async executeTranslation(data, sender) {
    const { text, provider, sourceLanguage, targetLanguage } = data;
    let { mode } = data;

    if (!text || text.trim().length === 0) {
      throw new Error("Text to translate is required");
    }

    // Get provider instance
    const providerInstance = await this.getProvider(provider);
    if (!providerInstance) {
      throw new Error(`Provider '${provider}' not found or failed to initialize`);
    }

    const providerClass = providerInstance.constructor;

    // 1. Dictionary / Mode Downgrade logic
    mode = this._resolveTranslationMode(data, providerClass);
    data.mode = mode;

    // 2. Length Validation
    const lengthError = this._validateTextLength(text, mode, provider);
    if (lengthError) return lengthError;

    // 3. Resolve global languages for swapping logic
    const [originalSourceLang, originalTargetLang] = await Promise.all([
      getSourceLanguageAsync(),
      getTargetLanguageAsync()
    ]);

    // 4. Handle Optimized JSON strategy (Select Element)
    const isSelectJson = mode === TranslationMode.Select_Element && data.options?.rawJsonPayload;
    if (isSelectJson) {
      logger.debug('[TranslationEngine] Using optimized SelectElement strategy for provider:', provider);
      const tabId = sender?.tab?.id;
      return await this.jsonHandler.execute(this, data, providerInstance, originalSourceLang, originalTargetLang, data.messageId, tabId);
    }

    // 5. Handle Standard Streaming
    const messageId = data.messageId;
    const shouldUseStreaming = this._shouldUseStreamingForProvider(providerInstance, text, messageId, mode);
    
    if (shouldUseStreaming) {
      this.lifecycleRegistry.registerStreamingSender(messageId, sender);
      logger.debug(`[TranslationEngine] Using streaming translation for provider: ${provider}`);
      return await this.executeStreamingTranslation(data, providerInstance, sender, originalSourceLang, originalTargetLang);
    }

    // 6. Standard translation call
    let result = await providerInstance.translate(
      text,
      sourceLanguage,
      targetLanguage,
      {
        mode: mode,
        originalSourceLang: originalSourceLang,
        originalTargetLang: originalTargetLang,
        messageId: data.messageId,
        sessionId: data.sessionId || data.messageId,
        charCount: text.length,
        engine: this
      }
    );

    return {
      success: true,
      translatedText: result,
      provider,
      sourceLanguage,
      targetLanguage,
      originalText: text,
      timestamp: Date.now(),
      mode: mode || "simple",
    };
  }

  /**
   * Internal helper to resolve actual translation mode based on provider capabilities and settings.
   * @private
   */
  _resolveTranslationMode(data, providerClass) {
    let { mode } = data;
    const isDictionaryForbidden = data.enableDictionary === false || 
                                 (data.options && data.options.enableDictionary === false) ||
                                 [TranslationMode.Select_Element, TranslationMode.Field, TranslationMode.Page].includes(mode);
    
    if (isDictionaryForbidden && [TranslationMode.Dictionary_Translation, TranslationMode.Selection].includes(mode)) {
      return TranslationMode.Selection;
    } 
    
    if (mode === TranslationMode.Dictionary_Translation && !providerClass?.supportsDictionary) {
      logger.debug(`Provider does not support dictionary mode. Downgrading to selection mode.`);
      return TranslationMode.Selection;
    }

    return mode;
  }

  /**
   * Validate text length against mode-specific limits.
   * @private
   */
  _validateTextLength(text, mode, provider) {
    const isSelectElementMode = mode === TranslationMode.Select_Element;
    const LIMITS = { WARNING: 10000, REGULAR_MAX: 50000, SELECT_MAX: 500000 };

    if (!isSelectElementMode && text.length > LIMITS.WARNING) {
      if (text.length > LIMITS.REGULAR_MAX) {
        return {
          success: false,
          error: `Text too long (${text.length} chars). Max: ${LIMITS.REGULAR_MAX}. Use "Select Element" for long texts.`,
          translatedText: text, provider, mode
        };
      }
      logger.warn(`[TranslationEngine] Large text detected (${text.length} chars).`);
    } else if (isSelectElementMode && text.length > LIMITS.SELECT_MAX) {
      return {
        success: false,
        error: `Text too long even for Select Element (${text.length} chars). Max: ${LIMITS.SELECT_MAX}.`,
        translatedText: text, provider, mode
      };
    }
    return null;
  }

  /**
   * Determine if streaming should be used for this request.
   * @private
   */
  _shouldUseStreamingForProvider(providerInstance, text, messageId, mode) {
    if (!messageId) return false;
    const providerType = providerInstance.constructor.type;
    const isSelectElementMode = mode === TranslationMode.Select_Element;
    
    if (providerType === "ai") return isSelectElementMode ? text.length > 500 : false;
    return (isSelectElementMode && text.length > 2000 && providerInstance.constructor.supportsStreaming !== false);
  }

  /**
   * Execute translation with streaming support for non-JSON modes.
   */
  async executeStreamingTranslation(data, providerInstance, sender, originalSourceLang, originalTargetLang) {
    const { text, provider, sourceLanguage, targetLanguage, mode, messageId } = data;
    const { streamingManager } = await import("./StreamingManager.js");
    const sessionId = data.sessionId || messageId;
    
    streamingManager.initializeStream(messageId, sender, providerInstance, [text], sessionId);
    this.lifecycleRegistry.registerStreamingSender(messageId, sender);

    try {
      await providerInstance.translate(text, sourceLanguage, targetLanguage, { 
        mode, originalSourceLang, originalTargetLang, messageId, sessionId, charCount: text.length, engine: this 
      });
      return { success: true, streaming: true, messageId, provider, timestamp: Date.now() };
    } catch (error) {
      await streamingManager.handleStreamError(messageId, error);
      return { success: true, streaming: true, messageId, provider, timestamp: Date.now() };
    } finally {
      this.lifecycleRegistry.unregisterRequest(messageId);
    }
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
    const errorType = error.type || matchErrorToType(error);
    return { 
      success: false, 
      error: { 
        type: errorType, 
        message: error.message || "Translation failed", 
        context: context || "unknown", 
        timestamp: Date.now() 
      } 
    };
  }

  // --- Delegation Methods ---
  
  async cancelTranslation(messageId) { return await this.lifecycleRegistry.cancelTranslation(messageId); }
  async cancelAllTranslations() { return await this.lifecycleRegistry.cancelAllTranslations(); }
  getAbortController(messageId) { return this.lifecycleRegistry.getAbortController(messageId); }
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
}
