import { getScopedLogger } from "../../../../shared/logging/logger.js";
import { LOG_COMPONENTS } from "../../../../shared/logging/logConstants.js";
import { generateContentMessageId } from "@/utils/messaging/messageId.js";

/**
 * Manages translation request lifecycle and state
 * Handles request creation, tracking, status management, and cleanup
 */
export class TranslationRequestManager {
  constructor(orchestrator) {
    this.orchestrator = orchestrator;
    this.logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'TranslationRequestManager');

    // Core state management
    this.translationRequests = new Map();
    this.userCancelledRequests = new Set();

    // Cleanup tracking
    this.cleanupInterval = null;
  }

  /**
   * Initialize the request manager
   */
  initialize() {
    this.logger.debug('TranslationRequestManager initialized');

    // Set up periodic cleanup of old timeout requests (every 5 minutes)
    this.cleanupInterval = this.orchestrator.trackInterval(() => {
      this.cleanupOldTimeoutRequests();
    }, 5 * 60 * 1000);
  }

  /**
   * Create a new translation request
   * @param {Object} requestData - Request data including element, texts, etc.
   * @param {string} context - Translation context
   * @returns {string} Message ID for the request
   */
  createRequest(requestData, context = 'select-element') {
    const messageId = generateContentMessageId();

    const request = {
      id: messageId,
      status: 'pending',
      timestamp: Date.now(),
      context,
      hasErrors: false,
      lastError: null,
      translatedSegments: new Map(),
      ...requestData
    };

    this.translationRequests.set(messageId, request);
    this.logger.debug('Created translation request', { messageId, context });

    return messageId;
  }

  /**
   * Create a streaming request with full data
   */
  createStreamingRequest(messageId, requestData) {
    const request = {
      id: messageId,
      status: 'pending',
      timestamp: Date.now(),
      hasErrors: false,
      lastError: null,
      translatedSegments: new Map(),
      ...requestData
    };

    this.translationRequests.set(messageId, request);
    this.logger.debug('Created streaming translation request', { messageId });
  }

  /**
   * Create a non-streaming request with minimal data
   */
  createDirectRequest(messageId, requestData) {
    const request = {
      id: messageId,
      status: 'pending',
      timestamp: Date.now(),
      translatedSegments: new Map(),
      ...requestData
    };

    this.translationRequests.set(messageId, request);
    this.logger.debug('Created direct translation request', { messageId });
  }

  /**
   * Get request by ID
   * @param {string} messageId - Message ID
   * @returns {Object|null} Request object or null
   */
  getRequest(messageId) {
    return this.translationRequests.get(messageId) || null;
  }

  /**
   * Update request status
   * @param {string} messageId - Message ID
   * @param {string} status - New status
   * @param {Object} additionalData - Additional data to merge
   */
  updateRequestStatus(messageId, status, additionalData = {}) {
    const request = this.translationRequests.get(messageId);
    if (!request) {
      this.logger.warn('Attempted to update non-existent request', { messageId, status });
      return;
    }

    request.status = status;
    Object.assign(request, additionalData);

    this.logger.debug('Updated request status', { messageId, status, timestamp: Date.now() });
  }

  /**
   * Mark request as having errors
   * @param {string} messageId - Message ID
   * @param {Error} error - Error object
   */
  markRequestError(messageId, error) {
    const request = this.translationRequests.get(messageId);
    if (!request) return;

    request.hasErrors = true;
    request.lastError = error;

    this.logger.debug('Marked request with error', {
      messageId,
      errorMessage: error.message,
      errorType: error.type
    });
  }

  /**
   * Mark a request as cancelled by user
   * @param {string} messageId - Message ID
   */
  markUserCancelled(messageId) {
    this.userCancelledRequests.add(messageId);
    this.logger.debug('Marked request as user cancelled', { messageId });
  }

  /**
   * Check if request was cancelled by user
   * @param {string} messageId - Message ID
   * @returns {boolean} True if user cancelled
   */
  isUserCancelled(messageId) {
    return this.userCancelledRequests.has(messageId);
  }

  /**
   * Cancel a specific translation request
   * @param {string} messageId - Message ID to cancel
   */
  cancelRequest(messageId) {
    this.logger.debug(`Cancelling translation request: ${messageId}`);

    const request = this.translationRequests.get(messageId);
    if (!request) {
      this.logger.debug(`No active request found for messageId: ${messageId}`);
      return;
    }

    if (request.status === 'pending') {
      request.status = 'cancelled';
      request.error = 'Translation cancelled by user';
      this.logger.debug(`Cancelled request: ${messageId}`);
    }
  }

  /**
   * Cancel all pending requests
   */
  cancelAllRequests() {
    this.logger.operation("Cancelling all ongoing translation requests");

    // Mark all requests as user-cancelled
    for (const [messageId] of this.translationRequests) {
      this.userCancelledRequests.add(messageId);
    }

    // Cancel all pending requests
    const requestsToCancel = [];
    for (const [messageId, request] of this.translationRequests) {
      if (request.status === 'pending') {
        request.status = 'cancelled';
        request.error = 'Translation cancelled by user';
        requestsToCancel.push(messageId);
        this.logger.debug('Cancelled request:', messageId);
      }
    }

    this.logger.debug('Cancelled requests', {
      totalRequests: this.translationRequests.size,
      cancelledCount: requestsToCancel.length,
      requestIds: requestsToCancel
    });

    return requestsToCancel;
  }

  /**
   * Remove a request from tracking
   * @param {string} messageId - Message ID to remove
   */
  removeRequest(messageId) {
    const removed = this.translationRequests.delete(messageId);
    if (removed) {
      this.logger.debug('Removed request from tracking', { messageId });
    }
    return removed;
  }

  /**
   * Get the currently active message ID (first pending request)
   * @returns {string|null} Active message ID or null
   */
  getActiveMessageId() {
    for (const [messageId, request] of this.translationRequests) {
      if (request.status === 'pending') {
        return messageId;
      }
    }
    return null;
  }

  /**
   * Get the most recent message ID
   * @returns {string|null} Current message ID
   */
  getCurrentMessageId() {
    const activeRequests = Array.from(this.translationRequests.keys());
    return activeRequests.length > 0 ? activeRequests[activeRequests.length - 1] : null;
  }

  /**
   * Check if there are any active requests
   * @returns {boolean} True if there are pending requests
   */
  hasActiveRequests() {
    return Array.from(this.translationRequests.values())
      .some(req => req.status === 'pending');
  }

  /**
   * Get all requests with a specific status
   * @param {string} status - Status to filter by
   * @returns {Array} Array of requests with the specified status
   */
  getRequestsWithStatus(status) {
    return Array.from(this.translationRequests.values())
      .filter(req => req.status === status);
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
   * Get debug information about current requests
   * @returns {Object} Debug info
   */
  getDebugInfo() {
    const requests = Array.from(this.translationRequests.values());
    return {
      activeRequests: this.translationRequests.size,
      pendingRequests: requests.filter(r => r.status === 'pending').length,
      cancelledRequests: requests.filter(r => r.status === 'cancelled').length,
      timeoutRequests: requests.filter(r => r.status === 'timeout').length,
      completedRequests: requests.filter(r => r.status === 'completed').length,
      userCancelledRequests: this.userCancelledRequests.size,
      requestIds: Array.from(this.translationRequests.keys())
    };
  }

  /**
   * Clear all user cancellation tracking
   */
  clearUserCancelledRequests() {
    this.userCancelledRequests.clear();
    this.logger.debug('Cleared user cancelled requests tracking');
  }

  /**
   * Cleanup method for request manager
   */
  cleanup() {
    this.cancelAllRequests();
    this.translationRequests.clear();
    this.clearUserCancelledRequests();

    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.logger.debug('TranslationRequestManager cleanup completed');
  }
}