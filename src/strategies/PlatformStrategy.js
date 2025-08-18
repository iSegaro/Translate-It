// src/strategies/PlatformStrategy.js

import { ErrorTypes } from "../error-management/ErrorTypes.js";

export default class PlatformStrategy {
  // فلگ ساده برای ردیابی افکت‌های فعال
  static activeEffects = new WeakMap();

  constructor(notifier = null, errorHandler = null) {
    this.notifier = notifier;
    this.errorHandler = errorHandler;
  }

  extractText(target) {
    try {
      if (!target) return "";
      if (target.isContentEditable) {
        return target.innerText?.trim() || "";
      }
      return target.value?.trim() || target.textContent?.trim() || "";
    } catch (error) {
      this.errorHandler?.handle(error, {
        type: ErrorTypes.UI,
        context: "platform-strategy-extractText",
      });
      return "";
    }
  }

  findField(startElement, selectors, maxDepth = 5) {
    let currentElement = startElement;
    for (let i = 0; i < maxDepth; i++) {
      if (!currentElement) break;
      const found = currentElement.closest(selectors);
      if (found) return found;
      currentElement = currentElement.parentElement;
    }
    return document.querySelector(selectors);
  }

  isInputElement(element) {
    return element && (element.tagName === "INPUT" || element.tagName === "TEXTAREA");
  }

  validateField(element) {
    return (
      element &&
      element.isConnected &&
      (this.isInputElement(element) || element.hasAttribute("contenteditable"))
    );
  }


  async applyVisualFeedback(element) {
    if (!element || !element.style) return;


    // تولید شناسه منحصر به فرد برای این افکت
    const effectId = Date.now() + Math.random();
    
    // لغو افکت قبلی اگر وجود دارد
    const previousEffect = PlatformStrategy.activeEffects.get(element);
    if (previousEffect) {
      previousEffect.cancelled = true;
      // بازگرداندن فوری استایل‌ها به حالت اولیه
      element.style.backgroundColor = previousEffect.originalBackground;
      element.style.transition = previousEffect.originalTransition;
    }

    const originalBackgroundColor = element.style.backgroundColor;
    const originalTransition = element.style.transition;
    
    // ذخیره اطلاعات افکت فعال
    const effectInfo = {
      id: effectId,
      cancelled: false,
      originalBackground: originalBackgroundColor,
      originalTransition: originalTransition
    };
    PlatformStrategy.activeEffects.set(element, effectInfo);

    try {
      // اعمال انیمیشن سبز
      element.style.transition = "background-color 0.3s ease";
      element.style.backgroundColor = "#d4f8d4";

      // انتظار برای نمایش رنگ سبز
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // بررسی لغو شدن
      if (effectInfo.cancelled) return;
      
      // بازگشت به رنگ اولیه
      element.style.backgroundColor = originalBackgroundColor;
      
      // انتظار برای تکمیل انیمیشن fadeout  
      await new Promise(resolve => setTimeout(resolve, 300));
      
    } catch (error) {
      // در صورت خطا، استایل‌ها را فوراً بازگردان
      element.style.backgroundColor = originalBackgroundColor;
      this.errorHandler?.handle(error, {
        type: ErrorTypes.UI,
        context: "platform-strategy-animation",
      });
    } finally {
      // پاکسازی نهایی فقط اگر این همان افکت فعلی است
      const currentEffect = PlatformStrategy.activeEffects.get(element);
      if (currentEffect && currentEffect.id === effectId) {
        element.style.transition = originalTransition;
        PlatformStrategy.activeEffects.delete(element);
      }
    }
  }

  applyTextDirection() {
    // غیرفعال شده - جهت متن تغییر نمی‌کند
    // در استراتژی‌های خاص در صورت نیاز فعال خواهد شد
    return;
  }

  handleFieldError(errorName, platformName) {
    const errorMap = {
      FIELD_NOT_FOUND: `لطفا روی فیلد متن ${platformName} کلیک کنید`,
      CLIPBOARD_ERROR: "خطای دسترسی به کلیپبورد",
    };

    if (this.notifier) {
      this.notifier.show(errorMap[errorName], "warning");
    }
    if (this.errorHandler) {
      this.errorHandler.handle(new Error(errorName), {
        type: ErrorTypes.UI,
        context: "platform-strategy-field-error",
      });
    } else {
      throw new Error(errorName);
    }
  }
}
