import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { SelectionManager } from '../core/SelectionManager.js';
import ElementDetectionService from '@/shared/services/ElementDetectionService.js';
import { settingsManager } from '@/shared/managers/SettingsManager.js';
import { INPUT_TYPES } from '@/shared/config/constants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TEXT_SELECTION, 'SimpleTextSelectionHandler');

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

    // Timing for triple-click detection
    this.tripleClickDelay = 300; // Wait time to detect triple-click

    // Settings
    this.enhancedTripleClickDrag = false; // Will be loaded from settings

    // Track Ctrl key state
    this.ctrlKeyPressed = false;
    this.lastKeyEventTime = 0;
    this.lastMouseEventTime = 0;

    // Track Shift key state for Shift+Click operations
    this.shiftKeyPressed = false;
    this.isInShiftClickOperation = false;

    // Simple drag detection to prevent selection during drag
    this.isDragging = false;
    this.mouseDownTime = 0;
    this.lastMouseUpEvent = null;

    // Simplified triple-click + drag support
    this.lastTripleClickTime = 0;
    this.isWaitingForDragEnd = false;
    this.dragStartTime = 0;

    // Smart selection preservation system
    this._preservationState = {
      active: false,
      reason: null,
      timestamp: 0,
      timeout: null,
      duration: 1000
    };

    // Simple typing detection for text field preservation
    this.typingDetection = {
      isActive: false,
      startTime: 0,
      timeout: null
    };

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
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleInput = this.handleInput.bind(this);

    // Store singleton instance
    simpleTextSelectionHandlerInstance = this;

    // Make instance globally available for WindowsManager
    window.simpleTextSelectionHandlerInstance = this;

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

      // Load enhanced triple-click drag setting
      this.enhancedTripleClickDrag = settingsManager.get('ENHANCED_TRIPLE_CLICK_DRAG', false);

      // Setup settings listeners
      this.setupSettingsListeners();

      // Note: SelectionManager is already a ResourceTracker and handles its own cleanup
      // We just need to null our reference when we're deactivated
      // No need to track it since it manages itself

      this.isActive = true;
      logger.info('SimpleTextSelectionHandler activated successfully');
      return true;

    } catch (error) {
      try {
        const handler = ErrorHandler.getInstance();
        handler.handle(error, {
          type: ErrorTypes.SERVICE,
          context: 'SimpleTextSelectionHandler-activate',
          showToast: false
        });
      } catch (handlerError) {
        logger.error('Error activating SimpleTextSelectionHandler:', error);
        logger.error('ErrorHandler not available:', handlerError);
      }
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

      // Clean up Shift+Click event listeners and timeouts
      if (this._shiftKeyReleaseHandler) {
        document.removeEventListener('keyup', this._shiftKeyReleaseHandler, { capture: true });
        this._shiftKeyReleaseHandler = null;
      }

      if (this._shiftKeyTimeout) {
        clearTimeout(this._shiftKeyTimeout);
        this._shiftKeyTimeout = null;
      }

      // Clean up mouse up timers and animation frames
      if (this._mouseUpTimeout) {
        clearTimeout(this._mouseUpTimeout);
        this._mouseUpTimeout = null;
      }

      if (this._mouseUpAnimationFrame) {
        cancelAnimationFrame(this._mouseUpAnimationFrame);
        this._mouseUpAnimationFrame = null;
      }

      // Clean up typing detection
      this.cleanupTypingDetection();

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
      // Clean up preservation system
      this._clearPreservationTimer();

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
      this.addEventListener(window, 'mousemove', this.handleMouseMove, {
        critical: true
      });

      // Ctrl key tracking for requirement checking
      this.addEventListener(window, 'keydown', this.handleKeyDown);
      this.addEventListener(window, 'keyup', this.handleKeyUp);

      // Simple input detection for text field typing
      this.addEventListener(document, 'input', this.handleInput, {
        capture: true,
        critical: true
      });

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

      // ENHANCED_TRIPLE_CLICK_DRAG changes
      this._settingsListeners.push(
        settingsManager.onChange('ENHANCED_TRIPLE_CLICK_DRAG', (newValue) => {
          logger.debug('ENHANCED_TRIPLE_CLICK_DRAG changed:', newValue);
          this.enhancedTripleClickDrag = newValue;
        }, 'simple-text-selection')
      );

      logger.debug('Settings listeners setup complete');

    } catch (error) {
      logger.error('Failed to setup settings listeners:', error);
    }
  }

  /**
   * Smart selection preservation system
   * Combines event-driven approach with timer optimization
   */
  _startSelectionPreservation(reason, customDuration = null) {
    this._clearPreservationTimer();

    const duration = customDuration || this._getOptimalDuration(reason);

    this._preservationState = {
      active: true,
      reason,
      timestamp: Date.now(),
      timeout: setTimeout(() => {
        this._preservationState.active = false;
        this._preservationState.timeout = null;
        logger.debug('Selection preservation expired', { reason });
      }, duration),
      duration
    };

    // Set global flags for cross-component communication
    window.translateItJustFinishedSelection = true;
    window.translateItSelectionPreservationReason = reason;

    // Clear global flags after preservation period
    setTimeout(() => {
      window.translateItJustFinishedSelection = false;
      window.translateItSelectionPreservationReason = null;
    }, duration);

    logger.debug('Selection preservation started', { reason, duration });
  }

  /**
   * Clear preservation timer
   */
  _clearPreservationTimer() {
    if (this._preservationState.timeout) {
      clearTimeout(this._preservationState.timeout);
      this._preservationState.timeout = null;
    }
    this._preservationState.active = false;
  }

  /**
   * Get optimal preservation duration based on selection type
   */
  _getOptimalDuration(reason) {
    const durations = {
      'triple-click-drag': 2500,     // Longer for triple-click + drag
      'shift-click': 2000,           // Medium for Shift+Click
      'regular-drag': 1500,          // Standard for drag
      'post-drag-selection': 1800,   // Extended for immediate post-drag
      'keyboard-selection': 1000,    // Shorter for keyboard
      'default': 1000                // Increased from 1000 to 1500 for better UX
    };
    return durations[reason] || durations.default;
  }

  /**
   * Check if preservation is currently active
   */
  _isPreservationActive() {
    return this._preservationState.active &&
           Date.now() - this._preservationState.timestamp < this._preservationState.duration;
  }

  /**
   * Detect selection type based on current state
   */
  _detectSelectionType() {
    const currentTime = Date.now();

    // Enhanced triple-click + drag detection
    if (this.enhancedTripleClickDrag &&
        currentTime - this.lastTripleClickTime < 500 &&
        this.isDragging) {
      return 'triple-click-drag';
    }

    // Regular drag detection with extended time window
    if (this.isDragging) {
      return 'regular-drag';
    }

    // Shift+Click detection
    if (this.shiftKeyPressed) {
      return 'shift-click';
    }

    // Check if keyboard selection (Ctrl+A, Shift+Arrow)
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      const recentKeyEvent = currentTime - this.lastKeyEventTime < 300; // Extended window
      const recentMouseEvent = currentTime - this.lastMouseEventTime < 150; // Extended window

      if (recentKeyEvent && !recentMouseEvent) {
        return 'keyboard-selection';
      }
    }

    // Check if this is immediate post-drag scenario
    if (currentTime - this.mouseDownTime < 1000 && selection && selection.toString().trim()) {
      return 'post-drag-selection';
    }

    return 'default';
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

    // If waiting for drag end after triple-click, don't process selection yet
    if (this.isWaitingForDragEnd) {
      logger.debug('Waiting for drag end after triple-click, skipping selection processing');
      return;
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
        shiftPressed: this.shiftKeyPressed,
        isDragging: this.isDragging
      });

      if (!selectedText) {
        // Check if preservation is active - if so, skip dismissal
        if (this._isPreservationActive()) {
          logger.debug('Selection preservation active - skipping dismissal', {
            reason: this._preservationState.reason,
            remainingTime: this._preservationState.duration - (Date.now() - this._preservationState.timestamp)
          });
          return;
        }

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

        // Skip dismissal during Shift+Click operations
        if (this.shiftKeyPressed) {
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

        // BUT: Start preservation for drag operations to prevent selection clearing
        // EXCEPT: Don't preserve for regular-drag in text fields (let typing detection handle it)
        if (selectedText) {
          const selectionType = this._detectSelectionType();
          const activeElement = document.activeElement;
          const isInTextField = activeElement && activeElement.isConnected && this.isTextField(activeElement);

          if (selectionType === 'regular-drag' && isInTextField) {
            logger.debug('Skipping regular-drag preservation in text field - let typing detection handle it', {
              selectionType,
              textFieldType: activeElement.tagName
            });
          } else if (selectionType === 'regular-drag' ||
                     selectionType === 'triple-click-drag' ||
                     selectionType === 'post-drag-selection') {
            this._startSelectionPreservation(selectionType);
            logger.debug('Preservation started during drag operation', { selectionType });
          }
        }
        return;
      }

      // Skip if select element mode is active
      if (this.isSelectElementModeActive()) {
        logger.debug('Select element mode active, skipping text selection');
        return;
      }

      // Skip if selection is in a text field (handled by TextFieldDoubleClickHandler)
      if (this.isSelectionInTextField()) {
        logger.debug('Selection in text field, skipping (handled by TextFieldDoubleClickHandler)', {
          activeElement: document.activeElement?.tagName,
          activeElementType: document.activeElement?.type,
          selectionText: selectedText.substring(0, 20)
        });
        return;
      }

      // Check Ctrl key requirement
      if (!(await this.shouldProcessSelection())) {
        logger.debug('Ctrl requirement not met, skipping selection');
        return;
      }

      // Detect selection type and start preservation
      const selectionType = this._detectSelectionType();
      this._startSelectionPreservation(selectionType);

      // Process the selection
      if (this.selectionManager) {
        this.logger.debug('Processing valid text selection', {
          textLength: selectedText.length,
          sourceElement: selection?.anchorNode?.nodeName || 'unknown',
          selectionType: selectionType
        });
        await this.selectionManager.processSelection(selectedText, selection);
      } else {
        logger.warn('SelectionManager is null - this should not happen with critical protection');
      }

    } catch (error) {
      logger.error('Error processing selection:', error);
      try {
        const handler = ErrorHandler.getInstance();
        await handler.handle(error, {
          type: ErrorTypes.UI,
          context: 'simple-text-selection-process',
          showToast: false
        });
      } catch (handlerError) {
        logger.error('ErrorHandler not available when processing selection:', handlerError);
      }
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
      // Use all text field types for selection detection (to ignore text selections in these fields)
      return INPUT_TYPES.ALL_TEXT_FIELDS.includes(type);
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
   * Handle key down events for Ctrl and Shift tracking
   */
  handleKeyDown(event) {
    this.lastKeyEventTime = Date.now();
    if (event.ctrlKey || event.metaKey) {
      this.ctrlKeyPressed = true;
      logger.debug('Ctrl key pressed down');
    }
    if (event.shiftKey) {
      this.shiftKeyPressed = true;
      this.isInShiftClickOperation = true;

      // Set global flag for WindowsManager to check
      window.translateItShiftClickOperation = true;

      // Clean up previous shift key release handler if exists
      if (this._shiftKeyReleaseHandler) {
        document.removeEventListener('keyup', this._shiftKeyReleaseHandler, { capture: true });
        this._shiftKeyReleaseHandler = null;
      }

      // Clean up previous fallback timeout if exists
      if (this._shiftKeyTimeout) {
        clearTimeout(this._shiftKeyTimeout);
        this._shiftKeyTimeout = null;
      }

      // Set up event-based Shift key release detection
      this._shiftKeyReleaseHandler = (event) => {
        if (event.key === 'Shift' && this.isInShiftClickOperation) {
          this.isInShiftClickOperation = false;
          this.shiftKeyPressed = false;
          window.translateItShiftClickOperation = false;

          // Clean up event listener
          document.removeEventListener('keyup', this._shiftKeyReleaseHandler, { capture: true });
          this._shiftKeyReleaseHandler = null;

          // Clean up fallback timeout
          if (this._shiftKeyTimeout) {
            clearTimeout(this._shiftKeyTimeout);
            this._shiftKeyTimeout = null;
          }

          logger.debug('Shift key released via event listener');
        }
      };

      // Add event listener with capture for immediate response
      document.addEventListener('keyup', this._shiftKeyReleaseHandler, { capture: true });

      // Fallback timeout as backup (reduced from 2s to 1.5s)
      this._shiftKeyTimeout = setTimeout(() => {
        if (this.isInShiftClickOperation) {
          this.isInShiftClickOperation = false;
          this.shiftKeyPressed = false;
          window.translateItShiftClickOperation = false;

          // Clean up event listener if still exists
          if (this._shiftKeyReleaseHandler) {
            document.removeEventListener('keyup', this._shiftKeyReleaseHandler, { capture: true });
            this._shiftKeyReleaseHandler = null;
          }

          this._shiftKeyTimeout = null;
          logger.debug('Shift key state reset via fallback timeout');
        }
      }, 1500);
    }
  }

  /**
   * Handle key up events for Ctrl and Shift tracking
   */
  handleKeyUp(event) {
    this.lastKeyEventTime = Date.now();
    if (!event.ctrlKey && !event.metaKey) {
      this.ctrlKeyPressed = false;
      logger.debug('Ctrl key released');
    }
    if (!event.shiftKey && this.isInShiftClickOperation) {
      this.shiftKeyPressed = false;
      this.isInShiftClickOperation = false;
      window.translateItShiftClickOperation = false;

      // Clean up event listener if it exists (prevent duplicate cleanup)
      if (this._shiftKeyReleaseHandler) {
        document.removeEventListener('keyup', this._shiftKeyReleaseHandler, { capture: true });
        this._shiftKeyReleaseHandler = null;
      }

      // Clean up fallback timeout
      if (this._shiftKeyTimeout) {
        clearTimeout(this._shiftKeyTimeout);
        this._shiftKeyTimeout = null;
      }

      logger.debug('Shift key released via keyup handler');
    }
  }

  /**
   * Handle mouse down - start drag detection with triple-click support
   */
  handleMouseDown(event) {
    this.lastMouseEventTime = Date.now();
    this.isDragging = true;
    this.mouseDownTime = Date.now();

    // Update Ctrl state from mouse event if available
    if (event.ctrlKey || event.metaKey) {
      this.ctrlKeyPressed = true;
      this.lastKeyEventTime = Date.now();
    }

    // Simple triple-click detection (only if enhanced mode is enabled)
    if (this.enhancedTripleClickDrag) {
      const currentTime = Date.now();
      const timeSinceLastClick = currentTime - this.lastTripleClickTime;

      // Check if this is a triple-click (within 300ms)
      if (timeSinceLastClick < 300 && timeSinceLastClick > 0) {
        this.isWaitingForDragEnd = true;
        this.dragStartTime = currentTime;
        logger.debug('Triple-click detected - waiting for drag end');
      }

      this.lastTripleClickTime = currentTime;
    }
  }

  /**
   * Handle mouse move - simple drag detection
   */
  handleMouseMove() {
    // Not needed for simplified triple-click + drag
    // We only care about mouse up to end the drag
  }

  /**
   * Handle mouse up - end drag detection and process selection if needed
   */
  handleMouseUp(event) {
    this.lastMouseEventTime = Date.now();
    this.lastMouseUpEvent = event; // Store for translation window detection

    // Update Ctrl and Shift state from mouse event if available
    if (event.ctrlKey || event.metaKey) {
      this.ctrlKeyPressed = true;
      this.lastKeyEventTime = Date.now(); // Update to extend the "recent" window
    }
    if (event.shiftKey) {
      this.shiftKeyPressed = true;
      this.lastKeyEventTime = Date.now(); // Update to extend the "recent" window
    }

    // For Shift+Click operations, we need special handling to preserve selection
    const wasShiftClick = this.shiftKeyPressed;

    // End drag detection
    this.isDragging = false;

    // Clean up any previous mouse up timeout
    if (this._mouseUpTimeout) {
      clearTimeout(this._mouseUpTimeout);
      this._mouseUpTimeout = null;
    }

    // Clean up any previous animation frame
    if (this._mouseUpAnimationFrame) {
      cancelAnimationFrame(this._mouseUpAnimationFrame);
      this._mouseUpAnimationFrame = null;
    }

    // Use requestAnimationFrame for better performance and visual consistency
    // Then use setTimeout as a fallback to ensure selection processing
    const delay = wasShiftClick ? 150 : 50; // Longer delay for Shift+Click to allow browser to complete selection

    this._mouseUpAnimationFrame = requestAnimationFrame(() => {
      this._mouseUpTimeout = setTimeout(() => {
        const selection = window.getSelection();
        if (selection && selection.toString().trim()) {
          // Enhanced preservation for post-mouseup scenarios
          const selectionType = this._detectSelectionType();
          if (selectionType === 'triple-click-drag' || wasShiftClick) {
            // Start preservation immediately for critical scenarios
            this._startSelectionPreservation(selectionType);
          }

          logger.debug('Processing selection after drag end', {
            wasShiftClick,
            selectionType,
            hasPreservation: this._isPreservationActive()
          });
          this.processSelection();
        }

        // Clean up references
        this._mouseUpTimeout = null;
        this._mouseUpAnimationFrame = null;
      }, delay);
    });
  }

  /**
   * Handle input events - simple text field typing detection for preservation
   */
  handleInput(event) {
    if (!this.isActive) return;

    const target = event.target;

    // Check if target is a text field AND we have recent selection activity
    if (this.isTextField(target) && this._isPreservationActive()) {
      logger.debug('Text input detected in text field during preservation', {
        target: target.tagName,
        preservationReason: this._preservationState.reason,
        timeSinceSelectionStart: Date.now() - this._preservationState.timestamp
      });

      // Start simple typing detection period to allow text replacement
      this._startTypingDetection(target);
    }
  }

  /**
   * Start simple typing detection period to allow text replacement
   */
  _startTypingDetection(textField) {
    // Clean up any existing typing detection
    this._stopTypingDetection();

    this.typingDetection = {
      isActive: true,
      startTime: Date.now(),
      timeout: setTimeout(() => {
        this._stopTypingDetection();
      }, 800) // 800ms typing detection period
    };

    // Set global flags for cross-component communication
    window.translateItTextFieldTypingActive = true;
    window.translateItTextFieldTypingElement = textField;
    window.translateItTextFieldTypingTimestamp = Date.now();

    logger.debug('Text field typing detection started (SimpleTextSelectionHandler)', {
      textField: textField.tagName,
      duration: 800
    });
  }

  /**
   * Stop typing detection and clean up
   */
  _stopTypingDetection() {
    if (this.typingDetection.timeout) {
      clearTimeout(this.typingDetection.timeout);
      this.typingDetection.timeout = null;
    }

    this.typingDetection.isActive = false;
    this.typingDetection.startTime = 0;

    // Clear global flags
    window.translateItTextFieldTypingActive = false;
    window.translateItTextFieldTypingElement = null;
    window.translateItTextFieldTypingTimestamp = null;

    logger.debug('Text field typing detection stopped (SimpleTextSelectionHandler)');
  }

  /**
   * Clean up typing detection (alias for _stopTypingDetection)
   */
  cleanupTypingDetection() {
    this._stopTypingDetection();
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
      currentSelection: this.getCurrentSelection()?.substring(0, 100),
      preservation: {
        active: this._isPreservationActive(),
        reason: this._preservationState.reason,
        remainingTime: this._preservationState.active ?
          Math.max(0, this._preservationState.duration - (Date.now() - this._preservationState.timestamp)) : 0
      },
      typingDetection: {
        isActive: this.typingDetection.isActive,
        startTime: this.typingDetection.startTime,
        timeSinceStart: this.typingDetection.isActive ? Date.now() - this.typingDetection.startTime : null
      }
    };
  }

  /**
   * Check if typing detection is currently active
   */
  isTypingDetectionActive() {
    return this.typingDetection.isActive;
  }

  /**
   * Check if a specific element is the current typing target
   */
  isTypingTarget(element) {
    return this.typingDetection.isActive && window.translateItTextFieldTypingElement === element;
  }

  destroy() {
    // Clean up preservation system
    this._clearPreservationTimer();

    // Clean up typing detection
    this.cleanupTypingDetection();

    // Clean up global reference
    if (window.simpleTextSelectionHandlerInstance === this) {
      window.simpleTextSelectionHandlerInstance = null;
    }

    this.cleanup();
    // Reset singleton instance
    if (simpleTextSelectionHandlerInstance === this) {
      simpleTextSelectionHandlerInstance = null;
    }
  }
}

export default SimpleTextSelectionHandler;