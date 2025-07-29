// src/strategies/ChatGPTStrategy.js
import { ErrorTypes } from "../error-management/ErrorTypes.js";
import PlatformStrategy from "./PlatformStrategy.js";
import { setCursorToEnd } from "../utils/simulate_events.js";
import { CONFIG } from "../config";
import { filterXSS } from "xss";

export default class ChatGPTStrategy extends PlatformStrategy {
  constructor(notifier, errorHandler) {
    super(notifier);
    this.errorHandler = errorHandler;
  }
  /**
   * شناسایی المان ویرایشگر ChatGPT
   * @param {HTMLElement} target - المان هدف
   * @returns {boolean}
   */
  isChatGPTElement(target) {
    return target.id === "prompt-textarea";
  }

  extractText(target) {
    try {
      const shortcutsModal = document.querySelector(".absolute .inset-0");
      if (shortcutsModal) {
        // const escapeEvent = new KeyboardEvent("keydown", {
        //   key: "Escape",
        //   code: "Escape",
        //   keyCode: 27,
        //   which: 27,
        //   bubbles: true,
        //   cancelable: true,
        // });
        // shortcutsModal.dispatchEvent(escapeEvent);
        return "";
      }

      let resolvedTarget = target;

      // اگر target معتبر نیست، خودش دنبال فیلد بگردد
      if (!resolvedTarget || !this.isChatGPTElement(resolvedTarget)) {
        resolvedTarget = document.querySelector("#prompt-textarea");
      }

      if (!resolvedTarget) {
        throw new Error("عنصر ChatGPT برای استخراج متن شناسایی نشد.");
      }

      return Array.from(resolvedTarget.querySelectorAll("p"))
        .map((p) => p.textContent.trim())
        .join("\n");
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "chatgpt-strategy-extractText",
      });
      return "";
    }
  }

  async updateElement(element, translated) {
    try {
      /**
       * Detect Keyboard Shortcus Guide Modal ("absolute inset-0")
       */
      const shortcutsModal = document.querySelector(".absolute .inset-0");
      if (shortcutsModal) {
        // const escapeEvent = new KeyboardEvent("keydown", {
        //   key: "Escape",
        //   code: "Escape",
        //   keyCode: 27,
        //   which: 27,
        //   bubbles: true,
        //   cancelable: true,
        // });
        // shortcutsModal.dispatchEvent(escapeEvent);
        return false;
      }

      const htmlWithBreaks = translated.replace(/\n/g, "<br>");
      const sanitized = filterXSS(htmlWithBreaks, {
        whiteList: {
          br: [],
        },
        stripIgnoreTag: true,
        stripIgnoreTagBody: ["script", "style"],
        onIgnoreTagAttr: function (tag, name, value, _isWhiteAttr) {
          // Block javascript: and data: URLs
          if (name === "href" || name === "src") {
            if (value.match(/^(javascript|data|vbscript):/i)) {
              return "";
            }
          }
          return false;
        },
      });

      const parser = new DOMParser();
      const doc = parser.parseFromString(sanitized, "text/html");

      element.textContent = "";
      Array.from(doc.body.childNodes).forEach((node) => {
        element.appendChild(node);
      });

      this.applyBaseStyling(element, translated);
      setCursorToEnd(element);
      this.applyVisualFeedback(element);
      return true;
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "chatgpt-strategy-updateElement",
      });
      return false;
    }
  }

  applyBaseStyling(element, translatedText) {
    // بررسی جهت متن و اعمال استایل
    const isRtl = CONFIG.RTL_REGEX.test(translatedText);
    element.style.direction = isRtl ? "rtl" : "ltr";
    element.style.textAlign = isRtl ? "right" : "left";
  }
}
