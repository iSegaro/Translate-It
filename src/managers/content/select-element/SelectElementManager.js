import browser from "webextension-polyfill";
import { collectTextNodes } from "../../../utils/text/extraction.js";
import { getScopedLogger } from "../../../utils/core/logger.js";
import { LOG_COMPONENTS } from "../../../utils/core/logConstants.js";
import { ErrorTypes } from "../../../error-management/ErrorTypes.js";
import { pageEventBus } from '@/utils/core/PageEventBus.js';

import { sendReliable } from "@/messaging/core/ReliableMessaging.js";
import { MessageActions } from "@/messaging/core/MessageActions.js";
import ExtensionContextManager from "@/utils/core/extensionContext.js";

// Import services
import { ElementHighlighter } from "./services/ElementHighlighter.js";
import { TextExtractionService } from "./services/TextExtractionService.js";
import { TranslationOrchestrator } from "./services/TranslationOrchestrator.js";
import { ModeManager } from "./services/ModeManager.js";
import { ErrorHandlingService } from "./services/ErrorHandlingService.js";
import { StateManager } from "./services/StateManager.js";

// Import constants
import { KEY_CODES } from "./constants/selectElementConstants.js";

export class SelectElementManager {
  constructor() {
    this.isActive = false;
    this.isProcessingClick = false;
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'SelectElement');
    
    // Initialize services
    this.stateManager = new StateManager();
    this.elementHighlighter = new ElementHighlighter();
    this.textExtractionService = new TextExtractionService();
    this.translationOrchestrator = new TranslationOrchestrator(this.stateManager);
    this.modeManager = new ModeManager();
    this.errorHandlingService = new ErrorHandlingService();
    
    this.handleMouseOver = this.handleMouseOver.bind(this);
    this.handleMouseOut = this.handleMouseOut.bind(this);
    this.handleClick = this.handleClick.bind(this);

    this.abortController = null;
    
    this.logger.init('Select element manager initialized');
  }

  async initialize() {
    try {
      this.setupKeyboardListeners();
      await this.stateManager.initialize();
      await this.elementHighlighter.initialize();
      await this.textExtractionService.initialize();
      await this.translationOrchestrator.initialize();
      await this.modeManager.initialize();
      await this.errorHandlingService.initialize();
      this.logger.debug('All services initialized');
    } catch (error) {
      this.logger.error("Initialization failed", error);
      await this.errorHandlingService.handle(error, { type: ErrorTypes.INTEGRATION, context: "select-element-manager-init" });
    }
  }

  setupKeyboardListeners() {
    this.modeManager.setupKeyboardListeners();
  }

  async activate() {
    if (this.isActive) return;
    this.logger.operation("Activating select element mode");
    pageEventBus.emit('select-mode-activated');
    this.isActive = true;
    this.abortController = new AbortController();
    const options = { signal: this.abortController.signal, capture: true };
    document.addEventListener("mouseover", this.handleMouseOver, options);
    document.addEventListener("mouseout", this.handleMouseOut, options);
    document.addEventListener("click", this.handleClick, options);
    this.elementHighlighter.addGlobalStyles();
    this.elementHighlighter.disablePageInteractions();
    this.logger.operation("Select element mode activated");
  }

  async deactivate() {
    if (!this.isActive) return;
    this.logger.operation("Deactivating select element mode");
    pageEventBus.emit('select-mode-deactivated');
    await this.translationOrchestrator.cancelAllTranslations();
    await this.deactivateUI();
    await this._notifyDeactivation();
  }

  async deactivateUI() {
    if (!this.isActive) return;
    this.isActive = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    await this.elementHighlighter.deactivateUI();
    this.logger.operation("Select element UI deactivated");
  }

  handleMouseOver(event) {
    if (!this.isActive) return;
    this.elementHighlighter.handleMouseOver(event.target);
  }

  handleMouseOut(event) {
    if (!this.isActive) return;
    this.elementHighlighter.handleMouseOut(event.target);
  }

  async handleClick(event) {
    this.logger.debug("handleClick triggered", { target: event.target });

    if (!this.isActive || this.isProcessingClick) return;
    this.isProcessingClick = true;
    window.isTranslationInProgress = true; // Set flag immediately

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const element = this.elementHighlighter.currentHighlighted || event.target;

    try {
      const { textNodes, originalTextsMap } = collectTextNodes(element);
      if (originalTextsMap.size === 0) {
        this.logger.info("No text found in selected element");
        pageEventBus.emit('show-notification', {
          message: "No text found to translate.",
          type: "warning",
        });
        this.isProcessingClick = false;
        return;
      }

      // Start translation process immediately (don't await)
      this.translationOrchestrator.processSelectedElement(element, originalTextsMap, textNodes)
        .catch(error => {
          // Handle cancellation and other errors silently to avoid unhandled promise rejection
          if (error.message === 'Translation cancelled by user') {
            this.logger.debug('Translation cancelled by user - handled');
          } else {
            this.logger.error('Translation process failed', error);
          }
        });

      // Deactivate UI after kicking off the translation
      this.logger.info("[SelectElementManager] Text nodes collected for translation");
      await this.deactivateUI();
      await this._notifyDeactivation();
      document.removeEventListener("click", this.handleClick, true); // Force remove listener
    } catch (error) {
      this.logger.error("Element selection error", error);
      await this.errorHandlingService.handle(error, { type: ErrorTypes.INTEGRATION, context: "select-element-click" });
    } finally {
      this.isProcessingClick = false;
    }
  }

  async cancelInProgressTranslation() {
    this.logger.operation("Request to cancel in-progress translation received");
    await this.translationOrchestrator.cancelAllTranslations();
  }

  async revertTranslations() {
    this.logger.info("Starting translation revert process in SelectElementManager");
    const revertedCount = await this.stateManager.revertTranslations();
    return revertedCount;
  }

  async cleanup() {
    this.logger.info("Cleaning up SelectElement manager");
    await this.revertTranslations();
    await this.deactivate();
    await this.elementHighlighter.cleanup();
    await this.translationOrchestrator.cleanup();
    await this.modeManager.cleanup();
    await this.errorHandlingService.cleanup();
    await this.stateManager.cleanup();
    this.logger.info("SelectElement cleanup completed");
  }
  
  async _notifyDeactivation() {
    try {
      await sendReliable({
        action: MessageActions.SET_SELECT_ELEMENT_STATE,
        data: { active: false }
      });
      this.logger.debug('Notified background: select element deactivated');
    } catch (err) {
      this.logger.warn('Failed to notify background about deactivation', err);
    }
  }

  async handleTranslationResult(message) {
      return this.translationOrchestrator.handleTranslationResult(message);
  }
}

// Export singleton instance for backward compatibility
export const selectElementManager = new SelectElementManager();

// Auto-initialize when script loads
if (typeof document !== "undefined") {
  selectElementManager.initialize();
}