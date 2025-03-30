// src/core/EventHandler.js
import { CONFIG, state, TranslationMode } from "../config.js";
import { ErrorTypes, ErrorHandler } from "../services/ErrorService.js";
import { translateText, API_TEXT_DELIMITER } from "../utils/api.js";
import {
  separateCachedAndNewTexts,
  collectTextNodes,
  applyTranslationsToNodes,
  revertTranslations,
} from "../utils/textExtraction.js";
import { logME, logMethod, taggleLinks } from "../utils/helpers.js";
import { detectPlatform, Platform } from "../utils/platformDetector.js";
import setupIconBehavior from "../managers/IconBehavior.js";

const translationCache = new Map();

export default class EventHandler {
  constructor(translationHandler) {
    this.translationHandler = translationHandler;
    this.IconManager = translationHandler.IconManager;
    this.notifier = translationHandler.notifier;
    this.strategies = translationHandler.strategies;
    this.isProcessing = translationHandler.isProcessing;
    this.select_Element_ModeActive =
      translationHandler.select_Element_ModeActive;
    this.handleEvent = this.handleEvent.bind(this);
    this.handleSelect_ElementModeClick =
      this.handleSelect_ElementClick.bind(this);
    this.handleEscape = this.handleEscape.bind(this);
  }

  @logMethod
  async handleEvent(event) {
    try {
      if (this.isEscapeEvent(event)) {
        this.handleEscape(event);
        return;
      }

      if (this.select_Element_ModeActive && event.type === "click") {
        await this.handleSelect_ElementClick(event);
        return;
      }

      if (this.isCtrlSlashEvent(event)) {
        await this.handleCtrlSlash(event);
        return;
      }

      if (this.select_Element_ModeActive) {
        await this.handleSelectElementMode(event);
        return;
      }

      if (this.isEditableTarget(event.target)) {
        await this.handleEditableElement(event);
        return;
      }
    } catch (error) {
      error = await ErrorHandler.processError(error);
      this.translationHandler.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "event-handling",
      });
    }
  }

  isCtrlSlashEvent(event) {
    return (
      (event.ctrlKey || event.metaKey) && event.key === "/" && !event.repeat
    );
  }
  isEscapeEvent(event) {
    return event.key === "Escape" && !event.repeat;
  }

  isEditableTarget(target) {
    return (
      target?.isContentEditable ||
      ["INPUT", "TEXTAREA"].includes(target?.tagName) ||
      (target?.closest && target.closest('[contenteditable="true"]'))
    );
  }
  _processEditableElement(element) {
    if (this.IconManager) {
      this.IconManager.cleanup();

      // TODO: Platform-specific handling for YouTube (Temporary Solution - Requires Refinement)
      if (detectPlatform() === Platform.Youtube) {
        const youtubeStrategies = this.strategies["youtube"];
        // Skip processing for recognized special fields on YouTube (search query or end field).
        // This is a temporary implementation and may need a more robust and scalable approach in the future.
        if (youtubeStrategies.isYoutube_ExtraField(element)) {
          return;
        }
      }
      // TODO: End of platform-specific handling for YouTube (Temporary Solution)

      const icon = this.IconManager.createTranslateIcon(element);
      if (icon) {
        setupIconBehavior(
          icon,
          element,
          this.translationHandler,
          this.notifier,
          this.strategies
        );
        return icon;
      } else {
        console.debug("[EventHandler] Icon not created");
        return null;
      }
    }
    return null;
  }

  handleEditableFocus(element) {
    if (state.activeTranslateIcon) return;
    this._processEditableElement(element);
  }

  async handleEditableElement(event) {
    event.stopPropagation();
    const target = event.target;

    if (state.activeTranslateIcon) return;
    this._processEditableElement(target);
  }

  handleEditableBlur() {
    setTimeout(() => {
      if (
        !document.activeElement?.isConnected ||
        (document.activeElement !== state.activeTranslateIcon &&
          !document.activeElement.closest(
            ".AIWritingCompanion-translation-icon-extension"
          ))
      ) {
        this.IconManager?.cleanup();
      }
    }, 100);
  }

  @logMethod
  async handleSelect_ElementClick(e) {
    const currentPlatform = detectPlatform();
    switch (currentPlatform) {
      case Platform.Twitter:
        logME("You are on Twitter!");
        break;
      case Platform.WhatsApp:
        logME("You are on WhatsApp!");
        break;
      default:
        logME("You are on another platform.");
    }

    const targetElement = e.target;

    const { textNodes, originalTextsMap } = collectTextNodes(targetElement);

    if (originalTextsMap.size === 0) return;

    const { textsToTranslate, cachedTranslations } = separateCachedAndNewTexts(
      originalTextsMap,
      translationCache
    );

    if (textsToTranslate.length === 0 && cachedTranslations.size > 0) {
      // Check if there are cached items
      applyTranslationsToNodes(textNodes, cachedTranslations, {
        state,
        IconManager: this.IconManager,
      });
      this.notifier.show("حافظه", "info", true, 1500);
      return;
    }
    // If nothing to translate and nothing from cache (e.g., empty selection)
    if (textsToTranslate.length === 0) return;

    let statusNotification = null; // Initialize statusNotification
    try {
      statusNotification = this.notifier.show(
        "در حال ترجمه...",
        "status",
        false
      );
      state.translateMode = TranslationMode.SelectElement;

      // ساختار JSON مورد نظر برای ارسال
      const jsonPayloadArray = textsToTranslate.map((text) => ({ text }));
      const jsonFormatString = JSON.stringify(jsonPayloadArray);

      // console.debug(
      //   "Sending this JSON string to translateText:",
      //   jsonFormatString
      // );

      // ارسال رشته JSON به translateText
      // translateText و createPrompt حالا طوری تنظیم شده‌اند که انتظار JSON در خروجی دارند
      const translatedJsonString = await translateText(jsonFormatString);

      logME("Texts to translate:", JSON.stringify(textsToTranslate, null, 2));
      logME("Translated JSON response:", translatedJsonString);

      if (statusNotification) {
        this.notifier.dismiss(statusNotification);
        statusNotification = null;
      }

      // *** پردازش نتیجه به عنوان JSON ***
      if (translatedJsonString && typeof translatedJsonString === "string") {
        let translatedData;
        try {
          // پاکسازی اولیه رشته JSON دریافتی (حذف ```json احتمالی)
          let cleanJsonString = translatedJsonString.trim();
          const jsonMarkdownRegex = /^```(?:json)?\s*([\s\S]*?)\s*```$/;
          const match = cleanJsonString.match(jsonMarkdownRegex);
          if (match) {
            cleanJsonString = match[1].trim();
          }
          // else: assume it's already a clean JSON string or plain text error message

          // تلاش برای پارس کردن رشته JSON تمیز شده
          translatedData = JSON.parse(cleanJsonString);

          // اعتبارسنجی ساختار نتیجه پارس شده
          if (
            !Array.isArray(translatedData) ||
            translatedData.length !== textsToTranslate.length
          ) {
            console.error(
              "Translated JSON structure mismatch.",
              "Expected length:",
              textsToTranslate.length,
              "Got length:",
              Array.isArray(translatedData) ?
                translatedData.length
              : "Not an array",
              "Parsed Data:",
              translatedData // Log parsed data for inspection
            );
            // ایجاد خطا برای ارسال به ErrorHandler
            throw new Error(
              `Translated JSON length mismatch: expected ${textsToTranslate.length}, got ${Array.isArray(translatedData) ? translatedData.length : "N/A"}`
            );
          }

          // اگر ساختار درست بود، داده‌ها را استخراج کن
          const newTranslations = new Map();
          textsToTranslate.forEach((originalText, index) => {
            const translatedItem = translatedData[index];
            // بررسی اینکه آیتم معتبر است و خاصیت text دارد
            if (translatedItem && typeof translatedItem.text === "string") {
              const translatedText = translatedItem.text;
              newTranslations.set(originalText, translatedText);
              translationCache.set(originalText, translatedText); // آپدیت کش
            } else {
              console.warn(
                `Missing or invalid translation for item at index ${index}. Original: '${originalText}'. Received item:`,
                translatedItem
              );
              // استفاده از متن اصلی به عنوان جایگزین در صورت خطا
              newTranslations.set(originalText, originalText);
            }
          });

          // ترکیب ترجمه‌های جدید با ترجمه‌های کش شده
          const allTranslations = new Map([
            ...cachedTranslations,
            ...newTranslations,
          ]);

          // اعمال ترجمه‌ها به نودهای صفحه
          applyTranslationsToNodes(textNodes, allTranslations, {
            state,
            IconManager: this.IconManager,
          });
          // this.notifier.show("ترجمه شد", "success", true, 1500); // اعلان موفقیت اختیاری
        } catch (parseError) {
          // مدیریت خطای پارس کردن JSON یا خطای عدم تطابق ساختار
          console.error(
            "Failed to parse or validate translated JSON response:",
            parseError
          );
          console.error("Raw response string:", translatedJsonString); // لاگ کردن رشته خام برای دیباگ
          await this.translationHandler.errorHandler.handle(parseError, {
            type: ErrorTypes.API, // یا یک نوع خطای مشخص‌تر مثل PARSE_ERROR
            context: "EventHandler-handleSelect-JSONParseOrValidateError",
            details: `Failed to process API response. Raw snippet: ${translatedJsonString.substring(0, 150)}...`,
          });
        }
      } else {
        // مدیریت حالتی که ترجمه null یا غیر رشته برگردانده
        console.warn(
          "Translation did not return a valid string:",
          translatedJsonString
        );
        if (translatedJsonString === null) {
          // ممکن است به خاطر زبان مبدا/مقصد یکسان باشد
          this.notifier.show("زبان مبدا و مقصد یکسان است.", "info", true, 2000);
        }
        // نیازی به نمایش خطای عمومی نیست اگر ErrorHandler قبلا این کار را کرده باشد
      }
    } catch (error) {
      // مدیریت خطاهای کلی در فرآیند ترجمه
      console.error("Error during handleSelect_ElementClick:", error);
      // اطمینان از پردازش خطا قبل از ارسال به handler
      error = await ErrorHandler.processError(error);
      await this.translationHandler.errorHandler.handle(error, {
        type: error.type || ErrorTypes.SERVICE,
        statusCode: error.statusCode,
        context: "EventHandler-handleSelect_ElementClick",
      });
    } finally {
      if (statusNotification) {
        this.notifier.dismiss(statusNotification);
      }
    }
  }

  @logMethod
  async handleSelectElementMode(event) {
    if (event.type === "mouseover" || event.type === "mousemove") {
      const newTarget = document.elementFromPoint(event.clientX, event.clientY);

      if (newTarget && newTarget !== state.highlightedElement) {
        if (this.IconManager) {
          this.IconManager.cleanup();
        }

        if (newTarget.innerText?.trim()) {
          state.highlightedElement = newTarget;
          newTarget.style.outline = CONFIG.HIGHLIGHT_STYLE;
          newTarget.style.opacity = "0.9";
        }
      }
    }
  }

  handleEscape(event) {
    taggleLinks(false);

    this.translationHandler.select_Element_ModeActive = false;
    state.selectElementActive = false;

    if (state.translateMode === TranslationMode.SelectElement) {
      revertTranslations({
        state,
        errorHandler: this.translationHandler.errorHandler,
        notifier: this.notifier,
        IconManager: this.IconManager,
      });
    }

    if (this.IconManager) {
      this.IconManager.cleanup();
    }
  }

  async handleCtrlSlash(event) {
    event.preventDefault();
    event.stopPropagation();

    console.debug("[EventHandler] Handling Ctrl+/ event");

    // TODO: جلوگیری از اجرای میانبر در سایت ChatGPT به دلیل تداخل با شورتکات‌های پیش‌فرض آن.
    // TODO: نیاز به بررسی بیشتر برای راه‌حل جایگزین دارد.
    const platform = detectPlatform();
    if (platform === "chatgpt") {
      console.info(
        "میانبر در این وب‌سایت موقتا غیرفعال است. لطفاً از آیکون مترجم استفاده کنید."
      );
      return;
    }
    // TODO: END

    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const { select_element, activeElement } =
        this.translationHandler.getSelectElementContext();
      const isTextSelected = !select_element.isCollapsed;

      const text =
        isTextSelected ?
          select_element.toString().trim()
        : this.translationHandler.extractFromActiveElement(activeElement);

      if (!text) return;

      await this.translationHandler.processTranslation_with_CtrlSlash({
        text,
        originalText: text,
        target: isTextSelected ? null : activeElement,
        selectionRange: isTextSelected ? select_element.getRangeAt(0) : null,
      });
    } catch (error) {
      error = await ErrorHandler.processError(error);
      console.debug("[EventHandler] Ctrl+/ Error: ", error);
      // تعیین نوع خطا با اولویت دادن به نوع موجود در خطا
      // بررسی خطاهای پردازش شده و پرچم suppressSystemError
      if (error.isFinal) {
        return;
      }

      // فقط خطاهای اصلی را نمایش بده
      if (!error.originalError?.isPrimary) {
        const errorType = error.type || ErrorTypes.API;
        const statusCode = error.statusCode || 500;

        this.translationHandler.errorHandler.handle(error, {
          type: errorType,
          statusCode: statusCode,
          context: "ctrl-slash",
          suppressSecondary: true, // جلوگیری از نمایش خطاهای ثانویه
        });
      }
    } finally {
      this.isProcessing = false;
    }
  }
}
