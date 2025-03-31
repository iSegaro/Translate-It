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

    if (textsToTranslate.length === 0 && cachedTranslations.size > 0) {
      applyTranslationsToNodes(textNodes, cachedTranslations, {
        state,
        IconManager: this.IconManager,
      });
      this.notifier.show("حافظه", "info", true, 1500);
      return;
    }

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
      const { expandedTexts, originMapping, originalToExpandedIndices } =
        this.expandTextsForTranslation(textsToTranslate);

      // مرحله 3: ساخت JSON با متن‌های گسترش‌یافته
      const jsonPayloadArray = expandedTexts.map((text) => ({ text }));
      const jsonFormatString = JSON.stringify(jsonPayloadArray);

      // --- مرحله 4: اندازه گیری حجم بار JSON ---
      const maxPayloadSize = 20000;
      if (jsonFormatString.length > maxPayloadSize) {
        this.notifier.show(
          `متن انتخابی خیلی بزرگ است. ${jsonFormatString.length}`,
          "warning",
          true,
          3000
        );
        return; // از ادامه کار خارج شو
      }
      // --- پایان مرحله 4 ---

      // ارسال به سرویس ترجمه
      const translatedJsonString = await translateText(jsonFormatString);

      if (statusNotification) {
        this.notifier.dismiss(statusNotification);
        statusNotification = null;
      }

      if (translatedJsonString && typeof translatedJsonString === "string") {
        let translatedData;
        try {
          translatedData =
            this.parseAndCleanTranslationResponse(translatedJsonString);

          // --- مرحله 5: بررسی و مدیریت عدم تطابق طول ---
          this.handleTranslationLengthMismatch(translatedData, expandedTexts);

          // --- مرحله 6: بازسازی ترجمه‌ها ---
          const newTranslations = this.reassembleTranslations(
            translatedData,
            expandedTexts,
            originMapping,
            textsToTranslate,
            cachedTranslations
          );

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
              details: `Failed to process API response. Raw snippet: ${translatedJsonString.substring(
                0,
                150
              )}...`,
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

  // --- توابع کمکی ---
  expandTextsForTranslation(textsToTranslate) {
    const expandedTexts = [];
    const originMapping = [];
    const originalToExpandedIndices = new Map();

    textsToTranslate.forEach((originalText, originalIndex) => {
      const segments = originalText.split("\n");
      const currentExpandedIndices = [];

      segments.forEach((segment, segmentIndex) => {
        expandedTexts.push(segment);
        originMapping.push({ originalIndex, segmentIndex });
        currentExpandedIndices.push(expandedTexts.length - 1);
      });
      originalToExpandedIndices.set(originalIndex, currentExpandedIndices);
    });

    return { expandedTexts, originMapping, originalToExpandedIndices };
  }

  parseAndCleanTranslationResponse(translatedJsonString) {
    let cleanJsonString = translatedJsonString.trim();
    const jsonMarkdownRegex = /^```(?:json)?\s*([\s\S]*?)\s*```$/;
    const match = cleanJsonString.match(jsonMarkdownRegex);
    if (match) {
      cleanJsonString = match[1].trim();
    }
    try {
      return JSON.parse(cleanJsonString);
    } catch (error) {
      console.error("خطا در پارس JSON:", error);
      throw error; // دوباره پرتاب کن تا در بلاک اصلی catch بگیرد
    }
  }

  handleTranslationLengthMismatch(translatedData, expandedTexts) {
    if (!Array.isArray(translatedData)) {
      console.error(
        "پاسخ ترجمه یک آرایه نیست.",
        "داده پارس شده:",
        translatedData
      );
      throw new Error("Translated response is not an array.");
    }

    if (translatedData.length !== expandedTexts.length) {
      console.warn(
        "عدم تطابق طول در پاسخ ترجمه شناسایی شد.",
        `طول مورد انتظار (بر اساس متن‌های گسترش‌یافته): ${expandedTexts.length}`,
        `طول دریافت شده: ${translatedData.length}`,
        "علت احتمالی: تقسیم/ادغام متفاوت متن توسط API یا افزودن/حذف آیتم‌ها.",
        "تلاش برای پردازش با داده‌های موجود ادامه می‌یابد..."
      );
    }
  }

  reassembleTranslations(
    translatedData,
    expandedTexts,
    originMapping,
    textsToTranslate,
    cachedTranslations
  ) {
    const newTranslations = new Map();
    const translatedSegmentsMap = new Map();

    const numItemsToProcess = Math.min(
      expandedTexts.length,
      translatedData.length
    );

    for (let i = 0; i < numItemsToProcess; i++) {
      const translatedItem = translatedData[i];
      const mappingInfo = originMapping[i];

      if (
        translatedItem &&
        typeof translatedItem.text === "string" &&
        mappingInfo
      ) {
        const { originalIndex } = mappingInfo;
        if (!translatedSegmentsMap.has(originalIndex)) {
          translatedSegmentsMap.set(originalIndex, []);
        }
        translatedSegmentsMap.get(originalIndex).push(translatedItem.text);
      } else {
        console.warn(
          `داده ترجمه نامعتبر یا گمشده برای آیتم در اندیس ${i}.`,
          "آیتم دریافتی:",
          translatedItem,
          "اطلاعات نگاشت:",
          mappingInfo
        );
        if (mappingInfo) {
          const { originalIndex } = mappingInfo;
          if (!translatedSegmentsMap.has(originalIndex)) {
            translatedSegmentsMap.set(originalIndex, []);
          }
          translatedSegmentsMap.get(originalIndex).push(expandedTexts[i]);
        }
      }
    }

    textsToTranslate.forEach((originalText, originalIndex) => {
      if (translatedSegmentsMap.has(originalIndex)) {
        const segments = translatedSegmentsMap.get(originalIndex);
        const reassembledText = segments.join("\n");
        newTranslations.set(originalText, reassembledText);
        translationCache.set(originalText, reassembledText);
      } else if (!cachedTranslations.has(originalText)) {
        console.warn(
          `هیچ بخش ترجمه‌ای برای متن اصلی "${originalText}" یافت نشد. از متن اصلی استفاده می‌شود.`
        );
        newTranslations.set(originalText, originalText);
      }
    });

    return newTranslations;
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
