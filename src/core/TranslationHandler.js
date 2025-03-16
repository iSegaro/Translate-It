// src/core/TranslationHandler.js
import WhatsAppStrategy from "../strategies/WhatsAppStrategy.js";
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

  handleEditableFocus(element) {
    this.eventHandler.handleEditableFocus(element);
  }

  handleEditableBlur() {
    this.eventHandler.handleEditableBlur();
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

  /**
   * Main event handler router
   */
  async handleEvent(event) {
    await this.eventHandler.handleEvent(event);
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

  //Todo: Still need some works
  async translateTextNodesInElement(element) {
    try {
      // استفاده از کل المنت به عنوان ریشه برای TreeWalker
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
      let texts = [];
      let totalLength = 0;

      while (walker.nextNode()) {
        const node = walker.currentNode;
        const trimmedText = node.textContent.trim();
        nodes.push(node);
        texts.push(trimmedText);
        totalLength += trimmedText.length;
      }

      // در صورت وجود متن بسیار زیاد
      if (totalLength > 3000) {
        this.notifier.show(
          "متن انتخابی خیلی طولانی است. لطفا محدوده کوچکتری انتخاب کنید.",
          "warning"
        );
        return;
      }

      // Todo: نیازمند بهینه سازی هستش، تا هر متن را بصورت جدا برای ترجمه ارسال نکنه
      // ترجمه تک تک text node ها به صورت جداگانه
      const translatedTexts = await Promise.all(
        texts.map((text) => translateText(text))
      );

      // جایگزینی متن‌های ترجمه‌شده در هر text node
      nodes.forEach((node, index) => {
        node.textContent = translatedTexts[index];
        this.IconManager.applyTextDirection(
          node.parentElement,
          translatedTexts[index]
        );
      });
    } catch (error) {
      console.error("Error caught in translateTextNodesInElement:", error); // اضافه کردن لاگ برای بررسی نوع خطا
      this.handleError(error);
    }
  }

  handleError(error, meta = {}) {
    const normalizedError =
      error instanceof Error ? error : new Error(String(error));
    this.errorHandler.handle(normalizedError, meta);
  }

  handleEscape(event) {
    this.eventHandler.handleEscape(event);
  }

  async handleCtrlSlash(event) {
    await this.eventHandler.handleCtrlSlash(event);
  }
  isProcessing = false;

  async handleCtrlSelection(event) {
    await this.eventHandler.handleCtrlSelection(event);
  }

  revertTranslations() {
    console.log(
      "revertTranslations: وضعیت state.originalTexts در شروع:",
      state.originalTexts
    );
    console.log("Starting revert process...");
    let successfulReverts = 0;

    for (const [uniqueId, data] of state.originalTexts.entries()) {
      // پیمایش بر روی شناسه‌های یکتا
      try {
        if (!data.parent || !data.originalInnerHTML) {
          console.warn(
            "revertTranslations: داده‌های والد یا innerHTML اصلی برای شناسه",
            uniqueId,
            "معتبر نیستند."
          );
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

        console.log(
          "revertTranslations: بازگردانی innerHTML والد با شناسه:",
          uniqueId,
          "innerHTML اصلی:",
          data.originalInnerHTML
        );

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
    console.log(
      "revertTranslations: وضعیت state.originalTexts بعد از پاکسازی:",
      state.originalTexts
    );
  }

  async updateTargetElement(target, translated) {
    try {
      const platform = detectPlatform(target);
      await this.strategies[platform].updateElement(target, translated);
      if (platform !== "medium") {
        this.IconManager.applyTextDirection(target, translated);
      }
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

  async handleEditableElement(event) {
    await this.eventHandler.handleEditableElement(event);
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

  // این تابع باید از content.js فراخوانی شود
  activateSelectionMode() {
    this.selectionModeActive = true;
    state.selectionActive = true; // همگام سازی با state.selectionActive برای سازگاری با بخش های دیگر کد
    chrome.storage.local.set({ selectionActive: true });
    this.notifier.show(
      "حالت انتخاب فعال شد. روی متن مورد نظر کلیک کنید.",
      "info"
    );
  }

  // برای غیر فعال سازی حالت انتخاب
  deactivateSelectionMode() {
    this.selectionModeActive = false;
    state.selectionActive = false;
    chrome.storage.local.set({ selectionActive: false });
    this.IconManager.cleanup(); // پاکسازی هایلایت و ...
    this.notifier.show("حالت انتخاب غیر فعال شد.", "info");
  }
}
