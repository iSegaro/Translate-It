/**
 * Translation Engine - Centralized translation hub for background service worker
 * Handles all translation requests from UI contexts via messaging
 */

import { ProviderFactory } from "@/features/translation/providers/ProviderFactory.js";
import { storageManager } from "@/shared/storage/core/StorageCore.js";
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { getSourceLanguageAsync, getTargetLanguageAsync, TranslationMode } from "@/shared/config/config.js";
import { MessageFormat } from '@/shared/messaging/core/MessagingCore.js';
import browser from 'webextension-polyfill';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'translation-engine');

export class TranslationEngine {
  constructor() {
    this.cache = new Map();
    this.history = [];
    this.factory = new ProviderFactory();
    this.activeTranslations = new Map(); // Track active translations for cancellation
    this.cancelledRequests = new Set(); // Track cancelled request messageIds
    this.recentRequests = new Map(); // Track recent requests to prevent duplicates
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
      // Tracking translation
    }

    // Handle different input formats
    if (!context || !data) {
      // Legacy format: request contains translation data directly
      if (request.text && request.provider) {
        // Legacy format detected, normalizing
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
      
      // Check for duplicate requests within the last 5 seconds
      const now = Date.now();
      const requestKey = `${messageId}_${data.provider}_${data.text.slice(0, 50)}`;
      const lastRequest = this.recentRequests.get(requestKey);
      
      if (lastRequest && (now - lastRequest) < 5000) {
        // Duplicate request detected, ignoring
        return { success: true, streaming: true, messageId: messageId, duplicate: true };
      }
      
      this.recentRequests.set(requestKey, now);
      
      // Cleanup old entries (older than 10 seconds)
      for (const [key, timestamp] of this.recentRequests) {
        if (now - timestamp > 10000) {
          this.recentRequests.delete(key);
        }
      }
    }

    try {
      let result;
      // Check cache first for non-SelectElement contexts to improve performance
      const cacheKey = this.generateCacheKey(data);
      const isSelectElementMode = data.mode === TranslationMode.Select_Element;

      if (this.cache.has(cacheKey) && !isSelectElementMode) {
        const cached = this.cache.get(cacheKey);
        // Cache hit
        result = {
          ...cached,
          fromCache: true,
        };
      } else {
        // Context-specific optimizations (but all will include history except SelectElement)
        if (context === "popup") {
          result = await this.translateWithPriority(data, sender);
        } else if (context === "selection") {
          result = await this.translateWithCache(data, sender);
        } else {
          result = await this.executeTranslation(data, sender);
        }

        // Cache the result for future requests (but not for SelectElement mode)
        if (!isSelectElementMode) {
          this.cacheResult(cacheKey, result);
        }
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
        // Stopped tracking translation
      }

      return result;
    } catch (error) {
      // Clean up tracking on failure
      if (messageId) {
        this.activeTranslations.delete(messageId);
        this.cancelledRequests.delete(messageId);
        // Stopped tracking translation on error
      }
      // Don't log here - error already logged by provider
      // Translation failed, formatting error response
      return this.formatError(error, context);
    }
  }

  /**
   * Execute translation with priority (for popup)
   */
  async translateWithPriority(data, sender) {
    // Note: Cache checking is now done at higher level
    return await this.executeTranslation(data, sender);
  }

  /**
   * Execute translation with cache checking (for selection)
   */
  async translateWithCache(data, sender) {
    // Note: Cache checking is now done at higher level
    const result = await this.executeTranslation(data, sender);
    // Note: Caching is now done at higher level
    return result;
  }

  /**
   * Core translation execution logic with streaming support
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

    // Check for text length limits in non-SelectElement modes
    const isSelectElementMode = mode === TranslationMode.Select_Element;
    const TEXT_LENGTH_LIMITS = {
      REGULAR_MODE_WARNING: 10000,    // Warn for texts > 10k chars in regular modes
      REGULAR_MODE_MAX: 50000,        // Hard limit for texts in regular modes
      SELECT_ELEMENT_MAX: 500000      // Much higher limit for Select Element mode
    };

    if (!isSelectElementMode && text.length > TEXT_LENGTH_LIMITS.REGULAR_MODE_WARNING) {
      if (text.length > TEXT_LENGTH_LIMITS.REGULAR_MODE_MAX) {
        logger.error(`[TranslationEngine] Text too long for ${mode} mode: ${text.length} characters (max: ${TEXT_LENGTH_LIMITS.REGULAR_MODE_MAX})`);
        return {
          success: false,
          error: `Text too long for translation (${text.length} characters). Maximum allowed: ${TEXT_LENGTH_LIMITS.REGULAR_MODE_MAX} characters. For very long texts, please use the "Select Element" feature instead.`,
          translatedText: text,
          provider: provider,
          mode: mode
        };
      } else {
        logger.warn(`[TranslationEngine] Large text detected in ${mode} mode: ${text.length} characters. Consider using Select Element mode for better performance.`);
      }
    } else if (isSelectElementMode && text.length > TEXT_LENGTH_LIMITS.SELECT_ELEMENT_MAX) {
      logger.error(`[TranslationEngine] Text too long even for Select Element mode: ${text.length} characters (max: ${TEXT_LENGTH_LIMITS.SELECT_ELEMENT_MAX})`);
      return {
        success: false,
        error: `Text too long for translation (${text.length} characters). Maximum allowed: ${TEXT_LENGTH_LIMITS.SELECT_ELEMENT_MAX} characters.`,
        translatedText: text,
        provider: provider,
        mode: mode
      };
    }

    // Get original source and target languages from config for language swapping logic
    const [originalSourceLang, originalTargetLang] = await Promise.all([
      getSourceLanguageAsync(),
      getTargetLanguageAsync()
    ]);

    // Check if this is a JSON mode that should use streaming
    const isSelectJson = mode === TranslationMode.Select_Element && data.options?.rawJsonPayload;
    const providerReliableJson = providerClass?.reliableJsonMode !== undefined ? providerClass.reliableJsonMode : true;

    // For Select Element JSON mode, use optimized streaming strategy (only for AI providers with reliable JSON mode)
    if (isSelectJson && providerReliableJson) {
      logger.debug('[TranslationEngine] Using optimized JSON strategy for provider:', provider);
      const tabId = sender?.tab?.id;
      return await this.executeOptimizedJsonTranslation(data, providerInstance, originalSourceLang, originalTargetLang, data.messageId, tabId);
    }

    // Check if provider supports streaming for non-JSON modes
    const messageId = data.messageId;
    const shouldUseStreaming = this._shouldUseStreamingForProvider(providerInstance, text, messageId, mode);
    
    // Store sender info for streaming if messageId is available
    if (messageId && sender) {
      this.streamingSenders = this.streamingSenders || new Map();
      this.streamingSenders.set(messageId, sender);
    }
    
    if (shouldUseStreaming) {
      logger.debug(`[TranslationEngine] Using streaming translation for provider: ${provider}`);
      return await this.executeStreamingTranslation(data, providerInstance, sender, originalSourceLang, originalTargetLang);
    }

    // Standard translation for non-streaming providers
    let result;
    try {
            
      // Standard translation call
      
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
    const OPTIMAL_BATCH_SIZE = 25; // Increased from 10 for better efficiency
    const batches = this.createIntelligentBatches(segments, OPTIMAL_BATCH_SIZE);

    const abortController = messageId ? this.activeTranslations.get(messageId) : null;
    let hasErrors = false; // Move hasErrors to function scope

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
                        () => {
                            // Check provider type to determine which method to call
                            const providerClass = providerInstance?.constructor;
                            if (providerClass?.type === "ai") {
                                // AI providers use _translateBatch method directly
                                return providerInstance._translateBatch(batch, sourceLanguage, targetLanguage, mode, abortController);
                            } else {
                                // Traditional providers (including streaming ones) use translate method
                                const batchJson = JSON.stringify(batch);
                                return providerInstance.translate(batchJson, sourceLanguage, targetLanguage, {
                                    mode: mode,
                                    messageId: messageId,
                                    engine: this,
                                    originalSourceLang: sourceLanguage,
                                    originalTargetLang: targetLanguage
                                });
                            }
                        },
                        `batch-${i + 1}/${batches.length}`,
                        mode
                    );

                    // Success - reset consecutive failures and reduce adaptive delay
                    consecutiveFailures = 0;
                    adaptiveDelay = Math.max(adaptiveDelay * 0.8, 0);

                    // Parse result based on provider type
                    const providerClass = providerInstance?.constructor;
                    let finalBatchResult;
                    if (providerClass?.type === "ai") {
                        // AI providers return arrays directly
                        finalBatchResult = batchResult;
                    } else {
                        // Traditional providers (including streaming ones) return JSON string from translate() method
                        if (typeof batchResult === 'string') {
                            try {
                                const parsedResult = JSON.parse(batchResult);
                                logger.debug(`[TranslationEngine] Parsed JSON result structure:`, parsedResult);
                                if (Array.isArray(parsedResult)) {
                                    // Extract text from objects: [{text: "..."}, ...] → ["...", ...]
                                    finalBatchResult = parsedResult.map(item => 
                                        typeof item === 'object' && item !== null && 'text' in item ? item.text : String(item)
                                    );
                                    logger.debug(`[TranslationEngine] Extracted texts:`, finalBatchResult);
                                } else {
                                    finalBatchResult = [String(parsedResult)];
                                }
                            } catch (error) {
                                logger.warn(`[TranslationEngine] Failed to parse traditional provider JSON result:`, error);
                                logger.debug(`[TranslationEngine] Raw result that failed to parse (${typeof batchResult}):`, batchResult);
                                
                                // Try to fix common JSON parsing issues (e.g., Persian commas)
                                try {
                                    const fixedResult = batchResult.replace(/،/g, ',').replace(/\s*،\s*/g, ', ');
                                    const parsedFixed = JSON.parse(fixedResult);
                                    if (Array.isArray(parsedFixed)) {
                                        finalBatchResult = parsedFixed.map(item => 
                                            typeof item === 'object' && item !== null && 'text' in item ? item.text : String(item)
                                        );
                                        logger.info(`[TranslationEngine] Successfully fixed malformed JSON with delimiter replacement`);
                                    } else {
                                        finalBatchResult = [String(parsedFixed)];
                                    }
                                } catch (fixError) {
                                    logger.warn(`[TranslationEngine] JSON fix attempt also failed:`, fixError);
                                    // Ultimate fallback: try to extract array content using regex
                                    const arrayMatch = batchResult.match(/\["([^"]*)"(?:\s*[،,]\s*"([^"]*)")*\]/);
                                    if (arrayMatch) {
                                        // Extract all quoted strings from the array-like string
                                        const extractedTexts = batchResult.match(/"([^"]*)"/g);
                                        if (extractedTexts) {
                                            finalBatchResult = extractedTexts.map(text => text.slice(1, -1)); // Remove quotes
                                            logger.info(`[TranslationEngine] Successfully extracted texts using regex fallback`);
                                        } else {
                                            finalBatchResult = [String(batchResult)];
                                        }
                                    } else {
                                        finalBatchResult = [String(batchResult)];
                                    }
                                }
                            }
                        } else if (Array.isArray(batchResult)) {
                            // Fallback: already an array (shouldn't happen for traditional providers)
                            finalBatchResult = batchResult;
                        } else {
                            finalBatchResult = [String(batchResult)];
                        }
                    }

                    const streamUpdateMessage = MessageFormat.create(
                        MessageActions.TRANSLATION_STREAM_UPDATE,
                        {
                          success: true,
                          data: finalBatchResult,
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
                    hasErrors = true;
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
                { success: !hasErrors },
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
    
    // Smart batching for small texts: use single batch if total segments <= 20
    const totalSegments = segments.length;
    const totalComplexity = segments.reduce((sum, seg) => sum + this.calculateTextComplexity(seg), 0);
    
    if (totalSegments <= 20 || totalComplexity < 300) {
      logger.debug(`[TranslationEngine] Using single batch for ${totalSegments} segments (complexity: ${totalComplexity})`);
      return [segments];
    }
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const segmentComplexity = this.calculateTextComplexity(segment);
      
      // Calculate optimal batch size based on segment complexity
      const adjustedBatchSize = this.getAdjustedBatchSize(segmentComplexity, baseBatchSize);
      
      // Check if adding this segment would exceed batch limits
      const wouldExceedSize = currentBatch.length >= adjustedBatchSize;
      const wouldExceedComplexity = currentBatchComplexity + segmentComplexity > 400; // Increased from 200 for better efficiency
      
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
    const hasNonLatin = /[^\u0000-\u007F]/.test(text); // eslint-disable-line no-control-regex
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
      const hasNonLatin = /[^\u0000-\u007F]/.test(text); // eslint-disable-line no-control-regex
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
    try {
      logger.debug(`[TranslationEngine] Getting provider '${providerId}'`);
      const provider = await this.factory.getProvider(providerId);

      if (provider) {
        logger.debug(`[TranslationEngine] Provider '${providerId}' loaded successfully`);
        return provider;
      }
    } catch (error) {
      logger.error(
        `[TranslationEngine] Failed to get provider '${providerId}':`,
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
  async cancelTranslation(messageId) {
    if (messageId) {
      logger.debug(`[TranslationEngine] Marking translation as cancelled: ${messageId}`);
      this.cancelledRequests.add(messageId);

      if (this.activeTranslations.has(messageId)) {
        const abortController = this.activeTranslations.get(messageId);
        abortController.abort();
        logger.debug(`[TranslationEngine] Aborted translation for messageId: ${messageId}`);
      }

      // Cancel streaming session if active
      try {
        const { streamingManager } = await import("./StreamingManager.js");
        await streamingManager.cancelStream(messageId, 'Translation cancelled by user');
      } catch (error) {
        logger.debug(`[TranslationEngine] StreamingManager cancel failed (might not be streaming): ${error.message}`);
      }

      return true;
    }
    return false;
  }

  /**
   * Cancel all active translations
   */
  async cancelAllTranslations() {
    logger.debug(`[TranslationEngine] Cancelling all active translations`, {
      activeCount: this.activeTranslations.size
    });
    
    let cancelledCount = 0;
    
    // Cancel all active translations
    for (const [messageId, abortController] of this.activeTranslations) {
      try {
        this.cancelledRequests.add(messageId);
        abortController.abort();
        cancelledCount++;
        logger.debug(`[TranslationEngine] Cancelled translation: ${messageId}`);
      } catch (error) {
        logger.warn(`[TranslationEngine] Error cancelling translation ${messageId}:`, error);
      }
    }
    
    // Cancel all streaming sessions
    try {
      const { streamingManager } = await import("./StreamingManager.js");
      await streamingManager.cancelAllStreams('All translations cancelled by user');
    } catch (error) {
      logger.debug(`[TranslationEngine] StreamingManager cancelAll failed: ${error.message}`);
    }
    
    logger.debug(`[TranslationEngine] Cancelled ${cancelledCount} active translations`);
    return cancelledCount;
  }

  /**
   * Check if provider should use streaming for this request
   * @param {object} providerInstance - Provider instance
   * @param {string} text - Text to translate
   * @param {string} messageId - Message ID
   * @param {string} mode - Translation mode
   * @returns {boolean} - Whether to use streaming
   */
  _shouldUseStreamingForProvider(providerInstance, text, messageId, mode) {
    // Must have messageId for streaming coordination
    if (!messageId) {
      return false;
    }

    const providerType = providerInstance.constructor.type; // "ai" or "translate"
    const providerName = providerInstance.providerName || providerInstance.constructor.name;

    // Special case: only Select_Element mode should use streaming for very long texts
    const isSelectElementMode = mode === TranslationMode.Select_Element;

    if (providerType === "ai") {
      // AI providers: stream for longer texts, but mainly for Select Element mode
      if (isSelectElementMode) {
        return text.length > 500; // Enable streaming for Select Element with long texts
      } else {
        // For other modes (sidepanel, popup, etc.), limit text length to prevent streaming issues
        if (text.length > 10000) {
          logger.warn(`[TranslationEngine] Text too long for non-SelectElement mode: ${text.length} characters. Consider using Select Element mode for long texts.`);
          return false; // Don't stream, will be handled by standard translation with chunking
        }
        return false; // No streaming for regular translation modes
      }
    } else {
      // Traditional providers: Only for Select Element mode and very long texts
      if (isSelectElementMode && text.length > 2000) {
        // Check if provider actually supports streaming
        const providerSupportsStreaming = providerInstance.constructor.supportsStreaming !== false;
        if (!providerSupportsStreaming) {
          logger.debug(`[TranslationEngine] Provider ${providerName} doesn't support streaming, using standard translation`);
          return false;
        }
        return true;
      }
      
      // For non-SelectElement modes, never use streaming for traditional providers
      return false;
    }
  }

  /**
   * Execute streaming translation for AI providers
   * @param {object} data - Translation data
   * @param {object} providerInstance - Provider instance  
   * @param {object} sender - Message sender
   * @param {string} originalSourceLang - Original source language
   * @param {string} originalTargetLang - Original target language
   * @returns {Promise<object>} - Streaming result
   */
  async executeStreamingTranslation(data, providerInstance, sender, originalSourceLang, originalTargetLang) {
    const { text, provider, sourceLanguage, targetLanguage, mode, messageId } = data;

    // Initialize streaming session
    const { streamingManager } = await import("./StreamingManager.js");
    const segments = [text]; // For simple text, treat as single segment
    
    streamingManager.initializeStream(messageId, sender, providerInstance, segments);

    // Store sender info for streaming callbacks
    this.streamingSenders = this.streamingSenders || new Map();
    this.streamingSenders.set(messageId, sender);

    // Start streaming translation
    try {
      
      await providerInstance.translate(
        text,
        sourceLanguage,
        targetLanguage,
        {
          mode: mode,
          originalSourceLang: originalSourceLang,
          originalTargetLang: originalTargetLang,
          messageId: messageId,
          engine: this
        }
      );

      // For streaming providers, they handle their own streaming
      // Just return streaming indicator
      return {
        success: true,
        streaming: true,
        messageId: messageId,
        provider: provider,
        timestamp: Date.now()
      };

    } catch (error) {
      // Handle streaming error - streaming manager already sent error to UI
      await streamingManager.handleStreamError(messageId, error);
      
      // For streaming translations, don't throw - streaming manager handles the error
      // Return a success indicator since streaming was initiated (even if it failed)
      return {
        success: true,
        streaming: true,
        messageId: messageId,
        provider: provider,
        timestamp: Date.now()
      };
    } finally {
      // Cleanup
      if (this.streamingSenders) {
        this.streamingSenders.delete(messageId);
      }
    }
  }

  /**
   * Get sender information for streaming messages
   * @param {string} messageId - Message ID
   * @returns {object|null} - Sender information
   */
  getStreamingSender(messageId) {
    return this.streamingSenders?.get(messageId) || null;
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