// src/background/handlers/element-selection/handleElementSelected.js
import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';

const errorHandler = new ErrorHandler();

/**
 * Handles the 'elementSelected' message action.
 * This processes an element that has been selected for translation.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @returns {Promise<Object>} - Promise that resolves with the response object.
 */
export async function handleElementSelected(message, sender) {
  console.log('[Handler:elementSelected] Processing element selection:', message.data);
  
  try {
    const backgroundService = globalThis.backgroundService;
    if (!backgroundService) {
      throw new Error("Background service not initialized.");
    }
    
    const { element, text, coordinates, tabId } = message.data || {};
    const targetTabId = tabId || sender.tab?.id;
    
    if (!element && !text) {
      throw new Error('Element data or text is required for element selection');
    }
    
    // Process the selected element via background service
    const result = await backgroundService.processSelectedElement({
      element,
      text,
      coordinates,
      tabId: targetTabId,
      sender
    });
    
    console.log(`✅ [elementSelected] Element processed successfully for tab ${targetTabId}`);
    
    return { 
      success: true, 
      message: 'Element selected and processed',
      data: result,
      tabId: targetTabId
    };
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.ELEMENT_SELECTION,
      context: "handleElementSelected",
      messageData: message
    });
    return { success: false, error: error.message || 'Element selection processing failed' };
  }
}