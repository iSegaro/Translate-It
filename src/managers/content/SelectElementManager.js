// src/content-scripts/select-element-manager.js
// Vue-compatible Select Element Manager
// Integrated with existing services and error handling

import browser from "webextension-polyfill";
import { logME, taggleLinks } from "@/utils/core/helpers.js";
import { ErrorHandler } from "../../error-management/ErrorService.js";
import { ErrorTypes } from "../../error-management/ErrorTypes.js";
import { createLogger } from "../../utils/core/logger.js";
import NotificationManager from "@/managers/core/NotificationManager.js";
import { MessagingCore } from "../../messaging/core/MessagingCore.js";
import { MessagingContexts } from "../../messaging/core/MessagingCore.js";
import { MessageActions } from "@/messaging/core/MessageActions.js";
import { generateContentMessageId } from "../../utils/messaging/messageId.js";

/**
 * SelectElementManager - Vue-compatible element selection system
 *
 * Features:
 * - Element highlighting on hover
 * - Click to select and extract text
 * - ESC key cancellation
 * - Service integration (ErrorService, NotificationManager)
 * - Cross-browser compatibility
 */
export class SelectElementManager {
  constructor() {
    this.isActive = false;
    this.overlayElements = new Set();
    this.currentHighlighted = null;
    this.browser = null;
    this.logger = createLogger('Content', 'SelectElement');
    this.translatedElements = new Set(); // Track translated elements for revert
    this.isProcessingClick = false; // Prevent multiple rapid clicks
    this.lastClickTime = 0; // Debounce timer
    this.escapeAbortController = null; // For background ESC key handling

    // Create proper state structure like OLD system
    this.state = {
      originalTexts: new Map() // This matches the OLD system structure
    };

    // Service instances
    this.errorHandler = new ErrorHandler();
    this.notificationManager = new NotificationManager(this.errorHandler);
    this.messenger = MessagingCore.getMessenger(MessagingContexts.CONTENT);

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

    this.logger.init('Select element manager initialized');
  }

  /**
   * Initialize browser API and setup message listener
   */
  async initialize() {
    try {
      this.browser = browser;
      this.setupMessageListener();

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
          await this.activate();
        } else {
          await this.deactivate();
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

        // Handle error via ErrorService
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
      } catch (e) {
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
   * @param {number} timeout - Timeout in milliseconds (default: 10 seconds for long translations)
   * @returns {Promise<Object>} Translation result promise
   */
  setupTranslationWaiting(messageId, timeout = 30000) {
    this.logger.debug(`Setting up translation waiting for messageId: ${messageId}, timeout: ${timeout}ms`);
    
    return new Promise((resolve, reject) => {
      // Store pending translation promise
      this.pendingTranslation = { 
        originalMessageId: messageId, 
        resolve, 
        reject,
        startTime: Date.now()
      };
      
      // Set timeout - but allow late results to still be processed
      const timeoutId = setTimeout(() => {
        if (this.pendingTranslation && this.pendingTranslation.originalMessageId === messageId) {
          const elapsed = Date.now() - this.pendingTranslation.startTime;
          this.logger.warn(`Translation timeout after ${elapsed}ms for messageId: ${messageId}`);
          this.logger.warn('Translation may still complete in background...');
          
          // Dismiss status notification on timeout
          if (this.statusNotification) {
            try {
              this.notificationManager.dismiss(this.statusNotification);
              this.statusNotification = null;
              this.logger.debug('Status notification dismissed due to timeout');
            } catch (dismissError) {
              this.logger.warn('Failed to dismiss status notification on timeout', dismissError);
            }
          }
          
          // Don't completely reject - just resolve with timeout error but keep listening
          resolve({
            success: false,
            error: `Translation timeout after ${Math.round(elapsed/1000)}s. Translation may continue in background.`,
            timeout: true
          });
          
          // Don't clear pendingTranslation - allow late results to still be processed
          // this.pendingTranslation = null;
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
          this.cancelPendingTranslation(messageId);
        } catch (err) {
          this.logger.warn('Error while auto-cancelling pending translation', err);
        }
      }
    });
  }

  /**
   * Cancel pending translation (for error cases)
   * @param {string} messageId - Message ID to cancel
   */
  cancelPendingTranslation(messageId) {
    if (this.pendingTranslation && this.pendingTranslation.originalMessageId === messageId) {
      this.logger.debug(`Cancelling pending translation for messageId: ${messageId}`);

      // Log lifecycle: cancel requested
      this.logLifecycle(messageId, 'CANCEL_REQUESTED');

      // Clear timeout if present
      if (this.pendingTranslation.timeoutId) {
        try { clearTimeout(this.pendingTranslation.timeoutId); } catch (e) { /* ignore */ }
      }

      // Resolve the pending promise with a cancel result instead of rejecting it.
      try {
        this.pendingTranslation.resolve({ cancelled: true, messageId });
        this.logLifecycle(messageId, 'CANCELLED');
      } catch (e) {
        // If resolve throws for any reason, swallow to avoid unhandled exceptions
        this.logger.warn('Warning: resolving pending translation failed', e);
      }

      this.pendingTranslation = null;
    }
  }

  /**
   * Wait for TRANSLATION_RESULT_UPDATE message (deprecated - use setupTranslationWaiting)
   * @param {string} messageId - Original message ID from TRANSLATE request
   * @returns {Promise<Object>} Translation result
   */
  async waitForTranslationResult(messageId, timeout = 30000) {
    return this.setupTranslationWaiting(messageId, timeout);
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
    // Notify background about activation so it can keep per-tab state
    try {
      await this.browser.runtime.sendMessage({ action: MessageActions.SET_SELECT_ELEMENT_STATE, data: { activate: true } });
      this.logger.debug('Notified background: select element activated');
    } catch (err) {
      this.logger.warn('Failed to notify background about activation', err);
    }

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

    // Remove most event listeners but keep ESC key handling for cancellation
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Re-add ESC key handling for background translation cancellation
    this.setupEscapeKeyListener();

    // Clean up highlights
    this.clearHighlight();
    this.clearOverlays();

    // Remove global styles
    this.removeGlobalStyles();

    // Re-enable page interactions
    this.enablePageInteractions();

    // Clear NEW select manager flag
    window.translateItNewSelectManager = false;

    // Notify background about deactivation so it can keep per-tab state
    try {
      await this.browser.runtime.sendMessage({ action: MessageActions.SET_SELECT_ELEMENT_STATE, data: { activate: false } });
      this.logger.debug('Notified background: select element deactivated (UI only)');
    } catch (err) {
      this.logger.warn('Failed to notify background about deactivation', err);
    }

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
      try { await this.dismissStatusNotification(); } catch (e) { /* ignore */ }
    } else if (this.selectionProcessing) {
      // mark requestedCancel so pendingTranslation created shortly will be auto-cancelled
      this.logger.debug('Full deactivate requested while processing selection - marking requestedCancel');
      this.requestedCancel = true;
      try { await this.dismissStatusNotification(); } catch (e) { /* ignore */ }
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

    // Skip non-text elements
    if (!this.isValidTextElement(element)) return;

    // Skip if already highlighted
    if (element === this.currentHighlighted) return;

    // Clear previous highlight
    this.clearHighlight();

    // Highlight current element
    this.highlightElement(element);
    this.currentHighlighted = element;
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

    // Prevent multiple rapid clicks or processing
    if (this.isProcessingClick) {
      this.logger.debug("Already processing click, ignoring");
      return;
    }

    // Add a small debounce to prevent double clicks
    if (this.lastClickTime && Date.now() - this.lastClickTime < 100) {
      this.logger.debug("Double click detected, ignoring");
      return;
    }

    this.isProcessingClick = true;
    this.lastClickTime = Date.now();

    const element = event.target;

    if (!this.isValidTextElement(element)) {
      this.logger.warn("Invalid element for translation");
      await this.showErrorNotification(
        "Please select an element that contains text"
      );
    this.isProcessingClick = false;
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
    } catch (e) {
      // ignore if window not writable in some contexts
    }
      return;
    }

    this.logger.info("Element selected", element);

    try {
      // Quick check if element has text before expensive processing
      const quickText = this.extractTextFromElement(element);
      if (!quickText || quickText.trim().length === 0) {
        this.logger.warn("No text found in selected element");
        await this.showNoTextNotification();
        this.isProcessingClick = false;
        return;
      }

      this.logger.debug(
        "[SelectElementManager] Text found:",
        quickText.substring(0, 100) + "..."
      );

      // Mark that we're processing this selection and keep manager active
      // so ESC can cancel the in-flight translation.
      this.selectionProcessing = true;

      // Deactivate select element mode immediately after click (UI only)
      this.logger.operation("Deactivating select element mode after element selection");
      await this.deactivateUIOnly();

      // Process element with full text extraction (in background)
      // Note: Translation continues in background, user can continue browsing
      this.processSelectedElement(element).catch(error => {
        this.logger.error("Background translation failed", error);
      });
    } catch (error) {
      this.logger.error("Element selection error", error);

      // Handle error via ErrorService
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
    } catch (err) {
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
          this.cancelPendingTranslation(pendingId);
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
      } catch (e) { 
        /* ignore */ 
      }

      // Deactivate if still active
      try {
        if (this.isActive) {
          await this.deactivate();
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
    // Skip script, style, and other non-text elements
    const invalidTags = ["SCRIPT", "STYLE", "NOSCRIPT", "HEAD", "META", "LINK"];
    if (invalidTags.includes(element.tagName)) return false;

    // Skip invisible elements
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (style.opacity === "0") return false;

    // Must have text content or be a text input
    const hasText =
      element.textContent && element.textContent.trim().length > 0;
    const isTextInput = element.tagName === "INPUT" && element.type === "text";
    const isTextArea = element.tagName === "TEXTAREA";

    return hasText || isTextInput || isTextArea;
  }

  /**
   * Highlight element - uses OLD system CSS only (no extra classes)
   */
  highlightElement(element) {
    this.logger.debug(
      "[SelectElementManager] Highlighting element:",
      element.tagName,
      element.className
    );

    // Just track the current element - CSS :hover effects handle the visual feedback
    // This matches the OLD system behavior exactly
    this.currentHighlighted = element;

    // No additional CSS classes needed - the OLD disable_links.css handles everything
  }

  /**
   * Clear current highlight
   */
  clearHighlight() {
    // Just clear tracking - CSS :hover effects handle the rest automatically
    // This matches the OLD system behavior exactly
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
    // Handle input elements
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      return element.value;
    }

    // Handle regular elements
    let text = "";

    // Try to get visible text content
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        // Skip text in hidden elements
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        const style = window.getComputedStyle(parent);
        if (style.display === "none" || style.visibility === "hidden") {
          return NodeFilter.FILTER_REJECT;
        }

        // Skip empty text nodes
        if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;

        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node;
    while ((node = walker.nextNode())) {
      text += node.textContent + " ";
    }

    return text.trim();
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

    try {
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
        const response = await this.messenger.translate({
          text: inputText,
          provider: provider,
          from: sourceLanguage,
          to: targetLanguage,
          mode: TranslationMode.Field,
        });

        if (response && (response.success || response.translatedText)) {
          const translatedText =
            response.translatedText || response.data?.translatedText;
          if (translatedText) {
            const originalText = element.value;
            // Store in proper state structure for input elements
            this.state.originalTexts.set(element, originalText);
            this.translatedElements.add(element);
            element.value = translatedText;
            await this.showSuccessNotification("Translation successful!");
          }
        } else {
          throw new Error(response?.error || "Translation failed");
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

      // 3) Show status notification (like OLD system)
      await this.showStatusNotification("در حال ترجمه…");

      // 3) Expand texts for translation (same as OLD)
      const { expandedTexts, originMapping } =
        expandTextsForTranslation(textsToTranslate);

      // 4) Create JSON payload (same as OLD)
      const jsonPayload = JSON.stringify(
        expandedTexts.map((t) => ({ text: t }))
      );

      if (jsonPayload.length > 20_000) {
        const message = `متن انتخابی بسیار بزرگ است (${jsonPayload.length} بایت)`; // Persian like OLD system
        await this.showErrorNotification(message);
        return { status: "error", reason: "payload_large", message };
      }

      this.logger.debug(
        "[SelectElementManager] Sending translation request to background"
      );

      // Generate message ID for tracking
      messageId = generateContentMessageId('select-element');
      
      // 5) Setup pending translation BEFORE sending message (to avoid race condition)
      const translationPromise = this.setupTranslationWaiting(messageId);
      this.logLifecycle(messageId, 'PENDING', { startTime: Date.now() });

      // 6) Send translation request using UnifiedMessenger like OLD system
      const { UnifiedMessenger } = await import("../../core/UnifiedMessenger.js");
      const { MessagingContexts } = await import("../../messaging/core/MessagingCore.js");
      const unifiedMessenger = new UnifiedMessenger(MessagingContexts.EVENT_HANDLER); // Use same context as OLD system

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
      
      // Send the translation request (this returns acknowledgment, not final result)
      const response = await unifiedMessenger.translate(payload);

      // 7) Handle initial response from background (just acknowledgment)
      // Some messenger implementations may return `undefined`/`null` for
      // acknowledgement; treat an explicit negative ack (success===false
      // or presence of an error) as failure, otherwise proceed to wait
      // for the final TRANSLATION_RESULT_UPDATE.
      if (response && (response.success === false || response.error)) {
        const msg = (response.error || response.message) || "Translation request failed";
        this.logger.error(
          "[SelectElementManager] Translation request failed:",
          msg
        );
        await this.showErrorNotification(msg);
        // Cancel pending translation and consume its rejection to avoid
        // an unhandled promise rejection (we created the promise earlier).
        this.cancelPendingTranslation(messageId);
        try {
          await translationPromise.catch(() => {});
        } catch (e) {
          // swallow - handled above
        }
        return { status: "error", reason: "backend_error", message: msg };
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
        } catch (err) {
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
          await this.showErrorNotification(msg);
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
        await this.showErrorNotification(message);
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
      } catch (error) {
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
        await this.showErrorNotification(message);
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

      // Log applied
      this.logLifecycle(messageId, 'APPLIED', { translatedCount: newTranslations.size });

      // Dismiss status notification on success (like OLD system)
      await this.dismissStatusNotification();

      this.logger.debug(
        "[SelectElementManager] Advanced text extraction process completed successfully"
      );
      await this.showSuccessNotification("Translation completed successfully!");

      return {
        status: "success",
        source: "translated",
        translatedCount: newTranslations.size,
        fromCache: cachedTranslations.size,
      };
    } catch (error) {
      // Dismiss status notification on error (like OLD system)
      await this.dismissStatusNotification();

      this.logger.error(
        "[SelectElementManager] Advanced text extraction process failed:",
        error
      );

      await this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "select-element-advanced-extraction",
      });

      await this.showErrorNotification(error.message);
      return {
        status: "error",
        reason: "exception",
        message: error.message,
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
  }

  /**
   * Remove global styles using legacy system
   */
  removeGlobalStyles() {
    // Remove the CSS class that disables crosshair cursor and hover effects
    taggleLinks(false);
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
      this.logger.debug("No text found in selected element");
    }
  }

  /**
   * Show success notification
   */
  async showSuccessNotification(message) {
    try {
      await this.notificationManager.show(message, "success", true, 2000);
    } catch (error) {
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
    } catch (error) {
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
      
      // Create persistent notification (false = not auto-dismiss)
      this.statusNotification = await this.notificationManager.show(statusMessage, "status", false);
      this.logger.debug("Status notification created", statusMessage);
      return this.statusNotification;
    } catch (error) {
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
    this.logger.info("Cleaning up");

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

    this.overlayElements.clear();
    this.state.originalTexts.clear();
    this.translatedElements.clear();
    this.currentHighlighted = null;
  }
}

// Export singleton instance
// Export singleton instance
// export const selectElementManager = new SelectElementManager();

// Auto-initialize when script loads
// if (typeof document !== "undefined") {
//   selectElementManager.initialize();
// }