// TranslationOrchestrator Service - Handles translation request/response flow

import browser from "webextension-polyfill";
import { getScopedLogger } from "../../../../utils/core/logger.js";
import { LOG_COMPONENTS } from "../../../../utils/core/logConstants.js";
import { ErrorHandler } from "../../../../error-management/ErrorHandler.js";
import { ErrorTypes } from "../../../../error-management/ErrorTypes.js";
import { getTimeoutAsync } from "../../../../config.js";
import { MessageFormat, MessagingContexts } from "../../../../messaging/core/MessagingCore.js";
import { MessageActions } from "@/messaging/core/MessageActions.js";
import { generateContentMessageId } from "../../../../utils/messaging/messageId.js";
import { TRANSLATION_TIMEOUT_FALLBACK } from "../constants/selectElementConstants.js";

export class TranslationOrchestrator {
  constructor() {
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'TranslationOrchestrator');
    this.translationRequests = new Map();
    this.escapeKeyListener = null;
  }

  /**
   * Initialize the translation orchestrator
   */
  async initialize() {
    this.logger.debug('TranslationOrchestrator initialized');
  }

  /**
   * Process selected element for translation
   * @param {HTMLElement} element - Element to translate
   * @param {string} extractedText - Extracted text content
   */
  async processSelectedElement(element, extractedText) {
    this.logger.operation("Starting translation process for selected element");

    try {
      // Generate unique message ID for this translation request
      const messageId = generateContentMessageId();
      
      // Store the element and original text for later reference
      this.translationRequests.set(messageId, {
        element,
        originalText: extractedText,
        status: 'pending',
        timestamp: Date.now()
      });

      // Send translation request to background
      await this.sendTranslationRequest(messageId, extractedText);

      // Setup translation waiting with timeout
      await this.setupTranslationWaiting(messageId, element);

    } catch (error) {
      this.logger.error("Translation process failed", error);
      throw error;
    }
  }

  /**
   * Send translation request to background script
   * @param {string} messageId - Unique message ID
   * @param {string} text - Text to translate
   */
  async sendTranslationRequest(messageId, text) {
    try {
      const translationRequest = {
        action: MessageActions.TRANSLATE_TEXT,
        data: {
          text: text,
          context: MessagingContexts.EVENT_HANDLER
        },
        format: MessageFormat.JSON,
        messageId: messageId
      };

      this.logger.debug("Sending translation request:", {
        messageId,
        textLength: text.length,
        preview: text.substring(0, 100) + (text.length > 100 ? '...' : '')
      });

      // Send the request
      const response = await browser.runtime.sendMessage(translationRequest);
      
      if (!response || !response.success) {
        throw new Error(`Translation request failed: ${response?.error || 'Unknown error'}`);
      }

      this.logger.debug("Translation request sent successfully");

    } catch (error) {
      this.logger.error("Failed to send translation request", error);
      throw error;
    }
  }

  /**
   * Setup translation waiting with timeout and visual feedback
   * @param {string} messageId - Message ID for tracking
   * @param {HTMLElement} element - Element being translated
   */
  async setupTranslationWaiting(messageId, element) {
    this.logger.debug("Setting up translation waiting for message:", messageId);

    // Add escape key listener for cancellation
    this.addEscapeKeyListener();

    // Setup timeout for translation response
    const timeout = getTimeoutAsync() || TRANSLATION_TIMEOUT_FALLBACK;
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Translation timeout after ${timeout}ms`));
      }, timeout);
    });

    try {
      // Wait for either translation result or timeout
      await Promise.race([
        this.waitForTranslationResult(messageId),
        timeoutPromise
      ]);
      
      this.logger.debug("Translation completed successfully for message:", messageId);

    } catch (error) {
      this.logger.error("Translation waiting failed", error);
      
      // Update request status
      const request = this.translationRequests.get(messageId);
      if (request) {
        request.status = 'error';
        request.error = error.message;
      }

      throw error;
    } finally {
      // Cleanup
      this.removeEscapeKeyListener();
    }
  }

  /**
   * Wait for translation result for specific message
   * @param {string} messageId - Message ID to wait for
   */
  async waitForTranslationResult(messageId) {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const request = this.translationRequests.get(messageId);
        
        if (!request) {
          clearInterval(checkInterval);
          reject(new Error(`Translation request ${messageId} not found`));
          return;
        }

        if (request.status === 'completed') {
          clearInterval(checkInterval);
          resolve(request.result);
        } else if (request.status === 'error') {
          clearInterval(checkInterval);
          reject(new Error(request.error || 'Translation failed'));
        }
      }, 100);
    });
  }

  /**
   * Handle translation result from background
   * @param {Object} message - Message containing translation result
   */
  async handleTranslationResult(message) {
    const { messageId, data, success, error } = message;
    
    this.logger.debug("Received translation result:", {
      messageId,
      success,
      error: error?.substring(0, 100)
    });

    const request = this.translationRequests.get(messageId);
    if (!request) {
      this.logger.warn("Received translation result for unknown message:", messageId);
      return;
    }

    try {
      if (success) {
        // Update element with translated text
        await this.updateElementWithTranslation(request.element, data.translatedText, request.originalText);
        
        request.status = 'completed';
        request.result = data;
        
        this.logger.info("Translation applied successfully", {
          messageId,
          originalLength: request.originalText.length,
          translatedLength: data.translatedText?.length || 0
        });

      } else {
        request.status = 'error';
        request.error = error;
        
        this.logger.error("Translation failed", {
          messageId,
          error: error?.substring(0, 200)
        });

        throw new Error(error || 'Translation failed');
      }
    } catch (error) {
      this.logger.error("Error handling translation result", error);
      request.status = 'error';
      request.error = error.message;
      throw error;
    }
  }

  /**
   * Update element with translated text
   * @param {HTMLElement} element - Element to update
   * @param {string} translatedText - Translated text
   * @param {string} originalText - Original text for fallback
   */
  async updateElementWithTranslation(element, translatedText, originalText) {
    if (!element) {
      throw new Error("No element provided for translation update");
    }

    if (!translatedText) {
      this.logger.warn("No translated text provided, using original text");
      translatedText = originalText;
    }

    try {
      // Handle different element types
      if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
        element.value = translatedText;
      } else {
        element.textContent = translatedText;
      }

      // Add translation marker for potential revert
      element.setAttribute('data-translated', 'true');
      element.setAttribute('data-original-text', originalText);

      this.logger.debug("Element updated with translation", {
        tagName: element.tagName,
        originalLength: originalText.length,
        translatedLength: translatedText.length
      });

    } catch (error) {
      this.logger.error("Failed to update element with translation", error);
      throw error;
    }
  }

  /**
   * Add escape key listener for translation cancellation
   */
  addEscapeKeyListener() {
    if (this.escapeKeyListener) return;

    this.escapeKeyListener = (event) => {
      if (event.key === 'Escape' || event.code === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.logger.operation("ESC pressed during translation - cancelling");
        this.cancelAllTranslations();
      }
    };

    document.addEventListener('keydown', this.escapeKeyListener, { capture: true });
    this.logger.debug("Escape key listener added for translation cancellation");
  }

  /**
   * Remove escape key listener
   */
  removeEscapeKeyListener() {
    if (this.escapeKeyListener) {
      document.removeEventListener('keydown', this.escapeKeyListener, { capture: true });
      this.escapeKeyListener = null;
      this.logger.debug("Escape key listener removed");
    }
  }

  /**
   * Cancel all ongoing translations
   */
  async cancelAllTranslations() {
    this.logger.operation("Cancelling all ongoing translations");
    
    // Mark all pending requests as cancelled
    for (const [messageId, request] of this.translationRequests) {
      if (request.status === 'pending') {
        request.status = 'cancelled';
        request.error = 'Translation cancelled by user';
      }
    }

    // Remove escape key listener
    this.removeEscapeKeyListener();

    this.logger.debug(`Cancelled ${this.translationRequests.size} translation requests`);
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    this.cancelAllTranslations();
    this.translationRequests.clear();
    this.removeEscapeKeyListener();
    this.logger.debug('TranslationOrchestrator cleanup completed');
  }

  /**
   * Get debugging information
   * @returns {Object} Debug info
   */
  getDebugInfo() {
    return {
      activeRequests: this.translationRequests.size,
      requests: Array.from(this.translationRequests.entries()).map(([id, req]) => ({
        id,
        status: req.status,
        timestamp: req.timestamp,
        element: req.element ? {
          tagName: req.element.tagName,
          className: req.element.className,
          id: req.element.id
        } : null
      }))
    };
  }
}
