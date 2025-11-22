import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { INPUT_TYPES } from '@/shared/config/constants.js';
import { IFRAME_CONFIG, POSITION_CONFIG, ConfigUtils } from '../config/TextFieldConfig.js';
import IframePositionCalculator from '../utils/IframePositionCalculator.js';

const logger = getScopedLogger(LOG_COMPONENTS.TEXT_FIELD_INTERACTION, 'TextFieldDoubleClickHandler');

/**
 * Text Field Double Click Handler
 *
 * Handles double-click events specifically for text fields and editable elements.
 * This handler is optimized for iframe support and provides accurate position calculation
 * across different browsing contexts.
 *
 * Features:
 * - Double-click detection in text fields with 500ms window
 * - Professional editor support (Google Docs, Zoho Writer, etc.)
 * - Cross-origin iframe position calculation with multiple fallback strategies
 * - Integration with WindowsManager for UI display
 * - Smart mouse tracking for accurate positioning
 * - Configurable timeouts and offsets
 *
 * Architecture:
 * - Uses IframePositionCalculator for all position calculations
 * - Leverages centralized configuration from TextFieldConfig.js
 * - Implements ResourceTracker for proper memory management
 * - Supports both same-origin and cross-origin iframes
 */
export class TextFieldDoubleClickHandler extends ResourceTracker {
  constructor(options = {}) {
    super('text-field-double-click-handler');

    this.isActive = false;
    this.featureManager = options.featureManager;

    // Mark this instance as critical to prevent cleanup during memory management
    this.trackResource('text-field-double-click-handler-critical', () => {
      // This is the core text field double click handler - should not be cleaned up
      logger.debug('Critical TextFieldDoubleClickHandler cleanup skipped');
    }, { isCritical: true });

    // Double-click state management
    this.doubleClickProcessing = false;
    this.lastDoubleClickTime = 0;
    this.doubleClickWindow = POSITION_CONFIG.DOUBLE_CLICK_WINDOW;

    // Initialize iframe position calculator
    this.positionCalculator = new IframePositionCalculator({
      logger,
      config: POSITION_CONFIG,
    });

    // Bind methods
    this.handleDoubleClick = this.handleDoubleClick.bind(this);
    this.handleTextInputStart = this.handleTextInputStart.bind(this);
    this.handleTextInput = this.handleTextInput.bind(this);

    // Store last clicked element for position estimation
    this.lastClickedElement = null;

    // Initialize typing detection state
    this.typingDetection = {
      isActive: false,
      startTime: 0,
      gracePeriod: 800,
      detectedTextField: null,
      originalSelection: null,
      lastTypingTime: 0,
      timeout: null
    };

    // Track typing listeners for cleanup
    this._typingListeners = new Map(); // iconId -> {textField, handlers}
  }

  async activate() {
    if (this.isActive) {
      logger.debug('TextFieldDoubleClickHandler already active');
      return true;
    }

    try {
      logger.debug('Activating TextFieldDoubleClickHandler');

      // Setup double-click listeners
      this.setupDoubleClickListeners();

      // Setup typing detection listeners for text replacement scenarios
      this.setupTypingDetectionListeners();

      // Setup postMessage listener for iframe requests
      this.setupPostMessageListener();

      // Setup mouse tracking for iframe position conversion
      this.positionCalculator.setupMouseTracking();

      this.isActive = true;
      logger.info('TextFieldDoubleClickHandler activated successfully');
      return true;

    } catch (error) {
      const handler = ErrorHandler.getInstance();
      handler.handle(error, {
        type: ErrorTypes.SERVICE,
        context: 'TextFieldDoubleClickHandler-activate',
        showToast: false
      });
      return false;
    }
  }

  async deactivate() {
    if (!this.isActive) {
      logger.debug('TextFieldDoubleClickHandler not active');
      return true;
    }

    try {
      logger.debug('Deactivating TextFieldDoubleClickHandler');

      // Clear any processing flags
      this.doubleClickProcessing = false;

      // Clean up typing detection
      this.cleanupTypingDetection();

      // Clean up typing listeners
      this._cleanupAllTypingListeners();

      // Manually cleanup postMessage listener
      if (this.postMessageHandler) {
        window.removeEventListener('message', this.postMessageHandler);
        this.postMessageHandler = null;
      }

      // Cleanup position calculator
      this.positionCalculator.cleanup();

      // ResourceTracker will handle event listener cleanup
      this.cleanup();

      this.isActive = false;
      logger.info('TextFieldDoubleClickHandler deactivated successfully');
      return true;

    } catch (error) {
      logger.error('Error deactivating TextFieldDoubleClickHandler:', error);
      try {
        if (this.postMessageHandler) {
          window.removeEventListener('message', this.postMessageHandler);
          this.postMessageHandler = null;
        }
        this.positionCalculator.cleanup();
        this.cleanup();
        this.isActive = false;
        return true;
      } catch (cleanupError) {
        logger.error('Critical: TextFieldDoubleClickHandler cleanup failed:', cleanupError);
        return false;
      }
    }
  }

  setupDoubleClickListeners() {
    try {
      // Use capture phase to catch events before they're prevented
      this.addEventListener(document, 'dblclick', this.handleDoubleClick, {
        capture: true,
        critical: true
      });

      logger.debug('Text field double-click listeners setup complete');

    } catch (error) {
      logger.error('Failed to setup double-click listeners:', error);
    }
  }

  /**
   * Setup typing detection listeners for text replacement scenarios
   */
  setupTypingDetectionListeners() {
    try {
      // Listen for text input events (typing) on text fields
      this.addEventListener(document, 'input', this.handleTextInput, {
        capture: true,
        critical: true
      });

      // Listen for keydown events to detect typing start
      this.addEventListener(document, 'keydown', this.handleTextInputStart, {
        capture: true,
        critical: true
      });

      logger.debug('Text field typing detection listeners setup complete');

    } catch (error) {
      logger.error('Failed to setup typing detection listeners:', error);
    }
  }

  /**
   * Clean up typing detection
   */
  cleanupTypingDetection() {
    if (this.typingDetection.timeout) {
      clearTimeout(this.typingDetection.timeout);
      this.typingDetection.timeout = null;
    }

    this.typingDetection.isActive = false;
    this.typingDetection.detectedTextField = null;
    this.typingDetection.originalSelection = null;

    logger.debug('Text field typing detection cleaned up');
  }

  setupPostMessageListener() {
    try {
      // Listen for postMessage from iframes
      this.postMessageHandler = (event) => {
        const messageType = event.data?.type;

        // Only handle messages from same origin or trusted origins
        if (messageType === IFRAME_CONFIG.MESSAGE_TYPES.SHOW_TRANSLATION_ICON) {
          logger.info('TextFieldDoubleClickHandler: Received showTranslationIcon message from iframe', {
            frameId: event.data.frameId,
            text: event.data.text?.substring(0, 30) + '...',
            origin: event.origin
          });

          // Process the iframe request using our own showTranslationUI
          this.showTranslationUI(event.data.text, event.data.position);
        }

        // Handle iframe position calculation requests (only in main document)
        if (messageType === IFRAME_CONFIG.MESSAGE_TYPES.CALCULATE_IFRAME_POSITION && window === window.top) {
          this.positionCalculator.handleIframePositionRequest(event);
        }

        // Handle position calculation responses (only in iframes)
        if (messageType === IFRAME_CONFIG.MESSAGE_TYPES.IFRAME_POSITION_CALCULATED && window !== window.top) {
          this.positionCalculator.handlePositionCalculationResponse(event);
        }
      };

      window.addEventListener('message', this.postMessageHandler);
      this.trackResource('postMessageHandler', () => {
        window.removeEventListener('message', this.postMessageHandler);
      });

      logger.debug('TextFieldDoubleClickHandler: PostMessage listener setup complete');

    } catch (error) {
      logger.error('Failed to setup postMessage listener:', error);
    }
  }

  
  /**
   * Handle double-click events on text fields
   */
  async handleDoubleClick(event) {
    logger.info('TextFieldDoubleClickHandler: Double-click event received');

    if (!this.isActive) {
      logger.info('TextFieldDoubleClickHandler: Handler is not active');
      return;
    }

    const target = event.target;

    const isTextField = this.isTextField(target);

    logger.debug('Double-click detected', {
      target: target?.tagName,
      timestamp: Date.now(),
      isTextField: isTextField,
      targetInfo: {
        tagName: target?.tagName,
        contentEditable: target?.contentEditable,
        parentTagName: target?.parentElement?.tagName,
        parentContentEditable: target?.parentElement?.contentEditable
      }
    });

    // Only handle text fields and editable elements
    if (!this.isTextField(target)) {
      logger.debug('Double-click ignored - not a text field');
      return;
    }

    // Check if text field icons are enabled
    if (!(await this.isTextFieldIconsEnabled())) {
      logger.debug('Double-click ignored - text field icons disabled');
      return;
    }

    // NEW: Prevent creating new icons during active typing
    if (window.translateItTextFieldTypingActive) {
      logger.debug('Double-click ignored - user is actively typing in text field');
      return;
    }

    // Mark processing start
    this.lastDoubleClickTime = Date.now();
    this.doubleClickProcessing = true;

    try {
      // Process the double-click with delay for text selection
      setTimeout(async () => {
        await this.processTextFieldDoubleClick(event);
        this.doubleClickProcessing = false;
      }, 150); // Give time for text selection to occur

    } catch (error) {
      this.doubleClickProcessing = false;
      logger.error('Error processing text field double-click:', error);
    }
  }

  /**
   * Handle text input start (keydown) - detect typing intent
   */
  handleTextInputStart(event) {
    if (!this.isActive) return;

    // Only process if it's a typing key (not special keys)
    // Add safety check for event.key existence
    if (event && event.key && (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete')) {
      const target = event.target;

      // Check if target is a text field and we have an active double-click scenario
      if (this.isTextField(target) && this.doubleClickProcessing) {
        const timeSinceDoubleClick = Date.now() - this.lastDoubleClickTime;

        logger.debug('Text input start detected in text field after double-click', {
          target: target.tagName,
          key: event.key,
          timeSinceDoubleClick: timeSinceDoubleClick
        });

        // FIXED: Ignore key presses that occur too quickly after double-click (likely incidental)
        // This prevents false positives when user double-clicks while holding a key
        if (timeSinceDoubleClick < 100) {
          logger.debug('Ignoring key press - too soon after double-click (likely incidental)', {
            key: event.key,
            timeSinceDoubleClick: timeSinceDoubleClick
          });
          return;
        }

        // Start typing detection grace period
        this._startTypingGracePeriod(target);

        // NEW: Cancel any ongoing double-click processing when typing starts
        if (this.doubleClickProcessing) {
          this.doubleClickProcessing = false;
          logger.debug('Cancelled double-click processing due to typing start');
        }
      }
    }
  }

  /**
   * Handle text input events - detect ongoing typing
   */
  handleTextInput(event) {
    if (!this.isActive) return;

    const target = event.target;

    // Check if this is a text field with active typing detection
    if (this.isTextField(target) && this.typingDetection.isActive) {
      this.typingDetection.lastTypingTime = Date.now();

      logger.debug('Ongoing typing detected in text field', {
        target: target.tagName,
        timeSinceGraceStart: Date.now() - this.typingDetection.startTime
      });

      // Set global flag to prevent translation UI interference
      window.translateItTextFieldTypingActive = true;
      window.translateItTextFieldTypingElement = target;
      window.translateItTextFieldTypingTimestamp = this.typingDetection.startTime;

      // Extend the typing detection period
      this._extendTypingDetection();
    }
  }

  /**
   * Start typing grace period to allow text replacement
   */
  _startTypingGracePeriod(textField) {
    // Clean up any existing typing detection
    this.cleanupTypingDetection();

    // Get current selection for reference
    const selection = window.getSelection();
    const selectedText = selection ? selection.toString().trim() : '';

    this.typingDetection = {
      isActive: true,
      startTime: Date.now(),
      gracePeriod: 800,
      detectedTextField: textField,
      originalSelection: selectedText,
      lastTypingTime: Date.now(),
      timeout: setTimeout(() => {
        this._endTypingGracePeriod();
      }, this.typingDetection.gracePeriod)
    };

    // Set global flags for cross-component communication
    window.translateItTextFieldTypingActive = true;
    window.translateItTextFieldTypingElement = textField;
    window.translateItTextFieldTypingStartTime = this.typingDetection.startTime;
    window.translateItTextFieldTypingTimestamp = this.typingDetection.startTime;

    logger.debug('Text field typing grace period started', {
      textField: textField.tagName,
      originalSelection: selectedText.substring(0, 30),
      gracePeriod: this.typingDetection.gracePeriod
    });
  }

  /**
   * Extend typing detection period
   */
  _extendTypingDetection() {
    // Clear existing timeout
    if (this.typingDetection.timeout) {
      clearTimeout(this.typingDetection.timeout);
    }

    // Extend the grace period
    const extendedGracePeriod = 1200; // Longer period for ongoing typing
    this.typingDetection.timeout = setTimeout(() => {
      this._endTypingGracePeriod();
    }, extendedGracePeriod);

    logger.debug('Text field typing detection extended', {
      extendedGracePeriod,
      timeActive: Date.now() - this.typingDetection.startTime
    });
  }

  /**
   * End typing grace period
   */
  _endTypingGracePeriod() {
    logger.debug('Text field typing grace period ended', {
      duration: Date.now() - this.typingDetection.startTime,
      textField: this.typingDetection.detectedTextField?.tagName
    });

    // Clean up typing detection
    this.cleanupTypingDetection();

    // Clear global flags
    window.translateItTextFieldTypingActive = false;
    window.translateItTextFieldTypingElement = null;
    window.translateItTextFieldTypingStartTime = null;
    window.translateItTextFieldTypingTimestamp = null;

    // Also clear double-click processing flag if it's still active
    if (this.doubleClickProcessing) {
      this.doubleClickProcessing = false;
      logger.debug('Cleared double-click processing flag after typing period');
    }
  }

  /**
   * Check if the target is a text field or editable element
   */
  isTextField(element) {
    if (!element) {
      logger.debug('isTextField: element is null');
      return false;
    }

    logger.debug('isTextField: checking element', {
      tagName: element.tagName,
      contentEditable: element.contentEditable,
      type: element.type
    });

    // Check the element itself first
    if (this.isDirectTextField(element)) {
      logger.debug('isTextField: element itself is text field');
      return true;
    }

    // Check parent elements for contenteditable or professional editors
    // This handles cases like Twitter where you click on SPAN inside contenteditable DIV
    let currentElement = element.parentElement;
    let depth = 0;
    const maxDepth = 5; // Prevent infinite loops

    logger.debug('isTextField: checking parent elements', {
      hasParent: !!currentElement,
      parentTag: currentElement?.tagName,
      parentContentEditable: currentElement?.contentEditable
    });

    while (currentElement && depth < maxDepth) {
      logger.debug('isTextField: checking parent at depth', {
        depth: depth + 1,
        parentTag: currentElement.tagName,
        parentContentEditable: currentElement.contentEditable,
        isDirectTextField: this.isDirectTextField(currentElement)
      });

      if (this.isDirectTextField(currentElement)) {
        logger.debug('Found text field in parent element', {
          clickedTag: element.tagName,
          parentTag: currentElement.tagName,
          depth: depth + 1
        });
        return true;
      }
      currentElement = currentElement.parentElement;
      depth++;
    }

    logger.debug('isTextField: no text field found in element or parents');
    return false;
  }

  /**
   * Check if element is directly a text field (without checking parents)
   */
  isDirectTextField(element) {
    if (!element) return false;

    // Standard input fields
    if (element.tagName === 'INPUT') {
      const type = (element.type || '').toLowerCase();
      // Use all text field types for double-click detection
      return INPUT_TYPES.ALL_TEXT_FIELDS.includes(type);
    }

    // Textarea
    if (element.tagName === 'TEXTAREA') {
      return true;
    }

    // Contenteditable elements (comprehensive check)
    if (element.contentEditable === 'true' ||
        element.isContentEditable === true ||
        element.getAttribute('contenteditable') === 'true') {
      return true;
    }

    // Professional editors (Google Docs, etc.)
    if (this.isProfessionalEditor(element)) {
      return true;
    }

    return false;
  }

  /**
   * Check if element is part of a professional editor
   */
  isProfessionalEditor(element) {
    // General approach: look for contenteditable ancestors
    // This works for most modern rich text editors
    const editableAncestor = element.closest('[contenteditable="true"]');
    if (editableAncestor) {
      return true;
    }

    // Also check for isContentEditable property
    let currentElement = element;
    let depth = 0;
    while (currentElement && depth < 5) {
      if (currentElement.isContentEditable === true) {
        return true;
      }
      currentElement = currentElement.parentElement;
      depth++;
    }

    return false;
  }

  /**
   * Process text field double-click
   */
  async processTextFieldDoubleClick(event) {
    logger.info('TextFieldDoubleClickHandler: Processing text field double-click');

    try {
      // Store the clicked element for position estimation
      this.lastClickedElement = event.target;

      // Find the actual text field element (might be parent of clicked element)
      const actualTextField = this.findActualTextField(event.target);

      // Get selected text
      const selectedText = await this.getSelectedTextFromField(actualTextField || event.target);

      if (!selectedText || !selectedText.trim()) {
        logger.debug('No text selected in text field');
        return;
      }

      // NEW: Additional check - don't create icon if typing has already started
      if (window.translateItTextFieldTypingActive) {
        logger.debug('Double-click processing cancelled - typing already active');
        return;
      }

      logger.debug('Processing text field selection', {
        text: selectedText.substring(0, 30) + '...',
        clickedElement: event.target?.tagName,
        actualTextField: actualTextField?.tagName || 'not found'
      });

      // Calculate position using the actual text field element
      const position = this.calculateTextFieldPosition(event, actualTextField);

      if (!position) {
        logger.warn('Could not calculate position for text field');
        return;
      }

      // Show translation UI
      await this.showTranslationUI(selectedText, position, actualTextField);

    } catch (error) {
      logger.error('Error processing text field double-click:', error);
    }
  }

  /**
   * Find the actual text field element (handles cases where we click on child elements)
   */
  findActualTextField(element) {
    if (!element) return null;

    // Check the element itself first
    if (this.isDirectTextField(element)) {
      return element;
    }

    // Check parent elements
    let currentElement = element.parentElement;
    let depth = 0;
    const maxDepth = 5;

    while (currentElement && depth < maxDepth) {
      if (this.isDirectTextField(currentElement)) {
        logger.debug('Found actual text field in parent', {
          clickedTag: element.tagName,
          actualFieldTag: currentElement.tagName,
          depth: depth + 1
        });
        return currentElement;
      }
      currentElement = currentElement.parentElement;
      depth++;
    }

    return null;
  }

  /**
   * Get selected text from text field
   */
  async getSelectedTextFromField(element) {
    try {
      // For regular input/textarea elements
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        const start = element.selectionStart;
        const end = element.selectionEnd;
        if (start !== end && start !== null && end !== null) {
          return element.value.substring(start, end);
        }
      }

      // For contenteditable and professional editors
      const selection = window.getSelection();
      if (selection && selection.toString().trim()) {
        return selection.toString().trim();
      }

      // Fallback: use site-specific detection
      return await this.detectTextUsingSiteHandler(element);

    } catch (error) {
      logger.debug('Error getting selected text from field:', error);
      return null;
    }
  }

  /**
   * Detect text using site-specific handlers (simplified version)
   */
  async detectTextUsingSiteHandler() {
    try {
      const hostname = window.location.hostname;

      // Google Docs specific
      if (hostname.includes('docs.google.com')) {
        // Simple fallback for Google Docs
        const selection = window.getSelection();
        return selection ? selection.toString().trim() : null;
      }

      // Other professional editors - use standard selection
      const selection = window.getSelection();
      return selection ? selection.toString().trim() : null;

    } catch (error) {
      logger.debug('Site handler detection failed:', error);
      return null;
    }
  }

  /**
   * Calculate position for text field translation UI
   *
   * This method provides document-relative positioning for WindowsManager.
   * Based on the logs, WindowsManager expects document-relative coordinates
   * even for fixed positioning elements.
   *
   * @param {Event} event - Double-click event containing client coordinates
   * @param {Element|null} actualTextField - The actual text field element (may differ from event.target)
   * @returns {Object|null} Position object with x, y coordinates or null if calculation fails
   */
  calculateTextFieldPosition(event, actualTextField = null) {
    try {
      // Use actual text field element if provided, otherwise use event target
      const element = actualTextField || event.target;

      let baseX, baseY;
      let isFromMouseEvent = false;

      // Priority 1: Use double-click mouse position (most accurate for text fields)
      if (event.clientX && event.clientY) {
        baseX = event.clientX;
        baseY = event.clientY;
        isFromMouseEvent = true;
      } else {
        // Priority 2: Fallback to element-based position
        const rect = element.getBoundingClientRect();
        baseX = rect.left + rect.width / 2;
        baseY = rect.bottom;
        isFromMouseEvent = false;
      }

      // Convert viewport coordinates to document-relative coordinates
      // WindowsManager appears to expect document coordinates even for fixed positioning
      const documentX = baseX + window.scrollX;
      const documentY = baseY + window.scrollY;

      // Calculate position with icon offset
      const iconSize = 32; // Same as WindowsConfig
      const iconOffset = 10; // Small offset below cursor/element

      let finalX, finalY;

      if (isFromMouseEvent) {
        // Center icon horizontally on cursor, place slightly below cursor
        finalX = documentX - (iconSize / 2);
        finalY = documentY + iconOffset;
      } else {
        // Center icon on element bottom edge
        finalX = documentX - (iconSize / 2);
        finalY = documentY + iconOffset;
      }

      const position = {
        x: finalX,
        y: finalY,
        isFromMouseEvent,
        strategy: 'document-relative-with-scroll',
        isInIframe: window !== window.top,
        isViewportRelative: false // Mark as document-relative for WindowsManager
      };

      logger.debug('Calculated text field position (document-relative)', {
        element: element.tagName,
        baseCoords: { x: baseX, y: baseY },
        scrollOffset: { x: window.scrollX, y: window.scrollY },
        calculatedPosition: position,
        isInIframe: window !== window.top,
        documentSize: {
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight
        }
      });

      return position;

    } catch (error) {
      logger.error('Error calculating text field position:', error);
      return null;
    }
  }

  
  /**
   * Check if WindowsManager should be allowed to operate
   */
  async shouldProcessWindowsManager() {
    if (!this.featureManager) {
      logger.debug('FeatureManager not available for WindowsManager check');
      return false;
    }

    try {
      const exclusionChecker = this.featureManager.exclusionChecker;
      if (!exclusionChecker) {
        logger.debug('ExclusionChecker not available');
        return false;
      }

      const allowed = await exclusionChecker.isFeatureAllowed('windowsManager');
      logger.debug(`WindowsManager check for text field: ${allowed ? 'ALLOWED' : 'BLOCKED'}`);
      return allowed;
    } catch (error) {
      logger.error('Error checking WindowsManager permission:', error);
      return false;
    }
  }

  /**
   * Show translation UI using the same pattern as TextSelection system
   */
  async showTranslationUI(selectedText, position, actualTextField = null) {
    // Check if WindowsManager should be allowed
    if (!(await this.shouldProcessWindowsManager())) {
      logger.info('WindowsManager is blocked by exclusion, skipping text field translation UI');
      return;
    }

    // Use the same approach as TextSelection system
    if (window !== window.top) {
      // Iframe - request window creation in main frame (same as SelectionManager)
      this.requestWindowCreationInMainFrame(selectedText, position, actualTextField);
    } else {
      // Main frame - use WindowsManager directly
      const windowsManager = this.getWindowsManager();
      if (windowsManager) {
        logger.debug('Showing translation UI via WindowsManager', {
          text: selectedText.substring(0, 30) + '...',
          position,
          context: 'main-frame'
        });

        // For text fields, always show icon first
        await windowsManager._showIcon(selectedText, position);

        // NEW: Setup direct typing listener for the created icon
        const iconId = windowsManager.state.iconClickContext?.iconId;
        if (iconId) {
          // Use actualTextField if available, otherwise fall back to the focused element
          const textField = actualTextField || document.activeElement;
          if (textField && this.isTextField(textField)) {
            this._setupTypingListenerForIcon(textField, iconId);
          }
        }
      } else {
        logger.warn('WindowsManager not available in main frame');
      }
    }
  }

  /**
   * Request window creation in main frame (copied from SelectionManager)
   */
  requestWindowCreationInMainFrame(selectedText, position, actualTextField = null) {
    try {
      // Import module for side effects (ensure module is loaded)
      import('@/features/windows/managers/core/WindowsConfig.js').then(() => {
        const message = {
          type: IFRAME_CONFIG.MESSAGE_TYPES.TEXT_SELECTION_WINDOW_REQUEST,
          frameId: ConfigUtils.generateFrameId(),
          selectedText: selectedText,
          position: position,
          timestamp: Date.now(),
          // NEW: Include text field info for typing detection
          textFieldInfo: actualTextField ? {
            tagName: actualTextField.tagName,
            id: actualTextField.id,
            className: actualTextField.className
          } : null
        };

        if (window.parent !== window) {
          window.parent.postMessage(message, '*');
          logger.info('Text field translation window request sent to parent frame', {
            frameId: message.frameId,
            textLength: selectedText.length,
            position: {
              x: Math.round(position.x),
              y: Math.round(position.y)
            }
          });
        }
      });

    } catch (error) {
      logger.error('Failed to request window creation in main frame:', error);
    }
  }

  /**
   * Get WindowsManager instance
   */
  getWindowsManager() {
    if (!this.featureManager) {
      logger.info('WindowsManager: FeatureManager not available');
      return null;
    }

    const windowsHandler = this.featureManager.getFeatureHandler('windowsManager');
    if (!windowsHandler) {
      logger.info('WindowsManager: WindowsHandler not available');
      return null;
    }

    if (!windowsHandler.getIsActive()) {
      logger.info('WindowsManager: WindowsHandler is not active');
      return null;
    }

    // Debug WindowsHandler state
    logger.info('WindowsManager: WindowsHandler available and active, checking getWindowsManager()');

    const windowsManager = windowsHandler.getWindowsManager();
    if (!windowsManager) {
      logger.info('WindowsManager: getWindowsManager() returned null', {
        hasGetWindowsManager: typeof windowsHandler.getWindowsManager === 'function',
        windowsHandlerMethods: Object.getOwnPropertyNames(windowsHandler).filter(name => typeof windowsHandler[name] === 'function')
      });
      return null;
    }

    return windowsManager;
  }

  /**
   * Check if text field icons are enabled in settings
   */
  async isTextFieldIconsEnabled() {
    try {
      const {
        getActiveSelectionIconOnTextfieldsAsync,
        getExtensionEnabledAsync,
        getTranslateOnTextSelectionAsync
      } = await import('@/shared/config/config.js');

      const activeSelectionIconEnabled = await getActiveSelectionIconOnTextfieldsAsync();
      const extensionEnabled = await getExtensionEnabledAsync();
      const translateOnTextSelection = await getTranslateOnTextSelectionAsync();

      // Only enable if all parent settings are also enabled
      return activeSelectionIconEnabled && extensionEnabled && translateOnTextSelection;
    } catch (error) {
      logger.warn('Error checking text field icons setting:', error);
      return false; // Default to disabled if can't check
    }
  }

  /**
   * Setup direct typing listener for text field icons
   * Simple and reliable approach: add one-time listener to detect first typing
   */
  _setupTypingListenerForIcon(textField, iconId) {
    if (!textField || !iconId) {
      logger.warn('Cannot setup typing listener - missing textField or iconId');
      return;
    }

    logger.debug('Setting up direct typing listener for icon', {
      textField: textField.tagName,
      iconId: iconId
    });

    // Create handler for first typing detection
    const handleFirstTyping = (event) => {
      // Make sure this is the same text field
      if (event.target === textField) {
        logger.debug('First typing detected in text field - dismissing icon', {
          textField: textField.tagName,
          iconId: iconId,
          eventType: event.type
        });

        // Dismiss the icon
        this._dismissIconForTyping(iconId);

        // Clean up listeners
        this._cleanupTypingListener(iconId);
      }
    };

    // Store listener info for cleanup
    this._typingListeners.set(iconId, {
      textField: textField,
      handlers: [handleFirstTyping]
    });

    // Add one-time listeners (both input and keydown for comprehensive coverage)
    textField.addEventListener('input', handleFirstTyping);
    textField.addEventListener('keydown', handleFirstTyping);

    logger.debug('Direct typing listener setup complete');
  }

  /**
   * Dismiss icon when user starts typing
   */
  _dismissIconForTyping(iconId) {
    try {
      const windowsManager = this.getWindowsManager();
      if (windowsManager && windowsManager.state.isIconMode) {
        logger.debug('Dismissing icon due to typing', { iconId });

        // Use WindowsManager to dismiss the icon
        windowsManager.dismiss();
      } else {
        logger.debug('Icon already dismissed or WindowsManager not available', { iconId });
      }
    } catch (error) {
      logger.error('Error dismissing icon for typing:', error);
    }
  }

  /**
   * Clean up typing listener for a specific icon
   */
  _cleanupTypingListener(iconId) {
    const listenerInfo = this._typingListeners.get(iconId);
    if (listenerInfo) {
      const { textField, handlers } = listenerInfo;

      // Remove all handlers from the text field
      handlers.forEach(handler => {
        textField.removeEventListener('input', handler);
        textField.removeEventListener('keydown', handler);
      });

      // Remove from tracking
      this._typingListeners.delete(iconId);

      logger.debug('Cleaned up typing listener', { iconId });
    }
  }

  /**
   * Clean up all typing listeners
   */
  _cleanupAllTypingListeners() {
    for (const iconId of this._typingListeners.keys()) {
      this._cleanupTypingListener(iconId);
    }
    logger.debug('All typing listeners cleaned up');
  }

  // Public API methods
  getStatus() {
    return {
      handlerActive: this.isActive,
      doubleClickProcessing: this.doubleClickProcessing,
      lastDoubleClickTime: this.lastDoubleClickTime,
      timeSinceLastDoubleClick: this.lastDoubleClickTime ? Date.now() - this.lastDoubleClickTime : null,
      typingDetection: {
        isActive: this.typingDetection.isActive,
        startTime: this.typingDetection.startTime,
        gracePeriod: this.typingDetection.gracePeriod,
        timeSinceStart: this.typingDetection.isActive ? Date.now() - this.typingDetection.startTime : null,
        detectedTextField: this.typingDetection.detectedTextField?.tagName || null,
        originalSelection: this.typingDetection.originalSelection?.substring(0, 50) || null
      }
    };
  }

  /**
   * Check if typing detection is currently active
   */
  isTypingDetectionActive() {
    return this.typingDetection.isActive &&
           Date.now() - this.typingDetection.startTime < this.typingDetection.gracePeriod;
  }

  /**
   * Check if a specific element is the current typing target
   */
  isTypingTarget(element) {
    return this.typingDetection.isActive &&
           this.typingDetection.detectedTextField === element;
  }
}

export default TextFieldDoubleClickHandler;