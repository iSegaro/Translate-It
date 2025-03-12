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

  async updateElement(element, translatedText) {
    // تلاش برای یافتن فیلد هدف با استفاده از closest
    let tweetField = element.closest(
      '[data-testid="tweetTextarea_0"], [data-testid="tweetTextarea"], [role="textbox"]'
    );

    // اگر فیلد پیدا نشد، بررسی می‌کنیم آیا خود عنصر (element) یک فیلد ورودی معتبر است
    if (
      !tweetField &&
      (element.tagName === "INPUT" || element.tagName === "TEXTAREA")
    ) {
      tweetField = element;
    }

    // اگر باز هم فیلد پیدا نشد، خطا چاپ می‌شود
    if (!tweetField) {
      console.error("Tweet field element not found in Twitter.");
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

  applyTextDirection(element, translatedText) {
    const paragraphs = element.querySelectorAll('[data-text="true"]');
    paragraphs.forEach((p) => {
      const isRtl = CONFIG.RTL_REGEX.test(p.textContent);
      p.style.direction = isRtl ? "rtl" : "ltr";
      p.style.textAlign = isRtl ? "right" : "left";
    });
  }
}
