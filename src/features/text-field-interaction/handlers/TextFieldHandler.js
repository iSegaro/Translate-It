import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { TextFieldIconManager } from '../managers/TextFieldIconManager.js';
import { TextFieldDoubleClickHandler } from './TextFieldDoubleClickHandler.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import ElementDetectionService from '@/shared/services/ElementDetectionService.js';

const logger = getScopedLogger(LOG_COMPONENTS.TEXT_FIELD_INTERACTION, 'TextFieldHandler');

/**
 * Unified Text Field Handler
 *
 * Combines both text field icon management (focus/blur) and double-click handling
 * for a complete text field interaction system.
 *
 * Features:
 * - Text field icon management (focus/blur events)
 * - Double-click text selection in text fields
 * - Professional editor support
 * - Platform-specific strategies
 */
export class TextFieldHandler extends ResourceTracker {
  constructor(options = {}) {
    super('text-field-handler');

    this.isActive = false;
    this.featureManager = options.featureManager;

    // Sub-handlers
    this.textFieldIconManager = null;
    this.doubleClickHandler = null;

    // Event handlers
    this.focusHandler = null;
    this.blurHandler = null;
    this.inputHandler = null;

    // Element detection service
    this.elementDetection = ElementDetectionService;
  }

  async activate() {
    if (this.isActive) {
      logger.debug('TextFieldHandler already active');
      return true;
    }

    try {
      logger.debug('Activating TextFieldHandler');

      // Initialize text field icon manager
      this.textFieldIconManager = TextFieldIconManager.getInstance();
      await this.initializeIconManager();

      // Initialize double-click handler
      this.doubleClickHandler = new TextFieldDoubleClickHandler({
        featureManager: this.featureManager
      });
      await this.doubleClickHandler.activate();

      // Setup text field listeners (focus/blur/input)
      this.setupTextFieldListeners();

      // Note: TextFieldIconManager is already a ResourceTracker and handles its own cleanup
      // We just need to null our reference when we're deactivated

      // Note: TextFieldDoubleClickHandler is already a ResourceTracker and handles its own cleanup
      // We just need to null our reference when we're deactivated

      this.isActive = true;
      logger.info('TextFieldHandler activated successfully');
      return true;

    } catch (error) {
      const handler = ErrorHandler.getInstance();
      handler.handle(error, {
        type: ErrorTypes.SERVICE,
        context: 'TextFieldHandler-activate',
        showToast: false
      });
      return false;
    }
  }

  async deactivate() {
    if (!this.isActive) {
      logger.debug('TextFieldHandler not active');
      return true;
    }

    try {
      logger.debug('Deactivating TextFieldHandler');

      // For singleton TextFieldIconManager, we don't destroy it but just clear our reference
      // The singleton will be destroyed when the feature is globally disabled
      this.textFieldIconManager = null;

      if (this.doubleClickHandler && typeof this.doubleClickHandler.deactivate === 'function') {
        await this.doubleClickHandler.deactivate();
      }
      this.doubleClickHandler = null;

      // ResourceTracker will handle cleanup
      this.cleanup();

      this.isActive = false;
      logger.info('TextFieldHandler deactivated successfully');
      return true;

    } catch (error) {
      logger.error('Error deactivating TextFieldHandler:', error);
      try {
        this.textFieldIconManager = null;
        this.doubleClickHandler = null;
        this.cleanup();
        this.isActive = false;
        return true;
      } catch (cleanupError) {
        logger.error('Critical: TextFieldHandler cleanup failed:', cleanupError);
        return false;
      }
    }
  }

  async initializeIconManager() {
    try {
      // Import translation handler dynamically to avoid circular dependencies
      const { getTranslationHandlerInstance } = await import('@/core/InstanceManager.js');
      const translationHandler = getTranslationHandlerInstance();

      if (translationHandler) {
        this.textFieldIconManager.initialize({
          translationHandler: translationHandler
        });
        logger.debug('TextFieldIconManager initialized with translationHandler');
      } else {
        this.textFieldIconManager.initialize();
        logger.warn('TextFieldIconManager initialized without translationHandler');
      }
    } catch (error) {
      logger.error('Failed to initialize TextFieldIconManager:', error);
      this.textFieldIconManager.initialize();
    }
  }

  setupTextFieldListeners() {
    try {
      // Focus handler - show icon when text field is focused
      this.focusHandler = async (event) => {
        if (!this.isActive) return;

        const element = event.target;
        if (this.isEditableElement(element)) {
          // Text field focused - logged at TRACE level for detailed debugging
          // logger.trace('Text field focused:', element.tagName, element.type || 'contenteditable');

          // Add icon with a small delay
          setTimeout(async () => {
            if (document.activeElement === element && this.textFieldIconManager) {
              try {
                if (this.textFieldIconManager) {
                  await this.textFieldIconManager.processEditableElement(element);
                }
              } catch (error) {
                const handler = ErrorHandler.getInstance();
                await handler.handle(error, {
                  context: 'TextFieldHandler-focus',
                  showToast: false,
                  showInUI: false
                });
              }
            }
          }, 100);
        }
      };

      // Blur handler - hide icon when text field loses focus
      this.blurHandler = async (event) => {
        if (!this.isActive) return;

        const element = event.target;
        if (this.isEditableElement(element)) {
          // Text field blurred - logged at TRACE level for detailed debugging
          // logger.trace('Text field blurred:', element.tagName);

          setTimeout(() => {
            // Check if focus moved to a translation-related element before cleanup
            const activeElement = document.activeElement;
            const isTranslationElement = activeElement && (
              this.elementDetection.isUIElement(activeElement) ||
              (this.textFieldIconManager?.state && this.textFieldIconManager.state.preventTextFieldIconCreation)
            );

            if (document.activeElement !== element &&
                this.textFieldIconManager &&
                !isTranslationElement) {
              this.textFieldIconManager.cleanupElement(element);
            } else if (isTranslationElement) {
              logger.debug('Focus moved to translation element, skipping cleanup');
            }
          }, 200); // Increased delay to match TextFieldIconManager timing
        }
      };

      // Input handler - update icon position on content changes
      this.inputHandler = async (event) => {
        if (!this.isActive) return;

        const element = event.target;
        if (this.textFieldIconManager && this.isEditableElement(element)) {
          clearTimeout(this.positionUpdateTimeout);
          this.positionUpdateTimeout = setTimeout(() => {
            if (document.activeElement === element && this.textFieldIconManager) {
              // Position updates handled internally by manager
            }
          }, 200);
        }
      };

      // Register event listeners
      this.addEventListener(document, 'focusin', this.focusHandler, { capture: true, critical: true });
      this.addEventListener(document, 'focusout', this.blurHandler, { capture: true, critical: true });
      this.addEventListener(document, 'input', this.inputHandler, { capture: true, critical: true });

      // Listen for resize and scroll events
      this.addEventListener(window, 'resize', () => {
        if (this.textFieldIconManager) {
          this.textFieldIconManager.forceUpdateAllPositions();
        }
      }, { critical: true });

      // Disabled scroll handler to keep icon fixed during scroll
      // this.addEventListener(document, 'scroll', () => {
      //   if (this.textFieldIconManager) {
      //     clearTimeout(this.scrollUpdateTimeout);
      //     this.scrollUpdateTimeout = setTimeout(() => {
      //       if (this.textFieldIconManager) {
      //         this.textFieldIconManager.forceUpdateAllPositions();
      //       }
      //     }, 100);
      //   }
      // }, { passive: true, critical: true });

      // Track timeout for cleanup
      this.trackResource('position-update-timeout', () => {
        clearTimeout(this.positionUpdateTimeout);
      });

      logger.debug('Text field listeners setup complete');

    } catch (error) {
      logger.error('Failed to setup text field listeners:', error);
    }
  }

  /**
   * Check if element is editable (shared with double-click handler)
   */
  isEditableElement(element) {
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

  // Public API methods
  getTextFieldIconManager() {
    return this.textFieldIconManager;
  }

  getDoubleClickHandler() {
    return this.doubleClickHandler;
  }

  hasActiveIcons() {
    return this.textFieldIconManager?.activeIcons?.size > 0 || false;
  }

  getActiveIconsCount() {
    return this.textFieldIconManager?.activeIcons?.size || 0;
  }

  getManager() {
    return this.textFieldIconManager;
  }

  cleanupAllIcons() {
    if (this.textFieldIconManager) {
      this.textFieldIconManager.cleanup();
    }
  }

  async addIconToCurrentField() {
    if (!this.isActive || !this.textFieldIconManager) return false;

    const activeElement = document.activeElement;
    if (this.isEditableElement(activeElement)) {
      if (this.textFieldIconManager) {
        await this.textFieldIconManager.processEditableElement(activeElement);
        return true;
      }
    }

    return false;
  }

  getStatus() {
    return {
      handlerActive: this.isActive,
      activeIcons: this.getActiveIconsCount(),
      iconManagerAvailable: !!this.textFieldIconManager,
      doubleClickHandlerActive: this.doubleClickHandler?.isActive || false,
      currentFocusIsEditable: this.isEditableElement(document.activeElement),
      doubleClickStatus: this.doubleClickHandler?.getStatus() || null
    };
  }
}

export default TextFieldHandler;