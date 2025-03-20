// src/strategies/ChatGPTStrategy.js
import { ErrorTypes } from "../services/ErrorService";
import PlatformStrategy from "./PlatformStrategy.js";
import { setCursorToEnd } from "../utils/helpers";
import { CONFIG } from "../config";

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
      if (this.isChatGPTElement(target)) {
        return Array.from(target.querySelectorAll("p"))
          .map((p) => p.textContent.trim())
          .join("\n");
      }
      return super.extractText(target);
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "chatgpt-strategy-extractText",
      });
      return ""; // Return an empty string or handle as needed
    }
  }

  async updateElement(element, translated) {
    try {
      element.innerHTML = translated.replace(/\n/g, "<br>");
      this.applyBaseStyling(element, translated);
      setCursorToEnd(element);
      this.applyVisualFeedback(element);
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "chatgpt-strategy-updateElement",
      });
    }
  }

  applyBaseStyling(element, translatedText) {
    // بررسی جهت متن و اعمال استایل
    const isRtl = CONFIG.RTL_REGEX.test(translatedText);
    element.style.direction = isRtl ? "rtl" : "ltr";
    element.style.textAlign = isRtl ? "right" : "left";
  }
}
