// src/managers/SelectionWindows.js
import Browser from "webextension-polyfill";
import { logME, isExtensionContextValid } from "../utils/helpers";
import { ErrorHandler, ErrorTypes } from "../services/ErrorService.js";
import { CONFIG, TranslationMode, TRANSLATION_ERRORS } from "../config.js";
import { marked } from "marked";

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
    this.translatedText = null; // برای نگهداری متن ترجمه شده
    this.isTranslationCancelled = false; // پرچم برای مشخص کردن اینکه آیا ترجمه لغو شده است
    this.originalText = null; // نگهداری متنی که در حال ترجمه است
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

    this.dismiss(false); // بستن هر پنل قبلی

    this.isTranslationCancelled = false; // ریست کردن پرچم در هر بار نمایش

    this.originalText = selectedText; // ثبت متن در حال ترجمه

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

    // نمایش لودینگ
    this.displayElement = document.createElement("div");
    this.displayElement.classList.add("aiwc-selection-display-temp");

    const loadingContainer = this.createLoadingDots();
    this.displayElement.appendChild(loadingContainer);

    this.applyInitialStyles(position);
    document.body.appendChild(this.displayElement);
    this.isVisible = true;
    this.animatePopupSize(loadingContainer);

    // ذخیره‌ی متن در حال ترجمه برای تطبیق بعدی
    const currentText = selectedText;
    this.originalText = currentText;
    this.isTranslationCancelled = false;

    // شروع async ترجمه
    Browser.runtime
      .sendMessage({
        action: "fetchTranslationBackground",
        payload: {
          promptText: currentText,
          translationMode: translationMode,
        },
      })
      .then((response) => {
        if (this.isTranslationCancelled || this.originalText !== currentText) {
          this.dismiss(false);
          return;
        }

        if (response && response.success === true) {
          const translatedText = response.data?.translatedText?.trim() || "";
          this.transitionToTranslatedText(
            translatedText,
            loadingContainer,
            currentText
          );
        } else {
          this.handleEmptyTranslation(loadingContainer);
        }
      })
      .catch((error) => {
        console.error("[SelectionWindow] Error fetching translation:", error);
        this.handleEmptyTranslation(loadingContainer);
      });

    const removeHandler = (event) => {
      if (!this.isVisible || !this.displayElement) return;
      const target = event.target;
      if (this.displayElement.contains(target)) {
        event.stopPropagation();
        return;
      }
      this.cancelCurrentTranslation(); // فراخوانی متد برای لغو ترجمه
    };

    if (this.removeMouseDownListener) {
      document.removeEventListener("mousedown", this.removeMouseDownListener);
    }
    document.addEventListener("mousedown", removeHandler);
    this.removeMouseDownListener = removeHandler;
  }

  // لغو ترجمه
  cancelCurrentTranslation() {
    this.dismiss(); // فراخوانی متد dismiss برای انجام fade out
    this.isTranslationCancelled = true;
    this.originalText = null; // پاک کردن متن در حال ترجمه
    this.translatedText = null;
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

  transitionToTranslatedText(translatedText, loadingContainer, original_text) {
    // متن خام را برای استفاده در TTS نگه دارید
    const rawTranslatedText = translatedText ? translatedText.trim() : "";

    // 1. محو شدن نقاط لودینگ
    loadingContainer.style.opacity = "0";
    setTimeout(() => {
      // مطمئن شوید المان هنوز وجود دارد و قابل مشاهده است
      if (this.displayElement && this.isVisible) {
        // 2. تنظیم شفافیت اولیه قبل از نمایش محتوا
        this.displayElement.style.opacity = "0.6";

        // 4. پاک کردن محتوای قبلی (مهم!)
        this.displayElement.innerHTML = "";

        // --- 5. ایجاد ساختار جدید ---

        // --- ردیف اول: متن اصلی و آیکون صدا ---
        const firstLineContainer = document.createElement("div");
        firstLineContainer.classList.add("aiwc-first-line"); // کلاس برای استایل دهی

        // ایجاد و افزودن آیکون TTS (فقط اگر متنی برای خواندن وجود دارد)
        if (rawTranslatedText) {
          const ttsIcon = this.createTTSIcon(original_text);
          firstLineContainer.appendChild(ttsIcon); // آیکون اول اضافه می‌شود
        }

        // نمایش متن اصلی
        const originalTextSpan = document.createElement("span");
        originalTextSpan.classList.add("aiwc-original-text"); // کلاس برای استایل دهی
        originalTextSpan.textContent = original_text;
        firstLineContainer.appendChild(originalTextSpan);

        this.displayElement.appendChild(firstLineContainer);

        // --- ردیف دوم: متن ترجمه شده و سایر اطلاعات ---
        const secondLineContainer = document.createElement("div");
        secondLineContainer.classList.add("aiwc-second-line"); // کلاس برای استایل دهی

        const textContainer = document.createElement("span");
        textContainer.classList.add("aiwc-text-content"); // کلاس برای استایل‌دهی متن ترجمه شده
        textContainer.innerHTML = marked.parse(
          rawTranslatedText || "(ترجمه یافت نشد)"
        ); // نمایش پیام اگر متن خالی بود
        secondLineContainer.appendChild(textContainer);

        // 3. تنظیم جهت متن *فقط برای ردیف دوم*
        this.applyTextDirection(secondLineContainer, rawTranslatedText);

        // می‌توانید در اینجا سایر اطلاعات را به secondLineContainer اضافه کنید

        this.displayElement.appendChild(secondLineContainer);

        // 7. شروع انیمیشن Fade In با کمی تاخیر
        requestAnimationFrame(() => {
          this.displayElement.style.transition = `opacity 0.15s ease-in-out`;
          this.displayElement.style.opacity = "0.9";
        });
      }
    }, 150); // مدت زمان محو شدن نقاط لودینگ
  }

  // --- 8. متد جدید برای ساخت آیکون TTS و Listener آن ---
  createTTSIcon(textToSpeak) {
    const icon = document.createElement("img");
    try {
      // مسیر آیکون را نسبت به ریشه افزونه تنظیم کنید
      icon.src = Browser.runtime.getURL("../icons/speaker.png");
    } catch (e) {
      logME("Error getting speaker icon URL:", e);
      icon.src = "../icons/speaker.png"; // Fallback path
    }
    icon.alt = "خواندن متن";
    icon.title = "خواندن متن";
    icon.classList.add("aiwc-tts-icon"); // کلاس برای استایل دهی CSS

    icon.addEventListener("click", async (event) => {
      event.stopPropagation();
      logME("[SelectionWindows]: TTS icon clicked.");
      // DON'T get targetLangCode here, background will handle it based on settings
      // DON'T call playAudioGoogleTTS directly

      // Send message to background
      Browser.runtime.sendMessage(
        {
          action: "playGoogleTTS", // Define a new action
          text: textToSpeak,
          // Background script will get target language from storage
        },
        (response) => {
          // Optional: Handle response from background
          if (Browser.runtime.lastError) {
            logME(
              "[SelectionWindows]: Error sending TTS message:",
              Browser.runtime.lastError.message
            );
            // alert(
            //   `خطا در ارسال درخواست صدا: ${Browser.runtime.lastError.message}`
            // );
            return;
          }
          if (response && !response.success) {
            logME(
              "[SelectionWindows]: Background script reported TTS error:",
              response.error
            );
            // alert(`خطا در پخش صدا: ${response.error}`);
          } else if (response && response.success) {
            logME("[SelectionWindows]: TTS playback initiated by background.");
          }
        }
      );
    });

    return icon;
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
    this.translatedText = null;
    this.isTranslationCancelled = false;
    this.originalText = null; // اطمینان از پاک شدن متن در حال ترجمه
  }

  applyTextDirection(element, text) {
    if (!element || !element.style) return;

    const isRtl = CONFIG.RTL_REGEX.test(text);
    element.style.direction = isRtl ? "rtl" : "ltr";
    element.style.textAlign = isRtl ? "right" : "left";
  }
}
