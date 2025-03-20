// src/strategies/MediumStrategy.js
import { ErrorTypes } from "../services/ErrorService.js";
import { CONFIG } from "../config";
import PlatformStrategy from "./PlatformStrategy.js";
import { delay } from "../utils/helpers.js";

export default class MediumStrategy extends PlatformStrategy {
  constructor(notifier, errorHandler) {
    super(notifier);
    this.errorHandler = errorHandler;
  }

  shouldShowDefaultIcon() {
    return true;
  }

  // بررسی اینکه عنصر مربوط به مدیوم هست یا خیر
  isMediumElement(target) {
    return !!(
      target.closest('[role="textbox"]') ||
      target.closest('[data-testid="editor-container"]') // اضافه کردن شناسه جدید
    );
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
    const mediumField = this.findMediumTextField(element);
    if (!mediumField) {
      console.error("Medium text field not found for element:", element);
      throw new Error("فیلد متن مدیوم یافت نشد"); // انتقال خطا به TranslationHandler
    }

    this.safeFocus(mediumField); // فوکوس روی فیلد

    // کپی متن ترجمه شده به کلیپبورد
    try {
      console.log(
        "MediumStrategy: clipboard write attempt for:",
        translatedText.substring(0, 20) + "..."
      ); // Log clipboard write attempt
      await navigator.clipboard.writeText(translatedText);
      console.log(
        "MediumStrategy: clipboard write SUCCESS for:",
        translatedText.substring(0, 20) + "..."
      ); // Log clipboard write success
      this.notifier.show(
        "✅ ترجمه در حافظه کپی شد. (Ctrl+V)",
        "success",
        true,
        3000
      );
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "medium-strategy-updateElement",
      });
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

  extractText(target) {
    // برای فیلدهای جستجو
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
      return target.value.trim();
    }

    // برای فیلدهای contenteditable
    const mediumField = this.findMediumTextField(target);
    return mediumField?.innerText.trim() || "";
  }

  async safeFocus(element) {
    try {
      if (!element.isConnected) {
        console.warn("Element not in DOM:", element);
        return null;
      }

      element.focus({ preventScroll: true });
      await delay(150); // افزایش تاخیر برای اطمینان

      // بررسی وضعیت فوکوس
      if (document.activeElement !== element) {
        console.warn("Focus failed, retrying...");
        element.focus({ preventScroll: true });
        await delay(100);
      }

      return element;
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "medium-strategy-safeFocus",
      });
    }
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

  /**
   * پیدا کردن فیلد متن مدیوم با الگوریتم پیشرفته
   */
  findMediumTextField(startElement) {
    // جستجو در سلسله مراتب والدین
    let currentElement = startElement;
    for (let i = 0; i < 5; i++) {
      // حداکثر 5 سطح بالاتر
      if (!currentElement) break;

      const candidate = currentElement.closest(
        '[role="textbox"][contenteditable="true"], [data-testid="editor-container"]'
      );
      if (candidate) return candidate;

      currentElement = currentElement.parentElement;
    }

    // جستجوی جایگزین در صورت عدم یافتن
    return document.querySelector(
      '[role="textbox"][contenteditable="true"], [data-testid="editor-container"]'
    );
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
