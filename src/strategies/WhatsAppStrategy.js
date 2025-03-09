// src/strategies/WhatsAppStrategy.js

import PlatformStrategy from "./PlatformStrategy";
import { delay } from "../utils/helpers";

export default class WhatsAppStrategy extends PlatformStrategy {
  isWhatsAppElement(target) {
    return !!target.closest('[aria-label="Type a message"]');
  }

  async updateElement(element, translatedText) {
    const isWhatsApp = this.isWhatsAppElement(element);
    if (!isWhatsApp) return;

    // روش خاص واتساپ برای به روزرسانی متن
    element.focus();
    document.execCommand("selectAll");
    document.execCommand("insertText", false, translatedText);

    // راه‌اندازی رویدادهای واتساپ
    const inputEvent = new Event("input", { bubbles: true });
    element.dispatchEvent(inputEvent);

    // به روزرسانی UI
    requestAnimationFrame(() => {
      element.style.backgroundColor = "#d4f8d4";
      setTimeout(() => {
        element.style.backgroundColor = "";
      }, 1000);
    });
  }

  async safeFocus(element) {
    element.focus({ preventScroll: true });
    await delay(100);
    return element;
  }

  async selectAllContent(element) {
    document.execCommand("selectAll");
    await delay(100);
    return element;
  }

  async simulatePaste(element, text) {
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    dt.setData("text/html", text.replace(/\n/g, "<br>"));

    const pasteEvent = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: dt,
    });

    element.dispatchEvent(pasteEvent);
    await delay(50);
  }

  triggerStateUpdate(element) {
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
      })
    );
  }

  handleWhatsAppError(error) {
    this.notifier.show(`خطای واتس‌اپ: ${error.message}`, "error", true, 5000);
  }
}
