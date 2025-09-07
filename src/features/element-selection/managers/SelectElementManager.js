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

export class SelectElementManagerNew extends ResourceTracker {
  constructor() {
    super('select-element-manager')
    
    this.isActive = false;
    this.isProcessingClick = false;
    this.logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'SelectElement');
    
    // Debug instance creation
    this.instanceId = Math.random().toString(36).substring(7);
    this.isInIframe = window !== window.top;
    this.frameLocation = window.location.href;
    this.logger.init("New SelectElementManager instance created", {
      instanceId: this.instanceId,
      isInIframe: this.isInIframe,
      frameLocation: this.frameLocation,
    });
    
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
    this.logger.debug("SelectElementManager.initialize() started");
    try {
      this.logger.debug("Setting up keyboard listeners");
      this.setupKeyboardListeners();
      
      this.logger.debug("Initializing services");
      await this.stateManager.initialize();
      await this.elementHighlighter.initialize();
      await this.textExtractionService.initialize();
      await this.translationOrchestrator.initialize();
      await this.modeManager.initialize();
      await this.errorHandlingService.initialize();
      
      this.setupCrossFrameDeactivation();
      
      this.logger.debug("SelectElementManager.initialize() completed");
    } catch (error) {
      this.logger.error("SelectElementManager.initialize() failed", error);
      await this.errorHandlingService.handle(error, { type: ErrorTypes.INTEGRATION, context: "select-element-manager-init" });
      throw error;
    }
  }

  setupKeyboardListeners() {
    this.modeManager.setupKeyboardListeners();
  }

  /**
   * Setup cross-frame communication for deactivation
   * Listen for deactivation messages from other frames
   */
  setupCrossFrameDeactivation() {
    // Listen to pageEventBus for local frame communication (deactivation)
    pageEventBus.on('deactivate-all-select-managers', () => {
      if (this.isActive) {
        this.forceDeactivate();
      }
    });
    
    pageEventBus.on('clear-all-highlights', () => {
      this.elementHighlighter.clearAllHighlights();
    });
    
    // Listen to window.postMessage for cross-origin iframe communication
    const messageHandler = (event) => {
      if (event.data && event.data.type === 'DEACTIVATE_ALL_SELECT_MANAGERS') {
        if (this.isActive) {
          this.forceDeactivate();
        }
      }
    };
    
    this.addEventListener(window, 'message', messageHandler);
    
    this.logger.debug("Cross-frame deactivation listeners setup complete");
  }

  forceDeactivate() {
    this.logger.debug("Force deactivating SelectElementManager (background-initiated)", {
      instanceId: this.instanceId,
      isActive: this.isActive,
      isInIframe: this.isInIframe
    });
    
    this.isActive = false;
    this.isProcessingClick = false;
    window.isTranslationInProgress = false;
    
    pageEventBus.emit('select-mode-deactivated');
    // Remove event listeners immediately
    this.removeSelectionEventListeners();
    
    // Clear highlights immediately
    this.elementHighlighter.clearHighlight();
    this.elementHighlighter.clearAllHighlights();
    
    // Deactivate UI without await to be synchronous
    this.elementHighlighter.deactivateUI();
    

    
    if (this.translationOrchestrator && typeof this.translationOrchestrator.cancelAllTranslations === 'function') {
      try {
        this.translationOrchestrator.cancelAllTranslations().catch(() => {});
      } catch (e) {}
    }
    
    this.logger.debug("Force deactivation completed - state fully reset");
  }

  async activate() {
    this.logger.operation("SelectElementManager.activate() entry point", {
      instanceId: this.instanceId,
      isActive: this.isActive,
      isProcessingClick: this.isProcessingClick,
      isInIframe: this.isInIframe,
    });
    
    if (this.isActive) {
      this.logger.debug("SelectElementManager already active, checking state.", {
        instanceId: this.instanceId,
        hasAbortController: !!this.abortController,
        isAborted: this.abortController?.signal?.aborted,
      });
      
      if (!this.abortController || this.abortController.signal.aborted) {
        this.logger.debug("Re-initializing aborted/missing AbortController");
        
        this.abortController = new AbortController();
        this.trackResource('abort-controller', () => {
          if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
          }
        });
        
        const options = { signal: this.abortController.signal, capture: true };
        
        this.logger.debug("Re-adding event listeners in early return");
        this.addEventListener(document, "mouseover", this.handleMouseOver, options);
        this.addEventListener(document, "mouseout", this.handleMouseOut, options);
        this.addEventListener(document, "click", this.handleClick, options);
        
        this.logger.debug("Event listeners re-initialized for already active SelectElementManager");
      }
      
      // Always ensure global styles and page interactions are set when activating
      // This fixes cursor not changing on second activation
      this.elementHighlighter.addGlobalStyles();
      this.elementHighlighter.disablePageInteractions();
      
      return;
    }
    
    this.logger.debug("Activating select element mode", {
      isInIframe: this.isInIframe,
      frameLocation: this.frameLocation
    });
    pageEventBus.emit('select-mode-activated');
    this.isActive = true;
    this.abortController = new AbortController();
    
    this.trackResource('abort-controller', () => {
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }
    });
    
    const options = { signal: this.abortController.signal, capture: true };
    
    this.logger.debug("Adding SelectElementManager event listeners");
    this.addEventListener(document, "mouseover", this.handleMouseOver, options);
    this.addEventListener(document, "mouseout", this.handleMouseOut, options);
    this.addEventListener(document, "click", this.handleClick, options);
    
    this.elementHighlighter.addGlobalStyles();
    this.elementHighlighter.disablePageInteractions();
    this.logger.operation("Select element mode activated");
  }

  deactivate({ fromBackground = false } = {}) {
    this.logger.operation(
      `Deactivating select element mode`,
      {
        instanceId: this.instanceId,
        fromBackground,
        isInIframe: this.isInIframe,
      },
    );

    if (!fromBackground) {
      this.logger.debug(
        `Notifying background script to deactivate`,
        { instanceId: this.instanceId },
      );
      this._notifyDeactivation().catch((error) => {
        this.errorHandlingService.handleError(
          error,
          'Failed to send deactivation message',
        );
      });
    }

    if (!this.isActive) {
      this.logger.debug(`deactivate() called but already inactive`, {
        instanceId: this.instanceId,
        isActive: this.isActive,
        isInIframe: this.isInIframe,
      });
      return;
    }

    this.isActive = false;
    this.deactivateSelectionUI();
    
    // Only cancel if this is not during translation (to avoid interrupting ongoing translation)
    if (!window.isTranslationInProgress) {
      this.translationOrchestrator.cancelAllTranslations();
    }

    this.logger.info('Select element UI deactivated');
    this.cleanup();
  }

  async deactivateUI() {
    if (!this.isActive) return;
    this.isActive = false;
    await this.elementHighlighter.deactivateUI();
    super.cleanup();
    this.logger.debug("Select element UI deactivated");
  }

  handleMouseOver(event) {
    if (!this.isActive) {
      return;
    }
    this.logger.debug("handleMouseOver triggered", { 
      target: event.target.tagName, 
      instanceId: this.instanceId
    });
    this.elementHighlighter.handleMouseOver(event.target);
  }

  handleMouseOut(event) {
    if (!this.isActive) return;
    this.elementHighlighter.handleMouseOut(event.target);
  }

  async handleClick(event) {
    this.logger.operation("SelectElementManager handleClick called", { 
      target: event.target.tagName,
      isActive: this.isActive,
      isProcessingClick: this.isProcessingClick,
    });

    if (!this.isActive || this.isProcessingClick) {
      this.logger.warn("SelectElementManager handleClick ignored (already processing or inactive)", {
        isActive: this.isActive,
        isProcessingClick: this.isProcessingClick
      });
      return;
    }
    this.isProcessingClick = true;
    window.isTranslationInProgress = true;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const element = this.elementHighlighter.currentHighlighted || event.target;

    this.logger.debug("Disabling selection UI immediately after click");
    await this.deactivateSelectionUIOnly();
    pageEventBus.emit('clear-all-highlights');

    try {
      const { textNodes, originalTextsMap } = collectTextNodes(element);
      if (originalTextsMap.size === 0) {
        this.logger.operation("No text found in element, deactivating selection mode.", {
          elementTag: element.tagName,
        });
        
        pageEventBus.emit('show-notification', {
          message: "No text found to translate.",
          type: "warning",
        });
        this.isProcessingClick = false;
        window.isTranslationInProgress = false;
        
        this.logger.debug("Calling this.deactivate() to trigger cross-frame deactivation");
        await this.deactivate();
        this.logger.debug("this.deactivate() completed");
        return;
      }

      this.translationOrchestrator.processSelectedElement(element, originalTextsMap, textNodes)
        .catch(async (error) => {
          if (error.message === 'Translation cancelled by user') {
            this.logger.debug('Translation cancelled by user - handled');
          } else {
            this.logger.error('Translation process failed', error);
            if (!error.alreadyHandled) {
              await this.errorHandlingService.handle(error, { 
                type: ErrorTypes.TRANSLATION_FAILED, 
                context: "select-element-translation" 
              });
            }
          }
        })
        .finally(() => {
          this.performPostTranslationCleanup();
        });

      this.logger.info("Text nodes collected for translation. Cleanup will occur upon completion.");
    } catch (error) {
      if (!error.alreadyHandled) {
        this.logger.error("Element selection error", error);
        await this.errorHandlingService.handle(error, { type: ErrorTypes.INTEGRATION, context: "select-element-click" });
      } else {
        this.logger.debug("Translation process failed (error already handled)", error.message);
      }
      
      // Reset state on error
      this.isProcessingClick = false;
      window.isTranslationInProgress = false;
    }
  }

  async cancelInProgressTranslation() {
    this.logger.operation("Request to cancel in-progress translation received");
    await this.translationOrchestrator.cancelAllTranslations();
  }

  async deactivateSelectionUIOnly() {
    this.logger.debug("Deactivating selection UI only (immediate feedback) - NOT notifying background");

    // DON'T notify background yet - we're just hiding the UI
    // Background notification should only happen after translation is complete
    
    // EMIT CROSS-FRAME DEACTIVATION EVENT TO ALL FRAMES
    pageEventBus.emit('select-mode-deactivated');

    // EMIT CROSS-FRAME DEACTIVATION EVENT TO ALL FRAMES
    pageEventBus.emit('deactivate-all-select-managers');
    pageEventBus.emit('clear-all-highlights');
    
    // Also send via window.postMessage for cross-origin iframe support
    try {
      if (window.parent !== window) {
        window.parent.postMessage({
          type: 'DEACTIVATE_ALL_SELECT_MANAGERS',
          source: 'translate-it-iframe'
        }, '*');
      }
      // Also broadcast to child frames
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach(iframe => {
        try {
          iframe.contentWindow.postMessage({
            type: 'DEACTIVATE_ALL_SELECT_MANAGERS', 
            source: 'translate-it-main'
          }, '*');
        } catch {
          // Cross-origin iframe, ignore
        }
      });
    } catch {
      // Ignore cross-origin errors
    }
    
    // Keep selection active but disable highlighting
    // this.isActive = false; // DON'T disable - keep it active for potential retry
    
    // Remove event listeners temporarily to prevent re-highlighting during translation
    // this.removeSelectionEventListeners(); // DON'T remove - just disable highlighting
    
    // Clear current highlight first (this is what was missing!)
    this.elementHighlighter.clearHighlight();
    
    // Deactivate UI elements
    await this.elementHighlighter.deactivateUI();

    this.logger.debug("Selection UI deactivated immediately");
  }

  /**
   * Remove selection-related event listeners immediately after click
   */
  removeSelectionEventListeners() {
    // Remove specific selection-related event listeners via ResourceTracker
    // Note: This will remove ALL event listeners for this SelectElementManager instance
    // but that's exactly what we want after click to prevent re-highlighting
    this.cleanup(); // This removes all event listeners tracked by ResourceTracker
    
    // Also disable the selection behavior flag
    this.isActive = false;
    
    this.logger.debug("Selection event listeners physically removed via ResourceTracker.cleanup()");
  }

  performPostTranslationCleanup() {
    this.logger.debug("Performing post-translation cleanup");
    
    // Clear any remaining highlights (redundant but safe)
    pageEventBus.emit('clear-all-highlights');
    
    this._notifyDeactivation().catch(error => {
      this.logger.warn('Error notifying background during post-translation cleanup:', error);
    });
    
    if (this.isActive) {
      this.deactivate().catch(error => {
        this.logger.warn('Error during post-translation cleanup:', error);
      });
    }
    
    // Reset processing state and translation flag
    this.isProcessingClick = false;
    window.isTranslationInProgress = false;
    
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
      // Perform translation revert
      // await this.revertTranslations();
      // ResourceTracker cleanup will handle all tracked resources including services
      super.cleanup();
      
      // Log memory statistics after cleanup
      const memStats = this.getStats();
      this.logger.info("SelectElement cleanup completed successfully");
      this.logger.debug("SelectElement cleanup completed successfully", { memoryStats: memStats });
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
      this.logger.debug("Sending setSelectElementState(active: false) to background");
      
      await sendSmart({
        action: MessageActions.SET_SELECT_ELEMENT_STATE,
        data: { active: false }
      });
      
      this.logger.debug('Successfully notified background: select element deactivated');
    } catch (err) {
      this.logger.error('Failed to notify background about deactivation', err);
    }
  }

  async handleTranslationResult(message) {
      return this.translationOrchestrator.handleTranslationResult(message);
  }
}


// Export singleton instance for backward compatibility
export const selectElementManager = new SelectElementManagerNew();

// Auto-initialize when script loads
if (typeof document !== "undefined") {
  selectElementManager.initialize();
}