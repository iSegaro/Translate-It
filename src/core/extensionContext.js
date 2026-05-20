// src/core/extensionContext.js
// Centralized Extension Context Management

import browser from "webextension-polyfill";
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { 
  contextState, 
  isValidSync as coreIsValidSync, 
  isContextError as coreIsContextError,
  ENVIRONMENTS as CORE_ENVIRONMENTS,
  getActiveEnvironment as coreGetActiveEnvironment
} from "./contextCore.js";
import { handleContextError as coreHandleContextError } from "./contextErrorHandler.js";

const logger = getScopedLogger(LOG_COMPONENTS.CORE, "ExtensionContext");

/**
 * Centralized manager for extension context validation and error handling.
 * Provides unified logic for detecting environment, validating context,
 * and handling context-related errors across all browser platforms.
 * 
 * This class acts as a high-level Facade over contextCore and contextErrorHandler
 * to provide a consistent API for the rest of the application.
 */
export class ExtensionContextManager {
  /**
   * Centralized environment constants for the extension execution contexts.
   */
  static ENVIRONMENTS = CORE_ENVIRONMENTS;

  /** @private Internal flag for context invalidation */
  static get _isContextInvalidated() { return contextState.isInvalidated; }
  static set _isContextInvalidated(val) { contextState.isInvalidated = val; }

  /** @private Internal flag for notification tracking */
  static get _contextNotificationShown() { return contextState.notificationShown; }
  static set _contextNotificationShown(val) { contextState.notificationShown = val; }

  /**
   * Cached base URL of the extension (e.g., chrome-extension://[id]/).
   * Used as a fallback when browser.runtime.getURL fails during invalidation.
   * @private
   */
  static _cachedBaseUrl = (() => {
    try {
      if (
        browser?.runtime?.getURL &&
        typeof browser.runtime.getURL === "function"
      ) {
        return browser.runtime.getURL("");
      }
    } catch {
      return "";
    }
    return "";
  })();

  /** Fallback icon used when extension context is invalidated and assets cannot be loaded */
  static GENERIC_FALLBACK_ICON =
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNjY2MiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCI+PC9jaXJjbGU+PGxpbmUgeDE9IjIiIHkxPSIxMiIgeDI9IjIyIiB5Mj0iMTIiPjwvbGluZT48cGF0aCBkPSJNMTIgMmExNS4zIDE1LjMgMCAwIDEgNCAxMGExNS4zIDE1LjMgMCAwIDEtNCAxMGExNS4zIDE1LjMgMCAwIDEtNC0xMGExNS4zIDE1LjMgMCAwIDEgNC0xMHoiPjwvcGF0aD48L3N2Zz4=";

  /**
   * Detects and returns the current execution environment.
   * @returns {string} One of ExtensionContextManager.ENVIRONMENTS
   */
  static getActiveEnvironment() {
    return coreGetActiveEnvironment();
  }

  /**
   * Checks if the current context is a content script.
   * @returns {boolean}
   */
  static isContentScript() {
    return ExtensionContextManager.getActiveEnvironment() === ExtensionContextManager.ENVIRONMENTS.CONTENT;
  }

  /**
   * Checks if the current context is the background service worker.
   * @returns {boolean}
   */
  static isBackground() {
    return ExtensionContextManager.getActiveEnvironment() === ExtensionContextManager.ENVIRONMENTS.BACKGROUND;
  }

  /** Registry of operations cancelled by the user to prevent further processing */
  static userCancelledOperations = new Set();

  /**
   * Marks an operation as cancelled.
   * @param {string} operationId 
   */
  static markUserCancelled(operationId) {
    ExtensionContextManager.userCancelledOperations.add(operationId);
  }

  /**
   * Checks if an operation has been cancelled.
   * @param {string} operationId 
   * @returns {boolean}
   */
  static isUserCancelled(operationId) {
    return ExtensionContextManager.userCancelledOperations.has(operationId);
  }

  /**
   * Clears a cancellation record.
   * @param {string} operationId 
   */
  static clearUserCancelled(operationId) {
    ExtensionContextManager.userCancelledOperations.delete(operationId);
  }

  /** Clears all cancellation records */
  static clearAllUserCancellations() {
    ExtensionContextManager.userCancelledOperations.clear();
  }

  /**
   * Synchronously checks if the extension context is still valid.
   * @returns {boolean}
   */
  static isValidSync() {
    return coreIsValidSync();
  }

  /**
   * Asynchronously checks if the extension context and required APIs are available.
   * @returns {Promise<boolean>}
   */
  static async isValidAsync() {
    try {
      if (!ExtensionContextManager.isValidSync()) return false;
      return !!(browser?.runtime?.id && browser?.storage?.local);
    } catch {
      ExtensionContextManager._isContextInvalidated = true;
      return false;
    }
  }

  /**
   * Determines if a given error is caused by extension context invalidation.
   * @param {Error|string} error 
   * @returns {boolean}
   */
  static isContextError(error) {
    return coreIsContextError(error);
  }

  /**
   * Handles context-related errors by logging and notifying the user.
   * @param {Error|string} error - The error to handle
   * @param {string} [context="unknown"] - Description of where the error occurred
   * @param {Object} [options={}] - Additional handling options
   */
  static handleContextError(error, context = "unknown", options = {}) {
    return coreHandleContextError(error, context, options);
  }

  /**
   * Creates a safe wrapper for any asynchronous operation.
   * Checks context validity before execution and handles context errors automatically.
   * 
   * @param {Function} operation - The async function to wrap
   * @param {Object} [options={}] - Configuration options
   * @param {string} [options.context="operation"] - Name of the operation for logging
   * @param {any} [options.fallbackValue=null] - Value to return if context is invalid
   * @param {boolean} [options.validateAsync=false] - Whether to use async validation
   * @returns {Function} The wrapped safe operation
   */
  static createSafeWrapper(operation, options = {}) {
    const {
      context = "operation",
      fallbackValue = null,
      validateAsync = false,
    } = options;

    return async function wrappedOperation(...args) {
      try {
        const isValid = validateAsync
          ? await ExtensionContextManager.isValidAsync()
          : ExtensionContextManager.isValidSync();

        if (!isValid) {
          ExtensionContextManager.handleContextError("Invalid context", context);
          return fallbackValue;
        }

        return await operation(...args);
      } catch (error) {
        if (ExtensionContextManager.isContextError(error)) {
          ExtensionContextManager.handleContextError(error, context);
          return fallbackValue;
        }
        throw error;
      }
    };
  }

  /**
   * Safely retrieves an extension URL.
   * Handles cases where the extension has been updated/reloaded.
   * 
   * @param {string} path - Relative path within the extension
   * @param {string} [fallback=""] - Fallback URL if retrieval fails
   * @returns {string} The full extension URL or fallback
   */
  static safeGetURL(path, fallback = "") {
    const isFallbackSafe = fallback && (fallback.startsWith("data:") || fallback.startsWith("http"));
    if (ExtensionContextManager._isContextInvalidated) {
      return isFallbackSafe ? fallback : ExtensionContextManager.GENERIC_FALLBACK_ICON;
    }

    try {
      if (browser?.runtime?.getURL) {
        const url = browser.runtime.getURL(path);
        if (url && !url.includes("://invalid/")) return url;
        ExtensionContextManager._isContextInvalidated = true;
      }
    } catch {
      ExtensionContextManager._isContextInvalidated = true;
    }

    if (!ExtensionContextManager._isContextInvalidated && ExtensionContextManager._cachedBaseUrl) {
      const cleanPath = path.startsWith("/") ? path.substring(1) : path;
      return ExtensionContextManager._cachedBaseUrl + cleanPath;
    }

    return isFallbackSafe ? fallback : ExtensionContextManager.GENERIC_FALLBACK_ICON;
  }

  /**
   * Safely executes an i18n operation.
   * @param {Function} i18nOperation 
   * @param {string} [context="i18n"] 
   * @param {any} [fallbackValue=null] 
   * @returns {Promise<any>}
   */
  static async safeI18nOperation(i18nOperation, context = "i18n", fallbackValue = null) {
    return ExtensionContextManager.createSafeWrapper(i18nOperation, {
      context: `i18n-${context}`,
      fallbackValue,
      validateAsync: false,
    })();
  }

  /**
   * Safely executes a storage operation.
   * @param {Function} storageOperation 
   * @param {string} [context="storage"] 
   * @param {any} [fallbackValue=null] 
   * @returns {Promise<any>}
   */
  static async safeStorageOperation(storageOperation, context = "storage", fallbackValue = null) {
    return ExtensionContextManager.createSafeWrapper(storageOperation, {
      context: `storage-${context}`,
      fallbackValue,
      validateAsync: true,
    })();
  }

  /**
   * Standardized handler for browser.runtime.lastError.
   * Correctly identifies context-related errors and suppresses them after notification.
   * 
   * @param {string} [context="unknown"] 
   * @returns {Object|null} Result object {handledSilently, isContextError} or null
   */
  static handleRuntimeLastError(context = "unknown") {
    const lastError = (browser.runtime && browser.runtime.lastError) ? browser.runtime.lastError : null;
    if (!lastError) return null;

    const errorMessage = lastError.message || "";
    // Manual check to avoid circular dependency with ErrorMatcher
    const isContext = 
      errorMessage.includes("extension context invalidated") ||
      errorMessage.includes("message channel closed") ||
      errorMessage.includes("receiving end does not exist") ||
      errorMessage.includes("could not establish connection") ||
      errorMessage.includes("message port closed");

    if (isContext) {
      ExtensionContextManager.handleContextError(errorMessage, context);
      void browser.runtime?.lastError;
      return { handledSilently: true, isContextError: true };
    } else {
      logger.warn(`[${context}] Runtime lastError:`, errorMessage);
      void browser.runtime?.lastError;
      return { handledSilently: false, isContextError: false };
    }
  }
}

/** Named exports for functional usage */
export const isExtensionContextValid = ExtensionContextManager.isValidSync;
export const isExtensionContextValidAsync = ExtensionContextManager.isValidAsync;
export const isContextError = ExtensionContextManager.isContextError;
export const handleContextError = ExtensionContextManager.handleContextError;

export default ExtensionContextManager;
