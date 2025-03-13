// src/strategies/DefaultStrategy.js
import { CONFIG } from "../config.js";
import PlatformStrategy from "./PlatformStrategy";

export default class DefaultStrategy extends PlatformStrategy {
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
    if (element.isContentEditable) {
      element.innerHTML = translatedText;
    } else {
      element.value = translatedText;
    }
    this.applyTextDirection(element, translatedText);
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
