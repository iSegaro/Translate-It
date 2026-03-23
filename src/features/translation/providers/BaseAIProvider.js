/**
 * Base AI Provider - Enhanced base class for all AI-powered translation providers
 * Provides streaming support, smart batching, and provider-specific optimizations
 */

import { BaseProvider } from "@/features/translation/providers/BaseProvider.js";
import { buildPrompt } from "@/features/translation/utils/promptBuilder.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { createTimeoutPromise, calculateBatchTimeout } from '@/features/translation/utils/timeoutCalculator.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { MessageFormat } from '@/shared/messaging/core/MessagingCore.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { matchErrorToType, isFatalError } from '@/shared/error-management/ErrorMatcher.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { getProviderBatching } from '../core/ProviderConfigurations.js';
import { getPromptBASEAIBatchAsync, getPromptBASEAIFollowupAsync } from '@/shared/config/config.js';
import { getLanguageNameFromCode } from '@/shared/config/languageConstants.js';
import { AUTO_DETECT_VALUE } from '@/shared/config/constants.js';
import browser from 'webextension-polyfill';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'BaseAIProvider');

export class BaseAIProvider extends BaseProvider {
  // Provider capabilities - to be overridden by subclasses
  static supportsStreaming = false;
  static preferredBatchStrategy = 'smart'; // 'smart', 'fixed', 'single'
  static optimalBatchSize = 15;
  static maxComplexity = 300;
  static supportsImageTranslation = false;
  
  // Batch processing strategy - to be overridden by subclasses
  static batchStrategy = 'json'; // 'json' or 'numbered'
  static errorHandlingLevel = 'standard'; // 'standard' or 'advanced'

  constructor(providerName) {
    super(providerName);
  }

  /**
   * Convert language to AI provider format (full language names)
   * AI providers work best with full language names instead of codes
   * @param {string} lang - Language code or name
   * @returns {string} - Full language name or AUTO_DETECT_VALUE
   */
  _getLangCode(lang) {
    // AI providers use full language names, so convert codes to names
    if (!lang) return AUTO_DETECT_VALUE;

    // Convert language code to full language name for AI providers
    const languageName = getLanguageNameFromCode(lang);
    logger.debug(`[${this.providerName}] Language conversion: "${lang}" → "${languageName}"`);
    return languageName || AUTO_DETECT_VALUE;
  }

  
  /**
   * Enhanced batch translation with streaming support
   * @param {string[]} texts - Array of texts to translate
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language  
   * @param {string} translateMode - Translation mode
   * @param {object} engine - Translation engine instance
   * @param {string} messageId - Message ID for streaming
   * @param {AbortController} abortController - Cancellation controller
   * @returns {Promise<string[]>} - Translated texts
   */
  async _batchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController) {
    // Check if streaming is supported and beneficial
    if (this.constructor.supportsStreaming && this._shouldUseStreaming(texts, messageId, engine)) {
      return this._streamingBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController);
    }

    // Fall back to traditional batch processing
    return this._traditionalBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController);
  }

  /**
   * Determine if streaming should be used for this request
   * @param {string[]} texts - Texts to translate
   * @param {string} messageId - Message ID
   * @param {object} engine - Translation engine
   * @returns {boolean} - Whether to use streaming
   */
  _shouldUseStreaming(texts, messageId, engine) {
    // Only use streaming if:
    // 1. Provider supports it
    // 2. We have a valid messageId for streaming
    // 3. Engine is available for streaming notifications
    // 4. There are multiple segments or complex content
    return this.constructor.supportsStreaming && 
           messageId && 
           engine && 
           (texts.length > 1 || this._getTotalComplexity(texts) > 100);
  }

  /**
   * Streaming batch translation with real-time results
   * @param {string[]} texts - Texts to translate
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {object} engine - Translation engine instance
   * @param {string} messageId - Message ID for streaming
   * @param {AbortController} abortController - Cancellation controller
   * @returns {Promise<string[]>} - All translated texts
   */
  async _streamingBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController) {
    const startTime = Date.now();
    const totalChars = texts.reduce((sum, text) => sum + text.length, 0);
    logger.debug(`[${this.providerName}] Starting streaming translation for ${texts.length} segments (${totalChars} chars, mode: ${translateMode})`);

    // Create optimal batches based on provider strategy and mode
    const batches = this._createOptimalBatches(texts, translateMode);
    const allResults = [];
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      // Check for cancellation
      if (abortController && abortController.signal.aborted) {
        const error = new Error('Translation cancelled by user');
        error.type = ErrorTypes.USER_CANCELLED;
        throw error;
      }
      if (engine && engine.isCancelled(messageId)) {
        const error = new Error('Translation cancelled by user');
        error.type = ErrorTypes.USER_CANCELLED;
        throw error;
      }

      const batch = batches[batchIndex];
      logger.debug(`[${this.providerName}] Processing streaming batch ${batchIndex + 1}/${batches.length} (${batch.length} segments)`);

      try {
        // Get rate limit manager
        const { rateLimitManager } = await import("@/features/translation/core/RateLimitManager.js");
        
        // Translate this batch with timeout
        const batchResults = await Promise.race([
          rateLimitManager.executeWithRateLimit(
            this.providerName,
            () => this._translateBatch(batch, sourceLang, targetLang, translateMode, abortController, engine, messageId),
            `streaming-batch-${batchIndex + 1}/${batches.length}`,
            translateMode
          ),
          this._createBatchTimeoutPromise(batch.length)
        ]);

        // Add results to collection
        allResults.push(...batchResults);

        // Stream results immediately to content script
        await this._streamBatchResults(
          batchResults,
          batch,
          batchIndex,
          messageId,
          engine,
          sourceLang,
          targetLang
        );

                // Streamed batch progress

      } catch (error) {
        // Log cancellation as debug instead of error using proper error management
        const errorType = matchErrorToType(error);
        if (errorType === ErrorTypes.USER_CANCELLED) {
          logger.debug(`[${this.providerName}] Streaming batch ${batchIndex + 1} cancelled:`, error);
        } else {
          logger.error(`[${this.providerName}] Streaming batch ${batchIndex + 1} failed:`, error);
        }
        
        // Send error stream message to content script
        await this._streamErrorResults(error, batchIndex, messageId, engine);

        // Send streaming end notification with error details
        await this._sendStreamEnd(messageId, engine, {
          error: {
            message: error.message,
            type: errorType
          }
        });

        // Stop streaming on error - don't continue with other batches
        throw error;
      }
    }

    // Send streaming end notification
    await this._sendStreamEnd(messageId, engine, { targetLanguage: targetLang });

    // Log performance metrics for Select Element mode
    const totalTime = Date.now() - startTime;
    const charsPerSecond = (totalChars / totalTime) * 1000;

    if (translateMode === 'select_element') {
      // Get rate limit manager performance stats
      const { rateLimitManager } = await import("@/features/translation/core/RateLimitManager.js");
      const perfStats = rateLimitManager.getPerformanceStats(this.providerName);

      logger.info(`[${this.providerName}] Select Element performance: ${texts.length} segments, ${totalChars} chars, ${batches.length} batches, ${totalTime}ms, ${charsPerSecond.toFixed(1)} chars/s`);
      logger.info(`[${this.providerName}] Rate limit stats: ${perfStats.averageWaitTime.toFixed(1)}ms avg wait, ${perfStats.averageRequestTime.toFixed(1)}ms avg request, ${perfStats.requestsPerMinute.toFixed(1)} req/min, ${perfStats.successRate.toFixed(1)}% success`);
    }

    // Streaming translation completed
    return allResults;
  }

  /**
   * Traditional sequential batch processing (fallback)
   * @param {string[]} texts - Texts to translate
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {object} engine - Translation engine instance
   * @param {string} messageId - Message ID
   * @param {AbortController} abortController - Cancellation controller
   * @returns {Promise<string[]>} - Translated texts
   */
  async _traditionalBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController) {
    const { rateLimitManager } = await import("@/features/translation/core/RateLimitManager.js");
    const results = [];
    
    for (let i = 0; i < texts.length; i++) {
      if (abortController && abortController.signal.aborted) {
        const error = new Error('Translation cancelled by user');
        error.type = ErrorTypes.USER_CANCELLED;
        throw error;
      }
      if (engine && engine.isCancelled(messageId)) {
        const error = new Error('Translation cancelled by user');
        error.type = ErrorTypes.USER_CANCELLED;
        throw error;
      }
      
      try {
        const result = await rateLimitManager.executeWithRateLimit(
          this.providerName,
          () => this._translateSingle(texts[i], sourceLang, targetLang, translateMode, abortController),
          `segment-${i + 1}/${texts.length}`,
          translateMode
        );
        results.push(result || texts[i]);
      } catch (error) {
        // Log cancellation as debug instead of warn using proper error management
        const errorType = matchErrorToType(error);
        if (errorType === ErrorTypes.USER_CANCELLED) {
          logger.debug(`[${this.providerName}] Segment ${i + 1} cancelled:`, error);
        } else {
          logger.warn(`[${this.providerName}] Segment ${i + 1} failed:`, error);
        }
        // Instead of returning original text, throw the error to be handled properly
        throw error;
      }
    }
    
    return results;
  }

  /**
   * Create optimal batches based on provider strategy
   * @param {string[]} texts - Texts to translate
   * @param {string} translateMode - Translation mode (optional)
   * @returns {string[][]} - Array of batches
   */
  _createOptimalBatches(texts, translateMode = null) {
    // CRITICAL: Check for placeholders and use atomic batching
    // When placeholders are present, NEVER split texts across batches
    if (this._hasPlaceholders(texts)) {
      logger.debug(`[${this.providerName}] Placeholders detected in ${texts.length} texts, using atomic batching`);
      return [texts]; // Single batch to preserve placeholder integrity
    }

    // Get mode-specific batching configuration
    const batchingConfig = this._getBatchingConfig(translateMode);
    const strategy = batchingConfig.strategy || this.constructor.preferredBatchStrategy;
    const optimalSize = batchingConfig.optimalSize || this.constructor.optimalBatchSize;
    const maxComplexity = batchingConfig.maxComplexity || this.constructor.maxComplexity;
    const maxBatchSizeChars = batchingConfig.maxBatchSizeChars;

    // For Select Element mode with character target, use character-based batching
    if (translateMode === 'select_element' && maxBatchSizeChars) {
      return this._createCharacterBasedBatches(texts, maxBatchSizeChars, batchingConfig.balancedBatching);
    }

    switch (strategy) {
      case 'smart':
        return this._createSmartBatches(texts, optimalSize, maxComplexity);
      case 'single':
        return [texts]; // All texts in one batch
      case 'fixed':
      default:
        return this._createFixedBatches(texts, optimalSize);
    }
  }

  /**
   * Check if any text contains placeholder markers
   * @param {string[]} texts - Texts to check
   * @returns {boolean} - True if placeholders found
   */
  _hasPlaceholders(texts) {
    const PLACEHOLDER_PATTERN = /\[\[AIWC-\d+\]\]/;
    return texts.some(text => PLACEHOLDER_PATTERN.test(text));
  }

  /**
   * Create smart batches based on complexity and segment count
   * @param {string[]} texts - Texts to translate
   * @param {number} optimalSize - Optimal batch size
   * @param {number} maxComplexity - Maximum complexity per batch
   * @returns {string[][]} - Array of batches
   */
  _createSmartBatches(texts, optimalSize, maxComplexity) {
    const totalSegments = texts.length;
    const totalComplexity = this._getTotalComplexity(texts);
    
    // Smart batching logic (similar to Gemini's approach)
    if (totalSegments <= Math.min(20, optimalSize) || totalComplexity < Math.min(300, maxComplexity)) {
      logger.debug(`[${this.providerName}] Using single batch for ${totalSegments} segments (complexity: ${totalComplexity})`);
      return [texts];
    }
    
    // Create multiple batches
    const batches = [];
    let currentBatch = [];
    let currentComplexity = 0;
    
    for (const text of texts) {
      const textComplexity = this._calculateTextComplexity(text);
      
      if (currentBatch.length >= optimalSize || 
          (currentComplexity + textComplexity > maxComplexity && currentBatch.length > 0)) {
        batches.push(currentBatch);
        currentBatch = [];
        currentComplexity = 0;
      }
      
      currentBatch.push(text);
      currentComplexity += textComplexity;
    }
    
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }
    
    logger.debug(`[${this.providerName}] Created ${batches.length} smart batches for ${totalSegments} segments`);
    return batches;
  }

  /**
   * Create fixed-size batches
   * @param {string[]} texts - Texts to translate
   * @param {number} batchSize - Fixed batch size
   * @returns {string[][]} - Array of batches
   */
  _createFixedBatches(texts, batchSize) {
    const batches = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      batches.push(texts.slice(i, i + batchSize));
    }
    logger.debug(`[${this.providerName}] Created ${batches.length} fixed batches (size: ${batchSize})`);
    return batches;
  }

  /**
   * Calculate total complexity of all texts
   * @param {string[]} texts - Texts to analyze
   * @returns {number} - Total complexity score
   */
  _getTotalComplexity(texts) {
    return texts.reduce((sum, text) => sum + this._calculateTextComplexity(text), 0);
  }

  /**
   * Create a timeout promise for batch processing
   * Uses dynamic timeout calculation based on batch size
   * @private
   */
  _createBatchTimeoutPromise(batchSize) {
    const timeoutMs = calculateBatchTimeout(batchSize, this.providerName);
    return createTimeoutPromise(timeoutMs, `Rate limit execution`);
  }

  /**
   * Calculate complexity of a single text
   * @param {string} text - Text to analyze
   * @returns {number} - Complexity score
   */
  _calculateTextComplexity(text) {
    if (!text || typeof text !== 'string') return 0;
    
    const length = text.length;
    const sentences = (text.match(/[.!?]+/g) || []).length;
    const words = text.trim().split(/\s+/).length;
    
    // Base complexity from character count
    let complexity = Math.min(length * 0.5, 100);
    
    // Bonus for sentence structure
    complexity += sentences * 2;
    
    // Bonus for word density
    complexity += Math.min(words * 0.5, 20);
    
    return Math.round(complexity);
  }

  /**
   * Stream batch results to content script
   * @param {string[]} batchResults - Translated results for this batch
   * @param {string[]} originalBatch - Original texts for this batch
   * @param {number} batchIndex - Index of this batch
   * @param {string} messageId - Message ID
   * @param {object} engine - Translation engine
   * @param {string} sourceLanguage - Actual source language
   * @param {string} targetLanguage - Actual target language
   */
  async _streamBatchResults(batchResults, originalBatch, batchIndex, messageId, engine, sourceLanguage = null, targetLanguage = null) {
    if (!engine || !messageId) {
      logger.warn(`[${this.providerName}] Cannot stream results - missing engine or messageId`);
      return;
    }

    try {
      // Send stream update message to content script
      const streamMessage = MessageFormat.create(
        MessageActions.TRANSLATION_STREAM_UPDATE,
        {
          success: true,
          data: batchResults,
          originalData: originalBatch,
          batchIndex: batchIndex,
          provider: this.providerName,
          sourceLanguage,
          targetLanguage,
          timestamp: Date.now()
        },
        'background-streaming',
        messageId
      );

      // Get sender info from engine's active translations
      const senderInfo = engine.getStreamingSender?.(messageId);
      if (senderInfo && senderInfo.tab?.id) {
        await browser.tabs.sendMessage(senderInfo.tab.id, streamMessage);
        logger.debug(`[${this.providerName}] Stream update sent to tab ${senderInfo.tab.id} for batch ${batchIndex}`);
      } else {
        logger.warn(`[${this.providerName}] No tab info available for streaming messageId: ${messageId}`);
      }
    } catch (error) {
      logger.error(`[${this.providerName}] Failed to stream batch results:`, error);
    }
  }

  /**
   * Send streaming end notification
   * @param {string} messageId - Message ID
   * @param {object} engine - Translation engine
   * @param {object} options - Options (error: boolean)
   */
  async _sendStreamEnd(messageId, engine, options = {}) {
    if (!engine || !messageId) return;

    try {
      const streamEndMessage = MessageFormat.create(
        MessageActions.TRANSLATION_STREAM_END,
        {
          success: !options.error,
          completed: true,
          error: options.error ? {
            message: options.error.message || 'Translation failed',
            type: options.error.type || matchErrorToType(options.error) || 'TRANSLATION_ERROR'
          } : null,
          provider: this.providerName,
          targetLanguage: options.targetLanguage,
          timestamp: Date.now()
        },
        'background-streaming',
        messageId
      );

      const senderInfo = engine.getStreamingSender?.(messageId);
      if (senderInfo && senderInfo.tab?.id) {
        await browser.tabs.sendMessage(senderInfo.tab.id, streamEndMessage);
        logger.debug(`[${this.providerName}] Stream end sent to tab ${senderInfo.tab.id}`);
      }
    } catch (error) {
      logger.error(`[${this.providerName}] Failed to send stream end:`, error);
    }
  }

  /**
   * Send error stream message to content script
   * @param {Error} error - The error that occurred
   * @param {number} batchIndex - Index of the failed batch
   * @param {string} messageId - Message ID
   * @param {object} engine - Translation engine instance
   */
  async _streamErrorResults(error, batchIndex, messageId, engine) {
    if (!engine || !messageId) return;
    try {
      const streamErrorMessage = MessageFormat.create(
        MessageActions.TRANSLATION_STREAM_UPDATE,
        {
          success: false,
          error: {
            message: error.message || 'Translation failed',
            type: error.type || matchErrorToType(error) || 'TRANSLATION_ERROR'
          },
          batchIndex: batchIndex,
          provider: this.providerName,
          timestamp: Date.now()
        },
        'background-streaming',
        messageId
      );
      const senderInfo = engine.getStreamingSender?.(messageId);
      if (senderInfo && senderInfo.tab?.id) {
        await browser.tabs.sendMessage(senderInfo.tab.id, streamErrorMessage);
        logger.debug(`[${this.providerName}] Stream error sent to tab ${senderInfo.tab.id}`);
      }
    } catch (sendError) {
      logger.error(`[${this.providerName}] Failed to send stream error:`, sendError);
    }
  }

  /**
   * Abstract method to translate a batch - must be implemented by subclasses
   * This differs from _batchTranslate in that it handles a single batch optimally
   * @param {string[]} batch - Batch of texts to translate
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {AbortController} abortController - Cancellation controller
   * @param {object} engine - Translation engine instance (optional)
   * @param {string} messageId - Message ID (optional)
   * @param {string} sessionId - Session ID for maintaining context (optional)
   * @returns {Promise<string[]>} - Translated texts
   */
  async _translateBatch(batch, sourceLang, targetLang, translateMode, abortController, engine = null, messageId = null, sessionId = null) {
    const batchStrategy = this.constructor.batchStrategy || 'single';
    
    if (batch.length === 1) {
      return [await this._translateSingle(batch[0], sourceLang, targetLang, translateMode, abortController, sessionId)];
    }
    
    try {
      if (batchStrategy === 'json') {
        // Prepare batch text once here
        const jsonInput = batch.map((t, i) => ({ id: i, text: t }));
        const batchText = JSON.stringify(jsonInput, null, 2);
        
        // Pass with explicit isBatch=true flag - no more guessing inside _translateSingle
        const result = await this._translateSingle(batchText, sourceLang, targetLang, translateMode, abortController, sessionId, true);
        
        const parsedResults = this._parseBatchResult(result, batch.length, batch);
        if (parsedResults.length === batch.length) return parsedResults;
        throw new Error('JSON batch result count mismatch');
      }
      throw new Error(`Unsupported batch strategy: ${batchStrategy}`);
    } catch (error) {
      const errorType = error.type || matchErrorToType(error);

      // CRITICAL: Check if the error is fatal (Rate Limit, Auth, Model Missing, etc.)
      const isFatal = isFatalError(error) || 
      error.statusCode === 429 || 
      error.statusCode === 401 ||
      error.statusCode === 403 ||
      error.statusCode === 402 ||
      error.statusCode === 404;

      if (isFatal) {
        logger.info(`[${this.providerName}] Batch failed with fatal error, skipping fallback:`, error.message);
        // Ensure error type is set for higher level managers
        if (!error.type) error.type = errorType;
        throw error;
      }

      logger.warn(`[${this.providerName}] Batch failed (likely structural), falling back to individual requests:`, error.message);
      return this._fallbackSingleRequests(batch, sourceLang, targetLang, translateMode, engine, messageId, abortController);
    }
  }

  /**
   * Abstract method for single text translation
   * @param {string} text - Text to translate
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {AbortController} abortController - Cancellation controller
   * @param {string} sessionId - Session ID (optional)
   * @param {boolean} isBatch - Whether this is a batch request (optional)
   */
  async _translateSingle() {
    throw new Error(`_translateSingle must be implemented by ${this.constructor.name}`);
  }

  /**
   * Check if this is the first turn in a session
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} - True if first turn or no session
   * @private
   */
  async _isFirstTurn(sessionId) {
    if (!sessionId) return true;
    try {
      const { translationSessionManager } = await import('@/features/translation/core/TranslationSessionManager.js');
      const session = translationSessionManager.sessions.get(sessionId);
      return !session || session.history.length === 0;
    } catch {
      return true;
    }
  }

  /**
   * Helper to prepare system prompt and user text
   * @param {string} text - Input text
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {string} sessionId - Session identifier
   * @param {boolean} isBatch - Whether this is a batch request
   * @returns {Promise<object>} - { systemPrompt, userText }
   * @protected
   */
  async _preparePromptAndText(text, sourceLang, targetLang, translateMode, sessionId = null, isBatch = false) {
    const isFirstTurn = await this._isFirstTurn(sessionId);
    let systemPrompt;

    if (isBatch) {
      if (isFirstTurn) {
        const promptTemplate = await getPromptBASEAIBatchAsync();
        systemPrompt = promptTemplate
          .replace("_{SOURCE}", sourceLang)
          .replace("_{TARGET}", targetLang)
          .split("_{TEXT}")[0].trim();
      } else {
        const followUpTemplate = await getPromptBASEAIFollowupAsync();
        systemPrompt = followUpTemplate
          .replace("_{SOURCE}", sourceLang)
          .replace("_{TARGET}", targetLang);
      }
    } else {
      systemPrompt = await buildPrompt("", sourceLang, targetLang, translateMode, this.constructor.type);
    }

    return { systemPrompt, userText: text };
  }

  /**
   * Helper to get conversation messages for AI providers
   * @param {string} sessionId - Session identifier
   * @param {string} providerName - Name of the provider
   * @param {string} currentText - New text to translate
   * @param {string} systemPrompt - Base system prompt
   * @param {string} translateMode - Translation mode (Page, Selection, etc.)
   * @returns {object} - { messages, session }
   * @protected
   */
  async _getConversationMessages(sessionId, providerName, currentText, systemPrompt, translateMode = '') {
    if (!sessionId) {
      return {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: currentText }
        ],
        session: null
      };
    }

    const { translationSessionManager } = await import('@/features/translation/core/TranslationSessionManager.js');
    const session = translationSessionManager.getOrCreateSession(sessionId, providerName);

    // Initial turn: Set system prompt
    if (session.history.length === 0) {
      session.systemPrompt = systemPrompt;
      return {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: currentText }
        ],
        session
      };
    }

    // Subsequent turns: Send history + instructions reminder + current text
    const messages = [
      { role: 'system', content: session.systemPrompt }
    ];

    // For Page Translation, we MUST NOT send history of previous batches.
    // Each batch is independent content from the page. Sending history
    // causes massive token bloat and triggers Rate Limits (especially on Gemini Free).
    if (translateMode !== 'page') {
      const maxHistoryMessages = 10;
      const history = session.history.slice(-maxHistoryMessages);
      messages.push(...history);
    }

    // Add current text
    messages.push({ role: 'user', content: currentText });

    return { messages, session };
  }

  /**
   * Helper to update session history with results
   */
  async _updateSessionHistory(sessionId, userContent, assistantContent) {
    if (!sessionId) return;
    try {
      const { translationSessionManager } = await import('@/features/translation/core/TranslationSessionManager.js');
      translationSessionManager.addMessage(sessionId, 'user', userContent);
      translationSessionManager.addMessage(sessionId, 'assistant', assistantContent);
      
      const session = translationSessionManager.sessions.get(sessionId);
      if (session) session.batchCount++;
    } catch (e) {
      logger.warn('Failed to update session history:', e);
    }
  }

  /**
   * Centralized helper to clean AI responses from common artifacts
   * Handles markdown JSON blocks and accidental single-segment arrays
   * @param {string} result - Raw text from AI
   * @returns {string} Cleaned text
   * @protected
   */
  _cleanAIResponse(result) {
    if (!result || typeof result !== 'string') return result;

    let processedResult = result;
    let jsonString = null;

    // 1. Try to find JSON array in markdown code blocks
    const markdownMatch = result.match(/```json\s*([\s\S]*?)\s*```/);
    if (markdownMatch) {
      jsonString = markdownMatch[1].trim();
    } else {
      // 2. Try to find direct JSON array (without markdown)
      const directMatch = result.match(/^\s*\[([\s\S]*)\]\s*$/);
      if (directMatch) {
        jsonString = `[${directMatch[1]}]`;
      }
    }

    if (jsonString) {
      try {
        const parsed = JSON.parse(jsonString);
        if (Array.isArray(parsed) && parsed.length === 1 && typeof parsed[0] === 'string') {
          logger.debug(`[${this.providerName}] Single segment JSON array detected and extracted`);
          processedResult = parsed[0];
        }
      } catch {
        // Not a valid JSON or not a single-segment array, keep original result
      }
    }

    return processedResult;
  }

  /**
   * Parse batch translation results from JSON response
   * @param {string} result - API response
   * @param {number} expectedCount - Expected number of results
   * @param {string[]} originalBatch - Original texts for fallback
   * @returns {string[]} - Parsed results
   */
  _parseBatchResult(result, expectedCount, originalBatch) {
    try {
      // Find the JSON array in the response, allowing for markdown code blocks
      const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```|(\[[\s\S]*\])/);
      if (!jsonMatch) {
        throw new Error('No JSON array found in the response.');
      }
      
      // Use the first captured group that is not undefined
      const jsonString = jsonMatch[1] || jsonMatch[2];
      const parsed = JSON.parse(jsonString);
      
      if (Array.isArray(parsed)) {
        // Check if this is a simple string array (the main issue we're fixing)
        if (parsed.length === 1 && typeof parsed[0] === 'string') {
          logger.debug(`[${this.providerName}] Single segment array detected, extracting text properly`);
          return [parsed[0]];
        }

        // Handle object array format (multi-segment case)
        if (parsed.length === expectedCount && typeof parsed[0] === 'object' && parsed[0] !== null) {
          // Ensure the order is correct based on id
          const sortedResults = parsed.sort((a, b) => a.id - b.id);
          return sortedResults.map(item => item.text);
        } else if (parsed.length > expectedCount && typeof parsed[0] === 'object' && parsed[0] !== null) {
          // Sometimes AI returns extra items - take first N items
          logger.warn(`[${this.providerName}] AI provider returned ${parsed.length} items, expected ${expectedCount}. Taking first ${expectedCount} items.`);
          const firstItems = parsed.slice(0, expectedCount);
          const sortedResults = firstItems.sort((a, b) => a.id - b.id);
          return sortedResults.map(item => item.text);
        } else if (parsed.length < expectedCount && typeof parsed[0] === 'object' && parsed[0] !== null) {
          // Sometimes AI returns fewer items - pad with original texts
          logger.warn(`[${this.providerName}] AI provider returned ${parsed.length} items, expected ${expectedCount}. Padding with original texts.`);
          const sortedResults = parsed.sort((a, b) => a.id - b.id);
          const translatedTexts = sortedResults.map(item => item.text);

          // Pad with original texts if needed
          while (translatedTexts.length < expectedCount) {
            translatedTexts.push(originalBatch[translatedTexts.length] || '');
          }

          return translatedTexts;
        }
      }

      throw new Error(`Invalid batch result format. Expected ${expectedCount} items, got ${parsed.length}.`);
    } catch (error) {
      logger.warn(`[${this.providerName}] Failed to parse batch result: ${error.message}. Falling back to splitting by lines.`);
      return this._fallbackParsing(result, expectedCount, originalBatch);
    }
  }

  /**
   * Fallback parsing when JSON parsing fails
   * @param {string} result - API response
   * @param {number} expectedCount - Expected number of results
   * @param {string[]} originalBatch - Original texts for fallback
   * @returns {string[]} - Parsed results or original texts
   */
  _fallbackParsing(result, expectedCount, originalBatch) {
    // A simple fallback: split the result by newlines.
    // Preserve empty lines to maintain formatting for AI responses
    const lines = result.split('\\n');
    
    // Filter out completely empty lines only if we have too many lines
    if (lines.length > expectedCount) {
      const nonEmptyLines = lines.filter(line => line.trim() !== '');
      if (nonEmptyLines.length === expectedCount) {
        return nonEmptyLines;
      }
    }
    
    // If line count matches, return as-is (preserving formatting)
    if (lines.length === expectedCount) {
      return lines;
    }
    
    // If all else fails, return the original texts for this batch
    return originalBatch;
  }

  /**
   * Enhanced fallback to individual requests with streaming support (from Gemini)
   * @param {string[]} batch - Batch of texts to translate
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {object} engine - Translation engine instance
   * @param {string} messageId - Message ID
   * @param {AbortController} abortController - Cancellation controller
   * @returns {Promise<string[]>} - Translated texts
   */
  async _fallbackSingleRequests(batch, sourceLang, targetLang, translateMode, engine, messageId, abortController) {
    logger.debug(`[${this.providerName}] Starting fallback for ${batch.length} segments`);
    // const { rateLimitManager } = await import("@/features/translation/core/RateLimitManager.js");
    const results = [];
    
    for (let i = 0; i < batch.length; i++) {
      if (abortController && abortController.signal.aborted) {
        const cancelError = new Error('Translation cancelled during fallback');
        cancelError.name = 'AbortError';
        throw cancelError;
      }
      
      try {
        logger.debug(`[${this.providerName}] Fallback processing segment ${i + 1}/${batch.length}: "${batch[i]}"`);
        
        // Manual delay for fallback to prevent overload
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay between fallback segments
        }
        
        const result = await Promise.race([
          this._translateSingle(batch[i], sourceLang, targetLang, translateMode, abortController),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Fallback segment ${i + 1} timeout after 8 seconds`)), 8000)
          )
        ]);
        
        logger.debug(`[${this.providerName}] Fallback segment ${i + 1} completed`);
        const translatedResult = result || batch[i];
        results.push(translatedResult);
        
        // Stream the result immediately for this segment
        if (engine && messageId) {
          await this._streamFallbackResult([translatedResult], [batch[i]], i, messageId, engine, sourceLang, targetLang);
        }
      } catch (error) {
        // Log cancellation as debug instead of warn using proper error management
        const errorType = matchErrorToType(error);
        if (errorType === ErrorTypes.USER_CANCELLED) {
          logger.debug(`[${this.providerName}] Fallback segment ${i + 1} cancelled:`, error);
        } else {
          logger.warn(`[${this.providerName}] Fallback segment ${i + 1} failed:`, error);
        }

        // Throw error to be handled by system error management
        throw error;
      }
    }
    
    return results;
  }

  /**
   * Stream fallback result to content script (from Gemini)
   * @param {string[]} result - Translated result for this segment
   * @param {string[]} original - Original text for this segment
   * @param {number} segmentIndex - Index of this segment in the batch
   * @param {string} messageId - Message ID
   * @param {object} engine - Translation engine instance
   * @param {string} sourceLanguage - Actual source language
   * @param {string} targetLanguage - Actual target language
   */
  async _streamFallbackResult(result, original, segmentIndex, messageId, engine, sourceLanguage = null, targetLanguage = null) {
    try {
      const { MessageFormat } = await import('@/shared/messaging/core/MessagingCore.js');
      const { MessageActions } = await import('@/shared/messaging/core/MessageActions.js');
      
      const streamMessage = MessageFormat.create(
        MessageActions.TRANSLATION_STREAM_UPDATE,
        {
          success: true,
          data: result,
          originalData: original,
          batchIndex: segmentIndex,
          provider: this.providerName,
          sourceLanguage,
          targetLanguage,
          timestamp: Date.now()
        },
        'background-streaming',
        messageId
      );

      const senderInfo = engine.getStreamingSender?.(messageId);
      if (senderInfo && senderInfo.tab?.id) {
        await browser.tabs.sendMessage(senderInfo.tab.id, streamMessage);
        logger.debug(`[${this.providerName}] Fallback result streamed for segment ${segmentIndex + 1}`);
      }
    } catch (error) {
      logger.error(`[${this.providerName}] Failed to stream fallback result for segment ${segmentIndex + 1}:`, error);
    }
  }

  /**
   * Abstract method for getting provider configuration
   * Must be implemented by subclasses
   * @returns {Promise<Object>} - Provider configuration
   * @protected
   */
  async _getConfig() {
    throw new Error(`_getConfig method must be implemented by ${this.constructor.name}`);
  }
 
  /**
   * Enhanced API call execution with centralized error handling (from Gemini)
   * @param {Object} params - API call parameters
   * @returns {Promise<any>} - API response
   * @protected
   */
  async _executeWithErrorHandling(params) {
    try {
      return await this._executeApiCall(params);
    } catch (error) {
      // Check if this is a user cancellation (should be handled silently)
      const errorType = matchErrorToType(error);
      if (errorType === ErrorTypes.USER_CANCELLED || errorType === ErrorTypes.TRANSLATION_CANCELLED) {
        // Log user cancellation at debug level only
        const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, this.providerName);
        logger.debug(`[${this.providerName}] Operation cancelled by user`);
        throw error; // Re-throw without ErrorHandler processing
      }

      // Let ErrorHandler automatically detect and handle all error types
      await ErrorHandler.getInstance().handle(error, {
        context: params.context || `${this.providerName.toLowerCase()}-translation`
      });
      
      logger.error(`[${this.providerName}] API call failed:`, error);
      error.context = params.context || `${this.providerName.toLowerCase()}-translation`;
      error.provider = this.providerName;
      throw error;
    }
  }

  /**
   * Get batching configuration for a specific translation mode
   * @param {string} translateMode - Translation mode
   * @returns {object} - Batching configuration
   * @private
   */
  _getBatchingConfig(translateMode = null) {
    try {
      return getProviderBatching(this.providerName, translateMode);
    } catch (error) {
      // Fallback to class defaults if configuration fails to load
      logger.debug(`[${this.providerName}] Failed to load batching config, using defaults:`, error.message);
      return {
        strategy: this.constructor.preferredBatchStrategy,
        optimalSize: this.constructor.optimalBatchSize,
        maxComplexity: this.constructor.maxComplexity
      };
    }
  }

  /**
   * Create character-based batches for optimal API usage in Select Element mode
   * @param {string[]} texts - Texts to translate
   * @param {number} maxCharsPerBatch - Maximum characters per batch
   * @param {boolean} balancedBatching - Enable balanced batch sizes
   * @returns {string[][]} - Array of batches
   * @private
   */
  _createCharacterBasedBatches(texts, maxCharsPerBatch, balancedBatching = false) {
    const totalChars = texts.reduce((sum, text) => sum + text.length, 0);

    // If total content fits in one batch, return early to avoid unnecessary splitting
    if (totalChars <= maxCharsPerBatch) {
      logger.debug(`[${this.providerName}] Total content (${totalChars} chars) fits in single batch (limit: ${maxCharsPerBatch}), skipping batching`);
      return [texts];
    }

    const idealBatchCount = Math.ceil(totalChars / maxCharsPerBatch);
    const balancedBatchSize = Math.ceil(totalChars / Math.min(idealBatchCount + 1, texts.length));

    const batches = [];
    let currentBatch = [];
    let currentChars = 0;
    const targetBatchChars = balancedBatching ? Math.min(balancedBatchSize, maxCharsPerBatch) : maxCharsPerBatch;

    for (const text of texts) {
      const textLength = text.length;

      // If adding this text would exceed the limit and we have items in the batch, create new batch
      if (currentChars + textLength > targetBatchChars && currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [];
        currentChars = 0;
      }

      // If a single text exceeds the limit, it goes in its own batch
      if (textLength > targetBatchChars) {
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
          currentBatch = [];
          currentChars = 0;
        }
        batches.push([text]); // Single item batch for oversized text
        continue;
      }

      currentBatch.push(text);
      currentChars += textLength;
    }

    // Add the last batch if it has items
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    logger.debug(`[${this.providerName}] Created ${batches.length} ${balancedBatching ? 'balanced' : ''}character-based batches for ${texts.length} segments (${totalChars} chars, target: ${targetBatchChars} chars/batch)`);

    return batches;
  }

  /**
   * Split text into sentences using Intl.Segmenter API (100+ language support)
   * This is the GOLD STANDARD for sentence boundary detection across all languages
   * @param {string} text - Text to split
   * @param {string} sourceLanguage - Source language code
   * @returns {string[]} - Array of sentences
   */
  splitIntoSentences(text, sourceLanguage = 'en') {
    // Use Intl.Segmenter for culture-aware sentence splitting
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      try {
        const segmenter = new Intl.Segmenter(sourceLanguage, { granularity: 'sentence' });
        const segments = segmenter.segment(text);
        return Array.from(segments).map(s => s.segment);
      } catch (error) {
        logger.debug(`[${this.providerName}] Intl.Segmenter failed for ${sourceLanguage}, falling back to regex:`, error.message);
      }
    }

    // Fallback to regex-based splitting for older browsers
    return this._fallbackSentenceSplitting(text);
  }

  /**
   * Fallback sentence splitting using regex
   * @param {string} text - Text to split
   * @returns {string[]} - Array of sentences
   */
  _fallbackSentenceSplitting(text) {
    // Simple regex fallback - not as accurate as Intl.Segmenter
    const sentences = text.split(/(?<=[.!?。！？])\s+/);
    return sentences.filter(s => s.trim().length > 0);
  }

  /**
   * Smart chunking with placeholder boundary protection
   * Uses hierarchical chunking strategy for 100+ languages
   * @param {string} text - Text to chunk
   * @param {number} limit - Character limit per chunk
   * @param {string} sourceLanguage - Source language code
   * @returns {string[]} - Array of text chunks
   */
  smartChunkWithPlaceholders(text, limit, sourceLanguage = 'en') {
    if (text.length <= limit) {
      return [text];
    }

    // Layer 1: Paragraph boundaries (double newlines)
    let chunks = this._splitAtParagraphBoundaries(text, limit);
    if (chunks.length > 1 && this._validatePlaceholderBoundaries(chunks, text)) {
      return chunks;
    }

    // Layer 2: Sentence boundaries using Intl.Segmenter
    const sentences = this.splitIntoSentences(text, sourceLanguage);
    chunks = this._groupSentencesIntoChunks(sentences, limit);

    // Layer 3: Validate placeholder boundaries
    if (!this._validatePlaceholderBoundaries(chunks, text)) {
      // Fallback to single chunk if placeholders would be split
      logger.warn(`[${this.providerName}] Cannot chunk without splitting placeholders, using single batch`);
      return [text];
    }

    return chunks;
  }

  /**
   * Split text at paragraph boundaries
   * @param {string} text - Text to split
   * @param {number} limit - Character limit
   * @returns {string[]} - Array of chunks
   */
  _splitAtParagraphBoundaries(text, limit) {
    const paragraphs = text.split(/\n\n+/);
    const chunks = [];
    let currentChunk = '';

    for (const paragraph of paragraphs) {
      if ((currentChunk + paragraph).length > limit && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = paragraph;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Group sentences into chunks respecting character limit
   * @param {string[]} sentences - Array of sentences
   * @param {number} limit - Character limit per chunk
   * @returns {string[]} - Array of chunks
   */
  _groupSentencesIntoChunks(sentences, limit) {
    const chunks = [];
    let currentChunk = '';
    let currentLength = 0;

    for (const sentence of sentences) {
      const sentenceLength = sentence.length;

      // If adding this sentence would exceed limit
      if (currentLength + sentenceLength > limit && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
        currentLength = sentenceLength;
      } else {
        currentChunk += sentence;
        currentLength += sentenceLength;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Validate that placeholder boundaries are preserved
   * @param {string[]} chunks - Array of text chunks
   * @param {string} originalText - Original text
   * @returns {boolean} - True if placeholders are intact
   */
  _validatePlaceholderBoundaries(chunks, originalText) {
    const PLACEHOLDER_PATTERN = /\[\[AIWC-\d+\]\]/g;

    // Count placeholders in original text
    const originalMatches = originalText.match(PLACEHOLDER_PATTERN);
    const originalCount = originalMatches ? originalMatches.length : 0;

    // Count placeholders in all chunks
    let chunkCount = 0;
    for (const chunk of chunks) {
      const matches = chunk.match(PLACEHOLDER_PATTERN);
      if (matches) {
        chunkCount += matches.length;
      }

      // Check for broken placeholders
      const brokenPattern = /\[\[AIWC-\d+$|^\d+\]\]|\[\[AIWC-|AIWC-\d+\]\]/;
      if (brokenPattern.test(chunk)) {
        logger.error(`[${this.providerName}] Found broken placeholder in chunk`);
        return false;
      }
    }

    return chunkCount === originalCount;
  }

  /**
   * Check if a position is inside a placeholder marker
   * @param {string} text - Text to check
   * @param {number} position - Position to check
   * @returns {boolean} - True if inside placeholder
   */
  _isInsidePlaceholder(text, position) {
    const PLACEHOLDER_PATTERN = /\[\[AIWC-\d+\]\]/g;
    const matches = [...text.matchAll(PLACEHOLDER_PATTERN)];

    for (const match of matches) {
      const startIndex = match.index;
      const endIndex = match.index + match[0].length;

      // Check if position is inside placeholder
      if (position >= startIndex && position < endIndex) {
        return true;
      }

      // Protect 2 characters before and after
      if (Math.abs(position - startIndex) <= 2 || Math.abs(position - endIndex) <= 2) {
        return true;
      }
    }

    return false;
  }
}