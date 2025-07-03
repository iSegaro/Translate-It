// src/managers/SelectionWindows.js

import Browser from "webextension-polyfill";
import { logME, isExtensionContextValid } from "../utils/helpers";
import { ErrorTypes } from "../services/ErrorTypes.js";
import { CONFIG, TranslationMode, getThemeAsync } from "../config.js";
import { getResolvedUserTheme } from "../utils/theme.js";
import { AUTO_DETECT_VALUE } from "../utils/tts.js";
import { determineTranslationMode } from "../utils/translationModeHelper.js";
import { marked } from "marked";
import DOMPurify from "dompurify";

export default class SelectionWindows {
  constructor(options = {}) {
    this.fadeInDuration = options.fadeInDuration || 50;
    this.fadeOutDuration = options.fadeOutDuration || 125;
    this.isVisible = false;
    this.displayElement = null; // host element
    this.innerContainer = null; // content inside shadow
    this.removeMouseDownListener = null;
    this.translationHandler = options.translationHandler;
    this.notifier = options.notifier;
    this.originalText = null;
    this.isTranslationCancelled = false;
    this.themeChangeListener = null; // To store the theme change listener

    this.icon = null;
    this.iconClickContext = null;
    this.isIconMode = false; // Track current mode
    this.pendingTranslationWindow = false; // Flag to prevent immediate dismissal

    this.show = this.show.bind(this);
    this.cancelCurrentTranslation = this.cancelCurrentTranslation.bind(this);
    this._handleThemeChange = this._handleThemeChange.bind(this);
    this.onIconClick = this.onIconClick.bind(this);
    this._onOutsideClick = this._onOutsideClick.bind(this);
  }

  async _applyThemeToHost() {
    if (!this.displayElement) return;
    const storedTheme = await getThemeAsync();
    const resolvedTheme = getResolvedUserTheme(storedTheme); // Resolves 'auto' to 'light' or 'dark'
    this.displayElement.classList.remove("theme-light", "theme-dark");
    this.displayElement.classList.add(`theme-${resolvedTheme}`);
  }

  _handleThemeChange(changes) {
    if (changes.THEME && this.displayElement && this.isVisible) {
      logME(
        "[SelectionWindows] Theme changed, updating popup theme.",
        changes.THEME.newValue
      );
      this._applyThemeToHost();
    }
  }

  _addThemeChangeListener() {
    if (
      !this.themeChangeListener &&
      Browser.storage &&
      Browser.storage.onChanged
    ) {
      // Store the bound function so it can be correctly removed
      this.boundHandleThemeChange = this._handleThemeChange.bind(this);
      Browser.storage.onChanged.addListener(this.boundHandleThemeChange);
      // logME("[SelectionWindows] Theme change listener added.");
    }
  }

  _removeThemeChangeListener() {
    if (
      this.boundHandleThemeChange &&
      Browser.storage &&
      Browser.storage.onChanged
    ) {
      Browser.storage.onChanged.removeListener(this.boundHandleThemeChange);
      this.boundHandleThemeChange = null; // Clear the stored listener
      // logME("[SelectionWindows] Theme change listener removed.");
    }
  }

  async show(selectedText, position) {
    if (!isExtensionContextValid()) return;
    this.dismiss(false);
    if (!selectedText) return;

    const { selectionTranslationMode } = await Browser.storage.local.get({
      selectionTranslationMode: CONFIG.selectionTranslationMode,
    });

    if (selectionTranslationMode === "onClick") {
      this.isIconMode = true;
      this._createTranslateIcon(selectedText, position);
    } else {
      this.isIconMode = false;
      this._createTranslateWindow(selectedText, position);
    }
  }

  _createTranslateIcon(selectedText, position) {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    this.icon = document.createElement("div");
    this.icon.id = "translate-it-icon";

    const iconUrl = Browser.runtime.getURL("icons/extension_icon_32.png");

    // --- شروع تغییرات برای افزودن انیمیشن ---

    // 1. تعریف استایل‌های اولیه (حالت شروع انیمیشن)
    Object.assign(this.icon.style, {
      position: "absolute",
      zIndex: "2147483647",
      left: `${window.scrollX + rect.left + rect.width / 2 - 12}px`,
      top: `${window.scrollY + rect.bottom + 5}px`,
      width: "24px",
      height: "24px",
      backgroundColor: "#f0f0f0",
      backgroundImage: `url('${iconUrl}')`,
      backgroundSize: "16px 16px",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
      borderRadius: "50%",
      border: "1px solid #ccc",
      cursor: "pointer",
      boxShadow: "0 2px 5px rgba(0,0,0,0.2)",

      // --- ویژگی‌های انیمیشن ---
      opacity: "0", // شروع از حالت نامرئی
      transform: "scale(0.5)", // شروع از اندازه کوچک‌تر
      transformOrigin: "bottom center", // نقطه شروع بزرگ‌نمایی از پایین و وسط آیکون
      transition:
        "opacity 120ms ease-out, transform 120ms cubic-bezier(0.34, 1.56, 0.64, 1)", // انیمیشن برای شفافیت و اندازه
    });

    // 2. افزودن آیکون به صفحه
    document.body.appendChild(this.icon);

    // 3. با یک تأخیر بسیار کوتاه، استایل نهایی را اعمال کن تا انیمیشن اجرا شود
    setTimeout(() => {
      // اطمینان از اینکه آیکون هنوز در صفحه وجود دارد
      if (this.icon) {
        this.icon.style.opacity = "1";
        this.icon.style.transform = "scale(1)";
      }
    }, 10); // یک تأخیر کوتاه برای اجرای صحیح انیمیشن کافی است

    this.iconClickContext = { text: selectedText, position };
    this.icon.addEventListener("click", this.onIconClick);

    // Add outside click listener for icon dismissal
    this._addOutsideClickListener();
  }

  onIconClick(e) {
    e.preventDefault();
    e.stopPropagation();

    if (this.iconClickContext) {
      const { text, position } = this.iconClickContext;

      // ------------------- START: APPLIED CHANGE -------------------
      // 1. Immediately remove the outside click listener associated with the icon.
      //    This prevents the click that opened the window from also closing it.
      this._removeOutsideClickListener();
      // ------------------- END: APPLIED CHANGE -------------------

      // Set flag to prevent immediate dismissal during transition
      this.pendingTranslationWindow = true;

      // Clean up icon visuals.
      // The 'false' argument to _cleanupIcon means it won't try to remove the outside click listener again,
      // which is correct because we've just manually removed it.
      // This maintains compatibility with how _cleanupIcon is used elsewhere (e.g., in dismiss()).
      this._cleanupIcon(false); // Icon visuals and its specific event listeners are cleaned.

      // Create translation window
      this._createTranslateWindow(text, position);

      // Reset flag after a short delay, allowing the new window to establish its own event listeners.
      // This timeout can be experimented with if needed.
      setTimeout(() => {
        this.pendingTranslationWindow = false;
      }, 100); // Original timeout value, can be tuned if necessary
    }
  }

  async _createTranslateWindow(selectedText, position) {
    if (
      !isExtensionContextValid() ||
      !selectedText ||
      (this.isVisible && selectedText === this.originalText)
    ) {
      return;
    }

    this.originalText = selectedText;
    this.isTranslationCancelled = false;
    this.isIconMode = false; // Now in window mode

    const translationMode = determineTranslationMode(
      selectedText,
      TranslationMode.Selection
    );
    this.displayElement = document.createElement("div");
    this.displayElement.classList.add("aiwc-selection-popup-host");

    // Apply theme class to host before appending to body
    await this._applyThemeToHost();
    this._addThemeChangeListener(); // Add listener for theme changes
    this.applyInitialStyles(position);

    const shadowRoot = this.displayElement.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    if (style) {
      // CSS variables will be scoped to the shadow DOM via :host
      // These variables will be updated based on :host(.theme-light) or :host(.theme-dark)
      style.textContent = `
        :host {
          --sw-bg-color: #f8f8f8; --sw-text-color: #333; --sw-border-color: #ddd; --sw-shadow-color: rgba(0,0,0,0.1);
          --sw-original-text-color: #000; --sw-loading-dot-opacity-start: 0.3; --sw-loading-dot-opacity-mid: 0.8;
          --sw-link-color: #0066cc; font-family: Vazirmatn, "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        }
        :host(.theme-dark) {
          --sw-bg-color: #2a2a2a; --sw-text-color: #e0e0e0; --sw-border-color: #444; --sw-shadow-color: rgba(255,255,255,0.08);
          --sw-original-text-color: #fff; --sw-loading-dot-opacity-start: 0.5; --sw-loading-dot-opacity-mid: 1; --sw-link-color: #58a6ff;
        }
        .popup-container { background-color: var(--sw-bg-color); color: var(--sw-text-color); border: 1px solid var(--sw-border-color);
          border-radius: 4px; padding: 8px 12px; font-size: 14px; box-shadow: 0 2px 8px var(--sw-shadow-color); max-width: 300px; overflow-wrap: break-word;
        }
        .loading-container { display: flex; justify-content: center; align-items: center; color: var(--sw-text-color); }
        @keyframes blink { 0% { opacity: var(--sw-loading-dot-opacity-start); } 50% { opacity: var(--sw-loading-dot-opacity-mid); } 100% { opacity: var(--sw-loading-dot-opacity-start); } }
        .loading-dot { font-size: 1.2em; margin: 0 2px; animation: blink 0.7s infinite; }
        .first-line { margin-bottom: 6px; display: flex; align-items: center; }
        .original-text { font-weight: bold; margin-left: 6px; color: var(--sw-original-text-color); }
        .second-line { margin-top: 4px; }
        .tts-icon { width: 16px; height: 16px; cursor: pointer; margin-right: 6px; vertical-align: middle; }
        :host(.theme-dark) .tts-icon { filter: invert(90%) brightness(1.1); }
        .text-content a { color: var(--sw-link-color); text-decoration: none; }
        .text-content a:hover { text-decoration: underline; }
      `;
      shadowRoot.appendChild(style);
    }

    this.innerContainer = document.createElement("div");
    this.innerContainer.classList.add("popup-container");
    shadowRoot.appendChild(this.innerContainer);
    const loading = this.createLoadingDots();
    this.innerContainer.appendChild(loading);
    document.body.appendChild(this.displayElement);
    this.isVisible = true;

    requestAnimationFrame(() => {
      if (this.displayElement) {
        this.displayElement.style.opacity = "0.95";
        this.displayElement.style.transform = "scale(1)";
      }
    });

    Browser.runtime
      .sendMessage({
        action: "fetchTranslationBackground",
        payload: { promptText: selectedText, translationMode },
      })
      .then((response) => {
        if (
          this.isTranslationCancelled ||
          this.originalText !== selectedText ||
          !this.innerContainer
        )
          return;
        if (response?.success) {
          const txt = (response.data.translatedText || "").trim();
          if (!txt) throw new Error(ErrorTypes.TRANSLATION_NOT_FOUND);
          this.transitionToTranslatedText(
            txt,
            loading,
            selectedText,
            translationMode
          );
        } else {
          throw new Error(
            response?.error?.message || response?.error || ErrorTypes.SERVICE
          );
        }
      })
      .catch(async (err) => {
        if (this.isTranslationCancelled || !this.innerContainer) return;
        await this.handleTranslationError(err, loading);
      });

    // Add outside click listener after translation window is ready AND
    // pendingTranslationWindow flag is false.
    // The timeout here ensures that the click event that initiated the window creation
    // has fully propagated and won't be caught by this new listener.
    setTimeout(() => {
      // Ensure we only add the listener if the window is still supposed to be visible
      // and we are NOT in the process of transitioning (pendingTranslationWindow is false).
      if (
        this.isVisible &&
        this.displayElement &&
        !this.pendingTranslationWindow
      ) {
        this._addOutsideClickListener();
      }
    }, 150); // Slightly increased delay for robustness, can be tuned.
  }

  _onOutsideClick(e) {
    // Prevent dismissal if we're in the middle of transitioning from icon to window
    if (this.pendingTranslationWindow) {
      return;
    }

    // Handle icon mode
    if (this.isIconMode && this.icon) {
      if (!this.icon.contains(e.target)) {
        this.dismiss(true);
      }
      return;
    }

    // Handle translation window mode
    if (this.displayElement && this.isVisible) {
      // Check if the click is outside the displayElement AND not on any potential new icon
      // (though in window mode, an icon shouldn't exist simultaneously)
      const clickedIcon = document.getElementById("translate-it-icon");
      if (
        !this.displayElement.contains(e.target) &&
        (!clickedIcon || !clickedIcon.contains(e.target))
      ) {
        // Add small delay for better UX, and re-check visibility
        setTimeout(() => {
          if (
            this.isVisible &&
            !this.pendingTranslationWindow &&
            this.displayElement &&
            !this.displayElement.contains(document.activeElement)
          ) {
            this.cancelCurrentTranslation();
          }
        }, 50);
      }
    }
  }

  _addOutsideClickListener() {
    if (!isExtensionContextValid()) return;

    // Remove existing listener first
    this._removeOutsideClickListener();

    // Add new listener
    // Using 'mousedown' can sometimes be more reliable for catching clicks
    // that might be stopped by other handlers before 'click' fires.
    // However, 'click' is generally fine. We'll stick to 'click' as it was.
    document.addEventListener("click", this._onOutsideClick, { capture: true });

    // Store removal function
    this.removeMouseDownListener = () => {
      document.removeEventListener("click", this._onOutsideClick, {
        capture: true,
      });
    };
  }

  _removeOutsideClickListener() {
    if (this.removeMouseDownListener) {
      this.removeMouseDownListener();
      this.removeMouseDownListener = null;
    }
  }

  cancelCurrentTranslation() {
    this.dismiss(); // This will handle fadeOut and removal
    this.isTranslationCancelled = true;
    // this.originalText = null; // These are reset in removeElement
    // this.translatedText = null;
    this.stoptts_playing();
  }

  stoptts_playing() {
    if (isExtensionContextValid()) {
      Browser.runtime.sendMessage({ action: "stopTTS" });
    }
  }

  applyInitialStyles(position) {
    Object.assign(this.displayElement.style, {
      position: "absolute",
      zIndex: "2147483637",
      left: `${position.x}px`,
      top: `${position.y}px`,
      transform: "scale(0.1)",
      transformOrigin: "top left",
      opacity: "0",
      transition: `transform 0.1s ease-out, opacity ${this.fadeInDuration}ms ease-in-out`,
    });
  }

  createLoadingDots() {
    const container = document.createElement("div");
    container.classList.add("loading-container");
    [0, 1, 2].forEach(() => {
      const dot = document.createElement("span");
      dot.classList.add("loading-dot");
      dot.textContent = ".";
      container.appendChild(dot);
    });
    return container;
  }

  transitionToTranslatedText(
    translatedText,
    loadingContainer,
    originalText,
    trans_Mode
  ) {
    if (!this.innerContainer || !this.displayElement) return;
    if (
      loadingContainer &&
      loadingContainer.parentNode === this.innerContainer
    ) {
      loadingContainer.remove();
    }
    this.innerContainer.innerHTML = "";
    const firstLine = document.createElement("div");
    firstLine.classList.add("first-line");
    const ttsIconOriginal = this.createTTSIcon(
      originalText,
      CONFIG.SOURCE_LANGUAGE || "listen"
    );
    firstLine.appendChild(ttsIconOriginal);
    if (trans_Mode === TranslationMode.Dictionary_Translation) {
      const orig = document.createElement("span");
      orig.classList.add("original-text");
      orig.textContent = originalText;
      firstLine.appendChild(orig);
    }
    this.innerContainer.appendChild(firstLine);
    const secondLine = document.createElement("div");
    secondLine.classList.add("second-line");
    const textSpan = document.createElement("span");
    textSpan.classList.add("text-content");
    try {
      const rawHtml = marked.parse(translatedText);
      const sanitizedHtmlString = DOMPurify.sanitize(rawHtml);
      const parser = new DOMParser();
      const doc = parser.parseFromString(sanitizedHtmlString, "text/html");
      Array.from(doc.body.childNodes).forEach((node) => {
        textSpan.appendChild(node.cloneNode(true));
      });
    } catch (e) {
      logME("Error parsing markdown or sanitizing HTML:", e);
      textSpan.textContent = translatedText;
    }
    secondLine.appendChild(textSpan);
    this.applyTextDirection(secondLine, translatedText);
    this.innerContainer.appendChild(secondLine);
    requestAnimationFrame(() => {
      if (this.displayElement) {
        this.displayElement.style.transition = `opacity 0.15s ease-in-out`;
        this.displayElement.style.opacity = "0.95";
      }
    });
  }

  createTTSIcon(textToSpeak, title = "Speak") {
    const icon = document.createElement("img");
    icon.src = Browser.runtime.getURL("icons/speaker.png");
    icon.alt = title;
    icon.title = title;
    icon.classList.add("tts-icon");
    icon.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isExtensionContextValid()) {
        Browser.runtime.sendMessage({
          action: "speak",
          text: textToSpeak,
          lang: AUTO_DETECT_VALUE,
        });
      }
    });
    return icon;
  }

  async handleTranslationError(error, loadingContainer) {
    if (
      loadingContainer &&
      loadingContainer.parentNode === this.innerContainer
    ) {
      loadingContainer.remove();
    }
    if (this.innerContainer) {
      const errorMsgElement = document.createElement("div");
      errorMsgElement.textContent =
        CONFIG.ICON_ERROR + "Translation failed. Please try again.";
      errorMsgElement.style.color = "var(--sw-text-color)";
      errorMsgElement.style.padding = "5px";
      this.innerContainer.appendChild(errorMsgElement);
      setTimeout(() => this.dismiss(true), 3000);
    } else {
      this.dismiss(false);
    }
    const errObj =
      error instanceof Error ? error : (
        new Error(String(error.message || error))
      );
    await this.translationHandler.errorHandler.handle(errObj, {
      type: errObj.type || ErrorTypes.API,
      context: "selection-window-translate",
      isSilent: true,
    });
  }

  dismiss(withFadeOut = true) {
    // Ensure icon is cleaned up, including its outside click listener if active
    // _cleanupIcon is called with 'true' to ensure its outside click listener is removed IF it was active for the icon.
    // If we are dismissing from a window state, _cleanupIcon(true) will try to remove listeners,
    // which is fine (it will find no icon-specific listener if we are in window mode).
    // The main window's listener is handled by _removeOutsideClickListener directly below.
    this._cleanupIcon(true); // Cleanup icon and its listeners if any

    if (!this.displayElement || !this.isVisible) {
      // If only an icon was visible and now dismissed, ensure no lingering listeners.
      if (!this.isVisible) this._removeOutsideClickListener();
      return;
    }

    this._removeThemeChangeListener();
    this._removeOutsideClickListener(); // Specifically for the window

    this.isVisible = false;
    this.pendingTranslationWindow = false; // Reset this flag
    // this.isIconMode = false; // Reset mode, though usually handled by show() or onIconClick()

    if (withFadeOut && this.fadeOutDuration > 0 && this.displayElement) {
      this.displayElement.style.transition = `opacity ${this.fadeOutDuration}ms ease-in-out, transform 0.1s ease-in`;
      this.displayElement.style.opacity = "0";
      this.displayElement.style.transform = "scale(0.5)";
      const el = this.displayElement;
      const fallbackTimeout = setTimeout(() => {
        if (el && el.parentNode) {
          this.removeElement(el);
        }
      }, this.fadeOutDuration + 50); // A bit more than fadeOutDuration
      el.addEventListener(
        "transitionend",
        () => {
          clearTimeout(fallbackTimeout);
          this.removeElement(el);
        },
        { once: true }
      );
    } else {
      this.removeElement(this.displayElement);
    }
  }

    _cleanupIcon(removeListener = true) {
    // فقط در صورتی که آیکونی برای حذف وجود داشته باشد، ادامه بده
    if (this.icon) {
      const iconElement = this.icon; // یک رفرنس به عنصر آیکون نگه می‌داریم

      // رویداد کلیک را فوراً حذف می‌کنیم تا کاربر نتواند روی آیکونی که در حال ناپدید شدن است کلیک کند
      iconElement.removeEventListener("click", this.onIconClick);

      // --- افزودن انیمیشن ناپدید شدن ---

      // 1. با تغییر استایل، انیمیشن بازگشت (ناپدید شدن) را فعال می‌کنیم
      iconElement.style.opacity = '0';
      iconElement.style.transform = 'scale(0.5)';

      // 2. یک تایمر تنظیم می‌کنیم تا عنصر را پس از پایان انیمیشن از DOM حذف کند
      // زمان تایمر باید با زمان transition در استایل هماهنگ باشد (مثلاً 150 میلی‌ثانیه)
      setTimeout(() => {
        if (iconElement.parentNode) {
          iconElement.remove();
        }
      }, 150); // کمی بیشتر از زمان انیمیشن (120ms) برای اطمینان

      // بلافاصله this.icon را null می‌کنیم تا بقیه قسمت‌های برنامه آن را یک عنصر در حال حذف بدانند
      this.icon = null;
    }

    this.iconClickContext = null;

    // If 'removeListener' is true, and we were in icon mode, attempt to remove the listener.
    // This logic is maintained for when dismiss() calls _cleanupIcon.
    // In onIconClick, we manually remove the listener *before* calling _cleanupIcon(false).
    if (removeListener) {
      this._removeOutsideClickListener();
    }
  }

  removeElement(elementToRemove) {
    const el = elementToRemove || this.displayElement;
    if (el && el.parentNode) {
      el.remove();
    }
    if (el === this.displayElement) {
      this.displayElement = null;
      this.innerContainer = null;
      this.originalText = null;
    }
  }

  applyTextDirection(element, text) {
    if (!element) return;
    const isRtl = CONFIG.RTL_REGEX.test(text);
    element.style.direction = isRtl ? "rtl" : "ltr";
    element.style.textAlign = isRtl ? "right" : "left";
  }
}

export function dismissAllSelectionWindows() {
  logME("[SelectionWindows] Dismissing all selection windows");
  try {
    const hosts = document.querySelectorAll(".aiwc-selection-popup-host");
    hosts.forEach((host) => {
      try {
        host.remove();
      } catch (innerErr) {
        logME("[SelectionWindows] Failed to remove a host:", innerErr);
      }
    });
    const icons = document.querySelectorAll("#translate-it-icon");
    icons.forEach((icon) => icon.remove());
  } catch (err) {
    logME(
      "[SelectionWindows] Unknown error in dismissAllSelectionWindows:",
      err
    );
  }
}
