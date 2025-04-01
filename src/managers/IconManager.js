// src/managers/IconManager.js
import { CONFIG, state } from "../config.js";
import { logME } from "../utils/helpers.js";
import { ErrorTypes } from "../services/ErrorService.js";

export default class IconManager {
  constructor(errorHandler) {
    this.errorHandler = errorHandler;
  }
  cleanup() {
    if (state.highlightedElement) {
      state.highlightedElement.style.outline = "";
      state.highlightedElement.style.opacity = "";
      state.highlightedElement = null;
    }

    // حذف تمام آیکون‌ها
    document
      .querySelectorAll(".AIWritingCompanion-translation-icon-extension")
      .forEach((icon) => {
        icon.classList.add("fade-out"); // اضافه کردن کلاس fade-out

        // حذف آیکون بعد از اتمام انیمیشن fade-out
        setTimeout(() => {
          icon.remove();
        }, 50); // 50 میلی ثانیه (مطابق با مدت زمان transition در CSS)
      });

    state.activeTranslateIcon = null;
  }

  applyTextDirection(element, text) {
    if (!element || !element.style) return;

    const isRtl = CONFIG.RTL_REGEX.test(text);
    element.style.direction = isRtl ? "rtl" : "ltr";
    element.style.textAlign = isRtl ? "right" : "left";
  }

  /**
   *
   * @param {Text-field where the icon is created} target
   *
   * این متد باید فراخوانی شود تا آیکون مترجم در فیلد مربوطه ساخته شود
   * @returns
   */
  createTranslateIcon(target) {
    try {
      if (!target?.isConnected) {
        // throw new Error("المان هدف برای ایجاد آیکون معتبر نیست");
        logME("المان هدف برای ایجاد آیکون معتبر نیست");
        return;
      }

      const icon = document.createElement("button");
      if (!icon) {
        logME("[IconManager] آیکون معتبر نیست!");
        return;
      }
      icon.className = "AIWritingCompanion-translation-icon-extension";

      // تنظیمات ضروری CSS
      Object.assign(icon.style, {
        position: "absolute",
        display: "none", // ابتدا مخفی باشد
        background: "white",
        border: "1px solid gray",
        borderRadius: "4px",
        padding: "2px 5px",
        fontSize: "12px",
        cursor: "pointer",
        zIndex: "9999999999",
        pointerEvents: "auto",
      });

      icon.textContent = CONFIG.ICON_TRANSLATION;
      icon.title = CONFIG.TRANSLATION_ICON_TITLE;

      // اضافه کردن به DOM قبل از موقعیت دهی
      document.body.appendChild(icon);

      // اضافه کردن کلاس initial برای fade-in
      icon.classList.add(
        "AIWritingCompanion-translation-icon-extension-fade-in-initial"
      );

      // محاسبه موقعیت با در نظر گرفتن وضعیت رندر
      requestAnimationFrame(() => {
        if (target.isConnected && document.contains(icon)) {
          const rect = target.getBoundingClientRect();
          icon.style.top = `${rect.top + window.scrollY + 10}px`;
          icon.style.left = `${rect.left + window.scrollX + rect.width + 10}px`;
          icon.style.display = "block";

          // فعال کردن افکت fade-in در فریم بعدی
          requestAnimationFrame(() => {
            icon.classList.remove(
              "AIWritingCompanion-translation-icon-extension-fade-in-initial"
            );
            icon.classList.add(
              "AIWritingCompanion-translation-icon-extension-fade-in"
            );
          });
        }
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
