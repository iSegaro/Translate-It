import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { TextSelectionManager } from '@/core/managers/content/TextSelectionManager.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'TextSelectionHandler');

export class TextSelectionHandler extends ResourceTracker {
  constructor(options = {}) {
    super('text-selection-handler');
    
    this.isActive = false;
    this.textSelectionManager = null;
    this.featureManager = options.featureManager;
  }

  async activate() {
    if (this.isActive) {
      logger.debug('TextSelectionHandler already active');
      return;
    }

    try {
      logger.debug('Activating TextSelectionHandler');
      
      // Create and initialize TextSelectionManager with FeatureManager
      this.textSelectionManager = new TextSelectionManager({
        featureManager: this.featureManager
      });
      
      // Setup event listeners for text selection
      this.setupSelectionListeners();
      
      // Track the manager for cleanup
      this.trackResource('text-selection-manager', () => {
        if (this.textSelectionManager) {
          this.textSelectionManager.cleanup();
          this.textSelectionManager = null;
        }
      });
      
      this.isActive = true;
      logger.info('TextSelectionHandler activated successfully');
      
    } catch (error) {
      const handler = ErrorHandler.getInstance();
      handler.handle(error, {
        type: ErrorTypes.SERVICE,
        context: 'TextSelectionHandler-activate',
        showToast: false
      });
      throw error;
    }
  }

  async deactivate() {
    if (!this.isActive) {
      logger.debug('TextSelectionHandler not active');
      return;
    }

    try {
      logger.debug('Deactivating TextSelectionHandler');
      
      // Cancel any pending text selection translations
      if (this.textSelectionManager) {
        this.textSelectionManager.cancelSelectionTranslation();
      }
      
      // ResourceTracker cleanup will handle all tracked resources
      this.cleanup();
      
      this.isActive = false;
      logger.info('TextSelectionHandler deactivated successfully');
      
    } catch (error) {
      logger.error('Error deactivating TextSelectionHandler:', error);
      // Continue with cleanup even if error occurs
      try {
        this.cleanup();
        this.isActive = false;
      } catch (cleanupError) {
        logger.error('Critical: TextSelectionHandler cleanup failed:', cleanupError);
      }
    }
  }

  setupSelectionListeners() {
    try {
      // Listen for text selection events
      const selectionHandler = (event) => {
        if (!this.isActive || !this.textSelectionManager) return;
        
        // Handle the text selection
        this.textSelectionManager.handleTextSelection(event);
      };

      // Listen for mouseup events to detect text selection
      this.addEventListener(document, 'mouseup', selectionHandler);
      
      // Listen for keyup events for keyboard selection
      this.addEventListener(document, 'keyup', (event) => {
        if (!this.isActive || !this.textSelectionManager) return;
        
        // Handle keyboard selection (Shift+Arrow keys, Ctrl+A, etc.)
        if (event.shiftKey || event.ctrlKey || event.metaKey) {
          setTimeout(() => {
            selectionHandler(event);
          }, 10); // Small delay to ensure selection is complete
        }
      });

      // Listen for selection change events - but only process after mouseup
      let isMouseDown = false;
      
      this.addEventListener(document, 'mousedown', () => {
        isMouseDown = true;
      });
      
      this.addEventListener(document, 'mouseup', () => {
        isMouseDown = false;
      });
      
      this.addEventListener(document, 'selectionchange', () => {
        if (!this.isActive || !this.textSelectionManager) return;
        
        // Only handle selectionchange if mouse is not down (selection is complete)
        if (!isMouseDown) {
          setTimeout(() => {
            const selection = window.getSelection();
            if (selection && selection.toString().trim()) {
              this.textSelectionManager.handleTextSelection({
                type: 'selectionchange',
                selection: selection
              });
            }
          }, 10);
        }
      });

      // Listen for control key state changes
      this.addEventListener(document, 'keydown', (event) => {
        if (event.ctrlKey || event.metaKey) {
          if (this.textSelectionManager) {
            this.textSelectionManager.ctrlKeyPressed = true;
          }
        }
      });

      this.addEventListener(document, 'keyup', (event) => {
        if (!event.ctrlKey && !event.metaKey) {
          if (this.textSelectionManager) {
            this.textSelectionManager.ctrlKeyPressed = false;
          }
        }
      });

      // Listen for clicks outside to close any open translation windows
      this.addEventListener(document, 'click', (event) => {
        if (!this.isActive || !this.textSelectionManager) return;
        
        // Check if click is outside translation windows
        this.textSelectionManager._onOutsideClick(event);
      });

      logger.debug('Text selection listeners setup complete');
      
    } catch (error) {
      logger.error('Failed to setup text selection listeners:', error);
    }
  }

  // Public API methods
  getTextSelectionManager() {
    return this.textSelectionManager;
  }

  hasActiveSelection() {
    if (!this.textSelectionManager) return false;
    
    const selection = window.getSelection();
    return selection && selection.toString().trim().length > 0;
  }

  getCurrentSelection() {
    if (!this.isActive) return null;
    
    const selection = window.getSelection();
    return selection?.toString().trim() || null;
  }

  cancelSelection() {
    if (this.textSelectionManager) {
      this.textSelectionManager.cancelSelectionTranslation();
    }
  }

  getStatus() {
    return {
      handlerActive: this.isActive,
      hasSelection: this.hasActiveSelection(),
      managerAvailable: !!this.textSelectionManager,
      currentSelection: this.getCurrentSelection()?.substring(0, 100) // Truncate for logging
    };
  }
}

export default TextSelectionHandler;