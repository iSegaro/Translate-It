// src/features/text-field-interaction/strategies/TelegramStrategy.js
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { CONFIG } from "@/shared/config/config.js";
import PlatformStrategy from "./PlatformStrategy.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import {
  smartTextReplacement,
  smartDelay,
} from "@/features/text-field-interaction/utils/framework/framework-compat/index.js";

const logger = getScopedLogger(LOG_COMPONENTS.TEXT_FIELD_INTERACTION, 'TelegramStrategy');

export default class TelegramStrategy extends PlatformStrategy {
  constructor(notifier, errorHandler) {
    super(notifier);
    this.errorHandler = errorHandler;
  }

  isInputField(field) {
    return field.tagName === "INPUT" || field.tagName === "TEXTAREA";
  }

  isContentEditable(field) {
    return field.isContentEditable;
  }

  getTelegramField(element) {
    if (!element) return;

    try {
      if (this.isInputField(element) || this.isContentEditable(element)) {
        return element;
      }

      let field =
        element.closest('[aria-label="Message input"]') ||
        element.closest(".composer_rich_textarea") ||
        element.closest(".public_DraftEditor-content");

      if (!field) {
        const editableFields = document.querySelectorAll(
          '[contenteditable="true"]',
        );
        field = editableFields.length === 1 ? editableFields[0] : null;
      }

      // بررسی المانهای تو در تو
      if (field && !this.isContentEditable(field)) {
        const nestedEditable = field.querySelector('[contenteditable="true"]');
        if (nestedEditable) field = nestedEditable;
      }

      return field;
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "telegram-strategy-getTelegramField",
      });
    }
  }

  setCursorToEnd(field) {
    try {
      if (!field) {
        return;
      }
      if (this.isInputField(field)) {
        const len = field.value.length;
        field.setSelectionRange(len, len);
      } else {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(field);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.SERVICE,
        context: "telegram-strategy-setCursorToEnd",
      });
    }
  }

  async updateElement(element, translatedText) {
    if (!translatedText || !element) {
      return false;
    }

    const SELECTORS =
      '[aria-label="Message input"], .composer_rich_textarea, .public_DraftEditor-content, [contenteditable="true"]';

    try {
      await smartDelay(100);

      // 1. ادغام منطق پیدا کردن فیلد
      const telegramField =
        this.findField(element, SELECTORS) ||
        this.getTelegramField(element) ||
        document.querySelector(SELECTORS);

      // 2. اعتبارسنجی پیشرفته
      if (!this.validateField(telegramField)) {
        logger.debug('فیلد تلگرام یافت نشد');
        return false;
      }

      // 3. جلوگیری از پردازش المان‌های غیرفعال
      if (element !== telegramField && !telegramField.contains(element)) {
        return false;
      }

      // اعمال فوکوس
      telegramField.focus({ preventScroll: true });
      await smartDelay(50);

      // اعمال فیدبک بصری
      await this.applyVisualFeedback(telegramField);

      // 4. استفاده از جایگزینی هوشمند متن
      const success = await smartTextReplacement(telegramField, translatedText);

      if (success) {
        // اعمال جهت متن برای فیلدهای input
        if (this.isInputField(telegramField)) {
          telegramField.setAttribute(
            "dir",
            CONFIG.RTL_REGEX.test(translatedText) ? "rtl" : "ltr",
          );
        }
        this.setCursorToEnd(telegramField);
        logger.debug('Telegram field updated successfully using smartTextReplacement');
      }

      return success;
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.SERVICE,
        context: "telegram-strategy-updateElement",
      });
      return false;
    }
  }

  extractText(target) {
    try {
      if (!target) return "";
      if (target.isContentEditable) return target.innerText.trim();
      if (target.value) return target.value.trim();
      if (target.textContent) return target.textContent.trim();
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "Telegram-strategy-extractText-fallback",
      });
    }
    return "";
  }

  validateField(element) {
    const hasNestedEditable = element?.querySelector(
      '[contenteditable="true"]',
    );
    return (
      element &&
      element.isConnected &&
      (this.isInputField(element) ||
        this.isContentEditable(element) ||
        hasNestedEditable)
    );
  }

  triggerStateUpdate(field) {
    field.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
      }),
    );
  }
}
