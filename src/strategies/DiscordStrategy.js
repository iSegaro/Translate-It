import { ErrorTypes } from "../services/ErrorTypes.js";
import PlatformStrategy from "./PlatformStrategy.js";
import { delay } from "../utils/helpers";

export default class DiscordStrategy extends PlatformStrategy {
  constructor(notifier, errorHandler) {
    super(notifier);
    this.errorHandler = errorHandler;
  }

  /**
   * استخراج امن متن از المان‌های استاندارد دیسکورد
   * - بررسی null بودن
   * - بررسی قابلیت contentEditable
   * - بررسی value یا textContent
   * - محافظت با try/catch در برابر DOMException
   */
  extractText(target) {
    try {
      if (!target || !(target instanceof HTMLElement)) return "";

      if (target.isContentEditable) {
        return target.innerText?.trim?.() || "";
      }

      return target.value?.trim?.() || target.textContent?.trim?.() || "";
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "discord-strategy-extractText",
      });
      return "";
    }
  }

  async updateElement(element, translatedText) {
    try {
      const shortcutsModal = document.querySelector(
        ".keyboardShortcutsModal_f061f6"
      );
      if (shortcutsModal) return false;

      if (translatedText !== undefined && translatedText !== null) {
        if (element.isContentEditable) {
          element.focus();
          element.value = translatedText;
          this.applyVisualFeedback(element);
          this.clearField(element);
          await delay(200);
          this.pasteText(element, translatedText);
          this.applyTextDirection(element, translatedText);
        } else {
          element.focus();
          element.value = translatedText;
          this.applyVisualFeedback(element);
          this.clearField(element);
          await delay(200);
          this.pasteText(element, translatedText);
          this.applyTextDirection(element, translatedText);
        }
        return true;
      }
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "Discord-strategy-updateElement",
      });
      return false;
    }
  }

  clearField(Field) {
    if (!Field) return;

    try {
      Field.focus();
      const selection = window.getSelection();
      const isTextSelected = selection.toString().length > 0;

      if (!isTextSelected) {
        const range = document.createRange();
        range.selectNodeContents(Field);
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
      Field.dispatchEvent(pasteEvent);
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "Discord-strategy-clearField",
      });
    }
  }

  async pasteText(field, text) {
    if (!field || !text || typeof text !== "string") return;

    try {
      let lines = text.split("\n");
      while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
        lines.pop();
      }
      const trimmedText = lines.join("\n");

      if (navigator.clipboard && navigator.clipboard.writeText) {
        const selection = window.getSelection();
        const range = selection.getRangeAt(0).cloneRange();
        await navigator.clipboard.writeText(trimmedText);
        field.focus();
        selection.removeAllRanges();
        selection.addRange(range);

        if (document.execCommand("paste")) return;
        this.simulateInputInsertion(field, trimmedText);
        return;
      }

      const dt = new DataTransfer();
      dt.setData("text/plain", trimmedText);
      dt.setData("text/html", trimmedText.replace(/\n/g, "<br>"));

      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dt,
      });

      field.focus();
      field.dispatchEvent(pasteEvent);

      setTimeout(() => {
        this.simulateInputInsertion(field, trimmedText);
      }, 100);
    } catch (error) {
      const handlerError = this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "Discord-strategy-pasteText",
      });
      throw handlerError;
    }
  }

  simulateInputInsertion(field, text) {
    try {
      if (document.execCommand("insertText", false, text)) return;
    } catch (_) {}

    if (field.tagName === "INPUT" || field.tagName === "TEXTAREA") {
      const start = field.selectionStart || 0;
      const end = field.selectionEnd || 0;
      const beforeText = field.value.substring(0, start);
      const afterText = field.value.substring(end);
      field.value = beforeText + text + afterText;
      field.selectionStart = field.selectionEnd = start + text.length;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    if (field.isContentEditable) {
      const selection = window.getSelection();
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(range);
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
    }
  }
}
