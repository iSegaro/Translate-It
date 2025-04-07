// src/utils/helpers.js
import { ErrorHandler, ErrorTypes } from "../services/ErrorService.js";
import { IsDebug } from "../config.js";

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Decorator برای افزودن لاگینگ به ابتدای متد
 */
export function logMethod(target, propertyKey, descriptor) {
  IsDebug().then((IsDebug) => {
    if (IsDebug) {
      console.log("Debug mode is enabled.");
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
  });
}

export const logME = (...args) => {
  IsDebug().then((IsDebug) => {
    if (IsDebug) {
      console.debug(...args);
    }
  });
};

export const isEditable = (element) => {
  return (
    element?.isContentEditable ||
    ["INPUT", "TEXTAREA"].includes(element?.tagName) ||
    (element?.closest && element.closest('[contenteditable="true"]'))
  );
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
    injectCSS("styles/SelectionWindows.css");

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
