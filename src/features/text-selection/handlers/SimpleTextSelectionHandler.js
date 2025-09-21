import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { SelectionManager } from '../core/SelectionManager.js';
import ElementDetectionService from '@/shared/services/ElementDetectionService.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'SimpleTextSelectionHandler');

/**
 * Simplified Text Selection Handler
 *
 * Handles page text selection using only selectionchange events.
 * Much simpler than the old complex drag detection system.
 *
 * Features:
 * - Single selectionchange event listener
 * - Debounced processing for performance
 * - Ctrl key requirement support
 * - Clean integration with WindowsManager
 */
export class SimpleTextSelectionHandler extends ResourceTracker {
  constructor(options = {}) {
    super('simple-text-selection-handler');

    this.isActive = false;
    this.selectionManager = null;
    this.featureManager = options.featureManager;

    // Simple debouncing for performance
    this.selectionTimeout = null;
    this.debounceDelay = 100; // 100ms debounce

    // Track Ctrl key state
    this.ctrlKeyPressed = false;

    // Simple drag detection to prevent selection during drag
    this.isDragging = false;
    this.mouseDownTime = 0;
    this.lastMouseUpEvent = null;

    // Element detection service
    this.elementDetection = ElementDetectionService;

    // Bind methods
    this.handleSelectionChange = this.handleSelectionChange.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
  }

  async activate() {
    if (this.isActive) {
      logger.debug('SimpleTextSelectionHandler already active');
      return true;
    }

    try {
      logger.debug('Activating SimpleTextSelectionHandler');

      // Create selection manager
      this.selectionManager = new SelectionManager({
        featureManager: this.featureManager
      });

      // Setup event listeners
      this.setupEventListeners();

      // Note: SelectionManager is already a ResourceTracker and handles its own cleanup
      // We just need to null our reference when we're deactivated
      // No need to track it since it manages itself

      this.isActive = true;
      logger.info('SimpleTextSelectionHandler activated successfully');
      return true;

    } catch (error) {
      const handler = ErrorHandler.getInstance();
      handler.handle(error, {
        type: ErrorTypes.SERVICE,
        context: 'SimpleTextSelectionHandler-activate',
        showToast: false
      });
      return false;
    }
  }

  async deactivate() {
    if (!this.isActive) {
      logger.debug('SimpleTextSelectionHandler not active');
      return true;
    }

    try {
      logger.debug('Deactivating SimpleTextSelectionHandler');

      // Clear any pending timeouts
      if (this.selectionTimeout) {
        clearTimeout(this.selectionTimeout);
        this.selectionTimeout = null;
      }

      // Clean up our reference (SelectionManager cleans itself up)
      this.selectionManager = null;

      // ResourceTracker will handle cleanup
      this.cleanup();

      this.isActive = false;
      logger.info('SimpleTextSelectionHandler deactivated successfully');
      return true;

    } catch (error) {
      logger.error('Error deactivating SimpleTextSelectionHandler:', error);
      try {
        this.selectionManager = null;
        this.cleanup();
        this.isActive = false;
        return true;
      } catch (cleanupError) {
        logger.error('Critical: SimpleTextSelectionHandler cleanup failed:', cleanupError);
        return false;
      }
    }
  }

  setupEventListeners() {
    try {
      // Main selection change listener
      this.addEventListener(document, 'selectionchange', this.handleSelectionChange, {
        critical: true
      });

      // Simple drag detection
      this.addEventListener(document, 'mousedown', this.handleMouseDown, {
        critical: true
      });
      this.addEventListener(document, 'mouseup', this.handleMouseUp, {
        critical: true
      });

      // Ctrl key tracking for requirement checking
      this.addEventListener(document, 'keydown', this.handleKeyDown);
      this.addEventListener(document, 'keyup', this.handleKeyUp);

      logger.debug('Simple text selection listeners setup complete');

    } catch (error) {
      logger.error('Failed to setup text selection listeners:', error);
    }
  }

  /**
   * Handle selection change events - the heart of our simplified system
   */
  handleSelectionChange() {
    if (!this.isActive || !this.selectionManager) return;

    // Clear existing timeout
    if (this.selectionTimeout) {
      clearTimeout(this.selectionTimeout);
    }

    // Debounce to avoid excessive processing
    this.selectionTimeout = setTimeout(() => {
      this.processSelection();
    }, this.debounceDelay);
  }

  /**
   * Process the current text selection
   */
  async processSelection() {
    try {
      const selection = window.getSelection();
      const selectedText = selection ? selection.toString().trim() : '';

      logger.debug('Processing selection', {
        hasText: !!selectedText,
        textLength: selectedText.length,
        ctrlPressed: this.ctrlKeyPressed,
        isDragging: this.isDragging
      });

      if (!selectedText) {
        // No text selected, check if user clicked inside translation window
        if (this.isClickInsideTranslationWindow()) {
          logger.debug('Click inside translation window, not dismissing');
          return;
        }

        // Skip if currently dragging (prevents dismissal during drag operations)
        if (this.isDragging) {
          logger.debug('Currently dragging with no text selected, skipping dismissal');
          return;
        }

        // No text selected and click outside translation window, dismiss
        if (this.selectionManager) {
          this.selectionManager.dismissWindow();
        }
        return;
      }

      // Skip if currently dragging (prevents selection during drag)
      if (this.isDragging) {
        logger.debug('Currently dragging, skipping selection processing');
        return;
      }

      // Skip if select element mode is active
      if (this.isSelectElementModeActive()) {
        logger.debug('Select element mode active, skipping text selection');
        return;
      }

      // Skip if selection is in a text field (handled by TextFieldDoubleClickHandler)
      if (this.isSelectionInTextField()) {
        logger.debug('Selection in text field, skipping (handled by TextFieldDoubleClickHandler)');
        return;
      }

      // Check Ctrl key requirement
      if (!(await this.shouldProcessSelection())) {
        logger.debug('Ctrl requirement not met, skipping selection');
        return;
      }

      // Process the selection
      if (this.selectionManager) {
        await this.selectionManager.processSelection(selectedText, selection);
      } else {
        logger.warn('SelectionManager is null - this should not happen with critical protection');
      }

    } catch (error) {
      logger.error('Error processing selection:', error);
      const handler = ErrorHandler.getInstance();
      await handler.handle(error, {
        type: ErrorTypes.UI,
        context: 'simple-text-selection-process',
        showToast: false
      });
    }
  }

  /**
   * Check if we should process this selection based on settings
   */
  async shouldProcessSelection() {
    try {
      // Import settings dynamically to avoid circular dependencies
      const { getRequireCtrlForTextSelectionAsync, getSettingsAsync, CONFIG } =
        await import('@/shared/config/config.js');

      const settings = await getSettingsAsync();
      const selectionTranslationMode = settings.selectionTranslationMode || CONFIG.selectionTranslationMode;

      // Only check Ctrl requirement in immediate mode
      if (selectionTranslationMode === "immediate") {
        const requireCtrl = await getRequireCtrlForTextSelectionAsync();
        if (requireCtrl && !this.ctrlKeyPressed) {
          return false;
        }
      }

      return true;

    } catch (error) {
      logger.warn('Error checking selection requirements:', error);
      return true; // Default to allowing selection
    }
  }

  /**
   * Check if select element mode is active
   */
  isSelectElementModeActive() {
    try {
      return window.translateItNewSelectManager ||
             (window.selectElementManagerInstance && window.selectElementManagerInstance.isActive);
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if current selection is in a text field
   */
  isSelectionInTextField() {
    try {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        return false;
      }

      // Get the active element (focused element)
      const activeElement = document.activeElement;
      if (this.isTextField(activeElement)) {
        logger.debug('Selection detected in active text field', {
          tagName: activeElement.tagName,
          type: activeElement.type
        });
        return true;
      }

      // Check if selection range is within a text field
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;

      // Walk up the DOM to find if we're inside a text field
      let element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;

      while (element && element !== document.body) {
        if (this.isTextField(element)) {
          logger.debug('Selection detected within text field element', {
            tagName: element.tagName,
            type: element.type
          });
          return true;
        }
        element = element.parentElement;
      }

      return false;

    } catch (error) {
      logger.debug('Error checking if selection is in text field:', error);
      return false;
    }
  }

  /**
   * Check if element is a text field
   */
  isTextField(element) {
    if (!element) return false;

    // Standard input fields
    if (element.tagName === 'INPUT') {
      const type = (element.type || '').toLowerCase();
      const textTypes = ['text', 'email', 'password', 'search', 'url', 'tel'];
      return textTypes.includes(type);
    }

    // Textarea
    if (element.tagName === 'TEXTAREA') {
      return true;
    }

    // Contenteditable elements
    if (element.contentEditable === 'true') {
      return true;
    }

    return false;
  }

  /**
   * Handle key down events for Ctrl tracking
   */
  handleKeyDown(event) {
    if (event.ctrlKey || event.metaKey) {
      this.ctrlKeyPressed = true;
    }
  }

  /**
   * Handle key up events for Ctrl tracking
   */
  handleKeyUp(event) {
    if (!event.ctrlKey && !event.metaKey) {
      this.ctrlKeyPressed = false;
    }
  }

  /**
   * Handle mouse down - start drag detection
   */
  handleMouseDown(event) {
    this.isDragging = true;
    this.mouseDownTime = Date.now();

    logger.debug('Mouse down - drag detection started');
  }

  /**
   * Handle mouse up - end drag detection and process selection if needed
   */
  handleMouseUp(event) {
    const dragDuration = Date.now() - this.mouseDownTime;

    logger.debug('Mouse up - drag detection ended', {
      dragDuration,
      wasDragging: this.isDragging
    });

    this.isDragging = false;
    this.lastMouseUpEvent = event; // Store for translation window detection

    // If there's a selection after mouse up, process it with a small delay
    setTimeout(() => {
      const selection = window.getSelection();
      if (selection && selection.toString().trim()) {
        logger.debug('Processing selection after mouse up');
        this.processSelection();
      }
    }, 50); // Small delay to ensure selection is finalized
  }

  /**
   * Check if the last click was inside a translation window
   */
  isClickInsideTranslationWindow() {
    if (!this.lastMouseUpEvent) return false;

    // Use ElementDetectionService to check if click is on UI element
    try {
      const uiElement = this.elementDetection.getClickedUIElement(this.lastMouseUpEvent);
      if (uiElement) {
        logger.debug('Click detected inside UI element', {
          elementType: uiElement.type,
          elementTag: uiElement.element?.tagName
        });
        return true;
      }

      // Fallback: check for common translation window selectors
      const target = this.lastMouseUpEvent.target;
      const translationWindow = target.closest('#translate-it-root') ||
                              target.closest('[class*="translation"]') ||
                              target.closest('[class*="window"]') ||
                              target.closest('lt-div');

      if (translationWindow) {
        logger.debug('Click detected inside translation window (fallback)', {
          elementTag: target.tagName,
          windowClass: translationWindow.className || 'no-class'
        });
        return true;
      }

    } catch (error) {
      logger.debug('Error checking click inside translation window:', error);
    }

    return false;
  }

  /**
   * Get WindowsManager instance from FeatureManager
   */
  getWindowsManager() {
    if (!this.featureManager) return null;

    const windowsHandler = this.featureManager.getFeatureHandler('windowsManager');
    if (!windowsHandler || !windowsHandler.getIsActive()) return null;

    return windowsHandler.getWindowsManager();
  }

  // Public API methods
  getSelectionManager() {
    return this.selectionManager;
  }

  hasActiveSelection() {
    const selection = window.getSelection();
    return selection && selection.toString().trim().length > 0;
  }

  getCurrentSelection() {
    if (!this.isActive) return null;
    const selection = window.getSelection();
    return selection?.toString().trim() || null;
  }

  getStatus() {
    return {
      handlerActive: this.isActive,
      hasSelection: this.hasActiveSelection(),
      managerAvailable: !!this.selectionManager,
      ctrlPressed: this.ctrlKeyPressed,
      isDragging: this.isDragging,
      mouseDownTime: this.mouseDownTime,
      currentSelection: this.getCurrentSelection()?.substring(0, 100)
    };
  }
}

export default SimpleTextSelectionHandler;