// src/core/EventHandler.js
import { CONFIG, state } from "../config.js";
import { translateText } from "../utils/api.js";
import {
  detectPlatform,
  detectPlatformByURL,
} from "../utils/platformDetector.js";
import { ErrorTypes } from "../services/ErrorService.js";

export default class EventHandler {
  constructor(translationHandler) {
    this.translationHandler = translationHandler;
    this.elementManager = translationHandler.elementManager;
    this.notifier = translationHandler.notifier;
    this.strategies = translationHandler.strategies;
    this.isProcessing = translationHandler.isProcessing;
    this.selectionModeActive = translationHandler.selectionModeActive;
    this.handleEvent = this.handleEvent.bind(this);
    this.handleSelectionClick = this.handleSelectionClick.bind(this);
    this.handleEscape = this.handleEscape.bind(this);
  }

  handleEditableFocus(element) {
    this.elementManager.cleanup();
    const icon = this.elementManager.createTranslateIcon(element);
    this.setupIconBehavior(icon, element);
    state.activeTranslateIcon = icon;
  }

  handleEditableBlur() {
    setTimeout(() => {
      if (!document.activeElement.isSameNode(state.activeTranslateIcon)) {
        this.elementManager.cleanup();
      }
    }, 100);
  }

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
      }
    } catch (error) {
      this.translationHandler.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "event-handling",
      });
    }
  }

  async handleSelectionClick(e) {
    const targetElement = e.target;
    const walker = document.createTreeWalker(
      targetElement,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let textNodes = [];
    let texts = [];
    let node;
    let statusNotification;

    while ((node = walker.nextNode())) {
      if (node.textContent.trim()) {
        textNodes.push(node);
        texts.push(node.textContent.trim());
      }
    }

    if (texts.length === 0) return;

    try {
      statusNotification = this.notifier.show(
        "در حال ترجمه...",
        "status",
        false
      );

      state.translationMode = "selection";

      textNodes.forEach((textNode, index) => {
        const uniqueId =
          Math.random().toString(36).substring(2, 15) +
          Math.random().toString(36).substring(2, 15);
        textNode.parentElement.setAttribute("data-original-text-id", uniqueId);

        state.originalTexts.set(uniqueId, {
          originalInnerHTML: textNode.parentElement.innerHTML,
          translatedText: "",
          parent: textNode.parentElement,
        });
        console.log(
          "handleSelectionClick: ذخیره innerHTML والد:",
          textNode.parentElement.innerHTML,
          "با شناسه:",
          uniqueId,
          "و والد:",
          textNode.parentElement
        );
      });
      console.log(
        "handleSelectionClick: وضعیت state.originalTexts بعد از ذخیره:",
        state.originalTexts
      );

      const translatedTexts = await Promise.all(texts.map(translateText));

      textNodes.forEach((textNode, index) => {
        textNode.textContent = translatedTexts[index];
        const uniqueId = textNode.parentElement.getAttribute(
          "data-original-text-id"
        );
        if (uniqueId) {
          const data = state.originalTexts.get(uniqueId);
          if (data) {
            data.translatedText = translatedTexts[index];
          }
        }

        this.elementManager.applyTextDirection(
          textNode.parentElement,
          translatedTexts[index]
        );
      });

      this.notifier.dismiss(statusNotification);
    } catch (error) {
      console.debug("Error caught in handleSelectionClick:", error);
      // بررسی دقیق‌تر برای خطاهای شبکه
      if (
        error?.type === ErrorTypes.NETWORK ||
        error?.message?.includes("Failed to fetch")
      ) {
        if (statusNotification) {
          this.notifier.dismiss(statusNotification); // حذف پیغام در صورت بروز خطا
        }
        return; // اگر خطای شبکه بود، از هندل کردن مجدد خودداری کنید
      }

      if (statusNotification) {
        this.notifier.dismiss(statusNotification); // اطمینان از حذف پیغام در صورت بروز هر خطای دیگر
      }

      // غیرفعال کردن مدیریت خطای سرویس در این سطح
      // this.translationHandler.errorHandler.handle(error, {
      //   type: ErrorTypes.SERVICE,
      //   context: "selection-translation",
      // });
    }
  }

  async handleSelectionMode(event) {
    if (event.type === "mouseover" || event.type === "mousemove") {
      const newTarget = document.elementFromPoint(event.clientX, event.clientY);

      if (newTarget && newTarget !== state.highlightedElement) {
        this.elementManager.cleanup();

        if (newTarget.innerText?.trim()) {
          state.highlightedElement = newTarget;
          newTarget.style.outline = CONFIG.HIGHLIGHT_STYLE;
          newTarget.style.opacity = "0.9";
        }
      }
    }
  }

  handleEscape(event) {
    event.stopPropagation();
    this.translationHandler.selectionModeActive = false;
    state.selectionActive = false;

    if (state.translationMode === "selection") {
      this.translationHandler.revertTranslations();
    }

    this.elementManager.cleanup();
  }

  async handleCtrlSlash(event) {
    event.preventDefault();
    event.stopPropagation();

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

      console.log(
        "handleCtrlSlash: Calling processTranslation with params.target:",
        activeElement
      );
      await this.translationHandler.processTranslation({
        text,
        originalText: text,
        target: isTextSelected ? null : activeElement,
        selectionRange: isTextSelected ? selection.getRangeAt(0) : null,
      });
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      this.translationHandler.errorHandler.handle(normalizedError, {
        type: ErrorTypes.UI,
        context: "ctrl-selection",
      });
    } finally {
      this.isProcessing = false;
    }
  }

  async handleCtrlSelection(event) {
    event.preventDefault();
    event.stopPropagation();

    try {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;

      const text = selection.toString().trim();
      if (!text) return;

      console.log(
        "handleCtrlSelection: Calling processTranslation with params.target: null (selection)"
      );
      await this.translationHandler.processTranslation({
        text,
        originalText: text,
        selectionRange: selection.getRangeAt(0),
      });
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      this.translationHandler.errorHandler.handle(normalizedError, {
        type: ErrorTypes.UI,
        context: "ctrl-selection",
      });
    } finally {
      this.isProcessing = false;
    }
  }

  async handleEditableElement(event) {
    event.stopPropagation();
    const target = event.target;

    if (state.activeTranslateIcon) return;
    this.elementManager.cleanup();

    const translateIcon = this.elementManager.createTranslateIcon(target);
    this.setupIconBehavior(translateIcon, target);
  }

  setupIconBehavior(icon, target) {
    const clickHandler = async (e) => {
      let statusNotification; // تعریف متغیر برای نگهداری شیء نوتیفیکیشن
      try {
        e.preventDefault();
        icon.remove();

        const platform = detectPlatform(target);
        const text = this.strategies[platform].extractText(target);
        if (!text) return;

        statusNotification = this.notifier.show(
          // ذخیره شیء نوتیفیکیشن
          "در حال ترجمه...",
          "status",
          false // غیرفعال کردن حذف خودکار
        );
        try {
          const translated = await translateText(text);
          await this.translationHandler.updateTargetElement(target, translated);
        } finally {
          if (statusNotification) {
            this.notifier.dismiss(statusNotification); // حذف پیغام پس از اتمام ترجمه یا بروز خطا
          }
        }
      } catch (error) {
        this.elementManager.cleanup();
        const normalizedError =
          error instanceof Error ? error : new Error(String(error));
        this.translationHandler.errorHandler.handle(normalizedError, {
          type: ErrorTypes.UI,
          context: "translate-icon-click",
          element: target,
        });
        if (statusNotification) {
          this.notifier.dismiss(statusNotification); // اطمینان از حذف پیغام در صورت بروز خطای کلی
        }
      }
    };

    icon.addEventListener("click", clickHandler);
    document.body.appendChild(icon);
    state.activeTranslateIcon = icon;
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
}
