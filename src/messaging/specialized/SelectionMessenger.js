/**
 * Specialized Selection Messenger  
 * Handles all element selection related messaging operations
 */

import { MessageActions } from '../core/MessageActions.js';

export class SelectionMessenger {
  constructor(context, parentMessenger) {
    this.context = context;
    this.messenger = parentMessenger;
  }

  /**
   * Activate element selection mode
   * @param {string} mode - Selection mode ('translate', 'capture', 'analyze')
   * @param {Object} options - Selection options
   * @returns {Promise<Object>} Activation result
   */
  async activateMode(mode = MessageActions.TRANSLATE, options = {}) {
    const selectionOptions = {
      mode,
      tabId: options.tabId,
      highlightColor: options.highlightColor || '#ff0000',
      showTooltip: options.showTooltip !== false,
      ...options
    };

    return this.messenger.sendMessage({
      action: MessageActions.ACTIVATE_SELECT_ELEMENT_MODE,
      data: selectionOptions,
      timestamp: Date.now()
    });
  }

  /**
   * Deactivate element selection mode
   * @returns {Promise<Object>} Deactivation result
   */
  async deactivateMode() {
    return this.messenger.sendMessage({
      action: MessageActions.DEACTIVATE_SELECT_ELEMENT_MODE,
      timestamp: Date.now()
    });
  }

  /**
   * Get current selection state
   * @returns {Promise<Object>} Current selection state
   */
  async getSelectionState() {
    return this.messenger.sendMessage({
      action: MessageActions.GET_SELECT_ELEMENT_STATE,
      timestamp: Date.now()
    });
  }
}

export default SelectionMessenger;