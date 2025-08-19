// src/content-scripts/select-element-manager.js
// Vue-compatible Select Element Manager
// Integrated with existing services and error handling

import browser from "webextension-polyfill";
import { taggleLinks } from "@/utils/core/helpers.js";
import { ErrorHandler } from "../../error-management/ErrorHandler.js";
import { ErrorTypes } from "../../error-management/ErrorTypes.js";
import { getScopedLogger } from "../../utils/core/logger.js";
import { getTimeoutAsync } from "../../config.js";
import { LOG_COMPONENTS } from "../../utils/core/logConstants.js";
import NotificationManager from "@/managers/core/NotificationManager.js";
import { MessageFormat, MessagingContexts } from "../../messaging/core/MessagingCore.js";
import { MessageActions } from "@/messaging/core/MessageActions.js";
import { generateContentMessageId } from "../../utils/messaging/messageId.js";
import { 
  SELECT_ELEMENT_MODES, 
  SELECT_ELEMENT_DEFAULTS,
  SelectElementValidation
} from "../../constants/SelectElementModes.js";

/**
 * SelectElementManager - Vue-compatible element selection system
 *
 * Features:
 * - Element highlighting on hover
 * - Click to select and extract text
 * - ESC key cancellation
 * - Service integration (ErrorHandler, NotificationManager)
 * - Cross-browser compatibility
 */
export class SelectElementManager {
  constructor() {
    this.isActive = false;
    this.overlayElements = new Set();
    this.currentHighlighted = null;
    this.browser = null;
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'SelectElement');
    this.translatedElements = new Set(); // Track translated elements for revert
    this.isProcessingClick = false; // Prevent multiple rapid clicks
    this.lastClickTime = 0; // Debounce timer
    this.escapeAbortController = null; // For background ESC key handling
    
    // Cache for element validation to improve performance
    this.elementValidationCache = new WeakMap();
    this.textContentCache = new WeakMap();
    
    // Retry and failure tracking
    this.failureTracker = new Map(); // Track failed translation attempts
    this.retryConfig = {
      maxRetries: 2,
      retryDelay: [1000, 2000, 5000], // Progressive delay
      failureCooldown: 60000, // 1 minute cooldown for failed texts
    };
    
    // Configuration for text validation and highlighting
    this.config = {
      mode: SELECT_ELEMENT_DEFAULTS.MODE,           // Current validation mode
      baseMode: SELECT_ELEMENT_DEFAULTS.BASE_MODE, // Base mode when Ctrl is not pressed
      minTextLength: SELECT_ELEMENT_DEFAULTS.MIN_TEXT_LENGTH,        // Minimum text length to consider for translation
      minWordCount: SELECT_ELEMENT_DEFAULTS.MIN_WORD_COUNT,         // Minimum word count for meaningful content
      maxElementArea: SELECT_ELEMENT_DEFAULTS.MAX_ELEMENT_AREA,   // Maximum element area for container validation
      maxAncestors: SELECT_ELEMENT_DEFAULTS.MAX_ANCESTORS,         // Maximum ancestors to check when finding best element
      
      // Enhanced highlighting configuration - much larger thresholds for bigger selections
      minHighlightArea: 50000,      // Minimum area (px^2) for highlight - much larger for big blocks
      minHighlightWidth: 200,       // Minimum width (px) for highlight
      minHighlightHeight: 100,      // Minimum height (px) for highlight  
      preferredMinArea: 80000,      // Preferred minimum area for excellent user experience
      maxChildSearchDepth: 2,       // Reduced depth to prefer larger parents
      parentSizeMultiplier: 1.5     // Lower multiplier to more easily prefer larger parents
    };

    // Create proper state structure like OLD system
    this.state = {
      originalTexts: new Map(), // This matches the OLD system structure
      isCtrlPressed: false,     // Track Ctrl key state
      isActive: false          // Track if select element mode is active
    };

    // Service instances
    this.errorHandler = ErrorHandler.getInstance();
    this.notificationManager = new NotificationManager(this.errorHandler);

    // Event handlers (bound to this)
    this.handleMouseOver = this.handleMouseOver.bind(this);
    this.handleMouseOut = this.handleMouseOut.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleMessage = this.handleMessage.bind(this);

    // State tracking
    this.messageListener = null;
    this.abortController = null;
    this.pendingTranslation = null; // For waiting for TRANSLATION_RESULT_UPDATE
    this.statusNotification = null; // Track status notification for dismissal (like OLD system)
    this.selectionProcessing = false; // true while an element's translation is being processed
    this.requestedCancel = false; // set when ESC pressed before pending translation created
    
    // Lifecycle tracing for messageIds
    this.tracing = true; // enable by default for now; can be toggled
    this.messageLifecycle = new Map();

    // Expose tracing map for devtools inspection
    try {
      Object.defineProperty(window, '__TranslateItTracing', {
        configurable: true,
        enumerable: false,
        get: () => this.messageLifecycle,
      });
    } catch {
      // ignore if window not writable in some contexts
    }

    this.logger.init('Select element manager initialized');
  }

  /**
   * Update configuration for text validation
   * @param {Object} newConfig - Configuration object
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Clear caches when config changes
    this.elementValidationCache = new WeakMap();
    this.textContentCache = new WeakMap();
    
    this.logger.debug('Configuration updated:', this.config);
  }

  /**
   * Get current configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Switch between simple and smart modes
   * @param {SelectElementMode} mode - Validation mode
   */
  setMode(mode) {
    if (SelectElementValidation.isValidMode(mode)) {
      this.config.mode = mode;
      
      // If not triggered by Ctrl key, update base mode too
      if (!this.state.isCtrlPressed) {
        this.config.baseMode = mode;
      }
      
      // Clear caches when mode changes
      this.elementValidationCache = new WeakMap();
      this.textContentCache = new WeakMap();
      
      // Update background color for the new mode (only if active)
      if (this.state.isActive) {
        this.updateBackgroundStyle();
      }
      
      const trigger = this.state.isCtrlPressed ? '(Ctrl key)' : '(manual/base)';
      const displayName = SelectElementValidation.getDisplayName(mode);
      this.logger.info(`[SelectElementManager] Mode switched to: ${displayName} ${trigger}`);
    } else {
      const validModes = SelectElementValidation.getAllModes().join(', ');
      this.logger.warn(`[SelectElementManager] Invalid mode: ${mode}. Valid modes: ${validModes}`);
    }
  }

  /**
   * Get current mode
   * @returns {string} Current mode
   */
  getMode() {
    return this.config.mode;
  }

  /**
   * Debug method to analyze why an element is or isn't valid
   * @param {HTMLElement} element - Element to analyze
   * @returns {Object} Analysis result
   */
  analyzeElement(element) {
    const analysis = {
      element: element,
      tagName: element.tagName,
      isValid: false,
      reasons: [],
      textContent: element.textContent?.trim() || '',
      textLength: (element.textContent?.trim() || '').length,
      hasChildren: element.children.length > 0,
      area: element.offsetWidth * element.offsetHeight,
      mode: this.config.mode
    };

    // Test both modes for comparison
    const simpleValid = this.isValidTextElement_Simple(element);
    const smartValid = this.isValidTextElement_Smart(element);
    
    analysis.simpleMode = { isValid: simpleValid };
    analysis.smartMode = { isValid: smartValid };
    analysis.currentMode = { isValid: this.isValidTextElement(element) };
    

    // Check each validation step for current mode
    const invalidTags = ["SCRIPT", "STYLE", "NOSCRIPT", "HEAD", "META", "LINK"];
    if (invalidTags.includes(element.tagName)) {
      analysis.reasons.push('Invalid tag type');
      return analysis;
    }

    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      analysis.reasons.push('Element not visible');
      return analysis;
    }

    const isTextInput = element.tagName === "INPUT" && (element.type === "text" || element.type === "textarea");
    const isTextArea = element.tagName === "TEXTAREA";
    
    if (isTextInput || isTextArea) {
      const value = element.value || "";
      analysis.textContent = value;
      analysis.textLength = value.length;
      
      if (this.config.mode === SELECT_ELEMENT_MODES.SIMPLE || this.isValidTextContent(value.trim())) {
        analysis.isValid = true;
        analysis.reasons.push('Valid input element');
      } else {
        analysis.reasons.push('Input value not valid for translation');
      }
    } else {
      if (this.config.mode === SELECT_ELEMENT_MODES.SIMPLE || this.hasValidTextContent(element)) {
        analysis.isValid = true;
        analysis.reasons.push('Valid text element');
      } else {
        analysis.reasons.push('No valid text content found');
      }
    }

    // Additional analysis for container elements
    if (element.children.length > 0) {
      analysis.childCount = element.children.length;
      analysis.isContainer = true;
    }

    return analysis;
  }

  /**
   * Initialize browser API and setup message listener
   */
  async initialize() {
    try {
      this.browser = browser;
      this.setupMessageListener();
      this.setupKeyboardListeners();

      // Initialize services
      this.notificationManager.initialize();

      this.logger.debug('Browser API initialized');
    } catch (error) {
      this.logger.error("Initialization failed", error);
      await this.errorHandler.handle(error, {
        type: ErrorTypes.INTEGRATION,
        context: "select-element-manager-init",
      });
    }
  }

  /**
   * Setup keyboard listeners for Ctrl key dynamic mode switching
   */
  setupKeyboardListeners() {
    // Listen for keydown events
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Control' && !this.state.isCtrlPressed && this.state.isActive) {
        this.state.isCtrlPressed = true;
        this.setMode(SELECT_ELEMENT_MODES.SIMPLE);
        const emoji = SelectElementValidation.getModeEmoji(SELECT_ELEMENT_MODES.SIMPLE);
        this.logger.info(`${emoji} Ctrl pressed: Dynamic switch to ${SelectElementValidation.getDisplayName(SELECT_ELEMENT_MODES.SIMPLE)}`);
      }
    }, true);

    // Listen for keyup events
    document.addEventListener('keyup', (event) => {
      if (event.key === 'Control' && this.state.isCtrlPressed && this.state.isActive) {
        this.state.isCtrlPressed = false;
        this.setMode(this.config.baseMode);
        const emoji = SelectElementValidation.getModeEmoji(this.config.baseMode);
        const displayName = SelectElementValidation.getDisplayName(this.config.baseMode);
        this.logger.info(`${emoji} Ctrl released: Dynamic switch back to ${displayName}`);
      }
    }, true);

    // Handle window blur (when user switches to another window/tab while holding Ctrl)
    window.addEventListener('blur', () => {
      if (this.state.isCtrlPressed && this.state.isActive) {
        this.state.isCtrlPressed = false;
        this.setMode(this.config.baseMode);
        const displayName = SelectElementValidation.getDisplayName(this.config.baseMode);
        this.logger.info(`🌫️ Window blur: Auto-reset to ${displayName}`);
      }
    });

    // Handle tab visibility change (when user switches to another tab)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state.isActive) {
        this.logger.info('🔄 Tab became hidden: Deactivating select element mode');
        this.deactivate().catch(error => {
          this.logger.warn('Error deactivating on tab hidden:', error);
        });
      }
    });
  }

  /**
   * Setup message listener for background communication
   */
  setupMessageListener() {
    if (!this.browser || this.messageListener) return;

    this.messageListener = this.handleMessage;
    this.browser.runtime.onMessage.addListener.call(
      this.browser.runtime.onMessage,
      this.messageListener
    );
    this.logger.debug('Message listener registered');
  }

  /**
   * Handle messages from background script
   */
  async handleMessage(message, sender, sendResponse) {
    this.logger.debug(`Received message:`, message);

    if (
      message.action === MessageActions.ACTIVATE_SELECT_ELEMENT_MODE ||
      message.action === MessageActions.DEACTIVATE_SELECT_ELEMENT_MODE
    ) {
      // Determine activation state
      let shouldActivate;
      if (message.action === MessageActions.ACTIVATE_SELECT_ELEMENT_MODE) {
        shouldActivate = true;
      } else if (
        message.action === MessageActions.DEACTIVATE_SELECT_ELEMENT_MODE
      ) {
        shouldActivate = false;
      } else {
        // Legacy TOGGLE_SELECT_ELEMENT_MODE
        shouldActivate = message.data;
      }

      try {
        if (shouldActivate) {
          this.activate();
        } else {
          this.deactivate();
        }
        // Send success response to background
        const response = { success: true, isActive: this.isActive };
        this.logger.debug(
          `[SelectElementManager] Mode ${shouldActivate ? "activated" : "deactivated"} successfully`,
          response
        );

        if (sendResponse) {
          sendResponse(response);
        }

        return response;
      } catch (error) {
        this.logger.error("Toggle error", error);

        // Handle error via ErrorHandler
        await this.errorHandler.handle(error, {
          type: ErrorTypes.INTEGRATION,
          context: "select-element-toggle",
        });

        const errorResponse = { success: false, error: error.message };
        if (sendResponse) {
          sendResponse(errorResponse);
        }
        return errorResponse;
      }
    }

    if (message.action === MessageActions.REVERT_SELECT_ELEMENT_MODE) {
      try {
        const revertedCount = await this.revertTranslations();
        const response = { success: true, revertedCount };
        if (sendResponse) {
          sendResponse(response);
        }
        return response;
      } catch (error) {
        const errorResponse = { success: false, error: error.message };
        if (sendResponse) {
          sendResponse(errorResponse);
        }
        return errorResponse;
      }
    }

    // Handle TRANSLATION_RESULT_UPDATE messages - check context like OLD system
    if (message.action === MessageActions.TRANSLATION_RESULT_UPDATE) {
      this.logger.debug('Received TRANSLATION_RESULT_UPDATE', { message, context: message.context });
      
      // Only handle messages for EVENT_HANDLER context (like OLD system)  
      if (message.context === MessagingContexts.EVENT_HANDLER) {
        await this.handleTranslationResult(message);
        return true;
      } else {
        this.logger.debug('Ignoring TRANSLATION_RESULT_UPDATE - wrong context', message.context);
        return false;
      }
    }

    return false; // Let other handlers process the message
  }

  /**
   * Handle TRANSLATION_RESULT_UPDATE message
   * @param {Object} message - Translation result message
   */
  async handleTranslationResult(message) {
    try {
      this.logger.debug('Processing translation result', {
        data: message.data,
        messageId: message.messageId,
        pendingTranslation: this.pendingTranslation
      });
      
      const translationData = message.data;
      const messageId = message.messageId;
      
      // Always try to cache successful translation results, even if cancelled
      if (translationData?.success && translationData?.translatedText) {
        try {
          this.logger.debug('Caching translation result for future use (even if cancelled)');
          await this.cacheTranslationResult(translationData);
        } catch (cacheError) {
          this.logger.warn('Failed to cache translation result', cacheError);
        }
      }
      
      if (this.pendingTranslation) {
        // TRANSLATION_RESULT_UPDATE uses the same messageId as the original TRANSLATE request
        if (this.pendingTranslation.originalMessageId === messageId) {
          const elapsed = Date.now() - this.pendingTranslation.startTime;
          this.logger.operation(`Message ID matched, resolving translation after ${elapsed}ms`);
          this.logLifecycle(messageId, 'RESULT_RECEIVED', { elapsed });
          
          // Cancel timeout since we got the result
          if (this.pendingTranslation.timeoutId) {
            clearTimeout(this.pendingTranslation.timeoutId);
          }
          
          // Dismiss status notification
          if (this.statusNotification) {
            try {
              this.notificationManager.dismiss(this.statusNotification);
              this.statusNotification = null;
              this.logger.debug('Status notification dismissed');
            } catch (dismissError) {
              this.logger.warn('Failed to dismiss status notification', dismissError);
            }
          }
          
          this.pendingTranslation.resolve({
            success: translationData?.success !== false,
            translatedText: translationData?.translatedText,
            error: translationData?.error,
            elapsed: elapsed
          });
          this.pendingTranslation = null;
        } else {
          this.logger.warn('Message ID mismatch', {
            expected: this.pendingTranslation.originalMessageId,
            received: messageId
          });
        }
      } else {
        this.logger.debug('No pending translation found - likely cancelled, but result cached if successful');
      }
    } catch (error) {
      this.logger.error('Error handling translation result', error);
      if (this.pendingTranslation) {
        this.pendingTranslation.reject(error);
        this.pendingTranslation = null;
      }
    }
  }

  /**
   * Cache translation result using existing cache system
   * @param {Object} translationData - Translation result data
   */
  async cacheTranslationResult(translationData) {
    try {
      const { translatedText, originalText } = translationData;
      
      if (!translatedText || !originalText) {
        this.logger.debug('Cannot cache: missing translated or original text');
        return;
      }

      // Import the existing translation cache system
      const { getTranslationCache } = await import("../../utils/text/extraction.js");
      const translationCache = getTranslationCache();

      // Parse JSON responses for SelectElement mode
      let translatedData, originalData;
      try {
        translatedData = JSON.parse(translatedText);
        originalData = JSON.parse(originalText);
      } catch {
        // Not JSON format, cache as-is
        translationCache.set(originalText.trim(), translatedText.trim());
        this.logger.debug('Cached simple text translation');
        return;
      }

      // For JSON format (SelectElement), cache individual segments
      if (Array.isArray(translatedData) && Array.isArray(originalData)) {
        let cachedCount = 0;
        for (let i = 0; i < Math.min(translatedData.length, originalData.length); i++) {
          const origText = originalData[i]?.text;
          const transText = translatedData[i]?.text;
          
          if (origText && transText && origText.trim() && transText.trim()) {
            translationCache.set(origText.trim(), transText.trim());
            cachedCount++;
          }
        }
        this.logger.debug(`Cached ${cachedCount} JSON segments for future use`);
      }
    } catch (error) {
      this.logger.error('Error caching translation result', error);
    }
  }

  /**
   * Setup translation waiting before sending request to avoid race condition
   * @param {string} messageId - Message ID to wait for
   * @param {number} timeout - Timeout in milliseconds (default: 25 seconds for better UX)
   * @returns {Promise<Object>} Translation result promise
   */
  async setupTranslationWaiting(messageId) {
    const timeout = await getTimeoutAsync();
    this.logger.debug(`Setting up translation waiting for messageId: ${messageId}, timeout: ${timeout}ms`);
    
    return new Promise((resolve, reject) => {
      // Store pending translation promise
      this.pendingTranslation = { 
        originalMessageId: messageId, 
        resolve, 
        reject,
        startTime: Date.now()
      };
      
      // Set timeout to show a warning, but don't resolve the promise.
      const timeoutId = setTimeout(() => {
        if (this.pendingTranslation && this.pendingTranslation.originalMessageId === messageId) {
          const elapsed = Date.now() - this.pendingTranslation.startTime;
          this.logger.warn(`Translation is taking longer than expected after ${elapsed}ms for messageId: ${messageId}`);
          this.showWarningNotification("Translation is taking longer than expected, but is still in progress...");
          // We don't resolve or reject here. We let the translation continue in the background.
          // The status notification will remain until the final result is received.
        }
      }, timeout);
      
      // Store timeout ID for potential cancellation
      this.pendingTranslation.timeoutId = timeoutId;

      // If a cancel was requested before the pendingTranslation existed,
      // immediately cancel it now.
      if (this.requestedCancel) {
        try {
          this.logger.debug(`Requested cancel detected - cancelling pending translation for ${messageId}`);
          // Reset flag before cancelling to avoid recursion
          this.requestedCancel = false;
          (async () => {
            await this.cancelPendingTranslation(messageId);
          })();
        } catch (err) {
          this.logger.warn('Error while auto-cancelling pending translation', err);
        }
      }
    });
  }

  /**
   * Check if text should be retried based on failure history
   * @param {string} textHash - Hash of the text content
   * @returns {boolean} Whether retry is allowed
   */
  canRetryText(textHash) {
    const failure = this.failureTracker.get(textHash);
    if (!failure) return true;
    
    const timeSinceLastFailure = Date.now() - failure.lastAttempt;
    if (timeSinceLastFailure < this.retryConfig.failureCooldown) {
      this.logger.debug('Text is in cooldown period', {
        textHash,
        timeSince: timeSinceLastFailure,
        cooldown: this.retryConfig.failureCooldown
      });
      return false;
    }
    
    return failure.attempts < this.retryConfig.maxRetries;
  }

  /**
   * Record translation failure for a text
   * @param {string} textHash - Hash of the text content
   * @param {Error} error - The error that occurred
   */
  recordTranslationFailure(textHash, error) {
    const existing = this.failureTracker.get(textHash) || { attempts: 0 };
    existing.attempts++;
    existing.lastAttempt = Date.now();
    existing.lastError = error.message;
    
    this.failureTracker.set(textHash, existing);
    this.logger.debug('Recorded translation failure', {
      textHash,
      attempts: existing.attempts,
      error: error.message
    });
    
    // Clean up old entries periodically
    if (Math.random() < 0.1) { // 10% chance to clean up
      this.cleanupFailureTracker();
    }
  }

  /**
   * Record translation success for a text (reset failure count)
   * @param {string} textHash - Hash of the text content
   */
  recordTranslationSuccess(textHash) {
    this.failureTracker.delete(textHash);
  }

  /**
   * Clean up old failure tracking entries
   */
  cleanupFailureTracker() {
    const cutoff = Date.now() - (this.retryConfig.failureCooldown * 2);
    let cleaned = 0;
    
    for (const [textHash, failure] of this.failureTracker.entries()) {
      if (failure.lastAttempt < cutoff) {
        this.failureTracker.delete(textHash);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} old failure tracking entries`);
    }
  }

  /**
   * Generate hash for text content
   * @param {string} text - Text to hash
   * @returns {string} Simple hash
   */
  generateTextHash(text) {
    if (!text) return '';
    // Simple hash function for tracking purposes
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * Cancel pending translation (for error cases)
   * @param {string} messageId - Message ID to cancel
   */
  async cancelPendingTranslation(messageId) {
    if (this.pendingTranslation && this.pendingTranslation.originalMessageId === messageId) {
      this.logger.debug(`Cancelling pending translation for messageId: ${messageId}`);

      // Log lifecycle: cancel requested
      this.logLifecycle(messageId, 'CANCEL_REQUESTED');

      // Notify background to cancel the translation task
      try {
        const { sendReliable } = await import('../../messaging/core/ReliableMessaging.js');
        await sendReliable({
          action: 'CANCEL_TRANSLATION',
          data: { messageId: messageId }
        });
        this.logger.debug(`Sent CANCEL_TRANSLATION to background for messageId: ${messageId}`);
      } catch (err) {
        this.logger.warn('Failed to send CANCEL_TRANSLATION message', err);
      }

      // Clear timeout if present
      if (this.pendingTranslation && this.pendingTranslation.timeoutId) {
        try { clearTimeout(this.pendingTranslation.timeoutId); } catch { /* ignore */ }
      }

      // Resolve the pending promise with a cancel result instead of rejecting it.
      if (this.pendingTranslation && this.pendingTranslation.resolve) {
        try {
          this.pendingTranslation.resolve({ cancelled: true, messageId });
          this.logLifecycle(messageId, 'CANCELLED');
        } catch (e) {
          // If resolve throws for any reason, swallow to avoid unhandled exceptions
          this.logger.warn('Warning: resolving pending translation failed', e);
        }
      }

      this.pendingTranslation = null;
    }
  }

  /**
   * Wait for TRANSLATION_RESULT_UPDATE message (deprecated - use setupTranslationWaiting)
   * @param {string} messageId - Original message ID from TRANSLATE request
   * @returns {Promise<Object>} Translation result
   */
  async waitForTranslationResult(messageId) {
    return this.setupTranslationWaiting(messageId);
  }

  /**
   * Activate select element mode
   */
  async activate() {
    if (this.isActive) {
      this.logger.debug("Already active");
      return;
    }

    this.logger.operation("Activating select element mode");

    this.isActive = true;
    this.state.isActive = true;
    
    // Reset mode to base mode on activation
    this.setMode(this.config.baseMode);
    this.abortController = new globalThis.AbortController();

    // Add event listeners with abort signal
    const options = { signal: this.abortController.signal, capture: true };
    // High priority for ESC key to override OLD system
    const keyOptions = {
      signal: this.abortController.signal,
      capture: true,
      passive: false,
    };

    document.addEventListener("mouseover", this.handleMouseOver, options);
    document.addEventListener("mouseout", this.handleMouseOut, options);
    document.addEventListener("click", this.handleClick, options);

    // Add keydown listeners with high priority to capture ESC before OLD system
    document.addEventListener("keydown", this.handleKeyDown, keyOptions);
    window.addEventListener("keydown", this.handleKeyDown, keyOptions);

    // Mark that NEW select element manager is active (for OLD system coordination)
    window.translateItNewSelectManager = true;

    // Visual feedback
    this.addGlobalStyles();
    // await this.showActivationNotification() // Removed: UI will handle notification

    // Disable page interactions
    this.disablePageInteractions();
    

    this.logger.operation("Select element mode activated");
  }

  /**
   * Deactivate select element mode UI only (keep translation processing)
   */
  async deactivateUIOnly() {
    if (!this.isActive) {
      this.logger.debug("Already inactive");
      return;
    }

    this.logger.operation("Deactivating select element UI (keeping translation processing)");

    this.isActive = false;
    this.state.isActive = false;
    this.state.isCtrlPressed = false;

    // Remove most event listeners but keep ESC key handling for cancellation
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Re-add ESC key handling for background translation cancellation
    this.setupEscapeKeyListener();

    // Clean up highlights - comprehensive cleanup
    this.cleanupAllHighlights();
    this.clearOverlays();

    // Remove global styles
    this.removeGlobalStyles();

    // Re-enable page interactions
    this.enablePageInteractions();

    // Clear NEW select manager flag
    window.translateItNewSelectManager = false;

    

    this.logger.operation("Select element UI deactivated (translation continues)");
  }

  /**
   * Deactivate select element mode (full deactivation with translation cancellation)
   */
  async deactivate() {
    if (!this.isActive) {
      this.logger.debug("Already inactive");
      return;
    }

    this.logger.operation("Deactivating select element mode");

    const wasActive = this.isActive;
    this.state.isActive = false;
    this.state.isCtrlPressed = false;

    // Cancel ongoing translations for full deactivation
    if (this.pendingTranslation) {
      try {
        const pendingId = this.pendingTranslation.originalMessageId;
        this.logger.debug(`Full deactivate requested - cancelling pending translation for ${pendingId}`);
        this.logLifecycle(pendingId, 'CANCEL_REQUESTED', { via: 'deactivate' });
        this.cancelPendingTranslation(pendingId);
      } catch (err) {
        this.logger.warn('Error while cancelling pending translation on deactivate', err);
      }
      try { await this.dismissStatusNotification(); } catch { /* ignore */ }
    } else if (this.selectionProcessing) {
      // mark requestedCancel so pendingTranslation created shortly will be auto-cancelled
      this.logger.debug('Full deactivate requested while processing selection - marking requestedCancel');
      this.requestedCancel = true;
      try { await this.dismissStatusNotification(); } catch { /* ignore */ }
    }

    // Use the common UI deactivation logic if still active
    if (wasActive) {
      // Temporarily set back to active to avoid the check in deactivateUIOnly
      this.isActive = true;
      await this.deactivateUIOnly();
    }

    // Remove ESC key listener for background translation
    this.removeEscapeKeyListener();

    this.logger.operation("Select element mode fully deactivated");
  }

  /**
   * Setup ESC key listener for background translation cancellation
   */
  setupEscapeKeyListener() {
    if (this.escapeAbortController) {
      this.escapeAbortController.abort();
    }

    this.escapeAbortController = new globalThis.AbortController();
    
    const keyOptions = {
      signal: this.escapeAbortController.signal,
      capture: true,
      passive: false,
    };

    this.logger.debug("Setting up ESC key listener for background translation");

    document.addEventListener("keydown", this.handleKeyDown, keyOptions);
    window.addEventListener("keydown", this.handleKeyDown, keyOptions);
  }

  /**
   * Remove ESC key listener
   */
  removeEscapeKeyListener() {
    if (this.escapeAbortController) {
      this.logger.debug("Removing ESC key listener");
      this.escapeAbortController.abort();
      this.escapeAbortController = null;
    }
  }

  /**
   * Handle mouse over event - highlight element
   */
  handleMouseOver(event) {
    // Allow ESC to cancel even if we've deactivated normal select mode but a
    // translation is still pending (selectionProcessing true or pendingTranslation exists).
    if (!this.isActive && !this.selectionProcessing && !this.pendingTranslation) return;

    const element = event.target;

    // Find the best element to highlight (may be different from event.target)
    const bestElement = this.findBestTextElement(element);
    
    // Only highlight if we have a valid element that meets our enhanced requirements
    if (!bestElement || !this.meetsMinimumHighlightRequirements(bestElement)) {
      this.clearHighlight();
      return;
    }

    // Skip if already highlighted
    if (bestElement === this.currentHighlighted) return;

    // Clear previous highlight
    this.clearHighlight();

    // Highlight best element
    this.highlightElement(bestElement);
    this.currentHighlighted = bestElement;
  }

  /**
   * Find the best element to highlight for translation
   * Enhanced to prefer larger, more meaningful text blocks
   */
  findBestTextElement(startElement) {
    let element = startElement;
    let bestCandidate = null;
    let bestScore = 0;
    let maxAncestors = this.config.maxAncestors;

    // Walk up the DOM tree to find the best element
    while (element && element !== document.body && maxAncestors-- > 0) {
      if (this.isValidTextElement(element)) {
        const score = this.calculateElementScore(element);
        
        // Only consider elements that meet minimum requirements
        if (this.meetsMinimumHighlightRequirements(element)) {
          if (score > bestScore) {
            bestCandidate = element;
            bestScore = score;
          }
        }
      }
      element = element.parentElement;
    }

    // If no candidate meets requirements, try to find a suitable parent
    if (!bestCandidate) {
      bestCandidate = this.findSuitableParent(startElement);
    }

    // Final optimization: check if we should prefer a better child
    if (bestCandidate) {
      const optimizedCandidate = this.optimizeElementSelection(bestCandidate, startElement);
      if (optimizedCandidate) {
        bestCandidate = optimizedCandidate;
      }
    }

    return bestCandidate;
  }

  /**
   * Calculate a score for element suitability based on size, content, and structure
   */
  calculateElementScore(element) {
    const rect = element.getBoundingClientRect();
    const area = rect.width * rect.height;
    const textContent = element.textContent?.trim() || "";
    const textLength = textContent.length;
    
    // Heavy emphasis on larger areas - exponential scaling for bigger elements
    let score = Math.min(area / 500, 200); // Higher cap and lower divisor for bigger bonus
    
    // Extra bonus for very large areas
    if (area > 100000) score += 50;
    else if (area > 80000) score += 30;
    else if (area > 60000) score += 20;
    
    // Significant bonus for substantial text content
    if (textLength > 500) score += 60;
    else if (textLength > 200) score += 40;
    else if (textLength > 100) score += 25;
    else if (textLength > 50) score += 10;
    
    // Strong preference for container block-level elements
    const tagName = element.tagName.toLowerCase();
    if (['div', 'article', 'section', 'main', 'content'].includes(tagName)) {
      score += 40; // Increased bonus for containers
    } else if (['p', 'li', 'td', 'blockquote'].includes(tagName)) {
      score += 25;
    } else if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
      score += 15;
    }
    
    // Less penalty for aspect ratio to allow wider containers
    const aspectRatio = rect.width / rect.height;
    if (aspectRatio > 15 || aspectRatio < 0.05) {
      score -= 15; // Reduced penalty
    }
    
    // Bigger bonus for elements with substantial immediate text
    const immediateText = this.getImmediateTextContent(element);
    if (immediateText && immediateText.length > 100) {
      score += 40;
    } else if (immediateText && immediateText.length > 50) {
      score += 20;
    }
    
    return score;
  }

  /**
   * Check if element meets minimum requirements for highlighting
   */
  meetsMinimumHighlightRequirements(element) {
    const rect = element.getBoundingClientRect();
    const area = rect.width * rect.height;
    const textLength = element.textContent?.trim().length || 0;
    
    // Much stricter requirements for bigger selections only
    return area >= this.config.minHighlightArea &&
           rect.width >= this.config.minHighlightWidth &&
           rect.height >= this.config.minHighlightHeight &&
           textLength >= 30 && // Increased minimum text length
           // Additional check: element should have substantial visible content
           this.hasSubstantialContent(element);
  }

  /**
   * Check if element has substantial content worth translating
   */
  hasSubstantialContent(element) {
    const textContent = element.textContent?.trim() || "";
    
    // Must have decent amount of text
    if (textContent.length < 30) return false;
    
    // Should have multiple words
    const words = textContent.split(/\s+/).filter(word => word.length > 1);
    if (words.length < 5) return false;
    
    // Prefer elements that are likely to be content containers
    const tagName = element.tagName.toLowerCase();
    const isContentTag = ['div', 'p', 'article', 'section', 'main', 'li', 'td', 'blockquote'].includes(tagName);
    
    // More lenient for content tags, stricter for others
    return isContentTag ? textContent.length >= 30 : textContent.length >= 80;
  }

  /**
   * Find a suitable parent when no immediate candidate is found
   */
  findSuitableParent(startElement) {
    let element = startElement;
    let attempts = 0;
    const maxAttempts = 12; // More attempts to find bigger parents
    let bestCandidate = null;
    let bestScore = 0;
    
    // Keep going up to find the biggest suitable parent
    while (element && element !== document.body && attempts++ < maxAttempts) {
      element = element.parentElement;
      if (element && this.meetsMinimumHighlightRequirements(element)) {
        const score = this.calculateElementScore(element);
        // Always prefer the bigger/better parent
        if (score > bestScore) {
          bestCandidate = element;
          bestScore = score;
        }
      }
    }
    
    return bestCandidate;
  }

  /**
   * Optimize element selection by checking for better children or parents
   */
  optimizeElementSelection(candidate, originalElement) {
    // First check if parent would be better (prioritize going up for bigger selections)
    const parent = candidate.parentElement;
    if (parent && parent !== document.body) {
      const candidateScore = this.calculateElementScore(candidate);
      const parentScore = this.calculateElementScore(parent);
      
      // More aggressive parent preference - easier threshold
      if (parentScore > candidateScore * this.config.parentSizeMultiplier && 
          this.meetsMinimumHighlightRequirements(parent)) {
        const parentArea = parent.getBoundingClientRect().width * parent.getBoundingClientRect().height;
        // Allow much larger parents (increased from 100k to 500k)
        if (parentArea < 500000) {
          return parent;
        }
      }
    }
    
    // Only check for better children if parent wasn't suitable
    // and current candidate is very large
    const candidateArea = candidate.getBoundingClientRect().width * candidate.getBoundingClientRect().height;
    if (candidateArea > this.config.preferredMinArea * 2) {
      const betterChild = this.findBetterChildElement(candidate, originalElement);
      if (betterChild) {
        return betterChild;
      }
    }
    
    return candidate;
  }

  /**
   * Check if there's a better child element to select instead of the parent
   */
  findBetterChildElement(parentElement, originalElement) {
    const parentScore = this.calculateElementScore(parentElement);
    const parentArea = parentElement.getBoundingClientRect().width * parentElement.getBoundingClientRect().height;
    
    // Only look for better children in reasonably large parents
    if (parentArea < this.config.preferredMinArea) return null;
    
    let bestChild = null;
    let bestChildScore = 0;
    
    // Search through children (with depth limit)
    const searchDepth = this.config.maxChildSearchDepth;
    const candidateChildren = this.findCandidateChildren(parentElement, originalElement, searchDepth);
    
    for (const child of candidateChildren) {
      if (this.isValidTextElement(child)) {
        const childScore = this.calculateElementScore(child);
        const childArea = child.getBoundingClientRect().width * child.getBoundingClientRect().height;
        
        // Prefer child if:
        // 1. It has a good score
        // 2. It meets minimum requirements
        // 3. It's not too much smaller than parent (maintains meaningful size)
        const areaRatio = childArea / parentArea;
        
        if (childScore > bestChildScore && 
            this.meetsMinimumHighlightRequirements(child) &&
            areaRatio > 0.2 && // Not too small compared to parent
            childScore > parentScore * 0.8) { // Competitive score
          
          bestChild = child;
          bestChildScore = childScore;
        }
      }
    }
    
    return bestChild;
  }

  /**
   * Find candidate child elements that contain or are near the original element
   */
  findCandidateChildren(parentElement, originalElement, maxDepth) {
    const candidates = [];
    
    const collectCandidates = (element, depth) => {
      if (depth > maxDepth) return;
      
      for (const child of element.children) {
        // Include child if it contains original element or has meaningful content
        if (child.contains(originalElement) || 
            child === originalElement ||
            (child.textContent?.trim().length || 0) > 30) {
          candidates.push(child);
        }
        
        // Recursively search deeper
        if (depth < maxDepth) {
          collectCandidates(child, depth + 1);
        }
      }
    };
    
    collectCandidates(parentElement, 0);
    return candidates;
  }

  /**
   * Handle mouse out event - remove highlight
   */
  handleMouseOut(event) {
    if (!this.isActive) return;

    const element = event.target;

    // Only clear if leaving the highlighted element
    if (element === this.currentHighlighted) {
      // Small delay to prevent flicker when moving between child elements
      setTimeout(() => {
        if (this.currentHighlighted === element) {
          this.clearHighlight();
          this.currentHighlighted = null;
        }
      }, 50);
    }
  }

  /**
   * Handle click event - select element for translation
   */
  async handleClick(event) {
    if (!this.isActive) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation(); // Prevent other handlers

    // Enhanced debouncing to prevent rapid clicks
    if (this.isProcessingClick) {
      this.logger.debug("Already processing click, ignoring");
      return;
    }

    const currentTime = Date.now();
    // Increased debounce time for better UX
    if (this.lastClickTime && currentTime - this.lastClickTime < 200) {
      this.logger.debug("Double click detected, ignoring", {
        timeDiff: currentTime - this.lastClickTime
      });
      return;
    }

    this.isProcessingClick = true;
    this.lastClickTime = currentTime;

    // Always use the currently highlighted element for translation, if available
    const element = event.target;
    let targetElement = this.currentHighlighted;
    // If currentHighlighted is not valid, fallback to event.target
    if (!targetElement || !(targetElement instanceof HTMLElement)) {
      targetElement = element;
      this.logger.debug("[handleClick] No valid highlight, using clicked element", targetElement);
    } else {
      this.logger.debug("[handleClick] Using highlighted element for translation", targetElement);
    }
    // Debug: log tagName, className, and text preview
    this.logger.debug("[handleClick] Selected element for translation", {
      tagName: targetElement?.tagName,
      className: targetElement?.className,
      textPreview: (targetElement?.textContent || "").substring(0, 100)
    });

    const currentMode = this.state.isCtrlPressed ? SELECT_ELEMENT_MODES.SIMPLE : SELECT_ELEMENT_MODES.SMART;
    const modeEmoji = SelectElementValidation.getModeEmoji(currentMode);
    const modeIndicator = `${modeEmoji} ${currentMode.toUpperCase()}`;
    this.logger.info(`Element selected (${modeIndicator} mode):`, element);

    try {
      // Extract text from the target element
      const extractedText = this.extractTextFromElement(targetElement);
      if (!extractedText || extractedText.trim().length === 0) {
        this.logger.warn("No text found in selected element", {
          element: targetElement,
          tagName: targetElement.tagName,
          textContent: (targetElement.textContent || "").substring(0, 50)
        });
        await this.showNoTextNotification();
        this.isProcessingClick = false;
        return;
      }

      this.logger.info(
        "[SelectElementManager] Text extracted successfully:",
        {
          length: extractedText.length,
          preview: extractedText.substring(0, 100) + (extractedText.length > 100 ? "..." : "")
        }
      );

      // Mark that we're processing this selection and keep manager active
      // so ESC can cancel the in-flight translation.
      this.selectionProcessing = true;

      // Show status notification immediately for better UX
      this.showStatusNotification("در حال ترجمه...");

      // Deactivate select element mode immediately after click (UI only)
      this.logger.operation("Deactivating select element mode after element selection");
      await this.deactivateUIOnly();

      // Notify background that selection mode is deactivating to sync UI
      try {
        const { sendReliable } = await import('../../messaging/core/ReliableMessaging.js');
        await sendReliable({ action: MessageActions.SET_SELECT_ELEMENT_STATE, data: { activate: false } });
        this.logger.debug('Notified background: select element deactivated on click for UI sync');
      } catch (err) {
        this.logger.warn('Failed to notify background about deactivation on click', err);
      }

      // Process element with full text extraction (in background)
      // Note: Translation continues in background, user can continue browsing
      this.processSelectedElement(targetElement).catch(error => {
        this.logger.error("Background translation failed", error);
      });
    } catch (error) {
      this.logger.error("Element selection error", error);

      // Handle error via ErrorHandler
      await this.errorHandler.handle(error, {
        type: ErrorTypes.INTEGRATION,
        context: "select-element-click",
      });

      await this.showErrorNotification(error.message);
    } finally {
      this.isProcessingClick = false;
    }
  }

  /**
   * Log lifecycle events for a messageId (stores in internal Map and console.debug)
   */
  logLifecycle(messageId, state, extra = {}) {
    if (!messageId) return;
    const ts = Date.now();
    const entry = { messageId, state, timestamp: ts, source: 'content', extra };
    try {
      // store history array for each messageId
      const arr = this.messageLifecycle.get(messageId) || [];
      arr.push(entry);
      this.messageLifecycle.set(messageId, arr);
      if (this.tracing) {
        this.logger.debug('[SelectElementManager][lifecycle]', entry);
      }
    } catch {
      // swallow any tracing errors
    }
  }

  /**
   * Handle keyboard events
   */
  async handleKeyDown(event) {
    // Allow ESC to work even when inactive if translation is processing
    if (!this.isActive && !this.selectionProcessing && !this.pendingTranslation) return;

    this.logger.debug("KeyDown event received", {
      key: event.key,
      code: event.code,
      target: event.target?.tagName,
      isActive: this.isActive,
      selectionProcessing: this.selectionProcessing,
      hasPendingTranslation: !!this.pendingTranslation
    });

    if (event.key === "Escape" || event.code === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      this.logger.operation("ESC pressed - cancelling selection");

      // If a translation is pending, cancel it first (notify background + resolve pending)
      if (this.pendingTranslation) {
        try {
          const pendingId = this.pendingTranslation.originalMessageId;
          this.logger.debug(`ESC pressed - cancelling pending translation for ${pendingId}`);
          await this.cancelPendingTranslation(pendingId);
          // Allow microtask queue to settle so pendingTranslation resolution is processed
          await Promise.resolve();
        } catch (err) {
          this.logger.warn('Error while cancelling pending translation on ESC', err);
        }
      } else if (this.selectionProcessing) {
        // Translation hasn't started waiting yet (user pressed ESC quickly).
        // Remember that a cancel was requested so setupTranslationWaiting can
        // cancel the pending translation as soon as it's created.
        this.logger.debug('ESC pressed before pending translation created - marking requestedCancel');
        this.requestedCancel = true;
      }

      // If there are translated elements, revert them
      if (this.translatedElements.size > 0) {
        this.logger.debug(
          "[SelectElementManager] Reverting translations before deactivation"
        );
        try {
          await this.revertTranslations();
        } catch (err) {
          this.logger.warn('Error while reverting translations on ESC', err);
        }
      }

      // Clean up status notification
      try { 
        await this.dismissStatusNotification(); 
      } catch { 
        /* ignore */ 
      }

      // Deactivate if still active
      try {
        if (this.isActive) {
          await this.deactivate();
          // After organic deactivation, NOTIFY THE BACKGROUND so other UIs can sync
          try {
            const { sendReliable } = await import('../../messaging/core/ReliableMessaging.js');
            await sendReliable({ action: MessageActions.SET_SELECT_ELEMENT_STATE, data: { activate: false } });
            this.logger.debug('Notified background: select element deactivated via ESC key');
          } catch (err) {
            this.logger.warn('Failed to notify background about ESC deactivation', err);
          }
        }
      } catch (err) {
        this.logger.warn('Error while deactivating on ESC', err);
      }

      return false;
    }
  }

  /**
   * Check if element is valid for text extraction
   */
  isValidTextElement(element) {
    // Check cache first
    if (this.elementValidationCache.has(element)) {
      return this.elementValidationCache.get(element);
    }
    
    let isValid = false;
    
    try {
      if (this.config.mode === SELECT_ELEMENT_MODES.SIMPLE) {
        // Simple mode - like OLD system: just check basic validity
        isValid = this.isValidTextElement_Simple(element);
      } else if (this.config.mode === SELECT_ELEMENT_MODES.SMART) {
        // Smart mode - enhanced validation
        isValid = this.isValidTextElement_Smart(element);
      } else {
        // Fallback to simple mode for unknown modes
        this.logger.warn(`Unknown validation mode: ${this.config.mode}, falling back to simple`);
        isValid = this.isValidTextElement_Simple(element);
      }
    } catch (error) {
      // If any error occurs during validation, assume invalid
      this.logger.debug("Error validating element:", error);
      isValid = false;
    }
    
    // Cache the result
    this.elementValidationCache.set(element, isValid);
    return isValid;
  }

  /**
   * Simple validation like OLD system - minimal checks
   */
  isValidTextElement_Simple(element) {
    // Skip script, style, and other non-text elements
    const invalidTags = ["SCRIPT", "STYLE", "NOSCRIPT", "HEAD", "META", "LINK"];
    if (invalidTags.includes(element.tagName)) return false;

    // Skip invisible elements
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (style.opacity === "0") return false;

    // Must have text content or be a text input
    const hasText = element.textContent && element.textContent.trim().length > 0;
    const isTextInput = element.tagName === "INPUT" && element.type === "text";
    const isTextArea = element.tagName === "TEXTAREA";

    return hasText || isTextInput || isTextArea;
  }

  /**
   * Smart validation with enhanced checks
   */
  isValidTextElement_Smart(element) {
    // Skip script, style, and other non-text elements
    const invalidTags = ["SCRIPT", "STYLE", "NOSCRIPT", "HEAD", "META", "LINK"];
    if (invalidTags.includes(element.tagName)) return false;

    // Skip invisible elements
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }

    // Handle input elements separately
    const isTextInput = element.tagName === "INPUT" && (element.type === "text" || element.type === "textarea");
    const isTextArea = element.tagName === "TEXTAREA";
    
    if (isTextInput || isTextArea) {
      const value = element.value || "";
      return this.isValidTextContent(value.trim());
    }

    // For regular elements, check if they contain meaningful text
    return this.hasValidTextContent(element);
  }

  /**
   * Check if text content is meaningful and worth translating
   */
  isValidTextContent(text) {
    if (!text || text.length === 0) return false;
    
    // Minimum length requirement (configurable)
    if (text.length < this.config.minTextLength) return false;

    // Skip pure numbers, symbols, or whitespace
    const onlyNumbersSymbols = /^[\d\s\p{P}\p{S}]+$/u.test(text);
    if (onlyNumbersSymbols) return false;

    // Skip URLs and email addresses
    const urlPattern = /^https?:\/\/|www\.|@.*\./;
    if (urlPattern.test(text)) return false;

    // Skip single words that are likely UI elements
    const words = text.trim().split(/\s+/);
    if (words.length === 1) {
      const word = words[0].toLowerCase();
      const commonUIWords = [
        'ok', 'cancel', 'yes', 'no', 'submit', 'reset', 'login', 'logout',
        'menu', 'home', 'back', 'next', 'prev', 'previous', 'continue',
        'skip', 'done', 'finish', 'close', 'open', 'save', 'edit', 'delete',
        'search', 'filter', 'sort', 'view', 'hide', 'show', 'toggle'
      ];
      if (commonUIWords.includes(word)) return false;
    }

    // Check for minimum word count for meaningful content
    if (words.length < this.config.minWordCount) return false;

    return true;
  }

  /**
   * Check if element has valid text content using smart detection
   */
  hasValidTextContent(element) {
    // Get immediate text content (not from children)
    const immediateText = this.getImmediateTextContent(element);
    
    // If element has meaningful immediate text, it's valid
    if (this.isValidTextContent(immediateText)) {
      return true;
    }

    // Check if it's a leaf element with valid text
    if (this.isLeafTextElement(element)) {
      const leafText = element.textContent?.trim() || "";
      return this.isValidTextContent(leafText);
    }

    // For container elements, be more selective
    return this.isValidContainerElement(element);
  }

  /**
   * Get immediate text content of element (excluding children)
   */
  getImmediateTextContent(element) {
    let text = "";
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      }
    }
    return text.trim();
  }

  /**
   * Check if element is a leaf element with text
   */
  isLeafTextElement(element) {
    // Consider elements with no child elements (only text nodes) as leaf elements
    const hasChildElements = Array.from(element.children).length > 0;
    if (hasChildElements) return false;

    // Check common leaf text elements
    const leafTags = ['P', 'SPAN', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 
                     'LI', 'TD', 'TH', 'LABEL', 'A', 'STRONG', 'EM', 'B', 'I'];
    
    return leafTags.includes(element.tagName);
  }

  /**
   * Check if container element is valid for translation
   */
  isValidContainerElement(element) {
    // Skip common navigation and UI containers
    const skipContainers = ['NAV', 'HEADER', 'FOOTER', 'ASIDE', 'MENU'];
    if (skipContainers.includes(element.tagName)) return false;

    // Skip elements with common UI class names
    const className = element.className || "";
    const uiClassPatterns = [
      /nav/i, /menu/i, /header/i, /footer/i, /sidebar/i, /toolbar/i,
      /btn/i, /button/i, /icon/i, /logo/i, /badge/i, /tag/i,
      /pagination/i, /breadcrumb/i, /dropdown/i, /modal/i
    ];
    
    if (uiClassPatterns.some(pattern => pattern.test(className))) {
      return false;
    }

    // Check if container has a reasonable amount of meaningful text
    const totalText = element.textContent?.trim() || "";
    if (!this.isValidTextContent(totalText)) return false;

    // Check text density - avoid containers that are mostly whitespace/structure
    const textLength = totalText.length;
    const elementArea = element.offsetWidth * element.offsetHeight;
    
    // Skip very large containers with little text (likely layout containers)
    if (elementArea > this.config.maxElementArea && textLength < 100) return false;

    // Check if most of the text comes from a single child (prefer the child instead)
    const children = Array.from(element.children);
    if (children.length === 1) {
      const childText = children[0].textContent?.trim() || "";
      const textRatio = childText.length / textLength;
      
      // If child contains most of the text, prefer the child
      if (textRatio > 0.8) return false;
    }

    return true;
  }

  /**
   * Highlight element - uses OLD system CSS only (no extra classes)
   */
  highlightElement(element) {
    const currentMode = this.state.isCtrlPressed ? SELECT_ELEMENT_MODES.SIMPLE : SELECT_ELEMENT_MODES.SMART;
    const modeEmoji = SelectElementValidation.getModeEmoji(currentMode);
    const modeIndicator = `${modeEmoji} ${currentMode.toUpperCase()}`;
    this.logger.debug(
      `[SelectElementManager] Highlighting element (${modeIndicator}):`,
      element.tagName,
      element.className
    );

    // Remove highlight from previous element
    if (this.currentHighlighted && this.currentHighlighted !== element) {
      this.currentHighlighted.style.backgroundColor = '';
      this.currentHighlighted.classList.remove('translate-it-element-highlighted');
    }

    // Apply highlighting using CSS class instead of inline background
    element.classList.add('translate-it-element-highlighted');
    this.currentHighlighted = element;
  }

  /**
   * Clear current highlight
   */
  clearHighlight() {
    if (this.currentHighlighted) {
      // Remove both inline styles and CSS classes
      this.currentHighlighted.style.backgroundColor = '';
      this.currentHighlighted.classList.remove('translate-it-element-highlighted');
      this.currentHighlighted = null;
    }
  }

  /**
   * Clean up all highlighting artifacts from the page
   */
  cleanupAllHighlights() {
    // Remove all yellow background styles that might be stuck
    const elementsWithYellowBg = document.querySelectorAll('*[style*="background-color: yellow"], *[style*="backgroundColor: yellow"]');
    elementsWithYellowBg.forEach(element => {
      element.style.backgroundColor = '';
    });

    // Remove all highlight classes
    const highlightedElements = document.querySelectorAll('.translate-it-element-highlighted');
    highlightedElements.forEach(element => {
      element.classList.remove('translate-it-element-highlighted');
    });

    // Clear current reference
    this.currentHighlighted = null;
  }

  /**
   * Clear all overlay elements
   */
  clearOverlays() {
    this.overlayElements.forEach((overlay) => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    });
    this.overlayElements.clear();
  }

  /**
   * Extract text from selected element
   */
  extractTextFromElement(element) {
    const currentMode = this.state.isCtrlPressed ? SELECT_ELEMENT_MODES.SIMPLE : SELECT_ELEMENT_MODES.SMART;
    const modeEmoji = SelectElementValidation.getModeEmoji(currentMode);
    const modeIndicator = `${modeEmoji} ${currentMode.toUpperCase()}`;
    this.logger.debug(`[extractTextFromElement] Starting extraction (${modeIndicator}):`, {
      tagName: element.tagName,
      className: element.className,
      id: element.id,
      mode: this.config.mode
    });

    // Handle input elements
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      const value = element.value || "";
      this.logger.debug("[extractTextFromElement] Input element, value:", value);
      return value;
    }

    let extractedText = "";
    
    if (this.config.mode === SELECT_ELEMENT_MODES.SIMPLE) {
      // Simple mode - like OLD system
      extractedText = this.extractTextFromElement_Simple(element);
    } else {
      // Smart mode - multiple extraction methods
      extractedText = this.extractTextFromElement_Smart(element);
    }

    this.logger.debug("[extractTextFromElement] Final extracted text:", {
      length: extractedText.length,
      text: extractedText.substring(0, 100) + (extractedText.length > 100 ? '...' : '')
    });

    return extractedText;
  }

  /**
   * Simple text extraction like OLD system
   */
  extractTextFromElement_Simple(element) {
    // Just use textContent.trim() like OLD system
    const text = (element.textContent || "").trim();
    this.logger.debug("[extractTextFromElement_Simple] Extracted:", text);
    return text;
  }

  /**
   * Smart text extraction with multiple methods and better fallback handling
   */
  extractTextFromElement_Smart(element) {
    let extractedText = "";
    
    // Method 1: For container elements, prefer full textContent
    if (element.children.length > 0) {
      const fullText = (element.textContent || "").trim();
      if (fullText && fullText.length >= 10) {
        extractedText = fullText;
        this.logger.debug("[extractTextFromElement_Smart] Using full container text:", extractedText.substring(0, 100));
        return extractedText;
      }
    }
    
    // Method 2: Try immediate text content first (for leaf elements)
    const immediateText = this.getImmediateTextContent(element);
    if (immediateText && this.isValidTextContent(immediateText)) {
      extractedText = immediateText;
      this.logger.debug("[extractTextFromElement_Smart] Using immediate text:", extractedText);
    }
    
    // Method 3: If no immediate text, try simple textContent with relaxed validation
    if (!extractedText) {
      const simpleText = (element.textContent || "").trim();
      if (simpleText && simpleText.length >= 3) {
        extractedText = simpleText;
        this.logger.debug("[extractTextFromElement_Smart] Using simple textContent:", extractedText.substring(0, 100));
      }
    }
    
    // Method 4: If still no text, try innerText (respects visibility)
    if (!extractedText && element.innerText) {
      const innerText = element.innerText.trim();
      if (innerText && innerText.length >= 3) {
        extractedText = innerText;
        this.logger.debug("[extractTextFromElement_Smart] Using innerText:", extractedText.substring(0, 100));
      }
    }
    
    // Method 5: Use tree walker as fallback with relaxed filtering
    if (!extractedText) {
      extractedText = this.extractTextWithTreeWalker(element);
      this.logger.debug("[extractTextFromElement_Smart] Using tree walker:", extractedText.substring(0, 100));
    }
    
    // Final cleanup: ensure we have some meaningful text
    if (extractedText && extractedText.length < 3) {
      this.logger.debug("[extractTextFromElement_Smart] Text too short, clearing:", extractedText);
      extractedText = "";
    }

    return extractedText;
  }

  /**
   * Extract text using tree walker with relaxed filtering
   */
  extractTextWithTreeWalker(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        // Skip text in hidden elements
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        try {
          const style = window.getComputedStyle(parent);
          if (style.display === "none" || style.visibility === "hidden") {
            return NodeFilter.FILTER_REJECT;
          }
        } catch {
          // If getComputedStyle fails, accept the node
        }

        // Accept any non-empty text nodes (relaxed filtering)
        const textContent = node.textContent.trim();
        if (!textContent) return NodeFilter.FILTER_REJECT;

        // Skip text from script or style tags
        if (parent.closest('script, style, noscript')) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node;
    const textParts = [];
    while ((node = walker.nextNode())) {
      const nodeText = node.textContent.trim();
      if (nodeText) {
        // Preserve structure by adding space only when necessary
        textParts.push(nodeText);
      }
    }

    return textParts.join(" ").trim();
  }

  /**
   * Process selected element using complete advanced text extraction system
   * Follows the exact same process as OLD handleSelect_ElementClick method
   */
  async processSelectedElement(element) {
    this.logger.debug(
      "[SelectElementManager] Starting advanced text extraction process"
    );

    // messageId is declared in outer scope so finally block can reference it
    let messageId = null;
    let textHash = null;

    try {
      // Pre-check: validate element and extract basic text first
      const basicText = this.extractTextFromElement(element);
      if (!basicText || basicText.trim().length === 0) {
        await this.showNoTextNotification();
        return { status: "empty", reason: "no_text_found" };
      }

      // Generate hash for failure tracking
      textHash = this.generateTextHash(basicText.trim());
      
      // Check if this text should be retried
      if (!this.canRetryText(textHash)) {
        const failure = this.failureTracker.get(textHash);
        await this.showWarningNotification(
          `Translation skipped - too many recent failures (${failure.attempts}/${this.retryConfig.maxRetries})`
        );
        return { 
          status: "skipped", 
          reason: "failure_cooldown",
          attempts: failure.attempts 
        };
      }
      // Import all required functions from advanced text extraction
      const {
        collectTextNodes,
        separateCachedAndNewTexts,
        expandTextsForTranslation,
        parseAndCleanTranslationResponse,
        reassembleTranslations,
        applyTranslationsToNodes,
      } = await import("../../utils/text/extraction.js");

      // Handle input/textarea elements with simple processing first
      if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
        this.logger.debug(
          "[SelectElementManager] Processing input/textarea with simple translation"
        );

        const inputText = element.value;
        if (!inputText.trim()) {
          await this.showNoTextNotification();
          return;
        }

        // Get current provider and language settings
        const {
          getTranslationApiAsync,
          getSourceLanguageAsync,
          getTargetLanguageAsync,
        } = await import("../../config.js");

        const provider = await getTranslationApiAsync();
        const sourceLanguage = await getSourceLanguageAsync();
        const targetLanguage = await getTargetLanguageAsync();

        // Import TranslationMode to use proper constant
        const { TranslationMode } = await import("../../config.js");
        
        // Use UnifiedMessenger translate method
        this.logger.debug("[SelectElementManager] Sending translation request:", {
          text: inputText.substring(0, 50) + (inputText.length > 50 ? '...' : ''),
          provider,
          from: sourceLanguage,
          to: targetLanguage,
          mode: TranslationMode.Field
        });

        // For field translation, let the existing ContentMessageHandler system handle it
        // We send the translation request and the TRANSLATION_RESULT_UPDATE will be processed by SmartTranslation
        this.logger.debug("[SelectElementManager] Sending field translation request (will be handled by ContentMessageHandler)");
        
        // Add unique messageId to avoid conflicts
        const messageId = `field-translation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const translationRequest = {
          text: inputText,
          provider: provider,
          from: sourceLanguage,
          to: targetLanguage,
          mode: TranslationMode.Field,
          messageId: messageId
        };
        
        // Send translation request - don't wait for direct response
        // The ContentMessageHandler will process TRANSLATION_RESULT_UPDATE and apply SmartTranslation
        try {
          // Create and send message directly using browser.runtime.sendMessage
          const message = MessageFormat.create(
            MessageActions.TRANSLATE,
            translationRequest,
            MessagingContexts.CONTENT,
            { messageId: messageId }
          );
          
          // Fire and forget via reliable messenger - let SmartTranslation system handle the result
          try {
            const { sendReliable } = await import('@/messaging/core/ReliableMessaging.js');
            // We don't need the result here; rely on TRANSLATION_RESULT_UPDATE
            await sendReliable(message).catch(err => {
              this.logger.warn('Translation message send failed (reliable):', err);
            });
          } catch (err) {
            // Fallback to browser.runtime.sendMessage if import fails
            this.browser.runtime.sendMessage(message).catch(error => {
              this.logger.warn('Translation message send failed (browser fallback):', error);
            });
          }
          
          this.logger.debug("[SelectElementManager] Field translation request sent, letting ContentMessageHandler process result");
          
          // Store the element so SmartTranslation can find it
          this.state.originalTexts.set(element, element.value);
          this.translatedElements.add(element);
          
          // Show a temporary notification that translation is in progress
          await this.showSuccessNotification("Translation request sent...", 2000);
          
        } catch (error) {
          this.logger.error("[SelectElementManager] Failed to send field translation request:", error);
          throw new Error("Failed to send translation request");
        }
        return;
      }

      // 1) Collect text nodes from selected element (same as OLD)
      const { textNodes, originalTextsMap } = collectTextNodes(element);

      if (!originalTextsMap.size) {
        this.logger.warn("No text nodes found in element");
        await this.showNoTextNotification();
        return { status: "empty", reason: "no_text_found" };
      }

      // 2) Separate cached and new texts (same as OLD)
      const { textsToTranslate, cachedTranslations } =
        separateCachedAndNewTexts(originalTextsMap);

      // If only cached translations exist
      if (!textsToTranslate.length && cachedTranslations.size) {
        this.logger.info("Using only cached translations");

        // Dismiss the "Translating..." status notification shown on click
        await this.dismissStatusNotification();

        const context = {
          state: this.state,  // Use proper state structure
          IconManager: null,  // Vue system doesn't use IconManager
        };
        applyTranslationsToNodes(textNodes, cachedTranslations, context);
        await this.showSuccessNotification("Translation loaded from cache");
        return {
          status: "success",
          source: "cache",
          translatedCount: cachedTranslations.size,
        };
      }

      // If no new texts to translate
      if (!textsToTranslate.length) {
        return { status: "skip", reason: "no_new_texts" };
      }

      // 3) Expand texts for translation (same as OLD)
      const { expandedTexts, originMapping } =
        expandTextsForTranslation(textsToTranslate);

      // 4) Create JSON payload (same as OLD)
      const jsonPayload = JSON.stringify(
        expandedTexts.map((t) => ({ text: t }))
      );

      // Enhanced payload size checking with user-friendly messages
      if (jsonPayload.length > 50_000) {
        const sizeKB = Math.round(jsonPayload.length / 1024);
        const message = `متن انتخابی بسیار بزرگ است (${sizeKB} KB) - لطفا متن کوچکتری انتخاب کنید`;
        await this.showErrorNotification(message);
        return { status: "error", reason: "payload_too_large", message, sizeBytes: jsonPayload.length };
      }
      
      if (jsonPayload.length > 25_000) {
        const sizeKB = Math.round(jsonPayload.length / 1024);
        await this.showWarningNotification(`متن بزرگ انتخاب شده (${sizeKB} KB) - ترجمه ممکن است کمی طول بکشد`);
      }

      this.logger.debug(
        "[SelectElementManager] Sending translation request to background"
      );

      // Generate message ID for tracking
      messageId = generateContentMessageId('select-element');
      
      // 5) Setup pending translation BEFORE sending message (to avoid race condition)
      const translationPromise = this.setupTranslationWaiting(messageId);
      this.logLifecycle(messageId, 'PENDING', { startTime: Date.now() });

      // 6) Send translation request directly using browser.runtime.sendMessage
      const payload = {
        // For Select Element we send a raw JSON payload (array of {text})
        // and mark the message so the background handler knows to parse it.
        text: jsonPayload, // Send jsonPayload like OLD system
        from: 'auto',
        to: await (async () => {
          const { getTargetLanguageAsync } = await import("../../config.js");
          return await getTargetLanguageAsync();
        })(),
        provider: await (async () => {
          const { getTranslationApiAsync } = await import("../../config.js");
          return await getTranslationApiAsync();
        })(),
        messageId: messageId, // Pass messageId like OLD system
        // Indicate translation mode and that the payload is raw JSON
        mode: 'SelectElement',
        options: { rawJsonPayload: true },
      };
      
      this.logger.debug("Sending translation request with payload", payload);
      
      // Send direct message to background using reliable messenger
      try {
        const { sendReliable } = await import('@/messaging/core/ReliableMessaging.js');
        await sendReliable({
          action: MessageActions.TRANSLATE,
          messageId: messageId,
          context: 'event-handler',
          timestamp: Date.now(),
          data: {
            text: payload.text,
            provider: payload.provider,
            sourceLanguage: payload.from,
            targetLanguage: payload.to,
            mode: payload.mode,
            options: payload.options
          }
        })
      } catch (err) {
        this.logger.warn("sendReliable failed, falling back to browser.runtime.sendMessage", err);
        try {
          const message = {
            action: MessageActions.TRANSLATE,
            messageId: messageId,
            context: 'event-handler',
            timestamp: Date.now(),
            data: {
              text: payload.text,
              provider: payload.provider,
              sourceLanguage: payload.from,
              targetLanguage: payload.to,
              mode: payload.mode,
              options: payload.options
            }
          };
          await browser.runtime.sendMessage(message);
        } catch (error) {
          this.logger.error("Failed to send translation request (fallback)", error);
          throw error; // Re-throw to be caught by the outer catch block
        }
      }

      this.logger.info("Translation request accepted, waiting for result...");
      this.logLifecycle(messageId, 'SENT', { provider: payload.provider });
      
      // 8) Wait for TRANSLATION_RESULT_UPDATE message
      const translationResult = await translationPromise;

      // If the pending promise was resolved as cancelled, handle gracefully
      if (translationResult && translationResult.cancelled) {
        this.logger.info(`Translation was cancelled for messageId: ${translationResult.messageId}`);
        await this.dismissStatusNotification();
        return { status: 'cancelled', messageId: translationResult.messageId };
      }

      // Handle translation errors like OLD system
      if (!translationResult || translationResult.error || !translationResult.translatedText) {
        const rawError = translationResult?.error;
        let msg = "(⚠️ خطایی در ترجمه رخ داد.)"; // Persian like OLD system

        // Derive a human friendly message from the error object if possible
        try {
          if (rawError) {
            if (typeof rawError === 'string') {
              msg = rawError;
            } else if (rawError.message) {
              msg = rawError.message;
            } else if (rawError.code) {
              msg = `Error: ${rawError.code}`;
            } else {
              msg = JSON.stringify(rawError);
            }
          }
        } catch {
          // fallback to default message
          msg = "(⚠️ خطایی در ترجمه رخ داد.)";
        }

        // Handle timeout specifically - less severe than other errors
        if (translationResult?.timeout) {
          this.logger.warn("Translation timeout", { msg, rawError });
          await this.showWarningNotification("Translation taking longer than expected. It may complete in background.");
          return { status: "timeout", reason: "timeout", message: msg };
        } else {
          this.logger.error("Translation result failed", { msg, rawError });
          // Use centralized error handling instead of direct notification
          // Use msg instead of rawError to ensure we get the specific error message
          const translationError = new Error(msg);
          await this.errorHandler.handle(translationError, {
            context: "select-element"
            // Let ErrorHandler auto-detect the type from the error message
          });
          return { status: "error", reason: "backend_error", message: msg, rawError };
        }
      }

      // Get translated text from result (handle both formats like OLD system)
      const translatedJsonString = translationResult?.translatedText || translationResult?.data?.translatedText;

      if (typeof translatedJsonString !== "string" || !translatedJsonString.trim()) {
        const message = "(⚠️ ترجمه‌ای دریافت نشد.)"; // Persian like OLD system
        this.logger.error(
          "[SelectElementManager] Empty translation response:",
          translationResult
        );
        // Use centralized error handling instead of direct notification
        await this.errorHandler.handle(new Error(message), {
          context: "select-element"
          // Let ErrorHandler auto-detect the type from the error message
        });
        return { status: "error", reason: "empty_translation", message };
      }

      this.logger.debug(
        "[SelectElementManager] Received translation response, parsing JSON"
      );

      // 7) Parse translation response - handle both JSON and string formats
      let translatedData;
      
      try {
        // First try to parse as JSON (expected from OLD system)
        translatedData = parseAndCleanTranslationResponse(
          translatedJsonString,
          this // Pass context like OLD system
        );
      } catch {
        this.logger.debug("JSON parsing failed, treating as string response");
        translatedData = null;
      }

      // If JSON parsing failed, handle as string response (some providers return string with separators)
      if (!translatedData || !translatedData.length) {
        this.logger.debug("Converting string response to array format");
        
        // Split the string by separator (like "---" or spaces)
        let parts;
        if (translatedJsonString.includes('---')) {
          parts = translatedJsonString.split('---');
        } else {
          // Fallback: split by spaces or try to guess
          parts = translatedJsonString.trim().split(/\s+/);
        }
        
        // Convert to expected format
        translatedData = parts.map(part => ({ text: part.trim() })).filter(item => item.text);
        
        this.logger.debug(`Converted ${translatedData.length} parts from string response`);
      }

      if (!translatedData || !translatedData.length) {
        const message = "(فرمت پاسخ نامعتبر است.)"; // Persian like OLD system
        // Use centralized error handling instead of direct notification
        await this.errorHandler.handle(new Error(message), {
          context: "select-element"
          // Let ErrorHandler auto-detect the type from the error message
        });
        return { status: "error", reason: "api_error", message };
      }

      // 8) Handle length mismatch (same as OLD system)
      const { handleTranslationLengthMismatch } = await import("../../utils/text/extraction.js");
      const lengthMatch = handleTranslationLengthMismatch(translatedData, expandedTexts);
      if (!lengthMatch) {
        await this.showWarningNotification("(طول پاسخ ناهمخوان؛ مجدداً امتحان کنید.)"); // Persian like OLD system
      }

      // 8) Reassemble translations (same as OLD)
      const newTranslations = reassembleTranslations(
        translatedData,
        expandedTexts,
        originMapping,
        textsToTranslate,
        cachedTranslations
      );

      // Combine cached and new translations
      const allTranslations = new Map([
        ...cachedTranslations,
        ...newTranslations,
      ]);

      // 9) Apply translations to DOM nodes (same as OLD)
      const context = {
        state: this.state,  // Use proper state structure
        IconManager: null,  // Vue system doesn't use IconManager
      };

      applyTranslationsToNodes(textNodes, allTranslations, context);

      // Record success for failure tracking
      if (textHash) {
        this.recordTranslationSuccess(textHash);
      }

      // Log applied
      this.logLifecycle(messageId, 'APPLIED', { translatedCount: newTranslations.size });

      // Dismiss status notification on success (like OLD system)
      await this.dismissStatusNotification();

      this.logger.debug(
        "[SelectElementManager] Advanced text extraction process completed successfully"
      );

      return {
        status: "success",
        source: "translated",
        translatedCount: newTranslations.size,
        fromCache: cachedTranslations.size,
      };
    } catch (error) {
      // Record failure for tracking if we have textHash
      if (textHash) {
        this.recordTranslationFailure(textHash, error);
      }

      // Dismiss status notification on error (like OLD system)
      await this.dismissStatusNotification();

      this.logger.error(
        "[SelectElementManager] Advanced text extraction process failed:",
        error
      );

      // Enhanced error handling with more context
      const errorContext = {
        type: ErrorTypes.UI,
        context: "select-element-advanced-extraction",
        elementTag: element?.tagName,
        elementId: element?.id,
        elementClass: element?.className,
        textHash: textHash,
        messageId: messageId
      };

      await this.errorHandler.handle(error, errorContext);

      // More user-friendly error messages
      let userMessage = error.message;
      if (error.message.includes('Circuit breaker')) {
        userMessage = 'Translation service temporarily unavailable - please try again later';
      } else if (error.message.includes('no-response')) {
        userMessage = 'Translation timed out - please try again';
      } else if (error.message.includes('timeout')) {
        userMessage = 'Request took too long - try selecting smaller text';
      }

      await this.showErrorNotification(userMessage);
      return {
        status: "error",
        reason: "exception",
        message: error.message,
        userMessage: userMessage,
      };
    } finally {
      // Ensure status notification is dismissed in finally block (like OLD system)
      await this.dismissStatusNotification();
      
      // Clear selectionProcessing flag and remove ESC listener
      try {
        this.selectionProcessing = false;
        this.logLifecycle(messageId, 'CLEANED');
        
        // Remove ESC key listener since translation is complete
        this.removeEscapeKeyListener();
        
        this.logger.operation('Translation processing completed, selectionProcessing cleared');
      } catch (err) {
        this.logger.warn('Error during final cleanup after processing selection', err);
      }
    }
  }

  /**
   * Add global styles for select element mode using legacy system
   */
  addGlobalStyles() {
    // Apply the CSS class that enables crosshair cursor and hover effects
    taggleLinks(true);

    // Verify the class was applied
    const hasClass = document.documentElement.classList.contains(
      "AIWritingCompanion-disable-links"
    );
    this.logger.debug("CSS class applied", hasClass);

    if (!hasClass) {
      this.logger.warn(
        "[SelectElementManager] CSS class failed to apply - trying manual application"
      );
      document.documentElement.classList.add(
        "AIWritingCompanion-disable-links"
      );
    }

    // Add dynamic background style based on current mode
    this.updateBackgroundStyle();
  }

  /**
   * Remove global styles using legacy system
   */
  removeGlobalStyles() {
    // Remove the CSS class that disables crosshair cursor and hover effects
    taggleLinks(false);
    
    // Remove simple-mode class
    document.documentElement.classList.remove('simple-mode');
  }
  
  /**
   * Update background style based on current mode using CSS classes
   */
  updateBackgroundStyle() {
    const isSimpleMode = this.config.mode === SELECT_ELEMENT_MODES.SIMPLE;
    
    // Toggle the simple-mode class on documentElement
    document.documentElement.classList.toggle('simple-mode', isSimpleMode);
    
    const modeDisplay = SelectElementValidation.getDisplayName(this.config.mode);
    const modeEmoji = SelectElementValidation.getModeEmoji(this.config.mode);
    
    this.logger.debug(`${modeEmoji} Background style updated for ${modeDisplay}`, {
      mode: this.config.mode,
      isSimpleMode: isSimpleMode
    });
  }

  /**
   * Disable page interactions during selection
   */
  disablePageInteractions() {
    document.body.classList.add("translate-it-cursor-select");

    // Disable text selection
    document.body.style.userSelect = "none";
    document.body.style.webkitUserSelect = "none";
    document.body.style.msUserSelect = "none";
  }

  /**
   * Re-enable page interactions
   */
  enablePageInteractions() {
    document.body.classList.remove("translate-it-cursor-select");

    // Re-enable text selection
    document.body.style.userSelect = "";
    document.body.style.webkitUserSelect = "";
    document.body.style.msUserSelect = "";
  }

  /**
   * Show activation notification
   */
  async showActivationNotification() {
    try {
      await this.notificationManager.show(
        "Select Element mode activated. Hover over elements to highlight them, click to translate.",
        "info",
        true,
        3000
      );
    } catch {
      this.logger.debug(
        "[SelectElementManager] Select element mode activated - hover over elements to highlight"
      );
    }
  }

  /**
   * Show error notification
   */
  async showErrorNotification(message) {
    try {
      await this.notificationManager.show(
        `Selection error: ${message}`,
        "error",
        true,
        4000
      );
    } catch {
      this.logger.error("Error", message);
    }
  }

  /**
   * Show no text found notification
   */
  async showNoTextNotification() {
    try {
      await this.notificationManager.show(
        "No text found in selected element. Please select an element with text content.",
        "warning",
        true,
        3000
      );
    } catch {
      this.logger.debug("No text found in selected element");
    }
  }

  /**
   * Show success notification
   */
  async showSuccessNotification(message) {
    try {
      await this.notificationManager.show(message, "success", true, 2000);
    } catch {
      this.logger.debug("Success", message);
    }
  }

  /**
   * Revert all translations made during this session
   * Uses advanced text extraction revert system
   */
  async revertTranslations() {
    try {
      this.logger.info("Starting translation revert process");

      const { revertTranslations } = await import(
        "../../utils/text/extraction.js"
      );

      const context = {
        state: this.state,
        errorHandler: this.errorHandler,
        notifier: this.notificationManager,
        IconManager: null, // This manager does not have an IconManager instance
      };

      const successfulReverts = await revertTranslations(context);

      // Also handle simple input/textarea reverts from tracking
      let inputReverts = 0;
      for (const [element, originalText] of this.state.originalTexts.entries()) {
        if (
          element &&
          (element.tagName === "INPUT" || element.tagName === "TEXTAREA")
        ) {
          try {
            element.value = originalText;
            inputReverts++;
            this.logger.debug(
              "[SelectElementManager] Reverted input/textarea element"
            );
          } catch (error) {
            this.logger.error(
              "[SelectElementManager] Failed to revert input element:",
              error
            );
          }
        }
      }

      const totalReverts = successfulReverts + inputReverts;

      // Clear tracking sets
      this.translatedElements.clear();
      this.state.originalTexts.clear();

      // Show notification
      if (totalReverts > 0) {
        await this.showSuccessNotification(
          `${totalReverts} translation(s) reverted successfully`
        );
        this.logger.debug(
          `[SelectElementManager] Successfully reverted ${totalReverts} translations (${successfulReverts} DOM + ${inputReverts} inputs)`
        );
      } else {
        this.logger.info("No translations found to revert");
      }

      return totalReverts;
    } catch (error) {
      this.logger.error("Error during revert", error);

      await this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "select-element-revert",
      });

      await this.showErrorNotification("Failed to revert translations");
      return 0;
    }
  }

  /**
   * Show warning notification
   */
  async showWarningNotification(message) {
    try {
      await this.notificationManager.show(message, "warning", true, 4000);
    } catch {
      this.logger.warn("Warning", message);
    }
  }

  /**
   * Show status notification (persistent - like OLD system)
   * Returns a promise that resolves to the notification node for dismissal
   */
  async showStatusNotification(message) {
    try {
      // Get i18n string like OLD system
      const { getTranslationString } = await import("../../utils/i18n/i18n.js");
      const statusMessage = (await getTranslationString("STATUS_TRANSLATING_SELECT_ELEMENT")) || message;
      
      // Dismiss all existing status notifications before showing new one
      if (this.notificationManager && typeof this.notificationManager.dismissAll === 'function') {
        this.notificationManager.dismissAll();
      }
      
      // Create persistent notification (false = not auto-dismiss)
      this.statusNotification = await this.notificationManager.show(statusMessage, "status", false);
      this.logger.debug("Status notification created", statusMessage);
      return this.statusNotification;
    } catch {
      this.logger.debug("Status", message);
      return null;
    }
  }

  /**
   * Dismiss status notification (like OLD system)
   */
  async dismissStatusNotification() {
    if (this.statusNotification) {
      this.logger.debug("Dismissing status notification");
      try {
        // statusNotification is a Promise, need to await it first (like OLD system)
        const notifNode = await this.statusNotification;
        if (notifNode) {
          this.notificationManager.dismiss(notifNode);
        }
      } catch (error) {
        this.logger.warn("Error dismissing status notification", error);
      } finally {
        this.statusNotification = null;
      }
    }
  }

  /**
   * Cleanup - remove all listeners and overlays
   */
  async cleanup() {
    this.logger.info("Cleaning up SelectElement manager");

    // Revert any active translations
    if (this.translatedElements.size > 0) {
      await this.revertTranslations();
    }

    await this.deactivate();

    // Remove message listener
    if (this.browser && this.messageListener) {
      this.browser.runtime.onMessage.removeListener(this.messageListener);
      this.messageListener = null;
    }

    // Clear all tracking structures
    this.overlayElements.clear();
    this.state.originalTexts.clear();
    this.translatedElements.clear();
    this.currentHighlighted = null;
    
    // Clear caches and failure tracking
    this.elementValidationCache = new WeakMap();
    this.textContentCache = new WeakMap();
    this.failureTracker.clear();
    
    // Clear lifecycle tracking
    this.messageLifecycle.clear();
    
    // Cancel any pending operations
    if (this.pendingTranslation) {
      try {
        this.cancelPendingTranslation(this.pendingTranslation.originalMessageId);
      } catch (error) {
        this.logger.warn('Error canceling pending translation during cleanup:', error);
      }
    }
    
    this.logger.info("SelectElement cleanup completed");
  }

  /**
   * Get performance and debugging information
   */
  getDebugInfo() {
    return {
      isActive: this.isActive,
      isProcessingClick: this.isProcessingClick,
      selectionProcessing: this.selectionProcessing,
      translatedElements: this.translatedElements.size,
      originalTexts: this.state.originalTexts.size,
      failureTracker: {
        size: this.failureTracker.size,
        entries: Array.from(this.failureTracker.entries()).map(([hash, failure]) => ({
          hash,
          attempts: failure.attempts,
          lastAttempt: new Date(failure.lastAttempt).toISOString(),
          lastError: failure.lastError
        }))
      },
      pendingTranslation: this.pendingTranslation ? {
        messageId: this.pendingTranslation.originalMessageId,
        startTime: new Date(this.pendingTranslation.startTime).toISOString()
      } : null,
      cacheStats: {
        elementValidation: this.elementValidationCache,
        textContent: this.textContentCache
      },
      config: this.config,
      retryConfig: this.retryConfig
    };
  }
}

// Export singleton instance
// Export singleton instance
// export const selectElementManager = new SelectElementManager();

// Auto-initialize when script loads
// if (typeof document !== "undefined") {
//   selectElementManager.initialize();
// }