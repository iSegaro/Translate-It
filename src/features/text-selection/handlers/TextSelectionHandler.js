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

        if (!this.isActive) return;

        // Ensure TextSelectionManager is available (fallback mechanism)
        if (!this._ensureManagerAvailable()) return;

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
      
      // Selection Change Strategy: Use selectionchange for better detection
      let selectionTimeout = null;
      const processSelection = async () => {
        if (!this.isActive) return;

        // Ensure TextSelectionManager is available (fallback mechanism)
        if (!this._ensureManagerAvailable()) return;

        const selection = window.getSelection();
        if (selection && selection.toString().trim()) {

          // Use smart field detection
          const contextElement = this.getSelectionContextElement(selection);
          const detection = await fieldDetector.detect(contextElement);

          // Skip non-processable fields completely
          if (detection.fieldType === FieldTypes.NON_PROCESSABLE) {
            logger.debug('Ignoring selection in non-processable field');
            return;
          }

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
              detection.fieldType === FieldTypes.RICH_TEXT_EDITOR ||
              detection.fieldType === FieldTypes.CONTENT_EDITABLE) {
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

              // For double-click-required fields, only process if it's actually from a double-click
              // or if it's a keyboard selection (which doesn't trigger drag detection)
              if (needsDoubleClick && !isFromDoubleClick) {
                const isKeyboardSelection = !this.textSelectionManager.isDragging;
                if (!isKeyboardSelection) {
                  logger.debug('Editor selection ignored - drag selection not allowed in double-click-required field', {
                    text: selection.toString().substring(0, 30),
                    fieldType: detection.fieldType,
                    isDragging: this.textSelectionManager.isDragging
                  });
                  return;
                }
              }

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

        // Check if selection was cleared and dismiss icon if needed
        const selection = window.getSelection();
        if (!selection || !selection.toString().trim()) {
          // Selection was cleared, dismiss any open icon/window after a short delay
          setTimeout(() => {
            if (this.textSelectionManager) {
              const windowsManager = this.textSelectionManager._getWindowsManager();

              // Don't dismiss if we're in window mode and a click was recently handled
              // This prevents dismissing when clicking inside the translation window
              if (windowsManager && windowsManager.state.isVisible &&
                  windowsManager.state._lastClickWasInsideWindow) {
                logger.debug('Selection cleared but click was inside window - not dismissing');
                windowsManager.state._lastClickWasInsideWindow = false;
                return;
              }

              // Don't dismiss if WindowsManager is in the middle of icon-to-window transition
              if (windowsManager && windowsManager._isIconToWindowTransition) {
                logger.debug('Selection cleared but WindowsManager is transitioning from icon to window - not dismissing');
                return;
              }

              if (windowsManager && (windowsManager.state.isIconMode || windowsManager.state.isVisible)) {
                logger.debug('Selection cleared, dismissing icon/window');
                windowsManager.dismiss();
              }
            }
          }, 100); // Small delay to avoid conflicts with other selection events
        } else {
          selectionTimeout = setTimeout(processSelection, 50);
        }
      }, { critical: true });
      
      // Keyboard selection support
      this.addEventListener(document, 'keyup', (event) => {
        if (!this.isActive) return;

        // Ensure TextSelectionManager is available (fallback mechanism)
        if (!this._ensureManagerAvailable()) return;

        // Handle keyboard selection (Shift+Arrow keys, Ctrl+A, etc.)
        if (event.shiftKey || event.ctrlKey || event.metaKey) {
          setTimeout(processSelection, 100);
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

      // Mouse drag detection for principled selection handling (CRITICAL)
      this.addEventListener(document, 'mousedown', (event) => {
        if (!this.isActive) return;

        // Ensure TextSelectionManager is available (fallback mechanism)
        if (!this._ensureManagerAvailable()) return;

        // Start drag detection
        this.textSelectionManager.startDragDetection(event);

        // Instant dismiss on mousedown for better UX
        this.textSelectionManager._onOutsideClick(event);
      }, { critical: true });
      
      this.addEventListener(document, 'mouseup', (event) => {
        if (!this.isActive) return;
        
        // Ensure TextSelectionManager is available (fallback mechanism)
        if (!this._ensureManagerAvailable()) return;

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

  /**
   * Ensure TextSelectionManager is available - recreate if cleaned up by garbage collector
   * This is a fallback mechanism when FeatureManager health checks don't catch the issue
   * @returns {boolean} Whether manager is available
   */
  _ensureManagerAvailable() {
    if (this.textSelectionManager) {
      return true;
    }

    logger.debug('TextSelectionManager was cleaned up, recreating as fallback...');

    try {
      this.textSelectionManager = new TextSelectionManager({
        featureManager: this.featureManager
      });

      // Restore preserved state
      if (this.preservedState.lastDoubleClickTime) {
        this.textSelectionManager.lastDoubleClickTime = this.preservedState.lastDoubleClickTime;
        this.textSelectionManager.doubleClickWindow = this.preservedState.doubleClickWindow;
        this.textSelectionManager.doubleClickProcessing = this.preservedState.doubleClickProcessing;
      }

      // Re-track the recreated manager
      this.trackResource('text-selection-manager', () => {
        if (this.textSelectionManager) {
          if (this.textSelectionManager.lastDoubleClickTime) {
            this.preservedState.lastDoubleClickTime = this.textSelectionManager.lastDoubleClickTime;
            this.preservedState.doubleClickWindow = this.textSelectionManager.doubleClickWindow || 200;
            this.preservedState.doubleClickProcessing = this.textSelectionManager.doubleClickProcessing || false;
          }
          this.textSelectionManager.cleanup();
          this.textSelectionManager = null;
        }
      }, { isCritical: true });

      return true;
    } catch (error) {
      logger.error('Failed to recreate TextSelectionManager:', error);
      return false;
    }
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