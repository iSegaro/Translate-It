import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { ExtensionContextManager } from '@/core/extensionContext.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'TextFieldDoubleClickHandler');

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

    logger.debug('Double-click detected', {
      target: target?.tagName,
      timestamp: Date.now(),
      isTextField: this.isTextField(target)
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
    const hostname = window.location.hostname;

    // Google Docs
    if (hostname.includes('docs.google.com')) {
      return element.closest('[contenteditable="true"]') ||
             element.closest('.kix-page');
    }

    // Microsoft Office Online
    if (hostname.includes('office.live.com') || hostname.includes('office.com')) {
      return element.closest('[contenteditable="true"]');
    }

    // Zoho Writer
    if (hostname.includes('writer.zoho.com')) {
      return element.closest('.zw-line-div') ||
             element.closest('.zw-text-portion') ||
             element.closest('#editorpane');
    }

    // WPS Office
    if (hostname.includes('wps.com')) {
      return element.closest('[contenteditable="true"]');
    }

    // Notion
    if (hostname.includes('notion.so')) {
      return element.closest('[contenteditable="true"]') ||
             element.closest('.notion-text-block');
    }

    return false;
  }

  /**
   * Process text field double-click
   */
  async processTextFieldDoubleClick(event) {
    try {
      // Get selected text
      const selectedText = await this.getSelectedTextFromField(event.target);

      if (!selectedText || !selectedText.trim()) {
        logger.debug('No text selected in text field');
        return;
      }

      logger.debug('Processing text field selection', {
        text: selectedText.substring(0, 30) + '...',
        target: event.target?.tagName
      });

      // Calculate position
      const position = this.calculateTextFieldPosition(event);

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
  async detectTextUsingSiteHandler(element) {
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
  calculateTextFieldPosition(event) {
    try {
      const element = event.target;
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
   * Show translation UI
   */
  async showTranslationUI(selectedText, position) {
    const windowsManager = this.getWindowsManager();

    if (windowsManager) {
      logger.debug('Showing translation UI for text field', {
        text: selectedText.substring(0, 30) + '...',
        position
      });

      await windowsManager.show(selectedText, position);
    } else {
      logger.warn('WindowsManager not available for text field translation');
    }
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
      const { getActiveSelectionIconOnTextfieldsAsync } = await import('@/shared/config/config.js');
      return await getActiveSelectionIconOnTextfieldsAsync();
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