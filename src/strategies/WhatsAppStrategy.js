// src/strategies/WhatsAppStrategy.js
import PlatformStrategy from "./PlatformStrategy";
import { delay } from "../utils/helpers";

export default class WhatsAppStrategy extends PlatformStrategy {
  constructor(notifier) {
    // اضافه کردن notifier به constructor
    super();
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
      const isWhatsApp = this.isWhatsAppElement(element);
      if (!isWhatsApp) return;

      // اعتبارسنجی وجود المان در DOM
      if (!document.body.contains(element)) {
        throw new Error("Element removed from DOM");
      }

      // اعمال فوکوس با تنظیمات ایمن
      await this.safeFocus(element);

      // انتخاب تمام محتوا
      await this.selectAllContent(element);

      // پیست محتوا با شبیه‌سازی کامل
      await this.simulatePaste(element, translatedText);

      // به روزرسانی state واتس‌اپ
      this.triggerStateUpdate(element);
    } catch (error) {
      // مدیریت خطا به TranslationHandler منتقل شد
      console.error("WhatsAppStrategy: updateElement ERROR:", error); // Log error
      throw error; // پرتاب خطا برای مدیریت در TranslationHandler
    }
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
}
