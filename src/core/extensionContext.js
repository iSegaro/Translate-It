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
   * Handle context errors with appropriate logging and response
   * @param {Error|string} error - The context error
   * @param {string} context - Context where error occurred
   * @param {Object} options - Handling options
   */
  static handleContextError(error, context = 'unknown', options = {}) {
    const {
      silent = true,
      fallbackAction = null
    } = options;

    const message = error?.message || error;
    
    // Always use debug level for context errors to avoid console spam
    logger.debug(`Extension context invalidated in ${context} - handled silently:`, message);

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
    // Use reliable messaging (with retries and port fallback) where available
    return ExtensionContextManager.createSafeWrapper(
      async (msg) => {
        // Use dynamically imported sendReliable to avoid circular dependency.
        try {
          const { sendReliable } = await import('@/shared/messaging/core/ReliableMessaging.js');
          return await sendReliable(msg);
        } catch (err) {
          logger.debug('sendReliable failed in safeSendMessage:', err);
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
   * Handle browser.runtime.lastError with appropriate context error handling
   * @param {string} context - Context where the error occurred
   * @returns {Object} Error information
   */
  static handleRuntimeLastError(context = 'unknown') {
    if (!browser.runtime.lastError) return null

    const errorMessage = browser.runtime.lastError.message
    logger.debug(`[${context}] Clearing runtime.lastError:`, errorMessage)
    
    // Clear the error to prevent console warnings
    browser.runtime.lastError = null

    // Check if it's a back/forward cache error
    const isBackForwardCache = errorMessage?.includes('back/forward cache') ||
                              errorMessage?.includes('moved into back/forward cache')

    if (isBackForwardCache) {
      logger.debug(`[${context}] Back/forward cache disconnect detected - this is expected`)
    } else {
      logger.warn(`[${context}] Unexpected runtime.lastError:`, errorMessage)
    }

    return {
      message: errorMessage,
      isBackForwardCache,
      context
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