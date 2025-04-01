import { ErrorTypes } from "../services/ErrorService.js";

import PlatformStrategy from "./PlatformStrategy.js";

import { delay, logME } from "../utils/helpers";

export default class TwitterStrategy extends PlatformStrategy {
  constructor(notifier, errorHandler) {
    super(notifier);

    this.errorHandler = errorHandler;
  }

  isTwitterElement(target) {
    if (!target || !(target instanceof Element)) {
      return false;
    }

    try {
      const result = !!target.closest(
        '[data-testid="tweetTextarea_0"], [data-testid="tweetTextarea"]'
      );

      return result;
    } catch (error) {
      return false;
    }
  }

  isDMElement(target) {
    if (!target || !(target instanceof Element)) {
      return false;
    }

    try {
      const result = !!target.closest(
        '[data-testid="dmComposerTextInput"], [role="textbox"][aria-label="Text message"]'
      );

      return result;
    } catch (error) {
      return false;
    }
  }

  /**

* پاک کردن فیلد متنی از طریق ClipboardEvent

* @param {HTMLElement} tweetField - فیلد هدف

*/

  clearTweetField(tweetField) {
    if (!tweetField) {
      return;
    }

    try {
      // First ensure we have focus on the element

      tweetField.focus();

      // Check if the element already has text selected (Select All state)

      const selection = window.getSelection();

      const isTextSelected = selection.toString().length > 0;

      if (!isTextSelected) {
        // Only create a new selection if nothing is currently selected

        const range = document.createRange();

        range.selectNodeContents(tweetField);

        selection.removeAllRanges();

        selection.addRange(range);
      }

      // Create an empty paste event to clear the selected content

      const dt = new DataTransfer();

      dt.setData("text/plain", "");

      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,

        cancelable: true,

        clipboardData: dt,
      });

      tweetField.dispatchEvent(pasteEvent);
    } catch (error) {
      // Handle the error but don't throw it to prevent breaking the process

      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,

        context: "twitter-strategy-clearTweetField",
      });
    }
  }

  /**

* درج متن تمیزشده در فیلد، با استفاده از DataTransfer برای ناسازگارنشدن با Draft.js

*/

  async pasteText(tweetField, text) {
    if (!tweetField) {
      return;
    }

    try {
      if (text && typeof text === "string") {
        // بررسی نوع و وجود مقدار

        // تقسیم متن به خطوط
        let lines = text.split("\n");

        // حذف خطوط خالی انتهایی
        while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
          lines.pop();
        }

        // اتصال خطوط به همراه کاراکتر خط جدید
        const trimmedText = lines.join("\n");

        const dt = new DataTransfer();

        dt.setData("text/plain", trimmedText);

        dt.setData("text/html", trimmedText.replace(/\n/g, "<br>"));

        const pasteEvent = new ClipboardEvent("paste", {
          bubbles: true,

          cancelable: true,

          clipboardData: dt,
        });

        tweetField.dispatchEvent(pasteEvent);
      }
    } catch (error) {
      const handlerError = this.errorHandler.handle(error, {
        type: ErrorTypes.UI,

        context: "twitter-strategy-pasteText",
      });

      throw handlerError;
    }
  }

  /**

* قراردادن کرسر در انتهای فیلد متنی

* @param {HTMLElement} tweetField - فیلد هدف

*/

  setCursorToEnd(tweetField) {
    if (!tweetField) {
      return;
    }

    try {
      const selection = window.getSelection();

      const range = document.createRange();

      range.selectNodeContents(tweetField);

      range.collapse(false);

      selection.removeAllRanges();

      selection.addRange(range);
    } catch (error) {
      // Handle the error but don't throw it to prevent breaking the process

      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,

        context: "twitter-strategy-setCursorToEnd",
      });
    }
  }

  isInputElement(el) {
    if (!el) {
      return false;
    }

    const result = el.tagName === "INPUT" || el.tagName === "TEXTAREA";

    return result;
  }

  async updateElement(element, translatedText) {
    try {
      // 1. پردازش فیلد جستجو

      const searchInput = document.querySelector(
        '[data-testid="SearchBox_Search_Input"]'
      );

      if (searchInput) {
        // Check if element contains searchInput - add safety check

        let containsSearchInput = false;

        try {
          if (element && typeof element.contains === "function") {
            containsSearchInput = element.contains(searchInput);
          }
        } catch (err) {
          //
        }

        if (
          this.validateField(searchInput) &&
          (element === searchInput ||
            containsSearchInput ||
            document.activeElement === searchInput)
        ) {
          // For input elements, it's safer to clear them directly using .value

          this.applyVisualFeedback(searchInput);

          searchInput.value = translatedText;

          searchInput.dispatchEvent(new Event("input", { bubbles: true }));

          this.applyTextDirection(searchInput, translatedText);

          return;
        }
      }

      // 2. پردازش فیلد Direct Message

      let isDMElementActive = false;

      if (element) {
        isDMElementActive = this.isDMElement(element);
      }

      let isDMElementDocumentActive = false;

      isDMElementDocumentActive = this.isDMElement(document.activeElement);

      if (isDMElementActive || isDMElementDocumentActive) {
        let dmField = null;

        dmField = this.findField(
          element || document.activeElement,

          '[data-testid="dmComposerTextInput"]'
        );

        if (dmField) {
          // First we clear any selection that might exist

          try {
            window.getSelection().removeAllRanges();
          } catch (err) {
            logME(
              "[DEBUG] updateElement - Error removing selection ranges:",
              err
            );
          }

          dmField.focus();
          this.applyVisualFeedback(dmField);

          this.clearTweetField(dmField);

          await delay(50);

          this.pasteText(dmField, translatedText);

          this.applyTextDirection(dmField, translatedText);

          await delay(100);

          this.setCursorToEnd(dmField);

          return;
        }
      }

      // 3. پردازش فیلدهای توییت

      let tweetField = null;

      let isTwitterElementActive = false;

      isTwitterElementActive = this.isTwitterElement(document.activeElement);

      let isElementTwitter = false;

      if (element) {
        isElementTwitter = this.isTwitterElement(element);
      }

      if (isTwitterElementActive) {
        tweetField = document.activeElement;
      } else if (isElementTwitter) {
        tweetField = element;
      } else {
        tweetField = this.findField(
          element || document.body,

          '[data-testid="tweetTextarea_0"], [data-testid="tweetTextarea"]'
        );
      }

      if (tweetField) {
        if (this.validateField(tweetField)) {
          // First we clear any selection that might exist

          try {
            window.getSelection().removeAllRanges();
          } catch (err) {
            //
          }

          tweetField.focus();
          this.applyVisualFeedback(tweetField);

          this.clearTweetField(tweetField);

          await delay(50);

          this.pasteText(tweetField, translatedText);

          this.applyTextDirection(tweetField, translatedText);

          await delay(100);

          this.setCursorToEnd(tweetField);
        }
      }
    } catch (error) {
      console.error("[DEBUG] Critical error in updateElement:", error);

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

    if (searchInput) {
      // Safe target contains check

      let targetContainsSearchInput = false;

      if (target && typeof target.contains === "function") {
        targetContainsSearchInput = target.contains(searchInput);
      }

      if (
        this.validateField(searchInput) &&
        (target === searchInput ||
          document.activeElement === searchInput ||
          targetContainsSearchInput)
      ) {
        const result = searchInput.value.trim();

        return result;
      }
    }

    // 2. بررسی فیلد Direct Message

    let isDMElementTarget = false;

    if (target) {
      isDMElementTarget = this.isDMElement(target);
    }

    let isDMElementDocActive = false;

    isDMElementDocActive = this.isDMElement(document.activeElement);

    if (isDMElementTarget || isDMElementDocActive) {
      let dmField = null;

      dmField = this.findField(
        target || document.activeElement,

        '[data-testid="dmComposerTextInput"]'
      );

      if (dmField) {
        let result = "";

        if (dmField.tagName === "DIV") {
          const contentDiv = dmField.querySelector('[data-contents="true"]');
          if (contentDiv) {
            const lines = Array.from(
              contentDiv.querySelectorAll(":scope > div")
            );
            result = lines
              .map((line) => line.textContent)
              .join("\n")
              .trim();
          } else {
            result = dmField.textContent.trim(); // اگر data-contents پیدا نشد، به روش قبلی برگردید
          }
        } else {
          result = (dmField.value || "").trim();
        }

        return result;
      }
    }

    // 3. بررسی فیلدهای توییت

    let tweetField = null;

    let isTwitterElementActive = false;

    isTwitterElementActive = this.isTwitterElement(document.activeElement);

    let isTargetTwitter = false;

    if (target) {
      isTargetTwitter = this.isTwitterElement(target);
    }

    if (isTwitterElementActive) {
      tweetField = document.activeElement;
    } else if (isTargetTwitter) {
      tweetField = target;
    } else {
      const SELECTORS =
        '[data-testid="tweetTextarea_0"], [data-testid="tweetTextarea"]';

      tweetField = this.findField(target || document.body, SELECTORS);
    }

    if (!tweetField) {
      return "";
    }

    let result = "";

    if (tweetField.tagName === "DIV") {
      let contentDiv = tweetField.querySelector('[data-contents="true"]');
      let lines = Array.from(contentDiv.querySelectorAll(":scope > div"));
      result = lines
        .map((line) => line.textContent)
        .join("\n")
        .trim();
    } else {
      result = (tweetField.value || "").trim();
      logME("Twitter:Value", result);
    }

    return result;
  }

  // Helper method to safely check if an element is valid

  validateField(field) {
    try {
      return !!field && field instanceof Element;
    } catch (error) {
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
    } catch (error) {
      return null;
    }
  }
}
