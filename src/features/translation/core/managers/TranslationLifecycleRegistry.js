/**
 * Translation Lifecycle Registry - Manages state of active translation requests
 * Handles registration, cancellation, duplicate detection, and cleanup of AbortControllers.
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'TranslationLifecycleRegistry');

export class TranslationLifecycleRegistry {
  constructor() {
    this.activeTranslations = new Map(); // Track active translations: messageId -> AbortController
    this.cancelledRequests = new Set(); // Track cancelled request messageIds
    this.recentRequests = new Map();     // Track recent requests to prevent duplicates
    this.streamingSenders = new Map();    // Track tab info for streaming: messageId -> sender
  }

  /**
   * Register a new translation request.
   * Creates an AbortController and performs duplicate detection.
   * 
   * @param {string} messageId - Unique ID for the message
   * @param {string} text - Content being translated (for duplicate detection)
   * @returns {AbortController} The controller for this request
   */
  registerRequest(messageId, text) {
    // Detect duplicates (brief window of 1 second)
    const requestId = `${messageId}:${text?.substring(0, 50)}`;
    if (this.recentRequests.has(requestId)) {
      const existing = this.recentRequests.get(requestId);
      if (Date.now() - existing.time < 1000) {
        logger.debug(`[LifecycleRegistry] Duplicate request detected for ID: ${messageId}`);
        return existing.controller;
      }
    }

    const abortController = new AbortController();
    this.activeTranslations.set(messageId, abortController);
    this.cancelledRequests.delete(messageId);
    
    // Store in recent for duplicate prevention
    this.recentRequests.set(requestId, { time: Date.now(), controller: abortController });
    
    // Cleanup old recent requests (keep memory lean)
    if (this.recentRequests.size > 100) {
      const firstKey = this.recentRequests.keys().next().value;
      this.recentRequests.delete(firstKey);
    }

    return abortController;
  }

  /**
   * Remove a request from active tracking (on success or failure).
   * 
   * @param {string} messageId - The request ID
   */
  unregisterRequest(messageId) {
    this.activeTranslations.delete(messageId);
    this.cancelledRequests.delete(messageId);
    this.streamingSenders.delete(messageId);
  }

  /**
   * Check if a request has been cancelled.
   * 
   * @param {string} messageId - The request ID
   * @returns {boolean}
   */
  isCancelled(messageId) {
    return this.cancelledRequests.has(messageId);
  }

  /**
   * Cancel a specific translation by ID.
   * 
   * @param {string} messageId - The request ID
   * @returns {Promise<boolean>} True if found and cancelled
   */
  async cancelTranslation(messageId) {
    if (!messageId) return false;

    this.cancelledRequests.add(messageId);
    
    if (this.activeTranslations.has(messageId)) {
      logger.info(`[LifecycleRegistry] Aborting active translation: ${messageId}`);
      this.activeTranslations.get(messageId).abort();
    }

    try {
      // Notify streaming manager to clean up resources
      const { streamingManager } = await import("../StreamingManager.js");
      await streamingManager.cancelStream(messageId, ErrorTypes.USER_CANCELLED);
    } catch { /* ignore */ }

    return true;
  }

  /**
   * Cancel all currently active translations.
   * 
   * @returns {Promise<number>} Number of cancelled translations
   */
  async cancelAllTranslations() {
    let cancelledCount = 0;
    
    for (const [messageId, abortController] of this.activeTranslations) {
      try {
        this.cancelledRequests.add(messageId);
        abortController.abort();
        cancelledCount++;
      } catch { /* ignore */ }
    }

    try {
      const { streamingManager } = await import("../StreamingManager.js");
      await streamingManager.cancelAllStreams('All translations cancelled by user');
    } catch { /* ignore */ }

    return cancelledCount;
  }

  /**
   * Get the AbortController for an active request.
   * 
   * @param {string} messageId - The request ID
   * @returns {AbortController|null}
   */
  getAbortController(messageId) {
    return this.activeTranslations.get(messageId) || null;
  }

  /**
   * Register sender info for streaming results back to the correct tab.
   * 
   * @param {string} messageId - Request ID
   * @param {object} sender - Tab sender info
   */
  registerStreamingSender(messageId, sender) {
    if (messageId && sender) {
      this.streamingSenders.set(messageId, sender);
    }
  }

  /**
   * Get sender info for a streaming request.
   * 
   * @param {string} messageId - Request ID
   * @returns {object|null}
   */
  getStreamingSender(messageId) {
    return this.streamingSenders.get(messageId) || null;
  }
}
