// src/features/text-field-interaction/strategies/YoutubeStrategy.js
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import PlatformStrategy from "./PlatformStrategy.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import {
  smartTextReplacement,
  smartDelay,
} from "@/features/text-field-interaction/utils/framework/framework-compat/index.js";

const logger = getScopedLogger(LOG_COMPONENTS.TEXT_FIELD_INTERACTION, 'YoutubeStrategy');

export default class YoutubeStrategy extends PlatformStrategy {
  constructor(notifier, errorHandler) {
    super(notifier, errorHandler);
    this.errorHandler = errorHandler;
  }

  isYoutube_ExtraField(target) {
    if (!target || target.tagName !== "INPUT") {
      return false;
    }
    return target.getAttribute("id") === "end";
  }

  extractText(target) {
    try {
      if (!target) return "";

      // حالت ۱: المان دارای contenteditable
      if (target?.isContentEditable) {
        return target?.innerText?.trim?.() || "";
      }

      // حالت ۲: المان‌های input و textarea
      if (
        target?.tagName &&
        (target.tagName === "TEXTAREA" || target.tagName === "INPUT")
      ) {
        return target?.value?.trim?.() || "";
      }

      // حالت ۳: fallback → استفاده از textContent
      return target?.textContent?.trim?.() || "";
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "youtube-strategy-extractText",
      });
      return "";
    }
  }

  async updateElement(element, translatedText) {
    if (!translatedText || !element || !element.isConnected) {
      return false;
    }

    try {
      // اعمال فیدبک بصری
      await this.applyVisualFeedback(element);

      // استفاده از جایگزینی هوشمند متن (سیستم یکپارچه و بهینه)
      const success = await smartTextReplacement(element, translatedText);

      if (success) {
        this.applyTextDirection(element, translatedText);
        await smartDelay(100);
        logger.debug('Youtube field updated successfully using smartTextReplacement');
      }

      return success;
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "youtube-strategy-updateElement",
        element: element?.tagName,
      });
      return false;
    }
  }

  async clearContent(element) {
    try {
      if (!element || !element.isConnected) return;

      if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
        element.value = "";
      } else {
        element.textContent = "";
      }

      await this.applyVisualFeedback(element);
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "youtube-strategy-clearContent",
        element: element?.tagName,
      });
    }
  }
}
