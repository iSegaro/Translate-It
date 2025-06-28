// src/managers/IconManager.js

import { CONFIG, state } from "../config.js";
import { ErrorTypes } from "../services/ErrorTypes.js";
import injectIconStyle from "../utils/helpers.js";

export default class IconManager {
  constructor(errorHandler) {
    this.errorHandler = errorHandler;
  }

  cleanup() {
    if (state.highlightedElement) {
      state.highlightedElement.style.outline = "";
      state.highlightedElement = null;
    }
    // Remove all icons
    document
      .querySelectorAll(".AIWritingCompanion-translation-icon-extension")
      .forEach((icon) => {
        icon.classList.add("fade-out");
        // حذف آیکون بعد از اتمام انیمیشن fade-out
        setTimeout(() => icon.remove(), 50); // 50 میلی ثانیه (مطابق با مدت زمان transition در CSS)
      });
    state.activeTranslateIcon = null;
  }

  applyTextDirection(element, text) {
    if (!element?.style) return;
    const isRtl = CONFIG.RTL_REGEX.test(text);
    element.style.direction = isRtl ? "rtl" : "ltr";
    element.style.textAlign = isRtl ? "right" : "left";
  }

    createTranslateIcon(target) {
    try {
      if (!target?.isConnected) {
        return null;
      }
      injectIconStyle("styles/icon.css");

      const icon = document.createElement("button");
      icon.className = "AIWritingCompanion-translation-icon-extension";
      icon.textContent = CONFIG.ICON_TRANSLATION;
      icon.title = CONFIG.TRANSLATION_ICON_TITLE;
      icon.style.display = "none";
      
      // یک z-index بالا تضمین می‌کند که آیکون روی دیگر عناصر صفحه، از جمله خود فیلد متنی، قرار می‌گیرد.
      icon.style.zIndex = "2147483640"; 

      document.body.appendChild(icon);

      requestAnimationFrame(() => {
        if (!target.isConnected) return;
        const rect = target.getBoundingClientRect();
        
        // [نکته]: این بخش از کد دیگر موقعیت را تنظیم نمی‌کند،
        // زیرا این مسئولیت به تابع updatePosition در IconBehavior.js منتقل شده است.
        // با این حال، نگه داشتن آن ضرری ندارد، چون بلافاصله توسط updatePosition بازنویسی می‌شود.
        // برای تمیز بودن کد، می‌توانید این بلاک requestAnimationFrame را حذف کنید، اما ضروری نیست.
        icon.style.top = `${rect.top + window.scrollY + 10}px`;
        icon.style.left = `${rect.left + window.scrollX + rect.width + 10}px`;
        icon.style.display = "block";
        icon.classList.add(
          "AIWritingCompanion-translation-icon-extension-fade-in"
        );
      });

      return icon;
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "IconManager-createTranslateIcon",
      });
      return null; // این مقدار بازگشتی null خیلی مهم است
    }
  }
}
