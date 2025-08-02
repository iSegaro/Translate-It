import { ErrorTypes } from "../error-management/ErrorTypes.js";

import PlatformStrategy from "./PlatformStrategy.js";

import { delay, logME } from "../utils/core/helpers.js";

export default class TwitterStrategy extends PlatformStrategy {
  constructor(notifier, errorHandler) {
    super(notifier);

    this.errorHandler = errorHandler;
  }

  isTwitterElement(target) {
    if (!target || !(target instanceof Element)) return false;
    try {
      return !!target.closest('[data-testid="tweetTextarea_0"]');
    } catch {
      return false;
    }
  }

  isDMElement(target) {
    if (!target || !(target instanceof Element)) return false;
    try {
      return !!target.closest('[data-testid="dmComposerTextInput"]');
    } catch {
      return false;
    }
  }

  clearTweetField(tweetField) {
    if (!tweetField) return;
    try {
      tweetField.focus();
      const selection = window.getSelection();
      if (selection.toString().length === 0) {
        const range = document.createRange();
        range.selectNodeContents(tweetField);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      const dt = new DataTransfer();
      dt.setData("text/plain", "");
      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dt,
      });
      tweetField.dispatchEvent(pasteEvent);
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "twitter-strategy-clearTweetField",
      });
    }
  }

  async pasteText(tweetField, text) {
    if (!tweetField || typeof text !== "string") return;
    try {
      const trimmedText = text.trim();
      tweetField.focus();
      await delay(30);

      // از paste event برای سازگاری با React استفاده می‌کنیم
      const dt = new DataTransfer();
      dt.setData("text/plain", trimmedText);
      dt.setData("text/html", trimmedText.replace(/\n/g, "<br>"));
      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dt,
      });

      tweetField.dispatchEvent(pasteEvent);

      // برای اطمینان از قرار گرفتن کرسر در انتها
      await delay(50);
      this.setCursorToEnd(tweetField);
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "twitter-strategy-pasteText",
      });
      throw error; // خطا را پرتاب می‌کنیم تا updateElement متوجه شکست شود
    }
  }

  setCursorToEnd(tweetField) {
    if (!tweetField) return;
    try {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(tweetField);
      range.collapse(false); // انتقال به انتها
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "twitter-strategy-setCursorToEnd",
      });
    }
  }

  async updateElement(element, translatedText) {
    try {
      // 1. پردازش فیلد جستجو
      const searchInput = document.querySelector(
        '[data-testid="SearchBox_Search_Input"]',
      );
      if (searchInput && element.contains(searchInput)) {
        this.applyVisualFeedback(searchInput);
        searchInput.value = translatedText;
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
        this.applyTextDirection(searchInput, translatedText);
        return true;
      }

      // 2. پردازش فیلد Direct Message (DM)
      if (this.isDMElement(element)) {
        const dmField = element.closest('[data-testid="dmComposerTextInput"]');
        if (dmField) {
          dmField.focus();
          this.applyVisualFeedback(dmField);
          this.clearTweetField(dmField);
          await delay(50);
          await this.pasteText(dmField, translatedText);
          this.applyTextDirection(dmField, translatedText);
          return true;
        }
      }

      // 3. <<<<< بخش کلیدی اصلاح شده: پردازش فیلد اصلی توییت >>>>>
      if (this.isTwitterElement(element)) {
        const tweetField = element.closest('[data-testid="tweetTextarea_0"]');
        if (tweetField) {
          tweetField.focus();
          this.applyVisualFeedback(tweetField);

          // ابتدا فیلد را پاک می‌کنیم
          this.clearTweetField(tweetField);
          await delay(50); // تاخیر کوتاه برای پردازش رویداد clear

          // متن جدید را paste می‌کنیم
          await this.pasteText(tweetField, translatedText);
          this.applyTextDirection(tweetField, translatedText);

          logME("[TwitterStrategy] Tweet field updated successfully.");
          return true; // گزارش موفقیت
        }
      }

      logME("[TwitterStrategy] No specific element matched. Update failed.");
      return false; // اگر هیچ یک از شرایط بالا برقرار نبود
    } catch (error) {
      logME("[TwitterStrategy] Critical error in updateElement:", error);
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "twitter-strategy-updateElement",
      });
      return false; // در صورت بروز خطا، شکست را گزارش می‌دهیم
    }
  }

  extractText(target) {
    try {
      const searchInput = target.closest(
        '[data-testid="SearchBox_Search_Input"]',
      );
      if (searchInput) return searchInput.value.trim();

      const dmField = target.closest('[data-testid="dmComposerTextInput"]');
      if (dmField) return dmField.textContent.trim();

      const tweetField = target.closest('[data-testid="tweetTextarea_0"]');
      if (tweetField) return tweetField.textContent.trim();

      return target.value || target.textContent || "";
    } catch {
      return "";
    }
  }

  isInputElement(el) {
    if (!el) {
      return false;
    }

    const result = el.tagName === "INPUT" || el.tagName === "TEXTAREA";

    return result;
  }

  // Helper method to safely check if an element is valid

  validateField(field) {
    try {
      return !!field && field instanceof Element;
    } catch {
      return false;
    }
  }

  // Helper method to safely find a field

  findField(element, selector) {
    if (!element) {
      return null;
    }

    try {
      // Check if element itself matches the selector

      if (element.matches && element.matches(selector)) {
        return element;
      }

      // Check if element can use querySelector

      if (typeof element.querySelector === "function") {
        const field = element.querySelector(selector);

        return field;
      }

      // If element is not a proper DOM node with querySelector, try document

      const field = document.querySelector(selector);

      return field;
    } catch {
      return null;
    }
  }
}
