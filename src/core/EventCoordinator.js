/**
 * EventCoordinator - Lightweight event routing system
 * 
 * Evolved from the legacy EventHandler to focus purely on coordination.
 * Routes events to appropriate specialized managers while maintaining
 * backward compatibility with existing integrations.
 * 
 * Architecture:
 * - Text Selection → TextSelectionManager
 * - Text Fields → TextFieldManager  
 * - Select Element → SelectElementManager (fully delegated)
 * - Keyboard Shortcuts → ShortcutManager (handled in content-scripts)
 * - Error Handling → Centralized error boundary
 */

import {
  state,
} from "@/shared/config/config.js";
import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { logMethod } from "../core/helpers.js";
import { clearAllCaches } from "../utils/text/extraction.js";
import { WindowsManager as SelectionWindows } from '@/features/windows/managers/WindowsManager.js';
import { getTranslationString } from "../utils/i18n/i18n.js";
import { TextSelectionManager } from "@/core/managers/content/TextSelectionManager.js";
import { TextFieldIconManager } from "@/features/text-field-interaction/managers/TextFieldIconManager.js";
import { selectElementManager } from '@/features/element-selection/managers/SelectElementManager.js';
import { WindowsManager } from '@/features/windows/managers/WindowsManager.js';

export default class EventCoordinator {
  /** @param {object} translationHandler
   * @param {FeatureManager} featureManager */
  constructor(translationHandler, featureManager) {
    this.translationHandler = translationHandler;
    this.featureManager = featureManager;
    this.notifier = translationHandler.notifier;
    this.strategies = translationHandler.strategies;
    this.isProcessing = translationHandler.isProcessing;
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'EventCoordinator');
    // Initialize WindowsManager for text selection manager (main frame only)
    if (window !== window.top) {
      this.logger.debug('Skipping WindowsManager creation in iframe context');
      this.windowsManager = null;
    } else {
      this.logger.debug('Creating WindowsManager instance in main frame...');
      this.windowsManager = new WindowsManager({});
      this.logger.debug('WindowsManager instance created successfully in main frame');
    }

    // Note: UnifiedMessenger removed - SelectElementManager handles its own messaging
    
    // Initialize specialized managers
    this.textSelectionManager = new TextSelectionManager({
      windowsManager: this.windowsManager, // null in iframe, which is handled by TextSelectionManager
      notifier: translationHandler.notifier,
    });

    this.textFieldManager = new TextFieldIconManager({
      translationHandler: translationHandler,
      notifier: translationHandler.notifier,
      strategies: translationHandler.strategies,
      featureManager: featureManager,
    });

    // Debug: Check if translation handler is properly set
    this.logger.debug('TextFieldIconManager created with translationHandler:', {
      hasTranslationHandler: !!this.textFieldManager.translationHandler,
      hasProcessMethod: this.textFieldManager.translationHandler && 
                       typeof this.textFieldManager.translationHandler.processTranslation_with_CtrlSlash === 'function'
    });

    // Bind coordinator methods
    this.handleEvent = this.handleEvent.bind(this);

    // Track Ctrl key state for coordination (minimal state)
    this.ctrlKeyPressed = false;
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);

    this.selectElementManager = selectElementManager;

    this.logger.init('EventCoordinator initialized with specialized managers');
  }

  /**
   * Set feature manager - backward compatibility
   */
  setFeatureManager(fm) {
    this.featureManager = fm;
    // Update managers with new feature manager
    if (this.textFieldManager) {
      this.textFieldManager.featureManager = fm;
    }
  }

  /**
   * Main event coordination method
   * Routes events to appropriate managers based on event type and context
   */
  @logMethod
  async handleEvent(event) {
    // When SelectElementManager is active, only handle clicks if they're not handled by SelectElementManager
    if (this.selectElementManager?.isActive) {
      this.logger.debug('SelectElementManager is active');
      
      // For click events, let SelectElementManager handle them directly - don't interfere
      if (event.type === 'click') {
        this.logger.debug('Click event detected while SelectElementManager active - letting SelectElementManager handle it');
        return; // Exit early to avoid interference
      }
      
      // For other events, skip most handling but allow event to continue
      this.logger.debug('Non-click event - skipping text field and selection handling');
    }
    try {
      // Note: ESC key handling is managed by:
      // - SelectElementManager (for select mode cancellation)  
      // - ShortcutManager/RevertShortcut (for translation revert)
      // No need for EventCoordinator involvement

      // Note: Select element clicks are handled directly by SelectElementManager
      // No need for EventCoordinator involvement in select element mode

      // === TEXT FIELD COORDINATION ===
      // Skip text field handling when SelectElementManager is active
      if (this.textFieldManager.isEditableElement(event.target) && !this.selectElementManager?.isActive) {
        if (event.type === 'focus') {
          await this.coordinateTextFieldFocus(event);
        } else if (event.type === 'blur') {
          await this.coordinateTextFieldBlur(event);
        } else {
          await this.coordinateTextFieldHandling(event);
        }
        return;
      }

      // === TEXT SELECTION COORDINATION ===
      // Skip text selection handling when SelectElementManager is active
      if (this.isMouseUp(event) && !this.selectElementManager?.isActive) {
        await this.coordinateTextSelection(event);
        return;
      }

    } catch (rawError) {
      await this.handleCoordinationError(rawError, event);
    }
  }

  /**
   * Coordinate text field handling
   * Delegates to TextFieldManager with error boundary
   */
  async coordinateTextFieldHandling(event) {
    try {
      if (state.activeTranslateIcon) return;

      event.stopPropagation();
      const target = event.target;
      
      // Delegate to TextFieldManager
      return await this.textFieldManager.processEditableElement(target);
    } catch (error) {
      this.logger.error('Error in text field coordination:', error);
      await this.handleCoordinationError(error, event, 'text-field-coordination');
    }
  }

  /**
   * Coordinate text field focus handling
   * Delegates to TextFieldManager with error boundary
   */
  async coordinateTextFieldFocus(event) {
    try {
      const target = event.target;
      
      // Delegate to TextFieldManager focus handler
      return await this.textFieldManager.handleEditableFocus(target);
    } catch (error) {
      this.logger.error('Error in text field focus coordination:', error);
      await this.handleCoordinationError(error, event, 'text-field-focus-coordination');
    }
  }

  /**
   * Coordinate text field blur handling
   * Delegates to TextFieldManager with error boundary
   */
  async coordinateTextFieldBlur(event) {
    try {
      const target = event.target;
      
      // Delegate to TextFieldManager blur handler
      this.textFieldManager.handleEditableBlur(target);
    } catch (error) {
      this.logger.error('Error in text field blur coordination:', error);
      await this.handleCoordinationError(error, event, 'text-field-blur-coordination');
    }
  }

  /**
   * Coordinate text selection handling
   * Delegates to TextSelectionManager with error boundary
   */
  async coordinateTextSelection(event) {
    try {
      // Check if Ctrl requirement is satisfied
      const shouldProcess = await this.textSelectionManager.shouldProcessTextSelection(event);
      if (!shouldProcess) return;

      // Delegate to TextSelectionManager
      await this.textSelectionManager.handleTextSelection(event);
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

  // === UTILITY METHODS (kept for coordination) ===
  isMouseUp(event) {
    return event.type === "mouseup";
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
      // Update TextSelectionManager key state
      this.textSelectionManager.updateCtrlKeyState(true);
    }
  }

  handleKeyUp(event) {
    if (event.key === "Control" || event.key === "Meta") {
      // تأخیر کوتاه برای اطمینان از اینکه mouseup event پردازش شده
      setTimeout(() => {
        this.ctrlKeyPressed = false;
        // Update TextSelectionManager key state
        this.textSelectionManager.updateCtrlKeyState(false);
      }, 50);
    }
  }

  // === BACKWARD COMPATIBILITY METHODS ===
  
  /**
   * @deprecated - Delegates to TextFieldManager.handleEditableFocus()
   * Kept for backward compatibility
   */
  handleEditableFocus(element) {
    return this.textFieldManager.handleEditableFocus(element);
  }

  /**
   * @deprecated - Now handled by coordinateTextFieldHandling()
   * Kept for backward compatibility
   */
  async handleEditableElement(event) {
    return await this.coordinateTextFieldHandling(event);
  }

  /**
   * @deprecated - Delegates to TextFieldManager.handleEditableBlur()
   * Kept for backward compatibility
   */
  handleEditableBlur(element) {
    this.textFieldManager.handleEditableBlur(element);
  }

  /**
   * @deprecated - Text field processing now handled by TextFieldManager
   * Kept for backward compatibility
   */
  _processEditableElement(element) {
    return this.textFieldManager.processEditableElement(element);
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
