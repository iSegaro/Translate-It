// src/strategies/TelegramStrategy.js
import { ErrorTypes } from "../services/ErrorService.js";
import { CONFIG } from "../config.js";
import PlatformStrategy from "./PlatformStrategy.js";
import { delay } from "../utils/helpers";

export default class TelegramStrategy extends PlatformStrategy {
  constructor(notifier, errorHandler) {
    super(notifier);
    this.errorHandler = errorHandler;
  }
  isInputField(field) {
    return field.tagName === "INPUT" || field.tagName === "TEXTAREA";
  }

  isContentEditable(field) {
    return field.isContentEditable;
  }

  getTelegramField(element) {
    if (!element) return;

    try {
      if (this.isInputField(element) || this.isContentEditable(element)) {
        return element;
      }

      let field =
        element.closest('[aria-label="Message input"]') ||
        element.closest(".composer_rich_textarea") ||
        element.closest(".public_DraftEditor-content");

      if (!field) {
        const editableFields = document.querySelectorAll(
          '[contenteditable="true"]'
        );
        field = editableFields.length === 1 ? editableFields[0] : null;
      }

      // اصلاح جدید: بررسی المانهای تو در تو
      if (field && !this.isContentEditable(field)) {
        const nestedEditable = field.querySelector('[contenteditable="true"]');
        if (nestedEditable) field = nestedEditable;
      }

      return field;
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "telegram-strategy-getTelegramField",
      });
    }
  }

  /**
   * پاکسازی فیلد:
   * - برای input/textarea: مقدار value به "" تنظیم می‌شود.
   * - برای contenteditable: ابتدا تمام محتوا انتخاب شده و پس از delay، innerHTML به "" تنظیم می‌شود
   *   و یک رویداد paste با داده خالی ارسال می‌شود تا تغییرات لازم اعمال گردد.
   */
  async clearField(field) {
    try {
      if (!field) {
        return;
      }
      if (this.isInputField(field)) {
        field.value = "";
      } else {
        const selection = window.getSelection();
        if (selection) {
          const range = document.createRange();
          range.selectNodeContents(field);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        await delay(50);
        // پاکسازی مستقیم محتوا
        field.innerHTML = "";
        const dt = new DataTransfer();
        dt.setData("text/plain", "");
        const pasteEvent = new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: dt,
        });

        await delay(50);
        field.dispatchEvent(pasteEvent);
      }
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "telegram-strategy-Clearfield",
      });
    }
  }

  pasteText(field, text) {
    try {
      if (!field) {
        return;
      }
      if (text !== undefined && text !== null) {
        const dt = new DataTransfer();
        dt.setData("text/plain", text);
        let htmlText = text.replace(/\n/g, "<br>");
        dt.setData("text/html", htmlText);
        const pasteEvent = new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: dt,
        });
        field.dispatchEvent(pasteEvent);
      }
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "telegram-strategy-pasteText",
      });
    }
  }

  setCursorToEnd(field) {
    try {
      if (!field) {
        return;
      }
      if (this.isInputField(field)) {
        const len = field.value.length;
        field.setSelectionRange(len, len);
      } else {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(field);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.SERVICE,
        context: "telegram-strategy-setCursorToEnd",
      });
    }
  }

  async updateElement(element, translatedText) {
    if (!translatedText) {
      return;
    }
    if (!element) {
      return;
    }
    const SELECTORS =
      '[aria-label="Message input"], .composer_rich_textarea, .public_DraftEditor-content, [contenteditable="true"]';

    try {
      await delay(100);

      // 1. ادغام منطق پیدا کردن فیلد
      let telegramField =
        this.findField(element, SELECTORS) ||
        this.getTelegramField(element) ||
        document.querySelector(SELECTORS);

      // 2. اعتبارسنجی پیشرفته
      if (!this.validateField(telegramField)) {
        // throw new Error("فیلد تلگرام یافت نشد")
        return;
      }

      // 3. جلوگیری از پردازش المان‌های غیرفعال
      if (element !== telegramField && !telegramField.contains(element)) {
        // console.warn("Element is not part of Telegram field. Skipping...");
        return;
      }

      await this.safeFocus(telegramField);

      // 4. منطق به‌روزرسانی یکپارچه
      this.applyVisualFeedback(document.getElementById("message-input-text"));
      if (this.isInputField(telegramField)) {
        telegramField.value = translatedText;
        telegramField.setAttribute(
          "dir",
          CONFIG.RTL_REGEX.test(translatedText) ? "rtl" : "ltr"
        );
        telegramField.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        await this.clearField(telegramField);
        this.pasteText(telegramField, translatedText);
      }

      this.setCursorToEnd(telegramField);
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.SERVICE,
        context: "telegram-strategy-updateElement",
      });
    }
  }

  extractText(target) {
    if (!target) {
      return "";
    }
    try {
      const telegramField = this.getTelegramField(target);

      if (telegramField?.isContentEditable) {
        return telegramField.innerText.trim();
      }

      return telegramField?.value.trim() || "";
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "telegram-strategy-extractText",
      });
    }
  }

  // 7. بهبود متد validateField
  validateField(element) {
    const hasNestedEditable = element?.querySelector(
      '[contenteditable="true"]'
    );
    return (
      element &&
      element.isConnected &&
      (this.isInputField(element) ||
        this.isContentEditable(element) ||
        hasNestedEditable)
    );
  }

  async safeFocus(field) {
    if (!field) {
      return;
    }
    try {
      field.focus({ preventScroll: true });
      await delay(100);
      return field;
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "telegram-strategy-safeFocus",
      });
    }
  }

  async selectAllContent(field) {
    if (!field) {
      return;
    }
    try {
      document.execCommand("selectAll");
      await delay(100);
      return field;
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "telegram-strategy-SelectAllContent",
      });
    }
  }

  async simulatePaste(field, text) {
    if (!field) {
      return;
    }
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
        field.dispatchEvent(pasteEvent);
        await delay(50);
      }
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "telegram-strategy-simulatePaste",
      });
    }
  }

  triggerStateUpdate(field) {
    field.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
      })
    );
  }
}
