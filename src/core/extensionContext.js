// src/core/extensionContext.js
// Centralized Extension Context Management

import browser from 'webextension-polyfill';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'ExtensionContext');

/**
 * Centralized manager for extension context validation and error handling
 * Single source of truth for all extension context related operations
 */
export class ExtensionContextManager {
  // Static state for tracking user cancellations across the app
  static userCancelledOperations = new Set();

  /**
   * Mark an operation as user-cancelled
   * @param {string} operationId - Operation identifier
   */
  static markUserCancelled(operationId) {
    ExtensionContextManager.userCancelledOperations.add(operationId);
  }

  /**
   * Check if an operation was user-cancelled
   * @param {string} operationId - Operation identifier
   * @returns {boolean} True if user cancelled
   */
  static isUserCancelled(operationId) {
    return ExtensionContextManager.userCancelledOperations.has(operationId);
  }

  /**
   * Clear user cancellation for an operation
   * @param {string} operationId - Operation identifier
   */
  static clearUserCancelled(operationId) {
    ExtensionContextManager.userCancelledOperations.delete(operationId);
  }

  /**
   * Clear all user cancellations
   */
  static clearAllUserCancellations() {
    ExtensionContextManager.userCancelledOperations.clear();
  }

  /**
   * Synchronous extension context validation (fast check)
   * @returns {boolean} True if extension context is valid
   */
  static isValidSync() {
    try {
      // Test if browser.runtime.getURL actually works (not just exists)
      browser.runtime.getURL("test");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Asynchronous extension context validation (comprehensive check)
   * @returns {Promise<boolean>} True if extension context is valid
   */
  static async isValidAsync() {
    try {
      return !!(browser?.runtime?.id && browser?.storage?.local);
    } catch {
      return false;
    }
  }

  /**
   * Check if an error is related to extension context invalidation
   * @param {Error|string} error - Error to check
   * @returns {boolean} True if error is context-related
   */
  static isContextError(error) {
    const errorType = matchErrorToType(error?.message || error);
    return errorType === ErrorTypes.EXTENSION_CONTEXT_INVALIDATED || 
           errorType === ErrorTypes.CONTEXT;
  }

  /**
   * Get a human-readable reason for a context error
   * @param {Error|string} error - The context error
   * @returns {string} Human-readable reason
   */
  static getContextErrorReason(error) {
    const msg = error?.message || error;

    if (msg.includes('extension context invalidated')) return 'Extension reloaded';
    if (msg.includes('message channel closed')) return 'Message channel closed';
    if (msg.includes('receiving end does not exist')) return 'Background script unavailable';
    if (msg.includes('page moved to cache') || msg.includes('back/forward cache')) return 'Page cached by browser';
    if (msg.includes('could not establish connection')) return 'Connection failed';
    if (msg.includes('message port closed')) return 'Message port closed';

    return 'Unknown context issue';
  }

  /**
   * Handle context errors with appropriate logging and response
   * @param {Error|string} error - The context error
   * @param {string} context - Context where error occurred
   * @param {Object} options - Handling options
   */
  static handleContextError(error, context = 'unknown', options = {}) {
    const {
      silent = true,
      fallbackAction = null,
      operationId = null
    } = options;

    const message = error?.message || error;
    const reason = ExtensionContextManager.getContextErrorReason(error);

    // Check if this error is from a user-cancelled operation
    if (operationId && ExtensionContextManager.isUserCancelled(operationId)) {
      logger.info(`Operation cancelled by user in ${context}`, {
        context,
        operationId,
        reason: 'User cancelled operation'
      });
      // Clean up the cancellation flag
      ExtensionContextManager.clearUserCancelled(operationId);
      return;
    }

    // Use debug level for context errors - these are expected during extension lifecycle
    logger.debug(`Extension context error in ${context}`, {
      context,
      reason,
      originalError: message
    });

    // Execute fallback action if provided
    if (fallbackAction && typeof fallbackAction === 'function') {
      try {
        fallbackAction();
      } catch (fallbackError) {
        logger.warn(`Fallback action failed in ${context}:`, fallbackError);
      }
    }

    return { handled: true, silent };
  }

  /**
   * Create a safe wrapper for context-sensitive operations
   * @param {Function} operation - Operation to wrap
   * @param {Object} options - Wrapper options
   * @returns {Function} Wrapped operation
   */
  static createSafeWrapper(operation, options = {}) {
    const {
      context = 'operation',
      fallbackValue = null,
      validateAsync = false
    } = options;

    return async function wrappedOperation(...args) {
      try {
        // Check context validity before operation
        const isValid = validateAsync 
          ? await ExtensionContextManager.isValidAsync()
          : ExtensionContextManager.isValidSync();

        if (!isValid) {
          ExtensionContextManager.handleContextError(
            'Extension context invalid before operation',
            context
          );
          return fallbackValue;
        }

        // Execute operation
        return await operation(...args);
        
      } catch (error) {
        if (ExtensionContextManager.isContextError(error)) {
          ExtensionContextManager.handleContextError(error, context);
          return fallbackValue;
        }
        // Re-throw non-context errors
        throw error;
      }
    };
  }

  /**
   * Safe wrapper for browser.runtime.sendMessage calls
   * @param {Object} message - Message to send
   * @param {string} context - Context identifier
   * @returns {Promise} Safe message sending promise
   */
  static async safeSendMessage(message, context = 'messaging') {
    // Use unified messaging system
    return ExtensionContextManager.createSafeWrapper(
      async (msg) => {
        // Use dynamically imported UnifiedMessaging to avoid circular dependency.
        try {
          const { sendMessage } = await import('@/shared/messaging/core/UnifiedMessaging.js');
          return await sendMessage(msg);
        } catch (err) {
          logger.debug('UnifiedMessaging failed in safeSendMessage:', err);
          throw err;
        }
      },
      { 
        context: `sendMessage-${context}`,
        fallbackValue: null,
        validateAsync: false
      }
    )(message);
  }

  /**
   * Safe wrapper for i18n operations
   * @param {Function} i18nOperation - i18n operation to execute
   * @param {string} context - Context identifier  
   * @param {*} fallbackValue - Value to return on context error
   * @returns {Promise} Safe i18n operation
   */
  static async safeI18nOperation(i18nOperation, context = 'i18n', fallbackValue = null) {
    return ExtensionContextManager.createSafeWrapper(
      i18nOperation,
      {
        context: `i18n-${context}`,
        fallbackValue,
        validateAsync: false
      }
    )();
  }

  /**
   * Safe wrapper for storage operations
   * @param {Function} storageOperation - Storage operation to execute
   * @param {string} context - Context identifier
   * @param {*} fallbackValue - Value to return on context error
   * @returns {Promise} Safe storage operation
   */
  static async safeStorageOperation(storageOperation, context = 'storage', fallbackValue = null) {
    return ExtensionContextManager.createSafeWrapper(
      storageOperation,
      {
        context: `storage-${context}`,
        fallbackValue,
        validateAsync: true
      }
    )();
  }

  /**
   * Handle browser.runtime.lastError with centralized error management
   * @param {string} context - Context where the error occurred
   * @returns {Object} Error information and handling result
   */
  static handleRuntimeLastError(context = 'unknown') {
    if (!browser.runtime.lastError) return null

    const errorMessage = browser.runtime.lastError.message
    
    // Use centralized error type detection
    const errorType = matchErrorToType(errorMessage)
    const isContextError = errorType === ErrorTypes.CONTEXT || 
                          errorType === ErrorTypes.EXTENSION_CONTEXT_INVALIDATED

    if (isContextError) {
      // Use centralized context error handling (silent)
      ExtensionContextManager.handleContextError(errorMessage, context)
      
      // Access runtime.lastError to clear console warnings
      void browser.runtime.lastError
      
      return {
        message: errorMessage,
        type: errorType,
        context,
        handledSilently: true,
        isContextError: true
      }
    } else {
      // Non-context errors still logged as warnings
      logger.warn(`[${context}] Runtime lastError (non-context):`, errorMessage)
      
      // Access runtime.lastError to clear console warnings
      void browser.runtime.lastError
      
      return {
        message: errorMessage,
        type: errorType,
        context,
        handledSilently: false,
        isContextError: false
      }
    }
  }
}

// Convenience exports for backward compatibility
export const isExtensionContextValid = ExtensionContextManager.isValidSync;
export const isExtensionContextValidAsync = ExtensionContextManager.isValidAsync;
export const isContextError = ExtensionContextManager.isContextError;
export const handleContextError = ExtensionContextManager.handleContextError;

// Default export
export default ExtensionContextManager;