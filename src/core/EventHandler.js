// src/core/EventHandler.js
import { CONFIG, state } from "../config.js";
import { translateText } from "../utils/api.js";
import {
  detectPlatform,
  detectPlatformByURL,
} from "../utils/platformDetector.js";
import { ErrorTypes } from "../services/ErrorService.js";

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
    this.IconManager.cleanup();
    const icon = this.IconManager.createTranslateIcon(element);
    this.setupIconBehavior(icon, element);
    state.activeTranslateIcon = icon;
  }

  handleEditableBlur() {
    setTimeout(() => {
      if (!document.activeElement.isSameNode(state.activeTranslateIcon)) {
        this.IconManager.cleanup();
      }
    }, 100);
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

    // جداسازی متن‌های موجود در حافظه پنهان و متن‌های جدید
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
      // تمام متون از حافظه پنهان بارگیری شدند
      textNodes.forEach((textNode) => {
        const originalText = textNode.textContent.trim();
        if (cachedTranslations.has(originalText)) {
          const translatedText = cachedTranslations.get(originalText);
          const parentElement = textNode.parentElement;
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
      });
      this.notifier.show("تمام متون از حافظه پنهان بارگیری شدند.", "info");
      return;
    }

    try {
      statusNotification = this.notifier.show(
        "در حال ترجمه...",
        "status",
        false
      );

      state.translationMode = "selection";

      const delimiter = "\n\n---\n\n"; // یک جداکننده احتمالی

      // ارسال یک درخواست ترجمه برای تمام متن‌های جدید (متصل شده با جداکننده)
      const joinedTextsToTranslate = textsToTranslate.join(delimiter);
      const translatedTextsString = await translateText(joinedTextsToTranslate);

      // جدا کردن متن‌های ترجمه‌شده از پاسخ
      const translatedTextsArray = translatedTextsString.split(delimiter);

      // ایجاد نگاشت بین متن اصلی و متن ترجمه شده
      const newTranslations = new Map();
      textsToTranslate.forEach((originalText, index) => {
        const translatedText = translatedTextsArray[index];
        newTranslations.set(originalText, translatedText);
        // ذخیره در حافظه پنهان
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
          this.IconManager.applyTextDirection(parentElement, translatedText);
        }
      });

      this.notifier.dismiss(statusNotification);
    } catch (error) {
      console.debug("Error caught in handleSelectionClick:", error);
      if (
        error?.type === ErrorTypes.NETWORK ||
        error?.message?.includes("Failed to fetch")
      ) {
        if (statusNotification) {
          this.notifier.dismiss(statusNotification);
        }
        return;
      }

      if (statusNotification) {
        this.notifier.dismiss(statusNotification);
      }
    }
  }

  async handleSelectionMode(event) {
    if (event.type === "mouseover" || event.type === "mousemove") {
      const newTarget = document.elementFromPoint(event.clientX, event.clientY);

      if (newTarget && newTarget !== state.highlightedElement) {
        this.IconManager.cleanup();

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

    this.IconManager.cleanup();
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
        context: "select-element",
      });
    } finally {
      this.isProcessing = false;
    }
  }

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
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      this.translationHandler.errorHandler.handle(normalizedError, {
        type: ErrorTypes.UI,
        context: "select-element",
      });
    } finally {
      this.isProcessing = false;
    }
  }

  async handleEditableElement(event) {
    event.stopPropagation();
    const target = event.target;

    if (state.activeTranslateIcon) return;
    this.IconManager.cleanup();

    const translateIcon = this.IconManager.createTranslateIcon(target);
    this.setupIconBehavior(translateIcon, target);
  }

  setupIconBehavior(icon, target) {
    const clickHandler = async (e) => {
      let statusNotification;
      try {
        e.preventDefault();
        icon.remove();

        const platform = detectPlatform(target);
        const text = this.strategies[platform].extractText(target);
        if (!text) return;

        statusNotification = this.notifier.show(
          "در حال ترجمه...",
          "status",
          false
        );
        try {
          const translated = await translateText(text);
          await this.translationHandler.updateTargetElement(target, translated);
        } finally {
          if (statusNotification) {
            this.notifier.dismiss(statusNotification);
          }
        }
      } catch (error) {
        this.IconManager.cleanup();
        if (statusNotification) {
          this.notifier.dismiss(statusNotification);
        }
        const normalizedError =
          error instanceof Error ? error : new Error(String(error));
        this.translationHandler.errorHandler.handle(normalizedError, {
          type: ErrorTypes.UI,
          context: "translate-icon-click",
          element: target,
        });
      }
    };

    icon.addEventListener("click", clickHandler);
    document.body.appendChild(icon);
    state.activeTranslateIcon = icon;
  }
}
