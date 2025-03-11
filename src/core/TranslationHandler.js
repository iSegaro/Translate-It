// src/core/TranslationHandler.js
import WhatsAppStrategy from "../strategies/WhatsAppStrategy.js";
import TwitterStrategy from "../strategies/TwitterStrategy.js";
import TelegramStrategy from "../strategies/TelegramStrategy.js";
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
    this.strategies = {
      whatsapp: new WhatsAppStrategy(),
      twitter: new TwitterStrategy(),
      telegram: new TelegramStrategy(),
      chatgpt: new ChatGPTStrategy(),
      default: new DefaultStrategy(),
    };

    this.notifier = new NotificationManager();
    this.elementManager = new ElementManager();
    this.handleEvent = debounce(this.handleEvent.bind(this), 300);
    this.handleError = this.handleError.bind(this);
    this.displayedErrors = new Set();
    this.isProcessing = false; // انتقال از پراپرتی کلاس به constructor
  }

  detectPlatform(target) {
    const platformKeys = Object.keys(this.strategies).filter(
      (k) => k !== "default"
    );

    for (const platform of platformKeys) {
      const detectionMethod = `is${platform.charAt(0).toUpperCase() + platform.slice(1)}Element`;
      if (this.strategies[platform][detectionMethod]?.(target)) {
        return platform;
      }
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
      // console.log("handleTranslateEvent triggered:", event.type, event.ctrlKey);

      // if (event.type === "mouseup") {
      //   console.log("Mouseup event - event.ctrlKey:", event.ctrlKey);
      // }

      if (this.isEscapeEvent(event)) {
        this.handleEscape(event);
        return;
      }

      // console.log("handleTranslateEvent triggered:", event.type, event.ctrlKey);

      // **Handle click in selection mode**
      if (state.selectionActive && event.type === "click") {
        await this.handleSelectionClick(event);
        return;
      }

      if (this.isCtrlSlashEvent(event)) {
        await this.handleCtrlSlash(event);
        return;
      }

      // if (this.isCtrlSelectionEvent(event)) {
      //   await this.handleCtrlSelection(event);
      //   return;
      // }

      if (state.selectionActive) {
        await this.handleSelectionMode(event);
        return;
      }

      if (this.isEditableTarget(event.target)) {
        await this.handleEditableElement(event);
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Handle click event when selection mode is active
   * @param {MouseEvent} event
   */
  async handleSelectionClick(event) {
    event.stopPropagation();

    // اصلاح: استفاده از event.target به جای state.highlightedElement
    const targetElement =
      event.target.closest('[contenteditable="true"], input, textarea') ||
      document.elementFromPoint(event.clientX, event.clientY);

    if (!targetElement) {
      this.elementManager.cleanup();
      return;
    }

    const hasText = this.hasTextContent(targetElement);
    if (!hasText) {
      // this.notifier.show("المان انتخاب شده متنی ندارد", "warning");
      this.elementManager.cleanup();
      return;
    }

    try {
      // اصلاح: استفاده از المان کلیک شده
      await this.translateTextNodesInElement(targetElement);
    } catch (error) {
      this.handleError(error);
    } finally {
      this.elementManager.cleanup();
      state.selectionActive = false;
      chrome.storage.local.set({ selectionActive: false });
    }
  }

  /**
   * Check if an element contains any text nodes with content
   * @param {Element} element - The element to check
   * @returns {boolean} - True if the element contains text
   */
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

  /**
   * Translate all text nodes within an element while preserving structure
   * @param {Element} element - The element containing text nodes to translate
   */
  async translateTextNodesInElement(element) {
    try {
      const target = this.getDeepestTextNode(element);
      const walker = document.createTreeWalker(
        target,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );

      let translations = [];
      let nodes = [];

      // جمع آوری تمام متن‌ها برای ترجمه یکجا
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.textContent.trim()) {
          nodes.push(node);
          translations.push(node.textContent.trim());
        }
      }

      // ترجمه یکجا
      const translatedTexts = await Promise.all(
        translations.map((text) => translateText(text))
      );

      // اعمال ترجمه‌ها
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

  /**
   * مدیریت حالت انتخاب المان برای ترجمه
   * @param {Event} event - رویداد دریافتی
   */
  async handleSelectionMode(event) {
    if (event.type === "mouseover" || event.type === "mousemove") {
      // اصلاح: ذخیره المان زیر اشارهگر
      const newTarget = document.elementFromPoint(event.clientX, event.clientY);

      if (newTarget && newTarget !== state.highlightedElement) {
        this.elementManager.cleanup();

        if (newTarget.innerText.trim()) {
          state.highlightedElement = newTarget;
          newTarget.style.outline = CONFIG.HIGHLIGHT_STYLE;
          newTarget.style.opacity = "0.9";
        }
      }
    }
  }

  // Event type handlers
  // ====================

  /**
   * Handle Escape key press
   * @param {KeyboardEvent} event
   */
  handleEscape(event) {
    event.stopPropagation();
    state.selectionActive = false;
    this.elementManager.cleanup();
  }

  /**
   * Handle Ctrl+/ keyboard shortcut
   * @param {KeyboardEvent} event
   */
  async handleCtrlSlash(event) {
    event.preventDefault();
    event.stopPropagation();

    // بررسی فعال بودن ترجمه
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

  /**
   * Handle text selection with Ctrl key
   * @param {MouseEvent} event
   */
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

  // Core logic
  // ==========

  /**
   * Unified translation processing
   * @param {Object} params
   */
  async processTranslation(params) {
    const statusNotification = this.notifier.show("در حال ترجمه...", "status");

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
        // **ذخیره متن اصلی قبل از ترجمه برای Undo**
        state.originalTexts[params.target] = params.target.innerText;

        await this.strategies[platform].updateElement(
          params.target,
          translated
        );
        this.elementManager.applyTextDirection(params.target, translated);
      }
    } catch (error) {
      this.handleError(error);
    } finally {
      this.notifier.dismiss(statusNotification);
    }
  }

  /**
   * Revert all translations to original texts
   */
  revertTranslations() {
    console.log("Reverting translations..."); // **لاگ برای بررسی فراخوانی**
    for (const element in state.originalTexts) {
      if (state.originalTexts.hasOwnProperty(element)) {
        const originalText = state.originalTexts[element];
        const elementNode = document.querySelector(`:scope > *`); // Select first child, needs refinement for element selection
        if (elementNode) {
          elementNode.innerText = originalText; // Directly set innerText
          this.elementManager.applyTextDirection(elementNode, originalText); // Apply text direction again
        }
      }
    }
    state.originalTexts = {}; // پاک کردن حافظه Undo
    this.elementManager.cleanup(); // پاک کردن هایلایت‌ها و آیکون‌ها
    this.notifier.show("متن‌ها به حالت اولیه بازگردانده شدند.", "success"); // نمایش اعلان موفقیت
  }

  /**
   * Update target element with translated text
   * @param {HTMLElement} target
   * @param {string} translated
   */
  async updateTargetElement(target, translated) {
    const platform = this.detectPlatform(target);
    await this.strategies[platform].updateElement(target, translated);
    this.elementManager.applyTextDirection(target, translated);
  }

  /**
   * مدیریت خطاهای سیستمی و نمایش به کاربر
   * @param {Error} error - شی خطا
   */
  handleError(error) {
    // // اگر خطا مربوط به از بین رفتن context افزونه باشد، آن را نادیده بگیر
    // if (
    //   error.message &&
    //   error.message.includes("Extension context invalidated")
    // ) {
    //   return;
    // }

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
    } else if (error.message.includes("model is overloaded")) {
      message = "The model is overloaded. Please try again later.";
      type = "warning";
    } else {
      message = "خطای ارتباط با سرویس ترجمه";
      console.error("Translation Error:", error);
    }

    this.processError(message, type, onClick);
  }

  processError(message, type, onClick) {
    if (this.displayedErrors.has(message)) return;

    this.notifier.show(message, type, true, 5000, onClick); // ارسال onClick به show
    this.displayedErrors.add(message);
    setTimeout(() => {
      this.displayedErrors.delete(message);
    }, 5000);
  }

  /**
   * تشخیص کلیدهای ترکیبی Ctrl+/
   * @param {KeyboardEvent} event
   */
  isCtrlSlashEvent(event) {
    return (
      (event.ctrlKey || event.metaKey) && // پشتیبانی از Cmd در مک
      event.key === "/" &&
      !event.repeat // جلوگیری از تشخیص چندباره
    );
  }

  /**
   * تشخیص کلید Esc
   * @param {KeyboardEvent} event
   */
  isEscapeEvent(event) {
    return event.key === "Escape" && !event.repeat;
  }

  // Todo: در selection.isCollapsed مشکل وجود دارد و نیاز به بررسی بیشتر دارد
  /**
   * تشخیص انتخاب متن با Ctrl
   * @param {MouseEvent} event
   */
  isCtrlSelectionEvent(event) {
    console.log(
      "isCtrlSelectionEvent:",
      event.type,
      event.ctrlKey,
      window.getSelection().toString()
    );
    const selection = window.getSelection();

    // اصلاح عملگر مقایسه
    return (
      event.ctrlKey &&
      event.type === "selectionchange" && // اصلاح == به ===
      selection &&
      !selection.isCollapsed
    );
  }

  /**
   * تشخیص المان‌های قابل ویرایش
   * @param {HTMLElement} target
   */
  isEditableTarget(target) {
    return (
      target?.isContentEditable || // استفاده از عملگر optional chaining برای جلوگیری از خطای null/undefined
      ["INPUT", "TEXTAREA"].includes(target?.tagName) || // استفاده از عملگر optional chaining
      (target?.closest && target.closest('[contenteditable="true"]')) // **بررسی وجود target و متد closest قبل از فراخوانی**
    );
  }

  /**
   * دریافت وضعیت فعلی انتخاب و المان فعال
   */
  getSelectionContext() {
    return {
      selection: window.getSelection(),
      activeElement: document.activeElement,
    };
  }

  /**
   * جایگزینی محتوای انتخاب شده
   * @param {Range} range - محدوده انتخاب
   * @param {string} content - محتوای جایگزین
   */
  replaceSelectionContent(range, content) {
    range.deleteContents();
    range.insertNode(document.createTextNode(content));
  }

  /**
   * استخراج متن از المان فعال
   * @param {HTMLElement} element
   */
  extractFromActiveElement(element) {
    const platform = this.detectPlatform(element);
    return this.strategies[platform].extractText(element);
  }

  /**
   * پیست محتوا به المان
   * @param {HTMLElement} element
   * @param {string} content
   */
  pasteContent(element, content) {
    const platform = this.detectPlatform(element);
    this.strategies[platform].pasteContent(element, content);
  }

  /**
   * مدیریت المان‌های قابل ویرایش
   * @param {Event} event
   */
  async handleEditableElement(event) {
    event.stopPropagation();
    const target = event.target;

    if (state.activeTranslateIcon) return;
    this.elementManager.cleanup();

    const translateIcon = this.elementManager.createTranslateIcon(target);
    this.setupIconBehavior(translateIcon, target);
  }

  /**
   * تنظیم رفتار آیکون ترجمه
   * @param {HTMLElement} icon
   * @param {HTMLElement} target
   */
  setupIconBehavior(icon, target) {
    const clickHandler = async (e) => {
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
    };

    icon.addEventListener("click", clickHandler);
    document.body.appendChild(icon);
    state.activeTranslateIcon = icon;
  }

  /**
   * پردازش ترجمه برای المان‌های قابل ویرایش
   */
  async processElementTranslation(element) {
    const text =
      this.strategies[this.detectPlatform(element)].extractText(element);
    if (!text) return;

    const statusNotification = this.notifier.show("در حال ترجمه...", "status");
    try {
      const translated = await translateText(text);
      await this.updateTargetElement(element, translated);
    } finally {
      this.notifier.dismiss(statusNotification);
    }
  }

  getSelectionContext() {
    return {
      selection: window.getSelection(),
      activeElement: document.activeElement,
    };
  }

  // استفاده از debounce برای رویدادهای مکرر
  static debounce = (func, wait) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  };
}
