// src/core/contextErrorHandler.js
// Specialized handler for context errors to prevent circular dependencies
import browser from "webextension-polyfill";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import NotificationManager from "@/core/managers/core/NotificationManager.js";
import { contextState, isContextError, getActiveEnvironment, ENVIRONMENTS } from "./contextCore.js";

const logger = getScopedLogger(LOG_COMPONENTS.CORE, "ContextErrorHandler");
const notificationManager = new NotificationManager();

/**
 * Extracts a technical reason from a context-related error.
 * Used for detailed logging and debugging.
 * 
 * @param {Error|string} error - The error to analyze
 * @returns {string} Technical reason for the error
 * @private
 */
function getContextErrorReason(error) {
  const msg = error?.message || error;
  if (msg.includes("extension context invalidated")) return "Extension reloaded";
  if (msg.includes("message channel closed")) return "Message channel closed";
  if (msg.includes("receiving end does not exist")) return "Background script unavailable";
  if (msg.includes("page moved to cache")) return "Page cached by browser";
  if (msg.includes("could not establish connection")) return "Connection failed";
  if (msg.includes("message port closed")) return "Message port closed";
  return "Unknown context issue";
}

/**
 * Returns a user-friendly message based on the error type.
 * 
 * @param {string} type - ErrorType constant
 * @returns {string} Human-readable error message
 * @private
 */
function getContextErrorMessage(type) {
  if (type === ErrorTypes.EXTENSION_CONTEXT_INVALIDATED) {
    return "Extension was reloaded or updated. Please refresh the page.";
  }
  return "The extension context is currently unavailable. This often happens after an update.";
}

/**
 * Centralized handler for context errors.
 * Logs the error with appropriate metadata and shows notifications based on the environment.
 * 
 * @param {Error|string} error - The context error to handle
 * @param {string} [context="unknown"] - Where the error occurred (e.g. "storage:init")
 * @param {Object} [options={}] - Handling configuration
 * @param {boolean} [options.silent=true] - Whether to suppress the error after handling
 * @param {Function} [options.fallbackAction=null] - Optional callback to execute
 * @param {string} [options.operationId=null] - ID of the cancelled operation
 * @returns {Object} Result indicating if the error was handled {handled: true, silent}
 */
export function handleContextError(error, context = "unknown", options = {}) {
  const {
    silent = true,
    fallbackAction = null,
  } = options;

  // Mark globally as invalidated if it's a context error
  if (isContextError(error)) {
    contextState.isInvalidated = true;
  }

  const message = error?.message || error;
  const reason = getContextErrorReason(error);
  const env = getActiveEnvironment();

  logger.debug(`Extension context error in ${env}:${context}`, {
    env,
    context,
    reason,
    originalError: message,
  });

  // Handle UI notifications for Content Scripts
  if (env === ENVIRONMENTS.CONTENT && isContextError(error)) {
    if (contextState.notificationShown) return { handled: true, silent };
    contextState.notificationShown = true;
    // Reset notification throttle after 5 seconds
    setTimeout(() => { contextState.notificationShown = false; }, 5000);

    notificationManager.show(
      getContextErrorMessage(ErrorTypes.EXTENSION_CONTEXT_INVALIDATED),
      "warning",
      5000,
      { id: "extension-update-warning", persistent: false }
    );
  }

  // Handle System notifications for Background Script
  if (env === ENVIRONMENTS.BACKGROUND && isContextError(error)) {
    if (contextState.notificationShown) return { handled: true, silent };
    contextState.notificationShown = true;
    setTimeout(() => { contextState.notificationShown = false; }, 5000);

    try {
      if (browser?.notifications?.create) {
        const notificationId = "extension-context-error";
        let iconUrl = "";
        try { 
          iconUrl = browser.runtime.getURL("icons/extension/extension_icon_128.png"); 
        } catch {
          // Fallback to empty if context is invalidated
        }

        const notificationOptions = {
          type: "basic",
          title: "Translate It - Reload Page",
          message: getContextErrorMessage(ErrorTypes.EXTENSION_CONTEXT_INVALIDATED),
          priority: 2,
        };

        // Fallback for icons if context is already too far gone
        if (iconUrl && !iconUrl.includes("data:")) {
          notificationOptions.iconUrl = iconUrl;
        }

        browser.notifications.clear(notificationId).then(() => {
          browser.notifications.create(notificationId, notificationOptions);
        }).catch(() => {
          browser.notifications.create(notificationId, notificationOptions);
        });

        setTimeout(() => {
          try { 
            browser.notifications.clear(notificationId); 
          } catch {
            // Ignore clearing errors
          }
        }, 5000);
      }
    } catch {
      logger.debug("Could not show system notification for background context error");
    }
  }

  // Execute optional fallback logic
  if (fallbackAction && typeof fallbackAction === "function") {
    try { 
      fallbackAction(); 
    } catch {
      // Ignore fallback errors
    }
  }

  return { handled: true, silent };
}
