// src/core/helpers.js
import browser from "webextension-polyfill";
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
const logger = getScopedLogger(LOG_COMPONENTS.CORE, "helpers");

// Lazy loader for ErrorHandler to break circular dependency
let errorHandlerInstance = null;
const getErrorHandler = () => {
  if (!errorHandlerInstance) {
    errorHandlerInstance = ErrorHandler.getInstance();
  }
  return errorHandlerInstance;
};

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Decorator for logging method calls for debugging purposes.
 */
export function logMethod(target, propertyKey, descriptor) {
  // This is disabled but kept for potential future debugging.
  void target;
  void propertyKey;
  void descriptor;
  return;
}

export const logME = (...args) => {
  // Only log if first argument contains specific debugging keywords
  const debugKeywords = [
    "_executeApiCall",
    "API call failed",
    "Error:",
    "Failed to",
  ];
  const firstArg = String(args[0] || "");

  if (debugKeywords.some((keyword) => firstArg.includes(keyword))) {
    logger.debug(...args);
  }
  // Suppress verbose logging for common operations
};

export const isEditable = (element) => {
  if (!element) return false;
  if (element.isContentEditable) return true;
  if (element.tagName === "TEXTAREA") return true;
  if (element.tagName === "INPUT") {
    const textEntryTypes = new Set([
      "text",
      "search",
      "url",
      "tel",
      "email",
      "password",
      "number",
      "date",
      "month",
      "week",
      "time",
      "datetime-local",
    ]);
    return textEntryTypes.has(element.type.toLowerCase());
  }
  if (element.closest && element.closest('[contenteditable="true"]'))
    return true;
  return false;
};

export const Is_Element_Need_to_RTL_Localize = (element) => {
  if (element?.isContentEditable) return true;
  if (element?.tagName === "TEXTAREA") return true;
  if (element?.tagName === "INPUT") {
    const inputType = element.getAttribute("type")?.toLowerCase() || "text";
    return ["text", "checkbox"].includes(inputType);
  }
  if (["H2", "LABEL", "SPAN"].includes(element?.tagName)) return true;
  if (element?.closest && element.closest('[contenteditable="true"]'))
    return true;
  return false;
};

export const openOptionsPage = (anchor = null) => {
  return browser.runtime
    .sendMessage({
      action: MessageActions.OPEN_OPTIONS_PAGE,
      data: { anchor: anchor },
    })
    .catch((err) => {
      logger.error("Error sending openOptionsPage message:", err);
    });
};

export function taggleLinks(enable = true) {
  try {
    if (!document?.body) return;
    document.documentElement.classList.toggle(
      "AIWritingCompanion-disable-links",
      enable,
    );
  } catch (error) {
    const handlerError = getErrorHandler().handle(error, {
      type: ErrorTypes.CONTEXT,
      context: "taggleLinks",
      details: {
        errorType: error.message.includes("context invalidated")
          ? "CONTEXT_INVALIDATED"
          : "UNKNOWN_ERROR",
      },
    });
    throw handlerError;
  }
}
