// src/features/text-field-interaction/strategies/WhatsAppStrategy.js
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import PlatformStrategy from "./PlatformStrategy.js";
import { delay} from "@/core/helpers.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'WhatsAppStrategy');


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
    if (!translatedText) {
      return false;
    }
    if (!element) {
      return false;
    }

    try {
      logger.debug('WhatsAppStrategy.updateElement called', {
        element,
        elementIsConnected: element.isConnected,
        elementHasAttribute: element.hasAttribute('contenteditable'),
        elementClassName: element.className,
        translatedText
      });

      const SELECTORS = '[role="textbox"], .copyable-text.selectable-text, [contenteditable="true"]';

      await delay(100);

      // Find WhatsApp field using multiple approaches
      let whatsappField =
        this.findField(element, SELECTORS) ||
        this.getWhatsAppField(element) ||
        document.querySelector('[aria-label="Type a message"], [aria-label^="Type to"], [aria-label="Search input textbox"]');

      logger.debug('WhatsApp field detection result', {
        hasField: !!whatsappField,
        fieldTag: whatsappField?.tagName,
        fieldAriaLabel: whatsappField?.getAttribute('aria-label'),
        fieldClassList: whatsappField?.className
      });

      // Validate the field
      if (!this.validateField(whatsappField)) {
        logger.debug('فیلد واتساپ نامعتبر است یا یافت نشد', {
          hasField: !!whatsappField,
          fieldTag: whatsappField?.tagName,
          isConnected: whatsappField?.isConnected,
          isContentEditable: whatsappField?.isContentEditable
        });
        return false;
      }

      // Double-check it's still a WhatsApp element
      const isWhatsAppField = this.isWhatsAppElement(whatsappField);
      if (!isWhatsAppField) {
        logger.debug('Element is not a WhatsApp field', {
          element: whatsappField,
          ariaLabel: whatsappField.getAttribute('aria-label')
        });
        return false;
      }

      // اعمال فوکوس با تنظیمات ایمن
      await this.safeFocus(whatsappField);

      await this.applyVisualFeedback(whatsappField);

      // انتخاب تمام محتوا با استفاده از Selection API
      await this.selectAllContent(whatsappField);

      // پیست محتوا با شبیه‌سازی کامل
      await this.simulatePaste(whatsappField, translatedText);

      // به روزرسانی state واتس‌اپ
      this.triggerStateUpdate(whatsappField);

      return true;
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

    // try {
    //   const whatsappField = target?.closest?.(
    //     '[role="textbox"], .copyable-text.selectable-text'
    //   );

    //   if (!whatsappField || !this.validateField(whatsappField)) return "";

    //   return whatsappField.innerText?.trim?.() || "";
    //     // } catch {
    //   this.errorHandler.handle(error, {
    //     type: ErrorTypes.UI,
    //     context: "whatsapp-strategy-extractText",
    //   });
    //   return "";
    // }
  }

  async safeFocus(element) {
    element.focus({ preventScroll: true });
    await delay(100);
    return element;
  }

  async selectAllContent(element) {
    try {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
      await delay(100);
      return element;
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.PARSE_INPUT,
        context: "whatsapp-strategy-selectAllContent",
      });
    }
  }

  async simulatePaste(element, text) {
    if (!element || text === undefined || text === null) return;

    try {
      // 1. Trim the text to remove leading/trailing whitespace, including newlines.
      let trimmedText = text.trim();

      // 2. Collapse multiple consecutive newlines into single newlines.
      trimmedText = trimmedText.replace(/\n{2,}/g, "\n");

      // 3. Convert newlines to <br> for HTML representation.
      const htmlText = trimmedText.replace(/\n/g, "<br>");

      // 4. Create DataTransfer object.
      const dt = new DataTransfer();
      dt.setData("text/plain", trimmedText); // Use trimmedText for plain text
      dt.setData("text/html", htmlText); // Use htmlText for HTML

      // 5. Create and dispatch the paste event.
      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dt,
      });
      element.dispatchEvent(pasteEvent);

      // 6. Add a small delay for event processing.
      await delay(50);
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.PARSE_INPUT,
        context: "whatsapp-strategy-simulatePaste",
      });
    }
  }

  validateField(element) {
    return (
      element &&
      element.isConnected &&
      (this.isInputField(element) || this.isContentEditable(element))
    );
  }

  triggerStateUpdate(element) {
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
      }),
    );
  }
}
