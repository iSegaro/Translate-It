// src/core/EventHandler.js
import { CONFIG, state } from "../config.js";
import { translateText } from "../utils/api.js";
import { logMethod } from "../utils/helpers.js";
import { detectPlatform } from "../utils/platformDetector.js";
import { ErrorTypes, ErrorHandler } from "../services/ErrorService.js";

const translationCache = new Map();

export default class EventHandler {
  constructor(translationHandler) {
    this.translationHandler = translationHandler;
    this.IconManager = translationHandler.IconManager;
    this.notifier = translationHandler.notifier;
    this.strategies = translationHandler.strategies;
    this.isProcessing = translationHandler.isProcessing;
    this.selectionModeActive = translationHandler.selectionModeActive;
    this.handleEvent = this.handleEvent.bind(this);
    this.handleSelectionClick = this.handleSelectionClick.bind(this);
    this.handleEscape = this.handleEscape.bind(this);
  }

  @logMethod
  async handleEvent(event) {
    try {
      if (this.isEscapeEvent(event)) {
        this.handleEscape(event);
        return;
      }

      if (this.selectionModeActive && event.type === "click") {
        await this.handleSelectionClick(event);
        return;
      }

      if (this.isCtrlSlashEvent(event)) {
        await this.handleCtrlSlash(event);
        return;
      }

      if (this.selectionModeActive) {
        await this.handleSelectionMode(event);
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
        this.setupIconBehavior(icon, element);
        state.activeTranslateIcon = icon;
      } else {
        console.debug("EventHandler: Icon not created");
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
  async handleSelectionClick(e) {
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

      state.translationMode = "selection";

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
  async handleSelectionMode(event) {
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

    this.translationHandler.selectionModeActive = false;
    state.selectionActive = false;

    if (state.translationMode === "selection") {
      this.translationHandler.revertTranslations();
    }

    if (this.IconManager) {
      this.IconManager.cleanup();
    }
  }

  async handleCtrlSlash(event) {
    event.preventDefault();
    event.stopPropagation();

    console.debug("Handling Ctrl+/ event");

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
      const { selection, activeElement } =
        this.translationHandler.getSelectionContext();
      const isTextSelected = !selection.isCollapsed;

      const text =
        isTextSelected ?
          selection.toString().trim()
        : this.translationHandler.extractFromActiveElement(activeElement);

      if (!text) return;

      await this.translationHandler.processTranslation({
        text,
        originalText: text,
        target: isTextSelected ? null : activeElement,
        selectionRange: isTextSelected ? selection.getRangeAt(0) : null,
      });
    } catch (error) {
      error = await ErrorHandler.processError(error);
      console.debug("Ctrl+/ Error: ", error);
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
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;

      const text = selection.toString().trim();
      if (!text) return;

      await this.translationHandler.processTranslation({
        text,
        originalText: text,
        selectionRange: selection.getRangeAt(0),
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
      this.setupIconBehavior(translateIcon, target);
    }
  }

  @logMethod
  setupIconBehavior(icon, target) {
    if (!icon || !target) return;

    let isCleanedUp = false; // فلگ برای جلوگیری از پاکسازی تکراری
    let statusNotification;
    let resizeObserver;
    let mutationObserver;
    const rafIds = new Set();

    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;

      try {
        // 1. لغو فریم‌های انیمیشن
        rafIds.forEach((id) => cancelAnimationFrame(id));
        rafIds.clear();

        // 2. قطع observerها
        resizeObserver?.disconnect();
        mutationObserver?.disconnect();

        // 3. حذف event listenerها
        icon.removeEventListener("click", clickHandler);
        icon.removeEventListener("blur", handleBlur);
        target.removeEventListener("blur", handleBlur);

        // 4. حذف فیزیکی المان فقط اگر وجود دارد
        if (icon.isConnected) {
          icon.remove();
        }

        // 5. ریست وضعیت
        state.activeTranslateIcon = null;
      } catch (cleanupError) {
        this.translationHandler.errorHandler.handle(cleanupError, {
          type: ErrorTypes.UI,
          context: "icon-cleanup",
        });
      }
    };

    const clickHandler = async (e) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        // غیرفعال کردن المان قبل از حذف
        icon.style.pointerEvents = "none";
        icon?.remove();

        const platform = detectPlatform(target);
        const text = this.strategies[platform].extractText(target);
        if (!text) return;

        statusNotification = this.notifier.show(
          "در حال ترجمه...",
          "status",
          false
        );

        const translated = await translateText(text);

        if (translated) {
          await this.translationHandler.updateTargetElement(target, translated);
        } else {
          // console.debug("EventHandler: No translation result: ", translated);
        }
      } catch (error) {
        // const resolvedError = await Promise.resolve(error);
        // console.debug("setupIconBehavior: ", resolvedError);
      } finally {
        if (statusNotification) {
          this.notifier.dismiss(statusNotification);
        }
        cleanup();
      }
    };

    // 3. مدیریت رویداد blur
    const handleBlur = (e) => {
      if (
        !e.relatedTarget ||
        (e.relatedTarget !== icon && !icon.contains(e.relatedTarget))
      ) {
        // تأخیر برای جلوگیری از تداخل با کلیک
        setTimeout(cleanup, 50);
      }
    };

    const updatePosition = () => {
      if (!target.isConnected || !icon.isConnected) {
        cleanup();
        return;
      }

      const id = requestAnimationFrame(() => {
        try {
          const rect = target.getBoundingClientRect();
          if (
            !rect ||
            rect.width + rect.height === 0 ||
            rect.top < 0 ||
            rect.left < 0
          ) {
            // throw new Error("موقعیت اِلمان نامعتبر است");
          }

          icon.style.display = "block";
          icon.style.top = `${Math.round(rect.bottom + window.scrollY + 5)}px`;
          icon.style.left = `${Math.round(rect.left + window.scrollX)}px`;
        } catch (error) {
          this.translationHandler.errorHandler.handle(error, {
            type: ErrorTypes.UI,
            context: "icon-positioning",
          });
          cleanup();
        }
      });
      rafIds.add(id);
    };

    try {
      // اعتبارسنجی اولیه
      if (!(icon instanceof HTMLElement) || !icon.isConnected) {
        // throw new Error("آیکون معتبر نیست");
        console.debug("آیکون معتبر نیست");
      }

      if (!target.isConnected || !document.contains(target)) {
        // throw new Error("المان هدف در DOM وجود ندارد");
        console.debug("المان هدف در DOM وجود ندارد");
      }

      // تنظیمات اولیه موقعیت
      icon.style.display = "none";
      document.body.appendChild(icon);

      // 1. تنظیم observer برای تغییر سایز
      resizeObserver = new ResizeObserver(() => updatePosition());
      resizeObserver.observe(target);

      // 4. افزودن event listeners
      icon.addEventListener("click", clickHandler);
      target.addEventListener("blur", handleBlur);
      icon.addEventListener("blur", handleBlur);

      // 5. مشاهده تغییرات DOM
      mutationObserver = new MutationObserver((mutations) => {
        if (!document.contains(target) || !document.contains(icon)) {
          cleanup();
        }
      });
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });

      // 6. موقعیت دهی اولیه
      updatePosition();

      // 7. ثبت در state
      state.activeTranslateIcon = icon;
    } catch (error) {
      cleanup();
      this.translationHandler.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "setup-icon-behavior",
        element: target?.tagName,
      });
    }
  }
}
