/**
 * Translation Engine - Centralized translation hub for background service worker
 * Handles all translation requests from UI contexts via messaging
 */

import { ProviderFactory } from "@/features/translation/providers/ProviderFactory.js";
import { providerRegistry } from "@/features/translation/providers/ProviderRegistry.js";
import { storageManager } from "@/shared/storage/core/StorageCore.js";
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { getSourceLanguageAsync, getTargetLanguageAsync, TranslationMode } from "@/shared/config/config.js";
import { MessageFormat } from '@/shared/messaging/core/MessagingCore.js';
import browser from 'webextension-polyfill';

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
  async handleTranslateMessage(request, sender) {
    // Input validation and normalization only - main logging is handled by handleTranslate

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
      // Check if this messageId is already being processed
      if (this.activeTranslations.has(messageId)) {
        logger.warn(`[TranslationEngine] Translation already in progress for messageId: ${messageId}. Ignoring duplicate request.`);
        throw new Error(`Translation already in progress for messageId: ${messageId}`);
      }
      
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
        `Invalid text: expected non-empty string, got \"${data.text}\"`, 
      );
    }

    if (!data.provider || typeof data.provider !== "string") {
      throw new Error(
        `Invalid provider: expected string, got \"${data.provider}\"`, 
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
        result = await this.translateWithPriority(data, sender);
      } else if (context === "selection") {
        result = await this.translateWithCache(data, sender);
      } else {
        result = await this.executeTranslation(data, sender);
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
  async translateWithPriority(data, sender) {
    // Check cache first for instant response
    const cacheKey = this.generateCacheKey(data);
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      return {
        ...cached,
        fromCache: true,
      };
    }
    return await this.executeTranslation(data, sender);
  }

  /**
   * Execute translation with cache checking (for selection)
   */
  async translateWithCache(data, sender) {
    const cacheKey = this.generateCacheKey(data);
    // Return cached result if available
    if (this.cache.has(cacheKey)) {
      return {
        ...this.cache.get(cacheKey),
        fromCache: true,
      };
    }
    const result = await this.executeTranslation(data, sender);
    // Cache the result
    this.cacheResult(cacheKey, result);
    return result;
  }

  /**
   * Core translation execution logic
   */
  async executeTranslation(data, sender) {
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
      const tabId = sender?.tab?.id;
      return await this.executeOptimizedJsonTranslation(data, providerInstance, originalSourceLang, originalTargetLang, data.messageId, tabId);
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
        const tabId = sender?.tab?.id;
        return await this.executeOptimizedJsonTranslation(data, providerInstance, originalSourceLang, originalTargetLang, data.messageId, tabId);
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
  async executeOptimizedJsonTranslation(data, providerInstance, originalSourceLang, originalTargetLang, messageId = null, tabId = null) {
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
    const { rateLimitManager } = await import("@/features/translation/core/RateLimitManager.js");
    
    // Force reload configurations to ensure latest rate limiting settings
    rateLimitManager.reloadConfigurations();
    const OPTIMAL_BATCH_SIZE = 10;
    const batches = this.createIntelligentBatches(segments, OPTIMAL_BATCH_SIZE);

    const abortController = messageId ? this.activeTranslations.get(messageId) : null;

    (async () => {
        try {
            let consecutiveFailures = 0;
            const MAX_CONSECUTIVE_FAILURES = 3;
            let adaptiveDelay = 0;
            
            for (let i = 0; i < batches.length; i++) {
                if (this.isCancelled(messageId)) {
                    logger.info(`[TranslationEngine] Translation cancelled for messageId: ${messageId}`);
                    break;
                }

                const batch = batches[i];
                const batchSize = batch.length;
                const batchComplexity = this.calculateBatchComplexity(batch);
                
                // Apply intelligent delay based on batch properties and previous failures
                if (i > 0) {
                    const baseDelay = Math.min(2000 + (batchSize * 150), 5000); // Increased base delay
                    const complexityMultiplier = batchComplexity > 50 ? 1.5 : 1.0;
                    const failureMultiplier = Math.pow(2, consecutiveFailures);
                    
                    adaptiveDelay = Math.min(
                        baseDelay * complexityMultiplier * failureMultiplier + adaptiveDelay * 0.3,
                        20000 // Maximum 20 seconds delay (increased from 15)
                    );
                    
                    logger.debug(`[TranslationEngine] Applying intelligent delay: ${Math.round(adaptiveDelay)}ms (batch: ${i + 1}/${batches.length}, size: ${batchSize}, complexity: ${batchComplexity}, failures: ${consecutiveFailures})`);
                    await new Promise(resolve => setTimeout(resolve, adaptiveDelay));
                }
                
                try {
                    const batchResult = await rateLimitManager.executeWithRateLimit(
                        provider,
                        () => providerInstance._translateBatch(batch, sourceLanguage, targetLanguage, mode),
                        `batch-${i + 1}/${batches.length}`
                    );

                    // Success - reset consecutive failures and reduce adaptive delay
                    consecutiveFailures = 0;
                    adaptiveDelay = Math.max(adaptiveDelay * 0.8, 0);

                    const streamUpdateMessage = MessageFormat.create(
                        MessageActions.TRANSLATION_STREAM_UPDATE,
                        {
                          success: true,
                          data: batchResult,
                          originalData: batch,
                          batchIndex: i,
                          provider: provider,
                          sourceLanguage: sourceLanguage,
                          targetLanguage: targetLanguage,
                          timestamp: Date.now(),
                          translationMode: mode,
                        },
                        'background-stream',
                        { messageId: messageId }
                      );
                      if (tabId) {
                        browser.tabs.sendMessage(tabId, streamUpdateMessage).then(response => {
                          logger.debug(`[TranslationEngine] TRANSLATION_STREAM_UPDATE sent successfully to tab ${tabId}, response:`, response);
                        }).catch(error => {
                          logger.error(`[TranslationEngine] Failed to send TRANSLATION_STREAM_UPDATE message to tab ${tabId}:`, error);
                        });
                      } else {
                        logger.error(`[TranslationEngine] No tabId available for sending TRANSLATION_STREAM_UPDATE`);
                      }

                } catch (error) {
                    consecutiveFailures++;
                    logger.warn(`[TranslationEngine] Batch ${i + 1} failed (consecutive failures: ${consecutiveFailures}):`, error);
                    
                    const streamUpdateMessage = MessageFormat.create(
                        MessageActions.TRANSLATION_STREAM_UPDATE,
                        {
                          success: false,
                          error: { message: error.message, type: error.type },
                          batchIndex: i,
                          originalData: batch,
                        },
                        'background-stream',
                        { messageId: messageId }
                    );
                    if (tabId) {
                        browser.tabs.sendMessage(tabId, streamUpdateMessage).catch(err => {
                          logger.error(`[TranslationEngine] Failed to send error stream update to tab ${tabId}:`, err);
                        });
                    }
                    
                    // Stop on quota exceeded or too many consecutive failures
                    if (error.type === 'QUOTA_EXCEEDED' || error.type === 'CIRCUIT_BREAKER_OPEN') {
                        logger.error(`[TranslationEngine] Critical error (${error.type}), stopping translation.`);
                        break;
                    }
                    
                    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                        logger.error(`[TranslationEngine] Too many consecutive failures (${consecutiveFailures}), stopping translation.`);
                        break;
                    }
                }
            }
        } catch (error) {
            logger.error(`[TranslationEngine] Unhandled error during streaming:`, error);
        } finally {
            const streamEndMessage = MessageFormat.create(
                MessageActions.TRANSLATION_STREAM_END,
                { success: true },
                'background-stream',
                { messageId: messageId }
              );
              if (tabId) {
                browser.tabs.sendMessage(tabId, streamEndMessage).catch(error => {
                  logger.error(`[TranslationEngine] Failed to send TRANSLATION_STREAM_END message to tab ${tabId}:`, error);
                });
              }
        }
    })();

    return {
        success: true,
        streaming: true,
    };
  }

  /**
   * Create optimal batches based on text length and similarity
   */
  createOptimalBatches(segments, maxBatchSize) {
    const batches = [];
    for (let i = 0; i < segments.length; i += maxBatchSize) {
        batches.push(segments.slice(i, i + maxBatchSize));
    }
    return batches;
  }

  /**
   * Create intelligent batches based on text complexity and characteristics
   */
  createIntelligentBatches(segments, baseBatchSize) {
    const batches = [];
    let currentBatch = [];
    let currentBatchComplexity = 0;
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const segmentComplexity = this.calculateTextComplexity(segment);
      
      // Calculate optimal batch size based on segment complexity
      const adjustedBatchSize = this.getAdjustedBatchSize(segmentComplexity, baseBatchSize);
      
      // Check if adding this segment would exceed batch limits
      const wouldExceedSize = currentBatch.length >= adjustedBatchSize;
      const wouldExceedComplexity = currentBatchComplexity + segmentComplexity > 200;
      
      if (wouldExceedSize || wouldExceedComplexity) {
        if (currentBatch.length > 0) {
          batches.push([...currentBatch]);
          currentBatch = [];
          currentBatchComplexity = 0;
        }
      }
      
      currentBatch.push(segment);
      currentBatchComplexity += segmentComplexity;
    }
    
    // Add the last batch if not empty
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }
    
    logger.debug(`[TranslationEngine] Created ${batches.length} intelligent batches from ${segments.length} segments`);
    return batches;
  }

  /**
   * Calculate complexity for a single text segment
   */
  calculateTextComplexity(text) {
    let complexity = 0;
    
    // Length factor
    complexity += Math.min(text.length / 20, 50);
    
    // Special characters
    const specialChars = (text.match(/[^\w\s]/g) || []).length;
    complexity += specialChars;
    
    // Technical content
    if (text.match(/https?:\/\/|www\./)) complexity += 15;
    if (text.match(/[{}[\]<>]/)) complexity += 8;
    if (text.match(/\d+\.\d+|\w+\.\w+/)) complexity += 5;
    
    // Mixed scripts
    const hasLatin = /[a-zA-Z]/.test(text);
    const hasNonLatin = /[^\x00-\x7F]/.test(text);
    if (hasLatin && hasNonLatin) complexity += 10;
    
    return Math.round(complexity);
  }

  /**
   * Get adjusted batch size based on text complexity
   */
  getAdjustedBatchSize(avgComplexity, baseBatchSize) {
    if (avgComplexity > 80) return Math.max(3, Math.floor(baseBatchSize * 0.3));
    if (avgComplexity > 50) return Math.max(5, Math.floor(baseBatchSize * 0.5));
    if (avgComplexity > 30) return Math.max(7, Math.floor(baseBatchSize * 0.7));
    return baseBatchSize;
  }

  /**
   * Calculate batch complexity based on text characteristics
   */
  calculateBatchComplexity(batch) {
    if (!Array.isArray(batch) || batch.length === 0) return 0;
    
    let totalComplexity = 0;
    
    for (const text of batch) {
      let textComplexity = 0;
      
      // Length factor (longer texts are more complex)
      textComplexity += Math.min(text.length / 10, 30);
      
      // Special characters and formatting
      const specialChars = (text.match(/[^\w\s]/g) || []).length;
      textComplexity += specialChars * 0.5;
      
      // Technical terms (URLs, code, etc.)
      if (text.match(/https?:\/\/|www\./)) textComplexity += 10;
      if (text.match(/[{}[\]<>]/)) textComplexity += 5;
      if (text.match(/\d+\.\d+|\w+\.\w+/)) textComplexity += 3;
      
      // Mixed languages or scripts
      const hasLatin = /[a-zA-Z]/.test(text);
      const hasNonLatin = /[^\x00-\x7F]/.test(text);
      if (hasLatin && hasNonLatin) textComplexity += 8;
      
      totalComplexity += textComplexity;
    }
    
    // Average complexity per text in batch
    return Math.round(totalComplexity / batch.length);
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
          
          const result = await providerInstance.translate(segments[idx], sourceLanguage, targetLanguage, { mode, originalSourceLang, originalTargetLang, abortController });
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
    
    // Process individual translations sequentially instead of Promise.all()
    for (const individualPromise of individualPromises) {
      const { idx, result, success } = await individualPromise;
      results[idx] = result;
      // Mark as successful if API call succeeded, regardless of text change
      translationStatus[idx] = success;
    }
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
      const { getAvailableProviders } = await import("../../../handlers/provider-handler.js");
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