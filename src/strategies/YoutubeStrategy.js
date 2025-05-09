// src/strategies/YoutubeStrategy.js
import { ErrorTypes } from "../services/ErrorTypes.js";
import PlatformStrategy from "./PlatformStrategy.js";
import { logME } from "../utils/helpers.js";
import DOMPurify from "dompurify";

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
      if (!target) return "";

      // حالت ۱: المان دارای contenteditable
      if (target?.isContentEditable) {
        return target?.innerText?.trim?.() || "";
      }

      // حالت ۲: المان‌های input و textarea
      if (
        target?.tagName &&
        (target.tagName === "TEXTAREA" || target.tagName === "INPUT")
      ) {
        return target?.value?.trim?.() || "";
      }

      // حالت ۳: fallback → استفاده از textContent
      return target?.textContent?.trim?.() || "";
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "youtube-strategy-extractText",
      });
      return "";
    }

    // try {
    //   if (!target || !target.isConnected) return "";

    //   if (target.isContentEditable) {
    //     return target.innerText?.trim?.() || "";
    //   }

    //   return target.value || target.textContent?.trim?.() || "";
    // } catch (error) {
    //   this.errorHandler.handle(error, {
    //     type: ErrorTypes.UI,
    //     context: "youtube-strategy-extractText",
    //     element: target?.tagName,
    //   });
    //   return "";
    // }
  }

  async updateElement(element, translatedText) {
    try {
      if (!element || !element.isConnected) {
        logME("عنصر معتبر برای به‌روزرسانی وجود ندارد");
        return false;
      }

      if (translatedText !== undefined && translatedText !== null) {
        if (element.isContentEditable) {
          // برای عناصر contentEditable از <br> استفاده کنید
          const htmlText = translatedText.replace(/\n/g, "<br>");
          const trustedHTML = DOMPurify.sanitize(htmlText, {
            RETURN_TRUSTED_TYPE: true,
          });

          const parser = new DOMParser();
          const doc = parser.parseFromString(
            trustedHTML.toString(),
            "text/html"
          );

          element.textContent = "";
          Array.from(doc.body.childNodes).forEach((node) => {
            element.appendChild(node);
          });

          this.applyVisualFeedback(element);
          this.applyTextDirection(element, htmlText);
        } else {
          // برای input و textarea از \n استفاده کنید
          element.value = translatedText;
          this.applyVisualFeedback(element);
          this.applyTextDirection(element, translatedText);
        }
      }
      return true;
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "youtube-strategy-updateElement",
        element: element?.tagName,
      });
      return false;
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
