import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { SelectionManager } from '../core/SelectionManager.js';
import ElementDetectionService from '@/shared/services/ElementDetectionService.js';
import { settingsManager } from '@/shared/managers/SettingsManager.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'SimpleTextSelectionHandler');

// Singleton instance for SimpleTextSelectionHandler
let simpleTextSelectionHandlerInstance = null;

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

    // Enforce singleton pattern
    if (simpleTextSelectionHandlerInstance) {
      logger.debug('SimpleTextSelectionHandler singleton already exists, returning existing instance');
      return simpleTextSelectionHandlerInstance;
    }

    this.isActive = false;
    this.selectionManager = null;
    this.featureManager = options.featureManager;

    // Simple debouncing for performance
    this.selectionTimeout = null;
    this.debounceDelay = 100; // 100ms debounce

    // Track Ctrl key state
    this.ctrlKeyPressed = false;
    this.lastKeyEventTime = 0;
    this.lastMouseEventTime = 0;

    // Simple drag detection to prevent selection during drag
    this.isDragging = false;
    this.mouseDownTime = 0;
    this.lastMouseUpEvent = null;

    // Element detection service
    this.elementDetection = ElementDetectionService;

    // Settings change listeners
    this._settingsListeners = [];

    // Bind methods
    this.handleSelectionChange = this.handleSelectionChange.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);

    // Store singleton instance
    simpleTextSelectionHandlerInstance = this;
    logger.debug('SimpleTextSelectionHandler singleton created');
  }

  // Static method to get singleton instance
  static getInstance(options = {}) {
    if (!simpleTextSelectionHandlerInstance) {
      simpleTextSelectionHandlerInstance = new SimpleTextSelectionHandler(options);
    } else if (options.featureManager && !simpleTextSelectionHandlerInstance.featureManager) {
      // Update featureManager if it wasn't set initially
      simpleTextSelectionHandlerInstance.featureManager = options.featureManager;
      logger.debug('Updated SimpleTextSelectionHandler with FeatureManager');
    }
    return simpleTextSelectionHandlerInstance;
  }

  // Method to reset singleton (for testing or cleanup)
  static resetInstance() {
    if (simpleTextSelectionHandlerInstance) {
      simpleTextSelectionHandlerInstance.cleanup();
      simpleTextSelectionHandlerInstance = null;
    }
  }

  async activate() {
    if (this.isActive) {
      logger.debug('SimpleTextSelectionHandler already active');
      return true;
    }

    try {
      logger.debug('Activating SimpleTextSelectionHandler');

      // If selectionManager already exists, clean it up first
      if (this.selectionManager) {
        this.selectionManager = null;
      }

      // Create selection manager
      this.selectionManager = new SelectionManager({
        featureManager: this.featureManager
      });

      // Setup event listeners
      this.setupEventListeners();

      // Setup settings listeners
      this.setupSettingsListeners();

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

      // Clean up settings listeners
      this._settingsListeners.forEach(unsubscribe => {
        if (unsubscribe) unsubscribe();
      });
      this._settingsListeners = [];

      // Dismiss any active selection window
      if (this.selectionManager) {
        this.selectionManager.dismissWindow();
      }

      // Clean up our reference (SelectionManager cleans itself up)
      this.selectionManager = null;

      // Manually clean up event listeners to be sure
      this.cleanup();

      this.isActive = false;
      logger.info('SimpleTextSelectionHandler deactivated successfully');
      return true;

    } catch (error) {
      logger.error('Error deactivating SimpleTextSelectionHandler:', error);
      try {
        this.selectionManager = null;
        this._settingsListeners = [];
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

      // Simple drag detection - use window to prevent duplicate events
      this.addEventListener(window, 'mousedown', this.handleMouseDown, {
        critical: true
      });
      this.addEventListener(window, 'mouseup', this.handleMouseUp, {
        critical: true
      });

      // Ctrl key tracking for requirement checking
      this.addEventListener(window, 'keydown', this.handleKeyDown);
      this.addEventListener(window, 'keyup', this.handleKeyUp);

      logger.debug('Simple text selection listeners setup complete');

    } catch (error) {
      logger.error('Failed to setup text selection listeners:', error);
    }
  }

  /**
   * Setup settings change listeners for reactive updates
   */
  setupSettingsListeners() {
    try {
      // Note: EXTENSION_ENABLED listener is handled by FeatureManager
      // We don't need to duplicate it here as FeatureManager will handle activation/deactivation

      // TRANSLATE_ON_TEXT_SELECTION changes
      this._settingsListeners.push(
        settingsManager.onChange('TRANSLATE_ON_TEXT_SELECTION', (newValue) => {
          logger.debug('TRANSLATE_ON_TEXT_SELECTION changed:', newValue);
          if (!newValue && this.selectionManager) {
            this.selectionManager.dismissWindow();
          }
        }, 'simple-text-selection')
      );

      // REQUIRE_CTRL_FOR_TEXT_SELECTION changes
      this._settingsListeners.push(
        settingsManager.onChange('REQUIRE_CTRL_FOR_TEXT_SELECTION', (newValue) => {
          logger.debug('REQUIRE_CTRL_FOR_TEXT_SELECTION changed:', newValue);
        }, 'simple-text-selection')
      );

      // selectionTranslationMode changes
      this._settingsListeners.push(
        settingsManager.onChange('selectionTranslationMode', (newValue) => {
          logger.debug('selectionTranslationMode changed:', newValue);
          if (newValue === 'onClick' && this.selectionManager) {
            this.selectionManager.dismissWindow();
          }
        }, 'simple-text-selection')
      );

      logger.debug('Settings listeners setup complete');

    } catch (error) {
      logger.error('Failed to setup settings listeners:', error);
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
      // Get current Ctrl key state from the SelectionEvent or use last known state
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
      // Check if extension and text selection feature are enabled
      const isExtensionEnabled = settingsManager.get('EXTENSION_ENABLED', false);
      const isTextSelectionEnabled = settingsManager.get('TRANSLATE_ON_TEXT_SELECTION', false);

      if (!isExtensionEnabled || !isTextSelectionEnabled) {
        return false;
      }

      const selectionTranslationMode = settingsManager.get('selectionTranslationMode', 'onClick');
      logger.debug('Selection translation mode:', selectionTranslationMode);

      // Only check Ctrl requirement in immediate mode
      if (selectionTranslationMode === "immediate") {
        const requireCtrl = settingsManager.get('REQUIRE_CTRL_FOR_TEXT_SELECTION', false);
        const isCtrlPressed = this.isCtrlRecentlyPressed();
        logger.debug('Ctrl requirement check:', { requireCtrl, ctrlPressed: isCtrlPressed });
        if (requireCtrl && !isCtrlPressed) {
          logger.debug('Ctrl key required but not pressed, skipping selection');
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
    } catch {
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
   * Update Ctrl key state by checking actual keyboard state
   */
  updateCtrlKeyState() {
    // Use Keyboard API if available (most reliable)
    if (typeof navigator.keyboard !== 'undefined') {
      try {
        const hasCtrl = navigator.keyboard.getModifierState('Control');
        const hasMeta = navigator.keyboard.getModifierState('Meta');
        this.ctrlKeyPressed = hasCtrl || hasMeta;
        logger.debug('Ctrl key state from Keyboard API:', this.ctrlKeyPressed);
        return;
      } catch {
        logger.debug('Keyboard API failed, using fallback');
      }
    }

    // Simple and reliable fallback
    // The issue is that we can't reliably get modifier state without Keyboard API
    // So we'll use a simple time-based reset to prevent the "stuck Ctrl" issue
    if (Date.now() - this.lastKeyEventTime > 300) {
      // If no key event for 300ms, check if we should reset Ctrl state
      // Only reset if it was previously true (to avoid false negatives)
      if (this.ctrlKeyPressed) {
        // We can't be sure, so let's assume Ctrl is not pressed
        // This is better than having it stuck on true
        this.ctrlKeyPressed = false;
        logger.debug('Ctrl key state reset after timeout');
      }
    }
  }

  /**
   * Check if a key event was recent (within last 100ms)
   */
  isKeyEventRecent() {
    return Date.now() - this.lastKeyEventTime < 100;
  }

  /**
   * Check if Ctrl key was pressed recently (within last 200ms)
   * This is more reliable than trying to get the current keyboard state
   */
  isCtrlRecentlyPressed() {
    const now = Date.now();

    // If we have a recent keydown event, use the stored state
    if (now - this.lastKeyEventTime < 200) {
      return this.ctrlKeyPressed;
    }

    // If we have a recent mouse event, try to get the modifier state from the event
    if (now - this.lastMouseEventTime < 100) {
      // Check if the last mouse event had Ctrl pressed
      // This helps when Ctrl is held during mouse operations
      try {
        // We can't get the actual modifier state from past events
        // So we'll use a heuristic: if Ctrl was recently pressed and we're in a mouse operation,
        // assume it's still pressed
        return this.ctrlKeyPressed && (now - this.lastKeyEventTime < 1000);
      } catch {
        // Fall back to simple check
        return this.ctrlKeyPressed;
      }
    }

    // If no recent events, check if we should maintain the Ctrl state
    // Only maintain if it was set within the last second
    if (this.ctrlKeyPressed && (now - this.lastKeyEventTime < 1000)) {
      return true;
    }

    // Otherwise, assume Ctrl is not pressed
    return false;
  }

  /**
   * Handle key down events for Ctrl tracking
   */
  handleKeyDown(event) {
    this.lastKeyEventTime = Date.now();
    if (event.ctrlKey || event.metaKey) {
      this.ctrlKeyPressed = true;
      logger.debug('Ctrl key pressed down');
    }
  }

  /**
   * Handle key up events for Ctrl tracking
   */
  handleKeyUp(event) {
    this.lastKeyEventTime = Date.now();
    if (!event.ctrlKey && !event.metaKey) {
      this.ctrlKeyPressed = false;
      logger.debug('Ctrl key released');
    }
  }

  /**
   * Handle mouse down - start drag detection
   */
  handleMouseDown() {

    this.lastMouseEventTime = Date.now();
    this.isDragging = true;
    this.mouseDownTime = Date.now();

    logger.debug('Mouse down - drag detection started');
  }

  /**
   * Handle mouse up - end drag detection and process selection if needed
   */
  handleMouseUp() {

    this.lastMouseEventTime = Date.now();
    const dragDuration = Date.now() - this.mouseDownTime;

    logger.debug('Mouse up - drag detection ended', {
      dragDuration,
      wasDragging: this.isDragging,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey
    });

    this.isDragging = false;
    this.lastMouseUpEvent = event; // Store for translation window detection

    // Update Ctrl state from mouse event if available
    if (event.ctrlKey || event.metaKey) {
      this.ctrlKeyPressed = true;
      this.lastKeyEventTime = Date.now(); // Update to extend the "recent" window
    }

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

      // Fallback: ElementDetectionService should catch all translation elements
      // This is now redundant since we already use elementDetection.getClickedUIElement() above
      // Keeping this log for debugging but the detection is already handled

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

  destroy() {
    this.cleanup();
    // Reset singleton instance
    if (simpleTextSelectionHandlerInstance === this) {
      simpleTextSelectionHandlerInstance = null;
    }
  }
}

export default SimpleTextSelectionHandler;