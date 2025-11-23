import { getScopedLogger } from "../../../../shared/logging/logger.js";
import { LOG_COMPONENTS } from "../../../../shared/logging/logConstants.js";
import { TranslationMode } from "@/shared/config/config.js";
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import { calculateDynamicTimeout } from "../../utils/timeoutCalculator.js";
import { TIMEOUT_CONFIG, TRANSLATION_TIMEOUT_FALLBACK } from "../constants/selectElementConstants.js";
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { sendMessage, sendRegularMessage } from "@/shared/messaging/core/UnifiedMessaging.js";
import { unifiedTranslationCoordinator } from '@/shared/messaging/core/UnifiedTranslationCoordinator.js';
import { createStreamingResponseHandler } from '@/shared/messaging/core/StreamingResponseHandler.js';
import { matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

/**
 * Handles streaming translation coordination and timeout management
 * Manages streaming decisions, request sending, and response processing
 */
export class StreamingTranslationEngine {
  constructor(orchestrator) {
    this.orchestrator = orchestrator;
    this.logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'StreamingTranslationEngine');

    // Initialize streaming response handler with coordinator integration
    this.streamingHandler = createStreamingResponseHandler(unifiedTranslationCoordinator);
  }

  /**
   * Determine if a translation should use streaming based on payload size
   * @param {string} jsonPayload - JSON payload to analyze
   * @returns {boolean} True if streaming should be used
   */
  isStreamingTranslation(jsonPayload) {
    // Use streaming for large payloads (>1000 characters) or multiple segments
    const payloadSize = jsonPayload.length;
    const STREAMING_THRESHOLD = 1000;

    // Check segment count as well
    let segmentCount = 1;
    try {
      const parsedPayload = JSON.parse(jsonPayload);
      segmentCount = Array.isArray(parsedPayload) ? parsedPayload.length : 1;
    } catch {
      this.logger.warn("Failed to parse JSON payload for streaming decision");
    }

    const shouldUseStreaming = payloadSize > STREAMING_THRESHOLD || segmentCount > 3;

    this.logger.debug(`Streaming decision: ${segmentCount} segments (${payloadSize} chars) → ${shouldUseStreaming ? 'streaming' : 'direct'}`);

    return shouldUseStreaming;
  }

  /**
   * Calculate dynamic timeout based on the number of segments to translate
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

    this.logger.debug(`Dynamic timeout calculated: ${segmentCount} segments → ${timeout}ms (${timeout/1000}s)`);
    return timeout;
  }

  /**
   * Send a direct (non-streaming) translation request
   * @param {string} messageId - Message ID
   * @param {string} jsonPayload - Translation payload
   * @param {string} context - Translation context
   * @returns {Promise<Object>} Translation result
   */
  async sendDirectTranslationRequest(messageId, jsonPayload, context = 'select-element') {
    try {
      // Check if translation was cancelled
      const request = this.orchestrator.requestManager.getRequest(messageId);
      if (request && request.status === 'cancelled') {
        this.logger.debug('[StreamingTranslationEngine] Translation cancelled before sending request');
        this.orchestrator.requestManager.removeRequest(messageId);
        return { success: false, error: 'Translation cancelled' };
      }

      const { getTranslationApiAsync, getTargetLanguageAsync } = await import("../../../../config.js");
      const provider = await getTranslationApiAsync();
      const targetLanguage = await getTargetLanguageAsync();

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

      this.logger.debug(`Sending direct translation request ${messageId} (${jsonPayload.length} chars)`);

      // Send request and wait for result
      const result = await sendRegularMessage(translationRequest);

      this.logger.debug(`Direct translation request ${messageId} completed: ${result?.success ? 'success' : 'failed'}`);

      return result;
    } catch (error) {
      // Log cancellation as debug instead of error using proper error management
      const errorType = matchErrorToType(error);
      if (errorType === ErrorTypes.USER_CANCELLED) {
        this.logger.debug("Direct translation request cancelled", error);
      } else {
        this.logger.error("Failed to send direct translation request", error);
      }
      throw error;
    }
  }

  /**
   * Send a streaming translation request
   * @param {string} messageId - Message ID
   * @param {string} jsonPayload - Translation payload
   * @param {string} context - Translation context
   * @returns {Promise<Object>} Translation result
   */
  async sendStreamingTranslationRequest(messageId, jsonPayload, context = 'select-element') {
    try {
      // Check if translation was cancelled
      const request = this.orchestrator.requestManager.getRequest(messageId);
      if (request && request.status === 'cancelled') {
        this.logger.debug('[StreamingTranslationEngine] Translation cancelled before sending request');
        this.orchestrator.requestManager.removeRequest(messageId);
        return { success: false, error: 'Translation cancelled' };
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

      this.logger.debug(`Sending unified translation request ${messageId} (${segmentCount} segments)`);

      // Register streaming response handler for this request
      this.streamingHandler.registerHandler(messageId, {
        onStreamUpdate: (data) => this.orchestrator.uiManager.handleStreamUpdate({ messageId, data }),
        onStreamEnd: (data) => this.orchestrator.uiManager.handleStreamEnd({ messageId, data }),
        onTranslationResult: (data) => this.orchestrator.uiManager.handleTranslationResult({ messageId, data }),
        onError: (error) => this.orchestrator.errorHandler._handleStreamingError(messageId, error)
      });

      // Check if operation was cancelled before sending the request
      if (request && request.status === 'cancelled') {
        this.logger.debug('[StreamingTranslationEngine] Translation cancelled, not sending request');
        return { success: false, error: 'Translation cancelled' };
      }

      // Send through unified messaging system (will coordinate streaming/regular)
      const result = await sendMessage(translationRequest);

      this.logger.debug(`Unified translation request ${messageId} completed: ${result?.success ? 'success' : 'failed'}`);

      // Return the result for non-streaming translations
      return result;
    } catch (error) {
      // Log cancellation as debug instead of error using proper error management
      const errorType = matchErrorToType(error);
      if (errorType === ErrorTypes.USER_CANCELLED) {
        this.logger.debug("Streaming translation request cancelled", error);
      } else {
        this.logger.error("Failed to send streaming translation request", error);
      }
      throw error;
    }
  }

  /**
   * Process streaming update data
   * @param {Object} message - Stream update message
   */
  processStreamUpdate(message) {
    const { messageId, data } = message;

    this.logger.debug(`Stream update ${messageId}: batch ${data?.batchIndex}, ${data?.data?.length || 0} segments`);

    // Delegate to UI manager for DOM updates
    return this.orchestrator.uiManager.processStreamUpdate(message);
  }

  /**
   * Process stream end data
   * @param {Object} message - Stream end message
   */
  processStreamEnd(message) {
    const { messageId, data } = message;

    this.logger.info("Translation stream finished for message:", messageId, {
      success: data?.success,
      error: data?.error,
      completed: data?.completed
    });

    // Delegate to UI manager for completion handling
    return this.orchestrator.uiManager.processStreamEnd(message);
  }

  /**
   * Handle timeout for a request
   * @param {string} messageId - Message ID that timed out
   */
  async handleTimeout(messageId) {
    this.logger.warn("Translation request timed out", { messageId });

    // Update request status to timeout
    const request = this.orchestrator.requestManager.getRequest(messageId);
    if (request) {
      this.orchestrator.requestManager.updateRequestStatus(messageId, 'timeout', {
        timeoutAt: Date.now()
      });

      // Show timeout notification
      await this.orchestrator.uiManager.showTimeoutNotification(messageId);
    }
  }

  /**
   * Check if a request should be retried based on timeout
   * @param {string} messageId - Message ID to check
   * @returns {boolean} True if should retry
   */
  shouldRetryTimeout(messageId) {
    const request = this.orchestrator.requestManager.getRequest(messageId);
    if (!request) return false;

    // Don't retry if already retried or cancelled
    if (request.retryAttempt || request.status === 'cancelled') {
      return false;
    }

    // Retry if timed out recently (within 30 seconds)
    const now = Date.now();
    const timeoutAge = request.timeoutAt ? now - request.timeoutAt : Infinity;

    return request.status === 'timeout' && timeoutAge < 30 * 1000;
  }

  /**
   * Get streaming statistics
   * @returns {Object} Streaming statistics
   */
  getStreamingStats() {
    const requests = this.orchestrator.requestManager;
    const activeRequests = requests.getRequestsWithStatus('pending');
    const timeoutRequests = requests.getRequestsWithStatus('timeout');

    return {
      activeStreamingRequests: activeRequests.length,
      timeoutRequests: timeoutRequests.length,
      streamingHandlerActive: this.streamingHandler ? true : false
    };
  }

  /**
   * Cleanup streaming engine
   */
  cleanup() {
    // Cleanup streaming handler
    if (this.streamingHandler) {
      this.streamingHandler.cleanup();
    }

    this.logger.debug('StreamingTranslationEngine cleanup completed');
  }
}