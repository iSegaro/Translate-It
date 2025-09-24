// SelectElementManager - Unified Manager for Select Element functionality
// Single responsibility: Manage Select Element mode lifecycle and interactions
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { pageEventBus } from '@/core/PageEventBus.js';
import { sendMessage } from "@/shared/messaging/core/UnifiedMessaging.js";
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import ExtensionContextManager from '@/core/extensionContext.js';

// Core services
import { ElementHighlighter } from "./managers/services/ElementHighlighter.js";
import { TextExtractionService } from "./managers/services/TextExtractionService.js";
import { TranslationOrchestrator } from "./managers/services/TranslationOrchestrator.js";
import { ModeManager } from "./managers/services/ModeManager.js";
import { StateManager } from "./managers/services/StateManager.js";
import { ErrorHandlingService } from "./managers/services/ErrorHandlingService.js";

// Constants
import { KEY_CODES } from "./managers/constants/selectElementConstants.js";

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
    
    // Track services for automatic cleanup with ResourceTracker
    this.trackResource('element-highlighter', () => {
      if (this.elementHighlighter) {
        this.elementHighlighter.cleanup?.();
        this.elementHighlighter = null;
      }
    }, { isCritical: true });

    this.trackResource('text-extraction-service', () => {
      if (this.textExtractionService) {
        this.textExtractionService.cleanup?.();
        this.textExtractionService = null;
      }
    }, { isCritical: true });

    this.trackResource('translation-orchestrator', () => {
      if (this.translationOrchestrator) {
        this.translationOrchestrator.cleanup?.();
        this.translationOrchestrator = null;
      }
    }, { isCritical: true });

    this.trackResource('mode-manager', () => {
      if (this.modeManager) {
        this.modeManager.cleanup?.();
        this.modeManager = null;
      }
    }, { isCritical: true });

    this.trackResource('error-handling-service', () => {
      if (this.errorHandlingService) {
        this.errorHandlingService.cleanup?.();
        this.errorHandlingService = null;
      }
    }, { isCritical: true });

    this.trackResource('state-manager', () => {
      if (this.stateManager) {
        this.stateManager.cleanup?.();
        this.stateManager = null;
      }
    }, { isCritical: true });
    
    // Event handlers
    this.handleMouseOver = this.handleMouseOver.bind(this);
    this.handleMouseOut = this.handleMouseOut.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.preventNavigationHandler = this.preventNavigationHandler.bind(this);
    
    // Notification management
    this.currentNotification = null;
    
    this.logger.init("New SelectElementManager instance created", {
      instanceId: this.instanceId,
      isInIframe: this.isInIframe,
      frameLocation: this.frameLocation,
    });
  }
  
  // Note: Using ResourceTracker pattern directly - managed by FeatureManager
  
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
    // This method is called by FeatureManager during initialization
    // It should only initialize resources, NOT activate Select Element mode
    if (this.isInitialized) {
      this.logger.debug("SelectElementManager already initialized");
      return true;
    }

    try {
      await this.initialize();
      this.logger.debug("SelectElementManager activated successfully (resources initialized)");
      return true;
    } catch (error) {
      this.logger.error("Error activating SelectElementManager:", error);
      return false;
    }
  }

  async activateSelectElementMode() {
    if (this.isActive) {
      this.logger.debug("SelectElement mode already active");
      return { isActive: this.isActive, instanceId: this.instanceId };
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
      // Ensure all services are available (fallback mechanism)
      const servicesAvailable = await this._ensureServicesAvailable();
      if (!servicesAvailable) {
        this.logger.error("Failed to ensure services availability - cannot activate");
        return { isActive: false, error: "Services initialization failed" };
      }

      // Setup UI behaviors (cursor and link disabling)
      this.elementHighlighter.addGlobalStyles();
      this.elementHighlighter.disablePageInteractions();
      
      this.logger.debug("Setting up notification...");
      // Show notification only in main frame to prevent duplicates in iframes
      if (window === window.top) {
        this.showNotification();
      } else {
        this.logger.debug("Skipping notification in iframe - will be handled by main frame");
      }
      
      this.logger.debug("Notifying background script...");
      // Notify background script
      await this.notifyBackgroundActivation();
      
      this.logger.info("Select element mode activated successfully");

      // Return status object
      return { isActive: this.isActive, instanceId: this.instanceId };

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

    const {
      fromBackground = false,
      fromNotification = false,
      fromCancel = false,
      preserveTranslations = false,
      skipTranslationCancel = false
    } = options;

    this.logger.debug("Deactivating SelectElementManager", {
      fromBackground,
      fromNotification,
      fromCancel,
      preserveTranslations,
      skipTranslationCancel,
      instanceId: this.instanceId
    });

    try {
      // Set active state immediately
      this.isActive = false;

      // Cancel any ongoing translations (unless we're preserving them)
      if (!skipTranslationCancel && !preserveTranslations) {
        await this.translationOrchestrator.cancelAllTranslations();
      }

      // Remove event listeners
      this.removeEventListeners();

      // Clear highlights
      this.elementHighlighter.clearHighlight();
      await this.elementHighlighter.deactivateUI();

      // Always dismiss notification when deactivating (not just from cancel/background)
      if (window === window.top) {
        this.dismissNotification();
      }

      // Only cleanup state if not preserving translations
      if (!preserveTranslations) {
        this.stateManager.clearState();
        this.logger.debug("State cleared during deactivation");
      } else {
        this.logger.debug("Preserving translations during deactivation");
      }

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

      // Dismiss notification immediately (only in main frame)
      if (window === window.top) {
        this.dismissNotification();
      }

      // Clear state (force deactivation should always clear state)
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

      // Add global click prevention for navigation
      document.addEventListener('click', this.preventNavigationHandler, { capture: true, passive: false });

      // Listen for deactivation requests from iframes (only in main frame)
      if (window === window.top) {
        this.iframeMessageHandler = (event) => {
          // Verify the message is from our extension
          if (event.data && event.data.type === 'translate-it-deactivate-select-element') {
            this.logger.debug('Received deactivation request from iframe:', event.data);

            // Deactivate this SelectElement instance
            this.deactivate({ fromIframe: true }).catch(error => {
              this.logger.error('Error deactivating from iframe request:', error);
            });
          }
        };

        window.addEventListener('message', this.iframeMessageHandler);
        this.logger.debug("Added iframe message listener in main frame");
      }

      this.logger.debug("Event listeners setup for SelectElementManager");
    }
  }
  
  removeEventListeners() {
    document.removeEventListener('mouseover', this.handleMouseOver, true);
    document.removeEventListener('mouseout', this.handleMouseOut, true);
    document.removeEventListener('click', this.handleClick, true);
    document.removeEventListener('click', this.preventNavigationHandler, { capture: true, passive: false });

    // Remove iframe message listener (only in main frame)
    if (window === window.top && this.iframeMessageHandler) {
      window.removeEventListener('message', this.iframeMessageHandler);
      this.iframeMessageHandler = null;
      this.logger.debug("Removed iframe message listener from main frame");
    }

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
      
      // Prevent navigation and any default behavior
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      
      // Get the highlighted element (which might be different from event.target)
      const elementToTranslate = this.elementHighlighter.currentHighlighted || event.target;

      // Extract text from the highlighted element
      const text = await this.textExtractionService.extractTextFromElement(elementToTranslate);

      this.logger.info("Text extraction result:", {
        text: text,
        textLength: text?.length || 0,
        elementType: elementToTranslate.tagName,
        hasText: !!(text && text.trim())
      });

      if (text && text.trim()) {
        this.logger.debug("Text extracted from highlighted element", {
          textLength: text.length,
          elementType: elementToTranslate.tagName,
          isTargetSameAsHighlighted: elementToTranslate === event.target
        });

        // Clear all highlights and UI immediately after click
        this.elementHighlighter.clearAllHighlights();
        this.elementHighlighter.deactivateUI();

        // Remove mouse event listeners temporarily to prevent re-highlighting
        this.removeEventListeners();

        // Start translation process with the highlighted element
        await this.startTranslation(text, elementToTranslate);
        
      } else {
        this.logger.debug("No text found in element", {
          element: elementToTranslate.tagName,
          isHighlighted: elementToTranslate === this.elementHighlighter.currentHighlighted,
          usedFallback: elementToTranslate === event.target
        });
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
  
  /**
   * Global navigation prevention handler - prevents navigation on all interactive elements
   * @param {Event} event - Click event
   */
  preventNavigationHandler(event) {
    if (!this.isActive || this.isProcessingClick) return;
    
    const target = event.target;
    
    // Check if the clicked element is an interactive element that could cause navigation
    const isInteractiveElement = this.isInteractiveElement(target);
    
    if (isInteractiveElement) {
      // Simple check for text content (sync)
      const hasTextContent = this.hasTextContent(target);
      
      if (hasTextContent) {
        // If element has text, let the main handleClick handle it
        this.logger.debug('Interactive element has text content, deferring to main handler');
        return;
      }
      
      this.logger.debug('Preventing navigation on interactive element without text content:', {
        tagName: target.tagName,
        className: target.className,
        href: target.href,
        role: target.getAttribute('role'),
        hasHref: !!target.href,
        hasOnclick: !!target.onclick,
        isLink: target.tagName === 'A' || target.getAttribute('role') === 'link'
      });
      
      // Prevent the default navigation behavior
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      
      return false;
    }
  }
  
  /**
   * Simple check for text content (sync)
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} Whether element has text content
   */
  hasTextContent(element) {
    if (!element) return false;
    
    // Check immediate text content
    const text = element.textContent || element.innerText || '';
    if (text.trim().length > 10) return true; // Minimum threshold
    
    // Check children text content
    const childrenText = Array.from(element.children)
      .map(child => child.textContent || child.innerText || '')
      .join(' ')
      .trim();
    
    return childrenText.length > 10;
  }
  
  /**
   * Check if element is interactive and could cause navigation
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} Whether element is interactive
   */
  isInteractiveElement(element) {
    if (!element || !element.tagName) return false;
    
    // Check tag name
    const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'];
    if (interactiveTags.includes(element.tagName)) return true;
    
    // Check attributes that indicate interactivity
    const hasHref = element.hasAttribute('href');
    const hasOnclick = element.hasAttribute('onclick');
    const hasRoleLink = element.getAttribute('role') === 'link';
    const hasRoleButton = element.getAttribute('role') === 'button';
    const isClickable = element.getAttribute('data-testid')?.toLowerCase().includes('click') || 
                        element.getAttribute('data-testid')?.toLowerCase().includes('button');
    
    // Check if element is within a clickable container (like tweet articles)
    const isInClickableContainer = this.isInClickableContainer(element);
    
    return hasHref || hasOnclick || hasRoleLink || hasRoleButton || isClickable || isInClickableContainer;
  }
  
  /**
   * Check if element is within a clickable container that might cause navigation
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} Whether element is in clickable container
   */
  isInClickableContainer(element) {
    if (!element) return false;
    
    // Check common clickable containers
    const clickableContainers = [
      'article',                  // General article elements
      '[role="article"]',        // Articles with role
      '[data-testid*="tweet"]',  // Tweet containers
      '[data-testid*="post"]',   // Post containers  
      '[data-testid*="card"]',   // Card containers
      '[data-testid*="cell"]',   // Cell containers
      '[role="link"]',           // Link containers
      '[aria-label*="tweet"]',   // Tweet by aria-label
      '[aria-label*="post"]'      // Post by aria-label
    ];
    
    return clickableContainers.some(selector => {
      try {
        return element.closest(selector);
      } catch {
        return false;
      }
    });
  }
  
  async startTranslation(text, targetElement) {
    try {
      this.logger.debug("Starting translation process");

      // Double check that we're still active and not already processing
      if (!this.isActive) {
        this.logger.debug("SelectElementManager no longer active, aborting translation");
        return;
      }

      // Check if translation is already in progress globally
      if (window.isTranslationInProgress) {
        this.logger.debug("Another translation is already in progress, aborting");
        return;
      }

      // We'll update notification after translation call to avoid race conditions with cache
      
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
        targetElement: targetElement,
        targetElementTag: targetElement.tagName,
        targetElementClass: targetElement.className,
        targetInnerHTML: targetElement.innerHTML.substring(0, 500),
        textNodesCount: textNodes.length,
        foundTexts: textNodes.map(node => node.textContent.trim()),
        originalTextsMap: Array.from(originalTextsMap.entries()),
        nodeToTextMap: Array.from(nodeToTextMap.entries())
      });

      // Check if all texts are cached before showing notification
      // For cache-only translations, don't show "Translating..." since they complete instantly
      const isAllCached = this.translationOrchestrator.checkIfAllCached(originalTextsMap);

      // Update notification to show translation in progress before starting
      // This gives immediate feedback to the user when they click on an element
      if (window === window.top && !isAllCached) {
        this.updateNotificationForTranslation();
      }

      // Perform translation via orchestrator with context
      const result = await this.translationOrchestrator.processSelectedElement(targetElement, originalTextsMap, textNodes, 'select-element');

      // Check if result is valid before accessing properties
      if (result && typeof result === 'object') {
        this.logger.debug("Translation completed", {
          hasResult: true,
          success: result.success || false,
          resultKeys: Object.keys(result),
          hasTranslatedText: !!result.translatedText,
          hasData: !!result.data,
          fullResult: result
        });

        // For non-streaming translations or cached translations, we need to apply the result here
        this.logger.debug("Checking translation result for application:", {
          success: result.success,
          hasTranslatedText: !!result.translatedText,
          streaming: result.streaming,
          fromCache: result.fromCache,
          hasOriginalTextsMap: !!result.originalTextsMap
        });

        // Apply translation if:
        // 1. Success and has translatedText (regular non-streaming)
        // 2. Success and streaming is false (direct translation)
        // 3. Success and from cache with translatedText (cached result)
        // Note: For streaming translations, the translation will be applied via streaming handlers
        // Note: If translation was already applied in TranslationOrchestrator, skip to avoid double application
        const shouldApply = result.success && result.translatedText && (
          !result.streaming ||                                               // Non-streaming
          result.fromCache ||                                                // Cached result
          result.originalTextsMap                                           // Has text map data
        );

        if (shouldApply) {
          try {
            const translatedData = JSON.parse(result.translatedText);
            const translationMap = new Map();

            // Use originalTextsMap from result if available (for non-streaming)
            const workingOriginalTextsMap = result.originalTextsMap || originalTextsMap;

            this.logger.debug("Processing non-streaming translation result:", {
              translatedData: translatedData,
              originalTextsMap: workingOriginalTextsMap,
              textNodes: textNodes.map(node => node.textContent),
              fromCache: result.fromCache
            });

            // Create translation map from result
            if (Array.isArray(translatedData)) {
              // workingOriginalTextsMap is an array of [originalText, nodes] arrays
              workingOriginalTextsMap.forEach(([originalText, nodes], index) => {
                if (originalText && translatedData[index] && translatedData[index].text) {
                  translationMap.set(originalText, translatedData[index].text);
                  this.logger.debug("Added translation to map:", {
                    original: originalText,
                    translated: translatedData[index].text,
                    index: index
                  });
                }
              });
            } else if (result.fromCache) {
              // For cached translations, the structure is an array of {text: "..."} objects
              workingOriginalTextsMap.forEach(([originalText, nodes], index) => {
                if (originalText && translatedData[index] && translatedData[index].text) {
                  translationMap.set(originalText, translatedData[index].text);
                  this.logger.debug("Added cached translation to map:", {
                    original: originalText,
                    translated: translatedData[index].text,
                    index: index
                  });
                }
              });
            }

            this.logger.debug("Translation map created:", {
              size: translationMap.size,
              entries: Array.from(translationMap.entries())
            });

            // Apply translations to DOM
            if (translationMap.size > 0) {
              this.logger.debug("Applying translations to DOM nodes...");
              this.translationOrchestrator.applyTranslationsToNodes(textNodes, translationMap);
              this.stateManager.addTranslatedElement(targetElement, translationMap);
              this.logger.debug("Translation applied successfully from non-streaming result");
            } else {
              this.logger.warn("No translations to apply - translation map is empty");
            }
          } catch (error) {
            this.logger.error("Error applying non-streaming translation result:", error);
          }
        } else if (result.success && result.streaming && !result.translatedText) {
          // This is a streaming translation that will be handled by streaming handlers
          this.logger.debug("Streaming translation initiated, will be handled by streaming system:", {
            messageId: result.messageId,
            streaming: true,
            success: true
          });
        } else {
          this.logger.debug("Skipping translation application:", {
            hasResult: !!result,
            success: result?.success,
            hasTranslatedText: !!result?.translatedText,
            streaming: result?.streaming,
            fromCache: result?.fromCache,
            shouldApply: false,
            reason: !result.success ? 'not_successful' :
                   !result.translatedText ? 'no_translated_text' :
                   result.streaming && !result.fromCache ? 'streaming_without_cache' : 'unknown'
          });
        }
      } else {
        this.logger.warn("Translation completed but result is invalid", {
          result: result,
          type: typeof result
        });
      }

      // Cleanup after translation - immediately
      this.performPostTranslationCleanup();

      // Reset cache completed flag for next translation
      if (this.translationOrchestrator) {
        this.translationOrchestrator.cacheCompleted = false;
      }
      
    } catch (error) {
      // Use ExtensionContextManager to detect context errors
      const isContextError = ExtensionContextManager.isContextError(error);

      if (isContextError) {
        // Get current messageId for user cancellation check
        const currentMessageId = this.translationOrchestrator.getCurrentMessageId();

        this.logger.debug("Translation failed: extension context invalidated (expected behavior)", {
          context: 'element-translation',
          messageId: currentMessageId
        });

        // Handle context errors via ExtensionContextManager (will detect user cancellation)
        ExtensionContextManager.handleContextError(error, 'element-translation', {
          operationId: currentMessageId
        });
      } else {
        this.logger.error("Error during translation:", error);
      }
      this.performPostTranslationCleanup();

      // Reset cache completed flag for next translation
      if (this.translationOrchestrator) {
        this.translationOrchestrator.cacheCompleted = false;
      }
    }
  }
  
  performPostTranslationCleanup() {
    this.logger.debug("Performing post-translation cleanup");

    // Always dismiss notification first (only in main frame)
    if (window === window.top) {
      this.dismissNotification();
    }

    // Clear highlights
    this.elementHighlighter.clearHighlight();

    // If this is an iframe, notify main frame to deactivate all SelectElement instances
    if (window !== window.top) {
      this.logger.debug("Notifying main frame to deactivate SelectElement mode");
      try {
        // Send message to main frame to deactivate all instances
        window.top.postMessage({
          type: 'translate-it-deactivate-select-element',
          source: 'iframe-translation-complete',
          instanceId: this.instanceId
        }, '*');
      } catch (error) {
        this.logger.warn('Failed to notify main frame:', error);
        // Fallback: deactivate this iframe instance
        if (this.isActive) {
          this.deactivate({ preserveTranslations: true }).catch(error => {
            this.logger.warn('Error during iframe deactivation:', error);
          });
        }
      }
    } else {
      // This is main frame, deactivate directly but preserve translations
      if (this.isActive) {
        this.logger.debug("Deactivating main frame SelectElementManager after translation");
        this.deactivate({ preserveTranslations: true, skipTranslationCancel: true }).catch(error => {
          this.logger.warn('Error during post-translation cleanup:', error);
        });
      }
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
    this.logger.debug("dismissNotification called with instanceId:", this.instanceId);
    pageEventBus.emit('dismiss-select-element-notification', {
      managerId: this.instanceId,
      isCancelAction: true
    });

    this.logger.debug("Select Element notification dismissal requested");
  }
  
  // Keyboard and Cancel Listeners
  setupKeyboardListeners() {
    document.addEventListener('keydown', (event) => {
      if (event.key === KEY_CODES.ESCAPE && this.isActive) {
        this.logger.debug("ESC key pressed, deactivating SelectElement mode");

        // Set a flag to prevent other ESC handlers from running
        window.selectElementHandlingESC = true;
        setTimeout(() => { window.selectElementHandlingESC = false; }, 100);

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        this.deactivate({ fromCancel: true });
      }
    });
  }
  
  setupCancelListener() {
    pageEventBus.on('cancel-select-element-mode', (data) => {
      this.logger.debug('cancel-select-element-mode event received', { data, isActive: this.isActive, instanceId: this.instanceId });
      if (this.isActive) {
        this.logger.debug('Cancel requested, deactivating SelectElement mode');
        this.deactivate({ fromCancel: true });
      } else {
        this.logger.debug('Cancel event received but SelectElement is not active');
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
      // Add a flag to prevent multiple concurrent notifications
      if (this._isNotifyingBackground) {
        this.logger.debug('Background notification already in progress, skipping duplicate');
        return;
      }

      this._isNotifyingBackground = true;

      await sendMessage({
        action: MessageActions.SET_SELECT_ELEMENT_STATE,
        data: { active: true }
      });
      this.logger.debug('Successfully notified background: select element activated');
    } catch (err) {
      this.logger.error('Failed to notify background about activation', err);
      // Don't throw - this is a non-critical operation
    } finally {
      this._isNotifyingBackground = false;
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

  /**
   * Ensure all required services are available - recreate if cleaned up by garbage collector
   * This is a fallback mechanism when FeatureManager health checks don't catch the issue
   * @returns {Promise<boolean>} Whether all services are available
   */
  async _ensureServicesAvailable() {
    try {
      let servicesRecreated = false;

      if (!this.elementHighlighter) {
        this.logger.debug("ElementHighlighter was cleaned up, recreating as fallback...");
        this.elementHighlighter = new ElementHighlighter();
        await this.elementHighlighter.initialize();
        servicesRecreated = true;
      }

      if (!this.textExtractionService) {
        this.logger.debug("TextExtractionService was cleaned up, recreating as fallback...");
        this.textExtractionService = new TextExtractionService();
        await this.textExtractionService.initialize();
        servicesRecreated = true;
      }

      if (!this.stateManager) {
        this.logger.debug("StateManager was cleaned up, recreating as fallback...");
        this.stateManager = new StateManager();
        await this.stateManager.initialize();
        servicesRecreated = true;
      }

      if (!this.translationOrchestrator) {
        this.logger.debug("TranslationOrchestrator was cleaned up, recreating as fallback...");
        this.translationOrchestrator = new TranslationOrchestrator(this.stateManager);
        await this.translationOrchestrator.initialize();
        servicesRecreated = true;
      }

      if (!this.modeManager) {
        this.logger.debug("ModeManager was cleaned up, recreating as fallback...");
        this.modeManager = new ModeManager();
        await this.modeManager.initialize();
        servicesRecreated = true;
      }

      if (!this.errorHandlingService) {
        this.logger.debug("ErrorHandlingService was cleaned up, recreating as fallback...");
        this.errorHandlingService = new ErrorHandlingService();
        await this.errorHandlingService.initialize();
        servicesRecreated = true;
      }

      if (servicesRecreated) {
        this.logger.info("SelectElement services recreated successfully as fallback");
      }

      return true;
    } catch (error) {
      this.logger.error('Failed to ensure services availability:', error);
      return false;
    }
  }

  // Utility Methods
  async revertTranslations() {
    this.logger.info("Starting translation revert process in SelectElementManager");

    if (!this.stateManager) {
      this.logger.warn("StateManager is not available for revert");
      return 0;
    }

    // Clear the global translation in progress flag since revert completes the translation process
    window.isTranslationInProgress = false;

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
      // Dismiss notification (only in main frame)
      if (window === window.top) {
        this.dismissNotification();
      }
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

      // ResourceTracker will handle all service cleanup automatically
      this.cleanup();

      this.logger.info("SelectElement manager cleanup completed successfully");

    } catch (error) {
      this.logger.error("Error during SelectElement manager cleanup:", error);
      throw error;
    }
  }
}

// Export class for direct instantiation by FeatureManager
export { SelectElementManager };