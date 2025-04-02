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
    this.translationPromise = null; // برای نگهداری promise مربوط به ترجمه
    this.isTranslationCancelled = false; // پرچم برای مشخص کردن اینکه آیا ترجمه لغو شده است
    this.translatingText = null; // نگهداری متنی که در حال ترجمه است
  }

  async show(selectedText, position) {
    if (
      !selectedText ||
      (this.isVisible && selectedText === this.currentText)
    ) {
      return;
    }

    this.isTranslationCancelled = false; // ریست کردن پرچم در هر بار نمایش
    this.translatingText = selectedText; // ثبت متن در حال ترجمه
    this.translationPromise = translateText(selectedText); // ذخیره promise ترجمه

    this.dismiss(false); // بستن پاپ‌آپ قبلی

    this.displayElement = document.createElement("div");
    this.displayElement.classList.add("aiwc-selection-display-temp");

    const loadingContainer = this.createLoadingDots();
    this.displayElement.appendChild(loadingContainer);

    this.applyInitialStyles(position);

    document.body.appendChild(this.displayElement);
    this.isVisible = true;

    this.animatePopupSize(loadingContainer);

    this.translationPromise
      .then((translated_text_untrimmed) => {
        if (
          this.isTranslationCancelled ||
          selectedText !== this.translatingText
        ) {
          // logME(
          //   "[SelectionWindows] ترجمه لغو شد یا متن تغییر کرده، نتیجه نادیده گرفته می‌شود."
          // );
          return;
        }
        const translatedText =
          translated_text_untrimmed ? translated_text_untrimmed.trim() : "";
        // logME(selectedText, translatedText);
        if (translatedText) {
          this.transitionToTranslatedText(translatedText, loadingContainer);
        } else {
          this.handleEmptyTranslation(loadingContainer);
        }
      })
      .catch((error) => {
        if (
          !this.isTranslationCancelled &&
          selectedText === this.translatingText
        ) {
          this.handleTranslationError(error, loadingContainer);
        } else {
          /**
           * خطا در ترجمه نادیده گرفته شد زیرا ترجمه لغو شده است یا متن تغییر کرده است
           */
          // logME(
          //   "[SelectionWindows] خطا در ترجمه نادیده گرفته شد زیرا ترجمه لغو شده است یا متن تغییر کرده است."
          // );
        }
      });

    const removeHandler = (event) => {
      if (!this.isVisible || !this.displayElement) return;
      const target = event.target;
      if (this.displayElement.contains(target)) {
        event.stopPropagation();
        return;
      }
      this.cancelTranslation(); // لغو ترجمه هنگام کلیک خارج از پاپ‌آپ
      this.dismiss();
    };

    if (this.removeMouseDownListener) {
      document.removeEventListener("mousedown", this.removeMouseDownListener);
    }
    document.addEventListener("mousedown", removeHandler);
    this.removeMouseDownListener = removeHandler;
  }

  cancelTranslation() {
    this.isTranslationCancelled = true;
    this.translationPromise = null; // پاک کردن promise
    this.translatingText = null; // پاک کردن متن در حال ترجمه
    if (this.displayElement) {
      this.displayElement.innerHTML = ""; // پاک کردن محتوای پاپ‌آپ
      const loadingContainer = this.createLoadingDots();
      this.displayElement.appendChild(loadingContainer); // نمایش مجدد لودینگ (اختیاری)
      this.displayElement.style.opacity = "0.6"; // بازگرداندن شفافیت اولیه
    }
    // logME("[SelectionWindows] روند ترجمه لغو شد.");
    // نیازی به تغییر وضعیت پاپ‌آپ در اینجا نیست، زیرا dismiss() فراخوانی می‌شود.
  }

  applyInitialStyles(position) {
    this.displayElement.style.position = "absolute";
    this.displayElement.style.zIndex = "1000";
    this.displayElement.style.maxWidth = "300px";
    this.displayElement.style.overflowWrap = "break-word";
    this.displayElement.style.fontFamily = "sans-serif";
    this.displayElement.style.opacity = "0.6";
    this.displayElement.style.transform = "scale(0.1)";
    this.displayElement.style.transformOrigin = "top left";
    this.displayElement.style.transition = `transform 0.2s ease-out, opacity ${this.fadeInDuration}ms ease-in-out`;
    this.displayElement.style.left = `${position.x}px`;
    this.displayElement.style.top = `${position.y}px`;
    this.applyTextDirection(this.displayElement, ""); // Initial text direction might not be relevant yet
    this.displayElement.dataset.aiwcSelectionPopup = "true";
  }

  createLoadingDots() {
    const loadingContainer = document.createElement("div");
    loadingContainer.classList.add("aiwc-loading-container");
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("span");
      dot.classList.add("aiwc-loading-dot");
      dot.innerText = ".";
      loadingContainer.appendChild(dot);
    }
    return loadingContainer;
  }

  animatePopupSize(loadingContainer) {
    requestAnimationFrame(() => {
      this.displayElement.style.transform = "scale(1)";
      setTimeout(() => {
        loadingContainer.style.opacity = "1";
        // logME("[SelectionWindows] Loading dots should be visible now.");
      }, 300);
    });
  }

  transitionToTranslatedText(translatedText, loadingContainer) {
    loadingContainer.style.opacity = "0";
    setTimeout(() => {
      if (this.displayElement) {
        this.displayElement.innerHTML = "";
        this.displayElement.innerText = translatedText;
        this.applyTextDirection(this.displayElement, translatedText);
        this.displayElement.style.opacity = "0.9";
      }
    }, 300);
  }

  handleEmptyTranslation(loadingContainer) {
    loadingContainer.style.opacity = "0";
    setTimeout(() => {
      if (this.displayElement) {
        this.displayElement.innerHTML =
          "(متن ترجمه خالی است، دوباره امتحان کنید).";
        this.displayElement.style.opacity = "0.9";
      }
    }, 300);
  }

  handleTranslationError(error, loadingContainer) {
    logME("Error during translation:", error);
    loadingContainer.style.opacity = "0";
    setTimeout(() => {
      if (this.displayElement) {
        this.displayElement.innerHTML = "(خطا در ترجمه، دوباره امتحان کنید)";
        this.displayElement.style.opacity = "0.9";
      }
    }, 300);
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
    }

    if (this.displayElement && this.displayElement.parentNode) {
      this.displayElement.remove();
    }

    // Reset state
    this.displayElement = null;
    this.isVisible = false;
    this.currentText = null;
    this.translationPromise = null;
    this.isTranslationCancelled = false;
    this.translatingText = null; // اطمینان از پاک شدن متن در حال ترجمه
  }

  applyTextDirection(element, text) {
    if (!element || !element.style) return;

    const isRtl = CONFIG.RTL_REGEX.test(text);
    element.style.direction = isRtl ? "rtl" : "ltr";
    element.style.textAlign = isRtl ? "right" : "left";
  }
}
