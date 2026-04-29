
import browser from 'webextension-polyfill';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import ExtensionContextManager from '@/core/extensionContext.js';
import { unifiedTranslationCoordinator } from './UnifiedTranslationCoordinator.js';
import { streamingTimeoutManager } from './StreamingTimeoutManager.js';
import { isFatalError, matchErrorToType, isSilentError } from '@/shared/error-management/ErrorMatcher.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { isRestrictedUrl } from '@/core/tabPermissions.js';

const logger = getScopedLogger(LOG_COMPONENTS.MESSAGING, 'UnifiedMessaging');

// Operation timeout mapping
const OPERATION_TIMEOUTS = {
  'GET_SETTINGS': 3000,
  'SET_SETTINGS': 3000,
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
  'TRANSLATE': 20000,
  'TRANSLATE_SELECTION': 15000,
  'TRANSLATE_PAGE': 20000,
  'TRANSLATE_TEXT': 15000,
  'TRANSLATE_IMAGE': 18000,
  'page-translate-batch': 60000,
  'FETCH_TRANSLATION': 10000,
  'PROCESS_SELECTED_ELEMENT': 8000,
  'TEST_PROVIDER': 8000,
  'TEST_PROVIDER_CONNECTION': 8000,
  'VALIDATE_API_KEY': 6000,
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
  'DEFAULT': 8000
};

function getTimeoutForAction(action, context = null) {
  if (action === 'TRANSLATE' && (context === 'select-element' || (typeof context === 'object' && context !== null && context.mode === 'select_element'))) {
    return 300000; 
  }
  return (action && OPERATION_TIMEOUTS[action]) || OPERATION_TIMEOUTS.DEFAULT || 8000;
}

function createTimeout(ms, action) {
  let timeoutId;
  const promise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const timeoutError = new Error(`Operation '${action || 'unknown'}' timed out after ${ms}ms`);
      timeoutError.type = 'OPERATION_TIMEOUT';

      if (ExtensionContextManager.isValidSync()) {
        ErrorHandler.getInstance().handle(timeoutError, {
          context: 'unified-messaging-timeout',
          action: action,
          showToast: false
        }).catch(() => {});
      }

      reject(timeoutError);
    }, ms);
  });

  return {
    promise,
    clear: () => clearTimeout(timeoutId)
  };
}

export async function sendMessage(message, options = {}) {
  const { forceRegular = false } = options;
  if (!message) return null;

  if (!forceRegular && isTranslationAction(message.action)) {
    try {
      return await unifiedTranslationCoordinator.coordinateTranslation(message, options);
    } catch (error) {
      if (isFatalError(error)) throw error;
      
      const isStreamingTimeout = error.message && typeof error.message === 'string' && error.message.includes('timed out');
      if (isStreamingTimeout && message.messageId && !String(message.messageId).startsWith('fallback-')) {
        try {
          const checkResponse = await browser.runtime.sendMessage({
            action: 'CHECK_TRANSLATION_STATUS',
            messageId: message.messageId
          });
          if (checkResponse && checkResponse.completed) return checkResponse.results;
        } catch { /* ignore */ }
      }

      if (message.messageId && streamingTimeoutManager.shouldContinue(message.messageId) === false) {
        throw new Error('Translation cancelled by user');
      }

      const fallbackMessage = {
        ...message,
        messageId: `fb-${Math.random().toString(36).substr(2, 6)}`
      };

      return await sendRegularMessage(fallbackMessage, options);
    }
  }

  return await sendRegularMessage(message, options);
}

export async function sendRegularMessage(message, options = {}) {
  if (!message) return null;
  const { timeout: customTimeout, silent = false } = options;
  const actionTimeout = customTimeout || getTimeoutForAction(message.action, message.context || message.data);

  try {
    if (!ExtensionContextManager.isValidSync()) {
      const contextError = new Error('Extension context invalidated');
      contextError.type = 'EXTENSION_CONTEXT_INVALIDATED';
      throw contextError;
    }

    if (message.messageId && streamingTimeoutManager.shouldContinue(message.messageId) === false) {
      const cancelError = new Error(ErrorTypes.USER_CANCELLED);
      cancelError.type = ErrorTypes.USER_CANCELLED;
      throw cancelError;
    }

    const sendPromise = browser.runtime.sendMessage(message);
    const { promise: timeoutPromise, clear: clearTimeoutTimer } = createTimeout(actionTimeout, message.action);

    let cancellationInterval;
    const cancellationPromise = new Promise((_, reject) => {
      cancellationInterval = setInterval(() => {
        if (message.messageId && streamingTimeoutManager.shouldContinue(message.messageId) === false) {
          if (cancellationInterval) clearInterval(cancellationInterval);
          const cancelError = new Error(ErrorTypes.USER_CANCELLED);
          cancelError.type = ErrorTypes.USER_CANCELLED;
          reject(cancelError);
        } else if (window.selectElementHandlingESC === true) {
          if (cancellationInterval) clearInterval(cancellationInterval);
          const cancelError = new Error('Translation cancelled by user ESC');
          cancelError.type = 'USER_CANCELLED';
          reject(cancelError);
        }
      }, 50);
    });

    let response;
    try {
      response = await Promise.race([sendPromise, cancellationPromise, timeoutPromise]);
    } finally {
      clearTimeoutTimer();
      if (cancellationInterval) clearInterval(cancellationInterval);
    }

    if (!response) {
      throw new Error(`No response for ${message.action || 'unknown'}`);
    }

    if (response && response.success === false) {
      if (response.isRestrictedPage || (response.tabUrl && isRestrictedUrl(response.tabUrl))) {
        return response;
      }

      // Safe error extraction
      let errorMessage = '';
      if (response.error) {
        if (typeof response.error === 'string') {
          errorMessage = response.error;
        } else if (typeof response.error === 'object') {
          // Try to find the most descriptive error message in common fields
          errorMessage = response.error.message || 
                         response.error.error || 
                         response.error.statusText ||
                         response.error.reason ||
                         response.message || 
                         response.statusText;
          
          // If still no message but it's an object, try to stringify it (excluding large partial results)
          if (!errorMessage && response.error !== null) {
            try {
              const cleanError = { ...response.error };
              delete cleanError.partialResults;
              errorMessage = JSON.stringify(cleanError);
              if (errorMessage === '{}') errorMessage = '';
            } catch {
              errorMessage = '';
            }
          }
        }
      } else if (response.message) {
        errorMessage = response.message;
      }
      
      if (!errorMessage) {
        errorMessage = (response.error && typeof response.error.toString === 'function' && response.error.toString() !== '[object Object]') 
                        ? response.error.toString() 
                        : 'Unknown technical error';
      }
      
      const error = new Error(String(errorMessage));

      // Safe property copy
      if (response.error && typeof response.error === 'object') {
        Object.keys(response.error).forEach(key => {
          if (key !== 'partialResults') error[key] = response.error[key];
        });
      }
      Object.keys(response).forEach(key => {
        if (key !== 'partialResults' && key !== 'error') error[key] = response[key];
      });

      throw error;
    }

    return response;
  } catch (error) {
    const errorType = matchErrorToType(error);

    if (!silent) {
      logger.debug(`Message error: ${message.action} (${errorType})`, { 
        msg: (error && typeof error.message === 'string') ? error.message : 'No message' 
      });
    }

    if (isSilentError(errorType)) throw error;

    await ErrorHandler.getInstance().handle(error, {
      context: 'UnifiedMessaging',
      action: message.action,
      showToast: false
    }).catch(() => {});

    if (ExtensionContextManager.isContextError(error)) {
      ExtensionContextManager.handleContextError(error, `UnifiedMessaging.${message.action}`);
    }

    throw error;
  }
}

function isTranslationAction(action) {
  return ['TRANSLATE', 'TRANSLATE_SELECTION', 'TRANSLATE_TEXT', 'TRANSLATE_PAGE', 'TRANSLATE_IMAGE'].includes(action);
}

export default { sendMessage, sendRegularMessage };
