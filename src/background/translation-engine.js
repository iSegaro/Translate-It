/**
 * Translation Engine - Centralized translation hub for background service worker
 * Handles all translation requests from UI contexts via messaging
 */

import { ProviderFactory } from "@/providers/core/ProviderFactory.js";
import { providerRegistry } from "@/providers/core/ProviderRegistry.js";
import { storageManager } from "@/storage/core/StorageCore.js";
import { MessageActions } from "@/messaging/core/MessageActions.js";
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
import { getSourceLanguageAsync, getTargetLanguageAsync, TranslationMode } from "@/config.js";

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'translation-engine');

export class TranslationEngine {
  constructor() {
    this.providers = new Map();
    this.cache = new Map();
    this.history = [];
    this.factory = new ProviderFactory();
    this.activeTranslations = new Map(); // Track active translations for cancellation
    this.cancelledRequests = new Set(); // Track cancelled request messageIds
  }

  /**
   * Setup message listener for translation requests
   */
  async setupMessageListener() {
    // NOTE: Message handling is now managed by MessageRouter in BackgroundService
    // This method is kept for compatibility but disabled
    logger.debug(
      "[TranslationEngine] Message listener setup skipped - handled by MessageRouter",
    );
    return;
  }

  /**
   * Handle incoming messages from UI contexts
   */
  async handleMessage(request, sender) {
    if (request.action === MessageActions.TRANSLATE) {
      try {
        const result = await this.handleTranslateMessage(request, sender);
        return result;
      } catch (error) {
        logger.error("[TranslationEngine] Error handling message:", error);
        return this.formatError(error, request.context);
      }
    }

    // Let other message handlers process non-translation messages
    return undefined;
  }

  /**
   * Handle translation request messages
   */
  async handleTranslateMessage(request) {
    // Input validation and normalization only - main logging is handled by handleTranslate

    // Input validation and normalization
    if (!request || typeof request !== "object") {
      throw new Error(
        `Invalid request: expected object, got ${typeof request}`,
      );
    }

    // Extract context and data with fallbacks
    let context = request.context;
    let data = request.data;

    // Track this translation for cancellation
    const messageId = request.messageId;
    if (messageId) {
      const abortController = new AbortController();
      this.activeTranslations.set(messageId, abortController);
      logger.debug(`[TranslationEngine] Tracking translation: ${messageId}`);
    }

    // Handle different input formats
    if (!context || !data) {
      // Legacy format: request contains translation data directly
      if (request.text && request.provider) {
        logger.debug(
          "[TranslationEngine] Legacy format detected, normalizing...",
        );
        context = request.context || "unknown";
        data = {
          text: request.text,
          provider: request.provider,
          sourceLanguage: request.sourceLanguage || "auto",
          targetLanguage: request.targetLanguage || "fa",
          mode: request.mode || "simple",
          options: request.options || {},
        };
      } else {
        throw new Error(
          `Missing required fields: context and/or data. Got: ${JSON.stringify(request)}`,
        );
      }
    }

    // Validate data structure
    if (!data || typeof data !== "object") {
      throw new Error(`Invalid data: expected object, got ${typeof data}`);
    }

    if (
      !data.text ||
      typeof data.text !== "string" ||
      data.text.trim().length === 0
    ) {
      throw new Error(
        `Invalid text: expected non-empty string, got "${data.text}"`,
      );
    }

    if (!data.provider || typeof data.provider !== "string") {
      throw new Error(
        `Invalid provider: expected string, got "${data.provider}"`,
      );
    }

    // Data normalized successfully
    // Store messageId in data for later retrieval
    if (messageId) {
      data.messageId = messageId;
    }

    try {
      let result;

      // Context-specific optimizations (but all will include history except SelectElement)
      if (context === "popup") {
        result = await this.translateWithPriority(data);
      } else if (context === "selection") {
        result = await this.translateWithCache(data);
      } else {
        result = await this.executeTranslation(data);
      }

      // Centralized history addition for all modes except SelectElement
      if (result.success && data.mode !== TranslationMode.Select_Element) {
        await this.addToHistory(data, result);
      }

      // Result logging is handled by handleTranslate

      // Validate result format
      if (!result || typeof result !== "object") {
        throw new Error(
          `Invalid translation result: expected object, got ${typeof result}`,
        );
      }

      if (!Object.prototype.hasOwnProperty.call(result, "success")) {
        throw new Error(
          `Translation result missing 'success' property: ${JSON.stringify(result)}`,
        );
      }
      
      // Clean up tracking after successful completion
      if (messageId) {
        this.activeTranslations.delete(messageId);
        this.cancelledRequests.delete(messageId);
        logger.debug(`[TranslationEngine] Stopped tracking translation: ${messageId}`);
      }

      return result;
    } catch (error) {
      // Clean up tracking on failure
      if (messageId) {
        this.activeTranslations.delete(messageId);
        this.cancelledRequests.delete(messageId);
        logger.debug(`[TranslationEngine] Stopped tracking translation on error: ${messageId}`);
      }
      // Don't log here - error already logged by provider
      logger.debug("[TranslationEngine] Translation failed, formatting error response");
      return this.formatError(error, context);
    }
  }

  /**
   * Execute translation with priority (for popup)
   */
  async translateWithPriority(data) {
    // Check cache first for instant response
    const cacheKey = this.generateCacheKey(data);
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      return {
        ...cached,
        fromCache: true,
      };
    }

    return await this.executeTranslation(data);
  }

  /**
   * Execute translation with cache checking (for selection)
   */
  async translateWithCache(data) {
    const cacheKey = this.generateCacheKey(data);

    // Return cached result if available
    if (this.cache.has(cacheKey)) {
      return {
        ...this.cache.get(cacheKey),
        fromCache: true,
      };
    }

    const result = await this.executeTranslation(data);

    // Cache the result
    this.cacheResult(cacheKey, result);

    return result;
  }


  /**
   * Core translation execution logic
   */
  async executeTranslation(data) {
    const { text, provider, sourceLanguage, targetLanguage } = data;
    let { mode } = data;

    if (!text || text.trim().length === 0) {
      throw new Error("Text to translate is required");
    }

    // Get or create provider instance
    const providerInstance = await this.getProvider(provider);

    if (!providerInstance) {
      throw new Error(
        `Provider '${provider}' not found or failed to initialize`,
      );
    }

    const providerClass = providerInstance?.constructor;

    // Downgrade dictionary mode if provider does not support it
    if (mode === TranslationMode.Dictionary_Translation && !providerClass?.supportsDictionary) {
      logger.debug(`Provider ${provider} does not support dictionary mode. Downgrading to selection mode.`);
      mode = TranslationMode.Selection;
      data.mode = TranslationMode.Selection; // Ensure data object is also updated
    }

    // Get original source and target languages from config for language swapping logic
    const [originalSourceLang, originalTargetLang] = await Promise.all([
      getSourceLanguageAsync(),
      getTargetLanguageAsync()
    ]);

    // Pre-check for JSON mode optimization
    const isSelectJson = mode === TranslationMode.Select_Element && data.options?.rawJsonPayload;
    const providerReliableJson = providerClass?.reliableJsonMode !== undefined ? providerClass.reliableJsonMode : true;

    // For unreliable providers in JSON mode, use optimized strategy directly
    if (isSelectJson && !providerReliableJson) {
      logger.debug('[TranslationEngine] Using optimized strategy for unreliable JSON provider:', provider);
      return await this.executeOptimizedJsonTranslation(data, providerInstance, originalSourceLang, originalTargetLang, data.messageId);
    }

    // Standard translation for reliable providers or non-JSON mode
    let result;
    try {
      // Get abort controller for this translation
      const messageId = data.messageId;
      const abortController = messageId ? this.activeTranslations.get(messageId) : null;
      
      logger.debug(`[TranslationEngine] Standard translation call:`, {
        provider,
        messageId,
        hasAbortController: !!abortController
      });
      
      result = await providerInstance.translate(
        text,
        sourceLanguage,
        targetLanguage,
        {
          mode: mode,
          originalSourceLang: originalSourceLang,
          originalTargetLang: originalTargetLang,
          messageId: data.messageId,
          engine: this
        }
      );
    } catch (initialError) {
      //TODO: این منطق در جای دیگری هم مثل WindowsManager وجود دارد که بهتر است به Error Management منتقل شود
      // اگر خطا مربوط به عدم پشتیبانی از جفت زبان ها باشد، باید به کاربر نشان داده شود
      // For language pair not supported errors, don't use fallback - show error to user
      if (initialError.message && initialError.message.includes('Translation not available')) {
        throw initialError;
      }
      
      // Final fallback for SelectElement JSON (only for other types of errors)
      if (isSelectJson && !providerReliableJson) {
        logger.warn('[TranslationEngine] Standard translation failed, falling back to optimized strategy:', initialError);
        return await this.executeOptimizedJsonTranslation(data, providerInstance, originalSourceLang, originalTargetLang, data.messageId);
      }
      throw initialError;
    }

    const response = {
      success: true,
      translatedText: result,
      provider,
      sourceLanguage,
      targetLanguage,
      originalText: text,
      timestamp: Date.now(),
      mode: mode || "simple",
    };

    return response;
  }

  /**
   * Optimized JSON translation for unreliable providers
   */
  async executeOptimizedJsonTranslation(data, providerInstance, originalSourceLang, originalTargetLang, messageId = null) {
    const { text, provider, sourceLanguage, targetLanguage, mode } = data;
    
    let originalJson;
    try {
      originalJson = JSON.parse(text);
    } catch {
      throw new Error('Invalid JSON format for SelectElement mode');
    }

    if (!Array.isArray(originalJson)) {
      throw new Error('SelectElement JSON must be an array');
    }

    const segments = originalJson.map(item => item.text);
    const results = new Array(segments.length);
    const translationStatus = new Array(segments.length).fill(false); // Track which segments were actually translated
    const errorMessages = []; // Collect actual error messages
    const sharedState = { 
      shouldStopDueToLanguagePairError: false, 
      languagePairError: null,
      batchFailureCount: 0, // Track batch failures for early exit
      maxBatchFailures: provider === 'BingTranslate' ? 3 : 5, // Lower threshold for Bing
      isCancelled: false // Global cancellation flag
    }; // Shared state to stop other batches
    
    // Smart cache-first approach
    let cacheHits = 0;
    const uncachedIndices = [];
    
    for (let i = 0; i < segments.length; i++) {
      const cacheKey = this.generateCacheKey({
        text: segments[i],
        provider,
        sourceLanguage,
        targetLanguage,
        mode
      });
      
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (cached.translatedText && cached.translatedText !== segments[i]) {
          // Valid cached translation exists
          results[i] = cached.translatedText;
          translationStatus[i] = true;
          cacheHits++;
        } else {
          // Cache exists but contains failed translation (null or same text)
          results[i] = segments[i];
          translationStatus[i] = false;
          uncachedIndices.push(i); // Re-attempt translation
        }
      } else {
        uncachedIndices.push(i);
      }
    }

    logger.debug(`[TranslationEngine] Cache hits: ${cacheHits}/${segments.length}`);

    // Only translate uncached segments
    if (uncachedIndices.length > 0) {
      const providerClass = providerInstance?.constructor;
      const isAiProvider = providerClass?.type === 'ai';

      // Bing-specific optimization: smaller batches for better reliability
      const BATCH_SIZE = provider === 'BingTranslate' ? 3 : (isAiProvider ? 32 : 8);
      const MAX_CONCURRENT = provider === 'BingTranslate' ? 1 : (isAiProvider ? 2 : 2);
      
      // Process in batches with intelligent grouping
      const batches = this.createOptimalBatches(uncachedIndices, segments, BATCH_SIZE);
      
      let batchIndex = 0;
      const workers = Array.from({ length: Math.min(MAX_CONCURRENT, batches.length) }, async () => {
        while (true) {
          const idx = batchIndex++;
          if (idx >= batches.length) break;
          
          // Check if we should stop due to language pair error or too many batch failures
          if (sharedState.shouldStopDueToLanguagePairError) {
            logger.debug(`[TranslationEngine] Skipping batch ${idx} due to language pair error`);
            break;
          }
          
          if (sharedState.batchFailureCount >= sharedState.maxBatchFailures) {
            logger.debug(`[TranslationEngine] Early exit: too many batch failures (${sharedState.batchFailureCount})`);
            break;
          }

          // Get abort controller for this translation
          const abortController = messageId ? this.activeTranslations.get(messageId) : null;
          
          // Check if translation was cancelled (both AbortController and shared state)
          if (abortController && abortController.signal.aborted) {
            logger.debug(`[TranslationEngine] Translation was cancelled via AbortController, skipping batch ${idx}`);
            sharedState.isCancelled = true;
            break;
          }
          
          if (sharedState.isCancelled) {
            logger.debug(`[TranslationEngine] Translation was cancelled via shared state, skipping batch ${idx}`);
            break;
          }
          
          const batch = batches[idx];
          
          await this.processBatch(batch, segments, results, translationStatus, providerInstance, {
            provider, sourceLanguage, targetLanguage, mode, originalSourceLang, originalTargetLang
          }, errorMessages, sharedState, abortController);
        }
      });

      await Promise.all(workers);
    }

    // Check if any translation actually succeeded
    const anyTranslationSucceeded = translationStatus.some(status => status === true);
    
    // Check if we stopped due to language pair error
    if (sharedState.shouldStopDueToLanguagePairError && sharedState.languagePairError) {
      throw sharedState.languagePairError;
    }
    
    if (!anyTranslationSucceeded && uncachedIndices.length > 0) {
      // No translations succeeded and there were segments to translate
      // Use the most recent/specific error message if available
      const specificError = errorMessages.length > 0 ? errorMessages[errorMessages.length - 1] : null;
      if (specificError) {
        throw new Error(specificError);
      } else {
        throw new Error(`Translation failed for all segments. Provider ${provider} is unreachable or returned errors.`);
      }
    }

    // Reconstruct JSON with translated texts
    const translatedJson = originalJson.map((item, i) => ({
      ...item,
      text: results[i] || item.text // Fallback to original on failure
    }));

    const response = {
      success: true,
      translatedText: JSON.stringify(translatedJson),
      provider,
      sourceLanguage,
      targetLanguage,
      originalText: text,
      timestamp: Date.now(),
      mode: mode || "simple",
    };

    return response;
  }

  /**
   * Create optimal batches based on text length and similarity
   */
  createOptimalBatches(indices, segments, maxBatchSize) {
    const batches = [];
    let currentBatch = [];
    let currentLength = 0;
    const MAX_BATCH_CHARS = 8000; // Character limit per batch
    
    for (const idx of indices) {
      const segmentLength = segments[idx].length;
      
      // Start new batch if current would exceed limits
      if (currentBatch.length >= maxBatchSize || 
          (currentLength + segmentLength > MAX_BATCH_CHARS && currentBatch.length > 0)) {
        batches.push(currentBatch);
        currentBatch = [];
        currentLength = 0;
      }
      
      currentBatch.push(idx);
      currentLength += segmentLength;
    }
    
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }
    
    return batches;
  }

  /**
   * Process a single batch with fallback strategy
   */
  async processBatch(batch, segments, results, translationStatus, providerInstance, config, errorMessages = [], sharedState = null, abortController = null) {
    const { provider, sourceLanguage, targetLanguage, mode, originalSourceLang, originalTargetLang } = config;
    const DELIMITER = "\n\n---\n\n";
    
    // Check if we should stop due to language pair error before starting
    if (sharedState && sharedState.shouldStopDueToLanguagePairError) {
      logger.debug('[TranslationEngine] Batch stopped due to language pair error in another batch');
      return;
    }

    // Check if translation was cancelled before starting batch (both AbortController and shared state)
    if (abortController && abortController.signal.aborted) {
      logger.debug('[TranslationEngine] Batch cancelled before starting (AbortController)');
      if (sharedState) sharedState.isCancelled = true;
      return;
    }
    
    if (sharedState && sharedState.isCancelled) {
      logger.debug('[TranslationEngine] Batch cancelled before starting (shared state)');
      return;
    }
    
    // Add request throttling for Bing provider
    if (provider === 'BingTranslate') {
      await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay between requests
    }
    
    // Try batch translation first (most efficient)
    try {
      const batchText = batch.map(idx => segments[idx]).join(DELIMITER);
      const batchResult = await providerInstance.translate(batchText, sourceLanguage, targetLanguage, { mode, originalSourceLang, originalTargetLang, abortController });
      
      if (typeof batchResult === 'string') {
        const parts = batchResult.split(DELIMITER);
        
        if (parts.length === batch.length) {
          // Successful batch translation
          for (let i = 0; i < batch.length; i++) {
            const idx = batch[i];
            const translatedText = parts[i]?.trim() || segments[idx];
            // For same-language translations or when content doesn't change, still consider it successful
            const isActuallyTranslated = translatedText !== segments[idx] || 
                                       sourceLanguage === targetLanguage ||
                                       sourceLanguage === 'auto'; // Auto-detect may result in same language
            
            results[idx] = translatedText;
            translationStatus[idx] = isActuallyTranslated;
            
            // Cache individual result
            const cacheKey = this.generateCacheKey({
              text: segments[idx], provider, sourceLanguage, targetLanguage, mode
            });
            // Always cache the result if the API call was successful
            this.cache.set(cacheKey, { translatedText: translatedText, cachedAt: Date.now() });
          }
          return;
        }
      }
    } catch (batchError) {
      logger.debug(`[TranslationEngine] Batch translation failed, using individual fallback:`, batchError.message);
      
      // Track batch failures for early exit
      if (sharedState) {
        sharedState.batchFailureCount++;
      }
      
      // Capture specific error message
      const errorMessage = batchError instanceof Error ? batchError.message : String(batchError);
      if (errorMessage && !errorMessages.includes(errorMessage)) {
        errorMessages.push(errorMessage);
      }

      // If translation was cancelled by user, stop all processing
      if (errorMessage && errorMessage.includes('Translation cancelled by user')) {
        logger.debug('[TranslationEngine] User cancellation detected - stopping all batches');
        if (sharedState) sharedState.isCancelled = true;
        throw batchError; // Re-throw to stop translation completely
      }

      // If the error indicates an unsupported language pair, mark shared state and exit early
      if (errorMessage && errorMessage.includes('Translation not available')) {
        if (sharedState) {
          sharedState.shouldStopDueToLanguagePairError = true;
          sharedState.languagePairError = batchError;
          logger.debug('[TranslationEngine] Language pair error detected - stopping all batches');
        }
        throw batchError; // Re-throw to show error to user instead of silent fallback
      }
    }
    
    // Fallback to individual translations (with minimal retry)
    const INDIVIDUAL_RETRY = 2;
    const individualPromises = batch.map(async (idx) => {
      // Check if we should stop due to language pair error or cancellation before starting individual translation
      if (sharedState && sharedState.shouldStopDueToLanguagePairError) {
        logger.debug('[TranslationEngine] Individual translation stopped due to language pair error');
        return { idx, result: segments[idx], success: false };
      }

      // If no abort controller is provided or it's already aborted, skip individual translation
      if (!abortController || abortController.signal.aborted) {
        logger.debug('[TranslationEngine] Individual translation cancelled - no valid abort controller');
        return { idx, result: segments[idx], success: false };
      }
      
      let attempt = 0;
      while (attempt < INDIVIDUAL_RETRY) {
        // Check again inside the retry loop
        if (sharedState && sharedState.shouldStopDueToLanguagePairError) {
          logger.debug('[TranslationEngine] Individual translation retry stopped due to language pair error');
          return { idx, result: segments[idx], success: false };
        }

        // If abort controller is missing or aborted, stop retry loop
        if (!abortController || abortController.signal.aborted) {
          logger.debug('[TranslationEngine] Individual translation retry cancelled - no valid abort controller');
          return { idx, result: segments[idx], success: false };
        }
        
        try {
          // Add throttling for Bing individual requests as well
          if (config.provider === 'BingTranslate' && attempt > 0) {
            await new Promise(resolve => setTimeout(resolve, 300 * attempt)); // Increasing delay for retries
          }
          
          const result = await providerInstance.translate(segments[idx], sourceLanguage, targetLang, { mode, originalSourceLang, originalTargetLang, abortController });
          const translatedText = typeof result === 'string' ? result.trim() : segments[idx];
          // For same-language translations or when content doesn't change, still consider it successful
          const isActuallyTranslated = translatedText !== segments[idx] || 
                                       sourceLanguage === targetLanguage ||
                                       sourceLanguage === 'auto'; // Auto-detect may result in same language
          
          // Cache result
          const cacheKey = this.generateCacheKey({
            text: segments[idx], provider, sourceLanguage, targetLanguage, mode
          });
          // Always cache the result if the API call was successful
          this.cache.set(cacheKey, { translatedText: translatedText, cachedAt: Date.now() });

          logger.debug(`isActuallyTranslated: ${isActuallyTranslated}`);
          return { idx, result: translatedText, success: true }; // API call succeeded
        } catch (individualError) {
          // Capture specific error message
          const errorMessage = individualError instanceof Error ? individualError.message : String(individualError);
          if (errorMessage && !errorMessages.includes(errorMessage)) {
            errorMessages.push(errorMessage);
          }
          
          // If translation was cancelled by user, stop all processing
          if (errorMessage && errorMessage.includes('Translation cancelled by user')) {
            logger.debug('[TranslationEngine] User cancellation detected in individual translation');
            return { idx, result: segments[idx], success: false };
          }
          
          // If it's a language pair error, mark shared state and throw
          if (errorMessage && errorMessage.includes('Translation not available')) {
            if (sharedState) {
              sharedState.shouldStopDueToLanguagePairError = true;
              sharedState.languagePairError = individualError;
              logger.debug('[TranslationEngine] Language pair error detected in individual translation - stopping all batches');
            }
            throw individualError;
          }
          
          attempt++;
          if (attempt < INDIVIDUAL_RETRY) {
            await new Promise(resolve => setTimeout(resolve, 100 * attempt));
          }
        }
      }
      
      // Final fallback to original text (mark as failed)
      return { idx, result: segments[idx], success: false };
    });
    
    const individualResults = await Promise.all(individualPromises);
    individualResults.forEach(({ idx, result, success }) => {
      results[idx] = result;
      // Mark as successful if API call succeeded, regardless of text change
      translationStatus[idx] = success;
    });
  }

  /**
   * Get or create provider instance
   */
  async getProvider(providerId) {
    // Return cached provider if available
    if (this.providers.has(providerId)) {
      return this.providers.get(providerId);
    }

    try {
      // Create new provider instance
      const ProviderClass = providerRegistry.get(providerId);
      const provider = new ProviderClass();

      if (provider) {
        this.providers.set(providerId, provider);
        return provider;
      }
    } catch (error) {
      logger.error(
        `[TranslationEngine] Failed to create provider '${providerId}':`,
        error,
      );
    }

    return null;
  }

  /**
   * Generate cache key for translation request
   */
  generateCacheKey(data) {
    const { text, provider, sourceLanguage, targetLanguage, mode } = data;
    return `${provider}:${sourceLanguage}:${targetLanguage}:${mode}:${text.slice(0, 100)}`;
  }

  /**
   * Cache translation result
   */
  cacheResult(cacheKey, result) {
    // Limit cache size to prevent memory issues
    if (this.cache.size >= 100) {
      // Remove oldest entries
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(cacheKey, {
      ...result,
      cachedAt: Date.now(),
    });
  }

  /**
   * Add translation to history
   */
  async addToHistory(data, result) {
    try {
      const historyItem = {
        sourceText: data.text,
        translatedText: result.translatedText,
        sourceLanguage: data.sourceLanguage,
        targetLanguage: data.targetLanguage,
        timestamp: Date.now(),
      };

      // Load current history from storage (same key as useHistory composable)
      const currentData = await storageManager.get(['translationHistory']);
      const currentHistory = currentData.translationHistory || [];
      
      // Add new item to the beginning and limit size
      const newHistory = [historyItem, ...currentHistory].slice(0, 100);
      
      // Save back to storage using the same key as useHistory
      await storageManager.set({
        translationHistory: newHistory,
      });
      
      // Update local cache
      this.history = newHistory;
      
      logger.debug("[TranslationEngine] Added to history:", data.text.substring(0, 50) + "...");
    } catch (error) {
      logger.error("[TranslationEngine] Failed to save history:", error);
    }
  }

  /**
   * Save history to browser storage
   */
  async saveHistoryToStorage() {
    try {
      await storageManager.set({
        translationHistory: this.history,
      });
    } catch (error) {
      logger.error("[TranslationEngine] Failed to save history:", error);
    }
  }

  /**
   * Load history from browser storage
   */
  async loadHistoryFromStorage() {
    try {
      const data = await storageManager.get(["translationHistory"]);
      if (Array.isArray(data.translationHistory)) {
        this.history = data.translationHistory;
      } else {
        this.history = []; // Ensure it's always an array
      }
    } catch (error) {
      logger.error("[TranslationEngine] Failed to load history:", error);
    }
  }

  /**
   * Format error response
   */
  formatError(error, context) {
    return {
      success: false,
      error: {
        type: error.type || "TRANSLATION_ERROR",
        message: error.message || "Translation failed",
        context: context || "unknown",
        timestamp: Date.now(),
      },
    };
  }

  /**
   * Get available providers list
   */
  async getAvailableProviders() {
    try {
      // Use the provider handler to get consistent provider list
      const { getAvailableProviders } = await import("../handlers/provider-handler.js");
      return await getAvailableProviders();
    } catch (error) {
      logger.error("[TranslationEngine] Failed to get providers:", error);
      return [];
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.history = [];
    this.saveHistoryToStorage();
  }

  /**
   * Get cache stats
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      providers: this.providers.size,
    };
  }

  /**
   * Cancel active translation by message ID
   */
  cancelTranslation(messageId) {
    if (messageId) {
      logger.debug(`[TranslationEngine] Marking translation as cancelled: ${messageId}`);
      this.cancelledRequests.add(messageId);

      if (this.activeTranslations.has(messageId)) {
        const abortController = this.activeTranslations.get(messageId);
        abortController.abort();
        logger.debug(`[TranslationEngine] Aborted translation for messageId: ${messageId}`);
      }

      return true;
    }
    return false;
  }

  isCancelled(messageId) {
    return this.cancelledRequests.has(messageId);
  }

  /**
   * Initialize engine (call from background script)
   */
  async initialize() {
    try {
      await this.loadHistoryFromStorage();
      logger.debug("[TranslationEngine] Initialized successfully");
    } catch (error) {
      logger.error("[TranslationEngine] Initialization failed:", error);
    }
  }
}