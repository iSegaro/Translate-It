// import browser from "webextension-polyfill";
import { applyTranslationsToNodes, expandTextsForTranslation, reassembleTranslations, separateCachedAndNewTexts } from "../../utils/textExtraction.js";
import { getScopedLogger } from "../../../../shared/logging/logger.js";
import { LOG_COMPONENTS } from "../../../../shared/logging/logConstants.js";
import { TranslationMode } from "@/shared/config/config.js";
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import { generateContentMessageId } from "@/utils/messaging/messageId.js";
import { calculateDynamicTimeout } from "../../utils/timeoutCalculator.js";
import { TRANSLATION_TIMEOUT_FALLBACK, TIMEOUT_CONFIG } from "../constants/selectElementConstants.js";

import { getTranslationString } from "../../../../utils/i18n/i18n.js";
import { sendMessage } from "@/shared/messaging/core/UnifiedMessaging.js";
import { unifiedTranslationCoordinator } from '@/shared/messaging/core/UnifiedTranslationCoordinator.js';
import { createStreamingResponseHandler } from '@/shared/messaging/core/StreamingResponseHandler.js';
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { pageEventBus } from '@/core/PageEventBus.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import ExtensionContextManager from '@/core/extensionContext.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';

export class TranslationOrchestrator extends ResourceTracker {
  constructor(stateManager) {
    super('translation-orchestrator')

    this.logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'TranslationOrchestrator');
    this.stateManager = stateManager;
    this.translationRequests = new Map();
    this.userCancelledRequests = new Set(); // Track user-cancelled requests
    this.escapeKeyListener = null;
    this.statusNotification = null;
    this.errorHandler = ErrorHandler.getInstance();

    // Initialize streaming response handler with coordinator integration
    this.streamingHandler = createStreamingResponseHandler(unifiedTranslationCoordinator);
  }

  async initialize() {
    this.logger.debug('TranslationOrchestrator initialized');
    
    // Set up periodic cleanup of old timeout requests (every 5 minutes) using ResourceTracker
    this.trackInterval(() => this.cleanupOldTimeoutRequests(), 5 * 60 * 1000);
  }

  /**
   * Clean up old timeout requests that are unlikely to receive late results
   */
  cleanupOldTimeoutRequests() {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes
    let cleanedCount = 0;

    for (const [messageId, request] of this.translationRequests) {
      if (request.status === 'timeout' && request.timeoutAt) {
        const age = now - request.timeoutAt;
        if (age > maxAge) {
          this.translationRequests.delete(messageId);
          cleanedCount++;
        }
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} old timeout requests`);
    }
  }

  /**
   * Show timeout notification to user
   * @param {string} messageId - Message ID
   */
  async showTimeoutNotification(messageId) {
    const timeoutMessage = await getTranslationString('ERRORS_TRANSLATION_TIMEOUT');
    
    // Use pageEventBus to show notification
    pageEventBus.emit('show-notification', {
      type: 'warning',
      title: 'Translation Timeout',
      message: timeoutMessage || 'Translation is taking longer than expected. Please wait or try again.',
      duration: 10000, // Show for 10 seconds
      id: `timeout-${messageId}`
    });
  }

  /**
   * Calculate dynamic timeout based on the number of segments to translate
   * Uses the shared timeout calculator with local TIMEOUT_CONFIG
   * @param {number} segmentCount - Number of translation segments
   * @returns {number} - Timeout in milliseconds
   */
  calculateDynamicTimeout(segmentCount) {
    // Use shared utility with local configuration override
    const timeout = calculateDynamicTimeout(segmentCount, {
      BASE_TIMEOUT: TIMEOUT_CONFIG.BASE_TIMEOUT,
      TIME_PER_SEGMENT: TIMEOUT_CONFIG.TIME_PER_SEGMENT,
      MAX_TIMEOUT: TIMEOUT_CONFIG.MAX_TIMEOUT,
      MIN_TIMEOUT: TIMEOUT_CONFIG.MIN_TIMEOUT,
      FALLBACK_TIMEOUT: TRANSLATION_TIMEOUT_FALLBACK
    });

    this.logger.debug(`Dynamic timeout calculated via shared utility: ${segmentCount} segments → ${timeout}ms (${timeout/1000}s)`);
    return timeout;
  }

  async processSelectedElement(element, originalTextsMap, textNodes, context = 'select-element') {
    this.logger.operation("Starting advanced translation process for selected element");
    
    // Check extension context before proceeding
    if (!ExtensionContextManager.isValidSync()) {
      const contextError = new Error('Extension context invalidated');
      ExtensionContextManager.handleContextError(contextError, 'select-element-translation');
      throw contextError;
    }
    
    const messageId = generateContentMessageId();

    // Set global flag to indicate translation is in progress
    window.isTranslationInProgress = true;

    // Only show status notification if not for SelectElement mode
    // SelectElement mode has its own notification management
    if (!context || context !== 'select-element') {
      const statusMessage = await getTranslationString("SELECT_ELEMENT_TRANSLATING") || "Translating...";
      this.statusNotification = `status-${messageId}`;
      pageEventBus.emit('show-notification', {
        id: this.statusNotification,
        message: statusMessage,
        type: "status",
      });
    } else {
      this.logger.debug("Skipping status notification for SelectElement mode");
      this.statusNotification = null;
    }

    try {
      const { textsToTranslate, cachedTranslations } = separateCachedAndNewTexts(originalTextsMap);
      this.logger.info("Cache separation result:", {
        textsToTranslate: textsToTranslate,
        cachedTranslations: Array.from(cachedTranslations.entries()),
        originalTextsMap: Array.from(originalTextsMap.entries())
      });

      if (textsToTranslate.length === 0 && cachedTranslations.size > 0) {
        this.logger.info("Applying translations from cache only.");
        // Store translations in state manager
        this.stateManager.addTranslatedElement(element, cachedTranslations);
        // Apply translations directly to DOM nodes (like OLD system)
        this.applyTranslationsToNodes(textNodes, cachedTranslations);
        // Dismiss the status notification since translation is complete
        if (this.statusNotification) {
          pageEventBus.emit('dismiss_notification', { id: this.statusNotification });
          this.statusNotification = null;
        }
        return { success: true, cached: true };
      }

      // CACHE FIX: Also handle mixed case where some translations are cached
      if (cachedTranslations.size > 0) {
        this.logger.info("Found partial cached translations, applying cached ones first");
        // Apply cached translations immediately
        this.applyTranslationsToNodes(textNodes, cachedTranslations);
        this.stateManager.addTranslatedElement(element, cachedTranslations);
      }

      if (textsToTranslate.length === 0) {
        this.logger.info("No new texts to translate.", {
          textsToTranslate: textsToTranslate,
          cachedTranslations: Array.from(cachedTranslations.entries()),
          originalTexts: Array.from(originalTextsMap.entries())
        });
        // Dismiss the status notification since there's nothing to translate
        if (this.statusNotification) {
          pageEventBus.emit('dismiss_notification', { id: this.statusNotification });
          this.statusNotification = null;
        }
        return { success: true, noTexts: true };
      }

      const { expandedTexts, originMapping } = expandTextsForTranslation(textsToTranslate);
      const jsonPayload = JSON.stringify(expandedTexts.map(t => ({ text: t })));

      this.translationRequests.set(messageId, {
        element,
        textNodes,
        textsToTranslate,
        originMapping,
        expandedTexts,
        cachedTranslations,
        translatedSegments: new Map(),
        status: 'pending',
        timestamp: Date.now(),
        hasErrors: false,
        lastError: null
      });


      await this.sendTranslationRequest(messageId, jsonPayload, context);
      // Removed setupTranslationWaiting to handle streaming results
    } catch (error) {
      // Clear the global translation in progress flag on error
      window.isTranslationInProgress = false;
      
      // Use ExtensionContextManager to detect context errors
      const isContextError = ExtensionContextManager.isContextError(error);

      // Check if this request was user-cancelled
      if (this.userCancelledRequests.has(messageId)) {
        this.logger.info("Translation process cancelled by user", {
          messageId,
          context: 'translation-process'
        });
        this.userCancelledRequests.delete(messageId); // Clean up here
      } else if (!error.alreadyHandled && !isContextError) {
        this.logger.error("Translation process failed", error);
      } else if (isContextError) {
        this.logger.debug("Translation process failed: extension context invalidated (expected behavior)", {
          messageId,
          context: 'translation-process'
        });
        // Handle context errors via ExtensionContextManager (will log as warn with details)
        ExtensionContextManager.handleContextError(error, 'translation-process');
      }
this.translationRequests.delete(messageId);
      // Dismiss the status notification on error
      if (this.statusNotification) {
        pageEventBus.emit('dismiss_notification', { id: this.statusNotification });
        this.statusNotification = null;
      }
      throw error;
    }
    
    // Return a default success result for streaming translations
    return { success: true, streaming: true };
  }

  async sendTranslationRequest(messageId, jsonPayload, context = 'select-element') {
    try {
      // Check if translation was cancelled
      const request = this.translationRequests.get(messageId);
      if (request && request.status === 'cancelled') {
        this.logger.debug('[TranslationOrchestrator] Translation cancelled before sending request');
        this.translationRequests.delete(messageId);
        window.isTranslationInProgress = false;
        return;
      }

      const { getTranslationApiAsync, getTargetLanguageAsync } = await import("../../../../config.js");
      const provider = await getTranslationApiAsync();
      const targetLanguage = await getTargetLanguageAsync();

      // Parse JSON to count segments
      let segmentCount = 1;
      try {
        const parsedPayload = JSON.parse(jsonPayload);
        segmentCount = Array.isArray(parsedPayload) ? parsedPayload.length : 1;
      } catch {
        this.logger.warn("Failed to parse JSON payload for segment count");
      }

      const translationRequest = {
        action: MessageActions.TRANSLATE,
        data: {
          text: jsonPayload,
          provider,
          sourceLanguage: AUTO_DETECT_VALUE,
          targetLanguage,
          mode: TranslationMode.Select_Element,
          options: { rawJsonPayload: true },
        },
        context: context,
        messageId,
      };

      this.logger.debug("Sending unified translation request", {
        messageId,
        segmentCount,
        payloadSize: jsonPayload.length
      });

      // Register streaming response handler for this request
      this.streamingHandler.registerHandler(messageId, {
        onStreamUpdate: (data) => this.handleStreamUpdate({ messageId, data }),
        onStreamEnd: (data) => this.handleStreamEnd({ messageId, data }),
        onTranslationResult: (data) => this.handleTranslationResult({ messageId, data }),
        onError: (error) => this._handleStreamingError(messageId, error)
      });

      // Send through unified messaging system (will coordinate streaming/regular)
      const result = await sendMessage(translationRequest);

      this.logger.debug("Unified translation request completed", result);
    } catch (error) {
      // Use ExtensionContextManager to detect context errors
      const isContextError = ExtensionContextManager.isContextError(error);

      // Check if this is a timeout error
      const isTimeoutError = error.message && (
        error.message.includes('timeout') ||
        error.message.includes('Port messaging timeout')
      );

      // Check if this request was user-cancelled
      if (this.userCancelledRequests.has(messageId)) {
        this.logger.info("Translation request cancelled by user", {
          messageId,
          context: 'translation-request'
        });
        // Don't delete here - let main process error handling delete it
        throw error; // Still throw to maintain error flow
      } else if (isContextError) {
        this.logger.debug("Translation request failed: extension context invalidated (expected behavior)", {
          messageId,
          context: 'translation-request'
        });
        // Handle context errors via ExtensionContextManager (will log as warn with details)
        ExtensionContextManager.handleContextError(error, 'translation-request');
        throw error; // Still throw to maintain error flow
      } else {
        this.logger.error("Failed to send translation request", error);
      }
      
      if (isTimeoutError) {
        this.logger.warn("Translation request timed out (background processing may continue)", {
          messageId
        });
        
        // Update request status to timeout but don't delete it
        const request = this.translationRequests.get(messageId);
        if (request) {
          request.status = 'timeout';
          request.timeoutAt = Date.now();
          
          // Show timeout notification to user
          await this.showTimeoutNotification(messageId);
        }
        
        // Don't throw error for timeout - let streaming continue in background
        return;
      }
      
      // For non-timeout errors, throw as before
      throw error;
    }
  }

  async handleStreamUpdate(message) {
    const { messageId, data } = message;

    this.logger.debug(`[TranslationOrchestrator] Received stream update:`, {
      messageId,
      success: data?.success,
      batchIndex: data?.batchIndex,
      translatedBatchLength: data?.data?.length,
      originalBatchLength: data?.originalData?.length
    });

    // Check if the request still exists (may have been cancelled)
    const request = this.translationRequests.get(messageId);
    if (!request) {
      this.logger.debug(`[TranslationOrchestrator] Ignoring stream update for unknown/cancelled request: ${messageId}`);
      return;
    }

    // Check if request was cancelled
    if (request.status === 'cancelled') {
      this.logger.debug(`[TranslationOrchestrator] Ignoring stream update for cancelled request: ${messageId}`);
      return;
    }

    if (!data.success) {
        this.logger.warn(`Received a failed stream update for messageId: ${messageId}`, data.error);

        // Mark request as having errors, but don't show error notification yet
        // The final error handling will be done in handleStreamEnd
        if (request) {
          request.hasErrors = true;
          request.lastError = data.error;
        }
        
        // Clear the global translation in progress flag on error
        window.isTranslationInProgress = false;
        
        // Dismiss notification on error
        if (this.statusNotification) {
          pageEventBus.emit('dismiss_notification', { id: this.statusNotification });
          this.statusNotification = null;
          this.logger.debug("Dismissed translating notification on stream error");
        } else {
          // For Select Element mode, dismiss the Select Element notification
          pageEventBus.emit('dismiss-select-element-notification', {});
          this.logger.debug("Dismissed Select Element notification on stream error");
        }
        
        // Notify SelectElementManager to perform cleanup
        if (window.selectElementManagerInstance) {
          window.selectElementManagerInstance.performPostTranslationCleanup();
        }
        
        return;
    }

    // Ensure the translation in progress flag remains set during streaming
    window.isTranslationInProgress = true;

    const { data: translatedBatch, originalData: originalBatch, batchIndex: _batchIndex } = data; // eslint-disable-line no-unused-vars

    // Request is already retrieved at the beginning of this function (line 317)
    // Just verify it still exists and hasn't been cancelled
    if (!request) {
      this.logger.debug("Received stream update for already completed message:", messageId);
      return;
    }
    
    // Check if request was cancelled
    if (request.status === 'cancelled') {
      this.logger.debug("Ignoring stream update for cancelled message:", { messageId });
      return;
    }

    // If this request was previously timed out, dismiss timeout notification
    if (request.status === 'timeout') {
      pageEventBus.emit('dismiss_notification', { id: `timeout-${messageId}` });
      this.logger.debug("Dismissed timeout notification as streaming update received");
    }

    // Keep notification during streaming - will be dismissed in handleStreamEnd

    const { textsToTranslate, originMapping, expandedTexts, textNodes } = request;

    for (let i = 0; i < translatedBatch.length; i++) {
        const translatedText = translatedBatch[i];
        const originalText = originalBatch[i];

        // Find the original index in the expandedTexts array
        const expandedIndex = expandedTexts.findIndex(text => text === originalText);

        if (expandedIndex === -1) {
            this.logger.warn(`Could not find original text for a translated segment: "${originalText}"`);
            continue;
        }

        const { originalIndex } = originMapping[expandedIndex];
        // eslint-disable-next-line no-unused-vars
        const _originalTextKey = textsToTranslate[originalIndex];
        
        const nodesToUpdate = textNodes.filter(node => node.textContent.trim() === originalText.trim());

        if (nodesToUpdate.length > 0) {
            const translationMap = new Map([[originalText, translatedText]]);
            this.applyTranslationsToNodes(nodesToUpdate, translationMap);
            request.translatedSegments.set(expandedIndex, translatedText);
            
            // CACHE FIX: Store streaming translations in the global cache for future retrieval
            const { getElementSelectionCache } = await import("../../utils/cache.js");
            const cache = getElementSelectionCache();
            cache.setTranslation(originalText, translatedText);
        }
    }
  }

  async handleStreamEnd(message) {
    const { messageId, data } = message;
    const request = this.translationRequests.get(messageId);
    if (!request) {
      this.logger.debug("Received stream end for already completed message:", messageId);
      return;
    }
    
    // Check if request was cancelled
    if (request.status === 'cancelled') {
      this.logger.debug("Ignoring stream end for cancelled message:", { messageId });
      // Clean up cancelled request
this.translationRequests.delete(messageId);
      return;
    }

    this.logger.info("Translation stream finished for message:", messageId, { 
      success: data?.success, 
      error: data?.error,
      completed: data?.completed 
    });
    
    try {
      // Clear the global translation in progress flag
      window.isTranslationInProgress = false;
      
      // Dismiss the "Translating..." notification on stream completion
      if (this.statusNotification) {
        pageEventBus.emit('dismiss_notification', { id: this.statusNotification });
        this.statusNotification = null;
        this.logger.debug("Dismissed translating notification on stream completion");
      } else {
        // For Select Element mode, dismiss the Select Element notification
        pageEventBus.emit('dismiss-select-element-notification', {});
        this.logger.debug("Dismissed Select Element notification on stream completion");
      }

      // If this was a previously timed out request, show success notification
      if (request.status === 'timeout') {
        pageEventBus.emit('show-notification', {
          type: 'success',
          title: 'Translation Completed',
          message: 'Translation completed successfully after timeout.',
          duration: 5000,
          id: `success-${messageId}`
        });
        this.logger.debug("Showed success notification for previously timed out request");
      }

      // Check if stream ended with error OR if there were errors during streaming
      if (data?.error || !data?.success || request.hasErrors) {
        this.logger.warn(`Stream ended with error for messageId: ${messageId}`, data?.error || request.lastError);

        // Handle error properly for user feedback
        const errorMessage = data?.error?.message || request.lastError?.message || 'Translation failed during streaming';
        const error = new Error(errorMessage);
        error.originalError = data?.error || request.lastError;

        // Check if we should retry with a fallback provider
        const shouldRetry = !request.retryAttempt && (
          error.originalError?.type === ErrorTypes.HTML_RESPONSE_ERROR ||
          error.originalError?.type === ErrorTypes.JSON_PARSING_ERROR ||
          error.originalError?.type === ErrorTypes.TRANSLATION_FAILED ||
          (data?.error?.message && (
            data.error.message.includes('HTML response') ||
            data.error.message.includes('JSON parsing') ||
            data.error.message.includes('Failed to execute \'json\' on \'Response\'')
          ))
        );

        if (shouldRetry) {
          this.logger.info('Attempting retry with fallback provider due to recoverable error', {
            messageId,
            errorType: error.originalError?.type || 'unknown'
          });

          // Try to retry with fallback provider
          const retrySuccess = await this.retryWithFallbackProvider(
            messageId,
            JSON.stringify(request.textsToTranslate.map(t => ({ text: t }))),
            error
          );

          if (retrySuccess) {
            // Don't delete the original request yet - wait for retry to complete
            return;
          }
          // If retry failed or wasn't possible, continue with normal error handling
        }

        // Use centralized error handling to show error to user
        await this.errorHandler.handle(error, {
          context: 'select-element-streaming-translation-end',
          type: ErrorTypes.TRANSLATION_FAILED,
          showToast: true
        });

        // Notify SelectElementManager to perform cleanup
        if (window.selectElementManagerInstance) {
          window.selectElementManagerInstance.performPostTranslationCleanup();
        }

        this.translationRequests.delete(messageId);
        return;
      }
      
      // Finalize state, e.g., by storing all translations in stateManager
      // eslint-disable-next-line no-unused-vars
      const _allTranslations = new Map(request.cachedTranslations);
      request.translatedSegments.forEach((value, key) => {
          const { originalIndex } = request.originMapping[key];
          const __originalTextKey = request.textsToTranslate[originalIndex]; // eslint-disable-line no-unused-vars
          // This part is complex, for now just storing the translated segments is enough for revert
          // A more sophisticated reassembly might be needed if we want to store the full translated block
      });
      this.stateManager.addTranslatedElement(request.element, request.translatedSegments);

      this.translationRequests.delete(messageId);
      
      // Notify SelectElementManager to perform cleanup
      if (window.selectElementManagerInstance) {
        window.selectElementManagerInstance.performPostTranslationCleanup();
      }
    } catch (error) {
      this.logger.error("Error during stream end processing:", error);
      
      // Ensure cleanup happens even if there's an error
      this.translationRequests.delete(messageId);
      window.isTranslationInProgress = false;
      
      // Dismiss notification if it exists
      if (this.statusNotification) {
        pageEventBus.emit('dismiss_notification', { id: this.statusNotification });
        this.statusNotification = null;
      } else {
        // For Select Element mode, dismiss the Select Element notification
        pageEventBus.emit('dismiss-select-element-notification', {});
        this.logger.debug("Dismissed Select Element notification on stream end error");
      }
      
      // Show error to user
      this.errorHandler.handle(error, {
        context: 'stream_end_processing',
        messageId,
        showToast: true
      });
    }
  }

  async handleTranslationResult(message) {
    // This method is now a fallback for non-streaming responses
    const { messageId, data } = message;
    this.logger.debug("Received non-streaming translation result:", { messageId });

    const request = this.translationRequests.get(messageId);
    if (!request) {
      this.logger.debug("Received translation result for unknown message (normal in multi-frame context):", messageId);
      // IFRAME FIX: Even if request is not found, trigger cleanup if translation succeeded
      // This handles the case where multiple SelectElementManager instances exist across frames
      if (data?.success && this.isActive()) {
        this.logger.debug("Triggering cleanup for unknown request due to successful translation");
        this.triggerPostTranslationCleanup();
      }
      return;
    }
    
    if (request.status !== 'pending') {
      if (request.status === 'cancelled') {
        this.logger.debug("Ignoring translation result for cancelled message:", { messageId });
      } else {
        this.logger.debug("Received translation result for already processed message:", { messageId, status: request.status });
      }
      return;
    }

    try {
      if (data?.success) {
        const { translatedText } = data;
        const translatedData = JSON.parse(translatedText);
        const { textsToTranslate, originMapping, expandedTexts, cachedTranslations, textNodes, element } = request;

        const newTranslations = reassembleTranslations(
          translatedData,
          expandedTexts,
          originMapping,
          textsToTranslate,
          cachedTranslations
        );

        const allTranslations = new Map([...cachedTranslations, ...newTranslations]);
        
        // Store translations in state manager for potential revert
        this.stateManager.addTranslatedElement(element, allTranslations);
        
        // Apply translations directly to DOM nodes (like OLD system)
        this.applyTranslationsToNodes(textNodes, allTranslations);


        request.status = 'completed';
        request.result = data;
        this.logger.info("Translation applied successfully to DOM elements (fallback)", { messageId });
      } else {
        request.status = 'error';
        request.error = data?.error;
        this.logger.error("Translation failed (fallback)", { messageId, error: data?.error });
        await this.errorHandler.handle(new Error(data?.error?.message || 'Translation failed'), {
            context: 'select-element-translation-fallback',
            type: ErrorTypes.TRANSLATION_FAILED,
            showToast: true
        });
      }
    } catch (e) {
      this.logger.error("Unexpected error during fallback translation result handling:", e);
      request.status = 'error';
      request.error = e.message;
    } finally {
        // Clear the global translation in progress flag
        window.isTranslationInProgress = false;
        
        if (this.statusNotification) {
            pageEventBus.emit('dismiss_notification', { id: this.statusNotification });
            this.statusNotification = null;
        }
        this.translationRequests.delete(messageId);
        
        // Notify SelectElementManager to perform cleanup
        if (window.selectElementManagerInstance) {
          window.selectElementManagerInstance.performPostTranslationCleanup();
        }
    }
  }

  /**
   * Apply translations directly to DOM nodes (like OLD system)
   * @param {Array} textNodes - Array of text nodes to translate
   * @param {Map} translations - Map of original text to translated text
   */
  applyTranslationsToNodes(textNodes, translations) {
    // this.logger.debug("Applying translations directly to DOM nodes", {
    //   textNodesCount: textNodes.length,
    //   translationsSize: translations.size
    // });
    
    // Create simple context for the extraction utility
    const context = {
      state: {
        originalTexts: this.stateManager.originalTexts || new Map()
      }
    };
    
    // Use the existing applyTranslationsToNodes from extraction utilities
    applyTranslationsToNodes(textNodes, translations, context);
    
    // this.logger.debug("Translations applied directly to DOM nodes", {
    //   appliedCount: translations.size
    // });
  }

  /**
   * Cancel a specific translation by messageId
   * @param {string} messageId - The messageId to cancel
   */
  async cancelTranslation(messageId) {
    this.logger.debug(`Cancelling specific translation: ${messageId}`);
    
    const request = this.translationRequests.get(messageId);
    if (!request) {
      this.logger.debug(`No active request found for messageId: ${messageId}`);
      return;
    }
    
    if (request.status === 'pending') {
      request.status = 'cancelled';
      request.error = 'Translation cancelled by user';
      this.logger.debug(`[TranslationOrchestrator] Cancelled specific request: ${messageId}`);
      
      // Send cancellation to background (will be handled by enhanced handleCancelTranslation)
      try {
        await sendMessage({
          action: MessageActions.CANCEL_TRANSLATION,
          data: { 
            messageId,
            reason: 'user_request',
            context: 'translation-orchestrator'
          }
        });
      } catch (err) {
        this.logger.warn('Failed to send specific cancellation to background:', err);
      }
    }
    
    // Check if this was the only active request
    const hasActiveRequests = Array.from(this.translationRequests.values())
      .some(req => req.status === 'pending');
      
    if (!hasActiveRequests) {
      window.isTranslationInProgress = false;
      this.logger.debug('No more active translations - cleared global flag');
    }
  }

  /**
   * Get the currently active messageId (first pending request)
   * @returns {string|null} - Active messageId or null if none
   */
  getActiveMessageId() {
    for (const [messageId, request] of this.translationRequests) {
      if (request.status === 'pending') {
        return messageId;
      }
    }
    return null;
  }

  cancelAllTranslations() {
    this.logger.operation("Cancelling all ongoing translations");

    // Clear the global translation in progress flag
    window.isTranslationInProgress = false;

    // Mark all requests as user-cancelled BEFORE any processing
    for (const [messageId] of this.translationRequests) {
      this.userCancelledRequests.add(messageId);
      // Also mark in ExtensionContextManager for global tracking
      ExtensionContextManager.markUserCancelled(messageId);
    }

    this.logger.debug('[TranslationOrchestrator] Before cancellation:', {
      requestsSize: this.translationRequests.size,
      requestIds: Array.from(this.translationRequests.keys()),
      requestStatuses: Array.from(this.translationRequests.values()).map(r => ({ id: r.messageId || 'unknown', status: r.status })),
      userCancelledRequests: Array.from(this.userCancelledRequests)
    });

    // Cancel all pending requests and remove them
    const requestsToCancel = [];
    for (const [messageId, request] of this.translationRequests) {
      if (request.status === 'pending') {
        request.status = 'cancelled';
        request.error = 'Translation cancelled by user';
        requestsToCancel.push(messageId);
        this.logger.debug('[TranslationOrchestrator] Cancelled request:', messageId);

        // Notify background to cancel the network request
        sendMessage({
          action: MessageActions.CANCEL_TRANSLATION,
          messageId: messageId,
          data: { messageId: messageId }
        }).catch(err => this.logger.warn('Failed to send cancellation message to background', err));
      }
    }

    // Remove cancelled requests from the map
    requestsToCancel.forEach(messageId => {
      this.translationRequests.delete(messageId);
      this.logger.debug('[TranslationOrchestrator] Removed cancelled request:', messageId);
    });
    if (this.statusNotification) {
      pageEventBus.emit('dismiss_notification', { id: this.statusNotification });
      this.statusNotification = null;
    }
  }

  /**
   * Handle streaming error from unified system
   * @private
   */
  _handleStreamingError(messageId, error) {
    this.logger.error(`Streaming error for ${messageId}:`, error);

    const request = this.translationRequests.get(messageId);
    if (request) {
      request.status = 'error';
      request.error = error;
    }

    // Clear global flags and notifications
    window.isTranslationInProgress = false;
    if (this.statusNotification) {
      pageEventBus.emit('dismiss_notification', { id: this.statusNotification });
      this.statusNotification = null;
    }

    // Show error to user if not cancelled
    if (!this.userCancelledRequests.has(messageId)) {
      this.errorHandler.handle(error, {
        context: 'select-element-streaming',
        type: ErrorTypes.TRANSLATION_FAILED,
        showToast: true
      });
    }

    // Cleanup
    this.translationRequests.delete(messageId);
    this.userCancelledRequests.delete(messageId);

    // Notify SelectElementManager
    if (window.selectElementManagerInstance) {
      window.selectElementManagerInstance.performPostTranslationCleanup();
    }
  }

  async cleanup() {
    this.cancelAllTranslations();
    this.translationRequests.clear();
    this.userCancelledRequests.clear(); // Clear user cancellation tracking

    // Cleanup streaming handler
    if (this.streamingHandler) {
      this.streamingHandler.cleanup();
    }

    // Use ResourceTracker cleanup for automatic resource management
    super.cleanup();

    this.logger.debug('TranslationOrchestrator cleanup completed');
  }

  getDebugInfo() {
    return { activeRequests: this.translationRequests.size };
  }

  /**
   * Get the current active message ID (if any)
   * @returns {string|null} Current message ID
   */
  getCurrentMessageId() {
    // Return the most recent messageId from active requests
    const activeRequests = Array.from(this.translationRequests.keys());
    return activeRequests.length > 0 ? activeRequests[activeRequests.length - 1] : null;
  }

  /**
   * Check if a message ID was cancelled by user
   * @param {string} messageId - Message ID to check
   * @returns {boolean} True if user cancelled
   */
  isUserCancelled(messageId) {
    return this.userCancelledRequests.has(messageId);
  }

  /**
   * Check if this orchestrator instance is active (has a SelectElementManager that's active)
   */
  isActive() {
    // Check if SelectElementManager is accessible and active
    if (window.selectElementManagerInstance) {
      return window.selectElementManagerInstance.isActive;
    }
    return false;
  }

  /**
   * Trigger post-translation cleanup through SelectElementManager
   */
  triggerPostTranslationCleanup() {
    if (window.selectElementManagerInstance && typeof window.selectElementManagerInstance.performPostTranslationCleanup === 'function') {
      this.logger.debug('Triggering SelectElementManager cleanup');
      window.selectElementManagerInstance.performPostTranslationCleanup();
    } else {
      this.logger.warn('Cannot trigger cleanup: SelectElementManager not available');
    }
  }

  /**
   * Retry translation with a fallback provider
   * @param {string} messageId - Original message ID
   * @param {string} jsonPayload - Translation payload
   * @param {Error} originalError - Original error that triggered retry
   * @returns {Promise<boolean>} - True if retry was successful
   */
  async retryWithFallbackProvider(messageId, jsonPayload, originalError) {
    try {
      this.logger.info('Attempting translation retry with fallback provider', {
        messageId,
        originalError: originalError.message
      });

      // Check if request still exists
      const request = this.translationRequests.get(messageId);
      if (!request) {
        this.logger.warn('Cannot retry: request not found', { messageId });
        return false;
      }

      // Get available providers
      const { getAvailableProvidersAsync } = await import("../../../../config.js");
      const availableProviders = await getAvailableProvidersAsync();

      // Get current provider
      const { getTranslationApiAsync } = await import("../../../../config.js");
      const currentProvider = await getTranslationApiAsync();
      const currentProviderName = currentProvider?.providerName || 'unknown';

      // Find next available provider that isn't the current one
      const fallbackProvider = availableProviders.find(p =>
        p.name !== currentProviderName &&
        p.enabled &&
        p.configured
      );

      if (!fallbackProvider) {
        this.logger.warn('No fallback provider available', {
          currentProvider: currentProviderName,
          availableProviders: availableProviders.map(p => p.name)
        });
        return false;
      }

      this.logger.info('Found fallback provider for retry', {
        currentProvider: currentProviderName,
        fallbackProvider: fallbackProvider.name
      });

      // Update request to indicate retry attempt
      request.retryAttempt = (request.retryAttempt || 0) + 1;
      request.status = 'retrying';

      // Show retry notification
      pageEventBus.emit('show-notification', {
        type: 'info',
        title: 'Retrying Translation',
        message: `Failed with ${currentProviderName}, retrying with ${fallbackProvider.name}...`,
        duration: 3000,
        id: `retry-${messageId}`
      });

      // Create new message ID for retry to avoid conflicts
      const retryMessageId = generateContentMessageId('select-element-retry');

      // Prepare retry request
      const retryRequest = {
        ...request,
        retryOriginalMessageId: messageId,
        originalProvider: currentProviderName,
        fallbackProvider: fallbackProvider.name
      };

      // Store retry request
      this.translationRequests.set(retryMessageId, retryRequest);

      // Send retry request with fallback provider
      const { setTranslationApiAsync } = await import("../../../../config.js");
      await setTranslationApiAsync(fallbackProvider.name);

      // Send the translation request through unified messaging
      const translationRequest = {
        action: MessageActions.TRANSLATE,
        data: {
          text: jsonPayload,
          sourceLang: request.sourceLang,
          targetLang: request.targetLang,
          mode: TranslationMode.SelectElement,
          messageId: retryMessageId,
          context: 'select-element-retry'
        }
      };

      // Register streaming handler for retry
      this.streamingHandler.registerHandler(retryMessageId, {
        onStreamUpdate: (data) => this.handleStreamUpdate({ messageId: retryMessageId, data }),
        onStreamEnd: (data) => this._handleRetryStreamEnd({ messageId: retryMessageId, originalMessageId: messageId, data }),
        onTranslationResult: (data) => this.handleTranslationResult({ messageId: retryMessageId, data }),
        onError: (error) => this._handleStreamingError(retryMessageId, error)
      });

      // Send retry request
      const result = await sendMessage(translationRequest);

      this.logger.info('Retry translation request sent successfully', {
        retryMessageId,
        fallbackProvider: fallbackProvider.name
      });

      return true;

    } catch (retryError) {
      this.logger.error('Failed to retry translation with fallback provider', retryError);

      // Show error notification for retry failure
      pageEventBus.emit('show-notification', {
        type: 'error',
        title: 'Translation Retry Failed',
        message: `Failed to retry translation: ${retryError.message}`,
        duration: 5000,
        id: `retry-failed-${messageId}`
      });

      return false;
    }
  }

  /**
   * Handle stream end for retry requests
   * @param {Object} params - Stream end parameters
   */
  async _handleRetryStreamEnd({ messageId, originalMessageId, data }) {
    const retryRequest = this.translationRequests.get(messageId);
    const originalRequest = this.translationRequests.get(originalMessageId);

    this.logger.debug('Handling retry stream end', {
      messageId,
      originalMessageId,
      success: data?.success
    });

    if (!retryRequest || !originalRequest) {
      this.logger.warn('Missing request data for retry stream end');
      return;
    }

    try {
      if (data?.success && !data?.error) {
        // Retry was successful - update original request with results
        originalRequest.status = 'completed';
        originalRequest.result = data;
        originalRequest.translatedSegments = retryRequest.translatedSegments;
        originalRequest.retrySuccessful = true;
        originalRequest.fallbackProviderUsed = retryRequest.fallbackProvider;

        // Clean up retry request
        this.translationRequests.delete(messageId);

        // Show success notification
        pageEventBus.emit('show-notification', {
          type: 'success',
          title: 'Translation Successful',
          message: `Successfully translated using ${retryRequest.fallbackProvider.name} after retry`,
          duration: 5000,
          id: `retry-success-${originalMessageId}`
        });

        this.logger.info('Translation retry successful', {
          originalMessageId,
          fallbackProvider: retryRequest.fallbackProvider.name
        });
      } else {
        // Retry also failed
        originalRequest.status = 'error';
        originalRequest.error = data?.error || retryRequest.lastError;
        originalRequest.retryFailed = true;

        // Clean up retry request
        this.translationRequests.delete(messageId);

        // Show error notification
        await this.errorHandler.handle(new Error(`Translation failed with both ${retryRequest.originalProvider} and ${retryRequest.fallbackProvider.name}`), {
          context: 'select-element-retry-failed',
          type: ErrorTypes.TRANSLATION_FAILED,
          showToast: true
        });

        this.logger.error('Translation retry failed', {
          originalMessageId,
          originalProvider: retryRequest.originalProvider,
          fallbackProvider: retryRequest.fallbackProvider.name,
          error: data?.error
        });
      }
    } catch (error) {
      this.logger.error('Error handling retry stream end', error);
    } finally {
      // Always trigger cleanup for the original request
      if (originalRequest.status === 'completed' || originalRequest.status === 'error') {
        window.isTranslationInProgress = false;

        if (this.statusNotification) {
          pageEventBus.emit('dismiss_notification', { id: this.statusNotification });
          this.statusNotification = null;
        }

        // Trigger cleanup
        this.triggerPostTranslationCleanup();
      }
    }
  }
}