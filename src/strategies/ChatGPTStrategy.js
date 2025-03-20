// src/strategies/ChatGPTStrategy.js
// Todo: Needs some works
import { ErrorTypes } from "../services/ErrorService";
import PlatformStrategy from "./PlatformStrategy.js";
import { setCursorToEnd } from "../utils/helpers";

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
