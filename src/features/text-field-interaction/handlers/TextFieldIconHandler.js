import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { TextFieldIconManager } from '../managers/TextFieldIconManager.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

// Lazy logger initialization to prevent TDZ issues
let logger = null;
const getLogger = () => {
  if (!logger) {
    logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'TextFieldIconHandler');
  }
  return logger;
};

export class TextFieldIconHandler extends ResourceTracker {
  constructor() {
    super('text-field-icon-handler');
    
    this.isActive = false;
    this.textFieldIconManager = null;
    this.focusHandler = null;
    this.blurHandler = null;
    this.inputHandler = null;
  }

  async activate() {
    if (this.isActive) {
      getLogger().debug('TextFieldIconHandler already active');
      return;
    }

    try {
      getLogger().debug('Activating TextFieldIconHandler');
      
      // Create and initialize TextFieldIconManager
      this.textFieldIconManager = new TextFieldIconManager();
      this.textFieldIconManager.initialize();
      
      // Setup event listeners for text field interactions
      this.setupTextFieldListeners();
      
      // Track the manager for cleanup
      this.trackResource('text-field-icon-manager', () => {
        if (this.textFieldIconManager) {
          this.textFieldIconManager.cleanup();
          this.textFieldIconManager = null;
        }
      });
      
      this.isActive = true;
      getLogger().info('TextFieldIconHandler activated successfully');
      
    } catch (error) {
      const handler = ErrorHandler.getInstance();
      handler.handle(error, {
        type: ErrorTypes.SERVICE,
        context: 'TextFieldIconHandler-activate',
        showToast: false
      });
      throw error;
    }
  }

  async deactivate() {
    if (!this.isActive) {
      getLogger().debug('TextFieldIconHandler not active');
      return;
    }

    try {
      getLogger().debug('Deactivating TextFieldIconHandler');
      
      // Clean up any active text field icons
      if (this.textFieldIconManager) {
        this.textFieldIconManager.cleanup();
      }
      
      // ResourceTracker cleanup will handle all tracked resources
      this.cleanup();
      
      this.isActive = false;
      getLogger().info('TextFieldIconHandler deactivated successfully');
      
    } catch (error) {
      getLogger().error('Error deactivating TextFieldIconHandler:', error);
      // Continue with cleanup even if error occurs
      try {
        this.cleanup();
        this.isActive = false;
      } catch (cleanupError) {
        getLogger().error('Critical: TextFieldIconHandler cleanup failed:', cleanupError);
      }
    }
  }

  setupTextFieldListeners() {
    try {
      // Focus handler - show icon when text field is focused
      this.focusHandler = (event) => {
        if (!this.isActive || !this.textFieldIconManager) return;
        
        const element = event.target;
        if (this.textFieldIconManager.isEditableElement(element)) {
          getLogger().debug('Text field focused:', element.tagName, element.type || 'contenteditable');
          
          // Add icon with a small delay to ensure proper positioning
          setTimeout(async () => {
            if (document.activeElement === element) {
              await this.textFieldIconManager.processEditableElement(element);
            }
          }, 100);
        }
      };

      // Blur handler - hide icon when text field loses focus
      this.blurHandler = (event) => {
        if (!this.isActive || !this.textFieldIconManager) return;
        
        const element = event.target;
        if (this.textFieldIconManager.isEditableElement(element)) {
          getLogger().debug('Text field blurred:', element.tagName);
          
          // Small delay to allow for potential refocus
          setTimeout(() => {
            if (document.activeElement !== element) {
              this.textFieldIconManager.cleanupElement(element);
            }
          }, 150);
        }
      };

      // Input handler - update icon position if needed on content changes
      this.inputHandler = (event) => {
        if (!this.isActive || !this.textFieldIconManager) return;
        
        const element = event.target;
        if (this.textFieldIconManager.isEditableElement(element)) {
          // Debounce position updates
          clearTimeout(this.positionUpdateTimeout);
          this.positionUpdateTimeout = setTimeout(() => {
            if (document.activeElement === element) {
              // Update icon position is handled internally by the manager
            }
          }, 200);
        }
      };

      // Register event listeners with capture to catch events early
      this.addEventListener(document, 'focusin', this.focusHandler, { capture: true });
      this.addEventListener(document, 'focusout', this.blurHandler, { capture: true });
      this.addEventListener(document, 'input', this.inputHandler, { capture: true });
      
      // Also listen for resize events to update positions
      this.addEventListener(window, 'resize', () => {
        if (this.textFieldIconManager) {
          this.textFieldIconManager.forceUpdateAllPositions();
        }
      });

      // Listen for scroll events to update positions
      this.addEventListener(document, 'scroll', () => {
        if (this.textFieldIconManager) {
          clearTimeout(this.scrollUpdateTimeout);
          this.scrollUpdateTimeout = setTimeout(() => {
            this.textFieldIconManager.forceUpdateAllPositions();
          }, 100);
        }
      }, { passive: true });

      // Track timeouts for cleanup
      this.trackResource('position-update-timeout', () => {
        clearTimeout(this.positionUpdateTimeout);
      });
      
      this.trackResource('scroll-update-timeout', () => {
        clearTimeout(this.scrollUpdateTimeout);
      });

      getLogger().debug('Text field listeners setup complete');
      
    } catch (error) {
      getLogger().error('Failed to setup text field listeners:', error);
    }
  }

  // Public API methods
  getTextFieldIconManager() {
    return this.textFieldIconManager;
  }

  hasActiveIcons() {
    return this.textFieldIconManager?.activeIcons?.size > 0 || false;
  }

  getActiveIconsCount() {
    return this.textFieldIconManager?.activeIcons?.size || 0;
  }

  cleanupAllIcons() {
    if (this.textFieldIconManager) {
      this.textFieldIconManager.cleanup();
    }
  }

  async addIconToCurrentField() {
    if (!this.isActive || !this.textFieldIconManager) return false;
    
    const activeElement = document.activeElement;
    if (this.textFieldIconManager.isEditableElement(activeElement)) {
      await this.textFieldIconManager.processEditableElement(activeElement);
      return true;
    }
    
    return false;
  }

  getStatus() {
    return {
      handlerActive: this.isActive,
      activeIcons: this.getActiveIconsCount(),
      managerAvailable: !!this.textFieldIconManager,
      currentFocusIsEditable: this.textFieldIconManager?.isEditableElement(document.activeElement) || false
    };
  }
}

export default TextFieldIconHandler;