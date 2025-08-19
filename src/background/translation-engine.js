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
import { getSourceLanguageAsync, getTargetLanguageAsync } from "@/config.js";

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'translation-engine');

export class TranslationEngine {
  constructor() {
    this.providers = new Map();
    this.cache = new Map();
    this.history = [];
    this.factory = new ProviderFactory();
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
      if (result.success && data.mode !== 'SelectElement') {
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

      return result;
    } catch (error) {
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
    const { text, provider, sourceLanguage, targetLanguage, mode } = data;

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

    // Get original source and target languages from config for language swapping logic
    const [originalSourceLang, originalTargetLang] = await Promise.all([
      getSourceLanguageAsync(),
      getTargetLanguageAsync()
    ]);

    // Pre-check for JSON mode optimization
    const isSelectJson = mode === 'SelectElement' && data.options?.rawJsonPayload;
    const providerClass = providerInstance?.constructor;
    const providerReliableJson = providerClass?.reliableJsonMode !== undefined ? providerClass.reliableJsonMode : true;

    // For unreliable providers in JSON mode, use optimized strategy directly
    if (isSelectJson && !providerReliableJson) {
      logger.debug('[TranslationEngine] Using optimized strategy for unreliable JSON provider:', provider);
      return await this.executeOptimizedJsonTranslation(data, providerInstance, originalSourceLang, originalTargetLang);
    }

    // Standard translation for reliable providers or non-JSON mode
    let result;
    try {
      result = await providerInstance.translate(
        text,
        sourceLanguage,
        targetLanguage,
        mode,
        originalSourceLang,
        originalTargetLang
      );
    } catch (initialError) {
      // For language pair not supported errors, don't use fallback - show error to user
      if (initialError.message && initialError.message.includes('Translation not available')) {
        throw initialError;
      }
      
      // Final fallback for SelectElement JSON (only for other types of errors)
      if (isSelectJson && !providerReliableJson) {
        logger.warn('[TranslationEngine] Standard translation failed, falling back to optimized strategy:', initialError);
        return await this.executeOptimizedJsonTranslation(data, providerInstance, originalSourceLang, originalTargetLang);
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
  async executeOptimizedJsonTranslation(data, providerInstance, originalSourceLang, originalTargetLang) {
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
      const BATCH_SIZE = 8; // Optimized batch size
      const MAX_CONCURRENT = 2; // Reduced concurrency for better stability
      
      // Process in batches with intelligent grouping
      const batches = this.createOptimalBatches(uncachedIndices, segments, BATCH_SIZE);
      
      let batchIndex = 0;
      const workers = Array.from({ length: Math.min(MAX_CONCURRENT, batches.length) }, async () => {
        while (true) {
          const idx = batchIndex++;
          if (idx >= batches.length) break;
          
          const batch = batches[idx];
          await this.processBatch(batch, segments, results, translationStatus, providerInstance, {
            provider, sourceLanguage, targetLanguage, mode, originalSourceLang, originalTargetLang
          }, errorMessages);
        }
      });

      await Promise.all(workers);
    }

    // Check if any translation actually succeeded
    const anyTranslationSucceeded = translationStatus.some(status => status === true);
    
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
    const MAX_BATCH_CHARS = 1000; // Character limit per batch
    
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
  async processBatch(batch, segments, results, translationStatus, providerInstance, config, errorMessages = []) {
    const { provider, sourceLanguage, targetLanguage, mode, originalSourceLang, originalTargetLang } = config;
    const DELIMITER = "\n\n---\n\n";
    
    // Try batch translation first (most efficient)
    try {
      const batchText = batch.map(idx => segments[idx]).join(DELIMITER);
      const batchResult = await providerInstance.translate(batchText, sourceLanguage, targetLanguage, mode, originalSourceLang, originalTargetLang);
      
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
      // Capture specific error message
      const errorMessage = batchError instanceof Error ? batchError.message : String(batchError);
      if (errorMessage && !errorMessages.includes(errorMessage)) {
        errorMessages.push(errorMessage);
      }

      // If the error indicates an unsupported language pair, don't retry individually - throw the error to show to user
      if (errorMessage && errorMessage.includes('Translation not available')) {
        throw batchError; // Re-throw to show error to user instead of silent fallback
      }
    }
    
    // Fallback to individual translations (with minimal retry)
    const INDIVIDUAL_RETRY = 2;
    const individualPromises = batch.map(async (idx) => {
      let attempt = 0;
      while (attempt < INDIVIDUAL_RETRY) {
        try {
          const result = await providerInstance.translate(segments[idx], sourceLanguage, targetLanguage, mode, originalSourceLang, originalTargetLang);
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
          
          // If it's a language pair error, don't retry - just throw it
          if (errorMessage && errorMessage.includes('Translation not available')) {
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