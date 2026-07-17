/**
 * Translation Lifecycle Registry - Manages state of active translation requests
 * Handles registration, cancellation, duplicate detection, and cleanup of AbortControllers.
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { streamingManager } from "../StreamingManager.js";
import { getTranslationInputPreview } from "../translationInputHelpers.js";

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'TranslationLifecycleRegistry');
// Retain out-of-order cancellation intent long enough for extension messaging to register its request.
const CANCELLATION_TOMBSTONE_TTL_MS = 60_000;

export class TranslationLifecycleRegistry {
  constructor() {
    this.activeTranslations = new Map(); // Track active translations: messageId -> { controller: AbortController, context: string }
    this.cancelledRequests = new Map(); // Track cancellation tombstones: messageId -> timestamp
    this.recentRequests = new Map();     // Track recent requests to prevent duplicates
    this.streamingSenders = new Map();    // Track tab info for streaming: messageId -> sender
  }

  /**
   * Register a new translation request.
   * Creates an AbortController and performs duplicate detection.
   * 
   * @param {string} messageId - Unique ID for the message
   * @param {string} text - Content being translated (for duplicate detection)
   * @param {string} context - UI context (popup, sidepanel, etc.)
   * @returns {AbortController|null} The controller, or null when cancellation arrived first
   */
  registerRequest(messageId, text, context = 'unknown') {
    this._pruneCancelledRequests();

    if (this.cancelledRequests.has(messageId)) {
      logger.debug(`[LifecycleRegistry] Ignoring pre-cancelled request: ${messageId}`);
      return null;
    }

    // Detect duplicates (brief window of 1 second)
    const requestId = `${messageId}:${getTranslationInputPreview(text)}`;
    if (this.recentRequests.has(requestId)) {
      const existing = this.recentRequests.get(requestId);
      if (Date.now() - existing.time < 1000) {
        logger.debug(`[LifecycleRegistry] Duplicate request detected for ID: ${messageId}`);
        return existing.controller;
      }
    }

    const abortController = new AbortController();
    this.activeTranslations.set(messageId, { 
      controller: abortController, 
      context 
    });
    
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
    this._pruneCancelledRequests();
    this.activeTranslations.delete(messageId);
    this.streamingSenders.delete(messageId);
  }

  /**
   * Check if a request has been cancelled.
   * 
   * @param {string} messageId - The request ID
   * @returns {boolean}
   */
  isCancelled(messageId) {
    this._pruneCancelledRequests();
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

    this._pruneCancelledRequests();
    this.cancelledRequests.set(messageId, Date.now());
    
    if (this.activeTranslations.has(messageId)) {
      logger.info(`[LifecycleRegistry] Aborting active translation: ${messageId}`);
      this.activeTranslations.get(messageId).controller.abort();
    }

    try {
      // Notify streaming manager to clean up resources
      await streamingManager.cancelStream(messageId, ErrorTypes.USER_CANCELLED);
    } catch { /* ignore */ }

    return true;
  }

  /**
   * Cancel currently active translations, optionally filtered by context.
   * 
   * @param {string} [context] - Optional context to filter by (e.g., 'popup')
   * @returns {Promise<number>} Number of cancelled translations
   */
  async cancelAllTranslations(context = null) {
    this._pruneCancelledRequests();
    let cancelledCount = 0;
    
    for (const [messageId, entry] of this.activeTranslations) {
      // Apply context filter if provided
      if (context && entry.context !== context) {
        continue;
      }

      try {
        this.cancelledRequests.set(messageId, Date.now());
        entry.controller.abort();
        cancelledCount++;
      } catch { /* ignore */ }
    }

    try {
      // If no context or specifically popup/sidepanel, we might want to be more surgical with streamingManager
      // for now, cancelAllStreams is safe as it handles all active streams
      if (!context) {
        await streamingManager.cancelAllStreams('All translations cancelled by user');
      } else {
        // Find streams belonging to this context and cancel them
        // This is a bit more complex as streamingManager doesn't track context yet
        // but it will be cleaned up eventually or when the next stream update fails
      }
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
    const entry = this.activeTranslations.get(messageId);
    return entry ? entry.controller : null;
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

  /**
   * Drop cancellation tombstones for requests that never reached registration.
   *
   * @private
   */
  _pruneCancelledRequests() {
    const expiresBefore = Date.now() - CANCELLATION_TOMBSTONE_TTL_MS;
    for (const [messageId, cancelledAt] of this.cancelledRequests) {
      if (cancelledAt <= expiresBefore) {
        this.cancelledRequests.delete(messageId);
      }
    }
  }
}
