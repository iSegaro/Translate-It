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

    // Store last clicked element for position estimation
    this.lastClickedElement = null;
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
      await this.showTranslationUI(selectedText, position);

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
   * Calculate position for text field translation UI using IframePositionCalculator
   *
   * This method handles position calculation for both main frame and iframe contexts.
   * It uses the centralized IframePositionCalculator which implements multiple strategies:
   *
   * 1. Direct iframe access (same-origin only)
   * 2. Visual Viewport API
   * 3. Mouse tracking (cross-origin reliable)
   * 4. Enhanced estimation using element bounds
   * 5. Conservative fallback
   *
   * @param {Event} event - Double-click event containing client coordinates
   * @param {Element|null} actualTextField - The actual text field element (may differ from event.target)
   * @returns {Object|null} Position object with x, y coordinates or null if calculation fails
   */
  calculateTextFieldPosition(event, actualTextField = null) {
    try {
      // Use actual text field element if provided, otherwise use event target
      const element = actualTextField || event.target;
      const rect = element.getBoundingClientRect();

      let clientX, clientY;
      let isFromMouseEvent = false;

      // Priority 1: Use double-click mouse position (most accurate for text fields)
      if (event.clientX && event.clientY) {
        clientX = event.clientX;
        clientY = event.clientY;
        isFromMouseEvent = true;
      } else {
        // Priority 2: Fallback to element-based position (same as SelectionManager)
        clientX = rect.left + rect.width / 2;
        clientY = rect.bottom;
        isFromMouseEvent = false;
      }

      // Delegate position calculation to IframePositionCalculator
      // This handles iframe conversion automatically with multiple fallback strategies
      const position = this.positionCalculator.calculatePosition(clientX, clientY, {
        isFromMouseEvent,
        actualElement: element,
      });

      logger.debug('Calculated text field position', {
        elementRect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        },
        clientCoords: { x: clientX, y: clientY },
        calculatedPosition: position,
        scrollOffset: { x: window.scrollX, y: window.scrollY },
        isInIframe: window !== window.top,
        strategy: position?.strategy || 'unknown'
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
  async showTranslationUI(selectedText, position) {
    // Check if WindowsManager should be allowed
    if (!(await this.shouldProcessWindowsManager())) {
      logger.info('WindowsManager is blocked by exclusion, skipping text field translation UI');
      return;
    }

    // Use the same approach as TextSelection system
    if (window !== window.top) {
      // Iframe - request window creation in main frame (same as SelectionManager)
      this.requestWindowCreationInMainFrame(selectedText, position);
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
      } else {
        logger.warn('WindowsManager not available in main frame');
      }
    }
  }

  /**
   * Request window creation in main frame (copied from SelectionManager)
   */
  requestWindowCreationInMainFrame(selectedText, position) {
    try {
      // Import WindowsConfig for message types
      import('@/features/windows/managers/core/WindowsConfig.js').then(({ WindowsConfig }) => {
        const message = {
          type: IFRAME_CONFIG.MESSAGE_TYPES.TEXT_SELECTION_WINDOW_REQUEST,
          frameId: ConfigUtils.generateFrameId(),
          selectedText: selectedText,
          position: position,
          timestamp: Date.now()
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

  // Public API methods
  getStatus() {
    return {
      handlerActive: this.isActive,
      doubleClickProcessing: this.doubleClickProcessing,
      lastDoubleClickTime: this.lastDoubleClickTime,
      timeSinceLastDoubleClick: this.lastDoubleClickTime ? Date.now() - this.lastDoubleClickTime : null
    };
  }
}

export default TextFieldDoubleClickHandler;