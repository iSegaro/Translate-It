// src/strategies/DefaultStrategy.js

import { ErrorTypes } from "../services/ErrorTypes.js";
import PlatformStrategy from "./PlatformStrategy.js";

export default class DefaultStrategy extends PlatformStrategy {
  constructor(notifier, errorHandler) {
    super(notifier);
    this.errorHandler = errorHandler;
  }

  /**
   * استخراج متن از المان‌های استاندارد (ایمن‌سازی شده)
   */
  extractText(target) {
    try {
      if (!target || !(target instanceof Element)) return "";

      // حالت contenteditable
      if (target.isContentEditable) {
        return target.innerText?.trim?.() || "";
      }

      // حالت input/textarea
      if (["TEXTAREA", "INPUT"].includes(target.tagName)) {
        return target.value?.trim?.() || "";
      }

      // حالت fallback برای سایر المان‌ها
      return target.textContent?.trim?.() || "";
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "default-strategy-extractText",
      });
      return "";
    }
  }

  async updateElement(element, translatedText) {
    try {
      if (translatedText !== undefined && translatedText !== null) {
        if (element.isContentEditable) {
          const htmlText = translatedText.replace(/\n/g, "<br>");
          element.innerHTML = htmlText;
          this.applyVisualFeedback(element);
          this.applyTextDirection(element, htmlText);
        } else {
          element.value = translatedText;
          this.applyVisualFeedback(element);
          this.applyTextDirection(element, translatedText);
        }

        return true;
      }
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "default-strategy-updateElement",
      });
      return false;
    }
  }

  /**
   * پاک کردن محتوای المان قابل ویرایش
   */
  clearContent(element) {
    if (!element) return;

    try {
      if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
        element.value = "";
      } else {
        element.innerHTML = "";
      }
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "default-strategy-clearContent",
      });
    }
  }
}
