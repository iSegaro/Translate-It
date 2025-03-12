// src/core/TranslationHandler.js
import WhatsAppStrategy from "../strategies/WhatsAppStrategy.js";
import TwitterStrategy from "../strategies/TwitterStrategy.js";
import TelegramStrategy from "../strategies/TelegramStrategy.js";
import MediumStrategy from "../strategies/MediumStrategy.js";
import ChatGPTStrategy from "../strategies/ChatGPTStrategy.js";
import DefaultStrategy from "../strategies/DefaultStrategy.js";
import NotificationManager from "../managers/NotificationManager.js";
import ElementManager from "../managers/ElementManager.js";
import { debounce } from "../utils/debounce.js";
import { CONFIG, state } from "../config.js";
import { translateText } from "../utils/api.js";
import { openOptionsPage } from "../utils/helpers.js";

export default class TranslationHandler {
  constructor() {
    this.notifier = new NotificationManager();

    this.strategies = {
      whatsapp: new WhatsAppStrategy(this.notifier),
      medium: new MediumStrategy(this.notifier),
      telegram: new TelegramStrategy(this.notifier),
      twitter: new TwitterStrategy(this.notifier),
      chatgpt: new ChatGPTStrategy(),
      default: new DefaultStrategy(),
    };

    this.elementManager = new ElementManager();
    this.handleEvent = debounce(this.handleEvent.bind(this), 300);
    this.handleError = this.handleError.bind(this); // Bind handleError
    this.displayedErrors = new Set();
    this.isProcessing = false;
    this.selectionModeActive = false;
  }

  detectPlatform(target) {
    const hostname = window.location.hostname.toLowerCase();
    if (hostname.includes("medium.com")) return "medium";
    if (hostname.includes("x.com")) return "twitter";
    if (hostname.includes("whatsapp.com")) return "whatsapp";
    if (hostname.includes("telegram.org")) return "telegram";
    if (hostname.includes("chat.openai.com")) return "chatgpt";

    for (const platform of Object.keys(this.strategies)) {
      const detectionMethod = `is${platform.charAt(0).toUpperCase()}${platform.slice(1)}Element`;
      if (this.strategies[platform]?.[detectionMethod]?.(target))
        return platform;
    }

    return "default";
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
   * @param {Event} event - DOM event
   */
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
        // استفاده از selectionModeActive
        await this.handleSelectionMode(event);
        return;
      }

      if (this.isEditableTarget(event.target)) {
        await this.handleEditableElement(event);
      }
    } catch (error) {
      this.handleError(error); // Use bound handleError here
    }
  }

  /**
   * Handle click event when selection mode is active
   * @param {MouseEvent} event
   */
  // در فایل TranslationHandler.js (یا هر جای مربوط به پردازش انتخاب)
  async handleSelectionClick(e) {
    const targetElement = e.target;
    const walker = document.createTreeWalker(
      targetElement,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let nodes = [];
    let texts = [];
    let node;

    // جمع‌آوری نودهای متنی و متن‌های آن‌ها
    while ((node = walker.nextNode())) {
      if (node.textContent.trim()) {
        // فقط نودهای متنی غیرخالی را در نظر بگیر
        nodes.push(node);
        texts.push(node.textContent.trim()); // trim کردن متن برای جلوگیری از ترجمه فضاهای خالی
      }
    }

    if (texts.length === 0) return; // اگر متنی برای ترجمه وجود نداشت، خارج شو

    try {
      // نمایش پیام وضعیت ترجمه
      const statusNotification = this.notifier.show(
        "در حال ترجمه...",
        "status"
      );

      // ترجمه دسته‌ای متن‌ها به صورت همزمان
      const translatedTexts = await Promise.all(
        texts.map((text) => translateText(text))
      );

      // جایگزینی متن‌های ترجمه‌شده در نودهای متنی مربوطه
      nodes.forEach((node, index) => {
        node.textContent = translatedTexts[index];
        this.elementManager.applyTextDirection(
          node.parentElement,
          translatedTexts[index]
        );
      });

      // حذف پیام وضعیت ترجمه
      this.notifier.dismiss(statusNotification);
    } catch (error) {
      this.handleError(error); // مدیریت خطا
    }
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
        this.elementManager.applyTextDirection(
          node.parentElement,
          translatedTexts[index]
        );
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  async handleSelectionMode(event) {
    if (event.type === "mouseover" || event.type === "mousemove") {
      const newTarget = document.elementFromPoint(event.clientX, event.clientY);

      if (newTarget && newTarget !== state.highlightedElement) {
        this.elementManager.cleanup();

        if (newTarget.innerText?.trim()) {
          // اطمینان از وجود متن قبل از هایلایت
          state.highlightedElement = newTarget;
          newTarget.style.outline = CONFIG.HIGHLIGHT_STYLE;
          newTarget.style.opacity = "0.9";
        }
      }
    }
  }

  handleEscape(event) {
    event.stopPropagation();
    this.selectionModeActive = false;
    state.selectionActive = false;
    this.elementManager.cleanup();
  }

  async handleCtrlSlash(event) {
    event.preventDefault();
    event.stopPropagation();

    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const { selection, activeElement } = this.getSelectionContext();
      const isTextSelected = !selection.isCollapsed;

      const text =
        isTextSelected ?
          selection.toString().trim()
        : this.extractFromActiveElement(activeElement);

      if (!text) return;

      await this.processTranslation({
        text,
        target: isTextSelected ? null : activeElement,
        selectionRange: isTextSelected ? selection.getRangeAt(0) : null,
      });
    } finally {
      this.isProcessing = false;
    }
  }
  isProcessing = false;

  async handleCtrlSelection(event) {
    event.preventDefault();
    event.stopPropagation();

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const text = selection.toString().trim();
    if (!text) return;

    await this.processTranslation({
      text,
      selectionRange: selection.getRangeAt(0),
    });
  }

  async processTranslation(params) {
    const statusNotification = this.notifier.show("در حال ترجمه...", "status");
    console.log(
      "TranslationHandler: processTranslation started for text:",
      params.text.substring(0, 20) + "..."
    );

    try {
      const translated = await translateText(params.text);

      const platform =
        params.target ? this.detectPlatform(params.target) : "default";

      if (params.selectionRange) {
        this.strategies[platform].replaceSelection(
          params.selectionRange,
          translated
        );
      } else if (params.target) {
        state.originalTexts[params.target] = params.target.innerText;

        await this.strategies[platform].updateElement(
          params.target,
          translated
        );
        if (platform !== "medium") {
          this.elementManager.applyTextDirection(params.target, translated);
        }
      }
    } catch (error) {
      this.handleError(error);
    } finally {
      this.notifier.dismiss(statusNotification);
    }
  }

  revertTranslations() {
    console.log("Reverting translations...");
    for (const element in state.originalTexts) {
      if (state.originalTexts.hasOwnProperty(element)) {
        const originalText = state.originalTexts[element];
        const elementNode = document.querySelector(`:scope > *`);
        if (elementNode) {
          elementNode.innerText = originalText;
          this.elementManager.applyTextDirection(elementNode, originalText);
        }
      }
    }
    state.originalTexts = {};
    this.elementManager.cleanup();
    this.notifier.show("متن‌ها به حالت اولیه بازگردانده شدند.", "success");
  }

  async updateTargetElement(target, translated) {
    const platform = this.detectPlatform(target);
    await this.strategies[platform].updateElement(target, translated);
    if (platform !== "medium") {
      this.elementManager.applyTextDirection(target, translated);
    }
  }

  /**
   * مدیریت خطاهای سیستمی و نمایش به کاربر
   * @param {Error} error - شی خطا
   */
  handleError(error) {
    let message = "خطای ناشناخته";
    let type = "error";
    let onClick;

    if (error.message.includes("API key")) {
      message =
        "کلید API نامعتبر است. برای تنظیم به صفحه extension options مراجعه کنید.";
      onClick = () => openOptionsPage();
    } else if (error.message === "EXTENSION_RELOADED") {
      message = "لطفا صفحه را رفرش کنید (Ctrl+R)";
      type = "warning";
    } else if (
      error.message.includes("model is overloaded") ||
      error.message.includes("size exceeded") ||
      error.message.includes("Quota exceeded")
    ) {
      message = "The model is overloaded. Please try again later.";
      type = "warning";
    } else if (error.message.includes("API key is missing")) {
      message = "API key is missing. Please set it in the extension options.";
      onClick = () => openOptionsPage();
      type = "error";
    } else {
      message = "خطای ارتباط با سرویس ترجمه";
      console.error("Translation Error:", error);
    }

    this.processError(message, type, onClick);
  }

  processError(message, type, onClick) {
    if (this.displayedErrors.has(message)) return;

    this.notifier.show(message, type, true, 5000, onClick);
    this.displayedErrors.add(message);
    setTimeout(() => {
      this.displayedErrors.delete(message);
    }, 5000);
  }

  isCtrlSlashEvent(event) {
    return (
      (event.ctrlKey || event.metaKey) && event.key === "/" && !event.repeat
    );
  }

  isEscapeEvent(event) {
    return event.key === "Escape" && !event.repeat;
  }

  isCtrlSelectionEvent(event) {
    console.log(
      "isCtrlSelectionEvent:",
      event.type,
      event.ctrlKey,
      window.getSelection().toString()
    );
    const selection = window.getSelection();

    return (
      event.ctrlKey &&
      event.type === "selectionchange" &&
      selection &&
      !selection.isCollapsed
    );
  }

  isEditableTarget(target) {
    return (
      target?.isContentEditable ||
      ["INPUT", "TEXTAREA"].includes(target?.tagName) ||
      (target?.closest && target.closest('[contenteditable="true"]'))
    );
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
    const platform = this.detectPlatform(element);
    return this.strategies[platform].extractText(element);
  }

  pasteContent(element, content) {
    const platform = this.detectPlatform(element);
    this.strategies[platform].pasteContent(element, content);
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
      try {
        e.preventDefault();
        icon.remove();

        const text =
          this.strategies[this.detectPlatform(target)].extractText(target);
        if (!text) return;

        const statusNotification = this.notifier.show(
          "در حال ترجمه...",
          "status"
        );
        try {
          const translated = await translateText(text);
          await this.updateTargetElement(target, translated);
        } finally {
          this.notifier.dismiss(statusNotification);
        }
      } catch (error) {
        this.elementManager.cleanup();
        this.handleError(error); // Use bound handleError here
      }
    };

    icon.addEventListener("click", clickHandler);
    document.body.appendChild(icon);
    state.activeTranslateIcon = icon;
  }

  async processElementTranslation(element) {
    const text =
      this.strategies[this.detectPlatform(element)].extractText(element);
    if (!text) return;

    const statusNotification = this.notifier.show("در حال ترجمه...", "status");
    console.log(
      "TranslationHandler: processElementTranslation started for text:",
      text.substring(0, 20) + "..."
    );
    try {
      const translated = await translateText(text);
      await this.updateTargetElement(element, translated);

      if (this.detectPlatform(element) !== "medium") {
        this.elementManager.applyTextDirection(element, translated);
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

  getSelectionContext() {
    return {
      selection: window.getSelection(),
      activeElement: document.activeElement,
    };
  }

  static debounce = (func, wait) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  };

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
    this.elementManager.cleanup(); // پاکسازی هایلایت و ...
    this.notifier.show("حالت انتخاب غیر فعال شد.", "info");
  }
}
