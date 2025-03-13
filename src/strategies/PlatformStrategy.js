// src/strategies/PlatformStrategy.js
export default class PlatformStrategy {
  constructor(notifier = null) {
    this.notifier = notifier;
  }

  extractText(target) {
    throw new Error("متد extractText باید در کلاس فرزند پیاده‌سازی شود");
  }

  // متد یکپارچه برای یافتن المان‌ها
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

  // اعتبارسنجی المان
  validateField(element) {
    return (
      element &&
      element.isConnected &&
      (this.isInputElement(element) || element.hasAttribute("contenteditable"))
    );
  }

  // مدیریت خطای استاندارد
  handleFieldError(errorName, platformName) {
    const errorMap = {
      FIELD_NOT_FOUND: `لطفا روی فیلد متن ${platformName} کلیک کنید`,
      CLIPBOARD_ERROR: "خطای دسترسی به کلیپبورد",
    };

    if (this.notifier) {
      this.notifier.show(errorMap[errorName], "warning");
    }
    throw new Error(errorName);
  }
}
