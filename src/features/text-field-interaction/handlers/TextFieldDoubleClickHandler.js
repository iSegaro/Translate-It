import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

const logger = getScopedLogger(LOG_COMPONENTS.TEXT_FIELD_INTERACTION, 'TextFieldDoubleClickHandler');

/**
 * Text Field Double Click Handler
 *
 * Handles double-click events specifically for text fields and editable elements.
 * This is separate from page text selection to keep concerns separated.
 *
 * Features:
 * - Double-click detection in text fields
 * - Professional editor support (Google Docs, etc.)
 * - Text selection and position calculation
 * - Integration with WindowsManager
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
    this.doubleClickWindow = 500; // 500ms window

    // Bind methods
    this.handleDoubleClick = this.handleDoubleClick.bind(this);
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

      // ResourceTracker will handle event listener cleanup
      this.cleanup();

      this.isActive = false;
      logger.info('TextFieldDoubleClickHandler deactivated successfully');
      return true;

    } catch (error) {
      logger.error('Error deactivating TextFieldDoubleClickHandler:', error);
      try {
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
   * Handle double-click events on text fields
   */
  async handleDoubleClick(event) {
    if (!this.isActive) return;

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
      const textTypes = ['text', 'email', 'password', 'search', 'url', 'tel'];
      return textTypes.includes(type);
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
    try {
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
   * Calculate position for text field translation UI
   */
  calculateTextFieldPosition(event, actualTextField = null) {
    try {
      // Use actual text field element if provided, otherwise use event target
      const element = actualTextField || event.target;
      const rect = element.getBoundingClientRect();

      // Use double-click position if available
      if (event.clientX && event.clientY) {
        return {
          x: event.clientX + window.scrollX,
          y: event.clientY + window.scrollY + 25
        };
      }

      // Fallback to element position
      return {
        x: rect.left + rect.width / 2 + window.scrollX,
        y: rect.bottom + 10 + window.scrollY
      };

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
   * Show translation UI
   */
  async showTranslationUI(selectedText, position) {
    // Check if WindowsManager should be allowed
    if (!(await this.shouldProcessWindowsManager())) {
      logger.info('WindowsManager is blocked by exclusion, skipping text field translation UI');
      return;
    }

    // Get WindowsManager directly from FeatureManager
    const windowsManager = this.getWindowsManager();
    if (!windowsManager) {
      logger.warn('WindowsManager not available');
      return;
    }

    logger.debug('Showing translation UI for text field', {
      text: selectedText.substring(0, 30) + '...',
      position
    });

    // For text fields, always show icon first regardless of user's selectionTranslationMode setting
    // This provides consistent behavior for text field interactions
    await windowsManager._showIcon(selectedText, position);
  }

  /**
   * Get WindowsManager instance
   */
  getWindowsManager() {
    if (!this.featureManager) {
      return null;
    }

    const windowsHandler = this.featureManager.getFeatureHandler('windowsManager');
    if (!windowsHandler || !windowsHandler.getIsActive()) {
      return null;
    }

    return windowsHandler.getWindowsManager();
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