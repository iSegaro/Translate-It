/**
 * EventCoordinator - Smart event routing system integrated with FeatureManager
 * 
 * Modernized to work with Smart Handler Registration system.
 * Now acts as a lightweight coordinator that delegates to FeatureManager
 * for handler management and feature activation.
 * 
 * Architecture:
 * - FeatureManager → Handles all feature lifecycle
 * - EventCoordinator → Routes events to active handlers only
 * - Backward Compatibility → Maintains existing API surface
 * 
 * Key Changes:
 * - No more manual exclusion checks
 * - No more manager creation
 * - Delegates to FeatureManager for handler access
 * - Simplified event routing
 */

import {
  state,
} from "@/shared/config/config.js";
import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { logMethod } from "../core/helpers.js";
import { clearAllCaches } from "@/shared/utils/text/extraction.js";
import { getTranslationString } from "../utils/i18n/i18n.js";

export default class EventCoordinator {
  /** @param {object} translationHandler
   * @param {FeatureManager} featureManager */
  constructor(translationHandler, featureManager) {
    this.translationHandler = translationHandler;
    this.featureManager = featureManager;
    this.notifier = translationHandler.notifier;
    this.strategies = translationHandler.strategies;
    this.isProcessing = translationHandler.isProcessing;
    this.logger = getScopedLogger(LOG_COMPONENTS.CORE, 'EventCoordinator');

    // Bind coordinator methods
    this.handleEvent = this.handleEvent.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);

    // Track Ctrl key state for coordination (minimal state)
    this.ctrlKeyPressed = false;

    // Note: No more manager creation here!
    // All managers are now handled by FeatureManager
    // EventCoordinator just routes events to active handlers

    this.logger.info('EventCoordinator initialized (Smart Handler Registration mode)');
  }

  /**
   * Set feature manager - backward compatibility
   */
  setFeatureManager(fm) {
    this.featureManager = fm;
  }

  /**
   * Main event coordination method
   * Routes events to active handlers managed by FeatureManager
   */
  @logMethod
  async handleEvent(event) {
    // If no FeatureManager available, skip all handling
    if (!this.featureManager) {
      // No FeatureManager available - logged at TRACE level for detailed debugging
      // this.logger.trace('No FeatureManager available, skipping event handling');
      return;
    }

    try {
      // Get active feature handlers from FeatureManager
      const selectElementManager = this.featureManager.getFeatureHandler('selectElement');
      const textSelectionHandler = this.featureManager.getFeatureHandler('textSelection');
      const textFieldIconHandler = this.featureManager.getFeatureHandler('textFieldIcon');

      // Check if select element is active (priority handling)
      if (selectElementManager?.isSelectElementActive?.()) {
        // Select element mode active - logged at TRACE level for detailed debugging
        // this.logger.trace('Select element mode is active - skipping other event handling');
        return; // Let SelectElementManager manage its own events
      }

      // === TEXT FIELD COORDINATION ===
      if (textFieldIconHandler?.isActive && this.isEditableElement(event.target)) {
        await this.coordinateTextFieldHandling(event, textFieldIconHandler);
        return;
      }

      // === TEXT SELECTION COORDINATION ===
      if (textSelectionHandler?.isActive && this.isMouseUp(event)) {
        await this.coordinateTextSelection(event, textSelectionHandler);
        return;
      }

    } catch (rawError) {
      await this.handleCoordinationError(rawError, event);
    }
  }

  /**
   * Coordinate text field handling
   * Delegates to active TextFieldIconHandler with error boundary
   */
  async coordinateTextFieldHandling(event, textFieldIconHandler) {
    try {
      if (state.activeTranslateIcon) return;

      const target = event.target;
      const textFieldManager = textFieldIconHandler.getTextFieldIconManager();
      
      if (!textFieldManager) {
        // No TextFieldIconManager available - logged at TRACE level for detailed debugging
        // this.logger.trace('No TextFieldIconManager available in handler');
        return;
      }

      // Delegate based on event type
      if (event.type === 'focus') {
        return await textFieldManager.handleEditableFocus?.(target);
      } else if (event.type === 'blur') {
        return textFieldManager.handleEditableBlur?.(target);
      } else {
        event.stopPropagation();
        return await textFieldManager.processEditableElement?.(target);
      }
      
    } catch (error) {
      this.logger.error('Error in text field coordination:', error);
      await this.handleCoordinationError(error, event, 'text-field-coordination');
    }
  }

  /**
   * Coordinate text selection handling
   * Delegates to active TextSelectionHandler with error boundary
   */
  async coordinateTextSelection(event, textSelectionHandler) {
    try {
      const textSelectionManager = textSelectionHandler.getSelectionManager();
      
      if (!textSelectionManager) {
        // No TextSelectionManager available - logged at TRACE level for detailed debugging
        // this.logger.trace('No TextSelectionManager available in handler');
        return;
      }

      // Check if Ctrl requirement is satisfied
      if (typeof textSelectionManager.shouldProcessTextSelection === 'function') {
        const shouldProcess = await textSelectionManager.shouldProcessTextSelection(event);
        if (!shouldProcess) return;
      }

      // Delegate to TextSelectionManager
      if (typeof textSelectionManager.handleTextSelection === 'function') {
        await textSelectionManager.handleTextSelection(event);
      }
      
    } catch (error) {
      this.logger.error('Error in text selection coordination:', error);
      await this.handleCoordinationError(error, event, 'text-selection-coordination');
    }
  }

  /**
   * Centralized error handling for coordination
   */
  async handleCoordinationError(rawError, event, context = 'event-coordination') {
    const error = await ErrorHandler.processError(rawError);
    await this.translationHandler.errorHandler.handle(error, {
      type: ErrorTypes.UI,
      context: context,
      eventType: event?.type,
      targetTag: event?.target?.tagName,
    });
  }

  // === UTILITY METHODS ===
  isMouseUp(event) {
    return event.type === "mouseup";
  }

  isEditableElement(element) {
    if (!element) return false;
    
    const tagName = element.tagName?.toLowerCase();
    const type = element.type?.toLowerCase();
    
    // Check for input elements
    if (tagName === 'input') {
      const textTypes = ['text', 'email', 'password', 'search', 'url', 'tel', 'number'];
      return !type || textTypes.includes(type);
    }
    
    // Check for textarea
    if (tagName === 'textarea') return true;
    
    // Check for contenteditable elements
    if (element.contentEditable === 'true') return true;
    
    return false;
  }

  // === KEY STATE MANAGEMENT (minimal, for coordination only) ===
  handleKeyDown(event) {
    if (
      event.key === "Control" ||
      event.key === "Meta" ||
      event.ctrlKey ||
      event.metaKey
    ) {
      this.ctrlKeyPressed = true;
      
      // Update active TextSelectionManager key state if available
      const textSelectionHandler = this.featureManager?.getFeatureHandler('textSelection');
      if (textSelectionHandler?.isActive) {
        const textSelectionManager = textSelectionHandler.getSelectionManager();
        if (textSelectionManager && typeof textSelectionManager.updateCtrlKeyState === 'function') {
          textSelectionManager.updateCtrlKeyState(true);
        }
      }
    }
  }

  handleKeyUp(event) {
    if (event.key === "Control" || event.key === "Meta") {
      // تأخیر کوتاه برای اطمینان از اینکه mouseup event پردازش شده
      setTimeout(() => {
        this.ctrlKeyPressed = false;
        
        // Update active TextSelectionManager key state if available
        const textSelectionHandler = this.featureManager?.getFeatureHandler('textSelection');
        if (textSelectionHandler?.isActive) {
          const textSelectionManager = textSelectionHandler.getSelectionManager();
          if (textSelectionManager && typeof textSelectionManager.updateCtrlKeyState === 'function') {
            textSelectionManager.updateCtrlKeyState(false);
          }
        }
      }, 50);
    }
  }

  // === BACKWARD COMPATIBILITY METHODS ===
  
  /**
   * @deprecated - Now delegated to FeatureManager handlers
   * Kept for backward compatibility
   */
  handleEditableFocus(element) {
    const textFieldHandler = this.featureManager?.getFeatureHandler('textFieldIcon');
    if (textFieldHandler?.isActive) {
      const manager = textFieldHandler.getTextFieldIconManager();
      return manager?.handleEditableFocus?.(element) || null;
    }
    return null;
  }

  /**
   * @deprecated - Now handled by coordinateTextFieldHandling()
   * Kept for backward compatibility
   */
  async handleEditableElement(event) {
    const textFieldHandler = this.featureManager?.getFeatureHandler('textFieldIcon');
    if (textFieldHandler?.isActive) {
      return await this.coordinateTextFieldHandling(event, textFieldHandler);
    }
  }

  /**
   * @deprecated - Now delegated to FeatureManager handlers
   * Kept for backward compatibility
   */
  handleEditableBlur(element) {
    const textFieldHandler = this.featureManager?.getFeatureHandler('textFieldIcon');
    if (textFieldHandler?.isActive) {
      const manager = textFieldHandler.getTextFieldIconManager();
      if (manager?.handleEditableBlur) {
        manager.handleEditableBlur(element);
      }
    }
  }

  /**
   * @deprecated - Now delegated to FeatureManager handlers
   * Kept for backward compatibility
   */
  _processEditableElement(element) {
    const textFieldHandler = this.featureManager?.getFeatureHandler('textFieldIcon');
    if (textFieldHandler?.isActive) {
      const manager = textFieldHandler.getTextFieldIconManager();
      return manager?.processEditableElement?.(element) || null;
    }
    return null;
  }

  // === COMPATIBILITY GETTERS ===
  get textSelectionManager() {
    const handler = this.featureManager?.getFeatureHandler('textSelection');
    return handler?.isActive ? handler.getSelectionManager() : null;
  }

  get textFieldManager() {
    const handler = this.featureManager?.getFeatureHandler('textFieldIcon');
    return handler?.isActive ? handler.getTextFieldIconManager() : null;
  }

  get selectElementManager() {
    const handler = this.featureManager?.getFeatureHandler('selectElement');
    return handler?.isActive ? handler.getSelectElementManager() : null;
  }

  // === CACHE MANAGEMENT ===
  async cleanCache() {
    clearAllCaches({ state });
    this.notifier.show(
      (await getTranslationString("STATUS_REMOVE_MEMORY")) || "Memory Cleared",
      "info",
      true,
      2000,
    );
  }

  // Note: Select element handling completely removed
  // SelectElementManager handles all select element clicks directly via its own event listeners


  // Note: ESC key handling completely removed from EventCoordinator
  // All ESC functionality is handled by specialized managers:
  // - SelectElementManager: Handles ESC in select mode
  // - ShortcutManager/RevertShortcut: Handles ESC for translation revert
}
