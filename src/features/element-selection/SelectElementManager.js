// SelectElementManager - Unified Manager for Select Element functionality
// Single responsibility: Manage Select Element mode lifecycle and interactions

import browser from "webextension-polyfill";
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { sendMessage } from "@/shared/messaging/core/UnifiedMessaging.js";
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";

// Core services
import { ElementHighlighter } from "./managers/services/ElementHighlighter.js";
import { TextExtractionService } from "./managers/services/TextExtractionService.js";
import { TranslationOrchestrator } from "./managers/services/TranslationOrchestrator.js";
import { ModeManager } from "./managers/services/ModeManager.js";
import { StateManager } from "./managers/services/StateManager.js";
import { ErrorHandlingService } from "./managers/services/ErrorHandlingService.js";

// Constants
import { KEY_CODES } from "./managers/constants/selectElementConstants.js";

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'SelectElementManager');

class SelectElementManager extends ResourceTracker {
  constructor() {
    super('select-element-manager');
    
    // Core state
    this.isActive = false;
    this.isProcessingClick = false;
    this.isInitialized = false;
    this.instanceId = Math.random().toString(36).substring(7);
    this.isInIframe = window !== window.top;
    
    // Debug info
    this.frameLocation = window.location.href;
    
    // Logger for this instance
    this.logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'SelectElementManager');
    
    // Core services
    this.stateManager = new StateManager();
    this.elementHighlighter = new ElementHighlighter();
    this.textExtractionService = new TextExtractionService();
    this.translationOrchestrator = new TranslationOrchestrator(this.stateManager);
    this.modeManager = new ModeManager();
    this.errorHandlingService = new ErrorHandlingService();
    
    // Track services for cleanup
    this.trackResource('state-manager', () => this.stateManager?.cleanup());
    this.trackResource('element-highlighter', () => this.elementHighlighter?.cleanup());
    this.trackResource('text-extraction-service', () => this.textExtractionService?.cleanup());
    this.trackResource('translation-orchestrator', () => this.translationOrchestrator?.cleanup());
    this.trackResource('mode-manager', () => this.modeManager?.cleanup());
    this.trackResource('error-handling-service', () => this.errorHandlingService?.cleanup());
    
    // Event handlers
    this.handleMouseOver = this.handleMouseOver.bind(this);
    this.handleMouseOut = this.handleMouseOut.bind(this);
    this.handleClick = this.handleClick.bind(this);
    
    // Notification management
    this.currentNotification = null;
    
    this.logger.init("New SelectElementManager instance created", {
      instanceId: this.instanceId,
      isInIframe: this.isInIframe,
      frameLocation: this.frameLocation,
    });
  }
  
  // Singleton pattern
  static instance = null;
  static initializing = false;
  
  static async getInstance() {
    if (!SelectElementManager.instance) {
      if (SelectElementManager.initializing) {
        // Wait for initialization to complete
        while (SelectElementManager.initializing) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        return SelectElementManager.instance;
      }
      
      SelectElementManager.initializing = true;
      try {
        SelectElementManager.instance = new SelectElementManager();
        await SelectElementManager.instance.initialize();
      } catch (error) {
        SelectElementManager.instance = null;
        throw error;
      } finally {
        SelectElementManager.initializing = false;
      }
    }
    return SelectElementManager.instance;
  }
  
  static clearInstance() {
    if (SelectElementManager.instance) {
      SelectElementManager.instance.cleanup();
      SelectElementManager.instance = null;
    }
  }
  
  async initialize() {
    if (this.isInitialized) {
      this.logger.debug("SelectElementManager already initialized, skipping");
      return;
    }
    
    this.logger.debug("SelectElementManager.initialize() started");
    try {
      // Initialize all services
      await this.stateManager.initialize();
      await this.elementHighlighter.initialize();
      await this.textExtractionService.initialize();
      await this.translationOrchestrator.initialize();
      await this.modeManager.initialize();
      await this.errorHandlingService.initialize();
      
      // Setup keyboard listeners
      this.setupKeyboardListeners();
      
      // Setup cancel listener
      this.setupCancelListener();
      
      // Setup cross-frame communication
      this.setupCrossFrameCommunication();
      
      this.isInitialized = true;
      this.logger.debug("SelectElementManager initialized successfully");
    } catch (error) {
      this.logger.error("Error initializing SelectElementManager:", error);
      throw error;
    }
  }
  
  async activate() {
    if (this.isActive) {
      this.logger.debug("SelectElementManager already active");
      return;
    }
    
    this.logger.debug("SelectElementManager.activate() entry point", {
      instanceId: this.instanceId,
      isActive: this.isActive,
      isProcessingClick: this.isProcessingClick,
      isInIframe: this.isInIframe,
      url: window.location.href
    });
    
    try {
      // Reset state
      this.isActive = true;
      this.isProcessingClick = false;
      
      this.logger.debug("Setting up event listeners...");
      // Setup event listeners
      this.setupEventListeners();
      
      this.logger.debug("Setting up UI behaviors...");
      // Setup UI behaviors (cursor and link disabling)
      this.elementHighlighter.addGlobalStyles();
      this.elementHighlighter.disablePageInteractions();
      
      this.logger.debug("Setting up notification...");
      // Show notification
      this.showNotification();
      
      this.logger.debug("Notifying background script...");
      // Notify background script
      await this.notifyBackgroundActivation();
      
      this.logger.info("Select element mode activated successfully");
      
    } catch (error) {
      this.logger.error("Error activating SelectElementManager:", {
        error: error.message,
        stack: error.stack,
        url: window.location.href,
        instanceId: this.instanceId
      });
      this.isActive = false;
      throw new Error(`SelectElementManager activation failed: ${error.message}`);
    }
  }
  
  async deactivate(options = {}) {
    if (!this.isActive) {
      this.logger.debug("SelectElementManager not active");
      return;
    }
    
    const { fromBackground = false, fromNotification = false } = options;
    
    this.logger.debug("Deactivating SelectElementManager", {
      fromBackground,
      fromNotification,
      instanceId: this.instanceId
    });
    
    try {
      // Set active state immediately
      this.isActive = false;
      
      // Cancel any ongoing translations
      await this.translationOrchestrator.cancelAllTranslations();
      
      // Remove event listeners
      this.removeEventListeners();
      
      // Clear highlights
      this.elementHighlighter.clearHighlight();
      await this.elementHighlighter.deactivateUI();
      
      // Dismiss notification
      this.dismissNotification();
      
      // Cleanup state
      this.stateManager.clearState();
      
      // Notify background script (unless initiated from background)
      if (!fromBackground) {
        await this.notifyBackgroundDeactivation();
      }
      
      this.logger.info("SelectElementManager deactivated successfully");
      
    } catch (error) {
      this.logger.error("Error deactivating SelectElementManager:", error);
      // Continue with cleanup even if error occurs
      this.isActive = false;
      this.forceCleanup();
    }
  }
  
  async forceDeactivate() {
    this.logger.debug("Force deactivating SelectElementManager");
    
    // Set active state immediately
    this.isActive = false;
    this.isProcessingClick = false;
    
    try {
      // Cancel all translations immediately
      await this.translationOrchestrator.cancelAllTranslations();
      
      // Remove event listeners immediately
      this.removeEventListeners();
      
      // Clear highlights immediately
      this.elementHighlighter.clearHighlight();
      await this.elementHighlighter.deactivateUI();
      
      // Dismiss notification immediately
      this.dismissNotification();
      
      // Clear state
      this.stateManager.clearState();
      
      this.logger.info("SelectElementManager force deactivated successfully");
      
    } catch (error) {
      this.logger.error("Error during force deactivation:", error);
      // Ensure state is reset even if cleanup fails
      this.isActive = false;
      this.isProcessingClick = false;
    }
  }
  
  setupEventListeners() {
    if (this.isActive) {
      document.addEventListener('mouseover', this.handleMouseOver, true);
      document.addEventListener('mouseout', this.handleMouseOut, true);
      document.addEventListener('click', this.handleClick, true);
      
      this.logger.debug("Event listeners setup for SelectElementManager");
    }
  }
  
  removeEventListeners() {
    document.removeEventListener('mouseover', this.handleMouseOver, true);
    document.removeEventListener('mouseout', this.handleMouseOut, true);
    document.removeEventListener('click', this.handleClick, true);
    
    this.logger.debug("Event listeners removed for SelectElementManager");
  }
  
  handleMouseOver(event) {
    if (!this.isActive || this.isProcessingClick) return;
    
    this.elementHighlighter.handleMouseOver(event.target);
  }
  
  handleMouseOut(event) {
    if (!this.isActive || this.isProcessingClick) return;
    
    this.elementHighlighter.handleMouseOut(event.target);
  }
  
  async handleClick(event) {
    if (!this.isActive || this.isProcessingClick) return;
    
    this.logger.debug("Element clicked in SelectElement mode");
    
    try {
      this.isProcessingClick = true;
      
      // Extract text from clicked element
      const text = await this.textExtractionService.extractTextFromElement(event.target);
      
      this.logger.info("Text extraction result:", { 
        text: text,
        textLength: text?.length || 0,
        elementType: event.target.tagName,
        hasText: !!(text && text.trim())
      });
      
      if (text && text.trim()) {
        this.logger.debug("Text extracted from clicked element", { 
          textLength: text.length,
          elementType: event.target.tagName 
        });
        
        // Clear all highlights and UI immediately after click
        this.elementHighlighter.clearAllHighlights();
        this.elementHighlighter.deactivateUI();
        
        // Remove mouse event listeners temporarily to prevent re-highlighting
        this.removeEventListeners();
        
        // Start translation process
        await this.startTranslation(text, event.target);
        
      } else {
        this.logger.debug("No text found in clicked element");
      }
      
    } catch (error) {
      this.logger.error("Error handling element click:", error);
      this.errorHandlingService.handle(error, {
        context: 'SelectElementManager-handleClick'
      });
    } finally {
      this.isProcessingClick = false;
    }
  }
  
  async startTranslation(text, targetElement) {
    try {
      this.logger.debug("Starting translation process");
      
      // Update notification to show translation in progress
      this.updateNotificationForTranslation();
      
      // Create text nodes map and original texts map for translation
      const textNodes = [];
      const nodeToTextMap = new Map(); // Map<Node, string> for DOM operations
      const originalTextsMap = new Map(); // Map<string, Node[]> for translation system
      
      // Find all text nodes within the element
      const walker = document.createTreeWalker(
        targetElement,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      
      let textNode;
      while ((textNode = walker.nextNode())) {
        const nodeText = textNode.textContent.trim();
        if (nodeText) {
          textNodes.push(textNode);
          nodeToTextMap.set(textNode, nodeText);
          
          // Add to originalTextsMap in the format expected by translation system
          if (originalTextsMap.has(nodeText)) {
            originalTextsMap.get(nodeText).push(textNode);
          } else {
            originalTextsMap.set(nodeText, [textNode]);
          }
        }
      }
      
      this.logger.info("Prepared translation data:", {
        textNodesCount: textNodes.length,
        foundTexts: textNodes.map(node => node.textContent.trim()),
        originalTextsMap: Array.from(originalTextsMap.entries()),
        nodeToTextMap: Array.from(nodeToTextMap.entries())
      });
      
      // Perform translation via orchestrator with context
      const result = await this.translationOrchestrator.processSelectedElement(targetElement, originalTextsMap, textNodes, 'select-element');
      
      // Check if result is valid before accessing properties
      if (result && typeof result === 'object') {
        this.logger.debug("Translation completed", { 
          hasResult: true,
          success: result.success || false
        });
      } else {
        this.logger.warn("Translation completed but result is invalid", { 
          result: result,
          type: typeof result
        });
      }
      
      // Cleanup after translation
      setTimeout(() => {
        this.performPostTranslationCleanup();
      }, 1000);
      
    } catch (error) {
      this.logger.error("Error during translation:", error);
      this.performPostTranslationCleanup();
    }
  }
  
  performPostTranslationCleanup() {
    this.logger.debug("Performing post-translation cleanup");
    
    // Dismiss notification
    this.dismissNotification();
    
    // Clear highlights
    this.elementHighlighter.clearHighlight();
    
    // Deactivate if still active
    if (this.isActive) {
      this.deactivate().catch(error => {
        this.logger.warn('Error during post-translation cleanup:', error);
      });
    }
    
    // Reset processing state
    this.isProcessingClick = false;
    
    this.logger.debug("Post-translation cleanup completed");
  }
  
  // Notification Management
  showNotification() {
    // Dispatch notification request to pageEventBus
    pageEventBus.emit('show-select-element-notification', {
      managerId: this.instanceId,
      actions: {
        cancel: () => this.deactivate({ fromNotification: true }),
        revert: () => this.revertTranslations()
      }
    });
    
    this.logger.debug("Select Element notification requested");
  }
  
  updateNotificationForTranslation() {
    pageEventBus.emit('update-select-element-notification', {
      status: 'translating'
    });
    
    this.logger.debug("Select Element notification updated for translation");
  }
  
  dismissNotification() {
    pageEventBus.emit('dismiss-select-element-notification', {
      managerId: this.instanceId
    });
    
    this.logger.debug("Select Element notification dismissal requested");
  }
  
  // Keyboard and Cancel Listeners
  setupKeyboardListeners() {
    document.addEventListener('keydown', (event) => {
      if (event.key === KEY_CODES.ESCAPE && this.isActive) {
        this.logger.debug("ESC key pressed, deactivating SelectElement mode");
        this.deactivate();
      }
    });
  }
  
  setupCancelListener() {
    pageEventBus.on('cancel-select-element-mode', () => {
      if (this.isActive) {
        this.logger.debug('Cancel requested, deactivating SelectElement mode');
        this.deactivate({ fromNotification: true });
      }
    });
  }
  
  // Cross-frame Communication
  setupCrossFrameCommunication() {
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'DEACTIVATE_ALL_SELECT_MANAGERS') {
        if (event.data.source !== 'translate-it-main') {
          this.deactivate({ fromBackground: true });
        }
      }
    });
    
    if (window === window.top) {
      const originalDeactivate = this.deactivate.bind(this);
      this.deactivate = async (options = {}) => {
        await originalDeactivate(options);
        
        // Notify all iframes
        try {
          window.postMessage({
            type: 'DEACTIVATE_ALL_SELECT_MANAGERS', 
            source: 'translate-it-main'
          }, '*');
        } catch {
          // Cross-origin iframe, ignore
        }
      };
    }
  }
  
  // Background Communication
  async notifyBackgroundActivation() {
    try {
      await sendMessage({
        action: MessageActions.SET_SELECT_ELEMENT_STATE,
        data: { active: true }
      });
      this.logger.debug('Successfully notified background: select element activated');
    } catch (err) {
      this.logger.error('Failed to notify background about activation', err);
    }
  }
  
  async notifyBackgroundDeactivation() {
    try {
      await sendMessage({
        action: MessageActions.SET_SELECT_ELEMENT_STATE,
        data: { active: false }
      });
      this.logger.debug('Successfully notified background: select element deactivated');
    } catch (err) {
      this.logger.error('Failed to notify background about deactivation', err);
    }
  }
  
  // Utility Methods
  async revertTranslations() {
    this.logger.info("Starting translation revert process in SelectElementManager");
    return await this.stateManager.revertTranslations();
  }
  
  // Handle translation results from background script
  async handleTranslationResult(message) {
    this.logger.debug("SelectElementManager received translation result", {
      success: message.data?.success,
      hasTranslatedText: !!message.data?.translatedText,
      mode: message.data?.translationMode
    });
    
    try {
      // Forward to translation orchestrator for processing
      return await this.translationOrchestrator.handleTranslationResult(message);
    } catch (error) {
      this.logger.error("Error handling translation result in SelectElementManager:", error);
      throw error;
    }
  }
  
  forceCleanup() {
    try {
      this.removeEventListeners();
      this.elementHighlighter.clearHighlight();
      this.elementHighlighter.deactivateUI().catch(() => {});
      this.dismissNotification();
    } catch (cleanupError) {
      this.logger.error("Critical error during cleanup:", cleanupError);
    }
  }
  
  // Public API
  isSelectElementActive() {
    return this.isActive;
  }
  
  getStatus() {
    return {
      serviceActive: this.isActive,
      isProcessingClick: this.isProcessingClick,
      isInitialized: this.isInitialized,
      instanceId: this.instanceId,
      isInIframe: this.isInIframe
    };
  }
  
  async cleanup() {
    this.logger.info("Cleaning up SelectElement manager");
    
    try {
      // Deactivate if active
      if (this.isActive) {
        await this.deactivate();
      }
      
      // Clean up all tracked resources
      super.cleanup();
      
      this.logger.info("SelectElement manager cleanup completed successfully");
      
    } catch (error) {
      this.logger.error("Error during SelectElement manager cleanup:", error);
      throw error;
    }
  }
}

// Export lazy-initialized singleton getter
export const getSelectElementManager = () => SelectElementManager.getInstance();

// Export legacy-compatible sync getter (for non-async contexts)
export const selectElementManager = {
  async activate() {
    const instance = await SelectElementManager.getInstance();
    return instance.activate();
  },
  async deactivate(options) {
    const instance = await SelectElementManager.getInstance();
    return instance.deactivate(options);
  },
  async forceDeactivate() {
    const instance = await SelectElementManager.getInstance();
    return instance.forceDeactivate();
  },
  async cancelInProgressTranslation() {
    const instance = await SelectElementManager.getInstance();
    return instance.translationOrchestrator.cancelAllTranslations();
  },
  async revertTranslations() {
    const instance = await SelectElementManager.getInstance();
    return instance.revertTranslations();
  },
  getSelectElementManager() {
    return SelectElementManager.getInstance();
  },
  isSelectElementActive() {
    return SelectElementManager.instance?.isActive || false;
  },
  getStatus() {
    return SelectElementManager.instance?.getStatus() || {
      serviceActive: false,
      isProcessingClick: false,
      isInitialized: false,
      instanceId: 'pending',
      isInIframe: window !== window.top
    };
  }
};

// Export class
export { SelectElementManager };

// No auto-initialization - initialize only when needed