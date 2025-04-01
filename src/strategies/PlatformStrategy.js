// src/strategies/PlatformStrategy.js
import { CONFIG } from "../config.js";
import { ErrorTypes } from "../services/ErrorService.js";

export default class PlatformStrategy {
  constructor(notifier = null, errorHandler = null) {
    this.notifier = notifier;
    this.errorHandler = errorHandler;
  }

  extractText(target) {
    throw new Error("متد extractText باید در کلاس فرزند پیاده‌سازی شود");
  }

  findField(startElement, selectors, maxDepth = 5) {
    let currentElement = startElement;
    for (let i = 0; i < maxDepth; i++) {
      if (!currentElement) break;
      const found = currentElement.closest(selectors);
      if (found) return found;
      currentElement = currentElement.parentElement;
    }
    return document.querySelector(selectors);
  }

  validateField(element) {
    return (
      element &&
      element.isConnected &&
      (this.isInputElement(element) || element.hasAttribute("contenteditable"))
    );
  }

  async applyVisualFeedback(element) {
    if (!element) return;
    try {
      const originalBackgroundColor = element.style.backgroundColor;
      element.style.transition = "background-color 0.5s ease";
      element.style.backgroundColor = "#d4f8d4";
      requestAnimationFrame(() => {
        setTimeout(() => {
          element.style.backgroundColor = originalBackgroundColor;
        }, 300);
      });
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "platform-strategy-animation",
      });
    }
  }

  applyTextDirection(element, translatedText) {
    try {
      const isRtl = CONFIG.RTL_REGEX.test(translatedText);

      // برای input/textarea
      if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
        element.setAttribute("dir", isRtl ? "rtl" : "ltr");
      }
      // برای سایر المان‌ها
      else {
        element.style.direction = isRtl ? "rtl" : "ltr";
        element.style.textAlign = isRtl ? "right" : "left";
      }
    } catch (error) {
      const handleError = this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        code: "text-direction-error",
        context: "platform-strategy-TextDirection",
      });
      throw handleError;
    }
  }

  handleFieldError(errorName, platformName) {
    const errorMap = {
      FIELD_NOT_FOUND: `لطفا روی فیلد متن ${platformName} کلیک کنید`,
      CLIPBOARD_ERROR: "خطای دسترسی به کلیپبورد",
    };

    if (this.notifier) {
      this.notifier.show(errorMap[errorName], "warning");
    }
    if (this.errorHandler) {
      this.errorHandler.handle(new Error(errorName), {
        type: ErrorTypes.UI,
        context: "platform-strategy-field-error",
      });
    } else {
      throw new Error(errorName);
    }
  }
}
