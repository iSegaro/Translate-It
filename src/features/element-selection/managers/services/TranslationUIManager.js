import { getScopedLogger } from "../../../../shared/logging/logger.js";
import { LOG_COMPONENTS } from "../../../../shared/logging/logConstants.js";

// Import the specialized services
import { NotificationService } from "./NotificationService.js";
import { StreamingUpdateService } from "./StreamingUpdateService.js";
import { StreamEndService } from "./StreamEndService.js";
import { DOMNodeMatcher } from "./DOMNodeMatcher.js";
import { TranslationApplier } from "./TranslationApplier.js";
import { DirectionManager } from "./DirectionManager.js";

/**
 * TranslationUIManager - Main coordinator for translation UI operations
 * Delegates to specialized services for specific responsibilities
 *
 * This is a refactored coordinator that splits the original 3,016-line monolithic file
 * into focused services following the service composition pattern.
 *
 * Responsibilities:
 * - Coordinate all translation UI operations
 * - Delegate to specialized services
 * - Maintain backward-compatible public API
 * - Orchestrator service initialization and cleanup
 *
 * @memberof module:features/element-selection/managers/services
 */
export class TranslationUIManager {
  constructor(orchestrator) {
    this.orchestrator = orchestrator;
    this.logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'TranslationUIManager');

    // UI state tracking (backward compatibility)
    this.statusNotification = null;
    this.cacheCompleted = false;

    // Initialize specialized services
    this.notificationService = new NotificationService(this);
    this.streamingUpdateService = new StreamingUpdateService(this);
    this.streamEndService = new StreamEndService(this);
    this.nodeMatcher = new DOMNodeMatcher(this);
    this.translationApplier = new TranslationApplier(this);
    this.directionManager = new DirectionManager(this);
  }

  /**
   * Initialize the UI manager
   */
  initialize() {
    this.logger.debug('TranslationUIManager initialized');

    // Initialize all specialized services
    this.notificationService.initialize();
    this.streamingUpdateService.initialize();
    this.streamEndService.initialize();
    this.nodeMatcher.initialize();
    this.translationApplier.initialize();
    this.directionManager.initialize();
  }

  // ========== Notification Methods (delegated to NotificationService) ==========

  /**
   * Show status notification for translation progress
   * @param {string} messageId - Message ID
   * @param {string} context - Translation context
   */
  async showStatusNotification(messageId, context = 'select-element') {
    return this.notificationService.showStatusNotification(messageId, context);
  }

  /**
   * Dismiss active status notification
   */
  dismissStatusNotification() {
    return this.notificationService.dismissStatusNotification();
  }

  /**
   * Dismiss SelectElement notification
   * @param {Object} options - Dismissal options
   */
  dismissSelectElementNotification(options = {}) {
    return this.notificationService.dismissSelectElementNotification(options);
  }

  /**
   * Show timeout notification to user
   * @param {string} messageId - Message ID
   */
  async showTimeoutNotification(messageId) {
    return this.notificationService.showTimeoutNotification(messageId);
  }

  // ========== Streaming Methods (delegated to StreamingUpdateService) ==========

  /**
   * Process streaming update and apply translations to DOM
   * @param {Object} message - Stream update message
   */
  async processStreamUpdate(message) {
    return this.streamingUpdateService.processStreamUpdate(message);
  }

  // ========== Stream End Methods (delegated to StreamEndService) ==========

  /**
   * Process stream end and complete translation
   * @param {Object} message - Stream end message
   */
  async processStreamEnd(message) {
    return this.streamEndService.processStreamEnd(message);
  }

  /**
   * Handle non-streaming translation result
   * @param {Object} message - Translation result message
   */
  async handleTranslationResult(message) {
    return this.streamEndService.handleTranslationResult(message);
  }

  // ========== DOM Application Methods (delegated to TranslationApplier) ==========

  /**
   * Apply translations directly to DOM nodes using wrapper approach
   * @param {Array} textNodes - Array of text nodes to translate
   * @param {Map} translations - Map of original text to translated text
   * @param {Object} options - Application options
   */
  async applyTranslationsToNodes(textNodes, translations, options = {}) {
    return this.translationApplier.applyTranslationsToNodes(textNodes, translations, options);
  }

  // ========== Debug and Cleanup Methods ==========

  /**
   * Trigger post-translation cleanup through SelectElementManager
   */
  triggerPostTranslationCleanup() {
    if (window.selectElementManagerInstance && typeof window.selectElementManagerInstance.performPostTranslationCleanup === 'function') {
      this.logger.debug('Triggering SelectElementManager cleanup');
      window.selectElementManagerInstance.performPostTranslationCleanup();
    } else {
      this.logger.debug('Cannot trigger cleanup: SelectElementManager not available');
    }
  }

  /**
   * Get UI statistics
   * @returns {Object} UI statistics
   */
  getUIStats() {
    return {
      ...this.notificationService.getStats(),
      cacheCompleted: this.cacheCompleted,
      translationInProgress: window.isTranslationInProgress || false
    };
  }

  /**
   * Debug tool to analyze text matching issues
   * @param {Array} textNodes - Text nodes to analyze
   * @param {Map} translations - Available translations
   * @returns {Object} Analysis results
   */
  debugTextMatching(textNodes, translations) {
    return this.nodeMatcher.debugTextMatching(textNodes, translations);
  }

  /**
   * Cleanup UI manager
   */
  cleanup() {
    this.logger.debug('Starting TranslationUIManager cleanup');

    // Cleanup all specialized services in reverse order
    this.directionManager.cleanup();
    this.translationApplier.cleanup();
    this.nodeMatcher.cleanup();
    this.streamEndService.cleanup();
    this.streamingUpdateService.cleanup();
    this.notificationService.cleanup();

    // Reset state
    this.statusNotification = null;
    this.cacheCompleted = false;

    this.logger.debug('TranslationUIManager cleanup completed');
  }
}
