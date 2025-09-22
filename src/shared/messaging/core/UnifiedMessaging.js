
import browser from 'webextension-polyfill';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import ExtensionContextManager from '@/core/extensionContext.js';
import { unifiedTranslationCoordinator } from './UnifiedTranslationCoordinator.js';
import { generateMessageId } from './MessagingCore.js';

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
  'GOOGLE_TTS_PAUSE': 3000,
  'GOOGLE_TTS_RESUME': 3000,
  'TTS_STOP': 3000,
  'GOOGLE_TTS_GET_STATUS': 2000,
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
 * Unified messaging system with streaming support
 * Coordinates between regular messages and streaming operations
 */
export async function sendMessage(message, options = {}) {
  const { forceRegular = false } = options;

  // Check if this should be handled as a streaming operation
  if (!forceRegular && isTranslationAction(message.action)) {
    logger.debug('Routing translation message through coordinator:', {
      action: message.action,
      messageId: message.messageId,
      context: message.context
    });

    try {
      return await unifiedTranslationCoordinator.coordinateTranslation(message, options);
    } catch (error) {
      // If coordination fails, fall back to regular messaging
      logger.warn('Translation coordination failed, falling back to regular messaging:', error);

      // Create a new message with a fresh messageId to avoid duplicate detection
      const fallbackMessage = {
        ...message,
        messageId: `fallback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      };

      logger.info('Using fallback message with new ID:', {
        originalId: message.messageId,
        fallbackId: fallbackMessage.messageId
      });

      return await sendRegularMessage(fallbackMessage, options);
    }
  }

  // Regular messaging path
  return await sendRegularMessage(message, options);
}

/**
 * Send regular (non-streaming) message
 */
export async function sendRegularMessage(message, options = {}) {
  const { timeout: customTimeout } = options;
  const actionTimeout = customTimeout || getTimeoutForAction(message.action);

  logger.debug('Sending regular message to background:', {
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
      // Debug logging to understand response structure
      logger.debug('Response with success=false received:', {
        response,
        responseKeys: Object.keys(response),
        hasError: !!response.error,
        hasMessage: !!response.message,
        errorType: typeof response.error,
        messageType: typeof response.message
      });

      // Import tabPermissions utilities to check for restricted pages
      const { isRestrictedUrl } = await import('@/core/tabPermissions.js');

      // Check if this is a restricted page error - if so, return the response instead of throwing
      if (response.isRestrictedPage || (response.tabUrl && isRestrictedUrl(response.tabUrl))) {
        logger.debug('Restricted page detected, returning response without throwing error');
        return response;
      }

      // Re-create the error object from the response for a proper stack trace
      const errorMessage = response.error?.message || response.message || response.error || 'An unknown error occurred';
      const error = new Error(errorMessage);

      // Copy all response properties to error object for error matching
      Object.assign(error, response.error || {});
      Object.assign(error, response);

      throw error;
    }

    logger.debug('Regular message response received:', {
      action: message.action,
      messageId: message.messageId,
      success: true,
    });

    return response;
  } catch (error) {
    // Import ErrorMatcher to detect error types
    const { matchErrorToType } = await import('@/shared/error-management/ErrorMatcher.js');
    const { ErrorTypes } = await import('@/shared/error-management/ErrorTypes.js');
    
    const errorType = matchErrorToType(error);

    // Debug log to see what error type is detected
    logger.debug(`Error type detected: ${errorType} for message: ${message.action}`, {
      errorMessage: error.message,
      errorObject: error
    });

    // Handle different error types with appropriate logging levels
    if (message.action && (message.action.includes('TTS_STOP') || message.action.includes('GOOGLE_TTS_STOP')) &&
        (errorType === ErrorTypes.TTS_NO_RESPONSE ||
         errorType === ErrorTypes.TTS_OFFSCREEN_CLOSED ||
         errorType === ErrorTypes.CONTEXT ||
         errorType === ErrorTypes.EXTENSION_CONTEXT_INVALIDATED)) {
      // TTS stop errors are expected when offscreen document is closed
      logger.debug(`TTS stop failed (expected): ${message.action} - ${error.message}`);
    } else if (errorType === ErrorTypes.TAB_BROWSER_INTERNAL ||
               errorType === ErrorTypes.TAB_EXTENSION_PAGE ||
               errorType === ErrorTypes.TAB_LOCAL_FILE ||
               errorType === ErrorTypes.TAB_NOT_ACCESSIBLE ||
               errorType === ErrorTypes.TAB_RESTRICTED) {
      // Tab accessibility errors should be debug level
      logger.debug(`Message failed for ${message.action} (restricted page):`, error.message || error);
    } else {
      // All other errors are logged as error level
      logger.error(`Message failed for ${message.action}:`, {
        message: error.message || error,
        errorType: errorType,
        fullError: error
      });
    }

    // Extension context errors are handled automatically by ExtensionContextManager.isContextError
    if (ExtensionContextManager.isContextError(error)) {
      ExtensionContextManager.handleContextError(error, `UnifiedMessaging.${message.action}`);
    }

    // Re-throw the error to be handled by the caller
    throw error;
  }
}

/**
 * Check if action is a translation action that may benefit from streaming coordination
 * @param {string} action - Message action
 * @returns {boolean} - Whether action is translation-related
 */
function isTranslationAction(action) {
  const translationActions = [
    'TRANSLATE',
    'TRANSLATE_SELECTION',
    'TRANSLATE_TEXT',
    'TRANSLATE_PAGE',
    'TRANSLATE_IMAGE'
  ];

  return translationActions.includes(action);
}

export default { sendMessage, sendRegularMessage };
