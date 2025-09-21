/**
 * TextSelectionHandler - Simplified wrapper
 *
 * This is a compatibility wrapper around SimpleTextSelectionHandler.
 * It maintains the same interface as the old complex TextSelectionHandler
 * but uses the simplified implementation internally.
 *
 * This approach allows us to keep the FeatureManager integration working
 * while using the new simplified architecture under the hood.
 */

import { SimpleTextSelectionHandler } from './SimpleTextSelectionHandler.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'TextSelectionHandler');

export class TextSelectionHandler {
  constructor(options = {}) {
    // Create the simplified handler internally
    this.simpleHandler = new SimpleTextSelectionHandler(options);

    // Legacy compatibility properties
    this.isActive = false;
    this.featureManager = options.featureManager;

    logger.debug('TextSelectionHandler (simplified wrapper) initialized');
  }

  /**
   * Activate text selection handling
   */
  async activate() {
    logger.debug('Activating TextSelectionHandler (simplified)');
    const success = await this.simpleHandler.activate();
    this.isActive = success;

    if (success) {
      logger.info('TextSelectionHandler (simplified) activated successfully');
    }

    return success;
  }

  /**
   * Deactivate text selection handling
   */
  async deactivate() {
    logger.debug('Deactivating TextSelectionHandler (simplified)');
    const success = await this.simpleHandler.deactivate();
    this.isActive = !success;

    if (success) {
      logger.info('TextSelectionHandler (simplified) deactivated successfully');
    }

    return success;
  }

  /**
   * Get the text selection manager (compatibility method)
   */
  getTextSelectionManager() {
    return this.simpleHandler.getSelectionManager();
  }

  /**
   * Check if there's an active selection
   */
  hasActiveSelection() {
    return this.simpleHandler.hasActiveSelection();
  }

  /**
   * Get current selection text
   */
  getCurrentSelection() {
    return this.simpleHandler.getCurrentSelection();
  }

  /**
   * Cancel selection (compatibility method)
   */
  cancelSelection() {
    if (this.simpleHandler.selectionManager) {
      this.simpleHandler.selectionManager.dismissWindow();
    }
  }

  /**
   * Get status for debugging
   */
  getStatus() {
    const simpleStatus = this.simpleHandler.getStatus();
    return {
      isSimplifiedWrapper: true,
      handlerActive: this.isActive,
      simpleHandlerStatus: simpleStatus
    };
  }

  /**
   * Legacy methods - no longer needed but kept for compatibility
   */
  setupSelectionListeners() {
    logger.debug('setupSelectionListeners called - handled automatically by SimpleTextSelectionHandler');
    // No-op - handled automatically by SimpleTextSelectionHandler
  }

  _isFromRecentDoubleClick() {
    // Always false - double-click handled by separate module
    return false;
  }

  _ensureManagerAvailable() {
    // Always true - SimpleTextSelectionHandler handles this
    return true;
  }
}

export default TextSelectionHandler;