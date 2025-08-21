// Core SelectElementManager - Main coordinator class
// Delegates specific responsibilities to specialized services

import browser from "webextension-polyfill";
import { getScopedLogger } from "../../../utils/core/logger.js";
import { LOG_COMPONENTS } from "../../../utils/core/logConstants.js";
import { ErrorHandler } from "../../../error-management/ErrorHandler.js";
import { ErrorTypes } from "../../../error-management/ErrorTypes.js";
import { getTimeoutAsync } from "../../../config.js";
import { MessageFormat, MessagingContexts } from "../../../messaging/core/MessagingCore.js";
import { MessageActions } from "@/messaging/core/MessageActions.js";
import { generateContentMessageId } from "../../../utils/messaging/messageId.js";
import NotificationManager from "@/managers/core/NotificationManager.js";

// Import services
import { ElementHighlighter } from "./services/ElementHighlighter.js";
import { TextExtractionService } from "./services/TextExtractionService.js";
import { TranslationOrchestrator } from "./services/TranslationOrchestrator.js";
import { ModeManager } from "./services/ModeManager.js";
import { ErrorHandlingService } from "./services/ErrorHandlingService.js";
import { StateManager } from "./services/StateManager.js";

// Import constants
import { UI_CONSTANTS, EVENT_OPTIONS, KEY_CODES } from "./constants/selectElementConstants.js";

/**
 * SelectElementManager - Vue-compatible element selection system
 * Main coordinator that delegates to specialized services
 */
export class SelectElementManager {
  constructor() {
    this.isActive = false;
    this.browser = null;
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'SelectElement');
    
    // Initialize services
    this.elementHighlighter = new ElementHighlighter();
    this.textExtractionService = new TextExtractionService();
    this.translationOrchestrator = new TranslationOrchestrator();
    this.modeManager = new ModeManager();
    this.errorHandlingService = new ErrorHandlingService();
    this.stateManager = new StateManager();
    
    // Event handlers (bound to this)
    this.handleMouseOver = this.handleMouseOver.bind(this);
    this.handleMouseOut = this.handleMouseOut.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleMessage = this.handleMessage.bind(this);

    // State tracking
    this.messageListener = null;
    this.abortController = null;
    
    this.logger.init('Select element manager initialized with modular architecture');
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
      await this.elementHighlighter.initialize();
      await this.textExtractionService.initialize();
      await this.translationOrchestrator.initialize();
      await this.modeManager.initialize();
      await this.errorHandlingService.initialize();
      await this.stateManager.initialize();

      // Initialize notification manager
      this.notificationManager = new NotificationManager(this.errorHandlingService.getErrorHandler());

      this.logger.debug('Browser API and all services initialized');
    } catch (error) {
      this.logger.error("Initialization failed", error);
      await this.errorHandlingService.handle(error, {
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
   * Setup keyboard listeners for Ctrl key dynamic mode switching
   */
  setupKeyboardListeners() {
    this.modeManager.setupKeyboardListeners();
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

        // Handle error via ErrorHandler
        await this.errorHandlingService.handle(error, {
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

    // Handle TRANSLATION_RESULT_UPDATE messages
    if (message.action === MessageActions.TRANSLATION_RESULT_UPDATE) {
      this.logger.debug('Received TRANSLATION_RESULT_UPDATE', { message, context: message.context });
      
      // Only handle messages for EVENT_HANDLER context  
      if (message.context === MessagingContexts.EVENT_HANDLER) {
        await this.translationOrchestrator.handleTranslationResult(message);
        return true;
      } else {
        this.logger.debug('Ignoring TRANSLATION_RESULT_UPDATE - wrong context', message.context);
        return false;
      }
    }

    return false; // Let other handlers process the message
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
    this.elementHighlighter.addGlobalStyles();
    
    // Disable page interactions
    this.elementHighlighter.disablePageInteractions();
    
    this.logger.operation("Select element mode activated");
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

    this.isActive = false;

    // Cancel ongoing translations for full deactivation
    await this.translationOrchestrator.cancelAllTranslations();

    // Use the common UI deactivation logic if still active
    await this.elementHighlighter.deactivateUI();

    // Remove ESC key listener for background translation
    this.translationOrchestrator.removeEscapeKeyListener();

    // Clear NEW select manager flag
    window.translateItNewSelectManager = false;

    this.logger.operation("Select element mode fully deactivated");
  }

  /**
   * Handle mouse over event - highlight element
   */
  handleMouseOver(event) {
    if (!this.isActive) return;

    const element = event.target;
    this.elementHighlighter.handleMouseOver(element);
  }

  /**
   * Handle mouse out event - remove highlight
   */
  handleMouseOut(event) {
    if (!this.isActive) return;

    const element = event.target;
    this.elementHighlighter.handleMouseOut(element);
  }

  /**
   * Handle click event - select element for translation
   */
  async handleClick(event) {
    if (!this.isActive) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation(); // Prevent other handlers

    const element = event.target;
    
    try {
      // Extract text from the target element
      const extractedText = this.textExtractionService.extractTextFromElement(element);
      if (!extractedText || extractedText.trim().length === 0) {
        this.logger.warn("No text found in selected element");
        await this.notificationManager.show(
          "No text found in selected element. Please select an element with text content.",
          "warning",
          true,
          3000
        );
        return;
      }

      this.logger.info(
        "[SelectElementManager] Text extracted successfully:",
        {
          length: extractedText.length,
          preview: extractedText.substring(0, 100) + (extractedText.length > 100 ? "..." : "")
        }
      );

      // Deactivate select element mode immediately after click (UI only)
      this.logger.operation("Deactivating select element mode after element selection");
      await this.elementHighlighter.deactivateUI();

      // Notify background that selection mode is deactivating to sync UI
      try {
        const { sendReliable } = await import('../../../messaging/core/ReliableMessaging.js');
        await sendReliable({ action: MessageActions.SET_SELECT_ELEMENT_STATE, data: { activate: false } });
        this.logger.debug('Notified background: select element deactivated on click for UI sync');
      } catch (err) {
        this.logger.warn('Failed to notify background about deactivation on click', err);
      }

      // Process element with full text extraction (in background)
      await this.translationOrchestrator.processSelectedElement(element, extractedText);
    } catch (error) {
      this.logger.error("Element selection error", error);
      await this.errorHandlingService.handle(error, {
        type: ErrorTypes.INTEGRATION,
        context: "select-element-click",
      });
    }
  }

  /**
   * Handle keyboard events
   */
  async handleKeyDown(event) {
    if (!this.isActive) return;

    this.logger.debug("KeyDown event received", {
      key: event.key,
      code: event.code,
      target: event.target?.tagName
    });

    if (event.key === KEY_CODES.ESCAPE || event.code === KEY_CODES.ESCAPE) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      this.logger.operation("ESC pressed - cancelling selection");

      // Cancel any pending translations
      await this.translationOrchestrator.cancelAllTranslations();

      // If there are translated elements, revert them
      if (this.stateManager.hasTranslatedElements()) {
        this.logger.debug(
          "[SelectElementManager] Reverting translations before deactivation"
        );
        try {
          await this.revertTranslations();
        } catch (err) {
          this.logger.warn('Error while reverting translations on ESC', err);
        }
      }

      // Deactivate if still active
      try {
        if (this.isActive) {
          await this.deactivate();
          // After organic deactivation, NOTIFY THE BACKGROUND so other UIs can sync
          try {
            const { sendReliable } = await import('../../../messaging/core/ReliableMessaging.js');
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
   * Revert all translations made during this session
   */
  async revertTranslations() {
    try {
      this.logger.info("Starting translation revert process");
      const revertedCount = await this.stateManager.revertTranslations();
      
      // Show notification
      if (revertedCount > 0) {
        await this.notificationManager.show(
          `${revertedCount} translation(s) reverted successfully`,
          "success",
          true,
          2000
        );
        this.logger.debug(
          `[SelectElementManager] Successfully reverted ${revertedCount} translations`
        );
      } else {
        this.logger.info("No translations found to revert");
      }

      return revertedCount;
    } catch (error) {
      this.logger.error("Error during revert", error);
      await this.errorHandlingService.handle(error, {
        type: ErrorTypes.UI,
        context: "select-element-revert",
      });
      await this.notificationManager.show("Failed to revert translations", "error", true, 4000);
      return 0;
    }
  }

  /**
   * Update configuration for text validation
   * @param {Object} newConfig - Configuration object
   */
  updateConfig(newConfig) {
    this.modeManager.updateConfig(newConfig);
    this.textExtractionService.updateConfig(newConfig);
  }

  /**
   * Get current configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    return this.modeManager.getConfig();
  }

  /**
   * Switch between simple and smart modes
   * @param {SelectElementMode} mode - Validation mode
   */
  setMode(mode) {
    this.modeManager.setMode(mode);
  }

  /**
   * Get current mode
   * @returns {string} Current mode
   */
  getMode() {
    return this.modeManager.getMode();
  }

  /**
   * Debug method to analyze why an element is or isn't valid
   * @param {HTMLElement} element - Element to analyze
   * @returns {Object} Analysis result
   */
  analyzeElement(element) {
    return this.textExtractionService.analyzeElement(element);
  }

  /**
   * Cleanup - remove all listeners and overlays
   */
  async cleanup() {
    this.logger.info("Cleaning up SelectElement manager");

    // Revert any active translations
    if (this.stateManager.hasTranslatedElements()) {
      await this.revertTranslations();
    }

    await this.deactivate();

    // Remove message listener
    if (this.browser && this.messageListener) {
      this.browser.runtime.onMessage.removeListener(this.messageListener);
      this.messageListener = null;
    }

    // Cleanup all services
    await this.elementHighlighter.cleanup();
    await this.textExtractionService.cleanup();
    await this.translationOrchestrator.cleanup();
    await this.modeManager.cleanup();
    await this.errorHandlingService.cleanup();
    await this.stateManager.cleanup();
    
    this.logger.info("SelectElement cleanup completed");
  }

  /**
   * Get performance and debugging information
   */
  getDebugInfo() {
    return {
      isActive: this.isActive,
      elementHighlighter: this.elementHighlighter.getDebugInfo(),
      textExtractionService: this.textExtractionService.getDebugInfo(),
      translationOrchestrator: this.translationOrchestrator.getDebugInfo(),
      modeManager: this.modeManager.getDebugInfo(),
      stateManager: this.stateManager.getDebugInfo(),
      errorHandlingService: this.errorHandlingService.getDebugInfo()
    };
  }
}

// Export singleton instance for backward compatibility
export const selectElementManager = new SelectElementManager();

// Auto-initialize when script loads
if (typeof document !== "undefined") {
  selectElementManager.initialize();
}
