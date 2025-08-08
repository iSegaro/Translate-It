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

    // Execute translation (attempt bulk JSON-mode first)
    let result;
    try {
      result = await providerInstance.translate(
        text,
        sourceLanguage,
        targetLanguage,
        mode,
      );
    } catch (initialError) {
      // If provider failed for bulk request, but this is SelectElement JSON
      // and the provider is marked unreliable for JSON, attempt per-segment
      // fallback before giving up.
      const isSelectJson = mode === 'SelectElement' && data.options?.rawJsonPayload;
      const providerClass = providerInstance?.constructor;
      const providerReliableJson = providerClass?.reliableJsonMode !== undefined ? providerClass.reliableJsonMode : true;

      if (isSelectJson && !providerReliableJson) {
        console.warn('[TranslationEngine] Bulk translate failed, attempting per-segment fallback:', initialError);
        // try to parse original JSON
        let originalJson = null;
        try {
          originalJson = JSON.parse(text);
        } catch (e) {
          originalJson = null;
        }

        const expectedLen = Array.isArray(originalJson) ? originalJson.length : null;
        if (expectedLen) {
          // perform per-segment translations
          const segments = originalJson.map(item => item.text);
          const concurrency = 4;
          const results = new Array(segments.length);

          const translateSegment = async (segText, attempt = 1) => {
            try {
              return await providerInstance.translate(segText, sourceLanguage, targetLanguage, mode);
            } catch (err) {
              if (attempt < 3) return translateSegment(segText, attempt + 1);
              return segText;
            }
          };

          let idx = 0;
          const workers = new Array(concurrency).fill(null).map(async () => {
            while (idx < segments.length) {
              const cur = idx++;
              results[cur] = await translateSegment(segments[cur]);
            }
          });
          await Promise.all(workers);

          const merged = originalJson.map((item, i) => ({ ...item, text: (results[i] || '').trim() }));
          result = JSON.stringify(merged);
          console.log('[TranslationEngine] Per-segment fallback succeeded after bulk failure for provider', provider);
        } else {
          // cannot recover without original JSON structure
          throw initialError;
        }
      } else {
        // not recoverable here
        throw initialError;
      }
    }

    // If this is SelectElement raw JSON and provider is known unreliable,
    // attempt to normalize or fallback to per-segment translation.
    const isSelectJson = mode === 'SelectElement' && data.options?.rawJsonPayload;
    const providerClass = providerInstance?.constructor;
    const providerReliableJson = providerClass?.reliableJsonMode !== undefined ? providerClass.reliableJsonMode : true;

    if (isSelectJson && !providerReliableJson) {
      let originalJson = null;
      try {
        originalJson = JSON.parse(text);
      } catch (e) {
        originalJson = null;
      }

      const expectedLen = Array.isArray(originalJson) ? originalJson.length : null;
      if (expectedLen) {
        let rebuilt = null;

        // Try case: provider returned a JSON array matching expected length
        try {
          const parsed = JSON.parse(result);
          if (Array.isArray(parsed) && parsed.length === expectedLen) {
            rebuilt = result;
            console.log('[TranslationEngine] Provider returned matching JSON array for SelectElement');
          } else if (Array.isArray(parsed) && parsed.length === 1 && typeof parsed[0].text === 'string') {
            // single-element array containing joined text -> try split
            const parts = parsed[0].text.split("\n\n---\n\n");
            if (parts.length === expectedLen) {
              const merged = originalJson.map((item, idx) => ({ ...item, text: parts[idx].trim() }));
              rebuilt = JSON.stringify(merged);
              console.log('[TranslationEngine] Rebuilt JSON array from single-element provider response');
            }
          }
        } catch (e) {
          // not JSON or parse failed
        }

        // Try splitting raw result by delimiter
        if (!rebuilt && typeof result === 'string') {
          const parts = result.split("\n\n---\n\n");
          if (parts.length === expectedLen) {
            const merged = originalJson.map((item, idx) => ({ ...item, text: parts[idx].trim() }));
            rebuilt = JSON.stringify(merged);
            console.log('[TranslationEngine] Rebuilt JSON array from raw translatedText by splitting delimiter');
          }
        }

        // If still not rebuilt, perform per-segment translations as fallback
        if (!rebuilt) {
          const segments = originalJson.map(item => item.text);
          const concurrency = 4;
          const results = new Array(segments.length);

          const translateSegment = async (segText, attempt = 1) => {
            try {
              return await providerInstance.translate(segText, sourceLanguage, targetLanguage, mode);
            } catch (err) {
              if (attempt < 3) return translateSegment(segText, attempt + 1);
              return segText; // fallback to original if retries fail
            }
          };

          let idx = 0;
          const workers = new Array(concurrency).fill(null).map(async () => {
            while (idx < segments.length) {
              const cur = idx++;
              results[cur] = await translateSegment(segments[cur]);
            }
          });
          await Promise.all(workers);

          const merged = originalJson.map((item, i) => ({ ...item, text: (results[i] || '').trim() }));
          rebuilt = JSON.stringify(merged);
          console.log('[TranslationEngine] Per-segment fallback used for provider', provider, 'segments', segments.length);
        }

        if (rebuilt) {
          result = rebuilt;
        }
      }
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
