// src/utils/helpers.js
import Browser from "webextension-polyfill";
import { ErrorHandler } from "../services/ErrorService.js";
import { ErrorTypes } from "../services/ErrorTypes.js";
import { IsDebug } from "../config.js";

const errorHandler = new ErrorHandler();

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Decorator برای افزودن لاگینگ به ابتدای متد
 */
// eslint-disable-next-line no-unused-vars
export function logMethod(target, propertyKey, descriptor) {
  return;
  // const originalMethod = descriptor.value;
  // descriptor.value = async function (...args) {
  //   try {
  //     const isDebugEnabled = await IsDebug();
  //     if (isDebugEnabled) {
  //       const className = target.constructor.name;
  //       console.debug(`[${className}.${propertyKey}]`, ...args);
  //     }
  //     const result = await originalMethod.apply(this, args);
  //     return result;
  //   } catch (error) {
  //     const className = target.constructor.name;
  //     console.error(`[${className}.${propertyKey}] Error:`, error);
  //     throw error;
  //   }
  // };
  // return descriptor;
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

export const isExtensionContextValid = () => {
  try {
    return !!Browser?.runtime?.id && !!Browser?.storage?.local;
  } catch {
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
    if (!document.head)
      throw new Error(ErrorTypes.INTEGRATION || "document.head not available");

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
    const hostname = window?.location.hostname;
    injectCSS("styles/content.css");
    injectCSS("styles/disable_links.css");
    injectCSS("styles/SelectionWindows.css");

    if (hostname.includes("whatsapp.com")) {
      injectCSS("styles/whatsapp.css");
    }
    if (hostname.includes("x.com")) {
      injectCSS("styles/twitter.css");
    }
  } catch (error) {
    const handlerError = errorHandler.handle(error, {
      type: ErrorTypes.INTEGRATION,
      context: "injectStyle",
    });
    throw handlerError;
  }
};

export default function injectIconStyle(cssFileName) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.type = "text/css";
  link.href = Browser.runtime.getURL(cssFileName);
  document.head.appendChild(link);
}
