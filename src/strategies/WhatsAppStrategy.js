// src/strategies/WhatsAppStrategy.js
import { ErrorTypes } from "../error-management/ErrorTypes.js";
import PlatformStrategy from "./PlatformStrategy.js";
import { delay} from "../utils/core/helpers.js";

// Lazy logger to avoid initialization order issues
let _logger;
const getLogger = () => {
  if (!_logger) {
    _logger = createLogger(LOG_COMPONENTS.BACKGROUND, 'WhatsAppStrategy');
  }
  return _logger;
};

import { createLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';


export default class WhatsAppStrategy extends PlatformStrategy {
  constructor(notifier, errorHandler) {
    super(notifier);
    this.errorHandler = errorHandler;
  }

  /**
   * شناسایی المان ویرایشگر واتس‌اپ
   * @param {HTMLElement} target - المان هدف
   * @returns {boolean}
   */
  isWhatsAppElement(target) {
    return !!target.closest('[aria-label="Type a message"]');
  }

  async updateElement(element, translatedText) {
    try {
      const SELECTORS = '[role="textbox"], .copyable-text.selectable-text';

      let whatsappField = this.findField(element, SELECTORS);

      if (!whatsappField) {
        getLogger().debug('فیلد واتساپ یافت نشد');
        return;
      }

      // استفاده مستقیم از بررسی نوع تگ و contenteditable به جای validateField
      const isValidField =
        (whatsappField.tagName === "INPUT" ||
          whatsappField.tagName === "TEXTAREA" ||
          whatsappField.hasAttribute("contenteditable")) &&
        whatsappField.isConnected;

      if (!isValidField) {
        getLogger().debug('فیلد واتساپ نامعتبر است');
        return false;
      }

      const isWhatsApp = this.isWhatsAppElement(element);
      if (!isWhatsApp) {
        return false;
      }

      // اعتبارسنجی وجود المان در DOM
      if (!document.body.contains(element)) {
        getLogger().debug('Element removed from DOM');
        return false;
      }

      // اعمال فوکوس با تنظیمات ایمن
      await this.safeFocus(element);

      this.applyVisualFeedback(whatsappField);

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
    // } catch (error) {
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

  triggerStateUpdate(element) {
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
      }),
    );
  }
}
