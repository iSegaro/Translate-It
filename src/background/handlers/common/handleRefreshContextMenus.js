// src/background/handlers/common/handleRefreshContextMenus.js
import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';
import { createLogger } from '@/utils/core/logger.js';

const logger = createLogger('Core', 'handleRefreshContextMenus');

const errorHandler = new ErrorHandler();

/**
 * Handles the 'REFRESH_CONTEXT_MENUS' message action.
 * This refreshes the browser context menus based on current settings.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - True if sendResponse will be called asynchronously.
 */
export async function handleRefreshContextMenus(message, sender, sendResponse) {
  logger.debug('[Handler:REFRESH_CONTEXT_MENUS] Processing context menu refresh:', message);
  
  try {
    const backgroundService = globalThis.backgroundService;
    
    if (!backgroundService) {
      throw new Error('Background service not available');
    }
    
    // Refresh context menus via the background service
    await backgroundService.refreshContextMenus();
    
    logger.debug('✅ [REFRESH_CONTEXT_MENUS] Context menus refreshed successfully');
    
    sendResponse({ 
      success: true, 
      message: 'Context menus refreshed successfully',
      timestamp: Date.now()
    });
    return true;
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.CONTEXT_MENU,
      context: "handleRefreshContextMenus",
      messageData: message
    });
    sendResponse({ success: false, error: error.message || 'Context menu refresh failed' });
    return false;
  }
}