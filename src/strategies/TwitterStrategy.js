// src/strategies/TwitterStrategy.js
import { ErrorTypes } from "../services/ErrorService.js";
import PlatformStrategy from "./PlatformStrategy.js";
import { delay } from "../utils/helpers";

export default class TwitterStrategy extends PlatformStrategy {
  constructor(notifier, errorHandler) {
    super(notifier);
    this.errorHandler = errorHandler;
  }

  isTwitterElement(target) {
    return !!target.closest(
      '[data-testid="tweetTextarea_0"], [data-testid="tweetTextarea"]'
    );
  }

  isDMElement(target) {
    return !!target.closest(
      '[data-testid="dmComposerTextInput"], [role="textbox"][aria-label="Text message"]'
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
  async pasteText(tweetField, text) {
    if (!tweetField) return;

    try {
      if (text !== undefined && text !== null) {
        const dt = new DataTransfer();
        dt.setData("text/plain", text);
        dt.setData("text/html", text.replace(/\n/g, "<br>"));

        const pasteEvent = new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: dt,
        });
        tweetField.dispatchEvent(pasteEvent);
      }
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "twitter-strategy-pasteText",
      });
    }
  }

  /**
   * قراردادن کرسر در انتهای فیلد متنی
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

  async updateElement(element, translatedText) {
    try {
      // 1. پردازش فیلد جستجو
      const searchInput = document.querySelector(
        '[data-testid="SearchBox_Search_Input"]'
      );
      if (
        searchInput &&
        this.validateField(searchInput) &&
        (element === searchInput ||
          element?.contains(searchInput) ||
          document.activeElement === searchInput)
      ) {
        searchInput.value = translatedText;
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
        this.applyVisualFeedback(searchInput);
        this.applyTextDirection(searchInput, translatedText);
        return;
      }

      // 2. پردازش فیلد Direct Message
      let dmField = null;
      if (
        this.isDMElement(element) ||
        this.isDMElement(document.activeElement)
      ) {
        dmField = this.findField(
          element,
          '[data-testid="dmComposerTextInput"]'
        );

        if (dmField) {
          dmField.focus();
          this.clearTweetField(dmField);
          await delay(50);
          this.pasteText(dmField, translatedText);
          this.applyVisualFeedback(dmField);
          this.applyTextDirection(dmField, translatedText);
          await delay(100);
          this.setCursorToEnd(dmField);
          return;
        }
      }

      // 3. پردازش فیلدهای توییت
      let tweetField = null;
      if (this.isTwitterElement(document.activeElement)) {
        tweetField = document.activeElement;
      } else if (this.isTwitterElement(element)) {
        tweetField = element;
      } else {
        tweetField = this.findField(
          element,
          '[data-testid="tweetTextarea_0"], [data-testid="tweetTextarea"]'
        );
      }

      if (tweetField && this.validateField(tweetField)) {
        tweetField.focus();
        this.clearTweetField(tweetField);
        await delay(50);
        this.pasteText(tweetField, translatedText);
        this.applyVisualFeedback(tweetField);
        this.applyTextDirection(tweetField, translatedText);
        await delay(100);
        this.setCursorToEnd(tweetField);
      }
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "twitter-strategy-updateElement",
      });
    }
  }

  extractText(target) {
    // 1. بررسی فیلد جستجو
    const searchInput = document.querySelector(
      '[data-testid="SearchBox_Search_Input"]'
    );
    if (
      searchInput &&
      this.validateField(searchInput) &&
      (target === searchInput ||
        document.activeElement === searchInput ||
        searchInput.contains(target))
    ) {
      return searchInput.value.trim();
    }

    // 2. بررسی فیلد Direct Message
    if (this.isDMElement(target) || this.isDMElement(document.activeElement)) {
      const dmField = this.findField(
        target,
        '[data-testid="dmComposerTextInput"]'
      );
      if (dmField?.tagName === "DIV") {
        return dmField.textContent.trim();
      }
      return dmField?.value.trim() || "";
    }

    // 3. بررسی فیلدهای توییت
    let tweetField = null;
    if (this.isTwitterElement(document.activeElement)) {
      tweetField = document.activeElement;
    } else if (this.isTwitterElement(target)) {
      tweetField = target;
    } else {
      const SELECTORS =
        '[data-testid="tweetTextarea_0"], [data-testid="tweetTextarea"]';
      tweetField = this.findField(target, SELECTORS);
    }

    if (!tweetField) {
      console.warn("فیلد متنی برای استخراج متن یافت نشد.");
      return "";
    }

    return tweetField?.tagName === "DIV" ?
        tweetField.textContent.trim()
      : tweetField.value.trim();
  }

  replaceSelection(element, translatedText) {
    return this.updateElement(element, translatedText);
  }
}
