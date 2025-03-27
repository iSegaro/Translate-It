// src/utils/helpers.js
import { ErrorHandler, ErrorTypes } from "../services/ErrorService.js";
import { CONFIG } from "../config.js";

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Decorator برای افزودن لاگینگ به ابتدای متد
 */
export function logMethod(target, propertyKey, descriptor) {
  return;
  const originalMethod = descriptor.value;
  descriptor.value = async function (...args) {
    const className = target.constructor.name;
    console.debug(`[${className}.${propertyKey}]`, ...args);
    try {
      const result = await originalMethod.apply(this, args);
      return result;
    } catch (error) {
      console.error(`[${className}.${propertyKey}] Error:`, error);
      throw error;
    }
  };
  return descriptor;
}

export const isEditable = (element) => {
  return (
    element?.isContentEditable ||
    ["INPUT", "TEXTAREA"].includes(element?.tagName)
  );
};

export const setCursorToEnd = (element) => {
  try {
    if (!element?.isConnected) {
      // console.debug("Element not connected to DOM: ", element);
      return;
    }

    element.focus();

    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      element.selectionStart = element.selectionEnd = element.value.length;
    } else if (element.isContentEditable) {
      const range = document.createRange();
      const selection = window.getSelection();
      range.selectNodeContents(element);
      range.collapse(false); // Collapse to end
      selection.removeAllRanges();
      selection.addRange(range);
    }
    // Optional: Scroll to cursor position
    element.scrollTop = element.scrollHeight;
  } catch (error) {
    const handlerError = errorHandler.handle(error, {
      type: ErrorTypes.UI,
      context: "helpers-setCursorToEnd",
    });
    throw handlerError;
  }
};

export const setCursorPosition = (element, position = "end", offset = 0) => {
  try {
    if (!element || !document.body.contains(element)) return;

    element.focus();

    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      const pos = position === "start" ? 0 : element.value.length;
      element.setSelectionRange(pos + offset, pos + offset);
    } else if (element.isContentEditable) {
      const range = document.createRange();
      const selection = window.getSelection();
      const childNodes = element.childNodes;

      if (position === "start") {
        range.setStart(childNodes[0] || element, 0);
      } else {
        range.setStart(
          childNodes[childNodes.length - 1] || element,
          element.textContent?.length || 0
        );
      }

      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    element.scrollTop = element.scrollHeight;
  } catch (error) {
    const handlerError = new ErrorHandler();
    errorHandler.handle(error, {
      type: ErrorTypes.UI,
      context: "helpers-setCursorPosition",
      element: element?.tagName,
    });
    throw handlerError;
  }
};

export const fadeOut = (element) => {
  try {
    element.style.transition = "opacity 0.5s";
    element.style.opacity = "0";
    setTimeout(() => element.remove(), 500);
  } catch (error) {
    const handlerError = errorHandler.handle(error, {
      type: ErrorTypes.UI,
      context: "helpers-fadeOut",
      element: element?.tagName,
    });
    throw handlerError;
  }
};

export const isExtensionContextValid = () => {
  try {
    return !!chrome?.runtime?.id && !!chrome?.storage?.local;
  } catch (e) {
    return false;
  }
};

export const openOptionsPage = () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL("options.html"));
  }
};

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

export function taggleLinks(enable = true) {
  try {
    if (!document?.body) return;
    document.documentElement.classList.toggle(
      "AIWritingCompanion-disable-links",
      enable
    );
  } catch (error) {
    const handlerError = errorHandler.handle(error, {
      type: ErrorTypes.CONTEXT,
      context: "taggleLinks",
      details: {
        errorType:
          error.message.includes("context invalidated") ?
            "CONTEXT_INVALIDATED"
          : "UNKNOWN_ERROR",
      },
    });
    throw handlerError;
  }
}

/**
 * تابع تزریق CSS به صورت داینامیک
 */
const injectCSS = (filePath) => {
  try {
    if (!document.head) throw new Error("document.head not available");

    const linkElement = document.createElement("link");
    linkElement.href = chrome.runtime.getURL(filePath);
    linkElement.rel = "stylesheet";
    document.head.appendChild(linkElement);
  } catch (error) {
    const handlerError = errorHandler.handle(error, {
      type: ErrorTypes.UI,
      context: "injectCSS",
      filePath,
    });
    throw handlerError;
  }
};

export const injectStyle = () => {
  try {
    const hostname = window.location.hostname;
    injectCSS("styles/content.css");

    if (hostname.includes("whatsapp.com")) {
      injectCSS("styles/whatsapp.css");
    }
    if (hostname.includes("x.com")) {
      injectCSS("styles/twitter.css");
    }
  } catch (error) {
    const handlerError = errorHandler.handle(error, {
      type: ErrorTypes.UI,
      context: "injectStyle",
    });
    throw handlerError;
  }
};
