// src/strategies/MediumStrategy.js
import { ErrorTypes } from "../services/ErrorTypes.js";
import PlatformStrategy from "./PlatformStrategy.js";
import { delay, logME } from "../utils/helpers.js";

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
    // 1. برای input/textarea (مثلاً فیلد جستجو)
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      element.value = translatedText;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      this.applyVisualFeedback(element);
      return true;
    }

    return false;
    // 2. برای فیلدهای contenteditable (کامنت‌ها و نظرسنجی‌ها) - کپی به کلیپبورد
    const mediumField = this.findMediumTextField(element);
    if (!mediumField) {
      console.error("Medium text field not found for element:", element);
      logME("فیلد متن مدیوم یافت نشد"); // انتقال خطا به TranslationHandler
      return;
    }

    this.safeFocus(mediumField); // فوکوس روی فیلد

    // کپی متن ترجمه شده به کلیپبورد
    try {
      await navigator.clipboard.writeText(translatedText);
      logME(
        "MediumStrategy: clipboard write SUCCESS for:",
        translatedText.substring(0, 20) + "..."
      ); // Log clipboard write success
      this.notifier.show(
        "✅ ترجمه در حافظه کپی شد. (Ctrl+V)",
        "success",
        true,
        3000
      );
      // اعمال انیمیشن
      this.applyVisualFeedback(mediumField);
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "medium-strategy-updateElement",
      });
    }
  }

  extractText(target) {
    try {
      if (!target) return "";

      // اگر input یا textarea باشد
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        return target?.value?.trim?.() || "";
      }

      // تلاش برای یافتن فیلد معتبر مدیوم
      const mediumField = this.findMediumTextField(target);
      return mediumField?.innerText?.trim?.() || "";
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "medium-strategy-extractText",
      });
      return "";
    }
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
