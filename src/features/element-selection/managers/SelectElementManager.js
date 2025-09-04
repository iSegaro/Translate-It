import browser from "webextension-polyfill";
import { collectTextNodes } from "@/utils/text/extraction.js";
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { pageEventBus } from '@/core/PageEventBus.js';

import { sendSmart } from "@/shared/messaging/core/SmartMessaging.js";
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import ExtensionContextManager from "@/core/extensionContext.js";
import ResourceTracker from '@/core/memory/ResourceTracker.js';

// Import services
import { ElementHighlighter } from "./services/ElementHighlighter.js";
import { TextExtractionService } from "./services/TextExtractionService.js";
import { TranslationOrchestrator } from "./services/TranslationOrchestrator.js";
import { ModeManager } from "./services/ModeManager.js";
import { ErrorHandlingService } from "./services/ErrorHandlingService.js";
import { StateManager } from "./services/StateManager.js";

// Import constants
import { KEY_CODES } from "./constants/selectElementConstants.js";

export class SelectElementManager extends ResourceTracker {
  constructor() {
    super('select-element-manager')
    
    this.isActive = false;
    this.isProcessingClick = false;
    this.logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'SelectElement');
    
    // Initialize services
    this.stateManager = new StateManager();
    this.elementHighlighter = new ElementHighlighter();
    this.textExtractionService = new TextExtractionService();
    this.translationOrchestrator = new TranslationOrchestrator(this.stateManager);
    this.modeManager = new ModeManager();
    this.errorHandlingService = new ErrorHandlingService();
    
    // Track services as resources for proper cleanup
    this.trackResource('state-manager', () => this.stateManager?.cleanup());
    this.trackResource('element-highlighter', () => this.elementHighlighter?.cleanup());
    this.trackResource('text-extraction-service', () => this.textExtractionService?.cleanup());
    this.trackResource('translation-orchestrator', () => this.translationOrchestrator?.cleanup());
    this.trackResource('mode-manager', () => this.modeManager?.cleanup());
    this.trackResource('error-handling-service', () => this.errorHandlingService?.cleanup());
    
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
    
    // Track AbortController as a custom resource
    this.trackResource('abort-controller', () => {
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }
    });
    
    const options = { signal: this.abortController.signal, capture: true };
    
    // Use ResourceTracker for event listeners
    this.addEventListener(document, "mouseover", this.handleMouseOver, options);
    this.addEventListener(document, "mouseout", this.handleMouseOut, options);
    this.addEventListener(document, "click", this.handleClick, options);
    
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
    
    // Note: AbortController cleanup is handled by ResourceTracker
    // No need to manually abort here as it's tracked as a resource
    
    await this.elementHighlighter.deactivateUI();
    
    // Use ResourceTracker cleanup for automatic resource management
    super.cleanup();
    
    this.logger.operation("Select element UI deactivated");
  }

  handleMouseOver(event) {
    if (!this.isActive) return;
    this.logger.debug("handleMouseOver triggered", { target: event.target.tagName, className: event.target.className });
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
        .catch(async (error) => {
          // Handle cancellation and other errors properly
          if (error.message === 'Translation cancelled by user') {
            this.logger.debug('Translation cancelled by user - handled');
          } else {
            this.logger.error('Translation process failed', error);
            // Handle translation errors through error handling service for proper UI feedback
            if (!error.alreadyHandled) {
              await this.errorHandlingService.handle(error, { 
                type: ErrorTypes.TRANSLATION_FAILED, 
                context: "select-element-translation" 
              });
            }
          }
        })
        .finally(() => {
          // Ensure cleanup after translation completes (success or failure)
          this.performPostTranslationCleanup();
        });

      // The UI is deactivated within performPostTranslationCleanup, which is called in the .finally() block.
      this.logger.info("[SelectElementManager] Text nodes collected for translation. Cleanup will occur upon completion.");
    } catch (error) {
      // Don't handle errors that are already handled
      if (!error.alreadyHandled) {
        this.logger.error("Element selection error", error);
        await this.errorHandlingService.handle(error, { type: ErrorTypes.INTEGRATION, context: "select-element-click" });
      } else {
        // Just log that error was already handled
        this.logger.debug("Translation process failed (error already handled)", error.message);
      }
    }
  }

  async cancelInProgressTranslation() {
    this.logger.operation("Request to cancel in-progress translation received");
    await this.translationOrchestrator.cancelAllTranslations();
  }

  performPostTranslationCleanup() {
    this.logger.debug("Performing post-translation cleanup");
    
    // Clear any remaining highlights
    pageEventBus.emit('clear-all-highlights');
    
    // Ensure UI is fully deactivated
    if (this.isActive) {
      this.deactivateUI().catch(error => {
        this.logger.warn('Error during post-translation UI cleanup:', error);
      });
    }
    
    // Reset processing state
    this.isProcessingClick = false;
    
    this.logger.debug("Post-translation cleanup completed");
  }

  async revertTranslations() {
    this.logger.info("Starting translation revert process in SelectElementManager");
    const revertedCount = await this.stateManager.revertTranslations();
    return revertedCount;
  }

  async cleanup() {
    this.logger.info("Cleaning up SelectElement manager");
    
    try {
      // Perform translation revert and deactivation first
      await this.revertTranslations();
      await this.deactivate();
      
      // ResourceTracker cleanup will handle all tracked resources including services
      super.cleanup();
      
      // Log memory statistics after cleanup
      const memStats = this.getStats();
      this.logger.info("SelectElement cleanup completed successfully", { memoryStats: memStats });
    } catch (error) {
      this.logger.error("Error during SelectElement cleanup", error);
      // Ensure ResourceTracker cleanup still runs even if other operations fail
      try {
        super.cleanup();
      } catch (cleanupError) {
        this.logger.error("Critical: ResourceTracker cleanup failed", cleanupError);
      }
      throw error;
    }
  }
  
  async _notifyDeactivation() {
    try {
      await sendSmart({
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