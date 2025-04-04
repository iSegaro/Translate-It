// src/managers/SelectionWindows.js
import { logME, isExtensionContextValid } from "../utils/helpers";
import { CONFIG, TranslationMode, TRANSLATION_ERRORS } from "../config.js";
import { translateText } from "../utils/api.js";
import { marked } from "marked";
import { ErrorHandler, ErrorTypes } from "../services/ErrorService.js";

export default class SelectionWindows {
  constructor(options = {}) {
    this.fadeInDuration = options.fadeInDuration || 50; // مدت زمان پیش فرض برای fade-in
    this.fadeOutDuration = options.fadeOutDuration || 125; // مدت زمان پیش فرض برای fade-out
    this.isVisible = false;
    this.currentText = null;
    this.displayElement = null;
    this.errorHandler = new ErrorHandler();
    this.removeMouseDownListener = null; // برای نگهداری رفرنس تابع حذف لیستنر
    this.translationHandler = options.translationHandler;
    this.translationPromise = null; // برای نگهداری promise مربوط به ترجمه
    this.isTranslationCancelled = false; // پرچم برای مشخص کردن اینکه آیا ترجمه لغو شده است
    this.translatingText = null; // نگهداری متنی که در حال ترجمه است
  }

  async show(selectedText, position) {
    if (!isExtensionContextValid()) {
      await this.errorHandler.handle(
        new Error(TRANSLATION_ERRORS.INVALID_CONTEXT),
        {
          type: ErrorTypes.CONTEXT,
          context: "SelectionWindows-show-context",
          code: "context-invalid",
          statusCode: "context-invalid",
        }
      );
      return;
    }

    if (
      !selectedText ||
      (this.isVisible && selectedText === this.currentText)
    ) {
      return;
    }

    this.isTranslationCancelled = false; // ریست کردن پرچم در هر بار نمایش
    this.translatingText = selectedText; // ثبت متن در حال ترجمه

    this.translatingText = selectedText; // ثبت متن در حال ترجمه

    let translationMode = TranslationMode.Field; // پیش فرض حالت ترجمه کامل

    const maxDictionaryWords = 3; // حداکثر تعداد کلمات برای حالت دیکشنری
    const maxDictionaryChars = 30; // حداکثر تعداد کاراکترها برای حالت دیکشنری
    const stopWords = [
      "the",
      "a",
      "an",
      "is",
      "are",
      "was",
      "were",
      "in",
      "on",
      "at",
      "to",
      "of",
      "for",
      "with",
      "by",
      "from",
    ]; // لیست کلمات رایج (بسته به زبان)

    const words = selectedText.trim().split(/\s+/);

    if (
      words.length <= maxDictionaryWords &&
      selectedText.length <= maxDictionaryChars
    ) {
      if (words.length === 1) {
        const lowerCaseWord = words[0].toLowerCase();
        if (!stopWords.includes(lowerCaseWord)) {
          translationMode = TranslationMode.Dictionary_Translation;
        }
      } else if (words.length > 1) {
        translationMode = TranslationMode.Dictionary_Translation;
      }
    }

    this.translationPromise = translateText(selectedText, translationMode); // ذخیره promise ترجمه

    this.dismiss(false); // بستن پاپ‌آپ قبلی

    // *** بررسی اعتبار this.translationPromise ***
    if (
      !this.translationPromise ||
      typeof this.translationPromise.then !== "function" ||
      typeof this.translationPromise.catch !== "function"
    ) {
      logME(
        "[SelectionWindows]: Invalid translationPromise:",
        this.translationPromise
      );
      return;
    }
    // *** پایان بررسی ***

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
          return;
        }
        const translatedText =
          translated_text_untrimmed ? translated_text_untrimmed.trim() : "";
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
        }
      });

    const removeHandler = (event) => {
      if (!this.isVisible || !this.displayElement) return;
      const target = event.target;
      if (this.displayElement.contains(target)) {
        event.stopPropagation();
        return;
      }
      this.cancelCurrentTranslation(); // فراخوانی متد جدید برای لغو ترجمه
    };

    if (this.removeMouseDownListener) {
      document.removeEventListener("mousedown", this.removeMouseDownListener);
    }
    document.addEventListener("mousedown", removeHandler);
    this.removeMouseDownListener = removeHandler;
  }

  // لغو ترجمه
  cancelCurrentTranslation() {
    this.isTranslationCancelled = true;
    this.translationPromise = null; // پاک کردن promise
    this.translatingText = null; // پاک کردن متن در حال ترجمه
    this.dismiss(); // فراخوانی متد dismiss برای انجام fade out
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
    this.displayElement.style.transition = `transform 0.1s ease-out, opacity ${this.fadeInDuration}ms ease-in-out`;
    this.displayElement.style.left = `${position.x}px`;
    this.displayElement.style.top = `${position.y}px`;
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
      }, 100);
    });
  }

  transitionToTranslatedText(translatedText, loadingContainer) {
    // 1. محو شدن نقاط لودینگ
    loadingContainer.style.opacity = "0";
    setTimeout(() => {
      if (this.displayElement) {
        // 2. تنظیم شفافیت به 0.6 قبل از جایگذاری متن
        this.displayElement.style.opacity = "0.6";

        // 3. تنظیم متن ترجمه شده قبل از جایگذاری
        this.applyTextDirection(this.displayElement, translatedText);

        // 4. جایگذاری متن ترجمه شده به صورت Markdown
        this.displayElement.innerHTML = marked.parse(translatedText);

        // 5. شروع انیمیشن Fade In با یک تاخیر کوتاه
        setTimeout(() => {
          this.displayElement.style.transition = `opacity 0.15s ease-in-out`;
          this.displayElement.style.opacity = "0.9";
        }, 10); // تاخیر بسیار کم برای اطمینان از اعمال تغییرات
      }
    }, 150); // مدت زمان محو شدن نقاط لودینگ (باید با CSS هماهنگ باشد)
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

    this.isVisible = false;

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
