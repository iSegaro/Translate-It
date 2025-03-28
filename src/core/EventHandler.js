// src/core/EventHandler.js
import { CONFIG, state } from "../config.js";
import { ErrorTypes, ErrorHandler } from "../services/ErrorService.js";
import { translateText } from "../utils/api.js";
import { logMethod } from "../utils/helpers.js";
import { detectPlatform } from "../utils/platformDetector.js";
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

  handleEditableFocus(element) {
    if (this.IconManager) {
      this.IconManager.cleanup();
      const icon = this.IconManager.createTranslateIcon(element);
      if (icon) {
        setupIconBehavior(
          icon,
          element,
          this.translationHandler,
          this.notifier,
          this.strategies
        );
        state.activeTranslateIcon = icon;
      } else {
        console.debug("[EventHandler] Icon not created");
      }
    }
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
    const targetElement = e.target;
    const walker = document.createTreeWalker(
      targetElement,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let textNodes = [];
    const originalTextsMap = new Map(); // نگهداری متن اصلی و گره‌های مربوطه
    let node;
    let statusNotification;

    while ((node = walker.nextNode())) {
      const trimmedText = node.textContent.trim();
      if (trimmedText) {
        textNodes.push(node);
        if (originalTextsMap.has(trimmedText)) {
          originalTextsMap.get(trimmedText).push(node);
        } else {
          originalTextsMap.set(trimmedText, [node]);
        }
      }
    }

    if (originalTextsMap.size === 0) return;

    const uniqueOriginalTexts = Array.from(originalTextsMap.keys());

    // جداسازی متن‌های موجود در حافظه کش و متن‌های جدید
    const textsToTranslate = [];
    const cachedTranslations = new Map();
    uniqueOriginalTexts.forEach((text) => {
      if (translationCache.has(text)) {
        cachedTranslations.set(text, translationCache.get(text));
      } else {
        textsToTranslate.push(text);
      }
    });

    if (textsToTranslate.length === 0) {
      // تمام متون از کَش بارگیری شدند
      textNodes.forEach((textNode) => {
        const originalText = textNode.textContent.trim();
        if (cachedTranslations.has(originalText)) {
          const translatedText = cachedTranslations.get(originalText);
          const parentElement = textNode.parentElement;
          if (parentElement) {
            const uniqueId =
              Math.random().toString(36).substring(2, 15) +
              Math.random().toString(36).substring(2, 15);
            parentElement.setAttribute("data-original-text-id", uniqueId);

            state.originalTexts.set(uniqueId, {
              originalInnerHTML: parentElement.innerHTML,
              translatedText: translatedText,
              parent: parentElement,
            });
            textNode.textContent = translatedText;
            this.IconManager.applyTextDirection(
              textNode.parentElement,
              translatedText
            );
          }
        }
      });
      this.notifier.show("حافظه", "info");
      return;
    }

    try {
      statusNotification = this.notifier.show(
        "در حال ترجمه...",
        "status",
        false
      );

      state.translationMode = "select_element";

      const delimiter = "\n\n---\n\n"; // جداکننده برای اتصال متون

      // ارسال یک درخواست ترجمه برای تمام متن‌های جدید (متصل شده با جداکننده)
      const joinedTextsToTranslate = textsToTranslate.join(delimiter);
      const translatedTextsString = await translateText(joinedTextsToTranslate);
      if (translatedTextsString && typeof translatedTextsString === "string") {
        // جدا کردن متن‌های ترجمه‌شده از پاسخ
        const translatedTextsArray = translatedTextsString.split(delimiter);

        // ایجاد نگاشت بین متن اصلی و متن ترجمه شده
        const newTranslations = new Map();
        textsToTranslate.forEach((originalText, index) => {
          const translatedText = translatedTextsArray[index];
          newTranslations.set(originalText, translatedText);
          // ذخیره در حافظه کش
          translationCache.set(originalText, translatedText);
        });

        // اعمال ترجمه‌ها به گره‌های متنی و ذخیره اطلاعات برای Revert
        textNodes.forEach((textNode) => {
          const originalText = textNode.textContent.trim();
          const translatedText =
            cachedTranslations.get(originalText) ||
            newTranslations.get(originalText);

          if (translatedText) {
            const parentElement = textNode.parentElement;
            if (parentElement) {
              const uniqueId =
                Math.random().toString(36).substring(2, 15) +
                Math.random().toString(36).substring(2, 15);
              parentElement.setAttribute("data-original-text-id", uniqueId);

              state.originalTexts.set(uniqueId, {
                originalInnerHTML: parentElement.innerHTML,
                translatedText: translatedText,
                parent: parentElement,
              });

              textNode.textContent = translatedText;
              this.IconManager.applyTextDirection(
                parentElement,
                translatedText
              );
            }
          }
        });
      }

      this.notifier.dismiss(statusNotification);
    } catch (error) {
      error = await ErrorHandler.processError(error);
      if (statusNotification) {
        this.notifier.dismiss(statusNotification);
      }
      if (error.isFinal || error.suppressSecondary) {
        return;
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
    event.preventDefault();
    event.stopPropagation();

    this.translationHandler.select_Element_ModeActive = false;
    state.selectElementActive = false;

    if (state.translationMode === "select_element") {
      this.translationHandler.revertTranslations();
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

      await this.translationHandler.processTranslation({
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

  @logMethod
  async handleSelectElement(event) {
    event.preventDefault();
    event.stopPropagation();

    try {
      const select_element = window.getSelection();
      if (!select_element || select_element.isCollapsed) return;

      const text = select_element.toString().trim();
      if (!text) return;

      await this.translationHandler.processTranslation({
        text,
        originalText: text,
        selectionRange: select_element.getRangeAt(0),
      });
    } catch (error) {
      error = await ErrorHandler.processError(error);
      this.translationHandler.errorHandler.handle(
        error instanceof Error ? error : new Error(String(error)),
        {
          type: ErrorTypes.UI,
          context: "select-element",
        }
      );
    } finally {
      this.isProcessing = false;
    }
  }

  async handleEditableElement(event) {
    event.stopPropagation();
    const target = event.target;

    if (state.activeTranslateIcon) return;
    if (this.IconManager) {
      this.IconManager.cleanup();

      const translateIcon = this.IconManager.createTranslateIcon(target);
      setupIconBehavior(
        translateIcon,
        target,
        this.translationHandler,
        this.notifier,
        this.strategies
      );
    }
  }
}
