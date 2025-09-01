// src/utils/helpers.js
import browser from "webextension-polyfill";
import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'helpers');

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
  const debugKeywords = ['_executeApiCall', 'API call failed', 'Error:', 'Failed to'];
  const firstArg = String(args[0] || '');
  
  if (debugKeywords.some(keyword => firstArg.includes(keyword))) {
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
      "text", "search", "url", "tel", "email", "password", "number",
      "date", "month", "week", "time", "datetime-local",
    ]);
    return textEntryTypes.has(element.type.toLowerCase());
  }
  if (element.closest && element.closest('[contenteditable="true"]')) return true;
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
  if (element?.closest && element.closest('[contenteditable="true"]')) return true;
  return false;
};

export const openOptionsPage = (anchor = null) => {
  browser.runtime
    .sendMessage({
      action: "open_options_page",
      data: { anchor: anchor },
    })
    .catch((err) => {
      logger.error("Error sending open_options_page message:", err);
    });
};

export const openOptionsPage_from_Background = (message) => {
  const anchor = message.data?.anchor;
  const optionsPath = "html/options.html";
  const baseUrl = browser.runtime.getURL(optionsPath);
  const finalUrl = anchor ? `${baseUrl}#${anchor}` : baseUrl;
  focusOrCreateTab(finalUrl);
};

export function focusOrCreateTab(url) {
  const baseUrl = url.split("#")[0];
  browser.tabs.query({}).then((tabs) => {
    const targetPath = baseUrl.replace(/^chrome-extension:\/\/[^/]+/, "");
    const existingTabs = tabs.filter((tab) => {
      if (!tab.url) return false;
      const tabPath = tab.url.split("#")[0].replace(/^chrome-extension:\/\/[^/]+/, "");
      return tabPath === targetPath;
    });

    if (existingTabs.length > 0) {
      const firstTab = existingTabs[0];
      const duplicateTabIds = existingTabs.slice(1).map((tab) => tab.id);
      if (duplicateTabIds.length > 0) {
        browser.tabs.remove(duplicateTabIds).catch((err) => logger.error("Error closing duplicate tabs:", err));
      }
      browser.tabs.update(firstTab.id, { active: true, url: url }).then((updatedTab) => {
        if (updatedTab) browser.windows.update(updatedTab.windowId, { focused: true });
      }).catch(() => browser.tabs.create({ url: url }));
    } else {
      browser.tabs.create({ url: url });
    }
  }).catch((err) => {
    logger.error("Error in focusOrCreateTab:", err);
    browser.tabs.create({ url: url });
  });
}

export function taggleLinks(enable = true) {
  try {
    if (!document?.body) return;
    document.documentElement.classList.toggle("AIWritingCompanion-disable-links", enable);
  } catch (error) {
    const handlerError = getErrorHandler().handle(error, {
      type: ErrorTypes.CONTEXT,
      context: "taggleLinks",
      details: {
        errorType: error.message.includes("context invalidated") ? "CONTEXT_INVALIDATED" : "UNKNOWN_ERROR",
      },
    });
    throw handlerError;
  }
}
