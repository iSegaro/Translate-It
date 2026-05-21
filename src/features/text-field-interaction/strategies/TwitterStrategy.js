import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import PlatformStrategy from "./PlatformStrategy.js";
import {
  smartTextReplacement,
  smartDelay,
} from "@/features/text-field-interaction/utils/framework/framework-compat/index.js";

const logger = getScopedLogger(LOG_COMPONENTS.TEXT_FIELD_INTERACTION, 'TwitterStrategy');

export default class TwitterStrategy extends PlatformStrategy {
  constructor(notifier, errorHandler) {
    super(notifier);
    this.errorHandler = errorHandler;
  }

  isTwitterElement(target) {
    if (!target || !(target instanceof Element)) return false;
    try {
      return !!target.closest('[data-testid="tweetTextarea_0"]');
    } catch {
      return false;
    }
  }

  isDMElement(target) {
    if (!target || !(target instanceof Element)) return false;
    try {
      return !!target.closest('[data-testid="dmComposerTextInput"]');
    } catch {
      return false;
    }
  }

  setCursorToEnd(field) {
    if (!field) return;
    try {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(field);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "twitter-strategy-setCursorToEnd",
      });
    }
  }

  async updateElement(element, translatedText) {
    if (!translatedText || !element) {
      return false;
    }

    try {
      const searchInput = document.querySelector(
        '[data-testid="SearchBox_Search_Input"]',
      );
      if (searchInput && element.contains(searchInput)) {
        await this.applyVisualFeedback(searchInput);
        searchInput.value = translatedText;
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      }

      let field = null;

      if (this.isDMElement(element)) {
        field = element.closest('[data-testid="dmComposerTextInput"]');
      } else if (this.isTwitterElement(element)) {
        field = element.closest('[data-testid="tweetTextarea_0"]');
      }

      if (field) {
        field.focus();
        await this.applyVisualFeedback(field);
        
        await smartDelay(50);
        
        if (this.isTwitterElement(element)) {
          // هک برای Draft.js توییتر: انتخاب کل
          // به جای حذف جداگانه، اجازه می‌دهیم insertText خودش جایگزین کند تا State ادیتور به هم نریزد
          document.execCommand('selectAll', false, null);
          await smartDelay(20);
        }

        // استفاده از جایگزینی هوشمند متن (جایگزین clearTweetField و pasteText)
        const success = await smartTextReplacement(field, translatedText);

        if (success) {
          // برای توییتر/Draft.js، فقط اگر لازم بود مکان‌نما را تنظیم می‌کنیم
          // زیرا execCommand خودش مکان‌نما را در جای درست قرار می‌دهد
          if (!this.isTwitterElement(element)) {
            this.setCursorToEnd(field);
          } else {
            // برای توییتر، اجبار به بروزرسانی State با ارسال رویداد input
            field.dispatchEvent(new Event('input', { bubbles: true }));
          }
          
          logger.init('Twitter field updated successfully.');
        }
        return success;
      }

      logger.error('No specific element matched. Update failed.');
      return false;
    } catch (error) {
      logger.error('Critical error in updateElement:', error);
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "twitter-strategy-updateElement",
      });
      return false;
    }
  }

  extractText(target) {
    try {
      const searchInput = target.closest(
        '[data-testid="SearchBox_Search_Input"]',
      );
      if (searchInput) return searchInput.value.trim();

      const dmField = target.closest('[data-testid="dmComposerTextInput"]');
      if (dmField) return dmField.textContent.trim();

      const tweetField = target.closest('[data-testid="tweetTextarea_0"]');
      if (tweetField) return tweetField.textContent.trim();

      return target.value || target.textContent || "";
    } catch {
      return "";
    }
  }

  isInputElement(el) {
    if (!el) {
      return false;
    }
    return el.tagName === "INPUT" || el.tagName === "TEXTAREA";
  }

  validateField(field) {
    try {
      return !!field && field instanceof Element;
    } catch {
      return false;
    }
  }

  findField(element, selector) {
    if (!element) {
      return null;
    }

    try {
      if (element.matches && element.matches(selector)) {
        return element;
      }

      if (typeof element.querySelector === "function") {
        return element.querySelector(selector);
      }

      return document.querySelector(selector);
    } catch {
      return null;
    }
  }
}
