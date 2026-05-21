// src/features/text-field-interaction/strategies/MediumStrategy.js
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import PlatformStrategy from "./PlatformStrategy.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import {
  smartTextReplacement,
  smartDelay,
} from "@/features/text-field-interaction/utils/framework/framework-compat/index.js";

const logger = getScopedLogger(LOG_COMPONENTS.TEXT_FIELD_INTERACTION, 'MediumStrategy');

export default class MediumStrategy extends PlatformStrategy {
  constructor(notifier, errorHandler) {
    super(notifier);
    this.errorHandler = errorHandler;
  }

  shouldShowDefaultIcon() {
    return true;
  }

  // بررسی اینکه عنصر مربوط به مدیوم هست یا خیر
  isMediumElement(target) {
    return !!(
      target.closest('[role="textbox"]') ||
      target.closest('[data-testid="editor-container"]')
    );
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
   * به‌روزرسانی فیلد متنی مدیوم با پشتیبانی از انتخاب متن
   */
  async updateElement(element, translatedText) {
    if (!translatedText || !element) {
      return false;
    }

    try {
      // 1. برای input/textarea (مثلاً جستجو)
      if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
        const hasSelection = this._hasTextSelection(element);
        const selectionStart = hasSelection ? element.selectionStart : null;
        const selectionEnd = hasSelection ? element.selectionEnd : null;

        await this.applyVisualFeedback(element);
        const success = await smartTextReplacement(
          element,
          translatedText,
          selectionStart,
          selectionEnd
        );
        
        if (success) {
          await smartDelay(100);
          logger.debug('Medium input/textarea updated successfully');
        }
        return success;
      }

      // 2. برای فیلدهای contenteditable مدیوم
      const mediumField = this.findMediumTextField(element);
      if (!mediumField) {
        return false;
      }

      mediumField.focus();
      await smartDelay(50);
      
      const hasSelection = this._hasTextSelection(mediumField);

      if (hasSelection) {
        // جایگزینی متن انتخاب شده با استفاده از سیستم یکپارچه
        await this.applyVisualFeedback(mediumField);
        return await smartTextReplacement(mediumField, translatedText);
      } else {
        // جایگزینی سطر فعلی (رفتار خاص مدیوم برای حفظ پاراگراف‌ها)
        const success = await this.replaceCurrentLine(
          mediumField,
          translatedText,
        );
        if (success) {
          await this.applyVisualFeedback(mediumField);
          return true;
        }
      }

      return false;
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "medium-strategy-updateElement",
      });
      return false;
    }
  }

  extractText(target) {
    try {
      if (!target) return "";

      // اگر input یا textarea باشد
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        if (target.selectionStart !== target.selectionEnd) {
          return target.value.substring(target.selectionStart, target.selectionEnd).trim();
        }
        return target?.value?.trim?.() || "";
      }

      const mediumField = this.findMediumTextField(target);
      if (!mediumField) return "";

      if (mediumField.isContentEditable) {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && mediumField.contains(selection.anchorNode)) {
          return selection.toString().trim();
        }
      }

      // استخراج سطر فعلی بجای کل محتوا
      return this.extractCurrentLine(mediumField) || "";
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "medium-strategy-extractText",
      });
      return "";
    }
  }

  /**
   * پیدا کردن فیلد متن مدیوم
   */
  findMediumTextField(startElement) {
    let currentElement = startElement;
    for (let i = 0; i < 5; i++) {
      if (!currentElement) break;
      const candidate = currentElement.closest(
        '[role="textbox"][contenteditable="true"], [data-testid="editor-container"]',
      );
      if (candidate) return candidate;
      currentElement = currentElement.parentElement;
    }
    return document.querySelector(
      '[role="textbox"][contenteditable="true"], [data-testid="editor-container"]',
    );
  }

  /**
   * استخراج سطر فعلی (پاراگراف فعلی)
   */
  extractCurrentLine(element) {
    try {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && element.contains(selection.anchorNode)) {
        let currentNode = selection.anchorNode;
        if (currentNode.nodeType === Node.TEXT_NODE) {
          currentNode = currentNode.parentElement;
        }

        while (currentNode && currentNode !== element) {
          if (currentNode.tagName === "DIV" || currentNode.tagName === "P") {
            return currentNode.innerText?.trim() || "";
          }
          currentNode = currentNode.parentElement;
        }
      }

      const firstParagraph = element.querySelector("div, p");
      return firstParagraph?.innerText?.trim() || element.innerText?.trim() || "";
    } catch {
      return element.innerText?.trim() || "";
    }
  }

  /**
   * جایگزینی سطر فعلی بجای کل محتوا
   */
  async replaceCurrentLine(element, translatedText) {
    try {
      const selection = window.getSelection();

      if (selection && selection.rangeCount > 0 && element.contains(selection.anchorNode)) {
        let currentNode = selection.anchorNode;
        if (currentNode.nodeType === Node.TEXT_NODE) {
          currentNode = currentNode.parentElement;
        }

        while (currentNode && currentNode !== element) {
          if (currentNode.tagName === "DIV" || currentNode.tagName === "P") {
            // استفاده از سیستم جایگزینی هوشمند روی همان پاراگراف
            const success = await smartTextReplacement(currentNode, translatedText);
            if (success) {
              logger.debug('Current line replaced successfully using smartTextReplacement');
              return true;
            }
            break;
          }
          currentNode = currentNode.parentElement;
        }
      }

      // fallback: استفاده از سیستم جایگزینی روی کل فیلد اگر سطر پیدا نشد
      return await smartTextReplacement(element, translatedText);
    } catch (error) {
      logger.error('replaceCurrentLine error:', error);
      return false;
    }
  }
}
