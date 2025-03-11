// src/strategies/MediumStrategy.js
import PlatformStrategy from "./PlatformStrategy";
import { delay } from "../utils/helpers";

export default class MediumStrategy extends PlatformStrategy {
  constructor(notifier) {
    // Accept NotificationManager instance
    super();
    this.notifier = notifier; // Store notifier instance
  }

  // بررسی اینکه عنصر مربوط به مدیوم هست یا خیر
  isMediumElement(target) {
    return !!target.closest('[role="textbox"]');
  }

  /**
   * به‌روزرسانی فیلد متنی مدیوم: کپی متن ترجمه شده به کلیپبورد (بدون جایگزینی مستقیم)
   * - برای input/textarea (مثلاً فیلد جستجو): مقدار value به‌روز می‌شود.
   * - برای فیلدهای contenteditable (مانند کامنت‌ها و نظرسنجی‌ها): متن ترجمه شده به کلیپبورد کپی می‌شود.
   */
  async updateElement(element, translatedText) {
    // 1. برای input/textarea (مثلاً فیلد جستجو) - بدون تغییر
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      element.value = translatedText;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    // 2. برای فیلدهای contenteditable (کامنت‌ها و نظرسنجی‌ها) - کپی به کلیپبورد
    const mediumField = element.closest(
      '[role="textbox"][contenteditable="true"]'
    );
    if (!mediumField) {
      console.error("Medium text field not found.");
      return;
    }

    this.safeFocus(mediumField); // فوکوس روی فیلد

    // کپی متن ترجمه شده به کلیپبورد
    try {
      console.log(
        "MediumStrategy: clipboard write attempt for text:",
        translatedText.substring(0, 20) + "..."
      ); // Log clipboard write attempt
      await navigator.clipboard.writeText(translatedText);
      console.log(
        "MediumStrategy: clipboard write SUCCESS for text:",
        translatedText.substring(0, 20) + "..."
      ); // Log clipboard write success
      this.notifier.show(
        // Now this.notifier is correctly defined
        "✅ ترجمه در حافظه کپی شد. Paste کنید (Ctrl+V).",
        "success",
        true,
        3000
      );
    } catch (err) {
      // مدیریت خطا به TranslationHandler منتقل شد
      console.error("MediumStrategy: Clipboard write ERROR:", err); // Log clipboard write error
      throw new Error(
        `Clipboard write error in MediumStrategy: ${err.message}`
      ); // Throw error for TranslationHandler to handle
    }

    // اعمال افکت تغییر رنگ پس‌زمینه برای اطلاع‌رسانی به کاربر (بدون تغییر)
    mediumField.style.transition = "background-color 0.5s ease";
    mediumField.style.backgroundColor = "#d4f8d4";
    requestAnimationFrame(() => {
      setTimeout(() => {
        mediumField.style.backgroundColor = "transparent";
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
}
