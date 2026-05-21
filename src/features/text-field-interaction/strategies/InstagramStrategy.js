// src/features/text-field-interaction/strategies/InstagramStrategy.js
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import PlatformStrategy from "./PlatformStrategy.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import {
  smartTextReplacement,
  smartDelay,
} from "@/features/text-field-interaction/utils/framework/framework-compat/index.js";

const logger = getScopedLogger(LOG_COMPONENTS.TEXT_FIELD_INTERACTION, 'InstagramStrategy');

export default class InstagramStrategy extends PlatformStrategy {
  constructor(notifier, errorHandler) {
    super(notifier);
    this.errorHandler = errorHandler;
  }

  /**
   * بررسی می‌کند که آیا المان، فیلد متنی دایرکت مسیج اینستاگرام است یا خیر.
   * @param {HTMLElement} element - المان برای بررسی.
   * @returns {boolean} - اگر المان فیلد دایرکت مسیج باشد true برمی‌گرداند.
   */
  isDirectMessageInputField(element) {
    return !!(
      element && element.matches('div[role="textbox"][contenteditable="true"]')
    );
  }

  async updateElement(element, translatedText) {
    if (!translatedText || !element) {
      return false;
    }

    try {
      logger.debug('InstagramStrategy.updateElement called', {
        tagName: element.tagName,
        isContentEditable: element.isContentEditable,
        textLength: translatedText.length
      });

      // اعمال فیدبک بصری قبل از جایگزینی
      await this.applyVisualFeedback(element);

      // استفاده از جایگزینی هوشمند متن که تمام حالت‌های اینستاگرام (دایرکت، کامنت و ...) را مدیریت می‌کند
      const success = await smartTextReplacement(element, translatedText);

      if (success) {
        this.applyTextDirection(element, translatedText);
        await smartDelay(100);
      }

      return success;
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "instagram-strategy-updateElement",
      });
      return false;
    }
  }

  extractText(target) {
    try {
      if (!target) return "";

      // اگر contenteditable باشد (مثلاً دایرکت)
      if (target?.isContentEditable) {
        return target?.innerText?.trim?.() || "";
      }

      // حالت فیلد ورودی (مثلاً جستجو یا کامنت)
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") {
        return target?.value?.trim?.() || "";
      }

      // حالت fallback
      return target?.textContent?.trim?.() || "";
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "instagram-strategy-extractText",
      });
      return "";
    }
  }
}
