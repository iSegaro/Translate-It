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

    this.show = this.show.bind(this);
    this.cancelCurrentTranslation = this.cancelCurrentTranslation.bind(this);
    this._handleThemeChange = this._handleThemeChange.bind(this);
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
      logME("[SelectionWindows] Theme changed, updating popup theme.", changes.THEME.newValue);
      this._applyThemeToHost();
    }
  }

  _addThemeChangeListener() {
    if (!this.themeChangeListener && Browser.storage && Browser.storage.onChanged) {
      // Store the bound function so it can be correctly removed
      this.boundHandleThemeChange = this._handleThemeChange.bind(this);
      Browser.storage.onChanged.addListener(this.boundHandleThemeChange);
      // logME("[SelectionWindows] Theme change listener added.");
    }
  }

  _removeThemeChangeListener() {
    if (this.boundHandleThemeChange && Browser.storage && Browser.storage.onChanged) {
      Browser.storage.onChanged.removeListener(this.boundHandleThemeChange);
      this.boundHandleThemeChange = null; // Clear the stored listener
      // logME("[SelectionWindows] Theme change listener removed.");
    }
  }

  async show(selectedText, position) {
    if (!isExtensionContextValid()) {
      const err = new Error(ErrorTypes.CONTEXT);
      err.type = ErrorTypes.CONTEXT;
      return await this.translationHandler.errorHandler.handle(err, {
        type: ErrorTypes.CONTEXT,
        context: "SelectionWindows-show-context",
        statusCode: "context-invalid",
      });
    }

    if (
      !selectedText ||
      (this.isVisible && selectedText === this.originalText)
    ) {
      return;
    }

    this.dismiss(false); // Dismiss any existing popup immediately
    this.originalText = selectedText;
    this.isTranslationCancelled = false;

    const translationMode = determineTranslationMode(
      selectedText,
      TranslationMode.Selection // Default mode for selection popup
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
          --sw-bg-color: #f8f8f8; /* Default light theme background */
          --sw-text-color: #333; /* Default light theme text */
          --sw-border-color: #ddd; /* Default light theme border */
          --sw-shadow-color: rgba(0,0,0,0.1);
          --sw-original-text-color: #000;
          --sw-loading-dot-opacity-start: 0.3;
          --sw-loading-dot-opacity-mid: 0.8;
          --sw-link-color: #0066cc;
          font-family: Vazirmatn, "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        }

        :host(.theme-dark) {
          --sw-bg-color: #2a2a2a; /* Dark theme background */
          --sw-text-color: #e0e0e0; /* Dark theme text */
          --sw-border-color: #444; /* Dark theme border */
          --sw-shadow-color: rgba(255,255,255,0.08); /* Lighter shadow for dark theme */
          --sw-original-text-color: #fff;
          --sw-loading-dot-opacity-start: 0.5;
          --sw-loading-dot-opacity-mid: 1;
          --sw-link-color: #58a6ff;
        }

        .popup-container {
          background-color: var(--sw-bg-color);
          color: var(--sw-text-color);
          border: 1px solid var(--sw-border-color);
          border-radius: 4px;
          padding: 8px 12px;
          font-size: 14px;
          box-shadow: 0 2px 8px var(--sw-shadow-color);
          max-width: 300px;
          overflow-wrap: break-word;
        }
        .loading-container {
          display: flex;
          justify-content: center;
          align-items: center;
          color: var(--sw-text-color); /* Dots inherit text color */
        }
        @keyframes blink {
          0% { opacity: var(--sw-loading-dot-opacity-start); }
          50% { opacity: var(--sw-loading-dot-opacity-mid); }
          100% { opacity: var(--sw-loading-dot-opacity-start); }
        }
        .loading-dot {
          font-size: 1.2em;
          margin: 0 2px;
          animation: blink 0.7s infinite;
        }
        .first-line { margin-bottom: 6px; display: flex; align-items: center; }
        .original-text {
          font-weight: bold;
          margin-left: 6px;
          color: var(--sw-original-text-color);
        }
        .second-line { margin-top: 4px; }
        .tts-icon {
          width: 16px;
          height: 16px;
          cursor: pointer;
          margin-right: 6px;
          vertical-align: middle; /* Align icon nicely with text */
        }
        :host(.theme-dark) .tts-icon {
           filter: invert(90%) brightness(1.1); /* Adjust to make a dark icon appear light */
        }
        /* Styles for links generated from markdown */
        .text-content a {
          color: var(--sw-link-color);
          text-decoration: none;
        }
        .text-content a:hover {
          text-decoration: underline;
        }
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
      if (this.displayElement) { // Check if element still exists
        this.displayElement.style.opacity = "0.95"; // Slightly more opaque
        this.displayElement.style.transform = "scale(1)";
      }
    });

    Browser.runtime
      .sendMessage({
        action: "fetchTranslationBackground",
        payload: { promptText: selectedText, translationMode },
      })
      .then((response) => {
        if (this.isTranslationCancelled || this.originalText !== selectedText || !this.innerContainer) {
          return;
        }
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
          throw new Error(response?.error?.message || response?.error || ErrorTypes.SERVICE);
        }
      })
      .catch(async (err) => {
        if (this.isTranslationCancelled || !this.innerContainer) return;
        await this.handleTranslationError(err, loading);
      });

    if (isExtensionContextValid()) {
      const onOutsideClick = (e) => {
        // Check if the click is outside the displayElement and not on an element that might open it
        if (this.displayElement && !this.displayElement.contains(e.target)) {
           // Add a small delay to allow potential interactions within the popup (e.g., TTS click)
           setTimeout(() => {
            if (this.isVisible) { // Check if still visible, as TTS click might have dismissed it
                this.cancelCurrentTranslation();
            }
           }, 50);
        }
      };
      // Use 'click' for better reliability with some interactions vs 'mousedown'
      document.addEventListener("click", onOutsideClick, { capture: true });
      this.removeMouseDownListener = () => {
        document.removeEventListener("click", onOutsideClick, { capture: true });
      };
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
      zIndex: "2147483637", // Max z-index
      left: `${position.x}px`,
      top: `${position.y}px`,
      transform: "scale(0.1)",
      transformOrigin: "top left",
      opacity: "0", // Start fully transparent for fade-in
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
    if (!this.innerContainer || !this.displayElement) return; // Ensure elements are still there

    if (loadingContainer && loadingContainer.parentNode === this.innerContainer) {
        loadingContainer.remove();
    }
    this.innerContainer.innerHTML = ""; // Clear previous content

    const firstLine = document.createElement("div");
    firstLine.classList.add("first-line");
    
    // TTS Icon for the *original* text
    const ttsIconOriginal = this.createTTSIcon(originalText, "Original text TTS");
    firstLine.appendChild(ttsIconOriginal);

    if (trans_Mode === TranslationMode.Dictionary_Translation) {
      const orig = document.createElement("span");
      orig.classList.add("original-text");
      orig.textContent = originalText;
      firstLine.appendChild(orig);
    }
    // Optional: Add TTS for translated text if desired
    // const ttsIconTranslated = this.createTTSIcon(translatedText, "Translated text TTS");
    // firstLine.appendChild(ttsIconTranslated);


    this.innerContainer.appendChild(firstLine);

    const secondLine = document.createElement("div");
    secondLine.classList.add("second-line");

    const textSpan = document.createElement("span");
    textSpan.classList.add("text-content");

    try {
        const rawHtml = marked.parse(translatedText);
        // Ensure RETURN_TRUSTED_TYPE is false if not directly assigning to innerHTML of a node
        // For creating nodes, we parse the string
        const sanitizedHtmlString = DOMPurify.sanitize(rawHtml);
        const parser = new DOMParser();
        const doc = parser.parseFromString(sanitizedHtmlString, "text/html");

        Array.from(doc.body.childNodes).forEach((node) => {
          textSpan.appendChild(node.cloneNode(true)); // Clone node to append
        });
    } catch (e) {
        logME("Error parsing markdown or sanitizing HTML:", e);
        textSpan.textContent = translatedText; // Fallback to plain text
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
          lang: AUTO_DETECT_VALUE, // Or determine language more accurately if possible
        });
      }
    });
    return icon;
  }

  async handleTranslationError(error, loadingContainer) {
    if (loadingContainer && loadingContainer.parentNode === this.innerContainer) {
        loadingContainer.remove();
    }
    // Display a user-friendly error message in the popup itself
    if (this.innerContainer) {
        const errorMsgElement = document.createElement("div");
        errorMsgElement.textContent = CONFIG.ICON_ERROR + "Translation failed. Please try again.";
        errorMsgElement.style.color = "var(--sw-text-color)"; // Use themed text color
         // Simple error styling, can be enhanced
        errorMsgElement.style.padding = "5px";
        this.innerContainer.appendChild(errorMsgElement);
         // Set a timeout to dismiss the popup after showing the error
        setTimeout(() => this.dismiss(true), 3000);
    } else {
        this.dismiss(false); // If container not available, just dismiss
    }
    
    const errObj = error instanceof Error ? error : new Error(String(error.message || error));
    // logME("[SelectionWindows] Translation Error:", errObj); // Log for debugging
    await this.translationHandler.errorHandler.handle(errObj, {
      type: errObj.type || ErrorTypes.API,
      context: "selection-window-translate",
      isSilent: true // To prevent duplicate global notifications if we show error in popup
    });
  }

  dismiss(withFadeOut = true) {
    if (!this.displayElement || !this.isVisible) return;

    this._removeThemeChangeListener(); // Remove listener when dismissing

    if (this.removeMouseDownListener) {
      this.removeMouseDownListener(); // This now removes the 'click' listener
      this.removeMouseDownListener = null;
    }
    this.isVisible = false; // Set immediately to prevent re-entry or race conditions

    if (withFadeOut && this.fadeOutDuration > 0 && this.displayElement) {
      this.displayElement.style.transition = `opacity ${this.fadeOutDuration}ms ease-in-out, transform 0.1s ease-in`;
      this.displayElement.style.opacity = "0";
      this.displayElement.style.transform = "scale(0.5)"; // Optional shrink effect
      
      // Ensure removeElement is called even if transitionend doesn't fire (e.g., element removed by other means)
      const el = this.displayElement; // Capture current displayElement
      const fallbackTimeout = setTimeout(() => {
        if (el && el.parentNode) {
            // logME("[SelectionWindows] Fallback removal for popup");
            this.removeElement(el);
        }
      }, this.fadeOutDuration + 50);


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

  removeElement(elementToRemove) {
    // If an element is passed, use it; otherwise, use this.displayElement
    const el = elementToRemove || this.displayElement;
    if (el && el.parentNode) {
      el.remove();
    }
    // Only nullify if we are removing the instance's current displayElement
    if (el === this.displayElement) {
        this.displayElement = null;
        this.innerContainer = null;
        // this.isVisible is already false
        this.originalText = null;
        // this.isTranslationCancelled should be reset by new show or explicit cancel
    }
  }


  applyTextDirection(element, text) {
    if (!element) return;
    const isRtl = CONFIG.RTL_REGEX.test(text);
    element.style.direction = isRtl ? "rtl" : "ltr";
    element.style.textAlign = isRtl ? "right" : "left";
  }
}

// dismissAllSelectionWindows remains largely the same,
// but it's good to ensure it cleans up any listeners if they were somehow globally managed,
// though in this design, listeners are per-instance.
export function dismissAllSelectionWindows() {
  logME("[SelectionWindows] Dismissing all selection windows");
  try {
    const hosts = document.querySelectorAll(".aiwc-selection-popup-host");
    hosts.forEach((host) => {
      try {
        // If SelectionWindows instances were tracked globally, you could call their dismiss() method.
        // Otherwise, direct removal is fine if they don't have complex external state.
        host.remove();
      } catch (innerErr) {
        logME("[SelectionWindows] Failed to remove a host:", innerErr);
      }
    });
  } catch (err) {
    logME(
      "[SelectionWindows] Unknown error in dismissAllSelectionWindows:",
      err
    );
  }
}