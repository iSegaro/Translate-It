// src/managers/SelectionWindows.js

import Browser from "webextension-polyfill";
import { logME, isExtensionContextValid } from "../utils/helpers";
import { ErrorTypes } from "../services/ErrorTypes.js";
import { CONFIG, TranslationMode } from "../config.js";
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

    this.show = this.show.bind(this);
    this.cancelCurrentTranslation = this.cancelCurrentTranslation.bind(this);
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

    this.dismiss(false);
    this.originalText = selectedText;
    this.isTranslationCancelled = false;

    // Determine mode
    const translationMode = determineTranslationMode(
      selectedText,
      TranslationMode.Field
    );

    // Host element
    this.displayElement = document.createElement("div");
    this.displayElement.classList.add("aiwc-selection-popup-host");
    this.applyInitialStyles(position);

    if (!this.displayElement) return;

    // Shadow root + inner container
    const shadowRoot = this.displayElement.attachShadow({ mode: "open" });
    const style = document.createElement("style");

    if (style) {
      style.textContent = `
        .popup-container {
          background-color: #f8f8f8;
          color: #333;
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 8px 12px;
          font-size: 14px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.1);
          max-width: 300px;
          overflow-wrap: break-word;
        }
        .loading-container {
          display: flex;
          justify-content: center;
          align-items: center;
        }
        @keyframes blink {
          0% { opacity: 0.3; }
          50% { opacity: 0.8; }
          100% { opacity: 0.3; }
        }
        .loading-dot {
          font-size: 1.2em;
          margin: 0 2px;
          animation: blink 0.7s infinite;
        }
        .first-line { margin-bottom: 6px; display: flex; align-items: center; }
        .original-text { font-weight: bold; margin-left: 6px; }
        .second-line { margin-top: 4px; }
        .tts-icon { width: 16px; height: 16px; cursor: pointer; margin-right: 6px; }
      `;
      shadowRoot.appendChild(style);
    }

    this.innerContainer = document.createElement("div");
    this.innerContainer.classList.add("popup-container");
    shadowRoot.appendChild(this.innerContainer);

    // Loading indicator
    const loading = this.createLoadingDots();
    this.innerContainer.appendChild(loading);

    document.body.appendChild(this.displayElement);
    this.isVisible = true;

    requestAnimationFrame(() => {
      this.displayElement.style.opacity = "0.9";
      this.displayElement.style.transform = "scale(1)";
    });

    // Fetch translation
    Browser.runtime
      .sendMessage({
        action: "fetchTranslationBackground",
        payload: { promptText: selectedText, translationMode },
      })
      .then((response) => {
        if (this.isTranslationCancelled || this.originalText !== selectedText)
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
          throw new Error(response.error || ErrorTypes.SERVICE);
        }
      })
      .catch(async (err) => {
        await this.handleTranslationError(err, loading);
      });

    // Outside click to dismiss
    if (isExtensionContextValid()) {
      const onOutsideClick = (e) => {
        if (!this.displayElement.contains(e.target)) {
          this.cancelCurrentTranslation();
        }
      };
      document.addEventListener("mousedown", onOutsideClick);
      this.removeMouseDownListener = onOutsideClick;
    }
  }

  cancelCurrentTranslation() {
    this.dismiss();
    this.isTranslationCancelled = true;
    this.originalText = null;
    this.translatedText = null;
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
      opacity: "0.6",
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
    loadingContainer.remove();
    this.innerContainer.innerHTML = "";

    const firstLine = document.createElement("div");
    firstLine.classList.add("first-line");
    const ttsIcon = this.createTTSIcon(originalText);
    firstLine.appendChild(ttsIcon);

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

    // تبدیل Markdown به HTML، پاکسازی، سپس تبدیل امن به Node:
    const rawHtml = marked.parse(translatedText);
    const trusted = DOMPurify.sanitize(rawHtml, { RETURN_TRUSTED_TYPE: true });
    const parser = new DOMParser();
    const doc = parser.parseFromString(trusted.toString(), "text/html");

    Array.from(doc.body.childNodes).forEach((node) => {
      textSpan.appendChild(node);
    });

    secondLine.appendChild(textSpan);
    this.applyTextDirection(secondLine, translatedText);
    this.innerContainer.appendChild(secondLine);

    requestAnimationFrame(() => {
      this.displayElement.style.transition = `opacity 0.15s ease-in-out`;
      this.displayElement.style.opacity = "0.9";
    });
  }

  createTTSIcon(textToSpeak) {
    const icon = document.createElement("img");
    icon.src = Browser.runtime.getURL("icons/speaker.png");
    icon.classList.add("tts-icon");
    icon.addEventListener("click", (e) => {
      e.stopPropagation();
      // logME("[SelectionWindows]: TTS icon clicked.");
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
    loadingContainer.remove();
    const errObj = error instanceof Error ? error : new Error(String(error));
    await this.translationHandler.errorHandler.handle(errObj, {
      type: errObj.type || ErrorTypes.API,
      context: "selection-window-translate",
    });
    this.dismiss(false);
  }

  dismiss(withFadeOut = true) {
    if (!this.displayElement || !this.isVisible) return;
    if (this.removeMouseDownListener) {
      document.removeEventListener("mousedown", this.removeMouseDownListener);
      this.removeMouseDownListener = null;
    }
    this.isVisible = false;
    if (withFadeOut && this.fadeOutDuration > 0) {
      this.displayElement.style.transition = `opacity ${this.fadeOutDuration}ms ease-in-out`;
      this.displayElement.style.opacity = "0";
      this.displayElement.addEventListener(
        "transitionend",
        () => this.removeElement(),
        { once: true }
      );
    } else {
      this.removeElement();
    }
  }

  removeElement() {
    if (this.displayElement && this.displayElement.parentNode) {
      this.displayElement.remove();
    }
    this.displayElement = null;
    this.innerContainer = null;
    this.isVisible = false;
    this.originalText = null;
    this.isTranslationCancelled = false;
  }

  applyTextDirection(element, text) {
    if (!element) return;
    const isRtl = CONFIG.RTL_REGEX.test(text);
    element.style.direction = isRtl ? "rtl" : "ltr";
    element.style.textAlign = isRtl ? "right" : "left";
  }
}

/**
 * Dismisses all selection popups created by this script.
 * Finds every element with the host class, removes it, and logs unexpected errors.
 */
export function dismissAllSelectionWindows() {
  logME("[SelectionWindows] Dismissing all selection windows");
  try {
    const hosts = document.querySelectorAll(".aiwc-selection-popup-host");
    hosts.forEach((host) => {
      try {
        // Remove any attached event listeners if you stored them on the element:
        // e.g. if host._outsideClickListener exists, do:
        //   document.removeEventListener("mousedown", host._outsideClickListener);
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
