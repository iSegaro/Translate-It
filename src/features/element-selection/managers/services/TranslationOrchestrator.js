import { getScopedLogger } from "../../../../shared/logging/logger.js";
import { LOG_COMPONENTS } from "../../../../shared/logging/logConstants.js";
import { expandTextsForTranslation } from "../../utils/textExtraction.js";
import { generateContentMessageId } from "@/utils/messaging/messageId.js";
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import ExtensionContextManager from '@/core/extensionContext.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

// Import the four new services
import { TranslationRequestManager } from "./TranslationRequestManager.js";
import { StreamingTranslationEngine } from "./StreamingTranslationEngine.js";
import { TranslationErrorHandler } from "./TranslationErrorHandler.js";
import { TranslationUIManager } from "./TranslationUIManager.js";

/**
 * Translation Orchestrator - Coordinating translation services
 * Now uses composition pattern with 4 specialized services instead of monolithic approach
 * Reduced from 1447 lines to ~150 lines while maintaining full functionality
 */
export class TranslationOrchestrator extends ResourceTracker {
  constructor(stateManager) {
    super('translation-orchestrator');

    this.logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'TranslationOrchestrator');
    this.stateManager = stateManager;

    // Initialize centralized error handler
    this.errorHandler = ErrorHandler.getInstance();

    // Initialize the four specialized services using composition pattern
    this.requestManager = new TranslationRequestManager(this);
    this.streamingEngine = new StreamingTranslationEngine(this);
    this.errorHandlerService = new TranslationErrorHandler(this);
    this.uiManager = new TranslationUIManager(this);

    // Backward compatibility properties (delegated to services)
    this.translationRequests = this.requestManager.translationRequests;
    this.userCancelledRequests = this.requestManager.userCancelledRequests;
    this.statusNotification = this.uiManager.statusNotification;
    this.escapeKeyListener = null; // Preserved for compatibility
    this.cacheCompleted = this.uiManager.cacheCompleted;
    this.streamingHandler = this.streamingEngine.streamingHandler;
  }

  async initialize() {
    this.logger.debug('TranslationOrchestrator initialized with service composition');

    // Initialize all services
    this.requestManager.initialize();
    this.uiManager.initialize();

    this.logger.debug('All translation services initialized successfully');
  }

  /**
   * Main entry point for processing selected element translation
   * Maintains exact same interface as before for backward compatibility
   */
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

    try {
      // Show status notification
      await this.uiManager.showStatusNotification(messageId, context);

      // Convert Map to array for translation (cache removed)
      const textsToTranslate = Array.from(originalTextsMap.keys());
      this.logger.debug("Starting translation for texts:", {
        textsCount: textsToTranslate.length,
        totalUniqueTexts: originalTextsMap.size
      });

      // Handle no texts to translate scenario
      if (textsToTranslate.length === 0) {
        this.logger.info("No texts to translate");
        window.isTranslationInProgress = false;
        this.uiManager.dismissStatusNotification();
        return { success: true, noTexts: true };
      }

      // Prepare translation payload
      const { expandedTexts, originMapping } = expandTextsForTranslation(textsToTranslate);

      // Filter out empty line placeholders from translation payload
      // Keep them as empty strings but don't send to translation API
      const filteredExpandedTexts = expandedTexts.map(text =>
        text === '[[EMPTY_LINE]]' ? '' : text
      );

      // For single segment, send the text directly to avoid nested array brackets
      const jsonPayload = filteredExpandedTexts.length === 1
        ? JSON.stringify(filteredExpandedTexts)
        : JSON.stringify(filteredExpandedTexts.map(t => ({ text: t })));

      // Determine if streaming should be used
      if (this.streamingEngine.isStreamingTranslation(jsonPayload)) {
        // Create streaming request with original expandedTexts and originMapping
        this.requestManager.createStreamingRequest(messageId, {
          element,
          textNodes,
          textsToTranslate,
          originMapping,
          expandedTexts, // Original expandedTexts with placeholder info
          filteredExpandedTexts, // Filtered version for API reference
          originalTextsMap
        });

        await this.streamingEngine.sendStreamingTranslationRequest(messageId, jsonPayload, context);
        return { success: true, streaming: true, messageId };
      } else {
        // Create direct request
        this.requestManager.createDirectRequest(messageId, {
          element,
          textNodes,
          originalTextsMap,
          textsToTranslate,
          originMapping,
          expandedTexts, // Original expandedTexts with placeholder info
          filteredExpandedTexts // Filtered version for API reference
        });

        const result = await this.streamingEngine.sendDirectTranslationRequest(messageId, jsonPayload, context);

        // Handle result
        if (result.success && result.translatedText) {
          await this.uiManager.handleTranslationResult({ messageId, data: result });

          // Return that translation was already applied by UI manager
          return {
            success: true,
            applied: true, // Flag that translation was already applied
            fromUIManager: true, // Source flag
            originalTextsMap: originalTextsMap,
            expandedTexts: expandedTexts,
            originMapping: originMapping
          };
        }

        return result;
      }
    } catch (error) {
      // Clear the global translation in progress flag on error
      window.isTranslationInProgress = false;

      // Handle context errors
      if (this.errorHandlerService.handleContextError(error, 'translation-process')) {
        throw error;
      }

      // Check if this request was user-cancelled using proper error management
      const isUserCancelled = this.requestManager.isUserCancelled(messageId) ||
                              matchErrorToType(error) === ErrorTypes.USER_CANCELLED;

      if (isUserCancelled) {
        this.logger.info("Translation process cancelled by user", { messageId });
      } else if (!error.alreadyHandled) {
        this.logger.error("Translation process failed", error);
      }

      // Clean up on error
      this.requestManager.removeRequest(messageId);
      this.uiManager.dismissStatusNotification();

      throw error;
    }
  }

  
  /**
   * Calculate dynamic timeout (delegated to streaming engine)
   */
  calculateDynamicTimeout(segmentCount) {
    return this.streamingEngine.calculateDynamicTimeout(segmentCount);
  }

  /**
   * Show timeout notification (delegated to UI manager)
   */
  async showTimeoutNotification(messageId) {
    return await this.uiManager.showTimeoutNotification(messageId);
  }

  /**
   * Clean up old timeout requests (delegated to request manager)
   */
  cleanupOldTimeoutRequests() {
    return this.requestManager.cleanupOldTimeoutRequests();
  }

  /**
   * Stream update handler (delegated to UI manager)
   */
  async handleStreamUpdate(message) {
    return await this.uiManager.processStreamUpdate(message);
  }

  /**
   * Stream end handler (delegated to UI manager)
   */
  async handleStreamEnd(message) {
    return await this.uiManager.processStreamEnd(message);
  }

  /**
   * Translation result handler (delegated to UI manager)
   */
  async handleTranslationResult(message) {
    return await this.uiManager.handleTranslationResult(message);
  }

  /**
   * Apply translations to nodes (delegated to UI manager)
   */
  async applyTranslationsToNodes(textNodes, translations) {
    return await this.uiManager.applyTranslationsToNodes(textNodes, translations);
  }

  /**
   * Cancel a specific translation (delegated to request manager)
   */
  async cancelTranslation(messageId) {
    this.logger.debug(`Cancelling specific translation: ${messageId}`);

    this.requestManager.cancelRequest(messageId);

    // Send cancellation to background
    try {
      const { MessageActions } = await import("@/shared/messaging/core/MessageActions.js");
      const { sendMessage } = await import("@/shared/messaging/core/UnifiedMessaging.js");

      await sendMessage({
        action: MessageActions.CANCEL_TRANSLATION,
        data: {
          messageId,
          reason: 'user_request',
          context: 'translation-orchestrator'
        }
      });
    } catch (err) {
      // Check if this is a user cancellation error
      const isUserCancellation = err.message && (
        err.message.includes('cancelled') ||
        err.message.includes('ESC') ||
        err.message.includes('user cancelled')
      );
      this.logger[isUserCancellation ? 'debug' : 'warn']('Failed to send specific cancellation to background:', err);
    }

    // Check if this was the only active request
    if (!this.requestManager.hasActiveRequests()) {
      window.isTranslationInProgress = false;
      this.logger.debug('No more active translations - cleared global flag');
    }
  }

  /**
   * Get the currently active messageId (delegated to request manager)
   */
  getActiveMessageId() {
    return this.requestManager.getActiveMessageId();
  }

  /**
   * Cancel all translations (delegated to request manager)
   */
  cancelAllTranslations() {
    this.logger.operation("Cancelling all ongoing translations");

    // Clear the global translation in progress flag
    window.isTranslationInProgress = false;

    // Mark all requests as user-cancelled
    const requestsToCancel = this.requestManager.cancelAllRequests();

    // Notify background to cancel the network requests
    Promise.all(requestsToCancel.map(messageId => {
      return import("@/shared/messaging/core/UnifiedMessaging.js").then(({ sendMessage }) => {
        return import("@/shared/messaging/core/MessageActions.js").then(({ MessageActions }) => {
          return sendMessage({
            action: MessageActions.CANCEL_TRANSLATION,
            messageId: messageId,
            data: { messageId: messageId }
          }).catch(err => {
        // Check if this is a user cancellation error
        const isUserCancellation = err.message && (
          err.message.includes('cancelled') ||
          err.message.includes('ESC') ||
          err.message.includes('user cancelled')
        );
        this.logger[isUserCancellation ? 'debug' : 'warn']('Failed to send cancellation message to background', err);
      });
        });
      });
    })).catch(err => {
      // Check if this is a user cancellation error
      const isUserCancellation = err.message && (
        err.message.includes('cancelled') ||
        err.message.includes('ESC') ||
        err.message.includes('user cancelled')
      );
      this.logger[isUserCancellation ? 'debug' : 'warn']('Error sending cancellation messages', err);
    });

    this.uiManager.dismissStatusNotification();
  }

  /**
   * Handle streaming error (delegated to error handler service)
   */
  _handleStreamingError(messageId, error) {
    return this.errorHandlerService.handleStreamingError(messageId, error);
  }

  /**
   * Retry with fallback provider (delegated to error handler service)
   */
  async retryWithFallbackProvider(messageId, jsonPayload, originalError) {
    return await this.errorHandlerService.retryWithFallbackProvider(messageId, jsonPayload, originalError);
  }

  /**
   * Get debug info (aggregated from all services)
   */
  getDebugInfo() {
    return {
      ...this.requestManager.getDebugInfo(),
      ...this.streamingEngine.getStreamingStats(),
      ...this.errorHandlerService.getErrorStats(),
      ...this.uiManager.getUIStats()
    };
  }

  /**
   * Get the current active message ID (delegated to request manager)
   */
  getCurrentMessageId() {
    return this.requestManager.getCurrentMessageId();
  }

  /**
   * Check if a message ID was cancelled by user (delegated to request manager)
   */
  isUserCancelled(messageId) {
    return this.requestManager.isUserCancelled(messageId);
  }

  /**
   * Check if this orchestrator instance is active
   */
  isActive() {
    // Check if SelectElementManager is accessible and active
    if (window.selectElementManagerInstance) {
      return window.selectElementManagerInstance.isActive;
    }
    return false;
  }

  /**
   * Trigger post-translation cleanup (delegated to UI manager)
   */
  triggerPostTranslationCleanup() {
    return this.uiManager.triggerPostTranslationCleanup();
  }

  /**
   * Cleanup method - orchestrates cleanup of all services
   */
  async cleanup() {
    this.logger.debug('Starting TranslationOrchestrator cleanup');

    // Cancel all translations first
    this.cancelAllTranslations();

    // Cleanup all services in reverse order
    this.uiManager.cleanup();
    this.errorHandlerService.cleanup();
    this.streamingEngine.cleanup();
    this.requestManager.cleanup();

    // Use ResourceTracker cleanup for automatic resource management
    super.cleanup();

    this.logger.debug('TranslationOrchestrator cleanup completed');
  }
}