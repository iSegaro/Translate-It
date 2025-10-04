/**
 * Translation Request Tracker - Specialized service for tracking translation requests
 *
 * This service provides comprehensive tracking of all translation requests throughout
 * their lifecycle, with resilient storage and recovery capabilities.
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { TranslationMode } from '@/shared/config/config.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'TranslationRequestTracker');

/**
 * Request Status Constants
 */
export const RequestStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  STREAMING: 'streaming',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  TIMEOUT: 'timeout'
};

/**
 * Request Priority Levels
 */
export const RequestPriority = {
  HIGH: 'high',      // Field mode, user interactions
  NORMAL: 'normal',   // Standard translations
  LOW: 'low',        // Background/batch translations
  BACKGROUND: 'background' // Non-urgent translations
};

/**
 * Translation Request Tracker
 */
export class TranslationRequestTracker {
  constructor() {
    // Primary storage
    this.requests = new Map(); // messageId -> request object
    this.tabRequests = new Map(); // tabId -> Set<messageId>
    this.toastRequests = new Map(); // toastId -> messageId
    this.elementRequests = new WeakMap(); // DOM element -> messageId

    // Performance monitoring
    this.requestTimes = new Map(); // messageId -> timestamp
    this.retryCounts = new Map(); // messageId -> retry count

    // Statistics
    this.stats = {
      totalCreated: 0,
      totalCompleted: 0,
      totalFailed: 0,
      totalCancelled: 0,
      totalTimeouts: 0,
      averageProcessingTime: 0
    };

    // Cleanup
    this.cleanupInterval = null;
    this.startCleanup();

    logger.debug('TranslationRequestTracker initialized');
  }

  /**
   * Create and track a new translation request
   */
  createRequest({ messageId, data, sender, options = {} }) {
    const request = {
      messageId,
      data,
      sender,
      status: RequestStatus.PENDING,
      priority: options.priority || this.determinePriority(data),
      mode: this.detectMode(data),
      timestamp: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      elementData: this.extractElementData(data),
      metadata: {
        source: sender?.tab?.url || 'unknown',
        tabId: sender?.tab?.id,
        frameId: sender?.frameId,
        toastId: data?.toastId,
        selectionRange: data?.selectionRange,
        originalText: data?.text,
        targetLanguage: data?.targetLanguage,
        provider: data?.provider
      }
    };

    // Store in primary index
    this.requests.set(messageId, request);

    // Index by tab
    if (sender?.tab?.id) {
      if (!this.tabRequests.has(sender.tab.id)) {
        this.tabRequests.set(sender.tab.id, new Set());
      }
      this.tabRequests.get(sender.tab.id).add(messageId);
    }

    // Index by toast ID
    if (data?.toastId) {
      this.toastRequests.set(data.toastId, messageId);
    }

    // Track processing start time
    this.requestTimes.set(messageId, Date.now());

    // Update statistics
    this.stats.totalCreated++;

    return request;
  }

  /**
   * Get request by ID
   */
  getRequest(messageId) {
    return this.requests.get(messageId);
  }

  /**
   * Get all requests for a specific tab
   */
  getTabRequests(tabId) {
    const requestIds = this.tabRequests.get(tabId) || new Set();
    return Array.from(requestIds)
      .map(id => this.requests.get(id))
      .filter(Boolean);
  }

  /**
   * Get request by toast ID
   */
  getRequestByToastId(toastId) {
    const messageId = this.toastRequests.get(toastId);
    return messageId ? this.requests.get(messageId) : null;
  }

  /**
   * Update request status and data
   */
  updateRequest(messageId, updates) {
    const request = this.requests.get(messageId);
    if (!request) {
      logger.warn(`[RequestTracker] Attempted to update non-existent request: ${messageId}`);
      return false;
    }

    // Apply updates
    Object.assign(request, updates, { updatedAt: Date.now() });

    return true;
  }

  /**
   * Complete a request and immediately remove it from tracking
   */
  completeRequest(messageId, result) {
    const request = this.requests.get(messageId);
    if (!request) {
      logger.warn(`[RequestTracker] Attempted to complete non-existent request: ${messageId}`);
      return false;
    }

    // Update status based on result
    const status = result?.success ? RequestStatus.COMPLETED : RequestStatus.FAILED;

    // Apply final updates
    Object.assign(request, {
      status,
      result,
      updatedAt: Date.now(),
      completedAt: Date.now()
    });

    // Immediately remove from all tracking structures
    this.requests.delete(messageId);
    this.requestTimes.delete(messageId);
    this.retryCounts.delete(messageId);

    // Remove from tab index
    if (request.sender?.tab?.id) {
      const tabRequests = this.tabRequests.get(request.sender.tab.id);
      if (tabRequests) {
        tabRequests.delete(messageId);
        if (tabRequests.size === 0) {
          this.tabRequests.delete(request.sender.tab.id);
        }
      }
    }

    // Remove from toast index
    if (request.metadata?.toastId) {
      this.toastRequests.delete(request.metadata.toastId);
    }

    // Update statistics
    if (status === RequestStatus.COMPLETED) {
      this.stats.totalCompleted++;
    } else {
      this.stats.totalFailed++;
    }

    return true;
  }

  /**
   * Check if request is still active
   */
  isRequestActive(messageId) {
    const request = this.requests.get(messageId);
    if (!request) return false;

    const activeStatuses = [
      RequestStatus.PENDING,
      RequestStatus.PROCESSING,
      RequestStatus.STREAMING
    ];

    return activeStatuses.includes(request.status);
  }

  /**
   * Check if request can be cancelled
   */
  canCancelRequest(messageId) {
    const request = this.requests.get(messageId);
    if (!request) return false;

    return this.isRequestActive(messageId) && !request.metadata?.preventCancel;
  }

  /**
   * Cancel a request
   */
  cancelRequest(messageId, reason = 'user_cancelled') {
    const request = this.requests.get(messageId);
    if (!request) {
      return { success: false, error: 'Request not found' };
    }

    if (!this.canCancelRequest(messageId)) {
      return { success: false, error: 'Request cannot be cancelled' };
    }

    // Update status
    this.updateRequest(messageId, {
      status: RequestStatus.CANCELLED,
      cancelReason: reason,
      cancelledAt: Date.now()
    });

    // Update statistics
    this.stats.totalCancelled++;

    logger.info(`[RequestTracker] Cancelled request: ${messageId}`, { reason });

    return { success: true, request };
  }

  /**
   * Mark request as timed out
   */
  markTimeout(messageId) {
    const request = this.requests.get(messageId);
    if (!request) return false;

    this.updateRequest(messageId, {
      status: RequestStatus.TIMEOUT,
      timeoutAt: Date.now()
    });

    // Update statistics
    this.stats.totalTimeouts++;

    logger.warn(`[RequestTracker] Request timed out: ${messageId}`);
    return true;
  }

  /**
   * Record retry attempt
   */
  recordRetry(messageId) {
    const count = this.retryCounts.get(messageId) || 0;
    this.retryCounts.set(messageId, count + 1);

    this.updateRequest(messageId, {
      retryCount: count + 1,
      lastRetryAt: Date.now()
    });

    logger.debug(`[RequestTracker] Retry ${count + 1} for request: ${messageId}`);
  }

  /**
   * Get retry count for request
   */
  getRetryCount(messageId) {
    return this.retryCounts.get(messageId) || 0;
  }

  /**
   * Check if request has exceeded max retries
   */
  hasExceededMaxRetries(messageId, maxRetries = 3) {
    return this.getRetryCount(messageId) >= maxRetries;
  }

  /**
   * Get request processing time
   */
  getProcessingTime(messageId) {
    const request = this.requests.get(messageId);
    if (!request) return null;

    const startTime = this.requestTimes.get(messageId);
    if (!startTime) return null;

    if (request.status === RequestStatus.COMPLETED ||
        request.status === RequestStatus.FAILED ||
        request.status === RequestStatus.CANCELLED ||
        request.status === RequestStatus.TIMEOUT) {
      return request.updatedAt - startTime;
    }

    // Still processing
    return Date.now() - startTime;
  }

  /**
   * Detect translation mode from request data
   */
  detectMode(data) {
    if (!data) return 'unknown';

    // Check explicit mode
    if (data.mode === TranslationMode.Field || data.translationMode === TranslationMode.Field) {
      return TranslationMode.Field;
    }

    // Check context
    if (data.context === 'select-element') {
      return 'select-element';
    }

    // Infer from other properties
    if (data.elementId || data.elementSelector) {
      return TranslationMode.Field;
    }

    return data.mode || 'standard';
  }

  /**
   * Determine request priority
   */
  determinePriority(data) {
    // Field mode is high priority
    if (data?.mode === TranslationMode.Field || data?.translationMode === TranslationMode.Field) {
      return RequestPriority.HIGH;
    }

    // User-initiated translations
    if (data?.context === 'select-element' || data?.source === 'user') {
      return RequestPriority.HIGH;
    }

    // Standard translations
    return RequestPriority.NORMAL;
  }

  /**
   * Extract element data for recovery
   */
  extractElementData(data) {
    if (!data) return null;

    return {
      id: data.elementId,
      selector: data.elementSelector,
      tagName: data.elementTagName,
      className: data.elementClassName,
      toastId: data.toastId,
      selectionRange: data.selectionRange,
      // Additional recovery data
      recoveryStrategy: this.determineRecoveryStrategy(data)
    };
  }

  /**
   * Determine element recovery strategy
   */
  determineRecoveryStrategy(data) {
    if (data.elementId) return 'id';
    if (data.elementSelector) return 'selector';
    if (data.toastId) return 'toast';
    return 'none';
  }

  /**
   * Associate request with DOM element
   */
  associateWithElement(messageId, element) {
    if (element && typeof element === 'object') {
      this.elementRequests.set(element, messageId);
    }
  }

  /**
   * Find request by DOM element
   */
  findRequestByElement(element) {
    return this.elementRequests.get(element);
  }

  /**
   * Get all active requests
   */
  getActiveRequests() {
    return Array.from(this.requests.values())
      .filter(req => this.isRequestActive(req.messageId));
  }

  /**
   * Get requests by status
   */
  getRequestsByStatus(status) {
    return Array.from(this.requests.values())
      .filter(req => req.status === status);
  }

  /**
   * Get request statistics
   */
  getStatistics() {
    const activeRequests = this.getActiveRequests();
    const processingTimes = Array.from(this.requests.values())
      .filter(req => req.status === RequestStatus.COMPLETED)
      .map(req => this.getProcessingTime(req.messageId))
      .filter(Boolean);

    const avgTime = processingTimes.length > 0
      ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
      : 0;

    return {
      ...this.stats,
      activeRequests: activeRequests.length,
      averageProcessingTime: Math.round(avgTime),
      pendingRequests: this.getRequestsByStatus(RequestStatus.PENDING).length,
      processingRequests: this.getRequestsByStatus(RequestStatus.PROCESSING).length,
      streamingRequests: this.getRequestsByStatus(RequestStatus.STREAMING).length,
      totalTracked: this.requests.size
    };
  }

  /**
   * Clean up old requests
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes for completed/failed
    const activeMaxAge = 30 * 60 * 1000; // 30 minutes for active (stuck)

    let cleaned = 0;

    for (const [messageId, request] of this.requests.entries()) {
      const age = now - request.updatedAt;
      const shouldRemove = (
        (request.status === RequestStatus.COMPLETED && age > maxAge) ||
        (request.status === RequestStatus.FAILED && age > maxAge) ||
        (request.status === RequestStatus.CANCELLED && age > maxAge) ||
        (request.status === RequestStatus.TIMEOUT && age > maxAge) ||
        (this.isRequestActive(messageId) && age > activeMaxAge)
      );

      if (shouldRemove) {
        // Remove from indexes
        this.requests.delete(messageId);
        this.requestTimes.delete(messageId);
        this.retryCounts.delete(messageId);

        // Remove from tab index
        if (request.sender?.tab?.id) {
          const tabSet = this.tabRequests.get(request.sender.tab.id);
          if (tabSet) {
            tabSet.delete(messageId);
            if (tabSet.size === 0) {
              this.tabRequests.delete(request.sender.tab.id);
            }
          }
        }

        // Remove from toast index
        if (request.metadata?.toastId) {
          this.toastRequests.delete(request.metadata.toastId);
        }

        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`[RequestTracker] Cleaned up ${cleaned} old requests`);
    }

    return cleaned;
  }

  /**
   * Start automatic cleanup
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

  /**
   * Export request data for debugging
   */
  exportDebugData() {
    return {
      requests: Array.from(this.requests.entries()),
      stats: this.getStatistics(),
      timestamp: Date.now()
    };
  }

  /**
   * Clear all tracking data (for testing)
   */
  clear() {
    this.requests.clear();
    this.tabRequests.clear();
    this.toastRequests.clear();
    this.elementRequests = new WeakMap();
    this.requestTimes.clear();
    this.retryCounts.clear();
  }
}

// Export singleton instance
export const translationRequestTracker = new TranslationRequestTracker();