// src/core/EventHandler.js
import Browser from "webextension-polyfill";
import {
  getTranslateOnTextFieldsAsync,
  getEnableShortcutForTextFieldsAsync,
  getTranslateWithSelectElementAsync,
  getTranslateOnTextSelectionAsync,
  getRequireCtrlForTextSelectionAsync,
  state,
  TranslationMode,
} from "../config.js";
import { ErrorTypes, ErrorHandler } from "../services/ErrorService.js";
import { translateText } from "../utils/api.js";
import {
  separateCachedAndNewTexts,
  collectTextNodes,
  applyTranslationsToNodes,
  revertTranslations,
  parseAndCleanTranslationResponse,
  expandTextsForTranslation,
  handleTranslationLengthMismatch,
  reassembleTranslations,
} from "../utils/textExtraction.js";
import { isEditable, logME, logMethod, taggleLinks } from "../utils/helpers.js";
import { detectPlatform, Platform } from "../utils/platformDetector.js";
import setupIconBehavior from "../managers/IconBehavior.js";
import { clearAllCaches } from "../utils/textExtraction.js";
import SelectionWindows from "../managers/SelectionWindows.js";

export default class EventHandler {
  constructor(translationHandler) {
    this.translationHandler = translationHandler;
    this.IconManager = translationHandler.IconManager;
    this.notifier = translationHandler.notifier;
    this.strategies = translationHandler.strategies;
    this.isProcessing = translationHandler.isProcessing;
    this.SelectionWindows = new SelectionWindows({
      translationHandler: translationHandler,
      notifier: translationHandler.notifier,
    });

    this.select_Element_ModeActive =
      translationHandler.select_Element_ModeActive;

    this.handleEvent = this.handleEvent.bind(this);
    this.handleSelect_ElementModeClick =
      this.handleSelect_ElementClick.bind(this);
    this.handleEscape = this.handleEscape.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);

    this.selectionTimeoutId = null; // شناسه تایمر برای تاخیر در ترجمه انتخاب متن
    this.cancelSelectionTranslation =
      this.cancelSelectionTranslation.bind(this);
  }

  @logMethod
  async handleEvent(event) {
    try {
      if (this.isEscapeEvent(event)) {
        this.handleEscape(event);
        return;
      }

      /**
       * translateWithSelectElement
       *
       * برای بررسیِ فعال بودن و یا نبودن translateWithSelectElement در اسکریپت
       * Background، جایی که کلیک روی آیکون مترجم در نوارابزار مرورگر
       * اتفاق می‌افتد مدیریت می‌شود
       */
      if (this.select_Element_ModeActive && event.type === "click") {
        await this.handleSelect_ElementClick(event);
        return;
      }

      /**
       * enableShortcutForTextFields
       *
       * بررسی فعال بودن شرتکات Ctrl+/ در اینجا انجام می‌شود
       */
      const shouldEnableShortcut = await getEnableShortcutForTextFieldsAsync();
      if (shouldEnableShortcut && this.isCtrlSlashEvent(event)) {
        await this.handleCtrlSlash(event);
        return;
      }

      /**
       * translateOnTextFields
       *
       * شرط مربوط به فعال بودن و یا نبودن translateOnTextFields
       * داخل متد handleEditableElement انجام می‌شود.
       * جایی که موقع ساخت آیکون مترجم روی فیلد متنی میخواهد پردازش
       * صورت بگیرد
       */
      if (this.isEditableTarget(event.target)) {
        await this.handleEditableElement(event);
        return;
      }

      /**
       * shouldTranslateOnTextSelection
       *
       * بررسی حالت ترجمه، "انتخاب متن" در اینجا صورت میگیرد
       * در اینجا شرط مربوط به فعال بودن و یا نبودن این سرویس
       * بررسی می شود.
       *
       * نکته:
       * بررسی رویداد mouseup بعد از انتخاب متن و چک کردن برای ماهیت فیلد بودن هدف
       **/
      const shouldTranslateOnTextSelection =
        await getTranslateOnTextSelectionAsync();
      if (shouldTranslateOnTextSelection && this.isMouseUp(event)) {
        /** requireCtrlForTextSelection
         *  در اینجا شرط مربوط به نیاز بودن به نگه‌داشتن کلید کنترل بررسی می‌شود
         */
        const requireCtrl = await getRequireCtrlForTextSelectionAsync();

        if (requireCtrl) {
          // اگر تنظیم فعال بود، چک کن آیا Ctrl همزمان فشرده شده؟
          if (this.isMouseUpCtrl(event)) {
            await this.handleMouseUp(event);
          }
          // اگر Ctrl نیاز بود ولی فشرده نشده بود، برای mouseup کاری نکن
        } else {
          // اگر تنظیم غیرفعال بود (Ctrl نیاز نبود)، مستقیم handleMouseUp را اجرا کن
          await this.handleMouseUp(event);
          // نیازی به چک کردن مجدد isMouseUp در اینجا نیست چون شرط بیرونی آن را پوشش داده
        }
        // پس از اجرای منطق mouseup یا بررسی Ctrl، از این شرط خارج شو
      }
    } catch (error) {
      error = await ErrorHandler.processError(error);
      this.translationHandler.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "event-handling",
      });
    }
  }

  isMouseUpCtrl(event) {
    return event.type === "mouseup" && (event.ctrlKey || event.metaKey);
  }

  isMouseUp(event) {
    return event.type === "mouseup";
  }

  isCtrlSlashEvent(event) {
    return (
      (event.ctrlKey || event.metaKey) && event.key === "/" && !event.repeat
    );
  }
  isEscapeEvent(event) {
    return event.key === "Escape" && !event.repeat;
  }

  _getSelectedTextWithDash() {
    const selection = window.getSelection();
    let selectedText = "";

    if (selection.rangeCount > 1) {
      for (let i = 0; i < selection.rangeCount; i++) {
        const range = selection.getRangeAt(i);
        selectedText += range.toString().trim();
        if (i < selection.rangeCount - 1) {
          // بررسی می‌کنیم که کلمه، آخرین کلمه نباشد
          selectedText += " - \n";
        }
      }
    } else {
      selectedText = selection.toString().trim();
    }

    return selectedText.trim();
  }

  @logMethod
  async handleMouseUp(event) {
    const selectedText = this._getSelectedTextWithDash();

    // اول بررسی کنیم که آیا کلیک (mouseup) داخل پاپ‌آپ موجود رخ داده؟
    // اگر بله، هیچ کاری نکنیم (نه نمایش جدید، نه بستن).
    if (
      this.SelectionWindows?.isVisible &&
      this.SelectionWindows?.displayElement?.contains(event.target)
    ) {
      // logME(
      //   "[EventHandler] MouseUp target is inside the selection window. Ignoring."
      // );
      // listener mousedown در SelectionWindows کار خودش رو کرده (stopPropagation)
      return;
    }

    if (selectedText) {
      // اگر متن انتخاب شده وجود دارد و تایمر قبلی فعال نیست
      if (!this.selectionTimeoutId) {
        this.selectionTimeoutId = setTimeout(() => {
          this.selectionTimeoutId = null; // پاک کردن شناسه تایمر بعد از اجرا
          this.processSelectedText(selectedText, event);
        }, 250);

        // اضافه کردن listener برای لغو ترجمه در صورت کلیک
        document.addEventListener("mousedown", this.cancelSelectionTranslation);
      }
    } else {
      // اگر متنی انتخاب نشده، هر تایمر فعالی را پاک کنید و listener را حذف کنید
      if (this.selectionTimeoutId) {
        clearTimeout(this.selectionTimeoutId);
        this.selectionTimeoutId = null;
        document.removeEventListener(
          "mousedown",
          this.cancelSelectionTranslation
        );
      }
      // همچنین اگر پاپ‌آپ ترجمه متن انتخاب شده باز است آن را ببندید.
      if (this.SelectionWindows?.isVisible) {
        this.SelectionWindows.dismiss();
      }
    }
  }

  cancelSelectionTranslation() {
    if (this.selectionTimeoutId) {
      clearTimeout(this.selectionTimeoutId);
      this.selectionTimeoutId = null;
      // logME("[EventHandler] ترجمه متن انتخاب شده لغو شد.");
      try {
        document.removeEventListener(
          "mousedown",
          this.cancelSelectionTranslation
        );
      } catch (error) {
        // خطا در حذف
      }
    }
  }

  async processSelectedText(selectedText, event) {
    const selection = window.getSelection();
    let position = { x: 0, y: 0 };
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      // محاسبه موقعیت زیر متن انتخاب شده
      position = {
        x: rect.left + window.scrollX,
        y: rect.bottom + window.scrollY + 15, // کمی فاصله
      };

      // --- بهبود: تنظیم موقعیت افقی برای جلوگیری از خروج از صفحه ---
      const popupMaxWidth = 300; // عرض تقریبی پاپ‌آپ (باید با استایل هماهنگ باشد)
      const viewportWidth = window.innerWidth;
      if (position.x < 10) {
        // جلوگیری از چسبیدن به لبه چپ
        position.x = 10;
      } else if (position.x + popupMaxWidth > viewportWidth - 10) {
        // جلوگیری از خروج از لبه راست
        position.x = viewportWidth - popupMaxWidth - 10;
      }
      // --- پایان بهبود موقعیت ---
    } else {
      /**
       * اگر متن همان متن قبلی است و پاپ‌آپ قابل مشاهده است، کاری نکن.
       * اجازه بده listener مربوط به mousedown تصمیم بگیرد که ببندد یا نه.
       *  */
      // logME(
      //   "[EventHandler] MouseUp on the same selected text while window is visible. Ignoring show()."
      // );
    }

    // نمایش پاپ آپ با متن و موقعیت جدید
    this.SelectionWindows?.show(selectedText, position);
    document.removeEventListener("mousedown", this.cancelSelectionTranslation); // حذف listener بعد از نمایش پاپ‌آپ
  }

  isEditableTarget(target) {
    return (
      target?.isContentEditable ||
      ["INPUT", "TEXTAREA"].includes(target?.tagName) ||
      (target?.closest && target.closest('[contenteditable="true"]'))
    );
  }
  _processEditableElement(element) {
    getTranslateOnTextFieldsAsync().then((shouldTranslateOnTextFields) => {
      if (!shouldTranslateOnTextFields) {
        return;
      }

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
          logME("[EventHandler] Icon not created");
          return null;
        }
      }
      return null;
    });
  }

  handleEditableFocus(element) {
    if (state.activeTranslateIcon) return;
    getTranslateOnTextFieldsAsync().then((shouldTranslateOnTextFields) => {
      if (!shouldTranslateOnTextFields) {
        return;
      }
      this._processEditableElement(element);
    });
  }

  async handleEditableElement(event) {
    if (state.activeTranslateIcon) return;

    event.stopPropagation();
    const target = event.target;
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

  cleanCache() {
    clearAllCaches({ state });
    this.notifier.show("حافظه پاک شد", "info", true, 2000);
    logME("حافظه پاک شد.");
  }

  @logMethod
  async handleSelect_ElementClick(e) {
    const currentPlatform = detectPlatform();
    logME(`You are on ${currentPlatform}.`);

    const targetElement = e.target;
    const { textNodes, originalTextsMap } = collectTextNodes(targetElement);

    if (originalTextsMap.size === 0)
      return { status: "empty", reason: "no_text_found" };

    const { textsToTranslate, cachedTranslations } =
      separateCachedAndNewTexts(originalTextsMap);

    if (textsToTranslate.length === 0 && cachedTranslations.size > 0) {
      applyTranslationsToNodes(textNodes, cachedTranslations, {
        state,
        IconManager: this.IconManager,
      });
      this.notifier.show("حافظه", "info", true, 2000, () => this.cleanCache());
      return {
        status: "success",
        source: "cache",
        translatedCount: cachedTranslations.size,
      };
    }

    if (textsToTranslate.length === 0) {
      return { status: "skip", reason: "no_new_texts" };
    }

    let statusNotification = null;
    try {
      statusNotification = this.notifier.show(
        "در حال ترجمه...",
        "status",
        false
      );
      state.translateMode = TranslationMode.SelectElement;

      const { expandedTexts, originMapping, originalToExpandedIndices } =
        expandTextsForTranslation(textsToTranslate);

      const jsonPayloadArray = expandedTexts.map((text) => ({ text }));
      const jsonFormatString = JSON.stringify(jsonPayloadArray);

      const maxPayloadSize = 20000;
      if (jsonFormatString.length > maxPayloadSize) {
        this.notifier.show(
          `متن انتخابی خیلی بزرگ است. ${jsonFormatString.length}`,
          "warning",
          true,
          3000
        );
        return {
          status: "error",
          reason: "payload_too_large",
          size: jsonFormatString.length,
        };
      }

      const response = await Browser.runtime.sendMessage({
        action: "fetchTranslationBackground",
        payload: {
          promptText: jsonFormatString,
          translationMode: TranslationMode.SelectElement,
        },
      });

      const translatedJsonString = response?.data?.translatedText;

      this.notifier.dismiss(statusNotification);
      statusNotification = null;

      if (translatedJsonString && typeof translatedJsonString === "string") {
        const translatedData = parseAndCleanTranslationResponse(
          translatedJsonString,
          this.translationHandler
        );

        if (!translatedData)
          return { status: "error", reason: "invalid_response" };

        const isLengthMismatch = handleTranslationLengthMismatch(
          translatedData,
          expandedTexts
        );

        if (!isLengthMismatch) {
          this.notifier.show(" دوباره امتحان کنید", "info", true, 1500);
        }

        const newTranslations = reassembleTranslations(
          translatedData,
          expandedTexts,
          originMapping,
          textsToTranslate,
          cachedTranslations
        );

        const allTranslations = new Map([
          ...cachedTranslations,
          ...newTranslations,
        ]);

        applyTranslationsToNodes(textNodes, allTranslations, {
          state,
          IconManager: this.IconManager,
        });

        return {
          status: "success",
          source: "translated",
          translatedCount: newTranslations.size,
          fromCache: cachedTranslations.size,
        };
      } else {
        if (translatedJsonString === null) {
          this.notifier.show("زبان مبدا و مقصد یکسان است.", "info", true, 2000);
          return { status: "skip", reason: "same_language" };
        }

        return { status: "error", reason: "invalid_translation_type" };
      }
    } catch (error) {
      error = await ErrorHandler.processError(error);
      await this.translationHandler.errorHandler.handle(error, {
        type: error.type || ErrorTypes.SERVICE,
        statusCode: error.statusCode,
        context: "EventHandler-handleSelect_ElementClick",
      });
      return { status: "error", reason: "exception", message: error.message };
    } finally {
      if (statusNotification) {
        this.notifier.dismiss(statusNotification);
      }
    }
  }

  handleEscape(event) {
    taggleLinks(false);

    this.cancelSelectionTranslation();

    this.SelectionWindows.cancelCurrentTranslation();

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
    logME("[EventHandler] Handling Ctrl+/ event");

    event.preventDefault();
    event.stopPropagation();

    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const { select_element, activeElement } =
        this.translationHandler.getSelectElementContext();

      if (!isEditable(activeElement)) {
        return;
      }

      /**
       * اگر متنی داخل انتخاب شده باشد، آن را برای ترجمه انتخاب میکند می کند
       * ولی منطق برنامه برای هندل کردن آن متن انتخاب شده پیاده سازی نشده است
       * این کدها را با کامنت برای آینده باقی میگذارم تا در صورت نیاز بازآوری شود
       */
      // const isTextSelected = !select_element.isCollapsed;

      // const text =
      //   isTextSelected ?
      //     select_element.toString().trim()
      //   : this.translationHandler.extractFromActiveElement(activeElement);

      // await this.translationHandler.processTranslation_with_CtrlSlash({
      //   text,
      //   originalText: text,
      //   target: isTextSelected ? null : activeElement,
      //   selectionRange: isTextSelected ? select_element.getRangeAt(0) : null,
      // });

      const text =
        this.translationHandler.extractFromActiveElement(activeElement);

      if (!text) return;

      await this.translationHandler.processTranslation_with_CtrlSlash({
        text,
        originalText: text,
        target: activeElement,
        selectionRange: null,
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
