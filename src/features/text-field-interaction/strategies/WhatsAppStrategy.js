// src/features/text-field-interaction/strategies/WhatsAppStrategy.js
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import PlatformStrategy from "./PlatformStrategy.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import {
  smartTextReplacement,
  smartDelay,
} from "@/features/text-field-interaction/utils/framework/framework-compat/index.js";

const logger = getScopedLogger(LOG_COMPONENTS.TEXT_FIELD_INTERACTION, 'WhatsAppStrategy');

export default class WhatsAppStrategy extends PlatformStrategy {
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

  getWhatsAppField(element) {
    if (!element) return;

    try {
      if (this.isInputField(element) || this.isContentEditable(element)) {
        return element;
      }

      // Look for WhatsApp-specific selectors
      let field =
        element.closest('[aria-label="Type a message"]') ||
        element.closest('[aria-label^="Type to"]') ||
        element.closest('[aria-label="Search input textbox"]') ||
        element.closest('[role="textbox"]') ||
        element.closest(".copyable-text.selectable-text");

      // If no field found, search for any contenteditable in the area
      if (!field) {
        const editableFields = element.parentElement?.querySelectorAll('[contenteditable="true"]');
        if (editableFields?.length === 1) {
          field = editableFields[0];
        }
      }

      return field;
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "whatsapp-strategy-getWhatsAppField",
      });
    }
  }

  /**
   * شناسایی المان ویرایشگر واتس‌اپ
   * @param {HTMLElement} target - المان هدف
   * @returns {boolean}
   */
  isWhatsAppElement(target) {
    return !!target.closest(
      '[aria-label="Type a message"], ' +
      '[aria-label^="Type to"], ' +
      '[aria-label="Search input textbox"], ' +
      '[role="textbox"], ' +
      '.copyable-text.selectable-text'
    );
  }

  async updateElement(element, translatedText) {
    if (!translatedText || !element) {
      return false;
    }

    try {
      logger.debug('WhatsAppStrategy.updateElement called', {
        element,
        elementIsConnected: element.isConnected,
        elementHasAttribute: element.hasAttribute('contenteditable'),
        translatedText: translatedText.substring(0, 50) + '...'
      });

      const SELECTORS = '[role="textbox"], .copyable-text.selectable-text, [contenteditable="true"]';

      await smartDelay(100);

      // Find WhatsApp field using multiple approaches
      const whatsappField =
        this.findField(element, SELECTORS) ||
        this.getWhatsAppField(element) ||
        document.querySelector('[aria-label="Type a message"], [aria-label^="Type to"], [aria-label="Search input textbox"]');

      logger.debug('WhatsApp field detection result', {
        hasField: !!whatsappField,
        fieldTag: whatsappField?.tagName,
        fieldAriaLabel: whatsappField?.getAttribute('aria-label')
      });

      // Validate the field
      if (!this.validateField(whatsappField)) {
        logger.debug('فیلد واتساپ نامعتبر است یا یافت نشد');
        return false;
      }

      // Double-check it's still a WhatsApp element
      if (!this.isWhatsAppElement(whatsappField)) {
        logger.debug('Element is not a WhatsApp field');
        return false;
      }

      // اعمال فیدبک بصری
      await this.applyVisualFeedback(whatsappField);

      // استفاده از جایگزینی هوشمند متن (جایگزین تمام متدهای قبلی)
      const success = await smartTextReplacement(whatsappField, translatedText);

      if (success) {
        logger.debug('WhatsApp field updated successfully using smartTextReplacement');
      }

      return success;
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.PARSE_INPUT,
        context: "whatsapp-strategy-updateElement",
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
        context: "WhatsApp-strategy-extractText-fallback",
      });
    }
    return "";
  }

  validateField(element) {
    return (
      element &&
      element.isConnected &&
      (this.isInputField(element) || this.isContentEditable(element))
    );
  }
}
