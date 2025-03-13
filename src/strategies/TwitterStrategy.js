// src/strategies/TwitterStrategy.js
import PlatformStrategy from "./PlatformStrategy";
import { delay } from "../utils/helpers";
import { CONFIG } from "../config";

export default class TwitterStrategy extends PlatformStrategy {
  isTwitterElement(target) {
    return !!target.closest(
      '[data-testid="tweetTextarea_0"], [data-testid="tweetTextarea"], [role="textbox"]'
    );
  }

  /**
   * پاک کردن فیلد متنی از طریق ClipboardEvent
   * @param {HTMLElement} tweetField - فیلد هدف
   */
  clearTweetField(tweetField) {
    if (!tweetField) return;

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(tweetField);
    selection.removeAllRanges();
    selection.addRange(range);

    const dt = new DataTransfer();
    dt.setData("text/plain", "");
    const pasteEvent = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: dt,
    });
    tweetField.dispatchEvent(pasteEvent);
  }

  /**
   * درج متن تمیزشده در فیلد، با استفاده از DataTransfer برای ناسازگارنشدن با Draft.js
   */
  pasteText(tweetField, text) {
    if (!tweetField) return;

    try {
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      dt.setData("text/html", text.replace(/\n/g, "<br>"));

      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dt,
      });
      tweetField.dispatchEvent(pasteEvent);
    } catch (error) {
      // خطاها از طرف TranslationHandler مدیریت می‌شوند
    }
  }

  /**
   * قراردادن کرسر در انتهای فیلد متنی (الگوبرداری از userscript)
   * @param {HTMLElement} tweetField - فیلد هدف
   */
  setCursorToEnd(tweetField) {
    if (!tweetField) return;

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(tweetField);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  isInputElement(el) {
    return el.tagName === "INPUT" || el.tagName === "TEXTAREA";
  }

  // src/strategies/TwitterStrategy.js
  async updateElement(element, translatedText) {
    let tweetField = null;

    // اولویت اول: استفاده از المان فوکوس شده اگر یک فیلد توییتر باشد
    if (this.isTwitterElement(document.activeElement)) {
      tweetField = document.activeElement;
    }
    // اگر المان فوکوس شده فیلد توییتر نیست، از المان ارائه شده استفاده کنید
    else if (this.isTwitterElement(element)) {
      tweetField = element;
    }
    // اگر هیچ کدام از موارد بالا نبود، به دنبال فیلد بگردید (برای سناریوهایی که فوکوس به درستی تشخیص داده نمی‌شود)
    else {
      const SELECTORS =
        '[data-testid="tweetTextarea_0"], [data-testid="tweetTextarea"], [role="textbox"]';
      tweetField = this.findField(element, SELECTORS);
    }

    if (!tweetField) {
      console.warn("فیلد توییت برای ترجمه یافت نشد.");
      return;
    }

    if (!this.validateField(tweetField)) {
      return;
    }

    // بررسی اینکه آیا این فیلد مربوط به جستجو است یا توییت نویسی
    const placeholder = tweetField.getAttribute("placeholder") || "";
    const ariaLabel = tweetField.getAttribute("aria-label") || "";
    if (
      placeholder.toLowerCase().includes("search") ||
      ariaLabel.toLowerCase().includes("search")
    ) {
      // به‌روزرسانی ساده برای فیلد جستجو
      tweetField.value = translatedText;
      tweetField.dispatchEvent(new Event("input", { bubbles: true }));
      console.info("Translation applied to Twitter search field.");
      return;
    }

    // ادامه روند در حالت توییت‌نویسی
    tweetField.focus();
    this.clearTweetField(tweetField);
    await delay(50);

    this.pasteText(tweetField, translatedText);

    tweetField.style.transition = "background-color 0.5s ease";
    tweetField.style.backgroundColor = "#d4f8d4";
    requestAnimationFrame(() => {
      setTimeout(
        () => (tweetField.style.backgroundColor = "transparent"),
        1000
      );
    });

    await delay(100);
    this.setCursorToEnd(tweetField);
  }

  extractText(target) {
    let tweetField = null;

    // اولویت اول: استفاده از المان فوکوس شده اگر یک فیلد توییتر باشد
    if (this.isTwitterElement(document.activeElement)) {
      tweetField = document.activeElement;
    }
    // اگر المان فوکوس شده فیلد توییتر نیست، از المان ارائه شده استفاده کنید
    else if (this.isTwitterElement(target)) {
      tweetField = target;
    }
    // اگر هیچ کدام از موارد بالا نبود، به دنبال فیلد بگردید
    else {
      const SELECTORS =
        '[data-testid="tweetTextarea_0"], [data-testid="tweetTextarea"], [role="textbox"]';
      tweetField = this.findField(target, SELECTORS);
    }

    if (!tweetField) {
      console.warn("فیلد توییت برای استخراج متن یافت نشد.");
      return "";
    }

    if (tweetField?.tagName === "DIV") {
      return tweetField.textContent.trim();
    }

    return tweetField.value || tweetField.textContent.trim();
  }

  applyTextDirection(element, translatedText) {
    const paragraphs = element.querySelectorAll('[data-text="true"]');
    paragraphs.forEach((p) => {
      const isRtl = CONFIG.RTL_REGEX.test(p.textContent);
      p.style.direction = isRtl ? "rtl" : "ltr";
      p.style.textAlign = isRtl ? "right" : "left";
    });
  }
}
