// src/features/text-field-interaction/strategies/DefaultStrategy.js

import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import PlatformStrategy from "./PlatformStrategy.js";
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import {
  smartTextReplacement,
  smartDelay,
} from "@/features/text-field-interaction/utils/framework/framework-compat/index.js";

export default class DefaultStrategy extends PlatformStrategy {
  constructor(notifier, errorHandler) {
    super(notifier);
    this.errorHandler = errorHandler;
    this.logger = getScopedLogger(LOG_COMPONENTS.TEXT_FIELD_INTERACTION, 'DefaultStrategy');
  }

  /**
   * استخراج متن از المان‌های استاندارد (ایمن‌سازی شده)
   */
  extractText(target) {
    try {
      if (!target || !(target instanceof Element)) {
        this.logger.warn('extractText: Invalid target', { target });
        return "";
      }

      this.logger.debug('extractText target info', {
        tagName: target.tagName,
        isContentEditable: target.isContentEditable,
        className: target.className,
        id: target.id,
        hasValue: "value" in target,
        textContent: target.textContent?.substring(0, 50),
      });

      // حالت contenteditable - بررسی انتخاب متن
      if (target.isContentEditable) {
        const selection = window.getSelection();
        if (
          selection &&
          !selection.isCollapsed &&
          selection.toString().trim().length > 0
        ) {
          const selectedText = selection.toString().trim();
          this.logger.debug('extractText: Selected text from contentEditable', { text: selectedText.substring(0, 50) });
          return selectedText;
        }
        const fullText = target.innerText?.trim?.() || "";
        this.logger.debug('extractText: Full text from contentEditable', { text: fullText.substring(0, 50) });
        return fullText;
      }

      // حالت input/textarea - بررسی انتخاب متن
      if (["TEXTAREA", "INPUT"].includes(target.tagName)) {
        if (target.selectionStart !== target.selectionEnd) {
          const selectedText = target.value
            .substring(target.selectionStart, target.selectionEnd)
            .trim();
          this.logger.debug('extractText: Selected text from input/textarea', { text: selectedText.substring(0, 50) });
          return selectedText;
        }
        const fullValue = target.value?.trim?.() || "";
        this.logger.debug('extractText: Full value from input/textarea', { text: fullValue.substring(0, 50) });
        return fullValue;
      }

      // حالت fallback برای سایر المان‌ها - خاص Reddit
      let fallbackText = target.textContent?.trim?.() || "";

      // اگر textContent خالی است، سعی کن از innerText استفاده کنی
      if (!fallbackText && target.innerText) {
        fallbackText = target.innerText.trim();
        this.logger.debug('extractText: Using innerText as fallback', { text: fallbackText.substring(0, 50) });
      }

      // اگر هنوز خالی است، بررسی کن آیا دارای فرزندان متنی است
      if (!fallbackText) {
        const textNodes = Array.from(target.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent?.trim())
          .filter(Boolean);

        if (textNodes.length > 0) {
          fallbackText = textNodes.join(" ");
          this.logger.debug('extractText: Using child text nodes', { text: fallbackText.substring(0, 50) });
        }
      }

      // اگر هنوز خالی است، بررسی کن المان‌های فرزند قابل ویرایش
      if (!fallbackText && target.querySelector) {
        const editableChild = target.querySelector(
          '[contenteditable="true"], input, textarea',
        );
        if (editableChild) {
          if (editableChild.value) {
            fallbackText = editableChild.value.trim();
            this.logger.debug('extractText: Using editable child value', { text: fallbackText.substring(0, 50) });
          } else if (editableChild.textContent) {
            fallbackText = editableChild.textContent.trim();
            this.logger.debug('extractText: Using editable child textContent', { text: fallbackText.substring(0, 50) });
          }
        }
      }

      this.logger.debug('extractText: Final fallback result', { text: fallbackText.substring(0, 50) });
      return fallbackText;
    } catch (error) {
      this.logger.error('extractText error', error);
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "default-strategy-extractText",
      });
      return "";
    }
  }

  async updateElement(element, translatedText) {
    try {
      if (translatedText === undefined || translatedText === null) {
        return false;
      }

      this.logger.debug('Starting updateElement', {
        tagName: element?.tagName,
        isContentEditable: element?.isContentEditable,
        textLength: translatedText.length,
      });

      await this.applyVisualFeedback(element);

      // بررسی وجود انتخاب متن
      const hasSelection = this._hasTextSelection(element);

      // تعیین محدوده انتخاب در صورت وجود
      let selectionStart = null;
      let selectionEnd = null;

      if (hasSelection && !element.isContentEditable) {
        // برای input/textarea محدوده را می‌گیریم (برای contentEditable توسط Selection API مدیریت می‌شود)
        selectionStart = element.selectionStart;
        selectionEnd = element.selectionEnd;
      }

      // استفاده از جایگزینی هوشمند متن (سیستم یکپارچه با تمام Fallbackها)
      const success = await smartTextReplacement(
        element,
        translatedText,
        selectionStart,
        selectionEnd,
      );

      this.logger.debug('Smart replacement completed', { success });

      if (success) {
        this.applyTextDirection(element, translatedText);
        await smartDelay(200);
        this.logger.info('Update completed successfully');
      }

      return success;
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "default-strategy-updateElement",
      });
      return false;
    }
  }

  /**
   * بررسی وجود متن انتخاب شده در فیلد متنی
   */
  _hasTextSelection(element) {
    if (!element) return false;

    if (element.isContentEditable) {
      const selection = window.getSelection();
      return (
        selection &&
        !selection.isCollapsed &&
        selection.toString().trim().length > 0
      );
    } else if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      return element.selectionStart !== element.selectionEnd;
    }

    return false;
  }

  /**
   * پاک کردن محتوای المان قابل ویرایش
   */
  clearContent(element) {
    if (!element) return;

    try {
      if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
        element.value = "";
      } else {
        element.textContent = "";
      }
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "default-strategy-clearContent",
      });
    }
  }
}
