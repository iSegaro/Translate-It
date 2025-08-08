/**
 * Translation Engine - Centralized translation hub for background service worker
 * Handles all translation requests from UI contexts via messaging
 */

import { ProviderFactory } from "@/providers/core/ProviderFactory.js";
import { providerRegistry } from "@/providers/core/ProviderRegistry.js";
import { storageManager } from "@/storage/core/StorageCore.js";
import { MessageActions } from "@/messaging/core/MessageActions.js";

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
    console.log(
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
        console.error("[TranslationEngine] Error handling message:", error);
        return this.formatError(error, request.context);
      }
    }

    // Let other message handlers process non-translation messages
    return undefined;
  }

  /**
   * Handle translation request messages
   */
  async handleTranslateMessage(request, sender) {
    console.log(
      "[TranslationEngine] Processing request:",
      JSON.stringify(request, null, 2),
    );
    console.log("[TranslationEngine] Sender:", sender);

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
        console.log(
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

    console.log("[TranslationEngine] Normalized context:", context);
    console.log(
      "[TranslationEngine] Normalized data:",
      JSON.stringify(data, null, 2),
    );

    try {
      let result;

      // Context-specific optimizations
      if (context === "popup") {
        // Fast response priority for popup
        console.log("[TranslationEngine] Using popup priority strategy");
        result = await this.translateWithPriority(data);
      } else if (context === "selection") {
        // Background processing OK for selection
        console.log("[TranslationEngine] Using selection cache strategy");
        result = await this.translateWithCache(data);
      } else if (context === "sidepanel") {
        // Enhanced features for sidepanel
        console.log("[TranslationEngine] Using sidepanel history strategy");
        result = await this.translateWithHistory(data);
      } else {
        // Default strategy
        console.log("[TranslationEngine] Using default translation strategy");
        result = await this.executeTranslation(data);
      }

      console.log(
        "[TranslationEngine] Translation result:",
        JSON.stringify(result, null, 2),
      );

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
      console.error("[TranslationEngine] Translation error:", error);
      console.error("[TranslationEngine] Error stack:", error.stack);
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
   * Execute translation with history tracking (for sidepanel)
   */
  async translateWithHistory(data) {
    const result = await this.executeTranslation(data);

    // Add to history for sidepanel
    this.addToHistory(data, result);

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

    // Pre-check for JSON mode optimization
    const isSelectJson = mode === 'SelectElement' && data.options?.rawJsonPayload;
    const providerClass = providerInstance?.constructor;
    const providerReliableJson = providerClass?.reliableJsonMode !== undefined ? providerClass.reliableJsonMode : true;

    // For unreliable providers in JSON mode, use optimized strategy directly
    if (isSelectJson && !providerReliableJson) {
      console.log('[TranslationEngine] Using optimized strategy for unreliable JSON provider:', provider);
      return await this.executeOptimizedJsonTranslation(data, providerInstance);
    }

    // Standard translation for reliable providers or non-JSON mode
    let result;
    try {
      result = await providerInstance.translate(
        text,
        sourceLanguage,
        targetLanguage,
        mode,
      );
    } catch (initialError) {
      // Final fallback for SelectElement JSON
      if (isSelectJson && !providerReliableJson) {
        console.warn('[TranslationEngine] Standard translation failed, falling back to optimized strategy:', initialError);
        return await this.executeOptimizedJsonTranslation(data, providerInstance);
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
  async executeOptimizedJsonTranslation(data, providerInstance) {
    const { text, provider, sourceLanguage, targetLanguage, mode } = data;
    
    let originalJson;
    try {
      originalJson = JSON.parse(text);
    } catch (e) {
      throw new Error('Invalid JSON format for SelectElement mode');
    }

    if (!Array.isArray(originalJson)) {
      throw new Error('SelectElement JSON must be an array');
    }

    const segments = originalJson.map(item => item.text);
    const results = new Array(segments.length);
    
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
        results[i] = cached.translatedText || segments[i];
        cacheHits++;
      } else {
        uncachedIndices.push(i);
      }
    }

    console.log(`[TranslationEngine] Cache hits: ${cacheHits}/${segments.length}`);

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
          await this.processBatch(batch, segments, results, providerInstance, {
            provider, sourceLanguage, targetLanguage, mode
          });
        }
      });

      await Promise.all(workers);
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
  async processBatch(batch, segments, results, providerInstance, config) {
    const { provider, sourceLanguage, targetLanguage, mode } = config;
    const DELIMITER = "\n\n---\n\n";
    
    // Try batch translation first (most efficient)
    try {
      const batchText = batch.map(idx => segments[idx]).join(DELIMITER);
      const batchResult = await providerInstance.translate(batchText, sourceLanguage, targetLanguage, mode);
      
      if (typeof batchResult === 'string') {
        const parts = batchResult.split(DELIMITER);
        
        if (parts.length === batch.length) {
          // Successful batch translation
          for (let i = 0; i < batch.length; i++) {
            const idx = batch[i];
            const translatedText = parts[i]?.trim() || segments[idx];
            results[idx] = translatedText;
            
            // Cache individual result
            const cacheKey = this.generateCacheKey({
              text: segments[idx], provider, sourceLanguage, targetLanguage, mode
            });
            this.cache.set(cacheKey, { translatedText, cachedAt: Date.now() });
          }
          return;
        }
      }
    } catch (batchError) {
      console.log(`[TranslationEngine] Batch translation failed, using individual fallback:`, batchError.message);
    }
    
    // Fallback to individual translations (with minimal retry)
    const INDIVIDUAL_RETRY = 2;
    const individualPromises = batch.map(async (idx) => {
      let attempt = 0;
      while (attempt < INDIVIDUAL_RETRY) {
        try {
          const result = await providerInstance.translate(segments[idx], sourceLanguage, targetLanguage, mode);
          const translatedText = typeof result === 'string' ? result.trim() : segments[idx];
          
          // Cache result
          const cacheKey = this.generateCacheKey({
            text: segments[idx], provider, sourceLanguage, targetLanguage, mode
          });
          this.cache.set(cacheKey, { translatedText, cachedAt: Date.now() });
          
          return { idx, result: translatedText };
        } catch (err) {
          attempt++;
          if (attempt < INDIVIDUAL_RETRY) {
            await new Promise(resolve => setTimeout(resolve, 100 * attempt));
          }
        }
      }
      
      // Final fallback to original text
      return { idx, result: segments[idx] };
    });
    
    const individualResults = await Promise.all(individualPromises);
    individualResults.forEach(({ idx, result }) => {
      results[idx] = result;
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
      console.error(
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
  addToHistory(data, result) {
    const historyItem = {
      id: Date.now().toString(),
      originalText: data.text,
      translatedText: result.translatedText,
      provider: data.provider,
      sourceLanguage: data.sourceLanguage,
      targetLanguage: data.targetLanguage,
      timestamp: Date.now(),
      mode: data.mode,
    };

    this.history.unshift(historyItem);

    // Limit history size
    if (this.history.length > 50) {
      this.history = this.history.slice(0, 50);
    }

    // Optionally save to storage
    this.saveHistoryToStorage();
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
      console.error("[TranslationEngine] Failed to save history:", error);
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
      console.error("[TranslationEngine] Failed to load history:", error);
    }
  }

  /**
   * Format error response
   */
  formatError(error, context) {
    return {
      success: false,
      error: {
        type: "TRANSLATION_ERROR",
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
      return providerRegistry.getAll().map(p => ({ id: p.id, name: p.name }));
    } catch (error) {
      console.error("[TranslationEngine] Failed to get providers:", error);
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
      console.log("[TranslationEngine] Initialized successfully");
    } catch (error) {
      console.error("[TranslationEngine] Initialization failed:", error);
    }
  }
}
