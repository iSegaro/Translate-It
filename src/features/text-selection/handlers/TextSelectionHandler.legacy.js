import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { TextSelectionManager } from '@/core/managers/content/TextSelectionManager.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { SelectionDecisionManager } from '../utils/SelectionDecisionManager.js';

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

      // Expose on window for ClickManager access
      window.TranslateItTextSelectionManager = this.textSelectionManager;

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

      // Clean up window reference
      if (window.TranslateItTextSelectionManager === this.textSelectionManager) {
        delete window.TranslateItTextSelectionManager;
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

          // Use the centralized decision manager
          const contextElement = SelectionDecisionManager.getSelectionContextElement(selection);

          // Additional check: If we detected an input field, do a quick field type check
          if (contextElement && contextElement.tagName === 'INPUT') {
            logger.debug('Input field detected, checking if non-processable');

            // Quick check for non-processable input types
            const inputType = (contextElement.type || '').toLowerCase();
            const nonProcessableTypes = ['password', 'email', 'tel', 'url', 'search', 'hidden', 'submit', 'button', 'reset'];

            if (nonProcessableTypes.includes(inputType)) {
              logger.debug('Ignoring selection in non-processable input type:', inputType);
              return;
            }

            // Check for authentication-related attributes
            const name = (contextElement.name || '').toLowerCase();
            const id = (contextElement.id || '').toLowerCase();
            const placeholder = (contextElement.placeholder || '').toLowerCase();
            const autocomplete = (contextElement.autocomplete || '').toLowerCase();

            const authKeywords = ['password', 'email', 'username', 'login', 'signin', 'auth', 'account'];
            const hasAuthKeyword = authKeywords.some(keyword =>
              name.includes(keyword) ||
              id.includes(keyword) ||
              placeholder.includes(keyword) ||
              autocomplete.includes(keyword)
            );

            if (hasAuthKeyword) {
              logger.debug('Ignoring selection in authentication-related input field');
              return;
            }
          }

          const decision = await SelectionDecisionManager.shouldShowSelectionIcon(selection, {
            element: contextElement,
            isFromDoubleClick: this._isFromRecentDoubleClick(),
            isDragging: this.textSelectionManager?.isDragging || false
          });

          if (decision.shouldShow) {
            // Use the detection from the decision (no need to call fieldDetector again)
            const detection = decision.detection;

            if (detection && detection.selectionEventStrategy === 'selection-based') {
              // Use clean selectionchange events for regular webpage content
              logger.debug('Processing selection with selection-based strategy', {
                reason: decision.reason,
                text: selection.toString().substring(0, 30) + '...'
              });

              this.textSelectionManager.handleTextSelection({
                type: 'selectionchange',
                selection: selection,
                fieldType: detection.fieldType
              });
            } else if (detection) {
              // For mouse-based strategy (professional editors), ignore selectionchange
              // These will be handled by mouseup events
              logger.debug('Ignoring selectionchange for mouse-based strategy', {
                reason: decision.reason,
                fieldType: detection.fieldType,
                selectionEventStrategy: detection.selectionEventStrategy
              });
            } else {
              // Fallback if detection failed
              logger.debug('Processing selection with fallback strategy', {
                reason: decision.reason,
                text: selection.toString().substring(0, 30) + '...'
              });

              this.textSelectionManager.handleTextSelection({
                type: 'selectionchange',
                selection: selection,
                fieldType: 'unknown'
              });
            }
          } else {
            logger.debug('Selection ignored', {
              reason: decision.reason,
              details: decision.details,
              text: selection.toString().substring(0, 30) + '...',
              fieldType: decision.detection?.fieldType,
              isFromDoubleClick: this._isFromRecentDoubleClick(),
              isDragging: this.textSelectionManager?.isDragging || false,
              contextElement: contextElement?.tagName
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
          // Selection was cleared - dismiss after a longer delay to allow new selection
          setTimeout(() => {
            if (this.textSelectionManager) {
              const windowsManager = this.textSelectionManager._getWindowsManager();

              // Don't dismiss if we're in window mode and a click was recently handled
              if (windowsManager && windowsManager.state.isVisible &&
                  windowsManager.state._lastClickWasInsideWindow) {
                logger.debug('Selection cleared but click was inside window - not dismissing');
                windowsManager.state._lastClickWasInsideWindow = false;
                return;
              }

              // Don't dismiss if WindowsManager is in the middle of icon-to-window transition
              if (windowsManager && windowsManager._isIconToWindowTransition) {
                logger.debug('Selection cleared but WindowsManager is transitioning - not dismissing');
                return;
              }

              // Check if user has started a new selection (in case they're selecting quickly)
              const currentSelection = window.getSelection();
              if (currentSelection && currentSelection.toString().trim()) {
                logger.debug('User started new selection - keeping window open');
                return;
              }

              // Check if this is after a recent double-click (which might have created a new window)
              const timeSinceDoubleClick = Date.now() - this.preservedState.lastDoubleClickTime;
              if (timeSinceDoubleClick <= 1000) { // Within 1 second of double-click
                logger.debug('Selection cleared shortly after double-click - not dismissing to allow new window', {
                  timeSinceDoubleClick,
                  lastDoubleClickTime: this.preservedState.lastDoubleClickTime
                });
                return;
              }

              // Check if this is after a drag operation (which might have created a new selection)
              if (this.textSelectionManager && (this.textSelectionManager.isDragging || this.textSelectionManager.justFinishedDrag || this.textSelectionManager.preventDismissOnNextClear)) {
                logger.debug('Selection cleared after drag operation - not dismissing to allow drag completion', {
                  isDragging: this.textSelectionManager.isDragging,
                  justFinishedDrag: this.textSelectionManager.justFinishedDrag,
                  preventDismissOnNextClear: this.textSelectionManager.preventDismissOnNextClear
                });

                // Reset the preventDismiss flag after using it
                if (this.textSelectionManager.preventDismissOnNextClear) {
                  setTimeout(() => {
                    if (this.textSelectionManager) {
                      this.textSelectionManager.preventDismissOnNextClear = false;
                      this.logger.debug('Reset preventDismissOnNextClear flag');
                    }
                  }, 3000);
                }
                return;
              }

              if (windowsManager && (windowsManager.state.isIconMode || windowsManager.state.isVisible)) {
                logger.debug('Selection cleared and no new selection started - dismissing icon/window');
                windowsManager.dismiss();
              }
            }
          }, 2000); // Wait 2 seconds before dismissing to allow new selection
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

        // Don't dismiss on mousedown - let the click handlers handle dismissal
        // This allows drag operations to work properly
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

      // Expose on window for ClickManager access
      window.TranslateItTextSelectionManager = this.textSelectionManager;

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