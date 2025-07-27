// src/background/handlers/common/handleShowOSNotification.js
import { getBrowserAPI } from '../../../utils/browser-unified.js';
import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';

const errorHandler = new ErrorHandler();

/**
 * Handles the 'show_os_notification' message action.
 * This creates and displays an OS notification.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - True if sendResponse will be called asynchronously.
 */
export async function handleShowOSNotification(message, sender, sendResponse) {
  console.log('[Handler:show_os_notification] Processing notification request:', message);
  
  try {
    const Browser = await getBrowserAPI();
    const { title, message: notificationMessage, type = 'basic', iconUrl, buttons } = message.data || {};
    
    if (!title || !notificationMessage) {
      throw new Error('Notification title and message are required');
    }
    
    // Create notification options
    const notificationOptions = {
      type: type,
      iconUrl: iconUrl || '/icons/icon-48.png',
      title: title,
      message: notificationMessage
    };
    
    // Add buttons if provided
    if (buttons && Array.isArray(buttons)) {
      notificationOptions.buttons = buttons;
    }
    
    // Create the notification
    const notificationId = await Browser.notifications.create(notificationOptions);
    
    console.log(`✅ [show_os_notification] Notification created with ID: ${notificationId}`);
    
    sendResponse({ 
      success: true, 
      message: 'OS notification created successfully',
      notificationId 
    });
    return true;
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.NOTIFICATION,
      context: "handleShowOSNotification",
      messageData: message
    });
    sendResponse({ success: false, error: error.message || 'Notification creation failed' });
    return false;
  }
}