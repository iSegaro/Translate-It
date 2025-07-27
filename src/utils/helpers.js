// src/utils/helpers.js
import { getBrowser } from "@/utils/browser-polyfill.js";
import { getBrowserAPI } from '@/utils/browser-unified.js';
import { ErrorHandler } from "../error-management/ErrorHandler.js";
import { ErrorTypes } from "../error-management/ErrorTypes.js";
import { IsDebug } from "../config.js";

const errorHandler = new ErrorHandler();

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Decorator برای افزودن لاگینگ به ابتدای متد
 */
export function logMethod(target, propertyKey, descriptor) {
  void target;
  void propertyKey;
  void descriptor;
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
  // IsDebug().then((IsDebug) => {
  //   if (IsDebug) {
      console.debug(...args);
  //   }
  // });
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

export const isExtensionContextValid = async () => {
  try {
    const browser = await getBrowserAPI();
    return !!browser?.runtime?.id && !!browser?.storage?.local;
  } catch {
    return false;
  }
};

export const openOptionsPage = (anchor = null) => {
  getBrowser().runtime
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
  const baseUrl = getBrowser().runtime.getURL(optionsPath);
  const finalUrl = anchor ? `${baseUrl}#${anchor}` : baseUrl;

  console.log('[openOptionsPage_from_Background] baseUrl:', baseUrl);
  console.log('[openOptionsPage_from_Background] finalUrl:', finalUrl);

  // This logic runs safely in the background context
  getBrowser().tabs.query({}).then((tabs) => {
    // لاگ کردن همه URLs برای debugging
    console.log('[openOptionsPage_from_Background] All tab URLs:', tabs.map(tab => tab.url));
    
    // پیدا کردن همه تب‌های مربوط به صفحه تنظیمات - فقط path را چک کنیم (بدون extension ID)
    const targetPath = baseUrl.replace(/^chrome-extension:\/\/[^/]+/, '');
    console.log('[openOptionsPage_from_Background] Looking for path:', targetPath);
    
    const existingTabs = tabs.filter((tab) => {
      if (!tab.url) return false;
      const tabPath = tab.url.split('#')[0].replace(/^chrome-extension:\/\/[^/]+/, '');
      const matches = tabPath === targetPath;
      console.log('[openOptionsPage_from_Background] Comparing path:', tabPath, '===', targetPath, '→', matches);
      return matches;
    });
    console.log('[openOptionsPage_from_Background] Found existing tabs:', existingTabs.length, existingTabs.map(tab => tab.url));
    
    if (existingTabs.length > 0) {
      // استفاده از اولین تب موجود و بستن بقیه
      const firstTab = existingTabs[0];
      const duplicateTabs = existingTabs.slice(1);
      
      // بستن تب‌های اضافی (duplicate)
      if (duplicateTabs.length > 0) {
        const duplicateTabIds = duplicateTabs.map(tab => tab.id);
        getBrowser().tabs.remove(duplicateTabIds).catch(err => {
          console.error("Error closing duplicate options tabs:", err);
        });
      }
      
      // به‌روزرسانی و فوکوس کردن اولین تب
      getBrowser().tabs
        .update(firstTab.id, { active: true, url: finalUrl })
        .then((updatedTab) => {
          if (updatedTab)
            getBrowser().windows.update(updatedTab.windowId, { focused: true });
        })
        .catch(err => {
          console.error("Error updating options tab:", err);
          // اگر خطا رخ داد، تب جدید ایجاد کن
          getBrowser().tabs.create({ url: finalUrl });
        });
    } else {
      // هیچ تب موجودی یافت نشد، تب جدید ایجاد کن
      getBrowser().tabs.create({ url: finalUrl });
    }
  }).catch(err => {
    console.error("Error querying tabs:", err);
    // در صورت خطا، مستقیماً تب جدید ایجاد کن
    getBrowser().tabs.create({ url: finalUrl });
  });
};

/**
 * A robust function to open an extension page.
 * It checks if tabs with the same base URL are already open, closes duplicates, and focuses one.
 * If found, it updates and focuses the existing tab. Otherwise, it creates a new one.
 * @param {string} url - The full URL of the extension page to open (e.g., including #anchor).
 */
export function focusOrCreateTab(url) {
  const baseUrl = url.split('#')[0]; 
  console.log('[focusOrCreateTab] Looking for tabs with baseUrl:', baseUrl);
  
  getBrowser().tabs.query({})
    .then(tabs => {
      // لاگ کردن همه URLs برای debugging
      console.log('[focusOrCreateTab] All tab URLs:', tabs.map(tab => tab.url));
      
      // پیدا کردن همه تب‌های مربوط به این صفحه - فقط path را چک کنیم (بدون extension ID)
      const targetPath = baseUrl.replace(/^chrome-extension:\/\/[^/]+/, '');
      console.log('[focusOrCreateTab] Looking for path:', targetPath);
      
      const existingTabs = tabs.filter(tab => {
        if (!tab.url) return false;
        const tabPath = tab.url.split('#')[0].replace(/^chrome-extension:\/\/[^/]+/, '');
        const matches = tabPath === targetPath;
        console.log('[focusOrCreateTab] Comparing path:', tabPath, '===', targetPath, '→', matches);
        return matches;
      });
      console.log('[focusOrCreateTab] Found existing tabs:', existingTabs.length, existingTabs.map(tab => tab.url));
      
      if (existingTabs.length > 0) {
        // استفاده از اولین تب موجود و بستن بقیه
        const firstTab = existingTabs[0];
        const duplicateTabs = existingTabs.slice(1);
        
        // بستن تب‌های اضافی (duplicate)
        if (duplicateTabs.length > 0) {
          const duplicateTabIds = duplicateTabs.map(tab => tab.id);
          getBrowser().tabs.remove(duplicateTabIds).catch(err => {
            console.error("Error closing duplicate tabs:", err);
          });
        }
        
        // به‌روزرسانی و فوکوس کردن اولین تب
        getBrowser().tabs.update(firstTab.id, { active: true, url: url })
          .then(updatedTab => {
            if (updatedTab) {
              getBrowser().windows.update(updatedTab.windowId, { focused: true });
            }
          })
          .catch(err => {
            console.error("Error updating tab:", err);
            getBrowser().tabs.create({ url: url });
          });
      } else {
        getBrowser().tabs.create({ url: url });
      }
    })
    .catch(err => {
      console.error("Error in focusOrCreateTab:", err);
      getBrowser().tabs.create({ url: url });
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
    linkElement.href = getBrowser().runtime.getURL(filePath);
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
  link.href = getBrowser().runtime.getURL(cssFileName);
  document.head.appendChild(link);
}
