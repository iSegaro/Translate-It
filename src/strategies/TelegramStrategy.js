import PlatformStrategy from "./PlatformStrategy";
import { CONFIG } from "../config.js";
import { delay } from "../utils/helpers";

export default class TelegramStrategy extends PlatformStrategy {
  constructor(notifier) {
    super();
    this.notifier = notifier;
  }

  isInputField(field) {
    return field.tagName === "INPUT" || field.tagName === "TEXTAREA";
  }

  isContentEditable(field) {
    return field.isContentEditable;
  }

  getTelegramField(element) {
    if (this.isInputField(element) || this.isContentEditable(element)) {
      return element;
    }
    let field = element.closest('[aria-label="Message input"]');
    if (field) return field;
    field =
      element.closest(".composer_rich_textarea") ||
      element.closest(".public_DraftEditor-content");
    if (field) return field;
    field =
      document.querySelector(".composer_rich_textarea") ||
      document.querySelector(".public_DraftEditor-content");
    if (!field) {
      const editableFields = document.querySelectorAll(
        '[contenteditable="true"]'
      );
      if (editableFields.length === 1) {
        field = editableFields[0];
      }
    }
    return field;
  }

  /**
   * پاکسازی فیلد:
   * - برای input/textarea: مقدار value به "" تنظیم می‌شود.
   * - برای contenteditable: ابتدا تمام محتوا انتخاب شده و پس از delay، innerHTML به "" تنظیم می‌شود
   *   و یک رویداد paste با داده خالی ارسال می‌شود تا تغییرات لازم اعمال گردد.
   */
  async clearField(field) {
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
  }

  pasteText(field, text) {
    try {
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      dt.setData("text/html", text.replace(/\n/g, "<br>"));
      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dt,
      });
      field.dispatchEvent(pasteEvent);
    } catch (error) {
      console.error("TelegramStrategy: pasteText ERROR:", error);
    }
  }

  setCursorToEnd(field) {
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
  }

  async updateElement(element, translatedText) {
    try {
      await delay(100);
      let telegramField = this.getTelegramField(element);
      if (!telegramField) {
        console.error("Telegram field element NOT FOUND using all selectors.");
        return;
      }

      await this.safeFocus(telegramField);

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
        telegramField.style.transition = "background-color 0.5s ease";
        telegramField.style.backgroundColor = "#d4f8d4";
        requestAnimationFrame(() => {
          setTimeout(
            () => (telegramField.style.backgroundColor = "transparent"),
            1000
          );
        });
      }

      await delay(100);
      this.setCursorToEnd(telegramField);
    } catch (error) {
      console.error("TelegramStrategy: updateElement ERROR:", error);
      throw error;
    }
  }

  async safeFocus(field) {
    field.focus({ preventScroll: true });
    await delay(100);
    return field;
  }

  async selectAllContent(field) {
    document.execCommand("selectAll");
    await delay(100);
    return field;
  }

  async simulatePaste(field, text) {
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

  triggerStateUpdate(field) {
    field.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
      })
    );
  }
}
