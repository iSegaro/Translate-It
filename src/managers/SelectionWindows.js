// src/managers/SelectionWindows.js
import { logME } from "../utils/helpers";
import { CONFIG } from "../config.js";
import { translateText } from "../utils/api.js";

export default class SelectionWindows {
  constructor(options = {}) {
    this.fadeInDuration = options.fadeInDuration || 50; // مدت زمان پیش فرض برای fade-in
    this.fadeOutDuration = options.fadeOutDuration || 125; // مدت زمان پیش فرض برای fade-out
    this.isVisible = false;
    this.currentText = null;
    this.displayElement = null;
    this.removeMouseDownListener = null; // برای نگهداری رفرنس تابع حذف لیستنر
    this.translationHandler = options.translationHandler;
  }

  async show(selectedText, position) {
    if (
      !selectedText ||
      (this.isVisible && selectedText === this.currentText)
    ) {
      return;
    }

    const translationPromise = translateText(selectedText);

    // حذف کادر قبلی اگر وجود داشته باشد
    this.dismiss(false);

    // 1. ایجاد عنصر div برای نمایش حالت بارگذاری
    this.displayElement = document.createElement("div");
    this.displayElement.classList.add("aiwc-selection-display-temp");

    const loadingContainer = document.createElement("div");
    loadingContainer.classList.add("aiwc-loading-container");
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("span");
      dot.classList.add("aiwc-loading-dot");
      dot.innerText = "."; // اضافه کردن نقطه به عنوان محتوا
      loadingContainer.appendChild(dot);
    }
    this.displayElement.appendChild(loadingContainer);

    // 2. اضافه کردن استایل‌های اولیه (شفافیت و موقعیت در CSS تنظیم شده)
    this.displayElement.style.position = "absolute";
    this.displayElement.style.zIndex = "1000";
    this.displayElement.style.maxWidth = "400px";
    this.displayElement.style.overflowWrap = "break-word";
    this.displayElement.style.fontFamily = "sans-serif";
    this.displayElement.style.left = `${position.x}px`;
    this.displayElement.style.top = `${position.y}px`;
    this.applyTextDirection(this.displayElement, selectedText);
    this.displayElement.dataset.aiwcSelectionPopup = "true";

    // 3. اضافه کردن کادر به DOM
    document.body.appendChild(this.displayElement);
    this.isVisible = true;

    // 4. شروع انیمیشن بزرگ شدن و سپس نمایش نقاط
    requestAnimationFrame(() => {
      this.displayElement.style.transform = "scale(1)";
      setTimeout(() => {
        loadingContainer.style.opacity = "1";
        logME("[SelectionWindows] Loading dots should be visible now."); // اضافه کردن لاگ برای بررسی
      }, 300); // افزایش تاخیر به 300ms
    });

    // 5. رسیدگی به نتیجه Promise ترجمه
    translationPromise
      .then((translated_text_untrimmed) => {
        const translated_text =
          translated_text_untrimmed ? translated_text_untrimmed.trim() : "";
        logME(selectedText, translated_text);
        if (translated_text) {
          this.currentText = translated_text;
          if (this.displayElement) {
            // Fade out کردن نقاط
            loadingContainer.style.opacity = "0";
            setTimeout(() => {
              // جایگزینی با متن ترجمه شده با Fade In
              this.displayElement.innerHTML = ""; // پاک کردن نقاط
              this.displayElement.innerText = this.currentText;
              this.applyTextDirection(this.displayElement, this.currentText);
              this.displayElement.style.opacity = "0.9"; // رساندن شفافیت به 90 درصد
            }, 300); // بعد از محو شدن نقاط
          }
        } else {
          logME("Translated text is empty after trimming.");
          if (this.displayElement) {
            loadingContainer.style.opacity = "0";
            setTimeout(() => {
              this.displayElement.innerHTML = "متن ترجمه خالی است.";
              this.displayElement.style.opacity = "0.9";
            }, 300);
          }
        }
      })
      .catch((error) => {
        logME("Error during translation:", error);
        if (this.displayElement) {
          loadingContainer.style.opacity = "0";
          setTimeout(() => {
            this.displayElement.innerHTML = "خطا در ترجمه";
            this.displayElement.style.opacity = "0.9";
          }, 300);
        }
      });

    // 6. حذف کادر با کلیک در جای دیگر (همان منطق قبلی)
    const removeHandler = (event) => {
      if (!this.isVisible || !this.displayElement) return;

      const target = event.target;
      const isClickOnDisplayElement = this.displayElement.contains(target);

      if (isClickOnDisplayElement) {
        event.stopPropagation();
        return;
      }

      this.dismiss();
    };

    if (this.removeMouseDownListener) {
      document.removeEventListener("mousedown", this.removeMouseDownListener);
    }
    document.addEventListener("mousedown", removeHandler);
    this.removeMouseDownListener = removeHandler;
  }

  dismiss(withFadeOut = true) {
    if (!this.displayElement || !this.isVisible) {
      // اضافه کردن چک isVisible
      return;
    }

    // *** اطمینان از حذف listener قبل از شروع انیمیشن یا حذف ***
    if (this.removeMouseDownListener) {
      document.removeEventListener("mousedown", this.removeMouseDownListener);
      this.removeMouseDownListener = null;
      // logME("SelectionWindows: Removed mousedown listener during dismiss.");
    }

    this.isVisible = false; // وضعیت را بلافاصله آپدیت کن

    if (withFadeOut && this.fadeOutDuration > 0) {
      // *** استفاده از transition به جای setTimeout مستقیم برای fade-out ***
      this.displayElement.style.transition = `opacity ${this.fadeOutDuration}ms ease-in-out`;
      this.displayElement.style.opacity = "0";

      // استفاده از event listener 'transitionend' برای حذف المان بعد از پایان انیمیشن
      this.displayElement.addEventListener(
        "transitionend",
        this.removeElement.bind(this),
        { once: true }
      );
    } else {
      this.removeElement();
    }
  }

  removeElement() {
    // *** اطمینان بیشتر از حذف listener حتی اگر dismiss به روش دیگری فراخوانی شده باشد ***
    if (this.removeMouseDownListener) {
      document.removeEventListener("mousedown", this.removeMouseDownListener);
      this.removeMouseDownListener = null;
      // logME(
      //   "SelectionWindows: Removed mousedown listener during removeElement."
      // );
    }

    if (this.displayElement && this.displayElement.parentNode) {
      this.displayElement.remove();
    }
    // Reset state
    this.displayElement = null;
    // this.isVisible = false; // در dismiss انجام شد
    this.currentText = null;
  }

  applyTextDirection(element, text) {
    if (!element || !element.style) return;

    const isRtl = CONFIG.RTL_REGEX.test(text);
    element.style.direction = isRtl ? "rtl" : "ltr";
    element.style.textAlign = isRtl ? "right" : "left";
  }
}
