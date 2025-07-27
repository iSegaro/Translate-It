// src/background/handlers/element-selection/handleUpdateSelectElementState.js
import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';

const errorHandler = new ErrorHandler();

/**
 * Handles the 'UPDATE_SELECT_ELEMENT_STATE' message action.
 * This updates the state of element selection mode.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - True if sendResponse will be called asynchronously.
 */
export async function handleUpdateSelectElementState(message, sender, sendResponse) {
  console.log('[Handler:UPDATE_SELECT_ELEMENT_STATE] Processing element selection state update:', message.data);
  
  try {
    const backgroundService = globalThis.backgroundService;
    if (!backgroundService) {
      throw new Error("Background service not initialized.");
    }
    
    const { isActive, selectedElement, tabId } = message.data || {};
    const targetTabId = tabId || sender.tab?.id;
    
    // Update element selection state via background service
    await backgroundService.updateSelectElementState({
      tabId: targetTabId,
      isActive,
      selectedElement,
      timestamp: Date.now()
    });
    
    console.log(`✅ [UPDATE_SELECT_ELEMENT_STATE] Element selection state updated for tab ${targetTabId}`);
    
    sendResponse({ 
      success: true, 
      message: 'Element selection state updated',
      tabId: targetTabId,
      isActive
    });
    return true;
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.ELEMENT_SELECTION,
      context: "handleUpdateSelectElementState",
      messageData: message
    });
    sendResponse({ success: false, error: error.message || 'Element selection state update failed' });
    return false;
  }
}