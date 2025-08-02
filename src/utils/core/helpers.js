// src/utils/helpers.js
import browser from "webextension-polyfill";
import { ErrorHandler } from "../../error-management/ErrorService.js";
import { ErrorTypes } from "../../error-management/ErrorTypes.js";
import { IsDebug } from "../../config.js";

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
  // IsDebug().then((IsDebug) => {
  //   if (IsDebug) {
  console.debug(...args);
  //   }
  // });
};

/**
 * Injects a CSS file into the document's head.
 * @param {string} cssPath - The path to the CSS file from the extension's root.
 */
export function injectIconStyle(cssPath) {
  try {
    const link = document.createElement("link");
    link.href = browser.runtime.getURL(cssPath);
    link.type = "text/css";
    link.rel = "stylesheet";
    (document.head || document.documentElement).appendChild(link);
  } catch (error) {
    getErrorHandler().handle(error, {
      type: ErrorTypes.UI,
      context: "injectIconStyle",
    });
  }
}

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

export const isExtensionContextValid = async () => {
  try {
    return !!browser?.runtime?.id && !!browser?.storage?.local;
  } catch {
    return false;
  }
};

export const openOptionsPage = (anchor = null) => {
  browser.runtime
    .sendMessage({
      action: "open_options_page",
      data: { anchor: anchor },
    })
    .catch((err) => {
      console.error("Error sending open_options_page message:", err);
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
        browser.tabs.remove(duplicateTabIds).catch((err) => console.error("Error closing duplicate tabs:", err));
      }
      browser.tabs.update(firstTab.id, { active: true, url: url }).then((updatedTab) => {
        if (updatedTab) browser.windows.update(updatedTab.windowId, { focused: true });
      }).catch(() => browser.tabs.create({ url: url }));
    } else {
      browser.tabs.create({ url: url });
    }
  }).catch((err) => {
    console.error("Error in focusOrCreateTab:", err);
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

export const showStatus = (() => {
  let currentNotification = null;
  return (message, type, duration = 2000) => {
    if (currentNotification) {
      currentNotification.remove();
    }
    const notification = document.createElement("div");
    notification.className = `status-notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    currentNotification = notification;
    setTimeout(() => {
      notification.remove();
      currentNotification = null;
    }, duration);
  };
})();