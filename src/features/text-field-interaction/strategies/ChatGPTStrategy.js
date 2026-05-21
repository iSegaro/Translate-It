// src/features/text-field-interaction/strategies/ChatGPTStrategy.js
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import PlatformStrategy from "./PlatformStrategy.js";
import { utilsFactory } from '@/utils/UtilsFactory.js';
import { CONFIG } from "@/shared/config/config.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import {
  smartTextReplacement,
  smartDelay,
} from "@/features/text-field-interaction/utils/framework/framework-compat/index.js";

const logger = getScopedLogger(LOG_COMPONENTS.TEXT_FIELD_INTERACTION, 'ChatGPTStrategy');

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

  async updateElement(element, translatedText) {
    if (!translatedText || !element) {
      return false;
    }

    try {
      logger.debug('ChatGPTStrategy.updateElement called', {
        tagName: element.tagName,
        textLength: translatedText.length
      });

      /**
       * Detect Keyboard Shortcus Guide Modal ("absolute inset-0")
       */
      const shortcutsModal = document.querySelector(".absolute .inset-0");
      if (shortcutsModal) {
        return false;
      }

      // اعمال فیدبک بصری
      await this.applyVisualFeedback(element);

      // استفاده از جایگزینی هوشمند متن (جایگزین دستی appendChild و filterXSS)
      const success = await smartTextReplacement(element, translatedText);

      if (success) {
        this.applyBaseStyling(element, translatedText);
        await smartDelay(100);
      }

      return success;
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
    if (!element || !element.style || typeof element.style !== 'object') {
      if (element && element.classList) {
        const isRtl = CONFIG.RTL_REGEX.test(translatedText);
        element.classList.add(isRtl ? 'ti-rtl-text' : 'ti-ltr-text');
      }
      return;
    }

    const isRtl = CONFIG.RTL_REGEX.test(translatedText);
    element.style.direction = isRtl ? "rtl" : "ltr";
    element.style.textAlign = isRtl ? "right" : "left";
  }
}
