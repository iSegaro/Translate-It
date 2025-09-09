
import browser from 'webextension-polyfill';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import ExtensionContextManager from '@/core/extensionContext.js';
import { MessageFormat } from './MessagingCore.js';

const logger = getScopedLogger(LOG_COMPONENTS.MESSAGING, 'UnifiedMessaging');

// Operation timeout mapping remains the same
const OPERATION_TIMEOUTS = {
  // Fast operations (UI, settings, status)
  'GET_SETTINGS': 3000,
  'SET_SETTINGS': 3000, 
  'SYNC_SETTINGS': 3000,
  'GET_SELECT_ELEMENT_STATE': 2000,
  'SET_SELECT_ELEMENT_STATE': 2000,
  'SHOW_NOTIFICATION': 2000,
  'DISMISS_NOTIFICATION': 2000,
  'OPEN_SIDEPANEL': 3000,
  'GET_PROVIDER_STATUS': 2000,
  'GET_SERVICE_STATUS': 2000,
  'GET_BACKGROUND_STATUS': 2000,
  'PING': 1000,
  'GET_INFO': 2000,
  'GET_HISTORY': 3000,
  'CLEAR_HISTORY': 3000,
  'ADD_TO_HISTORY': 2000,
  'ACTIVATE_SELECT_ELEMENT_MODE': 3000,
  'DEACTIVATE_SELECT_ELEMENT_MODE': 2000,
  'GET_SELECTED_TEXT': 2000,
  'CANCEL_TRANSLATION': 2000,
  
  // Medium operations (translation, processing)
  'TRANSLATE': 15000,
  'TRANSLATE_SELECTION': 12000,
  'TRANSLATE_PAGE': 20000,
  'TRANSLATE_TEXT': 12000,
  'TRANSLATE_IMAGE': 18000,
  'FETCH_TRANSLATION': 10000,
  'PROCESS_SELECTED_ELEMENT': 8000,
  'TEST_PROVIDER': 8000,
  'TEST_PROVIDER_CONNECTION': 8000,
  'VALIDATE_API_KEY': 6000,
  
  // Long operations (media, capture, TTS)
  'GOOGLE_TTS_SPEAK': 20000,
  'TTS_SPEAK': 20000,
  'PLAY_OFFSCREEN_AUDIO': 15000,
  'SCREEN_CAPTURE': 25000,
  'START_SCREEN_CAPTURE': 20000,
  'CAPTURE_FULL_SCREEN': 25000,
  'START_CAPTURE_SELECTION': 15000,
  'PROCESS_IMAGE_OCR': 30000,
  'OCR_PROCESS': 30000,
  'CAPTURE_TRANSLATE_IMAGE_DIRECT': 35000,
  'PROCESS_SCREEN_CAPTURE': 20000,
  'START_AREA_CAPTURE': 15000,
  'START_SCREEN_AREA_SELECTION': 10000,
  
  // Default timeout
  'DEFAULT': 8000
};

function getTimeoutForAction(action) {
  return OPERATION_TIMEOUTS[action] || OPERATION_TIMEOUTS.DEFAULT || 8000;
}

/**
 * Creates a promise that rejects after a specified timeout.
 * @param {number} ms - Timeout in milliseconds.
 * @param {string} action - The action name for the error message.
 * @returns {Promise<never>} A promise that always rejects.
 */
function timeout(ms, action) {
  return new Promise((_, reject) => {
    setTimeout(() => {
      const timeoutError = new Error(`Operation '${action}' timed out after ${ms}ms`);
      timeoutError.type = 'OPERATION_TIMEOUT';
      reject(timeoutError);
    }, ms);
  });
}

/**
 * Unified messaging system - Refactored for targeted messaging.
 * Sends messages to the background script, which acts as a central dispatcher.
 */
export async function sendMessage(message, options = {}) {
  const { timeout: customTimeout } = options;
  const actionTimeout = customTimeout || getTimeoutForAction(message.action);

  logger.debug('Sending message to background:', {
    action: message.action,
    messageId: message.messageId,
    context: message.context,
    timeout: actionTimeout,
  });

  try {
    if (!ExtensionContextManager.isValidSync()) {
      const contextError = new Error('Extension context invalidated');
      contextError.type = 'EXTENSION_CONTEXT_INVALIDATED';
      throw contextError;
    }

    const sendPromise = browser.runtime.sendMessage(message);

    const response = await Promise.race([
      sendPromise,
      timeout(actionTimeout, message.action),
    ]);

    if (!response) {
      throw new Error(`No response received for ${message.action}`);
    }

    if (response.success === false) {
      // Re-create the error object from the response for a proper stack trace
      const error = new Error(response.error?.message || 'An unknown error occurred');
      Object.assign(error, response.error);
      throw error;
    }

    logger.debug('Message response received:', {
      action: message.action,
      messageId: message.messageId,
      success: true,
    });

    return response;
  } catch (error) {
    logger.error(`Message failed for ${message.action}:`, error.message);

    if (ExtensionContextManager.isContextError(error)) {
      ExtensionContextManager.handleContextError(error, `UnifiedMessaging.${message.action}`);
    }

    // Re-throw the error to be handled by the caller
    throw error;
  }
}

export default { sendMessage };
