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

      // if (this.select_Element_ModeActive) {
      //   await this.handleSelectElementMode(event);
      //   return;
      // }

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

    // Apply cached translations first if no new texts need fetching
    if (textsToTranslate.length === 0 && cachedTranslations.size > 0) {
      applyTranslationsToNodes(textNodes, cachedTranslations, {
        state,
        IconManager: this.IconManager,
      });
      this.notifier.show("حافظه", "info", true, 1500);
      return;
    }
    // If nothing new to translate and nothing from cache
    if (textsToTranslate.length === 0) return;

    let statusNotification = null;
    try {
      statusNotification = this.notifier.show(
        "در حال ترجمه...",
        "status",
        false
      );
      state.translateMode = TranslationMode.SelectElement;

      // --- مرحله 2: گسترش متن‌ها و ایجاد نگاشت ---
      const expandedTexts = []; // آرایه نهایی متن‌ها برای ارسال (تقسیم شده با \n)
      const originMapping = []; // نگاشت: index در expandedTexts -> { originalIndex, segmentIndex }
      // ساختار کمکی برای بازسازی: originalIndex -> array of expanded indices
      const originalToExpandedIndices = new Map();

      textsToTranslate.forEach((originalText, originalIndex) => {
        // تقسیم متن اصلی بر اساس خط جدید
        const segments = originalText.split("\n");
        const currentExpandedIndices = [];

        segments.forEach((segment, segmentIndex) => {
          // فقط قطعات غیر خالی را اضافه کن (برای جلوگیری از ارسال رشته خالی)
          // if (segment) { // یا segment.trim() اگر فضاهای خالی هم مهم نیستند
          expandedTexts.push(segment); // اضافه کردن بخش به آرایه نهایی
          // ذخیره اطلاعات مبدا: این بخش از کدام متن اصلی و کدام قسمت آن آمده است
          originMapping.push({ originalIndex, segmentIndex });
          currentExpandedIndices.push(expandedTexts.length - 1);
          // }
        });
        originalToExpandedIndices.set(originalIndex, currentExpandedIndices);
      });
      // --- پایان مرحله 2 ---

      // مرحله 3: ساخت JSON با متن‌های گسترش‌یافته
      const jsonPayloadArray = expandedTexts.map((text) => ({ text }));
      const jsonFormatString = JSON.stringify(jsonPayloadArray);

      // ارسال به سرویس ترجمه
      const translatedJsonString = await translateText(jsonFormatString);

      // logME("JSON Sent:", JSON.stringify(jsonFormatString)); // لاگ متن‌های گسترش یافته

      if (statusNotification) {
        this.notifier.dismiss(statusNotification);
        statusNotification = null;
      }

      if (translatedJsonString && typeof translatedJsonString === "string") {
        let translatedData;
        try {
          // پاکسازی و پارس کردن JSON
          let cleanJsonString = translatedJsonString.trim();
          const jsonMarkdownRegex = /^```(?:json)?\s*([\s\S]*?)\s*```$/;
          const match = cleanJsonString.match(jsonMarkdownRegex);
          if (match) {
            cleanJsonString = match[1].trim();
          }
          translatedData = JSON.parse(cleanJsonString);

          // --- مرحله 5: بررسی و مدیریت عدم تطابق طول ---
          if (!Array.isArray(translatedData)) {
            console.error(
              "پاسخ ترجمه یک آرایه نیست.",
              "داده پارس شده:",
              translatedData
            );
            throw new Error("Translated response is not an array."); // همچنان خطا برای نوع نامعتبر
          }

          if (translatedData.length !== expandedTexts.length) {
            // به جای خطا، یک هشدار در کنسول ثبت کن
            console.warn(
              "عدم تطابق طول در پاسخ ترجمه شناسایی شد.",
              `طول مورد انتظار (بر اساس متن‌های گسترش‌یافته): ${expandedTexts.length}`,
              `طول دریافت شده: ${translatedData.length}`,
              "علت احتمالی: تقسیم/ادغام متفاوت متن توسط API یا افزودن/حذف آیتم‌ها.",
              "تلاش برای پردازش با داده‌های موجود ادامه می‌یابد..."
            );
          }
          // --- پایان مرحله 5 ---

          // --- مرحله 6: بازسازی ترجمه‌ها ---
          const newTranslations = new Map(); // نگاشت نهایی: متن اصلی -> متن ترجمه‌شده کامل
          // ساختار کمکی برای نگهداری بخش‌های ترجمه‌شده به ترتیب
          const translatedSegmentsMap = new Map(); // originalIndex -> array of translated segments strings

          // پردازش پاسخ‌های دریافتی (تا حداقل طول برای جلوگیری از خطا)
          const numItemsToProcess = Math.min(
            expandedTexts.length,
            translatedData.length
          );

          for (let i = 0; i < numItemsToProcess; i++) {
            const translatedItem = translatedData[i];
            const mappingInfo = originMapping[i]; // اطلاعات مبدا این بخش

            if (
              translatedItem &&
              typeof translatedItem.text === "string" &&
              mappingInfo
            ) {
              const { originalIndex } = mappingInfo;
              // اگر اولین بخش برای این متن اصلی است، آرایه را ایجاد کن
              if (!translatedSegmentsMap.has(originalIndex)) {
                translatedSegmentsMap.set(originalIndex, []);
              }
              // بخش ترجمه‌شده را به آرایه مربوط به متن اصلی اضافه کن
              // فرض می‌کنیم ترتیب حفظ شده است
              translatedSegmentsMap
                .get(originalIndex)
                .push(translatedItem.text);
            } else {
              // اگر ترجمه نامعتبر بود یا اطلاعات نگاشت نبود
              console.warn(
                `داده ترجمه نامعتبر یا گمشده برای آیتم در اندیس ${i}.`,
                "آیتم دریافتی:",
                translatedItem,
                "اطلاعات نگاشت:",
                mappingInfo
              );
              // رفتار جایگزین: می‌توانید متن اصلی بخش را استفاده کنید
              if (mappingInfo) {
                const { originalIndex } = mappingInfo;
                if (!translatedSegmentsMap.has(originalIndex)) {
                  translatedSegmentsMap.set(originalIndex, []);
                }
                // متن اصلی این بخش را به عنوان جایگزین اضافه کن
                translatedSegmentsMap.get(originalIndex).push(expandedTexts[i]);
              }
            }
          }

          // حالا بخش‌های ترجمه‌شده را برای هر متن اصلی به هم بچسبان
          textsToTranslate.forEach((originalText, originalIndex) => {
            if (translatedSegmentsMap.has(originalIndex)) {
              const segments = translatedSegmentsMap.get(originalIndex);
              // با خط جدید دوباره به هم بچسبان
              const reassembledText = segments.join("\n");
              newTranslations.set(originalText, reassembledText);
              translationCache.set(originalText, reassembledText); // کش را با متن بازسازی شده آپدیت کن
            } else if (!cachedTranslations.has(originalText)) {
              // اگر هیچ بخشی برای این متن پیدا نشد (و در کش هم نبود)
              console.warn(
                `هیچ بخش ترجمه‌ای برای متن اصلی "${originalText}" یافت نشد. از متن اصلی استفاده می‌شود.`
              );
              newTranslations.set(originalText, originalText); // از متن اصلی به عنوان جایگزین استفاده کن
            }
          });
          // --- پایان مرحله 6 ---

          // مرحله 7: ترکیب و اعمال ترجمه‌ها
          const allTranslations = new Map([
            ...cachedTranslations,
            ...newTranslations,
          ]);

          applyTranslationsToNodes(textNodes, allTranslations, {
            state,
            IconManager: this.IconManager,
          });
          // this.notifier.show("ترجمه شد", "success", true, 1500); // اعلان موفقیت
        } catch (parseOrProcessError) {
          // خطاهای مربوط به پارس JSON یا بازسازی ترجمه‌ها
          logME("خطا در پارس JSON یا پردازش ترجمه‌ها:", parseOrProcessError);
          logME("رشته خام پاسخ:", translatedJsonString);
          await this.translationHandler.errorHandler.handle(
            parseOrProcessError,
            {
              type: ErrorTypes.PARSE_TEXT,
              context: "EventHandler-handleSelect-JSONParseOrProcessError",
              details: `Failed to process API response. Raw snippet: ${translatedJsonString.substring(0, 150)}...`,
            }
          );
          this.notifier.show("خطا در پردازش پاسخ", "error", true, 2000);
        }
      } else {
        // ... (مدیریت پاسخ null یا غیر رشته‌ای) ...
        logME("ترجمه یک رشته معتبر برنگرداند:", translatedJsonString);
        if (translatedJsonString === null) {
          this.notifier.show("زبان مبدا و مقصد یکسان است.", "info", true, 2000);
        }
      }
    } catch (error) {
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

  // @logMethod
  // async handleSelectElementMode(event) {
  //   if (event.type === "mouseover" || event.type === "mousemove") {
  //     const newTarget = document.elementFromPoint(event.clientX, event.clientY);

  //     if (newTarget && newTarget !== state.highlightedElement) {
  //       if (this.IconManager) {
  //         this.IconManager.cleanup();
  //       }

  //       if (newTarget.innerText?.trim()) {
  //         state.highlightedElement = newTarget;
  //         newTarget.style.outline = CONFIG.HIGHLIGHT_STYLE;
  //         newTarget.style.opacity = "0.9";
  //       }
  //     }
  //   }
  // }

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

    logME("[EventHandler] Handling Ctrl+/ event");

    // TODO: جلوگیری از اجرای میانبر در سایت ChatGPT به دلیل تداخل با شورتکات‌های پیش‌فرض آن.
    // TODO: نیاز به بررسی بیشتر برای راه‌حل جایگزین دارد.
    const platform = detectPlatform();
    if (platform === Platform.ChatGPT) {
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
      logME("[EventHandler] Ctrl+/ Error: ", error);
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
