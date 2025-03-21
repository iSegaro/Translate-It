// src/strategies/WhatsAppStrategy.js
import { ErrorTypes } from "../services/ErrorService.js";
import { CONFIG } from "../config";
import PlatformStrategy from "./PlatformStrategy.js";
import { delay } from "../utils/helpers";

export default class WhatsAppStrategy extends PlatformStrategy {
  constructor(notifier, errorHandler) {
    super(notifier);
    this.errorHandler = errorHandler;
  }

  /**
   * شناسایی المان ویرایشگر واتس‌اپ
   * @param {HTMLElement} target - المان هدف
   * @returns {boolean}
   */
  isWhatsAppElement(target) {
    return !!target.closest('[aria-label="Type a message"]');
  }

  async updateElement(element, translatedText) {
    try {
      const SELECTORS = '[role="textbox"], .copyable-text.selectable-text';

      let whatsappField = this.findField(element, SELECTORS);

      if (!whatsappField) {
        throw new Error("فیلد واتساپ یافت نشد");
      }

      // استفاده مستقیم از بررسی نوع تگ و contenteditable به جای validateField
      const isValidField =
        (whatsappField.tagName === "INPUT" ||
          whatsappField.tagName === "TEXTAREA" ||
          whatsappField.hasAttribute("contenteditable")) &&
        whatsappField.isConnected;

      if (!isValidField) {
        throw new Error("فیلد واتساپ نامعتبر است");
      }

      const isWhatsApp = this.isWhatsAppElement(element);
      if (!isWhatsApp) return;

      // اعتبارسنجی وجود المان در DOM
      if (!document.body.contains(element)) {
        throw new Error("Element removed from DOM");
      }

      // اعمال فوکوس با تنظیمات ایمن
      await this.safeFocus(element);

      this.applyVisualFeedback(whatsappField);

      // انتخاب تمام محتوا با استفاده از Selection API
      await this.selectAllContent(whatsappField);

      // پیست محتوا با شبیه‌سازی کامل
      await this.simulatePaste(whatsappField, translatedText);

      // به روزرسانی state واتس‌اپ
      this.triggerStateUpdate(whatsappField);
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "whatsapp-strategy-updateElement",
      });
    }
  }

  extractText(target) {
    const whatsappField = target.closest(
      '[role="textbox"], .copyable-text.selectable-text'
    );
    return whatsappField?.innerText.trim() || "";
  }

  async safeFocus(element) {
    element.focus({ preventScroll: true });
    await delay(100);
    return element;
  }

  async selectAllContent(element) {
    try {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
      await delay(100);
      return element;
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "whatsapp-strategy-selectAllContent",
      });
    }
  }

  async simulatePaste(element, text) {
    if (!element) return;
    try {
      if (text !== undefined && text !== null) {
        let htmlText = "";
        htmlText = text.replace(/\n/g, "<br>");
        const dt = new DataTransfer();
        dt.setData("text/plain", text);
        dt.setData("text/html", htmlText);

        const pasteEvent = new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: dt,
        });

        element.dispatchEvent(pasteEvent);
        await delay(50);
      }
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "whatsapp-strategy-simulatePaste",
      });
    }
  }

  triggerStateUpdate(element) {
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
      })
    );
  }
}
