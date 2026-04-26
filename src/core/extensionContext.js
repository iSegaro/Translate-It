// src/core/extensionContext.js
// Centralized Extension Context Management

import browser from "webextension-polyfill";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { matchErrorToType } from "@/shared/error-management/ErrorMatcher.js";
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import NotificationManager from "@/core/managers/core/NotificationManager.js";

const logger = getScopedLogger(LOG_COMPONENTS.CORE, "ExtensionContext");
const notificationManager = new NotificationManager();

/**
 * Centralized manager for extension context validation and error handling.
 * Provides unified logic for detecting environment, validating context,
 * and handling context-related errors across all browser platforms.
 */
export class ExtensionContextManager {
  /**
   * Centralized environment constants for the extension execution contexts.
   */
  static ENVIRONMENTS = {
    BACKGROUND: "background",
    CONTENT: "content",
    POPUP: "popup",
    SIDEPANEL: "sidepanel",
    OPTIONS: "options",
    OFFSCREEN: "offscreen",
  };

  /**
   * Internal flag to track if the extension context has been invalidated globally.
   * Once set to true, the system stops attempting to use extension APIs to avoid red logs.
   * @private
   */
  static _isContextInvalidated = false;

  /**
   * Flag to ensure the context invalidation notification is only shown once per page session.
   * @private
   */
  static _contextNotificationShown = false;

  /**
   * Cached base URL of the extension (e.g., chrome-extension://[id]/).
   * Initialized once during script startup to provide a fallback for resource loading.
   * @private
   */
  static _cachedBaseUrl = (() => {
    try {
      if (
        typeof browser !== "undefined" &&
        browser.runtime &&
        typeof browser.runtime.getURL === "function"
      ) {
        return browser.runtime.getURL("");
      }
    } catch {
      return "";
    }
    return "";
  })();

  /**
   * Generic fallback icon (Base64 SVG) to show when extension context is invalidated
   * and resources cannot be loaded from the extension package.
   */
  static GENERIC_FALLBACK_ICON =
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNjY2MiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCI+PC9jaXJjbGU+PGxpbmUgeDE9IjIiIHkxPSIxMiIgeDI9IjIyIiB5Mj0iMTIiPjwvbGluZT48cGF0aCBkPSJNMTIgMmExNS4zIDE1LjMgMCAwIDEgNCAxMGExNS4zIDE1LjMgMCAwIDEtNCAxMGExNS4zIDE1LjMgMCAwIDEtNC0xMGExNS4zIDE1LjMgMCAwIDEgNC0xMHoiPjwvcGF0aD48L3N2Zz4=";

  /**
   * Auto-detect the current execution environment.
   * Robust cross-browser detection (Chrome, Firefox, Safari, Edge).
   * @returns {string} One of ENVIRONMENTS values
   */
  static getActiveEnvironment() {
    // 1. Service Worker / Background (No document)
    if (typeof document === "undefined") {
      return ExtensionContextManager.ENVIRONMENTS.BACKGROUND;
    }

    const url = globalThis.location?.href || "";
    const protocol = globalThis.location?.protocol || "";

    // 2. Extension internal pages
    // Supports Chrome/Edge (chrome-extension:), Firefox (moz-extension:), Safari (safari-extension:)
    const isExtensionProtocol =
      protocol.endsWith("-extension:") || protocol === "extension:";

    if (isExtensionProtocol) {
      if (url.includes("popup.html"))
        return ExtensionContextManager.ENVIRONMENTS.POPUP;
      if (url.includes("sidepanel.html"))
        return ExtensionContextManager.ENVIRONMENTS.SIDEPANEL;
      if (url.includes("options.html"))
        return ExtensionContextManager.ENVIRONMENTS.OPTIONS;
      if (url.includes("offscreen.html"))
        return ExtensionContextManager.ENVIRONMENTS.OFFSCREEN;

      // Fallback for other internal pages or MV2 background pages
      return ExtensionContextManager.ENVIRONMENTS.BACKGROUND;
    }

    // 3. Content Scripts (Injected into web pages)
    return ExtensionContextManager.ENVIRONMENTS.CONTENT;
  }

  /**
   * Static state for tracking user-cancelled operations across the app.
   */
  static userCancelledOperations = new Set();

  /**
   * Mark an operation as user-cancelled.
   * @param {string} operationId - Unique identifier for the operation
   */
  static markUserCancelled(operationId) {
    ExtensionContextManager.userCancelledOperations.add(operationId);
  }

  /**
   * Check if an operation was cancelled by the user.
   * @param {string} operationId - Unique identifier
   * @returns {boolean}
   */
  static isUserCancelled(operationId) {
    return ExtensionContextManager.userCancelledOperations.has(operationId);
  }

  /**
   * Clear user cancellation for an operation.
   * @param {string} operationId
   */
  static clearUserCancelled(operationId) {
    ExtensionContextManager.userCancelledOperations.delete(operationId);
  }

  /**
   * Clear all tracked user cancellations.
   */
  static clearAllUserCancellations() {
    ExtensionContextManager.userCancelledOperations.clear();
  }

  /**
   * Synchronous extension context validation (fast check).
   * Verifies if the extension environment is still reachable.
   * @returns {boolean} True if extension context is valid
   */
  static isValidSync() {
    if (ExtensionContextManager._isContextInvalidated) return false;
    try {
      if (!browser || !browser.runtime) {
        ExtensionContextManager._isContextInvalidated = true;
        return false;
      }

      // Test if getURL works and doesn't return the invalid marker
      const url = browser.runtime.getURL("test");
      if (url && url.includes("://invalid/")) {
        ExtensionContextManager._isContextInvalidated = true;
        return false;
      }

      // Verify extension ID is still present (crucial for Firefox)
      if (!browser.runtime.id) {
        ExtensionContextManager._isContextInvalidated = true;
        return false;
      }

      return true;
    } catch {
      ExtensionContextManager._isContextInvalidated = true;
      return false;
    }
  }

  /**
   * Asynchronous extension context validation (comprehensive check).
   * @returns {Promise<boolean>} True if extension context is valid
   */
  static async isValidAsync() {
    try {
      if (!ExtensionContextManager.isValidSync()) return false;
      // Comprehensive check verifying both runtime and storage accessibility
      return !!(browser?.runtime?.id && browser?.storage?.local);
    } catch {
      ExtensionContextManager._isContextInvalidated = true;
      return false;
    }
  }

  /**
   * Check if an error is related to extension context invalidation or closed channels.
   * @param {Error|string} error - The error to check
   * @returns {boolean}
   */
  static isContextError(error) {
    const errorType = matchErrorToType(error);
    return (
      errorType === ErrorTypes.EXTENSION_CONTEXT_INVALIDATED ||
      errorType === ErrorTypes.CONTEXT
    );
  }

  /**
   * Get a technical reason for why the context error occurred.
   * @param {Error|string} error
   * @returns {string} Short reason string
   */
  static getContextErrorReason(error) {
    const msg = error?.message || error;

    if (msg.includes("extension context invalidated"))
      return "Extension reloaded";
    if (msg.includes("message channel closed")) return "Message channel closed";
    if (msg.includes("receiving end does not exist"))
      return "Background script unavailable";
    if (msg.includes("page moved to cache")) return "Page cached by browser";
    if (msg.includes("could not establish connection"))
      return "Connection failed";
    if (msg.includes("message port closed")) return "Message port closed";

    return "Unknown context issue";
  }

  /**
   * Get a human-readable message for context errors to show to the user.
   * @param {string} type - Error type from ErrorTypes
   * @returns {string} User-friendly message
   */
  static getContextErrorMessage(type) {
    if (type === ErrorTypes.EXTENSION_CONTEXT_INVALIDATED) {
      return "Extension was reloaded or updated. Please refresh the page.";
    }
    return "The extension context is currently unavailable. This often happens after an update.";
  }

  /**
   * Handle context errors with appropriate logging and internal state management.
   * Automatically silences logs if the error is an expected lifecycle event.
   * @param {Error|string} error - The caught error
   * @param {string} context - The module/action name where it occurred
   * @param {Object} options - Handling options (silent, fallbackAction, operationId)
   */
  static handleContextError(error, context = "unknown", options = {}) {
    const {
      silent = true,
      fallbackAction = null,
      operationId = null,
    } = options;

    // Set global invalidation flag to trigger silent fallbacks everywhere
    if (ExtensionContextManager.isContextError(error)) {
      ExtensionContextManager._isContextInvalidated = true;
    }

    const message = error?.message || error;
    const reason = ExtensionContextManager.getContextErrorReason(error);
    const env = ExtensionContextManager.getActiveEnvironment();

    // Special handling for user-cancelled tasks
    if (operationId && ExtensionContextManager.isUserCancelled(operationId)) {
      logger.info(`Operation cancelled by user in ${env}:${context}`);
      ExtensionContextManager.clearUserCancelled(operationId);
      return;
    }

    // Always log context errors at DEBUG level to avoid console noise
    logger.debug(`Extension context error in ${env}:${context}`, {
      env,
      context,
      reason,
      originalError: message,
    });

    // Show a user-friendly toast if we are in a content script (UI visible to user)
    // and this is a genuine context invalidation error.
    if (
      env === ExtensionContextManager.ENVIRONMENTS.CONTENT &&
      ExtensionContextManager.isContextError(error)
    ) {
      // Prevent showing multiple duplicate notifications for the same invalidation event
      if (ExtensionContextManager._contextNotificationShown)
        return { handled: true, silent };
      ExtensionContextManager._contextNotificationShown = true;

      // Reset the flag after the toast duration (plus a small buffer)
      // to allow showing it again if the user interacts again.
      setTimeout(() => {
        ExtensionContextManager._contextNotificationShown = false;
      }, 5000);

      // Use NotificationManager for standardized toast notifications
      notificationManager.show(
        ExtensionContextManager.getContextErrorMessage(
          ErrorTypes.EXTENSION_CONTEXT_INVALIDATED,
        ),
        "warning",
        5000,
        {
          id: "extension-update-warning",
          persistent: false,
        },
      );
    }

    // If we are in BACKGROUND context, use system notifications (browser.notifications)
    // to inform the user about connection issues, inspired by InstallHandler.js pattern.
    if (
      env === ExtensionContextManager.ENVIRONMENTS.BACKGROUND &&
      ExtensionContextManager.isContextError(error)
    ) {
      // Prevent showing multiple duplicate notifications
      if (ExtensionContextManager._contextNotificationShown)
        return { handled: true, silent };
      ExtensionContextManager._contextNotificationShown = true;

      // Reset the flag after a delay to allow showing it again if the user interacts
      setTimeout(() => {
        ExtensionContextManager._contextNotificationShown = false;
      }, 5000);

      try {
        if (
          typeof browser !== "undefined" &&
          browser.notifications &&
          typeof browser.notifications.create === "function"
        ) {
          const notificationId = "extension-context-error";

          // Use a plain extension URL for the icon.
          // browser.notifications.create does NOT support Base64/Data URIs.
          let iconUrl = "";
          try {
            iconUrl = browser.runtime.getURL(
              "icons/extension/extension_icon_128.png",
            );
          } catch {
            /* ignore icon if getURL fails */
          }

          const notificationOptions = {
            type: "basic",
            title: "Translate It - Reload Page",
            message: ExtensionContextManager.getContextErrorMessage(
              ErrorTypes.EXTENSION_CONTEXT_INVALIDATED,
            ),
            priority: 2,
          };

          // Only add icon if it's a valid extension resource URL (not Base64)
          if (iconUrl && !iconUrl.includes("data:")) {
            notificationOptions.iconUrl = iconUrl;
          }

          // Follow InstallHandler.js pattern: Clear previous notification with same ID first
          browser.notifications
            .clear(notificationId)
            .then(() => {
              browser.notifications.create(notificationId, notificationOptions);
            })
            .catch(() => {
              // Fallback create if clear fails
              browser.notifications.create(notificationId, notificationOptions);
            });

          // Automatically dismiss after 7 seconds to keep it clean
          setTimeout(() => {
            try {
              browser.notifications.clear(notificationId);
            } catch {
              /* ignore */
            }
          }, 5000);
        }
      } catch {
        // System notifications might fail if the background context itself is being torn down
        logger.debug(
          "Could not show system notification for background context error",
        );
      }
    }

    if (fallbackAction && typeof fallbackAction === "function") {
      try {
        fallbackAction();
      } catch {
        /* ignore */
      }
    }

    return { handled: true, silent };
  }

  /**
   * Create a safe wrapper for context-sensitive asynchronous operations.
   * @param {Function} operation - Function to wrap
   * @param {Object} options - Wrapper configuration
   * @returns {Function} Wrapped function
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
          ExtensionContextManager.handleContextError(
            "Invalid context",
            context,
          );
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
   * Safe wrapper for browser.runtime.getURL to avoid context invalidation errors.
   * Returns a Base64 placeholder if extension resources are unreachable.
   * @param {string} path - Resource path within the extension
   * @param {string} fallback - Optional specific fallback URL
   * @returns {string} Valid URL or Base64 data URI
   */
  static safeGetURL(path, fallback = "") {
    const isFallbackSafe =
      fallback && (fallback.startsWith("data:") || fallback.startsWith("http"));

    // Fast-exit if context is already known to be invalidated
    if (ExtensionContextManager._isContextInvalidated) {
      return isFallbackSafe
        ? fallback
        : ExtensionContextManager.GENERIC_FALLBACK_ICON;
    }

    try {
      if (
        typeof browser !== "undefined" &&
        browser.runtime &&
        typeof browser.runtime.getURL === "function"
      ) {
        const url = browser.runtime.getURL(path);
        // Detect Chrome's invalid marker
        if (url && !url.includes("://invalid/")) {
          return url;
        } else {
          ExtensionContextManager._isContextInvalidated = true;
        }
      }
    } catch {
      ExtensionContextManager._isContextInvalidated = true;
    }

    // Attempt to use cached base URL if runtime API is dead but we have the ID from startup
    if (
      !ExtensionContextManager._isContextInvalidated &&
      ExtensionContextManager._cachedBaseUrl &&
      !ExtensionContextManager._cachedBaseUrl.includes("://invalid/")
    ) {
      const cleanPath = path.startsWith("/") ? path.substring(1) : path;
      return ExtensionContextManager._cachedBaseUrl + cleanPath;
    }

    // Return Base64 or absolute fallback to avoid network errors
    return isFallbackSafe
      ? fallback
      : ExtensionContextManager.GENERIC_FALLBACK_ICON;
  }

  /**
   * Safe wrapper for browser.runtime.sendMessage calls.
   * Handles dynamic import of UnifiedMessaging to prevent circular dependencies.
   */
  static async safeSendMessage(message, context = "messaging") {
    return ExtensionContextManager.createSafeWrapper(
      async (msg) => {
        const { sendMessage } =
          await import("@/shared/messaging/core/UnifiedMessaging.js");
        return await sendMessage(msg);
      },
      {
        context: `sendMessage-${context}`,
        fallbackValue: null,
        validateAsync: false,
      },
    )(message);
  }

  /**
   * Safe wrapper for internationalization (i18n) operations.
   */
  static async safeI18nOperation(
    i18nOperation,
    context = "i18n",
    fallbackValue = null,
  ) {
    return ExtensionContextManager.createSafeWrapper(i18nOperation, {
      context: `i18n-${context}`,
      fallbackValue,
      validateAsync: false,
    })();
  }

  /**
   * Safe wrapper for storage operations.
   */
  static async safeStorageOperation(
    storageOperation,
    context = "storage",
    fallbackValue = null,
  ) {
    return ExtensionContextManager.createSafeWrapper(storageOperation, {
      context: `storage-${context}`,
      fallbackValue,
      validateAsync: true,
    })();
  }

  /**
   * Handle browser.runtime.lastError with centralized management.
   * @param {string} context - Source context
   * @returns {Object|null} Handling result
   */
  static handleRuntimeLastError(context = "unknown") {
    if (!browser.runtime.lastError) return null;

    const errorMessage = browser.runtime.lastError.message;
    const errorType = matchErrorToType(errorMessage);
    const isContextError =
      errorType === ErrorTypes.CONTEXT ||
      errorType === ErrorTypes.EXTENSION_CONTEXT_INVALIDATED;

    if (isContextError) {
      ExtensionContextManager.handleContextError(errorMessage, context);
      void browser.runtime.lastError; // Clear the error
      return { handledSilently: true, isContextError: true };
    } else {
      logger.warn(`[${context}] Runtime lastError:`, errorMessage);
      void browser.runtime.lastError; // Clear the error
      return { handledSilently: false, isContextError: false };
    }
  }
}

// Convenience exports for clean imports in other modules
export const isExtensionContextValid = ExtensionContextManager.isValidSync;
export const isExtensionContextValidAsync =
  ExtensionContextManager.isValidAsync;
export const isContextError = ExtensionContextManager.isContextError;
export const handleContextError = ExtensionContextManager.handleContextError;

export default ExtensionContextManager;
