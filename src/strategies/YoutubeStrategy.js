// src/strategies/YoutubeStrategy.js
import { ErrorTypes } from "../services/ErrorService.js";
import { CONFIG } from "../config.js";
import PlatformStrategy from "./PlatformStrategy.js";

export default class YoutubeStrategy extends PlatformStrategy {
  constructor(notifier, errorHandler) {
    super(notifier, errorHandler);
    this.errorHandler = errorHandler;
  }

  isYoutube_ExtraField(target) {
    if (!target || target.tagName !== "INPUT") {
      return false;
    }
    return (
      target.getAttribute("name") === "search_query" ||
      target.getAttribute("id") === "end"
    );
  }

  extractText(target) {
    try {
      if (!target) {
        // console.debug("عنصر هدف برای استخراج متن وجود ندارد");
      }

      if (target.isContentEditable) {
        return target.innerText.trim();
      }
      return target.value || target.textContent.trim();
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "youtube-strategy-extractText",
        element: target?.tagName,
      });
      return "";
    }
  }

  async updateElement(element, translatedText) {
    try {
      if (!element || !element.isConnected) {
        // throw new Error("عنصر معتبر برای به‌روزرسانی وجود ندارد");
        return;
      }

      if (translatedText !== undefined && translatedText !== null) {
        if (element.isContentEditable) {
          // برای عناصر contentEditable از <br> استفاده کنید
          const htmlText = translatedText.replace(/\n/g, "<br>");
          element.innerHTML = htmlText;
          this.applyVisualFeedback(element);
          this.applyTextDirection(element, htmlText);
        } else {
          // برای input و textarea از \n استفاده کنید
          element.value = translatedText;
          this.applyVisualFeedback(element);
          this.applyTextDirection(element, translatedText);
        }
      }
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "youtube-strategy-updateElement",
        element: element?.tagName,
      });
    }
  }

  async clearContent(element) {
    try {
      if (!element || !element.isConnected) {
        // throw new Error("عنصر معتبر برای پاک‌سازی وجود ندارد");
        return;
      }

      if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
        element.value = "";
      } else {
        element.innerHTML = "";
      }

      this.applyVisualFeedback(element);
    } catch (error) {
      const handlerError = this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "youtube-strategy-clearContent",
        element: element?.tagName,
      });
      throw handlerError;
    }
  }
}
