/**
 * TextSelectionManager - Simplified wrapper
 *
 * This is a compatibility wrapper around the new SimpleTextSelectionHandler.
 * It maintains the same interface as the old complex TextSelectionManager
 * but uses the simplified implementation internally.
 *
 * This file exists to maintain backward compatibility while we transition
 * to the new simplified architecture.
 */

import { SimpleTextSelectionHandler } from '@/features/text-selection/handlers/SimpleTextSelectionHandler.js';
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";

export class TextSelectionManager {
  constructor(options = {}) {
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'TextSelectionManager');

    // Create the simplified handler internally
    this.simpleHandler = new SimpleTextSelectionHandler(options);

    // Legacy compatibility properties
    this.isActive = false;
    this.featureManager = options.featureManager;
    this.frameId = Math.random().toString(36).substring(7);

    this.logger.debug('TextSelectionManager (simplified wrapper) initialized');
  }

  /**
   * Activate the text selection manager
   */
  async activate() {
    const success = await this.simpleHandler.activate();
    this.isActive = success;
    return success;
  }

  /**
   * Deactivate the text selection manager
   */
  async deactivate() {
    const success = await this.simpleHandler.deactivate();
    this.isActive = !success;
    return success;
  }

  /**
   * Handle text selection - simplified interface
   */
  async handleTextSelection(event) {
    // The new simple handler doesn't need this complex interface
    // It handles everything automatically through selectionchange events
    this.logger.debug('handleTextSelection called - now handled automatically by SimpleTextSelectionHandler');

    // If needed, we can manually trigger processing
    if (event && event.selection && event.selection.toString().trim()) {
      await this.simpleHandler.selectionManager?.processSelection(
        event.selection.toString().trim(),
        event.selection
      );
    }
  }

  /**
   * Legacy method - no longer needed with simplified approach
   */
  handleDoubleClick(event) {
    this.logger.debug('handleDoubleClick called - now handled by TextFieldDoubleClickHandler');
    // Double-click for text fields is now handled by TextFieldDoubleClickHandler
    // Page text selection uses only selectionchange events
  }

  /**
   * Legacy method - simplified
   */
  async processSelectedText(selectedText, event, options = {}) {
    if (this.simpleHandler.selectionManager) {
      const selection = window.getSelection();
      await this.simpleHandler.selectionManager.processSelection(selectedText, selection);
    }
  }

  /**
   * Cancel selection translation
   */
  cancelSelectionTranslation() {
    // The simple handler doesn't use timeouts like the old system
    // Dismissing is handled automatically
    if (this.simpleHandler.selectionManager) {
      this.simpleHandler.selectionManager.dismissWindow();
    }
  }

  /**
   * Legacy drag detection methods - no longer needed
   */
  startDragDetection(event) {
    // No-op - drag detection removed for simplicity
    this.logger.debug('startDragDetection called - no longer needed with simplified approach');
  }

  endDragDetection(event) {
    // No-op - drag detection removed for simplicity
    this.logger.debug('endDragDetection called - no longer needed with simplified approach');
  }

  /**
   * Update Ctrl key state
   */
  updateCtrlKeyState(pressed) {
    this.simpleHandler.ctrlKeyPressed = pressed;
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.simpleHandler) {
      this.simpleHandler.deactivate();
    }
  }

  /**
   * Get manager info for debugging
   */
  getInfo() {
    const simpleStatus = this.simpleHandler.getStatus();
    return {
      isSimplifiedWrapper: true,
      initialized: true,
      isActive: this.isActive,
      frameId: this.frameId,
      simpleHandlerStatus: simpleStatus
    };
  }

  // Legacy compatibility properties
  get isDragging() {
    return false; // Always false - no more drag detection
  }

  get justFinishedDrag() {
    return false; // Always false - no more drag detection
  }

  get preventDismissOnNextClear() {
    return false; // Always false - no more drag detection
  }

  get pendingSelection() {
    return null; // Always null - no more pending selections
  }

  get lastDoubleClickTime() {
    return 0; // Always 0 - double-click handled separately
  }

  get doubleClickWindow() {
    return 500; // Legacy value for compatibility
  }

  get doubleClickProcessing() {
    return false; // Always false - handled by separate handler
  }

  get ctrlKeyPressed() {
    return this.simpleHandler?.ctrlKeyPressed || false;
  }

  set ctrlKeyPressed(value) {
    if (this.simpleHandler) {
      this.simpleHandler.ctrlKeyPressed = value;
    }
  }
}

export default TextSelectionManager;