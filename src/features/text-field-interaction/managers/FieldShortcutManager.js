/**
 * FieldShortcutManager - Manages keyboard shortcuts for text field interactions
 * Handles Ctrl+/ shortcut for quick translation of focused text field content
 */

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { settingsManager } from '@/shared/managers/SettingsManager.js';
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import { MessageFormat, MessagingContexts } from "@/shared/messaging/core/MessagingCore.js";
import { sendMessage } from '@/shared/messaging/core/UnifiedMessaging.js';

export class FieldShortcutManager {
  constructor() {
    this.key = 'Ctrl+/';
    this.description = 'Translate text in active field using Ctrl+/ shortcut';
    this.translationHandler = null;
    this.featureManager = null;
    this.initialized = false;

    // Initialize logger
    this.logger = getScopedLogger(LOG_COMPONENTS.TEXT_FIELD_INTERACTION, 'FieldShortcutManager');
    this.logger.init('FieldShortcutManager initialized');
  }

  /**
   * Initialize with required dependencies
   * @param {Object} dependencies - Required dependencies
   */
  initialize(dependencies) {
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
    if (!this.initialized) {
      this.logger.debug('Not initialized');
      return false;
    }

    // Check if extension and shortcut are enabled
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

    // Check if active element is editable
    const activeElement = document.activeElement;
    if (!this.isEditableElement(activeElement)) {
      this.logger.debug('Active element is not editable');
      return false;
    }

    // Extract text from active element
    const text = this.extractTextFromElement(activeElement);
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
      // Get active element
      const activeElement = document.activeElement;

      // Extract text from active element
      const text = this.extractTextFromElement(activeElement);

      if (!text) {
        this.logger.debug('No text found in active element');
        return {
          success: false,
          error: 'No text found',
          type: 'ctrl-slash'
        };
      }

      this.logger.debug(`Translating text via Ctrl+/: "${text.substring(0, 50)}..."`);

      // Send translation request using UnifiedMessaging
      const message = MessageFormat.create(
        MessageActions.TRANSLATE,
        {
          text: text,
          provider: settingsManager.get('TRANSLATION_API', 'google-translate'),
          sourceLanguage: settingsManager.get('SOURCE_LANGUAGE', 'auto'),
          targetLanguage: settingsManager.get('TARGET_LANGUAGE', 'fa'),
          mode: 'field',
          options: {
            element: activeElement.tagName,
            fieldType: activeElement.type || 'text'
          }
        },
        MessagingContexts.CONTENT
      );

      // Use UnifiedMessaging with appropriate timeout
      const response = await sendMessage(message, { timeout: 15000 });

      if (response.success) {
        this.logger.debug('Translation completed successfully');
        return {
          success: true,
          type: 'ctrl-slash',
          textLength: text.length,
          target: activeElement.tagName
        };
      } else {
        this.logger.error('Translation failed:', response.error);
        return {
          success: false,
          error: response.error || 'Translation failed',
          type: 'ctrl-slash'
        };
      }

    } catch (error) {
      this.logger.error('Error in Ctrl+/ handler:', error);

      // Use centralized error handling
      const errorHandler = ErrorHandler.getInstance();
      await errorHandler.handle(error, {
        type: ErrorTypes.TRANSLATION_FAILED,
        context: 'ctrl-slash-shortcut',
        showToast: true
      });

      return {
        success: false,
        error: error.message || 'Shortcut execution failed',
        type: 'ctrl-slash'
      };
    }
  }

  /**
   * Check if element is editable
   * @param {Element} element - DOM element
   * @returns {boolean} Whether element is editable
   */
  isEditableElement(element) {
    if (!element) return false;

    if (element.tagName === 'INPUT') {
      const type = (element.type || '').toLowerCase();
      const textTypes = ['text', 'email', 'password', 'search', 'url', 'tel'];
      return textTypes.includes(type);
    }

    if (element.tagName === 'TEXTAREA') {
      return true;
    }

    if (element.contentEditable === 'true') {
      return true;
    }

    return false;
  }

  /**
   * Extract text from element
   * @param {Element} element - DOM element
   * @returns {string|null} Extracted text
   */
  extractTextFromElement(element) {
    if (!element) return null;

    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      return element.value || null;
    }

    if (element.contentEditable === 'true') {
      return element.textContent || null;
    }

    return null;
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

    this.featureManager = null;
    this.initialized = false;

    this.logger.debug('Cleaned up');
  }
}