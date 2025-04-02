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
          element.focus();
          element.value = translatedText;
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

        context: "Discord-strategy-clearField",
      });
    }
  }

  async pasteText(field, text) {
    if (!field || !text || typeof text !== "string") {
      return;
    }

    try {
      // Prepare text (trim trailing empty lines)
      let lines = text.split("\n");
      while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
        lines.pop();
      }
      const trimmedText = lines.join("\n");

      // Strategy 1: Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        // Save current selection/cursor position
        const selection = window.getSelection();
        const range = selection.getRangeAt(0).cloneRange();

        // Write to clipboard
        await navigator.clipboard.writeText(trimmedText);

        // Focus the field and restore selection
        field.focus();
        selection.removeAllRanges();
        selection.addRange(range);

        // Try execCommand paste first (works in some browsers with Discord)
        if (document.execCommand("paste")) {
          return;
        }

        // If execCommand fails, try simulated input
        this.simulateInputInsertion(field, trimmedText);
        return;
      }

      // Strategy 2: Fallback to synthetic paste event
      const dt = new DataTransfer();
      dt.setData("text/plain", trimmedText);
      dt.setData("text/html", trimmedText.replace(/\n/g, "<br>"));

      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dt,
      });

      // Focus the field before dispatching the event
      field.focus();
      field.dispatchEvent(pasteEvent);

      // Check if paste worked by monitoring field content change
      // If no change after a short delay, fall back to direct input
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

  // Helper method to simulate direct input when paste events fail
  simulateInputInsertion(field, text) {
    // Method 1: Try to use insertText input command
    try {
      // Try to use document.execCommand('insertText')
      if (document.execCommand("insertText", false, text)) {
        return; // Success
      }
    } catch (e) {
      // Continue to fallback methods
    }

    // Method 2: Direct property manipulation (works for simple inputs and textareas)
    if (field.tagName === "INPUT" || field.tagName === "TEXTAREA") {
      const start = field.selectionStart || 0;
      const end = field.selectionEnd || 0;
      const beforeText = field.value.substring(0, start);
      const afterText = field.value.substring(end);

      // Set the value and restore cursor position
      field.value = beforeText + text + afterText;
      field.selectionStart = field.selectionEnd = start + text.length;

      // Trigger input event to notify Discord that the content has changed
      field.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    // Method 3: For rich text editors (like Discord)
    if (
      typeof field.isContentEditable !== "undefined" &&
      field.isContentEditable
    ) {
      const selection = window.getSelection();
      const range = selection.getRangeAt(0);

      // Delete any selected content
      range.deleteContents();

      // Insert the text
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);

      // Move cursor to the end of inserted text
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(range);

      // Trigger input event
      field.dispatchEvent(new Event("input", { bubbles: true }));

      // Also trigger keyup event as some rich editors like Discord use this
      field.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
    }
  }
}
