// StateManager Service - Tracks translated elements and manages state

import { getScopedLogger } from "../../../../utils/core/logger.js";
import { LOG_COMPONENTS } from "../../../../utils/core/logConstants.js";
import { RETRY_CONFIG } from "../constants/selectElementConstants.js";

export class StateManager {
  constructor() {
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'StateManager');
    this.translatedElements = new Map();
    this.originalTexts = new Map();
    this.failureTracker = new Map();
    this.lifecycleTracking = new Map();
  }

  /**
   * Initialize the state manager
   */
  async initialize() {
    this.logger.debug('StateManager initialized');
  }

  /**
   * Track a translated element with its original text
   * @param {HTMLElement} element - The translated element
   * @param {string} originalText - The original text before translation
   */
  trackTranslatedElement(element, originalText) {
    if (!element || !originalText) {
      this.logger.warn('Cannot track element without element or original text');
      return;
    }

    const elementId = this.getElementId(element);
    this.translatedElements.set(elementId, element);
    this.originalTexts.set(elementId, originalText);

    this.logger.debug('Tracked translated element:', {
      elementId,
      originalTextLength: originalText.length,
      tagName: element.tagName
    });
  }

  /**
   * Revert all translations made during this session
   * @returns {number} Number of elements reverted
   */
  async revertTranslations() {
    this.logger.operation('Reverting all translations');

    let revertedCount = 0;
    
    for (const [elementId, element] of this.translatedElements) {
      try {
        const originalText = this.originalTexts.get(elementId);
        if (originalText && this.isElementStillValid(element)) {
          await this.revertElement(element, originalText);
          revertedCount++;
        }
      } catch (error) {
        this.logger.warn(`Failed to revert element ${elementId}:`, error);
      }
    }

    // Clear all tracked elements after revert
    this.translatedElements.clear();
    this.originalTexts.clear();

    this.logger.info(`Reverted ${revertedCount} translation(s)`);
    return revertedCount;
  }

  /**
   * Revert a single element to its original text
   * @param {HTMLElement} element - Element to revert
   * @param {string} originalText - Original text to restore
   */
  async revertElement(element, originalText) {
    try {
      if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
        element.value = originalText;
      } else {
        element.textContent = originalText;
      }

      // Remove translation markers
      element.removeAttribute('data-translated');
      element.removeAttribute('data-original-text');

      this.logger.debug('Element reverted successfully:', {
        tagName: element.tagName,
        textLength: originalText.length
      });
    } catch (error) {
      this.logger.error('Failed to revert element:', error);
      throw error;
    }
  }

  /**
   * Check if element is still valid and accessible in DOM
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} Whether element is still valid
   */
  isElementStillValid(element) {
    try {
      return element && element.isConnected && document.contains(element);
    } catch (error) {
      return false;
    }
  }

  /**
   * Track translation failure for retry logic
   * @param {string} text - The text that failed to translate
   * @param {Error} error - The error that occurred
   */
  trackFailure(text, error) {
    if (!text) return;

    const textHash = this.hashText(text);
    const now = Date.now();
    const failureEntry = this.failureTracker.get(textHash) || {
      count: 0,
      lastAttempt: 0,
      errors: []
    };

    failureEntry.count++;
    failureEntry.lastAttempt = now;
    failureEntry.errors.push({
      timestamp: now,
      message: error.message,
      stack: error.stack
    });

    // Clean up old errors
    failureEntry.errors = failureEntry.errors.filter(
      err => now - err.timestamp < RETRY_CONFIG.FAILURE_COOLDOWN
    );

    this.failureTracker.set(textHash, failureEntry);

    this.logger.debug('Tracked translation failure:', {
      textHash,
      failureCount: failureEntry.count,
      textPreview: text.substring(0, 50) + (text.length > 50 ? '...' : '')
    });
  }

  /**
   * Check if text should be retried based on failure history
   * @param {string} text - Text to check
   * @returns {boolean} Whether text should be retried
   */
  shouldRetryTranslation(text) {
    if (!text) return true;

    const textHash = this.hashText(text);
    const failureEntry = this.failureTracker.get(textHash);
    
    if (!failureEntry) return true;

    const now = Date.now();
    const timeSinceLastAttempt = now - failureEntry.lastAttempt;

    // Don't retry if max retries exceeded
    if (failureEntry.count >= RETRY_CONFIG.MAX_RETRIES) {
      return false;
    }

    // Don't retry if still in cooldown period
    if (timeSinceLastAttempt < RETRY_CONFIG.FAILURE_COOLDOWN) {
      return false;
    }

    return true;
  }

  /**
   * Get retry delay for a text based on failure count
   * @param {string} text - Text to get delay for
   * @returns {number} Delay in milliseconds
   */
  getRetryDelay(text) {
    const textHash = this.hashText(text);
    const failureEntry = this.failureTracker.get(textHash);
    
    if (!failureEntry) return 0;

    const delayIndex = Math.min(failureEntry.count - 1, RETRY_CONFIG.RETRY_DELAY.length - 1);
    return RETRY_CONFIG.RETRY_DELAY[delayIndex] || 0;
  }

  /**
   * Clean up old failure entries periodically
   */
  cleanupFailureTracker() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [textHash, entry] of this.failureTracker) {
      if (now - entry.lastAttempt > RETRY_CONFIG.FAILURE_COOLDOWN * 2) {
        this.failureTracker.delete(textHash);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned ${cleanedCount} old failure entries`);
    }
  }

  /**
   * Track lifecycle events for debugging
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  trackLifecycle(event, data = {}) {
    const timestamp = Date.now();
    const eventId = `${event}_${timestamp}`;
    
    this.lifecycleTracking.set(eventId, {
      event,
      timestamp,
      data
    });

    this.logger.debug('Lifecycle event tracked:', { event, timestamp });
  }

  /**
   * Check if there are any translated elements
   * @returns {boolean} Whether there are translated elements
   */
  hasTranslatedElements() {
    return this.translatedElements.size > 0;
  }

  /**
   * Get count of translated elements
   * @returns {number} Number of translated elements
   */
  getTranslatedElementCount() {
    return this.translatedElements.size;
  }

  /**
   * Generate a unique ID for an element
   * @param {HTMLElement} element - Element to generate ID for
   * @returns {string} Unique element ID
   */
  getElementId(element) {
    if (!element) return 'invalid';
    
    try {
      // Use a combination of properties for a unique-ish ID
      const id = element.id ? `id_${element.id}` : '';
      const className = element.className ? `class_${element.className}` : '';
      const tag = element.tagName ? `tag_${element.tagName}` : '';
      const position = element.getBoundingClientRect
        ? `pos_${Math.round(element.getBoundingClientRect().top)}_${Math.round(element.getBoundingClientRect().left)}`
        : '';
      
      return `${id}_${className}_${tag}_${position}_${Math.random().toString(36).substr(2, 9)}`;
    } catch (error) {
      // Fallback to simple ID
      return `element_${Math.random().toString(36).substr(2, 9)}`;
    }
  }

  /**
   * Create a simple hash of text for tracking
   * @param {string} text - Text to hash
   * @returns {string} Hash of the text
   */
  hashText(text) {
    // Simple hash function for text tracking
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    this.translatedElements.clear();
    this.originalTexts.clear();
    this.failureTracker.clear();
    this.lifecycleTracking.clear();
    this.logger.debug('StateManager cleanup completed');
  }

  /**
   * Get debugging information
   * @returns {Object} Debug info
   */
  getDebugInfo() {
    return {
      translatedElements: this.translatedElements.size,
      originalTexts: this.originalTexts.size,
      failureTracker: this.failureTracker.size,
      lifecycleTracking: this.lifecycleTracking.size,
      hasTranslatedElements: this.hasTranslatedElements()
    };
  }
}
