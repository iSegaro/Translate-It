// src/managers/SelectionWindows.js
import Browser from "webextension-polyfill";
import { logME, isExtensionContextValid } from "../utils/helpers";
import { ErrorHandler, ErrorTypes } from "../services/ErrorService.js";
import { CONFIG, TranslationMode, TRANSLATION_ERRORS } from "../config.js";
import { AUTO_DETECT_VALUE } from "../utils/tts.js";
import { marked } from "marked";

export default class SelectionWindows {
  constructor(options = {}) {
    this.fadeInDuration = options.fadeInDuration || 50;
    this.fadeOutDuration = options.fadeOutDuration || 125;
    this.isVisible = false;
    this.currentText = null;
    this.displayElement = null;
    this.errorHandler = new ErrorHandler();
    this.removeMouseDownListener = null;
    this.translationHandler = options.translationHandler;
    this.translatedText = null;
    this.isTranslationCancelled = false;
    this.originalText = null;
    this.notifier = options.notifier;

    // اطمینان از حفظ context در callback ها:
    this.show = this.show.bind(this);
    this.cancelCurrentTranslation = this.cancelCurrentTranslation.bind(this);
    // در صورت لزوم سایر متدهایی که از "this" استفاده می‌کنند را نیز bind کنید.
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

    this.dismiss(false); // *** بستن هر پنل قبلی‌ای

    this.isTranslationCancelled = false; // *** ریست کردن پرچم در هر بار نمایش

    this.originalText = selectedText; // *** ثبت متن در حال ترجمه

    let translationMode = TranslationMode.Field; // *** پیش فرض حالت ترجمه کامل

    // ایجاد کانتینر اصلی برای Shadow DOM
    const container = document.createElement("div");
    // تنظیم موقعیت و سایر ویژگی‌ها
    container.style.position = "absolute";
    container.style.left = `${position.x}px`;
    container.style.top = `${position.y}px`;
    container.style.zIndex = "2147483637"; // یا سطح دیگری که تضمین کند بالاتر باشد

    // ایجاد Shadow Root
    const shadowRoot = container.attachShadow({ mode: "open" });

    // *** نمایش لودینگ ***
    this.displayElement = document.createElement("div");
    this.displayElement.classList.add("aiwc-selection-display-temp");

    this.displayElement.style.opacity = "0.6";
    this.displayElement.style.transform = "scale(0.1)";
    this.displayElement.style.transition = `transform 0.1s ease-out, opacity ${this.fadeInDuration}ms ease-in-out`;

    // ایجاد المان لودینگ
    const loadingContainer = this.createLoadingDots();
    this.displayElement.appendChild(loadingContainer);

    // افزودن المان displayElement به درون Shadow Root
    shadowRoot.appendChild(this.displayElement);

    this.applyInitialStyles(position);

    const style = document.createElement("style");
    style.textContent = `
      .aiwc-selection-display-temp {
        background-color: #f8f8f8;
        color: #333;
        border: 1px solid #ddd;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 14px;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
        /* سایر استایل‌های شما */
      }
      /* سایر کلاس‌های مربوط به داخل پنجره */
      .aiwc-loading-container {
        display: flex;
        justify-content: center;
        align-items: center;
        opacity: 1;
        transition: opacity 0.9s ease-in-out;
      }
      @keyframes blink {
        0% { opacity: 0.3; }
        50% { opacity: 0.8; }
        100% { opacity: 0.3; }
      }
      .aiwc-loading-dot {
        font-size: 1.2em;
        opacity: 0.3;
        margin: 0 0.2em;
        animation: blink 0.7s infinite;
        color: black;
      }
    `;
    shadowRoot.appendChild(style);

    document.body.appendChild(this.displayElement);
    this.isVisible = true;
    this.animatePopupSize(loadingContainer);
    // *** نمایش لودینگ ***

    // TODO: این فقط یک تست اولیه بود که هیچ تغییر نکرده
    // TODO: نیاز به بازبینی و پیاده سازی یک روش پویاتر است
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
    ]; // *** لیست کلمات رایج (بسته به زبان)

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
    // *** End of TODO ***

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
        try {
          // اگر ترجمه کنسل شده یا متن عوض شده، پنجره را ببند
          if (
            this.isTranslationCancelled ||
            this.originalText !== currentText
          ) {
            this.cancelCurrentTranslation();
            return;
          }

          // بررسی موفقیت پاسخ
          if (response && response.success === true) {
            const translatedText = response.data?.translatedText?.trim() || "";
            if (translatedText) {
              // اگر ترجمه داریم، آن را در کادر ترجمه نمایش میدهیم
              this.transitionToTranslatedText(
                translatedText,
                loadingContainer,
                currentText,
                translationMode
              );
            } else {
              // TODO: اگر پاسخ خالی باشد، یعنی خطایی پیش آمده در فرآیند ترجمه و یا خطایی در API
              // فعلا یک پیغام خالی بودن متن ترجمه نمایش میدهیم ولی باید بهینه شود با منطق
              // خطاهای API تا پیغام درستی به کاربر نمایش داده شود.
              this.handleEmptyTranslation(loadingContainer);
            }
          } else {
            // اگر پاسخ موفق نبود، پیامی به کاربر نمایش میدهیم
            this.handleEmptyTranslation(loadingContainer);
          }
        } catch (err) {
          // اگر هر خطای غیرمنتظره‌ای در این بلوک رخ داد،
          // هم لاگ می‌کنیم و هم باکس را می‌بندیم
          logME("[SelectionWindow] Error in .then block:", err);
          this.handleTranslationError(err, loadingContainer);
        }
      })
      .catch((error) => {
        // خطاهای promise-level
        logME("[SelectionWindow] Error fetching translation:", error);
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
    this.stoptts_playing();
  }

  stoptts_playing() {
    Browser.runtime.sendMessage({ action: "stopTTS" });
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
      }, 150);
    });
  }

  transitionToTranslatedText(
    translatedText,
    loadingContainer,
    original_text,
    trans_Mode = TranslationMode.SelectionWindows
  ) {
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

        // ساخت سطر اول
        const firstLineContainer = document.createElement("div");
        firstLineContainer.classList.add("aiwc-first-line");

        // اگر ترجمه داریم، آیکون TTS را اضافه کن
        if (rawTranslatedText) {
          const ttsIcon = this.createTTSIcon(original_text);
          firstLineContainer.appendChild(ttsIcon);
        } else {
          if (this.notifier) {
            this.notifier.dismiss();
          }
          return;
        }

        if (trans_Mode === TranslationMode.Dictionary_Translation) {
          const originalTextSpan = document.createElement("span");
          originalTextSpan.classList.add("aiwc-original-text");
          originalTextSpan.textContent = original_text;
          firstLineContainer.appendChild(originalTextSpan);
          // }
        }

        // اگر چیزی در سطر اول اضافه شده، آن را به نمایش‌گر اصلی بچسبان
        if (firstLineContainer.childNodes.length > 0) {
          this.displayElement.appendChild(firstLineContainer);
        }

        // --- سطر دوم: متن ترجمه شده ---
        const secondLineContainer = document.createElement("div");
        secondLineContainer.classList.add("aiwc-second-line");
        const textContainer = document.createElement("span");
        textContainer.classList.add("aiwc-text-content");
        textContainer.innerHTML = marked.parse(
          rawTranslatedText || "(ترجمه یافت نشد)"
        );
        secondLineContainer.appendChild(textContainer);

        this.applyTextDirection(secondLineContainer, rawTranslatedText);
        this.displayElement.appendChild(secondLineContainer);

        // انیمیشن Fade In
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
    icon.src = Browser.runtime.getURL("icons/speaker.png");
    icon.alt = "خواندن متن";
    icon.title = "خواندن متن";
    icon.classList.add("aiwc-tts-icon");

    icon.addEventListener("click", (event) => {
      event.stopPropagation();
      logME("[SelectionWindows]: TTS icon clicked.");

      Browser.runtime
        .sendMessage({
          action: "speak",
          text: textToSpeak,
          lang: AUTO_DETECT_VALUE,
        })
        .then((response) => {
          if (!response.success) {
            logME("[SelectionWindows]: TTS playback failed:", response.error);
          } else {
            logME("[SelectionWindows]: TTS playback initiated.");
          }
        })
        .catch((err) => {
          logME("[SelectionWindows]: Error sending TTS message:", err);
        });
    });

    return icon;
  }

  handleEmptyTranslation(loadingContainer) {
    loadingContainer.style.opacity = "0";
    setTimeout(() => {
      if (this.displayElement) {
        this.notifier.show(
          "متن ترجمه خالی است، دوباره امتحان کنید",
          "info",
          true,
          2000
        );
        // با false صدا بزنید تا مستقیماً remove شود
        this.dismiss(false);
      }
    }, 300);
  }

  handleTranslationError(error, loadingContainer) {
    // logME("Error during translation:", error);
    loadingContainer.style.opacity = "0";
    setTimeout(() => {
      if (this.displayElement) {
        this.notifier.show(
          "خطایی رخ داد، دوباره تلاش کنید",
          "info",
          true,
          2000
        );
        // با false صدا بزنید تا مستقیماً remove شود
        this.dismiss(false);
      }
    }, 300);
  }

  dismiss(withFadeOut = true) {
    if (!this.displayElement || !this.isVisible) {
      return;
    }

    // حذف لیسنر
    if (this.removeMouseDownListener) {
      document.removeEventListener("mousedown", this.removeMouseDownListener);
      this.removeMouseDownListener = null;
    }

    this.isVisible = false;

    if (withFadeOut && this.fadeOutDuration > 0) {
      // حالت عادی با انیمیشن
      this.displayElement.style.transition = `opacity ${this.fadeOutDuration}ms ease-in-out`;
      this.displayElement.style.opacity = "0";
      this.displayElement.addEventListener(
        "transitionend",
        this.removeElement.bind(this),
        { once: true }
      );
    } else {
      // حذف بی‌درنگ
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
