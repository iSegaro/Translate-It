// src/strategies/WhatsAppStrategy.js
import PlatformStrategy from "./PlatformStrategy";
import { delay } from "../utils/helpers";

export default class WhatsAppStrategy extends PlatformStrategy {
  constructor(notifier) {
    // اضافه کردن notifier به constructor و ارسال به کلاس والد
    super(notifier);
    this.notifier = notifier;
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

      // انتخاب تمام محتوا با استفاده از Selection API
      await this.selectAllContent(whatsappField);

      // پیست محتوا با شبیه‌سازی کامل
      await this.simulatePaste(whatsappField, translatedText);

      // به روزرسانی state واتس‌اپ
      this.triggerStateUpdate(whatsappField);
    } catch (error) {
      // مدیریت خطا به TranslationHandler منتقل شد
      console.error("WhatsAppStrategy: updateElement ERROR:", error); // Log error
      throw error; // پرتاب خطا برای مدیریت در TranslationHandler
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
    } catch (error) {
      console.error("WhatsAppStrategy: selectAllContent ERROR:", error);
    }
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
}
