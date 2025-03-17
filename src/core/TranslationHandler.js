// src/core/TranslationHandler.js
import WhatsAppStrategy from "../strategies/WhatsAppStrategy.js";
import InstagramStrategy from "../strategies/InstagramStrategy.js";
import TwitterStrategy from "../strategies/TwitterStrategy.js";
import TelegramStrategy from "../strategies/TelegramStrategy.js";
import MediumStrategy from "../strategies/MediumStrategy.js";
import ChatGPTStrategy from "../strategies/ChatGPTStrategy.js";
import DefaultStrategy from "../strategies/DefaultStrategy.js";
import NotificationManager from "../managers/NotificationManager.js";
import IconManager from "../managers/IconManager.js";
import { debounce } from "../utils/debounce.js";
import { CONFIG, state } from "../config.js";
import { translateText } from "../utils/api.js";
import { openOptionsPage } from "../utils/helpers.js";
import {
  detectPlatform,
  getPlatformName,
  detectPlatformByURL,
} from "../utils/platformDetector.js";
import EventHandler from "./EventHandler.js";
import { ErrorHandler, ErrorTypes } from "../services/ErrorService.js";

export default class TranslationHandler {
  constructor() {
    this.errorHandler = new ErrorHandler(this.notifier);
    this.ErrorTypes = ErrorTypes;
    this.notifier = new NotificationManager();
    this.handleEvent = debounce(this.handleEvent.bind(this), 300);

    this.strategies = {
      whatsapp: new WhatsAppStrategy(this.notifier),
      instagram: new InstagramStrategy(this.notifier),
      medium: new MediumStrategy(this.notifier),
      telegram: new TelegramStrategy(this.notifier),
      twitter: new TwitterStrategy(this.notifier),
      chatgpt: new ChatGPTStrategy(),
      default: new DefaultStrategy(),
    };

    for (const [name, strategy] of Object.entries(this.strategies)) {
      if (typeof strategy.extractText !== "function") {
        console.error(`استراتژی ${name} متد extractText را ندارد!`);
      }
    }

    this.IconManager = new IconManager();
    this.displayedErrors = new Set();
    this.isProcessing = false;
    this.selectionModeActive = false;
    this.eventHandler = new EventHandler(this);

    // اعتبارسنجی استراتژی‌ها
    Object.entries(this.strategies).forEach(([name, strategy]) => {
      if (typeof strategy.extractText !== "function") {
        throw new Error(
          `استراتژی ${name} متد extractText را پیاده‌سازی نکرده است`
        );
      }
    });
  }

  /**
   * Main event handler router
   */
  async handleEvent(event) {
    await this.eventHandler.handleEvent(event);
  }

  handleError(error, meta = {}) {
    const normalizedError =
      error instanceof Error ? error : new Error(String(error));
    this.errorHandler.handle(normalizedError, meta);
  }

  handleEditableFocus(element) {
    this.eventHandler.handleEditableFocus(element);
  }

  handleEditableBlur() {
    this.eventHandler.handleEditableBlur();
  }

  handleEscape(event) {
    this.eventHandler.handleEscape(event);
  }

  async handleCtrlSlash(event) {
    await this.eventHandler.handleCtrlSlash(event);
  }

  async handleSelectElement(event) {
    await this.eventHandler.handleSelectElement(event);
  }

  async handleEditableElement(event) {
    await this.eventHandler.handleEditableElement(event);
  }

  async processTranslation(params) {
    const statusNotification = this.notifier.show("در حال ترجمه...", "status");

    try {
      const platform =
        params.target ? detectPlatform(params.target) : detectPlatformByURL();

      // تنظیم حالت ترجمه
      state.translationMode = params.selectionRange ? "selection" : "field";

      const translated = await translateText(params.text);

      if (params.selectionRange) {
        this.strategies[platform].replaceSelection(
          params.selectionRange,
          translated
        );
      } else if (params.target) {
        await this.updateTargetElement(params.target, translated);
      }
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.SERVICE,
        element: params.target,
        context: "translation-process",
      });
    } finally {
      this.notifier.dismiss(statusNotification);
    }
  }

  getDeepestTextNode(element) {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let lastTextNode;
    while (walker.nextNode()) {
      lastTextNode = walker.currentNode;
    }

    return lastTextNode?.parentElement || element;
  }

  hasTextContent(element) {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.trim()) {
        return true;
      }
    }

    return false;
  }

  async translateTextNodesInElement(element) {
    const translationCache = new Map(); // Create a cache within this module
    try {
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: function (node) {
            return node.textContent.trim() ?
                NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_SKIP;
          },
        },
        false
      );

      let nodes = [];
      const originalTextsMap = new Map();
      let totalLength = 0;

      while (walker.nextNode()) {
        const node = walker.currentNode;
        const trimmedText = node.textContent.trim();
        if (trimmedText) {
          nodes.push(node);
          totalLength += trimmedText.length;
          if (originalTextsMap.has(trimmedText)) {
            originalTextsMap.get(trimmedText).push(node);
          } else {
            originalTextsMap.set(trimmedText, [node]);
          }
        }
      }

      if (totalLength > 3000) {
        this.notifier.show(
          "متن انتخابی خیلی طولانی است. لطفا محدوده کوچکتری انتخاب کنید.",
          "warning"
        );
        return;
      }

      const uniqueOriginalTexts = Array.from(originalTextsMap.keys());

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
        nodes.forEach((node) => {
          const originalText = node.textContent.trim();
          if (cachedTranslations.has(originalText)) {
            node.textContent = cachedTranslations.get(originalText);
            this.IconManager.applyTextDirection(
              node.parentElement,
              cachedTranslations.get(originalText)
            );
          }
        });
        this.notifier.show("تمام متون از حافظه پنهان بارگیری شدند.", "info");
        return;
      }

      const translatedTextsArray = await translateText(textsToTranslate);

      const newTranslations = new Map();
      textsToTranslate.forEach((originalText, index) => {
        const translatedText = translatedTextsArray[index];
        newTranslations.set(originalText, translatedText);
        translationCache.set(originalText, translatedText);
      });

      nodes.forEach((node) => {
        const originalText = node.textContent.trim();
        const translatedText =
          cachedTranslations.get(originalText) ||
          newTranslations.get(originalText);
        if (translatedText) {
          node.textContent = translatedText;
          this.IconManager.applyTextDirection(
            node.parentElement,
            translatedText
          );
        }
      });
    } catch (error) {
      console.error("Error caught in translateTextNodesInElement:", error);
      this.handleError(error);
    }
  }

  revertTranslations() {
    // console.log(
    //   "revertTranslations: وضعیت state.originalTexts در شروع:",
    //   state.originalTexts
    // );
    console.info("TranslationHandler:Starting revert process...");
    let successfulReverts = 0;

    for (const [uniqueId, data] of state.originalTexts.entries()) {
      // پیمایش بر روی شناسه‌های یکتا
      try {
        if (!data.parent || !data.originalInnerHTML) {
          // console.warn(
          //   "revertTranslations: داده‌های والد یا innerHTML اصلی برای شناسه",
          //   uniqueId,
          //   "معتبر نیستند."
          // );
          continue;
        }

        if (!data.parent.isConnected) {
          // console.warn(
          //   "revertTranslations: عنصر والد برای شناسه",
          //   uniqueId,
          //   "دیگر به DOM متصل نیست."
          // );
          continue;
        }

        // console.log(
        //   "revertTranslations: بازگردانی innerHTML والد با شناسه:",
        //   uniqueId,
        //   "innerHTML اصلی:",
        //   data.originalInnerHTML
        // );

        // جایگزینی innerHTML
        data.parent.innerHTML = data.originalInnerHTML;

        successfulReverts++;
      } catch (error) {
        console.error(
          "revertTranslations: خطای بازگردانی innerHTML والد:",
          error
        );
      }
    }

    // نمایش نتایج
    if (successfulReverts > 0) {
      this.notifier.show(
        `${successfulReverts} متن با موفقیت بازگردانی شد`,
        "success"
      );
    } else {
      if (process.env.NODE_ENV === "development") {
        this.notifier.show("هیچ متنی برای بازگردانی یافت نشد", "warning");
      }
    }

    // پاکسازی state
    state.originalTexts.clear();
    this.IconManager.cleanup();
    // console.log(
    //   "revertTranslations: وضعیت state.originalTexts بعد از پاکسازی:",
    //   state.originalTexts
    // );
  }

  async updateTargetElement(target, translated) {
    try {
      const platform = detectPlatform(target);
      await this.strategies[platform].updateElement(target, translated);
      // if (platform !== "medium") {
      //   this.IconManager.applyTextDirection(target, translated);
      // }
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI, // Or SERVICE depending on the error
        context: "update-target-element",
        element: target,
      });
    }
  }

  getSelectionContext() {
    return {
      selection: window.getSelection(),
      activeElement: document.activeElement,
    };
  }

  replaceSelectionContent(range, content) {
    range.deleteContents();
    range.insertNode(document.createTextNode(content));
  }

  extractFromActiveElement(element) {
    const platform = detectPlatform(element);
    return this.strategies[platform].extractText(element);
  }

  pasteContent(element, content) {
    const platform = detectPlatform(element);
    this.strategies[platform].pasteContent(element, content);
  }

  async processElementTranslation(element) {
    const text = this.strategies[detectPlatform(element)].extractText(element);
    if (!text) return;

    const statusNotification = this.notifier.show("در حال ترجمه...", "status");
    console.log(
      "TranslationHandler: processElementTranslation started for text:",
      text.substring(0, 20) + "..."
    );
    try {
      const translated = await translateText(text);
      await this.updateTargetElement(element, translated);

      if (detectPlatform(element) !== "medium") {
        this.IconManager.applyTextDirection(element, translated);
      }
      console.log(
        "TranslationHandler: processElementTranslation SUCCESS for text:",
        text.substring(0, 20) + "..."
      );
    } finally {
      this.notifier.dismiss(statusNotification);
      console.log(
        "TranslationHandler: processElementTranslation FINALLY block - status notification dismissed."
      );
    }
  }
}
