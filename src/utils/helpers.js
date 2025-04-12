// src/utils/helpers.js
import Browser from "webextension-polyfill";
import { ErrorHandler, ErrorTypes } from "../services/ErrorService.js";
import { IsDebug } from "../config.js";

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Decorator برای افزودن لاگینگ به ابتدای متد
 */
export function logMethod(target, propertyKey, descriptor) {
  return;
  const originalMethod = descriptor.value;
  descriptor.value = async function (...args) {
    try {
      const isDebugEnabled = await IsDebug();
      if (isDebugEnabled) {
        const className = target.constructor.name;
        console.debug(`[${className}.${propertyKey}]`, ...args);
      }
      const result = await originalMethod.apply(this, args);
      return result;
    } catch (error) {
      const className = target.constructor.name;
      console.error(`[${className}.${propertyKey}] Error:`, error);
      throw error;
    }
  };
  return descriptor;
}

export const logME = (...args) => {
  IsDebug().then((IsDebug) => {
    if (IsDebug) {
      console.debug(...args);
    }
  });
};

export const isEditable = (element) => {
  // اگر element دارای isContentEditable باشد یا از نوع contenteditable باشد
  if (element?.isContentEditable) return true;

  // اگر تگ آن TEXTAREA است، فیلد متنی است
  if (element?.tagName === "TEXTAREA") return true;

  // اگر تگ INPUT است، بررسی کنید که نوع آن یکی از انواع متنی مجاز باشد
  if (element?.tagName === "INPUT") {
    // گرفتن مقدار type به صورت کوچک (در صورت عدم وجود، فرض بر "text" می‌شود)
    const inputType = element.getAttribute("type")?.toLowerCase() || "text";
    // فقط نوع‌های زیر به عنوان فیلد متنی در نظر گرفته می‌شوند
    return ["text", "search"].includes(inputType);
  }

  // اگر المان در داخل یک المان دارای contenteditable قرار دارد
  if (element?.closest && element.closest('[contenteditable="true"]'))
    return true;

  return false;
};

export const Is_Element_Need_to_RTL_Localize = (element) => {
  // اگر element دارای isContentEditable باشد یا به صورت contenteditable باشد
  if (element?.isContentEditable) return true;

  // اگر تگ آن TEXTAREA است
  if (element?.tagName === "TEXTAREA") return true;

  // اگر تگ آن INPUT است، بررسی کنید نوع آن آیا متنی یا checkbox هست
  if (element?.tagName === "INPUT") {
    const inputType = element.getAttribute("type")?.toLowerCase() || "text";
    return ["text", "checkbox"].includes(inputType);
  }

  // اگر تگ المان H2، LABEL یا SPAN است، true برگردانید
  if (["H2", "LABEL", "SPAN"].includes(element?.tagName)) return true;

  // اگر المان در داخل یک المان دارای contenteditable قرار دارد
  if (element?.closest && element.closest('[contenteditable="true"]'))
    return true;

  return false;
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
    return !!Browser?.runtime?.id && !!Browser?.storage?.local;
  } catch (e) {
    return false;
  }
};

export const openOptionsPage = () => {
  if (Browser.runtime.openOptionsPage) {
    Browser.runtime.openOptionsPage();
  } else {
    window.open(Browser.runtime.getURL("html/options.html"));
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
    linkElement.href = Browser.runtime.getURL(filePath);
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
