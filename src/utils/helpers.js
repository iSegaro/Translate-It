// src/utils/helpers.js
import { ErrorHandler, ErrorTypes } from "../services/ErrorService.js";

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

/**
 * جداسازی متن‌های موجود در حافظه کش و متن‌های جدید برای ترجمه.
 *
 * @param {Map<string, Node[]>} originalTextsMap نگاشت بین متن اصلی و گره‌های متنی مربوطه.
 * @param {Map<string, string>} translationCache حافظه کش ترجمه‌ها.
 * @returns {{textsToTranslate: string[], cachedTranslations: Map<string, string>}}
 * آرایه‌ای از متن‌های جدید برای ترجمه و نگاشتی از ترجمه‌های موجود در کش.
 */
export function separateCachedAndNewTexts(originalTextsMap, translationCache) {
  const textsToTranslate = [];
  const cachedTranslations = new Map();
  const uniqueOriginalTexts = Array.from(originalTextsMap.keys());

  uniqueOriginalTexts.forEach((text) => {
    if (translationCache.has(text)) {
      cachedTranslations.set(text, translationCache.get(text));
    } else {
      textsToTranslate.push(text);
    }
  });

  return { textsToTranslate, cachedTranslations };
}

/**
 * جمع‌آوری تمام گره‌های متنی در یک المان و ایجاد نگاشت از متن اصلی به گره‌ها.
 *
 * @param {HTMLElement} targetElement المانی که باید گره‌های متنی آن جمع‌آوری شود.
 * @returns {{textNodes: Node[], originalTextsMap: Map<string, Node[]>}}
 * آرایه‌ای از گره‌های متنی و نگاشتی از متن اصلی به لیست گره‌های متنی.
 */
export function collectTextNodes(targetElement) {
  const walker = document.createTreeWalker(
    targetElement,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  const textNodes = [];
  const originalTextsMap = new Map();
  let node;

  while ((node = walker.nextNode())) {
    const trimmedText = node.textContent.trim();
    if (trimmedText) {
      textNodes.push(node);
      if (originalTextsMap.has(trimmedText)) {
        originalTextsMap.get(trimmedText).push(node);
      } else {
        originalTextsMap.set(trimmedText, [node]);
      }
    }
  }

  return { textNodes, originalTextsMap };
}

/**
 * اعمال ترجمه‌ها به گره‌های متنی و ذخیره اطلاعات برای بازگشت به حالت قبل.
 *
 * @param {Node[]} textNodes آرایه‌ای از گره‌های متنی.
 * @param {Map<string, string>} translations نگاشتی از متن اصلی به متن ترجمه‌شده.
 * @param {object} context شیء context شامل state و IconManager.
 */
export function applyTranslationsToNodes(textNodes, translations, context) {
  textNodes.forEach((textNode) => {
    const originalText = textNode.textContent.trim();
    const translatedText = translations.get(originalText);

    if (translatedText) {
      const parentElement = textNode.parentElement;
      if (parentElement) {
        const uniqueId =
          Math.random().toString(36).substring(2, 15) +
          Math.random().toString(36).substring(2, 15);
        parentElement.setAttribute(
          "AIWritingCompanion-data-original-text-id",
          uniqueId
        );

        context.state.originalTexts.set(uniqueId, {
          originalInnerHTML: parentElement.innerHTML,
          translatedText: translatedText,
          parent: parentElement,
        });
        textNode.textContent = translatedText;
        context.IconManager.applyTextDirection(parentElement, translatedText);
      }
    }
  });
}

export const setCursorToEnd = (element) => {
  try {
    if (!element?.isConnected) {
      // console.debug("[helpers] Element not connected to DOM: ", element);
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
