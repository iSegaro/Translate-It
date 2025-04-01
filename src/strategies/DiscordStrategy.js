import { ErrorTypes } from "../services/ErrorService";
import PlatformStrategy from "./PlatformStrategy.js";
import { delay } from "../utils/helpers";

export default class DiscordStrategy extends PlatformStrategy {
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
      /**
       * Detect Keyboard Shortcus Guide Modal ("keyboardShortcutsModal_f061f6")
       */
      const shortcutsModal = document.querySelector(
        ".keyboardShortcutsModal_f061f6"
      );
      if (shortcutsModal) {
        // const escapeEvent = new KeyboardEvent("keydown", {
        //   key: "Escape",
        //   code: "Escape",
        //   keyCode: 27,
        //   which: 27,
        //   bubbles: true,
        //   cancelable: true,
        // });
        // shortcutsModal.dispatchEvent(escapeEvent);
        return;
      }

      if (translatedText !== undefined && translatedText !== null) {
        if (element.isContentEditable) {
          // برای عناصر contentEditable از <br> استفاده کنید
          element.focus();
          element.value = translatedText;
          this.applyVisualFeedback(element);
          this.clearField(element);
          await delay(200);
          this.pasteText(element, translatedText);
          this.applyTextDirection(element, translatedText);
        } else {
          // برای input و textarea از \n استفاده کنید
          element.value = translatedText;
          element.focus();
          this.applyVisualFeedback(element);
          this.clearField(element);
          await delay(200);
          this.pasteText(element, translatedText);
          this.applyTextDirection(element, translatedText);
        }
      }
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "Discord-strategy-updateElement",
      });
    }
  }

  /**
   * پاک کردن محتوای المان قابل ویرایش
   */
  clearField(Field) {
    if (!Field) {
      return;
    }

    try {
      // First ensure we have focus on the element

      Field.focus();

      // Check if the element already has text selected (Select All state)

      const selection = window.getSelection();

      const isTextSelected = selection.toString().length > 0;

      if (!isTextSelected) {
        // Only create a new selection if nothing is currently selected

        const range = document.createRange();

        range.selectNodeContents(Field);

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

      Field.dispatchEvent(pasteEvent);
    } catch (error) {
      // Handle the error but don't throw it to prevent breaking the process

      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,

        context: "twitter-strategy-clearTweetField",
      });
    }
  }

  async pasteText(field, text) {
    if (!field) {
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

        field.dispatchEvent(pasteEvent);
      }
    } catch (error) {
      const handlerError = this.errorHandler.handle(error, {
        type: ErrorTypes.UI,

        context: "twitter-strategy-pasteText",
      });

      throw handlerError;
    }
  }
}
