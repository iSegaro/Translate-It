/**
 * FieldShortcutManager - Manages keyboard shortcuts for text field interactions
 * Handles Ctrl+/ shortcut for quick translation of focused text field content
 */

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { isEditable } from "@/core/helpers.js";
import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { settingsManager } from '@/shared/managers/SettingsManager.js';

export class FieldShortcutManager {
  constructor() {
    this.key = 'Ctrl+/';
    this.description = 'Translate text in active field using Ctrl+/ shortcut';
    this.translationHandler = null;
    this.featureManager = null;
    this.initialized = false;

    // Initialize logger
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'FieldShortcutManager');
    this.logger.init('FieldShortcutManager initialized');
  }

  /**
   * Initialize with required dependencies
   * @param {Object} dependencies - Required dependencies
   */
  initialize(dependencies) {
    this.translationHandler = dependencies.translationHandler;
    this.featureManager = dependencies.featureManager;
    this.initialized = true;

    // Listen for settings changes
    this._settingsUnsubscribe = settingsManager.onChange('ENABLE_SHORTCUT_FOR_TEXT_FIELDS', (newValue) => {
      this.logger.debug('ENABLE_SHORTCUT_FOR_TEXT_FIELDS changed:', newValue);
    }, 'field-shortcut-manager');

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

    // Check if extension and feature are enabled
    const isExtensionEnabled = settingsManager.get('EXTENSION_ENABLED', false);
    const isShortcutEnabled = settingsManager.get('ENABLE_SHORTCUT_FOR_TEXT_FIELDS', false);

    if (!isExtensionEnabled) {
      this.logger.debug('Extension is disabled');
      return false;
    }

    if (!isShortcutEnabled) {
      this.logger.debug('ENABLE_SHORTCUT_FOR_TEXT_FIELDS feature is disabled');
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
      type: 'FieldShortcutManager',
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
    // Unsubscribe from settings changes
    if (this._settingsUnsubscribe) {
      this._settingsUnsubscribe();
      this._settingsUnsubscribe = null;
    }

    this.translationHandler = null;
    this.featureManager = null;
    this.initialized = false;

    this.logger.debug('Cleaned up');
  }
}