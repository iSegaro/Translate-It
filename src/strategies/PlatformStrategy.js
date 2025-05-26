// src/strategies/PlatformStrategy.js

import { ErrorTypes } from "../services/ErrorTypes.js";
import { CONFIG } from "../config.js";

export default class PlatformStrategy {
  constructor(notifier = null, errorHandler = null) {
    this.notifier = notifier;
    this.errorHandler = errorHandler;
  }

  extractText(target) {
    try {
      if (!target) return "";
      if (target.isContentEditable) {
        return target.innerText?.trim() || "";
      }
      return target.value?.trim() || target.textContent?.trim() || "";
    } catch (error) {
      this.errorHandler?.handle(error, {
        type: ErrorTypes.UI,
        context: "platform-strategy-extractText",
      });
      return "";
    }
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
    if (!element || !element.style) return; // بررسی بیشتر برای اطمینان

    const originalBackgroundColor = element.style.backgroundColor;
    const originalTransition = element.style.transition;

    try {
      element.style.transition = "background-color 0.3s ease"; // زمان انتقال
      element.style.backgroundColor = "#d4f8d4"; // رنگ سبز برای نشان دادن پردازش/موفقیت

      // منتظر میمونه تا رنگ سبز قابل مشاهده باشد و سپس به حالت اولیه بازمیگردد
      await new Promise(resolve => setTimeout(resolve, 300)); // مدت زمان نمایش رنگ سبز

      element.style.backgroundColor = originalBackgroundColor;

      // منتظر میمونه تا انیمیشن بازگشت به پایان برسد
      await new Promise(resolve => setTimeout(resolve, 300)); // باید با زمان transition هماهنگ باشد

    } catch (error) {
      // در صورت بروز خطا، سعی میکنه استایل‌ها را فوراً به حالت اولیه بازگردند
      element.style.backgroundColor = originalBackgroundColor;
      this.errorHandler?.handle(error, {
        type: ErrorTypes.UI,
        context: "platform-strategy-animation",
      });
    } finally {
      // همیشه ویژگی transition اصلی را بازمی‌گرداند
      element.style.transition = originalTransition;
    }
  }

  applyTextDirection(element, translatedText) {
    try {
      const isRtl = CONFIG.RTL_REGEX.test(translatedText);

      // برای input/textarea
      if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
        element.setAttribute("dir", isRtl ? "rtl" : "ltr");
      } else {
        element.style.direction = isRtl ? "rtl" : "ltr";
        element.style.textAlign = isRtl ? "right" : "left";
      }
    } catch (error) {
      const handleError = this.errorHandler?.handle(error, {
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
