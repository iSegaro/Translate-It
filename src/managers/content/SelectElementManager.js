// src/content-scripts/select-element-manager.js
// Vue-compatible Select Element Manager
// Integrated with existing services and error handling

import browser from "webextension-polyfill";
import { logME, taggleLinks } from "@/utils/core/helpers.js";
import { ErrorHandler } from "../../error-management/ErrorService.js";
import { ErrorTypes } from "../../error-management/ErrorTypes.js";
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
    this.translatedElements = new Set(); // Track translated elements for revert
    this.isProcessingClick = false; // Prevent multiple rapid clicks
    this.lastClickTime = 0; // Debounce timer

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

    console.log("[SelectElementManager] Initialized with service integration");
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

      console.log("[SelectElementManager] browser API initialized");
    } catch (error) {
      console.error("[SelectElementManager] Initialization failed:", error);
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
    console.log("[SelectElementManager] Message listener registered");
  }

  /**
   * Handle messages from background script
   */
  async handleMessage(message, sender, sendResponse) {
    console.log(`[SelectElementManager] Received message:`, message);

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
        console.log(
          `[SelectElementManager] Mode ${shouldActivate ? "activated" : "deactivated"} successfully`,
          response
        );

        if (sendResponse) {
          sendResponse(response);
        }

        return response;
      } catch (error) {
        console.error("[SelectElementManager] Toggle error:", error);

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

    // Handle TRANSLATION_RESULT_UPDATE messages - check context like OLD system
    if (message.action === MessageActions.TRANSLATION_RESULT_UPDATE) {
      console.log('[SelectElementManager] Received TRANSLATION_RESULT_UPDATE:', message);
      console.log('[SelectElementManager] Message context:', message.context);
      
      // Only handle messages for EVENT_HANDLER context (like OLD system)  
      if (message.context === MessagingContexts.EVENT_HANDLER) {
        await this.handleTranslationResult(message);
        return true;
      } else {
        console.log('[SelectElementManager] Ignoring TRANSLATION_RESULT_UPDATE - wrong context:', message.context);
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
      console.log('[SelectElementManager] Processing translation result:', message.data);
      console.log('[SelectElementManager] Message ID from result:', message.messageId);
      console.log('[SelectElementManager] Pending translation:', this.pendingTranslation);
      
      if (this.pendingTranslation) {
        // TRANSLATION_RESULT_UPDATE uses the same messageId as the original TRANSLATE request
        if (this.pendingTranslation.originalMessageId === message.messageId) {
          const elapsed = Date.now() - this.pendingTranslation.startTime;
          console.log('[SelectElementManager] Message ID matched, resolving translation after', elapsed + 'ms');
          
          // Cancel timeout since we got the result
          if (this.pendingTranslation.timeoutId) {
            clearTimeout(this.pendingTranslation.timeoutId);
          }
          
          this.pendingTranslation.resolve({
            success: message.data?.success !== false,
            translatedText: message.data?.translatedText,
            error: message.data?.error,
            elapsed: elapsed
          });
          this.pendingTranslation = null;
        } else {
          console.log('[SelectElementManager] Message ID mismatch:', {
            expected: this.pendingTranslation.originalMessageId,
            received: message.messageId
          });
        }
      } else {
        console.log('[SelectElementManager] No pending translation found');
      }
    } catch (error) {
      console.error('[SelectElementManager] Error handling translation result:', error);
      if (this.pendingTranslation) {
        this.pendingTranslation.reject(error);
        this.pendingTranslation = null;
      }
    }
  }

  /**
   * Setup translation waiting before sending request to avoid race condition
   * @param {string} messageId - Message ID to wait for
   * @param {number} timeout - Timeout in milliseconds (default: 10 seconds for long translations)
   * @returns {Promise<Object>} Translation result promise
   */
  setupTranslationWaiting(messageId, timeout = 10000) {
    console.log('[SelectElementManager] Setting up translation waiting for messageId:', messageId, 'timeout:', timeout + 'ms');
    
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
          console.warn('[SelectElementManager] Translation timeout after', elapsed + 'ms for messageId:', messageId);
          console.warn('[SelectElementManager] Translation may still complete in background...');
          
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
    });
  }

  /**
   * Cancel pending translation (for error cases)
   * @param {string} messageId - Message ID to cancel
   */
  cancelPendingTranslation(messageId) {
    if (this.pendingTranslation && this.pendingTranslation.originalMessageId === messageId) {
      console.log('[SelectElementManager] Cancelling pending translation for messageId:', messageId);
      this.pendingTranslation.reject(new Error('Translation cancelled'));
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
      console.log("[SelectElementManager] Already active");
      return;
    }

    console.log("[SelectElementManager] Activating select element mode");

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
      console.log('[SelectElementManager] Notified background: select element activated');
    } catch (err) {
      console.warn('[SelectElementManager] Failed to notify background about activation:', err);
    }

    console.log("[SelectElementManager] Select element mode activated");
  }

  /**
   * Deactivate select element mode
   */
  async deactivate() {
    if (!this.isActive) {
      console.log("[SelectElementManager] Already inactive");
      return;
    }

    console.log("[SelectElementManager] Deactivating select element mode");

    this.isActive = false;

    // Remove event listeners
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

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
      console.log('[SelectElementManager] Notified background: select element deactivated');
    } catch (err) {
      console.warn('[SelectElementManager] Failed to notify background about deactivation:', err);
    }

    console.log(
      "[SelectElementManager] Select element mode deactivated - state synced via storage"
    );

    console.log("[SelectElementManager] Select element mode deactivated");
  }

  /**
   * Handle mouse over event - highlight element
   */
  handleMouseOver(event) {
    if (!this.isActive) return;

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
      console.log("[SelectElementManager] Already processing click, ignoring");
      return;
    }

    // Add a small debounce to prevent double clicks
    if (this.lastClickTime && Date.now() - this.lastClickTime < 100) {
      console.log("[SelectElementManager] Double click detected, ignoring");
      return;
    }

    this.isProcessingClick = true;
    this.lastClickTime = Date.now();

    const element = event.target;

    if (!this.isValidTextElement(element)) {
      console.log("[SelectElementManager] Invalid element for translation");
      await this.showErrorNotification(
        "Please select an element that contains text"
      );
      this.isProcessingClick = false;
      return;
    }

    console.log("[SelectElementManager] Element selected:", element);

    try {
      // Quick check if element has text before expensive processing
      const quickText = this.extractTextFromElement(element);
      if (!quickText || quickText.trim().length === 0) {
        console.log("[SelectElementManager] No text found in selected element");
        await this.showNoTextNotification();
        this.isProcessingClick = false;
        return;
      }

      console.log(
        "[SelectElementManager] Text found:",
        quickText.substring(0, 100) + "..."
      );

      // Deactivate mode immediately after element selection (before translation)
      await this.deactivate();

      // Process element with full text extraction (in background)
      // Note: Translation continues in background, user can continue browsing
      this.processSelectedElement(element).catch(error => {
        console.error("[SelectElementManager] Background translation failed:", error);
      });
    } catch (error) {
      console.error("[SelectElementManager] Element selection error:", error);

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
   * Handle keyboard events
   */
  async handleKeyDown(event) {
    if (!this.isActive) return;

    console.log("[SelectElementManager] KeyDown event received:", {
      key: event.key,
      code: event.code,
      target: event.target?.tagName,
      isActive: this.isActive,
    });

    if (event.key === "Escape" || event.code === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      console.log("[SelectElementManager] ESC pressed - cancelling selection");

      // If there are translated elements, revert them
      if (this.translatedElements.size > 0) {
        console.log(
          "[SelectElementManager] Reverting translations before deactivation"
        );
        await this.revertTranslations();
      }

      await this.deactivate();
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
    console.log(
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
    console.log(
      "[SelectElementManager] Starting advanced text extraction process"
    );

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
        console.log(
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

        // Use UnifiedMessenger translate method
        const response = await this.messenger.translate({
          text: inputText,
          provider: provider,
          from: sourceLanguage,
          to: targetLanguage,
          mode: "selection",
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
        console.warn("[SelectElementManager] No text nodes found in element");
        await this.showNoTextNotification();
        return { status: "empty", reason: "no_text_found" };
      }

      // 2) Separate cached and new texts (same as OLD)
      const { textsToTranslate, cachedTranslations } =
        separateCachedAndNewTexts(originalTextsMap);

      // If only cached translations exist
      if (!textsToTranslate.length && cachedTranslations.size) {
        console.log("[SelectElementManager] Using only cached translations");
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

      console.log(
        "[SelectElementManager] Sending translation request to background"
      );

      // Generate message ID for tracking
      const messageId = generateContentMessageId('select-element');
      
      // 5) Setup pending translation BEFORE sending message (to avoid race condition)
      const translationPromise = this.setupTranslationWaiting(messageId);

      // 6) Send translation request using UnifiedMessenger like OLD system
      const { UnifiedMessenger } = await import("../../core/UnifiedMessenger.js");
      const { MessagingContexts } = await import("../../messaging/core/MessagingCore.js");
      const unifiedMessenger = new UnifiedMessenger(MessagingContexts.EVENT_HANDLER); // Use same context as OLD system
      
      const payload = {
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
      };
      
      console.log("[SelectElementManager] Sending translation request with payload:", JSON.stringify(payload, null, 2));
      
      // Send the translation request (this returns acknowledgment, not final result)
      const response = await unifiedMessenger.translate(payload);

      // 7) Handle initial response from background (just acknowledgment)
      if (!response.success) {
        const msg = response.error || "Translation request failed";
        console.error(
          "[SelectElementManager] Translation request failed:",
          msg
        );
        await this.showErrorNotification(msg);
        // Cancel pending translation
        this.cancelPendingTranslation(messageId);
        return { status: "error", reason: "backend_error", message: msg };
      }

      console.log("[SelectElementManager] Translation request accepted, waiting for result...");
      
      // 8) Wait for TRANSLATION_RESULT_UPDATE message
      const translationResult = await translationPromise;
      
      // Handle translation errors like OLD system
      if (!translationResult || translationResult.error || !translationResult.translatedText) {
        const msg = translationResult?.error?.message || translationResult?.error || "(⚠️ خطایی در ترجمه رخ داد.)"; // Persian like OLD system
        
        // Handle timeout specifically - less severe than other errors
        if (translationResult?.timeout) {
          console.warn("[SelectElementManager] Translation timeout:", msg);
          await this.showWarningNotification("Translation taking longer than expected. It may complete in background.");
          return { status: "timeout", reason: "timeout", message: msg };
        } else {
          console.error("[SelectElementManager] Translation result failed:", msg);
          await this.showErrorNotification(msg);
          return { status: "error", reason: "backend_error", message: msg }; // Same error type as OLD system
        }
      }

      // Get translated text from result (handle both formats like OLD system)
      const translatedJsonString = translationResult?.translatedText || translationResult?.data?.translatedText;

      if (typeof translatedJsonString !== "string" || !translatedJsonString.trim()) {
        const message = "(⚠️ ترجمه‌ای دریافت نشد.)"; // Persian like OLD system
        console.error(
          "[SelectElementManager] Empty translation response:",
          translationResult
        );
        await this.showErrorNotification(message);
        return { status: "error", reason: "empty_translation", message };
      }

      console.log(
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
        console.log("[SelectElementManager] JSON parsing failed, treating as string response");
        translatedData = null;
      }

      // If JSON parsing failed, handle as string response (some providers return string with separators)
      if (!translatedData || !translatedData.length) {
        console.log("[SelectElementManager] Converting string response to array format");
        
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
        
        console.log(`[SelectElementManager] Converted ${translatedData.length} parts from string response`);
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

      // Dismiss status notification on success (like OLD system)
      await this.dismissStatusNotification();

      console.log(
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

      console.error(
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
    console.log("[SelectElementManager] CSS class applied:", hasClass);

    if (!hasClass) {
      console.warn(
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
      console.log(
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
      console.error("[SelectElementManager] Error:", message);
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
      console.log("[SelectElementManager] No text found in selected element");
    }
  }

  /**
   * Show success notification
   */
  async showSuccessNotification(message) {
    try {
      await this.notificationManager.show(message, "success", true, 2000);
    } catch (error) {
      console.log("[SelectElementManager] Success:", message);
    }
  }

  /**
   * Revert all translations made during this session
   * Uses advanced text extraction revert system
   */
  async revertTranslations() {
    try {
      console.log("[SelectElementManager] Starting translation revert process");

      // Use advanced text extraction revert system
      const { revertAllTranslations } = await import(
        "../../utils/text/extraction.js"
      );

      const context = {
        translatedElements: this.translatedElements,
        originalTexts: this.state.originalTexts,  // Use proper state structure
      };

      const successfulReverts = revertAllTranslations(context);

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
            console.log(
              "[SelectElementManager] Reverted input/textarea element"
            );
          } catch (error) {
            console.error(
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
        console.log(
          `[SelectElementManager] Successfully reverted ${totalReverts} translations (${successfulReverts} DOM + ${inputReverts} inputs)`
        );
      } else {
        console.log("[SelectElementManager] No translations found to revert");
      }

      return totalReverts;
    } catch (error) {
      console.error("[SelectElementManager] Error during revert:", error);

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
      console.warn("[SelectElementManager] Warning:", message);
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
      this.statusNotification = this.notificationManager.show(statusMessage, "status", false);
      console.log("[SelectElementManager] Status notification created:", statusMessage);
      return this.statusNotification;
    } catch (error) {
      console.log("[SelectElementManager] Status:", message);
      return null;
    }
  }

  /**
   * Dismiss status notification (like OLD system)
   */
  async dismissStatusNotification() {
    if (this.statusNotification) {
      console.log("[SelectElementManager] Dismissing status notification");
      try {
        // statusNotification is a Promise, need to await it first (like OLD system)
        const notifNode = await this.statusNotification;
        if (notifNode) {
          this.notificationManager.dismiss(notifNode);
        }
      } catch (error) {
        console.warn("[SelectElementManager] Error dismissing status notification:", error);
      } finally {
        this.statusNotification = null;
      }
    }
  }

  /**
   * Cleanup - remove all listeners and overlays
   */
  async cleanup() {
    console.log("[SelectElementManager] Cleaning up");

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
