/**
 * Unified Translation Service - Centralized coordination for all translation operations
 *
 * This service provides a single point of coordination for translation requests,
 * eliminating duplicate processing and ensuring consistent behavior across all translation modes.
 *
 * Architecture:
 * - RequestTracker: Tracks all active translation requests
 * - ResultDispatcher: Handles result delivery with duplicate prevention
 * - ModeCoordinator: Manages mode-specific behaviors
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { TranslationMode } from '@/shared/config/config.js';
import { MessageFormat } from '@/shared/messaging/core/MessagingCore.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'UnifiedTranslationService');

/**
 * Translation Request Status
 */
const RequestStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * Unified Translation Service
 */
export class UnifiedTranslationService {
  constructor() {
    // Initialize components
    this.requestTracker = new TranslationRequestTracker();
    this.resultDispatcher = new TranslationResultDispatcher();
    this.modeCoordinator = new TranslationModeCoordinator();

    // Service references (to be injected)
    this.translationEngine = null;
    this.backgroundService = null;

    logger.info('UnifiedTranslationService initialized');
  }

  /**
   * Initialize service dependencies
   */
  initialize({ translationEngine, backgroundService }) {
    this.translationEngine = translationEngine;
    this.backgroundService = backgroundService;

    logger.info('UnifiedTranslationService dependencies initialized');
  }

  /**
   * Main entry point for all translation requests
   */
  async handleTranslationRequest(message, sender) {
    const { messageId, data } = message;

    logger.info(`[UnifiedService] Processing translation request: ${messageId}`);

    try {
      // Validate message
      if (!MessageFormat.validate(message)) {
        throw new Error(`Invalid message format: ${JSON.stringify(message)}`);
      }

      // Check for duplicate request
      const existingRequest = this.requestTracker.getRequest(messageId);
      if (existingRequest) {
        logger.debug(`[UnifiedService] Duplicate request detected: ${messageId}`);
        return existingRequest.status === RequestStatus.COMPLETED
          ? existingRequest.result
          : { success: false, error: 'Request already processing' };
      }

      // Create new request record
      const request = this.requestTracker.createRequest({
        messageId,
        data,
        sender,
        timestamp: Date.now()
      });

      // Process based on translation mode
      const result = await this.modeCoordinator.processRequest(request, {
        translationEngine: this.translationEngine,
        backgroundService: this.backgroundService
      });

      // Update request status
      this.requestTracker.updateRequest(messageId, {
        status: result.success ? RequestStatus.COMPLETED : RequestStatus.FAILED,
        result
      });

      // For field mode, return result directly without dispatching
      // For other modes, dispatch result
      if (request.mode === TranslationMode.Field) {
        logger.debug(`[UnifiedService] Field mode - returning result directly`);
        return result;
      }

      // Dispatch result for non-field modes
      await this.resultDispatcher.dispatchResult({
        messageId,
        result,
        request,
        originalMessage: message
      });

      return result;

    } catch (error) {
      logger.error('[UnifiedService] Translation request failed:', error);

      // Update request status
      this.requestTracker.updateRequest(messageId, {
        status: RequestStatus.FAILED,
        result: { success: false, error: error.message }
      });

      return MessageFormat.createErrorResponse(error, messageId);
    }
  }

  /**
   * Handle streaming translation updates
   */
  async handleStreamingUpdate(message) {
    const { messageId, data } = message;

    logger.debug(`[UnifiedService] Streaming update: ${messageId}`);

    // Forward to result dispatcher for streaming handling
    await this.resultDispatcher.dispatchStreamingUpdate({
      messageId,
      data,
      request: this.requestTracker.getRequest(messageId)
    });
  }

  /**
   * Cancel an active translation request
   */
  async cancelRequest(messageId) {
    logger.info(`[UnifiedService] Cancelling request: ${messageId}`);

    const request = this.requestTracker.getRequest(messageId);
    if (!request) {
      return { success: false, error: 'Request not found' };
    }

    // Update status
    this.requestTracker.updateRequest(messageId, {
      status: RequestStatus.CANCELLED
    });

    // Cancel in translation engine
    if (this.translationEngine) {
      this.translationEngine.cancelTranslation(messageId);
    }

    // Notify result dispatcher
    await this.resultDispatcher.dispatchCancellation({
      messageId,
      request
    });

    return { success: true };
  }

  /**
   * Clean up completed requests (periodic maintenance)
   */
  cleanup() {
    const count = this.requestTracker.cleanup();
    if (count > 0) {
      logger.debug(`[UnifiedService] Cleaned up ${count} completed requests`);
    }
  }
}

/**
 * Translation Request Tracker
 * Manages the lifecycle of translation requests
 */
class TranslationRequestTracker {
  constructor() {
    this.requests = new Map(); // messageId -> request data
    this.cleanupInterval = null;

    // Start periodic cleanup
    this.startCleanup();
  }

  /**
   * Create a new request record
   */
  createRequest({ messageId, data, sender, timestamp }) {
    const request = {
      messageId,
      data,
      sender,
      timestamp,
      status: RequestStatus.PENDING,
      mode: this.detectTranslationMode(data),
      elementData: this.extractElementData(data),
      result: null
    };

    this.requests.set(messageId, request);
    logger.debug(`[RequestTracker] Created request: ${messageId}`);

    return request;
  }

  /**
   * Get request by ID
   */
  getRequest(messageId) {
    return this.requests.get(messageId);
  }

  /**
   * Update request data
   */
  updateRequest(messageId, updates) {
    const request = this.requests.get(messageId);
    if (request) {
      Object.assign(request, updates);
    }
  }

  /**
   * Detect translation mode from request data
   */
  detectTranslationMode(data) {
    if (data?.mode === TranslationMode.Field || data?.translationMode === TranslationMode.Field) {
      return TranslationMode.Field;
    }
    if (data?.context === 'select-element') {
      return 'select-element';
    }
    return data?.mode || 'unknown';
  }

  /**
   * Extract element data for recovery
   */
  extractElementData(data) {
    return {
      targetId: data?.elementId,
      targetSelector: data?.elementSelector,
      toastId: data?.toastId,
      selectionRange: data?.selectionRange
    };
  }

  /**
   * Clean up old completed requests
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    let cleaned = 0;
    for (const [messageId, request] of this.requests.entries()) {
      if (request.status === RequestStatus.COMPLETED ||
          request.status === RequestStatus.FAILED ||
          request.status === RequestStatus.CANCELLED) {
        if (now - request.timestamp > maxAge) {
          this.requests.delete(messageId);
          cleaned++;
        }
      }
    }

    return cleaned;
  }

  /**
   * Start periodic cleanup
   */
  startCleanup() {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Clean up every minute
  }

  /**
   * Stop cleanup
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

/**
 * Translation Result Dispatcher
 * Handles delivery of translation results with duplicate prevention
 */
class TranslationResultDispatcher {
  constructor() {
    this.processedResults = new Set(); // Set of processed messageIds
    this.resultQueue = new Map(); // messageId -> result data
  }

  /**
   * Dispatch translation result
   */
  async dispatchResult({ messageId, result, request, originalMessage }) {
    // Check for duplicate result processing
    if (this.processedResults.has(messageId)) {
      logger.debug(`[ResultDispatcher] Result already processed: ${messageId}`);
      return;
    }

    // Mark as processed
    this.processedResults.add(messageId);

    // Clean up old processed results (prevent memory leak)
    if (this.processedResults.size > 1000) {
      const oldest = this.processedResults.values().next().value;
      this.processedResults.delete(oldest);
    }

    // Dispatch based on mode
    if (request.mode === TranslationMode.Field) {
      await this.dispatchFieldResult({ messageId, result, request, originalMessage });
    } else if (request.mode === 'select-element') {
      await this.dispatchSelectElementResult({ messageId, result, request, originalMessage });
    } else {
      // For other modes, return directly
      logger.debug(`[ResultDispatcher] Direct return for mode: ${request.mode}`);
    }
  }

  /**
   * Dispatch field mode translation result
   */
  async dispatchFieldResult({ messageId, result, request, originalMessage }) {
    logger.debug(`[ResultDispatcher] Dispatching field result: ${messageId}`);

    // Send back to original tab
    try {
      const response = await browser.tabs.sendMessage(request.sender.tab.id, {
        action: MessageActions.TRANSLATION_RESULT_UPDATE,
        messageId,
        data: {
          ...result,
          translationMode: TranslationMode.Field,  // Use translationMode to match ContentMessageHandler
          context: 'field-mode',
          elementData: request.elementData
          // Note: Not marking as direct response for field mode - need to process in content script
        }
      });

      if (response?.handled) {
        logger.debug(`[ResultDispatcher] Field result handled: ${messageId}`);
      }
    } catch (error) {
      logger.warn(`[ResultDispatcher] Failed to dispatch field result:`, error);
    }
  }

  /**
   * Dispatch select-element translation result
   */
  async dispatchSelectElementResult({ messageId, result, request, originalMessage }) {
    logger.debug(`[ResultDispatcher] Dispatching select-element result: ${messageId}`);

    // For select-element, we might need broadcast
    if (result.streaming || (result.translatedText && result.translatedText.length > 2000)) {
      await this.broadcastResult({ messageId, result, request });
    }
  }

  /**
   * Broadcast result to all tabs (for streaming/large content)
   */
  async broadcastResult({ messageId, result, request }) {
    logger.debug(`[ResultDispatcher] Broadcasting result: ${messageId}`);

    const tabs = await browser.tabs.query({});

    for (const tab of tabs) {
      try {
        await browser.tabs.sendMessage(tab.id, {
          action: MessageActions.TRANSLATION_RESULT_UPDATE,
          messageId,
          data: {
            ...result,
            translationMode: request?.mode || result?.translationMode || 'unknown',  // Include the mode
            context: 'broadcast',
            isBroadcast: true // Mark as broadcast to prevent duplicate processing
          }
        });
      } catch (error) {
        // Tab might not have content script, ignore
      }
    }
  }

  /**
   * Handle streaming updates
   */
  async dispatchStreamingUpdate({ messageId, data, request }) {
    // Only forward if request exists and is still active
    if (request && request.status === RequestStatus.PROCESSING) {
      await this.broadcastResult({
        messageId,
        result: { streaming: true, ...data },
        request
      });
    }
  }

  /**
   * Handle cancellation
   */
  async dispatchCancellation({ messageId, request }) {
    // Notify original tab about cancellation
    if (request?.sender?.tab?.id) {
      try {
        await browser.tabs.sendMessage(request.sender.tab.id, {
          action: MessageActions.TRANSLATION_CANCELLED,
          messageId
        });
      } catch (error) {
        logger.warn(`[ResultDispatcher] Failed to send cancellation:`, error);
      }
    }
  }
}

/**
 * Translation Mode Coordinator
 * Manages mode-specific translation behaviors
 */
class TranslationModeCoordinator {
  /**
   * Process request based on mode
   */
  async processRequest(request, { translationEngine }) {
    const { messageId, data, mode } = request;

    logger.debug(`[ModeCoordinator] Processing ${mode} request: ${messageId}`);

    // Update request status
    request.status = RequestStatus.PROCESSING;

    // Route to appropriate handler
    switch (mode) {
      case TranslationMode.Field:
        return await this.processFieldTranslation(request, { translationEngine });

      case 'select-element':
        return await this.processSelectElementTranslation(request, { translationEngine });

      default:
        return await this.processStandardTranslation(request, { translationEngine });
    }
  }

  /**
   * Process field mode translation
   */
  async processFieldTranslation(request, { translationEngine }) {
    logger.debug(`[ModeCoordinator] Processing field translation: ${request.messageId}`);

    // Use translation engine directly
    if (!translationEngine) {
      throw new Error('Translation engine not available');
    }

    // Create the expected message format for translation engine
    const messageForEngine = {
      action: MessageActions.TRANSLATE,
      messageId: request.messageId,
      context: 'content', // Add required context
      data: request.data
    };

    const result = await translationEngine.handleTranslateMessage(messageForEngine, request.sender);

    return result;
  }

  /**
   * Process select-element translation
   */
  async processSelectElementTranslation(request, { translationEngine }) {
    logger.debug(`[ModeCoordinator] Processing select-element translation: ${request.messageId}`);

    // For select-element, always use streaming for better UX
    const enhancedData = {
      ...request.data,
      options: {
        ...request.data.options,
        forceStreaming: true
      }
    };

    const result = await translationEngine.handleTranslateMessage({
      action: MessageActions.TRANSLATE,
      messageId: request.messageId,
      context: 'content', // Add required context
      data: enhancedData
    }, request.sender);

    return result;
  }

  /**
   * Process standard translation
   */
  async processStandardTranslation(request, { translationEngine }) {
    logger.debug(`[ModeCoordinator] Processing standard translation: ${request.messageId}`);

    const result = await translationEngine.handleTranslateMessage({
      action: MessageActions.TRANSLATE,
      messageId: request.messageId,
      context: 'content', // Add required context
      data: request.data
    }, request.sender);

    return result;
  }
}

// Export singleton instance
export const unifiedTranslationService = new UnifiedTranslationService();