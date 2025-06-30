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
  // اگر عنصری وجود ندارد، false برگردان
  if (!element) {
    return false;
  }

  // ۱. بررسی مستقیم ویژگی isContentEditable که سریع‌ترین راه است.
  if (element.isContentEditable) {
    return true;
  }

  // ۲. بررسی برای <textarea>
  if (element.tagName === "TEXTAREA") {
    return true;
  }

  // ۳. بررسی دقیق برای <input>
  if (element.tagName === "INPUT") {
    // لیستی از انواع input که قابلیت ورود متن دارند.
    // استفاده از Set برای جستجوی سریع و بهینه.
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

  // ۴. در نهایت، بررسی اینکه آیا عنصر داخل یک والد contenteditable قرار دارد یا خیر.
  // این بررسی بعد از موارد دیگر انجام می‌شود چون کمی هزینه‌برتر است.
  if (element.closest && element.closest('[contenteditable="true"]')) {
    return true;
  }

  // در غیر این صورت، عنصر قابل ویرایش نیست.
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

export const openOptionsPage = (anchor = null) => {
  Browser.runtime
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
  const baseUrl = Browser.runtime.getURL(optionsPath);
  const finalUrl = anchor ? `${baseUrl}#${anchor}` : baseUrl;

  // This logic runs safely in the background context
  Browser.tabs.query({}).then((tabs) => {
    const existingTab = tabs.find(
      (tab) => tab.url && tab.url.startsWith(baseUrl)
    );
    if (existingTab) {
      Browser.tabs
        .update(existingTab.id, { active: true, url: finalUrl })
        .then((updatedTab) => {
          if (updatedTab)
            Browser.windows.update(updatedTab.windowId, { focused: true });
        });
    } else {
      Browser.tabs.create({ url: finalUrl });
    }
  });
};

/**
 * A robust function to open an extension page.
 * It checks if a tab with the same base URL is already open to avoid duplicates.
 * If found, it updates and focuses the existing tab. Otherwise, it creates a new one.
 * @param {string} url - The full URL of the extension page to open (e.g., including #anchor).
 */
export function focusOrCreateTab(url) {
  const baseUrl = url.split('#')[0]; 
  Browser.tabs.query({})
    .then(tabs => {
      const existingTab = tabs.find(tab => tab.url && tab.url.startsWith(baseUrl));
      if (existingTab) {
        Browser.tabs.update(existingTab.id, { active: true, url: url })
          .then(updatedTab => {
            if (updatedTab) {
              Browser.windows.update(updatedTab.windowId, { focused: true });
            }
          });
      } else {
        Browser.tabs.create({ url: url });
      }
    })
    .catch(err => {
      console.error("Error in focusOrCreateTab:", err);
      Browser.tabs.create({ url: url });
    });
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
