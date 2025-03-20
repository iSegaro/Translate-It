// src/strategies/YoutubeStrategy.js
import { ErrorTypes } from "../services/ErrorService.js";
import { CONFIG } from "../config.js";
import PlatformStrategy from "./PlatformStrategy.js";

export default class YoutubeStrategy extends PlatformStrategy {
  constructor(notifier, errorHandler) {
    super(notifier);
    this.errorHandler = errorHandler;
  }
  /**
   * استخراج متن از المان‌های استاندارد
   */
  extractText(target) {
    if (target.isContentEditable) {
      return target.innerText.trim();
    }
    return target.value || target.textContent.trim();
  }

  async updateElement(element, translatedText) {
    try {
      if (translatedText !== undefined && translatedText !== null) {
        if (element.isContentEditable) {
          // برای عناصر contentEditable از <br> استفاده کنید
          const htmlText = translatedText.replace(/\n/g, "<br>");
          element.innerHTML = htmlText;
          this.applyTextDirection(element, htmlText);
        } else {
          // برای input و textarea از \n استفاده کنید
          element.value = translatedText;
          this.applyTextDirection(element, translatedText);
        }
      }
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "youtube-strategy-updateElement",
      });
    }
  }

  /**
   * پاک کردن محتوای المان قابل ویرایش
   */
  clearContent(element) {
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      element.value = "";
    } else {
      element.innerHTML = "";
    }
  }

  /**
   * اعمال جهت متن برای استراتژی پیش‌فرض
   */
  applyTextDirection(element, translatedText) {
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
  }
}
