// content.js
// ===================================================================
// Translation Extension - OOP and Strategy Pattern
// ===================================================================

/**
 * MAIN ARCHITECTURE:
 * 1. TranslationHandler: Central controller for event handling
 * 2. PlatformStrategy: Base class for platform-specific implementations
 * 3. NotificationManager: Dedicated notification system
 * 4. ElementManager: DOM element and state management
 *
 * DESIGN PRINCIPLES:
 * - Single Responsibility Principle
 * - Strategy Pattern for platform-specific logic
 * - Composition over Inheritance
 * - Immutable State Management
 */

/** USE_MOCK
 * Flag to control translation mode.
 * When true, uses mock translations for development
 *
 * هنگامی که true باشد از ترجمه آزمایشی استفاده می‌شود
 */
// CONFIG.USE_MOCK = true;

// Regex patterns to detect Persian characters and RTL content
const PERSIAN_REGEX =
  /^(?=.*[\u0600-\u06FF])[\u0600-\u06FF\u0660-\u0669\u06F0-\u06F9\u0041-\u005A\u0061-\u007A\u0030-\u0039\s.,:;؟!()«»@#\n\t\u200C]+$/;
const RTL_REGEX = /[\u0600-\u06FF]/;

// Initial state - State management for selection and translation icon
const state = {
  selectionActive: false,
  highlightedElement: null,
  activeTranslateIcon: null,
  originalTexts: {},
};

function openOptionsPage() {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL("options.html"));
  }
}

// ===================================================================
// Core Translation Handler
// ===================================================================
class TranslationHandler {
  constructor() {
    this.strategies = {
      whatsapp: new WhatsAppStrategy(),
      twitter: new TwitterStrategy(),
      chatgpt: new ChatGPTStrategy(),
      telegram: new TelegramStrategy(),
      default: new DefaultStrategy(),
    };
    this.notifier = new NotificationManager();
    this.elementManager = new ElementManager();
    this.handleEvent = debounce(this.handleEvent.bind(this), 300);
    this.handleError = this.handleError.bind(this);
    this.displayedErrors = new Set();
  }

  detectPlatform(target) {
    if (this.strategies.whatsapp.isWhatsAppElement(target)) return "whatsapp";
    if (this.strategies.twitter.isTwitterElement(target)) return "twitter";
    if (this.strategies.telegram.isTelegramElement(target)) return "telegram";
    if (this.strategies.chatgpt.isChatGPTElement(target)) return "chatgpt";
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
    state.selectionActive = false;

    if (!state.highlightedElement) return;

    const textToTranslate = state.highlightedElement.innerText.trim();
    if (!textToTranslate) {
      this.elementManager.cleanup(); // پاک کردن هایلایت و آیکون
      this.notifier.show("المان انتخاب شده متنی ندارد.", "warning");
      return;
    }

    const statusNotification = this.notifier.show("در حال ترجمه...", "status");
    try {
      const translatedText = await this.processTranslation({
        // **استفاده از processTranslation**
        text: textToTranslate,
        target: state.highlightedElement,
      });
    } catch (error) {
      this.handleError(error);
    } finally {
      this.notifier.dismiss(statusNotification);
      this.elementManager.cleanup(); // پاک کردن هایلایت و آیکون در هر صورت
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

      const text = isTextSelected
        ? selection.toString().trim()
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

    alert("her");

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

      if (params.selectionRange) {
        this.replaceSelectionContent(params.selectionRange, translated);
      } else if (params.target) {
        // **ذخیره متن اصلی قبل از ترجمه برای Undo**
        state.originalTexts[params.target] = params.target.innerText;
        await this.updateTargetElement(params.target, translated);
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
    let message = "خطای ناشناخته";
    let type = "error";
    let onClick; // تعریف متغیر onClick

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

    this.processError(message, type, onClick); // ارسال onClick به processError
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
    console.log("Selection collapsed:", selection.isCollapsed);

    if (event.type === "selectionchange") {
      console.log("selectionchange event - event.ctrlKey:", event.ctrlKey); // **لاگ جداگانه برای event.ctrlKey در selectionchange**
    }

    return (
      event.ctrlKey &&
      event.type == "selectionchange" &&
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

// ===================================================================
// Platform Strategies
// ===================================================================
class PlatformStrategy {
  extractText(target) {
    return target.value || target.innerText.trim();
  }

  async updateElement(element, translated) {
    // Default implementation
    element.value = translated;
    this.applyBaseStyling(element, translated);
  }

  /**
   * اعمال استایل پایه به المان
   */
  applyBaseStyling(element, translated) {
    element.style.direction = RTL_REGEX.test(translated) ? "rtl" : "ltr";
    element.style.textAlign = RTL_REGEX.test(translated) ? "right" : "left";
  }

  /**
   * پیست محتوا به المان (پیاده‌سازی پیش‌فرض)
   */
  pasteContent(element, content) {
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      element.value = content;
    } else {
      element.innerHTML = content;
    }
  }

  /**
   * تنظیم جهت متن بر اساس محتوای ترجمه شده
   * @param {HTMLElement} element
   * @param {string} translatedText
   */
  applyTextDirection(element, translatedText) {
    const isRtl = RTL_REGEX.test(translatedText);
    element.style.direction = isRtl ? "rtl" : "ltr";
    element.style.textAlign = isRtl ? "right" : "left";
  }
}

// ===================================================================
// Default Strategy (برای المان‌های معمولی)
// ===================================================================
class DefaultStrategy extends PlatformStrategy {
  /**
   * استخراج متن از المان‌های استاندارد
   * @param {HTMLElement} target - المان هدف
   * @returns {string} متن استخراج شده
   */
  extractText(target) {
    // برای input/textarea از مقدار مستقیم استفاده می‌کند
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
      return target.value.trim();
    }

    // برای contenteditable از innerText استفاده می‌کند
    return target.innerText.trim();
  }

  /**
   * بروزرسانی المان با متن ترجمه شده
   * @param {HTMLElement} element - المان هدف
   * @param {string} translatedText - متن ترجمه شده
   */
  async updateElement(element, translatedText) {
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      element.value = translatedText;
    } else {
      element.innerHTML = translatedText;
    }
    this.applyTextDirection(element, translatedText);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /**
   * پاک کردن محتوای المان قابل ویرایش
   * @param {HTMLElement} element - المان هدف
   */
  clearContent(element) {
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      element.value = "";
    } else {
      element.innerHTML = "";
    }
  }

  /**
   * اعمال جهت متن برای استراتژی پیش‌فرض
   */
  applyTextDirection(element, translatedText) {
    const isRtl = RTL_REGEX.test(translatedText);

    // برای input/textarea
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      element.setAttribute("dir", isRtl ? "rtl" : "ltr");
    }
    // برای سایر المان‌ها
    else {
      element.style.direction = isRtl ? "rtl" : "ltr";
      element.style.textAlign = isRtl ? "right" : "left";
    }
  }
}

// ===================================================================
// Telegram Strategy (برای پیام‌رسان تلگرام)
// ===================================================================
class TelegramStrategy extends PlatformStrategy {
  /**
   * شناسایی المان ویرایشگر تلگرام
   * @param {HTMLElement} target - المان هدف
   * @returns {boolean}
   */
  isTelegramElement(target) {
    return (
      target.id === "editable-message-text" || !!target.closest("[data-peer]")
    );
  }

  /**
   * شناسایی المان ویرایشگر تلگرام
   * @param {HTMLElement} target - المان هدف
   * @returns {boolean} آیا المان متعلق به تلگرام است؟
   */
  isTelegramElement(target) {
    return (
      target.id === "editable-message-text" || target.closest("[data-peer]")
    );
  }

  extractText(target) {
    if (!this.isTelegramElement(target)) return super.extractText(target);

    // استخراج متن از ساختار خاص تلگرام
    return target.innerText.trim();
  }

  async updateElement(element, translatedText) {
    if (!this.isTelegramElement(element)) return;

    // جایگزینی مستقیم محتوا با حفظ خطوط
    element.innerHTML = translatedText.replace(/\n/g, "<br>");

    // تنظیمات خاص تلگرام
    element.setAttribute("dir", RTL_REGEX.test(translatedText) ? "rtl" : "ltr");
    setCursorToEnd(element);

    // راه‌اندازی رویدادهای لازم
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

// ===================================================================
// Twitter (X) Strategy (برای توئیتر)
// ===================================================================
class TwitterStrategy extends PlatformStrategy {
  isTwitterElement(target) {
    return !!target.closest(
      '[data-testid="tweetTextarea_0"], [data-testid="tweetTextarea"], [role="textbox"]'
    );
  }

  /**
   * پاک کردن فیلد متنی از طریق ClipboardEvent
   * @param {HTMLElement} tweetField - فیلد هدف
   */
  clearTweetField(tweetField) {
    if (!tweetField) return;

    // console.log("clearTweetField called on:", tweetField); // لاگ برای بررسی فراخوانی

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(tweetField);
    selection.removeAllRanges();
    selection.addRange(range);

    const dt = new DataTransfer();
    dt.setData("text/plain", "");
    const pasteEvent = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: dt,
    });
    tweetField.dispatchEvent(pasteEvent);
    // console.log("Dispatching paste event for clearing (clearTweetField)"); // لاگ برای بررسی پاک کردن
  }

  /**
   * درج متن تمیزشده در فیلد، با استفاده از DataTransfer برای ناسازگارنشدن با Draft.js
   * @param {HTMLElement} tweetField - فیلد هدف
   * @param {string} text - متن برای پیست کردن
   */
  pasteText(tweetField, text) {
    if (!tweetField) return;

    try {
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      dt.setData("text/html", text.replace(/\n/g, "<br>"));

      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dt,
      });
      tweetField.dispatchEvent(pasteEvent);
    } catch (error) {
      // console.error("Error pasting text:", error); //نیازی به نمایش این خطا نیست
    }
  }

  /**
   * قراردادن کرسر در انتهای فیلد متنی (الگوبرداری از userscript)
   * @param {HTMLElement} tweetField - فیلد هدف
   */
  setCursorToEnd(tweetField) {
    if (!tweetField) return;

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(tweetField);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    // console.log("setCursorToEnd called"); // لاگ برای بررسی عملکرد مکان نما
  }

  async updateElement(element, translatedText) {
    const tweetField = element.closest(
      '[data-testid="tweetTextarea_0"], [role="textbox"]'
    );
    if (!tweetField) {
      console.error("Tweet field element not found in Twitter.");
      return;
    }

    tweetField.focus();
    this.clearTweetField(tweetField);
    await delay(50);

    this.pasteText(tweetField, translatedText);

    tweetField.style.transition = "background-color 0.5s ease";
    tweetField.style.backgroundColor = "#d4f8d4";
    requestAnimationFrame(() => {
      setTimeout(
        () => (tweetField.style.backgroundColor = "transparent"),
        1000
      );
    });

    await delay(100);
    this.setCursorToEnd(tweetField);
  }

  applyTextDirection(element, translatedText) {
    const paragraphs = element.querySelectorAll('[data-text="true"]');
    paragraphs.forEach((p) => {
      const isRtl = RTL_REGEX.test(p.textContent);
      p.style.direction = isRtl ? "rtl" : "ltr";
      p.style.textAlign = isRtl ? "right" : "left";
    });
  }
}

class WhatsAppStrategy extends PlatformStrategy {
  /**
   * شناسایی المان ویرایشگر واتس‌اپ
   * @param {HTMLElement} target - المان هدف
   * @returns {boolean}
   */
  isWhatsAppElement(target) {
    return !!target.closest('[aria-label="Type a message"]');
  }

  async updateElement(element, translatedText) {
    try {
      const isWhatsApp = this.isWhatsAppElement(element);
      if (!isWhatsApp) return;

      // اعتبارسنجی وجود المان در DOM
      if (!document.body.contains(element)) {
        throw new Error("Element removed from DOM");
      }

      // اعمال فوکوس با تنظیمات ایمن
      await this.safeFocus(element);

      // انتخاب تمام محتوا
      await this.selectAllContent(element);

      // پیست محتوا با شبیه‌سازی کامل
      await this.simulatePaste(element, translatedText);

      // به روزرسانی state واتس‌اپ
      this.triggerStateUpdate(element);
    } catch (error) {
      this.handleWhatsAppError(error);
    }
  }

  async safeFocus(element) {
    element.focus({ preventScroll: true });
    await delay(100);
    return element;
  }

  async selectAllContent(element) {
    document.execCommand("selectAll");
    await delay(100);
    return element;
  }

  async simulatePaste(element, text) {
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    dt.setData("text/html", text.replace(/\n/g, "<br>"));

    const pasteEvent = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: dt,
    });

    element.dispatchEvent(pasteEvent);
    await delay(50);
  }

  triggerStateUpdate(element) {
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
      })
    );
  }

  handleWhatsAppError(error) {
    this.notifier.show(`خطای واتس‌اپ: ${error.message}`, "error", true, 5000);
  }
}

class ReactIntegration {
  static forceUpdate(element) {
    if (element?._reactRootContainer) {
      const root = element._reactRootContainer._internalRoot;
      if (root) {
        root.current?.alternate?.updateQueue?.forceUpdate();
      }
    }
  }
}

class ChatGPTStrategy extends PlatformStrategy {
  /**
   * شناسایی المان ویرایشگر ChatGPT
   * @param {HTMLElement} target - المان هدف
   * @returns {boolean}
   */
  isChatGPTElement(target) {
    return target.id === "prompt-textarea";
  }

  extractText(target) {
    if (target.id === "prompt-textarea") {
      return Array.from(target.querySelectorAll("p"))
        .map((p) => p.textContent.trim())
        .join("\n");
    }
    return super.extractText(target);
  }

  async updateElement(element, translated) {
    element.innerHTML = translated.replace(/\n/g, "<br>");
    this.applyBaseStyling(element, translated);
    setCursorToEnd(element);
  }
}

// ===================================================================
// Support Classes
// ===================================================================
class NotificationManager {
  constructor() {
    this.container = this.createContainer();
    this.icons = {
      error: CONFIG.ICON_ERROR,
      success: CONFIG.ICON_SUCCESS,
      status: CONFIG.ICON_STATUS,
      warning: CONFIG.ICON_WARNING,
      info: CONFIG.ICON_INFO,
    };
  }

  getIcon(type) {
    return this.icons[type] || "💠"; // ایموجی پیش‌فرض
  }

  /**
   * Create a container for notifications if one doesn't already exist.
   */
  createContainer() {
    let container = document.getElementById("translation-notifications");
    if (!container) {
      container = document.createElement("div");
      container.id = "translation-notifications";
      Object.assign(container.style, {
        position: "fixed",
        top: "20px",
        right: "20px",
        zIndex: "10000000000",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      });
      document.body.appendChild(container);
    }
    return container;
  }

  /**
   * Displays a notification with the given text, type, and autoDismiss settings.
   * type can be "status" (translating), "error", or "success".
   * If autoDismiss=true, the notification will fade out after the specified time (in milliseconds).
   */
  show(message, type, autoDismiss = true, duration = 3000, onClick) {
    const notification = document.createElement("div");
    const icon = this.icons[type] || "";

    notification.innerHTML = `
      <span class="notification-icon">${icon}</span>
      <span class="notification-text">${message}</span>
    `;

    Object.assign(notification.style, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      background: this.getBackgroundColor(type),
      color: "#fff",
      padding: "8px 12px",
      borderRadius: "4px",
      fontSize: "14px",
      cursor: "pointer",
      opacity: "1",
    });

    if (onClick) {
      notification.addEventListener("click", onClick);
    } else {
      notification.addEventListener("click", () => this.dismiss(notification));
    }

    this.container.appendChild(notification);

    if (autoDismiss) {
      setTimeout(() => this.dismiss(notification), duration);
    }

    return notification;
  }

  getBackgroundColor(type) {
    const colors = {
      error: "rgba(255,0,0,0.8)",
      success: "rgba(0,128,0,0.8)",
      status: "rgba(0,0,0,0.7)",
      warning: "rgba(255,165,0,0.8)",
      info: "rgba(30,144,255,0.8)",
    };
    return colors[type] || "rgba(0,0,0,0.7)";
  }

  dismiss(notification) {
    fadeOut(notification);
  }
}

class ElementManager {
  // Cleanup function to reset state and remove highlights/icons
  cleanup() {
    if (state.highlightedElement) {
      if (state.highlightedElement._observer) {
        state.highlightedElement._observer.disconnect();
      }
      state.highlightedElement.style.outline = "";
      state.highlightedElement.style.opacity = "1";
      state.highlightedElement = null;
    }
    state.activeTranslateIcon?.remove();
    state.activeTranslateIcon = null;
    // Remove all remaining icons
    document.querySelectorAll(".translation-icon-extension").forEach((icon) => {
      icon.remove();
    });
  }

  /**
   * تنظیم جهت متن و تراز بر اساس محتوا
   * @param {HTMLElement} element - المان هدف
   * @param {string} text - متن ترجمه شده
   */
  applyTextDirection(element, text) {
    const isRtl = RTL_REGEX.test(text);
    element.style.direction = isRtl ? "rtl" : "ltr";
    element.style.textAlign = isRtl ? "right" : "left";

    // برای المان‌های خاص مثل input/textarea
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      element.setAttribute("dir", isRtl ? "rtl" : "ltr");
    }
  }

  /**
   * مدیریت وضعیت هایلایت المان‌ها
   */
  toggleHighlight(element) {
    if (state.highlightedElement) {
      state.highlightedElement.style.outline = "";
    }
    state.highlightedElement = element;
    element.style.outline = "2px solid #ff0000";
  }

  // ==============================
  // Create translate icon and position it relative to the target element
  // ==============================
  createTranslateIcon(target) {
    const translateIcon = document.createElement("button");
    translateIcon.classList.add("translate-icon"); // Add a specific class to avoid document click conflicts (on chat.openai.com)
    Object.assign(translateIcon.style, {
      position: "absolute",
      background: "white",
      border: "1px solid gray",
      borderRadius: "4px",
      padding: "2px 5px",
      fontSize: "12px",
      cursor: "pointer",
      zIndex: "9999999999",
      pointerEvents: "auto",
    });
    translateIcon.innerText = CONFIG.ICON_TRANSLATION;
    translateIcon.title = CONFIG.TRANSLATION_ICON_TITLE;

    // Use getBoundingClientRect with scroll adjustments
    const rect = target.getBoundingClientRect();
    translateIcon.style.top = `${rect.top + window.scrollY - 5}px`;
    translateIcon.style.left = `${
      rect.left + window.scrollX + rect.width + 5
    }px`;

    // Add pointer-events property
    translateIcon.style.pointerEvents = "auto";
    // Add a specific class for identification
    translateIcon.classList.add("translation-icon-extension");

    return translateIcon;
  }
}

// ===================================================================
// Helper Functions
// ===================================================================
function showNotification(
  message,
  type,
  autoDismiss = true,
  duration = 3000,
  onClick
) {
  notificationManager.show(message, type, autoDismiss, duration, onClick);
}
const notificationManager = new NotificationManager();

// Set cursor to the end of the content in the field
function setCursorToEnd(field) {
  if (!document.body.contains(field)) {
    console.warn("Cannot set cursor - element is detached");
    return;
  }

  const selection = window.getSelection();
  try {
    // Create a new range with the element's content
    const range = document.createRange();
    const lastChild = field.lastChild || field;

    // Set the range based on the last valid node
    if (lastChild.nodeType === Node.TEXT_NODE) {
      range.setStart(lastChild, lastChild.length);
      range.setEnd(lastChild, lastChild.length);
    } else {
      range.selectNodeContents(field);
      range.collapse(false);
    }

    // Apply the range with additional checks
    if (range.startContainer.ownerDocument === document) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  } catch (error) {
    console.error("Cursor position error:", error);
  }

  // Apply focus safely
  if (document.activeElement !== field) {
    setTimeout(() => {
      if (document.body.contains(field)) {
        field.focus({ preventScroll: true });
      }
    }, 50);
  }
}

// Debounce function to limit the rate of function calls
function debounce(func, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

// Context health check
function isExtensionContextValid() {
  try {
    return !!chrome.runtime?.id;
  } catch (e) {
    return false;
  }
}

// Translate the given text using mock or API call
async function translateText(text) {
  try {
    if (!isExtensionContextValid()) {
      // throw new Error("EXTENSION_RELOADED"); // نیازی به مدیریت خطا در اینجا نمی‌باشد
      return;
    }

    if (!text || text.length < 2) return text;

    if (CONFIG.USE_MOCK) {
      const isPersian = PERSIAN_REGEX.test(text);

      // 1. Check for explicit newline characters:
      const hasExplicitNewline = /[\r\n]+/.test(text);

      // 2. Check for HTML line breaks (<br> or <p>):
      const hasHtmlNewline = /<br\s*\/?>|<p\s*\/?>/i.test(text);

      // 3. Check for multiple spaces that might indicate a soft return (especially in contenteditable):
      const hasSoftReturn = /\s{2,}/.test(text);

      // 4. Check for newline characters after normalizing the text
      const normalizedText = text
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/&nbsp;/gi, " ");
      const hasNormalizedNewline = /[\r\n]+/.test(normalizedText);

      const hasNewLine =
        hasExplicitNewline ||
        hasHtmlNewline ||
        hasSoftReturn ||
        hasNormalizedNewline;

      const prompt = isPersian
        ? hasNewLine
          ? CONFIG.DEBUG_TRANSLATED_ENGLISH_With_NewLine
          : CONFIG.DEBUG_TRANSLATED_ENGLISH
        : hasNewLine
        ? CONFIG.DEBUG_TRANSLATED_PERSIAN_With_NewLine
        : CONFIG.DEBUG_TRANSLATED_PERSIAN;

      return `${prompt} [${text}]`;
    }

    const isPersian = PERSIAN_REGEX.test(text);
    const prompt = isPersian ? CONFIG.PROMPT_ENGLISH : CONFIG.PROMPT_PERSIAN;

    // Dynamically retrieving the API_KEY from chrome.storage
    const apiKey = await getApiKeyAsync();
    if (!apiKey) {
      CONFIG.USE_MOCK = true;
      showNotification(
        "API key is missing, Using MOCK Mode\n(Please set the API key in the extension options)",
        "warning",
        true,
        7500,
        () => {
          openOptionsPage();
        }
      );
    }
    const response = await fetch(`${CONFIG.API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt + text }] }],
      }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `Translation API error: ${
          errorData.error?.message || response.statusText
        }`
      );
    }
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || text;
  } catch (error) {
    if (error.message === "EXTENSION_RELOADED") {
      showNotification(
        "Please refresh the page (Ctrl+R)",
        "warning",
        true,
        5000
      );
    } else if (error.message.includes(" API error")) {
      return;
    } else {
      // console.error("Translation error:", error);
      showNotification(
        error.message.includes("API")
          ? error.message
          : "Error connecting to the translation service",
        "error",
        true
      );
    }
    throw error;
  }
}

// Helper to introduce a delay
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fade-out effect for notification dismissal
function fadeOut(element) {
  element.style.transition = "opacity 0.5s";
  element.style.opacity = "0";
  setTimeout(() => element.remove(), 500);
}

// Retrieve API key from storage
async function getApiKeyAsync() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["apiKey"], (result) => {
      resolve(result.apiKey || "");
    });
  });
}

// بررسی آیا المان قابل ویرایش است
const isEditable = (element) => {
  return (
    element.isContentEditable || ["INPUT", "TEXTAREA"].includes(element.tagName)
  );
};

// ===================================================================
// Event Listeners Initialization
// ===================================================================
const translationHandler = new TranslationHandler();
// مدیریت کلیه رویدادهای صفحه
const setupEventListeners = () => {
  // Event Delegation برای المان‌های داینامیک
  document.addEventListener("focus", handleFocus, true);
  document.addEventListener("blur", handleBlur, true);

  // document.addEventListener("mouseup", (e) =>
  //   translationHandler.handleEvent(e)
  // );

  document.addEventListener("selectionchange", (e) => {
    translationHandler.handleEvent(e);
  });
  document.addEventListener("click", (e) => translationHandler.handleEvent(e));
  document.addEventListener("keydown", (e) =>
    translationHandler.handleEvent(e)
  );

  // **رویداد mouseover برای هایلایت در حالت انتخاب**
  document.addEventListener("mouseover", (event) => {
    if (!state.selectionActive) return;
    translationHandler.elementManager.cleanup(); // **پاک کردن هایلایت قبلی**
    if (event.target.innerText.trim()) {
      // **بررسی وجود متن در المان**
      state.highlightedElement = event.target;
      state.highlightedElement.style.outline = CONFIG.HIGHLIGHT_STYLE;
    } else {
      state.highlightedElement = null; // **اگر متن نبود، المان هایلایت نشود**
    }
  });

  // **استفاده از رویداد selectionchange به جای mouseup برای Ctrl+Selection:**
  document.addEventListener("selectionchange", (e) => {
    translationHandler.handleEvent(e);
  });
};

// مدیریت رویداد focus برای المان‌های ویرایشی
const handleFocus = (e) => {
  if (isEditable(e.target)) {
    translationHandler.handleEditableFocus(e.target);
  }
};

// مدیریت رویداد blur برای المان‌های ویرایشی
const handleBlur = (e) => {
  if (isEditable(e.target)) {
    translationHandler.handleEditableBlur(e.target);
  }
};

// ===================================================================
// Extension Message Listener
// ===================================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  document.body.focus();
  if (message.action === "enable_selection") {
    state.selectionActive = !state.selectionActive;
    if (!state.selectionActive) {
      translationHandler.elementManager.cleanup(); // پاک کردن هایلایت وقتی حالت انتخاب غیرفعال می‌شود
    }
    translationHandler.notifier.show(
      state.selectionActive
        ? "حالت انتخاب فعال شد."
        : "حالت انتخاب غیرفعال شد.",
      "info"
    ); // نمایش اعلان وضعیت حالت انتخاب
  } else if (message.action === "revert_translation") {
    // Todo: هنوز کامل نشده است و نیاز به تکمیل دارد
    // **تشخیص پیام برای Undo**
    translationHandler.revertTranslations(); // **فراخوانی تابع Undo**
  }
});

setupEventListeners();

// ===================================================================
// Utility Functions and Polyfills
// ===================================================================
if (!Element.prototype.closest) {
  Element.prototype.closest = function (selector) {
    let el = this;
    while (el) {
      if (el.matches(selector)) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  };
}

// ===================================================================
// Initialization Checks
// ===================================================================
if (isExtensionContextValid()) {
  console.info("Extension initialized successfully");
} else {
  console.error("Extension context lost - please refresh page");
}
