/**
 * Ctrl+/ Shortcut - Translate text in active field handler
 * Extracted from EventHandler for modular keyboard shortcut management
 */

import { getScopedLogger } from "../../../utils/core/logger.js";
import { LOG_COMPONENTS } from "../../../utils/core/logConstants.js";
import { isEditable } from "../../../utils/core/helpers.js";
import { ErrorHandler } from "../../../error-management/ErrorService.js";
import { ErrorTypes } from "../../../error-management/ErrorTypes.js";

export class CtrlSlashShortcut {
  constructor() {
    this.key = 'Ctrl+/';
    this.description = 'Translate text in active field using Ctrl+/ shortcut';
    this.translationHandler = null;
    this.featureManager = null;
    this.initialized = false;
    
    // Initialize logger
  this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'CtrlSlashShortcut');
    this.logger.init('CtrlSlashShortcut initialized');
  }

  /**
   * Initialize with required dependencies
   * @param {Object} dependencies - Required dependencies
   */
  initialize(dependencies) {
    this.translationHandler = dependencies.translationHandler;
    this.featureManager = dependencies.featureManager;
    this.initialized = true;
    
    this.logger.debug('Initialized with dependencies');
  }

  /**
   * Check if shortcut should be executed
   * @param {KeyboardEvent} event - Keyboard event
   * @returns {Promise<boolean>} Whether to execute the shortcut
   */
  async shouldExecute(event) {
    // Only execute on Ctrl+/ combination
    if (!this.isCtrlSlashEvent(event)) {
      return false;
    }

    // Check if required dependencies are available
    if (!this.initialized || !this.translationHandler) {
      this.logger.debug('Not initialized or missing translationHandler');
      return false;
    }

    // Check if feature is enabled (SHORTCUT_TEXT_FIELDS)
    if (!this.featureManager?.isOn("SHORTCUT_TEXT_FIELDS")) {
      this.logger.debug('SHORTCUT_TEXT_FIELDS feature is disabled');
      return false;
    }

    // Check if translation is already in progress
    if (this.translationHandler.isProcessing) {
      this.logger.debug('Translation already in progress');
      return false;
    }

    // Check if active element is editable
    const { activeElement } = this.translationHandler.getSelectElementContext();
    if (!isEditable(activeElement)) {
      this.logger.debug('Active element is not editable');
      return false;
    }

    // Extract text from active element
    const text = this.translationHandler.extractFromActiveElement(activeElement);
    if (!text) {
      this.logger.debug('No text found in active element');
      return false;
    }

    this.logger.debug('All conditions met, ready to execute');
    return true;
  }

  /**
   * Execute the Ctrl+/ shortcut
   * @param {KeyboardEvent} event - Keyboard event
   * @returns {Promise<Object>} Execution result
   */
  async execute() {
    this.logger.debug('Executing Ctrl+/ shortcut');

    try {
      // Set processing flag
      this.translationHandler.isProcessing = true;

      // Get active element context
      const { activeElement } = this.translationHandler.getSelectElementContext();
      
      // Extract text from active element
      const text = this.translationHandler.extractFromActiveElement(activeElement);

      this.logger.debug(`Processing translation for text: "${text.substring(0, 50)}..."`);

      // Process translation using TranslationHandler
      // Note: Future enhancement could support selected text within field
      await this.translationHandler.processTranslation_with_CtrlSlash({
        text,
        originalText: text,
        target: activeElement,
        selectionRange: null, // Currently not supporting selection within field
      });

      this.logger.debug('Translation completed successfully');

      return {
        success: true,
        type: 'ctrl-slash',
        textLength: text.length,
        target: activeElement.tagName
      };

    } catch (error) {
      this.logger.error('Error during translation:', error);

      // Process error using ErrorHandler
      const errorHandle = await ErrorHandler.processError(error);
      
      if (!errorHandle.isFinal && !errorHandle.originalError?.isPrimary) {
        const errorType = errorHandle.type || ErrorTypes.API;
        const statusCode = errorHandle.statusCode || 500;

        // Handle error using TranslationHandler's error system
        await this.translationHandler.errorHandler.handle(errorHandle, {
          type: errorType,
          statusCode: statusCode,
          context: "ctrl-slash-shortcut",
          suppressSecondary: true,
        });
      }

      return {
        success: false,
        error: errorHandle.message || 'Shortcut execution failed',
        type: 'ctrl-slash'
      };

    } finally {
      // Always reset processing flag
      if (this.translationHandler) {
        this.translationHandler.isProcessing = false;
      }
    }
  }

  /**
   * Check if event is Ctrl+/ combination
   * @param {KeyboardEvent} event - Keyboard event
   * @returns {boolean} Whether event is Ctrl+/
   */
  isCtrlSlashEvent(event) {
    return (
      (event.ctrlKey || event.metaKey) && 
      event.key === "/" && 
      !event.repeat
    );
  }

  /**
   * Get shortcut description
   * @returns {string} Description
   */
  getDescription() {
    return this.description;
  }

  /**
   * Get shortcut info
   * @returns {Object} Shortcut info
   */
  getInfo() {
    return {
      key: this.key,
      description: this.description,
      type: 'CtrlSlashShortcut',
      initialized: this.initialized,
      triggers: [
        'Ctrl+/ or Cmd+/ in editable fields',
        'Requires SHORTCUT_TEXT_FIELDS feature enabled',
        'Requires text content in active field'
      ],
      dependencies: {
        translationHandler: !!this.translationHandler,
        featureManager: !!this.featureManager
      }
    };
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.translationHandler = null;
    this.featureManager = null;
    this.initialized = false;
    
    this.logger.debug('Cleaned up');
  }
}