import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { TextSelectionManager } from '@/core/managers/content/TextSelectionManager.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { fieldDetector, FieldTypes } from '@/utils/text/FieldDetector.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'TextSelectionHandler');

export class TextSelectionHandler extends ResourceTracker {
  constructor(options = {}) {
    super('text-selection-handler');

    this.isActive = false;
    this.textSelectionManager = null;
    this.featureManager = options.featureManager;

    // Preserve critical state across manager recreation
    this.preservedState = {
      lastDoubleClickTime: 0,
      doubleClickWindow: 200,
      doubleClickProcessing: false
    };

    // Flag to indicate when context menu is open
    this.contextMenuOpen = false;

    // Store selection before potential clearing
    this.storedSelection = null;

    // Flag to prevent creating new icons after restoring selection
    this.restoringSelection = false;


  }

  async activate() {
    if (this.isActive) {
      logger.debug('TextSelectionHandler already active');
      return true;
    }

    try {
      logger.debug('Activating TextSelectionHandler');
      
      logger.debug('About to create TextSelectionManager', {
        hasFeatureManager: !!this.featureManager,
        TextSelectionManagerClass: typeof TextSelectionManager
      });
      
      // Create and initialize TextSelectionManager with FeatureManager
      this.textSelectionManager = new TextSelectionManager({
        featureManager: this.featureManager
      });
      
      logger.debug('TextSelectionManager created successfully', {
        hasManager: !!this.textSelectionManager,
        hasFeatureManager: !!this.featureManager,
        managerType: typeof this.textSelectionManager
      });
      
      // Setup event listeners for text selection
      this.setupSelectionListeners();
      
      // Track the manager for cleanup - mark as critical to prevent cleanup
      this.trackResource('text-selection-manager', () => {
        logger.debug('Cleaning up TextSelectionManager from ResourceTracker');
        if (this.textSelectionManager) {
          // Preserve critical state before cleanup
          if (this.textSelectionManager.lastDoubleClickTime) {
            this.preservedState.lastDoubleClickTime = this.textSelectionManager.lastDoubleClickTime;
            this.preservedState.doubleClickWindow = this.textSelectionManager.doubleClickWindow || 200;
            this.preservedState.doubleClickProcessing = this.textSelectionManager.doubleClickProcessing || false;
            logger.debug('Preserved manager state before cleanup', {
              lastDoubleClickTime: this.preservedState.lastDoubleClickTime,
              doubleClickProcessing: this.preservedState.doubleClickProcessing,
              timeSinceDoubleClick: Date.now() - this.preservedState.lastDoubleClickTime
            });
          }
          
          this.textSelectionManager.cleanup();
          this.textSelectionManager = null;
        }
      }, { isCritical: true });
      
      this.isActive = true;
      logger.info('TextSelectionHandler activated successfully');
      return true;
      
    } catch (error) {
      const handler = ErrorHandler.getInstance();
      handler.handle(error, {
        type: ErrorTypes.SERVICE,
        context: 'TextSelectionHandler-activate',
        showToast: false
      });
      return false;
    }
  }

  async deactivate() {
    if (!this.isActive) {
      logger.debug('TextSelectionHandler not active');
      return true;
    }

    try {
      logger.debug('Deactivating TextSelectionHandler', {
        hasManager: !!this.textSelectionManager
      });
      
      
      // Cancel any pending text selection translations
      if (this.textSelectionManager) {
        this.textSelectionManager.cancelSelectionTranslation();
      }
      
      // ResourceTracker cleanup will handle all tracked resources
      this.cleanup();
      
      this.isActive = false;
      logger.info('TextSelectionHandler deactivated successfully');
      return true;
      
    } catch (error) {
      logger.error('Error deactivating TextSelectionHandler:', error);
      // Continue with cleanup even if error occurs
      try {
        this.cleanup();
        this.isActive = false;
        return true;
      } catch (cleanupError) {
        logger.error('Critical: TextSelectionHandler cleanup failed:', cleanupError);
        return false;
      }
    }
  }

  setupSelectionListeners() {
    try {
      // Professional Editor Strategy: Only use double-click for professional editors
      const doubleClickHandler = (event) => {
        logger.debug('Double-click event triggered', {
          isActive: this.isActive,
          target: event.target?.tagName,
          className: event.target?.className?.toString().substring(0, 50),
          url: window.location.hostname
        });
        
        if (!this.isActive || !this.textSelectionManager) return;
        
        // Update preserved state first
        this.preservedState.lastDoubleClickTime = Date.now();
        this.preservedState.doubleClickProcessing = true;
        
        logger.debug('Double-click event received in handler', {
          target: event.target?.tagName,
          className: event.target?.className?.toString().substring(0, 50),
          isActive: this.isActive,
          hasManager: !!this.textSelectionManager,
          preservedTimestamp: this.preservedState.lastDoubleClickTime,
          url: window.location.hostname
        });
        
        // Handle double-click - manager guaranteed to exist due to critical protection
        if (typeof this.textSelectionManager.handleDoubleClick === 'function') {
          this.textSelectionManager.handleDoubleClick(event);
        }
        
        // Clear processing flag after reasonable delay to prevent deadlock
        setTimeout(() => {
          this.preservedState.doubleClickProcessing = false;
        }, 500);
      };
      
      // Use capture phase to catch events before they're prevented by Google Docs (CRITICAL)
      this.addEventListener(document, 'dblclick', doubleClickHandler, { capture: true, critical: true });
      
      // Helper to store current selection
      const storeCurrentSelection = () => {
        const selection = window.getSelection();
        if (selection && selection.toString().trim()) {
          this.storedSelection = {
            text: selection.toString(),
            ranges: []
          };

          for (let i = 0; i < selection.rangeCount; i++) {
            this.storedSelection.ranges.push(selection.getRangeAt(i).cloneRange());
          }
        }
      };

      // Selection Change Strategy: Use selectionchange for better detection
      let selectionTimeout = null;
      const processSelection = async () => {
        if (!this.isActive || !this.textSelectionManager) return;

        // Skip processing if we're currently restoring selection
        if (this.restoringSelection) {
          return;
        }

        const selection = window.getSelection();
        if (selection && selection.toString().trim()) {
          // Store selection whenever we process it
          storeCurrentSelection();

          // Use smart field detection
          const contextElement = this.getSelectionContextElement(selection);
          const detection = await fieldDetector.detect(contextElement);
          
          logger.debug('Selection detected via selectionchange', {
            text: selection.toString().substring(0, 30) + '...',
            fieldType: detection.fieldType,
            shouldShowIcon: detection.shouldShowSelectionIcon,
            selectionStrategy: detection.selectionStrategy,
            selectionEventStrategy: detection.selectionEventStrategy,
            isFromDoubleClick: this._isFromRecentDoubleClick(),
            elementTag: contextElement?.tagName,
            elementClass: contextElement?.className
          });
          
          // For professional editors and rich text editors, check if we should process based on selection strategy
          if (detection.fieldType === FieldTypes.PROFESSIONAL_EDITOR || 
              detection.fieldType === FieldTypes.RICH_TEXT_EDITOR) {
            const needsDoubleClick = detection.selectionStrategy === 'double-click-required';
            const isFromDoubleClick = this._isFromRecentDoubleClick();
            const shouldProcess = !needsDoubleClick || isFromDoubleClick;
            
            if (shouldProcess) {
              logger.debug('Processing editor selection', {
                text: selection.toString().substring(0, 30),
                fieldType: detection.fieldType,
                selectionStrategy: detection.selectionStrategy,
                needsDoubleClick,
                isFromDoubleClick,
                timeSinceDoubleClick: Date.now() - this.preservedState.lastDoubleClickTime
              });
              this.textSelectionManager.handleTextSelection({
                type: 'selectionchange',
                selection: selection,
                fieldType: detection.fieldType
              });
            } else {
              logger.debug('Editor selection ignored - double-click required', {
                text: selection.toString().substring(0, 30),
                fieldType: detection.fieldType,
                selectionStrategy: detection.selectionStrategy,
                needsDoubleClick,
                isFromDoubleClick,
                timeSinceDoubleClick: Date.now() - this.preservedState.lastDoubleClickTime
              });
            }
          } else if (detection.shouldShowSelectionIcon) {
            // Route based on selection event strategy
            if (detection.selectionEventStrategy === 'selection-based') {
              // Use clean selectionchange events for regular webpage content
              logger.debug('Calling handleTextSelection for selection-based strategy', {
                fieldType: detection.fieldType,
                selectionEventStrategy: detection.selectionEventStrategy,
                text: selection.toString().substring(0, 30) + '...'
              });
              
              this.textSelectionManager.handleTextSelection({
                type: 'selectionchange', 
                selection: selection,
                fieldType: detection.fieldType
              });
            } else {
              // For mouse-based strategy (professional editors), ignore selectionchange
              // These will be handled by mouseup events
              logger.debug('Ignoring selectionchange for mouse-based strategy', {
                fieldType: detection.fieldType,
                selectionEventStrategy: detection.selectionEventStrategy
              });
            }
          } else {
            logger.debug('Not showing selection icon', {
              fieldType: detection.fieldType,
              shouldShowSelectionIcon: detection.shouldShowSelectionIcon,
              shouldShowTextFieldIcon: detection.shouldShowTextFieldIcon
            });
          }
        }
      };
      
      this.addEventListener(document, 'selectionchange', () => {
        // Debounce selection changes to avoid excessive processing
        if (selectionTimeout) {
          clearTimeout(selectionTimeout);
        }
        selectionTimeout = setTimeout(processSelection, 50);
      }, { critical: true });
      
      // Keyboard selection support
      this.addEventListener(document, 'keyup', (event) => {
        if (!this.isActive || !this.textSelectionManager) return;

        // Handle keyboard selection (Shift+Arrow keys, Ctrl+A, etc.)
        if (event.shiftKey || event.ctrlKey || event.metaKey) {
          setTimeout(processSelection, 100);
        }
      });


      // Handle context menu to preserve selection and prevent dismissal
      this.addEventListener(document, 'contextmenu', (event) => {
        const selection = window.getSelection();
        const selectionText = selection?.toString().trim();

        if (!this.isActive) {
          return;
        }

        // Use stored selection if current selection is empty
        const rangesToRestore = this.storedSelection?.ranges || [];
        const textToRestore = this.storedSelection?.text || '';

        if (rangesToRestore.length > 0 && textToRestore) {
          // Set flag to prevent new icon creation
          this.restoringSelection = true;

          // Restore selection immediately
          try {
            const currentSelection = window.getSelection();
            currentSelection.removeAllRanges();
            rangesToRestore.forEach(range => {
              currentSelection.addRange(range);
            });
          } catch (error) {
            logger.debug('Failed to restore selection:', error);
          }

          // Also try after delay to ensure it sticks
          setTimeout(() => {
            try {
              const currentSelection = window.getSelection();
              if (!currentSelection.toString().trim()) {
                currentSelection.removeAllRanges();
                rangesToRestore.forEach(range => {
                  currentSelection.addRange(range);
                });
              }
            } catch (error) {
              logger.debug('Failed to restore selection (delayed):', error);
            }
          }, 50);

          // Clear the flag after context menu has time to show
          setTimeout(() => {
            this.restoringSelection = false;
          }, 200);
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

      // Store selection before any mousedown that might clear it
      this.addEventListener(document, 'mousedown', (event) => {
        if (!this.isActive) return;

        // Store current selection before it potentially gets cleared
        const selection = window.getSelection();
        if (selection && selection.toString().trim()) {
          this.storedSelection = {
            text: selection.toString(),
            ranges: []
          };

          for (let i = 0; i < selection.rangeCount; i++) {
            this.storedSelection.ranges.push(selection.getRangeAt(i).cloneRange());
          }
        }

        // Manager guaranteed to exist due to critical protection, but add safety check
        if (!this.textSelectionManager) {
          logger.warn('Critical: TextSelectionManager unexpectedly missing in mousedown');
          return;
        }

        // Start drag detection
        this.textSelectionManager.startDragDetection(event);

        // Only dismiss on left click (button 0), ignore right-click and middle-click
        if (event.button === 0) {
          // Instant dismiss on mousedown for better UX
          this.textSelectionManager._onOutsideClick(event);
        }
      }, { critical: true });
      
      this.addEventListener(document, 'mouseup', (event) => {
        if (!this.isActive) return;
        
        // Manager guaranteed to exist due to critical protection, but add safety check
        if (!this.textSelectionManager) {
          logger.warn('Critical: TextSelectionManager unexpectedly missing in mouseup');
          return;
        }
        
        // End drag detection and process final selection
        this.textSelectionManager.endDragDetection(event);
      }, { critical: true });

      logger.debug('Text selection listeners setup complete');
      
    } catch (error) {
      logger.error('Failed to setup text selection listeners:', error);
    }
  }

  // Helper methods
  getSelectionContextElement(selection) {
    if (!selection || !selection.rangeCount) return null;

    try {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      return container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
    } catch (error) {
      logger.debug('Error getting selection context element:', error);
      return null;
    }
  }


  _isFromRecentDoubleClick() {
    const timeSinceDoubleClick = Date.now() - this.preservedState.lastDoubleClickTime;
    return timeSinceDoubleClick <= this.preservedState.doubleClickWindow;
  }

  // Public API methods
  getTextSelectionManager() {
    logger.debug('getTextSelectionManager called', {
      isActive: this.isActive,
      hasManager: !!this.textSelectionManager
    });
    
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