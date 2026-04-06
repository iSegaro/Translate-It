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
import { matchErrorToType, isFatalError } from '@/shared/error-management/ErrorMatcher.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";
import browser from 'webextension-polyfill';
import ExtensionContextManager from '@/core/extensionContext.js';

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
    if (!request || typeof request !== "object") {
      throw new Error(`Invalid request: expected object, got ${typeof request}`);
    }

    // Extract context and data with robust fallbacks
    let context = request.context || "unknown";
    let data = request.data;

    if (!data && request.text) {
      // Compatibility for older message format
      data = {
        text: request.text,
        provider: request.provider,
        sourceLanguage: request.sourceLanguage,
        targetLanguage: request.targetLanguage,
        mode: request.mode,
        options: request.options,
      };
    }

    if (!data) {
      throw new Error("Invalid request: missing translation data");
    }

    const messageId = request.messageId || data.messageId || `msg-${Date.now()}`;
    data.messageId = messageId;

    // Detect duplicate requests (brief window)
    const requestId = `${messageId}:${data.text?.substring(0, 50)}`;
    if (this.recentRequests.has(requestId)) {
      const existing = this.recentRequests.get(requestId);
      if (Date.now() - existing.time < 1000) {
        // Debounce duplicate request
        return existing.promise;
      }
    }

    // Track active translation
    const abortController = new AbortController();
    this.activeTranslations.set(messageId, abortController);
    this.cancelledRequests.delete(messageId);

    try {
      // Execute translation
      const result = await this.executeTranslation(data, sender);

      if (!result || typeof result !== "object") {
        throw new Error(
          `Translation failed: invalid result format (${typeof result})`,
        );
      }

      if (result.success === undefined) {
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

    // Strict Dictionary Override: If enableDictionary is explicitly false, 
    // prevent any auto-switching to dictionary mode regardless of text length.
    // This is vital for Select Element, Field and Page modes.
    const isDictionaryForbidden = data.enableDictionary === false || 
                                 (data.options && data.options.enableDictionary === false) ||
                                 mode === TranslationMode.Select_Element ||
                                 mode === TranslationMode.Field ||
                                 mode === TranslationMode.Page;
    
    if (isDictionaryForbidden && (mode === TranslationMode.Dictionary_Translation || mode === TranslationMode.Selection)) {
      if (mode === TranslationMode.Dictionary_Translation) {
        logger.debug(`[TranslationEngine] Dictionary mode forbidden by request flags. Forcing selection mode.`);
      }
      // Force selection mode
      mode = TranslationMode.Selection;
      data.mode = TranslationMode.Selection;
    } else if (mode === TranslationMode.Dictionary_Translation && !providerClass?.supportsDictionary) {
      // Standard downgrade if provider simply doesn't support dictionary
      logger.debug(`Provider ${provider} does not support dictionary mode. Downgrading to selection mode.`);
      mode = TranslationMode.Selection;
      data.mode = TranslationMode.Selection;
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

    // For Select Element JSON mode, use optimized strategy for ALL providers.
    // This ensures logical block batching and text extraction works for both AI and traditional providers.
    if (isSelectJson) {
      logger.debug('[TranslationEngine] Using optimized SelectElement strategy for provider:', provider);
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
          sessionId: data.sessionId || data.messageId, // Ensure we always have a sessionId
          charCount: text.length,    // Pass text length for stats tracking
          engine: this
        }
      );
    } catch (initialError) {
      // For fatal errors like unsupported language pair, stop immediately
      if (isFatalError(initialError)) {
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
    const { text, provider, sourceLanguage, targetLanguage, mode, contextMetadata, contextSummary } = data;
    
    let originalJson;
    try {
      originalJson = JSON.parse(text);
    } catch {
      throw new Error('Invalid JSON format for SelectElement mode');
    }

    if (!Array.isArray(originalJson)) {
      throw new Error('SelectElement JSON must be an array');
    }

    const segments = originalJson.length === 1 && typeof originalJson[0] === 'string'
      ? originalJson
      : originalJson; // Keep full objects (t, i, b, r)

    const { rateLimitManager } = await import("@/features/translation/core/RateLimitManager.js");
    
    // Force reload configurations to ensure latest rate limiting settings
    rateLimitManager.reloadConfigurations();
    const OPTIMAL_BATCH_SIZE = 25; 
    const batches = this.createIntelligentBatches(segments, OPTIMAL_BATCH_SIZE);

    // Use LanguageSwappingService to handle potential language flipping
    const firstItem = segments[0];
    const firstText = typeof firstItem === 'object' ? (firstItem.t || firstItem.text || '') : (firstItem || '');
    const { LanguageSwappingService } = await import("@/features/translation/providers/LanguageSwappingService.js");
    const [actualSource, actualTarget] = await LanguageSwappingService.applyLanguageSwapping(
      firstText, sourceLanguage, targetLanguage, data.originalSourceLang || sourceLanguage, data.originalTargetLang || targetLanguage,
      { providerName: provider }
    );

    // Update data with potentially swapped languages
    const effectiveSource = actualSource;
    const effectiveTarget = actualTarget;

    const abortController = messageId ? this.activeTranslations.get(messageId) : null;
    const sessionId = data.sessionId || messageId; 
    let hasErrors = false;
    let lastError = null;

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
                const batchCharCount = batch.reduce((sum, item) => {
                  const text = typeof item === 'object' ? (item.t || item.text || '') : (item || '');
                  return sum + (text?.length || 0);
                }, 0);
                
                // Attach sessionId to abortController carrier
                if (abortController) {
                    abortController.sessionId = sessionId;
                }

                // Apply intelligent delay based on batch properties and previous failures
                if (i > 0) {
                    const baseDelay = Math.min(2000 + (batchSize * 150), 5000); 
                    const complexityMultiplier = batchComplexity > 50 ? 1.5 : 1.0;
                    const failureMultiplier = Math.pow(2, consecutiveFailures);
                    
                    adaptiveDelay = Math.min(
                        baseDelay * complexityMultiplier * failureMultiplier + adaptiveDelay * 0.3,
                        20000 
                    );
                    
                    logger.debug(`[TranslationEngine] Applying intelligent delay: ${Math.round(adaptiveDelay)}ms (batch: ${i + 1}/${batches.length}, size: ${batchSize}, complexity: ${batchComplexity}, failures: ${consecutiveFailures})`);
                    await new Promise(resolve => setTimeout(resolve, adaptiveDelay));
                }
                
                try {
                    // Track stats before call to calculate exact network delta
                    const { statsManager } = await import('@/features/translation/core/TranslationStatsManager.js');
                    const statsBefore = statsManager.getSessionSummary(sessionId);
                    const charsBefore = statsBefore ? statsBefore.chars : 0;

                    const batchResult = await rateLimitManager.executeWithRateLimit(
                        provider,
                        () => {
                            const providerClass = providerInstance?.constructor;
                            const isAIProvider = providerClass?.type === "ai" ||
                                               typeof providerInstance?._translateBatch === 'function';

                            if (isAIProvider) {
                                // AI providers use _translateBatch method directly
                                return providerInstance._translateBatch(
                                  batch, 
                                  effectiveSource, 
                                  effectiveTarget, 
                                  mode, 
                                  abortController,
                                  this,
                                  messageId,
                                  sessionId,
                                  { ...contextMetadata, contextSummary } // Enhanced context object
                                );
                            } else if (typeof providerInstance?._translateChunk === 'function') {
                                // Traditional providers use _translateChunk method
                                const chunkTexts = batch.map(item => typeof item === 'object' ? (item.t || item.text || '') : (item || ''));
                                return providerInstance._translateChunk(
                                    chunkTexts, 
                                    effectiveSource, 
                                    effectiveTarget, 
                                    mode, 
                                    abortController,
                                    0,              // retryAttempt
                                    batch.length,   // segmentCount
                                    1,              // chunkIndex
                                    1,              // totalChunks
                                    { sessionId, contextSummary } // Correct options object
                                );
                            } else {
                                throw new Error(`Translation provider method not available for ${provider}`);
                            }
                        },
                        `batch-${i + 1}/${batches.length}`,
                        mode
                    );

                    // Success - reset consecutive failures and reduce adaptive delay
                    consecutiveFailures = 0;
                    adaptiveDelay = Math.max(adaptiveDelay * 0.8, 0);

                    // Log Batch Progress
                    const statsAfter = statsManager.getSessionSummary(sessionId);
                    const batchNetworkChars = statsAfter ? (statsAfter.chars - charsBefore) : batchCharCount;
                    statsManager.printSummary(sessionId, {
                        status: 'Batch',
                        batchChars: batchNetworkChars,
                        batchOriginalChars: batchCharCount 
                    });

                    // All providers now return arrays directly
                    let finalBatchResult = batchResult;

                    // Ensure we have an array
                    if (!Array.isArray(finalBatchResult)) {
                        logger.warn(`[TranslationEngine] Expected array from provider, got ${typeof finalBatchResult}:`, finalBatchResult);
                        finalBatchResult = [String(finalBatchResult)];
                    }

                    // Map results back to objects if batch items were objects
                    const mappedResults = finalBatchResult.map((text, idx) => {
                      const translatedContent = text?.text || text;
                      if (typeof batch[idx] === 'object') {
                        // Crucial: update 't' key with translated content, keeping other metadata (i, b, r)
                        return { ...batch[idx], t: translatedContent, text: translatedContent };
                      }
                      return translatedContent;
                    });

                    const streamUpdateMessage = MessageFormat.create(
                        MessageActions.TRANSLATION_STREAM_UPDATE,
                        {
                          success: true,
                          data: mappedResults,
                          originalData: batch,
                          batchIndex: i,
                          provider: provider,
                          sourceLanguage: effectiveSource,
                          targetLanguage: effectiveTarget,
                          timestamp: Date.now(),
                          translationMode: mode,
                        },
                        'background-stream',
                        messageId
                      );
                      if (tabId) {
                        browser.tabs.sendMessage(tabId, streamUpdateMessage).catch(error => {
                          logger.error(`[TranslationEngine] Failed to send TRANSLATION_STREAM_UPDATE to tab ${tabId}:`, error);
                        });
                      }

                } catch (error) {
                    consecutiveFailures++;
                    hasErrors = true;
                    lastError = error;
                    const errorType = error.type || matchErrorToType(error);
                    const isFatal = isFatalError(error);

                    if (errorType !== ErrorTypes.USER_CANCELLED) {
                      await ErrorHandler.getInstance().handle(error, {
                        context: 'TranslationEngine.batch',
                        showToast: false,
                        metadata: { batchIndex: i + 1, consecutiveFailures, providerName: provider }
                      });
                    }
                    
                    const streamUpdateMessage = MessageFormat.create(
                        MessageActions.TRANSLATION_STREAM_UPDATE,
                        {
                          success: false,
                          error: { message: error.message, type: errorType },
                          batchIndex: i,
                          originalData: batch,
                        },
                        'background-stream',
                        messageId
                    );
                    if (tabId) browser.tabs.sendMessage(tabId, streamUpdateMessage).catch(() => {});
                    
                    if (isFatal || errorType === 'CIRCUIT_BREAKER_OPEN' || consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                        logger.error(`[TranslationEngine] Stopping translation due to fatal error: ${errorType}`);
                        break;
                    }
                }
            }
        } catch (error) {
            logger.error(`[TranslationEngine] Unhandled error during streaming:`, error);
        } finally {
            try {
              const { statsManager } = await import('@/features/translation/core/TranslationStatsManager.js');
              statsManager.printSummary(sessionId, { status: 'Streaming', success: !hasErrors, clear: true });
            } catch (e) { /* ignore */ }

            const streamEndMessage = MessageFormat.create(
                MessageActions.TRANSLATION_STREAM_END,
                { 
                  success: !hasErrors,
                  error: hasErrors ? { 
                    message: lastError?.message || 'Translation failed', 
                    type: lastError?.type || matchErrorToType(lastError) || 'TRANSLATION_ERROR'
                  } : null,
                  targetLanguage: effectiveTarget
                },
                'background-stream',
                messageId
              );
              if (tabId) browser.tabs.sendMessage(tabId, streamEndMessage).catch(() => {});
        }
    })();

    return { success: true, streaming: true };
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
   * Split a very long text into smaller chunks at sentence boundaries if possible
   */
  _splitOversizedSegment(segment, maxChars) {
    const isObject = typeof segment === 'object';
    const text = isObject ? (segment.t || segment.text || '') : (segment || '');
    if (!text || text.length <= maxChars) return [segment];
    
    const chunks = [];
    let remaining = text;
    let partIndex = 0;
    
    while (remaining.length > maxChars) {
      let breakPoint = -1;
      const lookback = Math.floor(maxChars * 0.2); 
      const searchRegion = remaining.substring(maxChars - lookback, maxChars);
      
      const sentenceEnd = searchRegion.search(/[.!?]\s/);
      if (sentenceEnd !== -1) {
        breakPoint = maxChars - lookback + sentenceEnd + 1;
      } else {
        const space = searchRegion.lastIndexOf(' ');
        breakPoint = space !== -1 ? maxChars - lookback + space : maxChars;
      }
      
      const partText = remaining.substring(0, breakPoint).trim();
      chunks.push(isObject ? { ...segment, text: partText, isSplit: true, partIndex: partIndex++ } : partText);
      remaining = remaining.substring(breakPoint).trim();
    }
    
    if (remaining.length > 0) {
      chunks.push(isObject ? { ...segment, text: remaining, isSplit: true, partIndex: partIndex } : remaining);
    }
    
    return chunks;
  }

  /**
   * Create intelligent batches based on text complexity and characteristics
   */
  createIntelligentBatches(segments, baseBatchSize, maxCharsPerBatch = 5000) {
    // First, flatten segments by splitting any single segment that's too long
    const flattenedSegments = [];
    for (const seg of segments) {
      flattenedSegments.push(...this._splitOversizedSegment(seg, maxCharsPerBatch));
    }

    const batches = [];
    let currentBatch = [];
    let currentBatchComplexity = 0;
    let currentBatchChars = 0;
    let lastBlockId = null;
    
    for (let i = 0; i < flattenedSegments.length; i++) {
      const segment = flattenedSegments[i];
      const isObject = typeof segment === 'object';
      const text = isObject ? (segment.t || segment.text || '') : (segment || '');
      const segmentComplexity = this.calculateTextComplexity(text);
      const segmentChars = text.length;
      const blockId = isObject ? segment.blockId : null;
      
      const adjustedBatchSize = this.getAdjustedBatchSize(segmentComplexity, baseBatchSize);
      
      // LOGICAL GROUPING: Try to keep items from the same block together
      // If we are about to break a block and we have space, keep going
      // If we are at a block boundary and batch is reasonably full, flush
      const isBlockBoundary = lastBlockId && blockId && lastBlockId !== blockId;
      
      const wouldExceedSize = currentBatch.length >= adjustedBatchSize;
      const wouldExceedComplexity = currentBatchComplexity + segmentComplexity > 1000; 
      const wouldExceedChars = currentBatchChars + segmentChars > maxCharsPerBatch;
      
      // Flush if limits reached OR if we are at a logical boundary and batch is > 70% full
      const shouldFlushBoundary = isBlockBoundary && currentBatch.length > (adjustedBatchSize * 0.7);

      if (wouldExceedSize || wouldExceedComplexity || wouldExceedChars || shouldFlushBoundary) {
        if (currentBatch.length > 0) {
          batches.push([...currentBatch]);
          currentBatch = [];
          currentBatchComplexity = 0;
          currentBatchChars = 0;
        }
      }
      
      currentBatch.push(segment);
      currentBatchComplexity += segmentComplexity;
      currentBatchChars += segmentChars;
      lastBlockId = blockId;
    }
    
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }
    
    logger.debug(`[TranslationEngine] Created ${batches.length} intelligent batches (Max chars: ${maxCharsPerBatch})`);
    return batches;
  }

  /**
   * Calculate complexity for a single text segment
   */
  calculateTextComplexity(text) {
    if (!text) return 0;
    let complexity = 0;
    complexity += Math.min(text.length / 20, 50);
    const specialChars = (text.match(/[^\w\s\u0080-\uFFFF]/g) || []).length;
    complexity += specialChars;
    if (text.match(/https?:\/\/|www\./)) complexity += 15;
    if (text.match(/[{}[\]<>]/)) complexity += 8;
    if (text.match(/\d+\.\d+|\w+\.\w+/)) complexity += 5;
    const hasLatin = /[a-zA-Z]/.test(text);
    const hasNonLatin = /[^\u0000-\u007F]/.test(text); 
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
    for (const item of batch) {
      const text = typeof item === 'object' ? (item.t || item.text || '') : (item || '');
      let textComplexity = 0;
      textComplexity += Math.min((text?.length || 0) / 10, 30);
      const specialChars = (text?.match(/[^\w\s\u0080-\uFFFF]/g) || []).length;
      textComplexity += specialChars * 0.5;
      if (text?.match(/https?:\/\/|www\./)) textComplexity += 10;
      if (text?.match(/[{}[\]<>]/)) textComplexity += 5;
      if (text?.match(/\d+\.\d+|\w+\.\w+/)) textComplexity += 3;
      const hasLatin = /[a-zA-Z]/.test(text);
      const hasNonLatin = /[^\u0000-\u007F]/.test(text); 
      if (hasLatin && hasNonLatin) textComplexity += 8;
      totalComplexity += textComplexity;
    }
    return Math.round(totalComplexity / batch.length);
  }

  /**
   * Process a single batch with fallback strategy
   */
  async processBatch(batch, segments, results, translationStatus, providerInstance, config, errorMessages = [], sharedState = null, abortController = null) {
    const { provider, sourceLanguage, targetLanguage, mode, originalSourceLang, originalTargetLang } = config;
    const DELIMITER = "\n\n---\n\n";
    if (sharedState && (sharedState.shouldStopDueToLanguagePairError || sharedState.isCancelled)) return;
    if (abortController && abortController.signal.aborted) {
      if (sharedState) sharedState.isCancelled = true;
      return;
    }
    
    if (provider === ProviderNames.BING_TRANSLATE) await new Promise(resolve => setTimeout(resolve, 200));
    
    try {
      const batchText = batch.map(idx => (typeof segments[idx] === 'object' ? (segments[idx].t || segments[idx].text || '') : (segments[idx] || ''))).join(DELIMITER);
      const batchResult = await providerInstance.translate(batchText, sourceLanguage, targetLanguage, { 
        mode, originalSourceLang, originalTargetLang, abortController,
        sessionId: config.sessionId, charCount: batchText.length
      });
      
      if (typeof batchResult === 'string') {
        const parts = batchResult.split(DELIMITER);
        if (parts.length === batch.length) {
          for (let i = 0; i < batch.length; i++) {
            const idx = batch[i];
            const originalText = (typeof segments[idx] === 'object' ? (segments[idx].t || segments[idx].text || '') : (segments[idx] || ''));
            const translatedText = parts[i]?.trim() || originalText;
            results[idx] = translatedText;
            translationStatus[idx] = true;
            const cacheKey = this.generateCacheKey({ text: originalText, provider, sourceLanguage, targetLanguage, mode });
            this.cache.set(cacheKey, { translatedText: translatedText, cachedAt: Date.now() });
          }
          return;
        }
      }
    } catch (batchError) {
      if (sharedState) sharedState.batchFailureCount++;
      const errorMessage = batchError.message || String(batchError);
      if (!errorMessages.includes(errorMessage)) errorMessages.push(errorMessage);
      if (isFatalError(batchError)) throw batchError;
    }
    
    // Fallback to individual
    const individualPromises = batch.map(async (idx) => {
      if (sharedState && sharedState.shouldStopDueToLanguagePairError) return { idx, result: segments[idx], success: false };
      if (!abortController || abortController.signal.aborted) return { idx, result: segments[idx], success: false };
      
      let attempt = 0;
      const originalText = (typeof segments[idx] === 'object' ? (segments[idx].t || segments[idx].text || '') : (segments[idx] || ''));
      while (attempt < 2) {
        try {
          const result = await providerInstance.translate(originalText, sourceLanguage, targetLanguage, { 
            mode, originalSourceLang, originalTargetLang, abortController,
            sessionId: config.sessionId, charCount: originalText.length
          });
          const translatedText = typeof result === 'string' ? result.trim() : originalText;
          const cacheKey = this.generateCacheKey({ text: originalText, provider, sourceLanguage, targetLanguage, mode });
          this.cache.set(cacheKey, { translatedText: translatedText, cachedAt: Date.now() });
          return { idx, result: translatedText, success: true };
        } catch (e) {
          if (isFatalError(e)) throw e;
          attempt++;
          if (attempt < 2) await new Promise(r => setTimeout(r, 100 * attempt));
        }
      }
      return { idx, result: segments[idx], success: false };
    });
    
    for (const p of individualPromises) {
      const { idx, result, success } = await p;
      results[idx] = result;
      translationStatus[idx] = success;
    }
  }

  /**
   * Get or create provider instance
   */
  async getProvider(providerId) {
    try {
      const provider = await this.factory.getProvider(providerId);
      return provider;
    } catch (error) {
      logger.error(`[TranslationEngine] Failed to get provider '${providerId}':`, error);
    }
    return null;
  }

  generateCacheKey(data) {
    const { text, provider, sourceLanguage, targetLanguage, mode } = data;
    return `${provider}:${sourceLanguage}:${targetLanguage}:${mode}:${text?.slice(0, 100)}`;
  }

  cacheResult(cacheKey, result) {
    if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(cacheKey, { ...result, cachedAt: Date.now() });
  }

  async addToHistory(data, result) {
    try {
      const historyItem = { sourceText: data.text, translatedText: result.translatedText, sourceLanguage: data.sourceLanguage, targetLanguage: data.targetLanguage, timestamp: Date.now() };
      const currentData = await storageManager.get(['translationHistory']);
      const newHistory = [historyItem, ...(currentData.translationHistory || [])].slice(0, 100);
      await storageManager.set({ translationHistory: newHistory });
      this.history = newHistory;
    } catch (error) { logger.error("[TranslationEngine] Failed to save history:", error); }
  }

  async saveHistoryToStorage() {
    try { await storageManager.set({ translationHistory: this.history }); } 
    catch (error) { logger.error("[TranslationEngine] Failed to save history:", error); }
  }

  async loadHistoryFromStorage() {
    try {
      const data = await storageManager.get(["translationHistory"]);
      this.history = Array.isArray(data.translationHistory) ? data.translationHistory : [];
    } catch (error) {
      if (ExtensionContextManager.isContextError(error)) ExtensionContextManager.handleContextError(error, 'translation-engine-history', { fallbackAction: () => { this.history = []; } });
      else logger.error("[TranslationEngine] Failed to load history:", error);
    }
  }

  formatError(error, context) {
    const errorType = error.type || matchErrorToType(error);
    return { success: false, error: { type: errorType, message: error.message || "Translation failed", context: context || "unknown", timestamp: Date.now() } };
  }

  async getAvailableProviders() {
    try {
      const { getAvailableProviders } = await import("../../../handlers/provider-handler.js");
      return await getAvailableProviders();
    } catch (error) { logger.error("[TranslationEngine] Failed to get providers:", error); return []; }
  }

  clearCache() { this.cache.clear(); }
  clearHistory() { this.history = []; this.saveHistoryToStorage(); }
  getCacheStats() { return { size: this.cache.size, providers: this.factory.providers?.size || 0 }; }

  async cancelTranslation(messageId) {
    if (messageId) {
      this.cancelledRequests.add(messageId);
      if (this.activeTranslations.has(messageId)) this.activeTranslations.get(messageId).abort();
      try {
        const { streamingManager } = await import("./StreamingManager.js");
        await streamingManager.cancelStream(messageId, ErrorTypes.USER_CANCELLED);
      } catch (error) { /* ignore */ }
      return true;
    }
    return false;
  }

  async cancelAllTranslations() {
    let cancelledCount = 0;
    for (const [messageId, abortController] of this.activeTranslations) {
      try { this.cancelledRequests.add(messageId); abortController.abort(); cancelledCount++; } catch (error) { /* ignore */ }
    }
    try {
      const { streamingManager } = await import("./StreamingManager.js");
      await streamingManager.cancelAllStreams('All translations cancelled by user');
    } catch (error) { /* ignore */ }
    return cancelledCount;
  }

  _shouldUseStreamingForProvider(providerInstance, text, messageId, mode) {
    if (!messageId) return false;
    const providerType = providerInstance.constructor.type;
    const isSelectElementMode = mode === TranslationMode.Select_Element;
    if (providerType === "ai") return isSelectElementMode ? text.length > 500 : false;
    else return (isSelectElementMode && text.length > 2000 && providerInstance.constructor.supportsStreaming !== false);
  }

  async executeStreamingTranslation(data, providerInstance, sender, originalSourceLang, originalTargetLang) {
    const { text, provider, sourceLanguage, targetLanguage, mode, messageId } = data;
    const { streamingManager } = await import("./StreamingManager.js");
    const segments = [text];
    const sessionId = data.sessionId || messageId;
    streamingManager.initializeStream(messageId, sender, providerInstance, segments, sessionId);
    this.streamingSenders = this.streamingSenders || new Map();
    this.streamingSenders.set(messageId, sender);
    try {
      await providerInstance.translate(text, sourceLanguage, targetLanguage, { mode, originalSourceLang, originalTargetLang, messageId, sessionId, charCount: text.length, engine: this });
      return { success: true, streaming: true, messageId, provider, timestamp: Date.now() };
    } catch (error) {
      await streamingManager.handleStreamError(messageId, error);
      return { success: true, streaming: true, messageId, provider, timestamp: Date.now() };
    } finally { if (this.streamingSenders) this.streamingSenders.delete(messageId); }
  }

  getStreamingSender(messageId) { return this.streamingSenders?.get(messageId) || null; }
  isCancelled(messageId) { return this.cancelledRequests.has(messageId); }
  async initialize() {
    try { await this.loadHistoryFromStorage(); logger.debug("[TranslationEngine] Initialized successfully"); } 
    catch (error) { logger.error("[TranslationEngine] Initialization failed:", error); }
  }
}
