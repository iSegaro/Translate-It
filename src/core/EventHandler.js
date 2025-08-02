// src/core/EventHandler.js
import browser from "webextension-polyfill";
import {
  getRequireCtrlForTextSelectionAsync,
  state,
  TranslationMode,
  CONFIG,
  getSettingsAsync,
} from "../config.js";
import { ErrorHandler } from "../error-management/ErrorService.js";
import { ErrorTypes } from "../error-management/ErrorTypes.js";
import { storageManager } from "@/storage/core/StorageCore.js";

import {
  separateCachedAndNewTexts,
  collectTextNodes,
  applyTranslationsToNodes,
  revertTranslations,
  parseAndCleanTranslationResponse,
  expandTextsForTranslation,
  handleTranslationLengthMismatch,
  reassembleTranslations,
} from "../utils/text/extraction.js";
import { isEditable, logME, logMethod, taggleLinks } from "../utils/core/helpers.js";
import { detectPlatform, Platform } from "../utils/browser/platform.js";
import setupIconBehavior from "../managers/IconBehavior.js";
import { clearAllCaches } from "../utils/text/extraction.js";
import SelectionWindows from "../managers/content/WindowsManager.js";
import { getTranslationString } from "../utils/i18n/i18n.js";
import { isUrlExcluded_TEXT_FIELDS_ICON } from "../utils/ui/exclusion.js";
import { UnifiedMessenger } from "./UnifiedMessenger.js"; // Add this import
import { MessagingContexts } from "../messaging/core/MessagingCore.js";
import { MessageActions } from "../messaging/core/MessageActions.js";

export default class EventHandler {
  /** @param {object} translationHandler
   * @param {FeatureManager} featureManager */
  constructor(translationHandler, featureManager) {
    this.translationHandler = translationHandler;
    this.featureManager = featureManager;
    this.IconManager = translationHandler.IconManager;
    this.notifier = translationHandler.notifier;
    this.strategies = translationHandler.strategies;
    this.isProcessing = translationHandler.isProcessing;
    this.SelectionWindows = new SelectionWindows({
      translationHandler: translationHandler,
      notifier: translationHandler.notifier,
    });

    this.unifiedMessenger = new UnifiedMessenger("event-handler"); // Initialize UnifiedMessenger

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

    // Track Ctrl key state for better selection handling
    this.ctrlKeyPressed = false;
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
  }
  setFeatureManager(fm) {
    this.featureManager = fm;
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
       * رویداد keydown فقط وقتی فلگ SHORTCUT_TEXT_FIELDS روشن است ارسال می‌شود
       *
       */
      if (this.isCtrlSlashEvent(event)) {
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
       * آیکون فقط اگر فلگ TEXT_FIELDS روشن باشد
       */
      if (
        this.isEditableTarget(event.target) &&
        this.featureManager?.isOn("TEXT_FIELDS")
      ) {
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
       * mouseup فقط وقتی فلگ TEXT_SELECTION روشن است ارسال می‌شود
       *
       * نکته:
       * بررسی رویداد mouseup بعد از انتخاب متن و چک کردن برای ماهیت فیلد بودن هدف
       **/
      if (this.isMouseUp(event)) {
        /** requireCtrlForTextSelection
         * بررسی نیاز به Ctrl فقط در حالت immediate، نه onClick
         */
        const settings1 = await getSettingsAsync();
        const selectionTranslationMode =
          settings1.selectionTranslationMode || CONFIG.selectionTranslationMode;

        // فقط در حالت immediate باید Ctrl را چک کنیم
        if (selectionTranslationMode === "immediate") {
          const requireCtrl = await getRequireCtrlForTextSelectionAsync();
          if (requireCtrl && !this.isMouseUpCtrl(event)) return;
        }

        await this.handleMouseUp(event);
      }
    } catch (rawError) {
      const error = await ErrorHandler.processError(rawError);
      await this.translationHandler.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "event-handling",
        eventType: event.type,
      });
    }
  }

  isMouseUpCtrl(event) {
    return event.type === "mouseup" && (event.ctrlKey || event.metaKey);
  }

  isMouseUp(event) {
    return event.type === "mouseup";
  }

  handleKeyDown(event) {
    if (
      event.key === "Control" ||
      event.key === "Meta" ||
      event.ctrlKey ||
      event.metaKey
    ) {
      this.ctrlKeyPressed = true;
    }
  }

  handleKeyUp(event) {
    if (event.key === "Control" || event.key === "Meta") {
      // تأخیر کوتاه برای اطمینان از اینکه mouseup event پردازش شده
      setTimeout(() => {
        this.ctrlKeyPressed = false;
      }, 50);
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

  _getEventPath(event) {
    let path = event.composedPath ? event.composedPath() : [];
    if (!path || path.length === 0) {
      // ساخت مسیر به روش دستی
      let node = event.target;
      path = [];
      while (node) {
        path.push(node);
        node = node.parentNode;
      }
    }
    return path;
  }

  @logMethod
  async handleMouseUp(event) {
    const selectedText = this._getSelectedTextWithDash();
    const path = this._getEventPath(event); // استفاده از تابع fallback

    // بررسی اینکه آیا کلیک در داخل پنجره ترجمه رخ داده است یا نه
    if (
      this.SelectionWindows?.isVisible &&
      path.includes(this.SelectionWindows?.displayElement)
    ) {
      // اگر کلیک داخل پنجره اتفاق افتاده باشد، عملیات متوقف می‌شود
      // logME(
      //   "[EventHandler] MouseUp target is inside the selection windows. Ignoring."
      // );
      // listener mousedown در SelectionWindows کار خودش رو کرده (stopPropagation)
      return;
    }

    // Skip text selection handling if Vue select element mode is active
    // Check storage for Vue-based select element state
    try {
      const storage = await storageManager.get(['selectElementState']);
      if (storage.selectElementState) {
        // logME("[EventHandler] Vue select element mode is active, skipping text selection");
        return;
      }
    } catch (error) {
      // If storage check fails, continue with normal flow
      console.warn("[EventHandler] Failed to check Vue select element state:", error);
    }

    if (selectedText) {
      if (!this.selectionTimeoutId) {
        // ۱. خواندن تنظیمات حالت ترجمه برای تعیین میزان تأخیر لازم
        const settings2 = await getSettingsAsync();
        const selectionTranslationMode =
          settings2.selectionTranslationMode || CONFIG.selectionTranslationMode;

        // ۲. تعیین مقدار تأخیر بر اساس حالت انتخاب شده
        //    - برای حالت آیکون (onClick)، تأخیر کمتر (10ms)
        //    - برای حالت پنجره فوری (immediate)، تأخیر پیش‌فرض (250ms)
        const delay = selectionTranslationMode === "onClick" ? 10 : 250;

        this.selectionTimeoutId = setTimeout(() => {
          this.selectionTimeoutId = null; // پاک کردن شناسه تایمر بعد از اجرا
          this.processSelectedText(selectedText, event);
        }, delay);

        // اضافه کردن listener برای لغو ترجمه در صورت کلیک
        document.addEventListener("mousedown", this.cancelSelectionTranslation);
      }
    } else {
      const settings3 = await getSettingsAsync();
      const selectionTranslationMode =
        settings3.selectionTranslationMode || CONFIG.selectionTranslationMode;

      if (selectionTranslationMode === "onClick") {
        return;
      }

      // اگر متنی انتخاب نشده، هر تایمر فعالی را پاک کنید و listener را حذف کنید
      if (this.selectionTimeoutId) {
        clearTimeout(this.selectionTimeoutId);
        this.selectionTimeoutId = null;
        document.removeEventListener(
          "mousedown",
          this.cancelSelectionTranslation,
        );
      }

      // همچنین اگر پاپ‌آپ ترجمه متن انتخاب شده باز است آن را ببندید.
      if (this.SelectionWindows?.isVisible) {
        logME("[EventHandler] Dismis SelectionWindows handleMouseUp");
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
          this.cancelSelectionTranslation,
        );
      } catch {
        // خطا در حذف
      }
    }
  }

  async processSelectedText(selectedText) {
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
       * */
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
    /* اگر مدیریت آیکون موجود نیست و تنظیمات فعال نیست کاری نکن */
    if (!this.IconManager || !this.featureManager.isOn("EXTENSION_ENABLED"))
      return null;
    if (!this.IconManager) return null;
    if (!["http:", "https:"].includes(window.location.protocol)) {
      return null;
    }
    if (isUrlExcluded_TEXT_FIELDS_ICON(window.location.href)) {
      return null;
    }

    /* ابتدا هر آیکون قبلی را پاک کن */
    this.IconManager.cleanup();

    // TODO: Platform-specific handling for YouTube (Temporary Solution - Requires Refinement)
    /* ---- استثنای خاص یوتیوب ---- */
    if (detectPlatform() === Platform.Youtube) {
      const yt = this.strategies["youtube"];
      // Skip processing for recognized special fields on YouTube (search query or end field).
      // This is a temporary implementation and may need a more robust and scalable approach in the future.
      if (yt?.isYoutube_ExtraField?.(element)) return null; // فیلدهای سرچ و غیره
    }
    /* --------------------------------------------- */
    // TODO: End of platform-specific handling for YouTube (Temporary Solution)

    const icon = this.IconManager.createTranslateIcon(element);
    if (icon) {
      setupIconBehavior(
        icon,
        element,
        this.translationHandler,
        this.notifier,
        this.strategies,
      );
      return icon;
    }

    return null;
  }

  handleEditableFocus(element) {
    if (state.activeTranslateIcon) return;
    if (this.featureManager?.isOn("TEXT_FIELDS")) {
      this._processEditableElement(element);
    }
  }

  async handleEditableElement(event) {
    if (state.activeTranslateIcon) return;

    event.stopPropagation();
    const target = event.target;
    if (this.featureManager?.isOn("TEXT_FIELDS")) {
      this._processEditableElement(target);
    }
  }

  handleEditableBlur() {
    setTimeout(() => {
      if (
        !document.activeElement?.isConnected ||
        (document.activeElement !== state.activeTranslateIcon &&
          !document.activeElement.closest(
            ".AIWritingCompanion-translation-icon-extension",
          ))
      ) {
        this.IconManager?.cleanup();
      }
    }, 100);
  }

  async cleanCache() {
    clearAllCaches({ state });
    this.notifier.show(
      (await getTranslationString("STATUS_REMOVE_MEMORY")) || "Memory Cleared",
      "info",
      true,
      2000,
    );
  }

  @logMethod
  /* ------------------------------------------------------------------
   EventHandler.handleSelect_ElementClick
------------------------------------------------------------------ */
  async handleSelect_ElementClick(event) {
    logME("[EventHandler] handleSelect_ElementClick called.");
    // غیرفعال‌سازی حالت انتخاب المنت
    taggleLinks(false);
    this.translationHandler.select_Element_ModeActive = false;
    state.selectElementActive = false;
    if (this.IconManager) {
      this.IconManager.cleanup();
    }

    /* 1) جمع‌آوری متن‌ها از عنصرِ انتخاب‌شده */
    const targetElement = event.target;
    logME("[EventHandler] Target element:", targetElement);
    const { textNodes, originalTextsMap } = collectTextNodes(targetElement);
    logME("[EventHandler] Collected textNodes count:", textNodes.length);
    logME("[EventHandler] originalTextsMap size:", originalTextsMap.size);
    if (!originalTextsMap.size)
      return { status: "empty", reason: "no_text_found" };

    /* 2) تفکیک کش و متن‌های جدید */
    const { textsToTranslate, cachedTranslations } =
      separateCachedAndNewTexts(originalTextsMap);
    logME("[EventHandler] textsToTranslate count:", textsToTranslate.length);
    logME("[EventHandler] cachedTranslations size:", cachedTranslations.size);

    /* ـــ فقط کش ـــ */
    if (!textsToTranslate.length && cachedTranslations.size) {
      logME("[EventHandler] Using cached translations.");
      applyTranslationsToNodes(textNodes, cachedTranslations, {
        state,
        IconManager: this.IconManager,
      });
      this.notifier.show(
        (await getTranslationString("STATUS_FROM_MEMORY")) || "از حافظه",
        "info",
        true,
        2000,
        () => this.cleanCache(),
      );
      return {
        status: "success",
        source: "cache",
        translatedCount: cachedTranslations.size,
      };
    }
    /* هیچ متن جدیدی هم نیست */
    if (!textsToTranslate.length)
      return { status: "skip", reason: "no_new_texts" };

    /* 3) اعلانِ درحال‌ترجمه */

    let statusNotif = this.notifier.show(
      (await getTranslationString("STATUS_TRANSLATING_SELECT_ELEMENT")) ||
        "در حال ترجمه…",
      "status",
      false,
    );
    state.translateMode = TranslationMode.SelectElement;

    // Generate a unique messageId for this request
    const messageId = `event-handler-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

    // Create a promise that resolves when the TRANSLATION_RESULT_UPDATE message is received
    const translationResultPromise = new Promise((resolve, reject) => {
      const listener = (msg) => {
        logME(`[EventHandler] Listener received message: ${msg.action}, context: ${msg.context}, messageId: ${msg.messageId}`);
        if (msg.action === MessageActions.TRANSLATION_RESULT_UPDATE && msg.context === MessagingContexts.EVENT_HANDLER && msg.messageId === messageId) {
          logME(`[EventHandler] Matching TRANSLATION_RESULT_UPDATE received for messageId: ${messageId}`);
          browser.runtime.onMessage.removeListener(listener);
          resolve(msg);
        } else {
          logME(`[EventHandler] Non-matching message received. Expected messageId: ${messageId}, Actual: ${msg.messageId}`);
        }
      };
      browser.runtime.onMessage.addListener(listener);

      // Set a timeout for the translation result
      setTimeout(() => {
        browser.runtime.onMessage.removeListener(listener);
        reject(new Error('Translation result timeout'));
      }, 15000); // 15 seconds timeout
    });

    try {
      logME("[EventHandler] Starting translation process.");
      /* 3‑۱) فشرده‌سازی متن‌ها */
      const { expandedTexts, originMapping } =
        expandTextsForTranslation(textsToTranslate);
      logME("[EventHandler] Expanded texts count:", expandedTexts.length);

      const jsonPayload = JSON.stringify(
        expandedTexts.map((t) => ({ text: t })),
      );
      if (jsonPayload.length > 20_000) {
        const m = `متن انتخابی بسیار بزرگ است (${jsonPayload.length} بایت)`;
        this.notifier.show(m, "warning", true, 3000);
        return { status: "error", reason: "payload_large", message: m };
      }

      /* 4) درخواستِ ترجمه با fetchTranslation action (مثل sidepanel) */
      logME("[EventHandler] *** Sending fetchTranslation message to background using UnifiedMessenger...");
      
      const payload = {
        text: jsonPayload, // Send jsonPayload
        from: 'auto',
        to: 'fa',
        provider: 'google',
        messageId: messageId, // Pass messageId from EventHandler
      };
      
      logME("[EventHandler] Payload to send:", JSON.stringify(payload, null, 2));
      
      // Send the translation request
      const initialResponse = await this.unifiedMessenger.translate(payload);

      logME("[EventHandler] *** Initial response from UnifiedMessenger:", initialResponse);

      // Wait for the actual translation result
      const response = await translationResultPromise;

      logME("[EventHandler] *** Actual translation response received:", response);
      logME("[EventHandler] Response structure:", JSON.stringify(response, null, 2));
      logME("[EventHandler] Response type:", typeof response);

      /* ---------- ❶ پاسخِ خطادار ---------- */
      if (response?.error || !response?.translatedText) {
        const msg = response?.error?.message || "(⚠️ خطایی در ترجمه رخ داد.)";
        await this.translationHandler.errorHandler.handle(new Error(msg), {
          type: response?.error?.type || ErrorTypes.API,
          statusCode: response?.statusCode || 401,
          context: "select-element-response",
        });

        return { status: "error", reason: "backend_error", message: msg };
      }

      /* ---------- ❲ پاسخِ موفق ---------- */
      // Handle both TRANSLATION_RESULT_UPDATE format and regular response format
      const translatedJsonString = response?.translatedText || response?.data?.translatedText;

      if (
        typeof translatedJsonString !== "string" ||
        !translatedJsonString.trim()
      ) {
        const m = "(⚠️ ترجمه‌ای دریافت نشد.)";
        this.notifier.show(m, "warning", true, 3000);
        return { status: "error", reason: "empty_translation", message: m };
      }

      /* 5) پردازش رشتهٔ JSON ترجمه‌شده */
      const translatedData = parseAndCleanTranslationResponse(
        translatedJsonString,
        this.translationHandler,
      );
      if (!translatedData) {
        // const m = "(فرمت پاسخ نامعتبر است.)";
        await this.translationHandler.errorHandler.handle(
          new Error(ErrorTypes.API_RESPONSE_INVALID),
          { type: ErrorTypes.API, context: "select-element-response-format" },
        );
        return {
          status: "error",
          reason: "api_error",
          message: ErrorTypes.API_RESPONSE_INVALID,
        };
      }

      /* 6) تطابق طول (هشدار فقط) */
      handleTranslationLengthMismatch(translatedData, expandedTexts) ||
        this.notifier.show(
          "(طول پاسخ ناهمخوان؛ مجدداً امتحان کنید.)",
          "info",
          true,
          1500,
        );

      /* 7) چسباندن ترجمه‌ها به نودها */
      const newTranslations = reassembleTranslations(
        translatedData,
        expandedTexts,
        originMapping,
        textsToTranslate,
        cachedTranslations,
      );
      const allTranslations = new Map([
        ...cachedTranslations,
        ...newTranslations,
      ]);
      applyTranslationsToNodes(textNodes, allTranslations, {
        state,
        IconManager: this.IconManager,
      });

      if (statusNotif) {
        logME("[EventHandler] Dismissing status notification after success:", statusNotif);
        // statusNotif is a Promise, need to await it first
        const notifNode = await statusNotif;
        if (notifNode) {
          this.notifier.dismiss(notifNode);
        }
      } else {
        logME("[EventHandler] No status notification to dismiss after success");
      }

      return {
        status: "success",
        source: "translated",
        translatedCount: newTranslations.size,
        fromCache: cachedTranslations.size,
      };
    } catch (err) {
      logME("[EventHandler] Error in handleSelect_ElementClick:", err);
      const processed = await ErrorHandler.processError(err);
      await this.translationHandler.errorHandler.handle(processed, {
        type: processed.type || ErrorTypes.SERVICE,
        context: "EventHandler-handleSelect_ElementClick",
      });
      return {
        status: "error",
        reason: "exception",
        message: processed.message,
      };
    } finally {
      if (statusNotif) {
        // statusNotif is a Promise, need to await it first
        try {
          const notifNode = await statusNotif;
          if (notifNode) {
            this.notifier.dismiss(notifNode);
          }
        } catch (err) {
          logME("[EventHandler] Error dismissing notification in finally:", err);
        }
      }
    }
  }

  handleEscape() {
    // Check if NEW Vue select element manager is active
    // If so, let it handle ESC key instead of OLD system
    if (window.translateItNewSelectManager === true) {
      console.log(
        "[EventHandler] NEW select manager is active, skipping OLD ESC handling",
      );
      return;
    }

    taggleLinks(false);

    this.cancelSelectionTranslation();

    this.SelectionWindows.cancelCurrentTranslation();

    this.translationHandler.select_Element_ModeActive = false;
    state.selectElementActive = false;

    // Reset Ctrl key state
    this.ctrlKeyPressed = false;

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
    // logME("[EventHandler] Handling Ctrl+/ event");

    event.preventDefault();
    event.stopPropagation();

    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const { activeElement } =
        this.translationHandler.getSelectElementContext();

      if (!isEditable(activeElement)) return;

      const text =
        this.translationHandler.extractFromActiveElement(activeElement);

      if (!text) return;

      /**
       * اگر متنی داخل انتخاب شده باشد، آن را برای ترجمه انتخاب میکند می کند
       * ولی منطق برنامه برای هندل کردن آن متن انتخاب شده پیاده سازی نشده است
       * این کدها را با کامنت برای آینده باقیگذارم تا در صورت نیاز بازآوری شود
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

      // پارامتر کامل با target و range
      await this.translationHandler.processTranslation_with_CtrlSlash({
        text,
        originalText: text,
        target: activeElement,
        selectionRange: null, // چون با Ctrl+/ اجرا شده
      });
    } catch (error) {
      const errorHandle = await ErrorHandler.processError(error);
      logME("[EventHandler] Ctrl+/ Error: ", errorHandle);

      if (errorHandle.isFinal) return;

      if (!errorHandle.originalError?.isPrimary) {
        const errorType = errorHandle.type || ErrorTypes.API;
        const statusCode = errorHandle.statusCode || 500;

        this.translationHandler.errorHandler.handle(errorHandle, {
          type: errorType,
          statusCode: statusCode,
          context: "ctrl-slash",
          suppressSecondary: true,
        });
      }
    } finally {
      this.isProcessing = false;
    }
  }
}
