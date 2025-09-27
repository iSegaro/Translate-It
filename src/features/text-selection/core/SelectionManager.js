import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { WindowsConfig } from "@/features/windows/managers/core/WindowsConfig.js";
import { ExtensionContextManager } from "@/core/extensionContext.js";
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { utilsFactory } from '@/utils/UtilsFactory.js';

/**
 * SelectionManager - Simplified text selection management
 *
 * Handles the core logic for processing text selections and showing translation UI.
 * Much simpler than the old TextSelectionManager - no drag detection complexity.
 */
export class SelectionManager extends ResourceTracker {
  constructor(options = {}) {
    super('selection-manager');

    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'SelectionManager');

    // Mark this instance as critical to prevent cleanup during memory management
    this.trackResource('selection-manager-critical', () => {
      // This is the core selection manager - should not be cleaned up
      this.logger.debug('Critical SelectionManager cleanup skipped');
    }, { isCritical: true });

    // Initialize exclusion state - will be checked asynchronously
    this.isExcluded = false;
    this.exclusionChecked = false;

    // FeatureManager reference for accessing WindowsManager
    this.featureManager = options.featureManager;

    // Simple state tracking - no complex drag detection
    this.lastProcessedText = null;
    this.lastProcessedTime = 0;
    this.processingCooldown = 1000; // 1 second to prevent duplicates

    // Generate frameId for cross-frame communication
    this.frameId = Math.random().toString(36).substring(7);

    this.logger.init('SelectionManager initialized');
  }

  /**
   * Check if URL is excluded using UtilsFactory
   */
  async checkExclusion() {
    if (!this.exclusionChecked) {
      const { isUrlExcluded } = await utilsFactory.getUIUtils();
      this.isExcluded = isUrlExcluded(window.location.href);
      this.exclusionChecked = true;
      if (this.isExcluded) {
        this.logger.debug('URL is excluded, functionality will be limited');
      }
    }
    return this.isExcluded;
  }

  /**
   * Get WindowsManager instance from FeatureManager
   */
  getWindowsManager() {
    if (window !== window.top) {
      // In iframe context, no direct WindowsManager needed
      return null;
    }

    if (!this.featureManager) {
      this.logger.debug('FeatureManager not available');
      return null;
    }

    const windowsHandler = this.featureManager.getFeatureHandler('windowsManager');
    if (!windowsHandler || !windowsHandler.getIsActive()) {
      this.logger.debug('WindowsManager handler not active');
      return null;
    }

    return windowsHandler.getWindowsManager();
  }

  /**
   * Process text selection and show translation UI
   */
  async processSelection(selectedText, selection) {
    if (!ExtensionContextManager.isValidSync()) {
      this.logger.debug('Extension context invalid, skipping selection processing');
      return;
    }

    if (await this.checkExclusion()) {
      this.logger.debug('URL excluded, skipping selection processing');
      return;
    }

    const currentTime = Date.now();

    // Prevent duplicate processing of same text
    if (this.isDuplicateSelection(selectedText, currentTime)) {
      this.logger.debug('Skipping duplicate selection', {
        text: selectedText.substring(0, 30) + '...'
      });
      return;
    }

    this.logger.debug('Processing new selection', {
      text: selectedText.substring(0, 30) + '...',
      length: selectedText.length
    });

    // Calculate position for the translation UI
    const position = this.calculateSelectionPosition(selection);
    if (!position) {
      this.logger.debug('Could not calculate position for selection', {
        text: selectedText.substring(0, 30) + '...',
        selectionType: selection?.type,
        rangeCount: selection?.rangeCount,
        anchorNode: selection?.anchorNode?.nodeName,
        focusNode: selection?.focusNode?.nodeName
      });
      return;
    }

    // Show translation UI
    await this.showTranslationUI(selectedText, position);

    // Track this selection
    this.lastProcessedText = selectedText;
    this.lastProcessedTime = currentTime;
  }

  /**
   * Check if this is a duplicate selection
   */
  isDuplicateSelection(selectedText, currentTime) {
    return selectedText === this.lastProcessedText &&
           (currentTime - this.lastProcessedTime) < this.processingCooldown &&
           this.isWindowVisible();
  }

  /**
   * Calculate position for selection UI
   */
  calculateSelectionPosition(selection) {
    try {
      if (!selection || selection.rangeCount === 0) {
        this.logger.debug('Position calculation failed: No selection or empty ranges', {
          hasSelection: !!selection,
          rangeCount: selection?.rangeCount
        });
        return null;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      if (!rect || (rect.width === 0 && rect.height === 0)) {
        // Fallback for empty rects (e.g., input fields)
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
          const elementRect = activeElement.getBoundingClientRect();
          this.logger.debug('Using input field position fallback', {
            tagName: activeElement.tagName,
            rect: elementRect
          });
          return {
            x: elementRect.left + 10 + window.scrollX,
            y: elementRect.bottom + 10 + window.scrollY
          };
        }

        this.logger.debug('Position calculation failed: Empty rectangle and not input field', {
          rect: rect,
          activeElement: activeElement?.tagName,
          selectionText: selection.toString().substring(0, 50)
        });
        return null;
      }

      const iconSize = WindowsConfig.POSITIONING.ICON_SIZE || 32;
      const selectionCenter = rect.left + rect.width / 2;

      return {
        x: selectionCenter - (iconSize / 2) + window.scrollX,
        y: rect.bottom + (WindowsConfig.POSITIONING.SELECTION_OFFSET || 10) + window.scrollY
      };

    } catch (error) {
      this.logger.error('Error calculating selection position:', error);
      return null;
    }
  }

  /**
   * Show translation UI (icon or window based on settings)
   */
  async showTranslationUI(selectedText, position) {
    const windowsManager = this.getWindowsManager();

    if (windowsManager) {
      // Main frame - use WindowsManager directly
      this.logger.debug('Showing translation UI via WindowsManager', {
        text: selectedText.substring(0, 30) + '...',
        position,
        windowsManagerType: typeof windowsManager,
        hasShowMethod: typeof windowsManager.show === 'function'
      });

      await windowsManager.show(selectedText, position);
      this.logger.debug('WindowsManager.show() completed');

    } else if (window !== window.top) {
      // Iframe - request window creation in main frame
      this.logger.debug('Requesting window creation in main frame', {
        text: selectedText.substring(0, 30) + '...',
        position
      });

      this.requestWindowCreationInMainFrame(selectedText, position);

    } else {
      this.logger.warn('WindowsManager not available and not in iframe context');
    }
  }

  /**
   * Request window creation in main frame (for iframe context)
   */
  requestWindowCreationInMainFrame(selectedText, position) {
    try {
      const message = {
        type: WindowsConfig.CROSS_FRAME.TEXT_SELECTION_WINDOW_REQUEST,
        frameId: this.frameId,
        selectedText: selectedText,
        position: position,
        timestamp: Date.now()
      };

      if (window.parent !== window) {
        window.parent.postMessage(message, '*');
        this.logger.debug('Text selection window request sent to parent frame');
      }

    } catch (error) {
      this.logger.error('Failed to request window creation in main frame:', error);
    }
  }

  /**
   * Dismiss any visible translation windows
   */
  dismissWindow() {
    const windowsManager = this.getWindowsManager();
    if (windowsManager) {
      windowsManager.dismiss();
    }

    // Clear tracking
    this.lastProcessedText = null;
    this.lastProcessedTime = 0;
  }

  /**
   * Check if translation window is visible
   */
  isWindowVisible() {
    const windowsManager = this.getWindowsManager();
    if (windowsManager) {
      return windowsManager.state.isVisible || windowsManager.state.isIconMode;
    }

    // Fallback: check shadow DOM
    const shadowHost = document.getElementById('translate-it-host-main') ||
                      document.getElementById('translate-it-host-iframe');

    if (shadowHost && shadowHost.shadowRoot) {
      const activeWindows = shadowHost.shadowRoot.querySelectorAll('.translation-window');
      const activeIcons = shadowHost.shadowRoot.querySelectorAll('.translation-icon');
      return activeWindows.length > 0 || activeIcons.length > 0;
    }

    return false;
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.lastProcessedText = null;
    this.lastProcessedTime = 0;

    // Call parent cleanup
    super.cleanup();

    this.logger.debug('SelectionManager cleaned up');
  }

  /**
   * Get manager info for debugging
   */
  getInfo() {
    return {
      initialized: true,
      hasWindowsManager: !!this.getWindowsManager(),
      isExcluded: this.isExcluded,
      frameId: this.frameId,
      lastProcessedText: this.lastProcessedText ? this.lastProcessedText.substring(0, 50) + '...' : null,
      lastProcessedTime: this.lastProcessedTime,
      timeSinceLastProcess: this.lastProcessedTime ? Date.now() - this.lastProcessedTime : null
    };
  }
}

export default SelectionManager;