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
      return !!(
        target.closest('[data-testid="dmComposerTextInput"]') || 
        (target.getAttribute('role') === 'textbox' && target.closest('[data-testid="DM_Inline_Composer"]'))
      );
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
      // شناسایی انواع فیلدهای جستجو (جستجوی کل یا جستجوی DM)
      const isSearchInput = element.tagName === 'INPUT' && (
        element.getAttribute('data-testid') === 'SearchBox_Search_Input' ||
        element.placeholder === 'Search' ||
        element.parentElement?.querySelector('[data-testid="dm-search-close"]')
      );

      if (isSearchInput) {
        await this.applyVisualFeedback(element);
        element.value = translatedText;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }

      let field = null;

      if (this.isDMElement(element)) {
        field = element.closest('[data-testid="dmComposerTextInput"]') || 
               (element.getAttribute('role') === 'textbox' ? element : null);
      } else if (this.isTwitterElement(element)) {
        field = element.closest('[data-testid="tweetTextarea_0"]');
      }

      // Fallback: If no specific field found but the element itself looks like a Twitter editor or a standard input
      if (!field && element && (element.isContentEditable || element.tagName === 'TEXTAREA' || element.tagName === 'INPUT')) {
        field = element;
      }

      if (field) {
        field.focus();
        await this.applyVisualFeedback(field);
        
        await smartDelay(50);
        
        const isDraftJS = this.isTwitterElement(element) || this.isDMElement(element);
        
        if (isDraftJS) {
          // هک برای Draft.js توییتر (توییت و DM): انتخاب کل
          // به جای حذف جداگانه، اجازه می‌دهیم insertText خودش جایگزین کند تا State ادیتور به هم نریزد
          document.execCommand('selectAll', false, null);
          await smartDelay(20);
        }

        // استفاده از جایگزینی هوشمند متن (جایگزین clearTweetField و pasteText)
        const success = await smartTextReplacement(field, translatedText);

        if (success) {
          // برای توییتر/Draft.js، فقط اگر لازم بود مکان‌نما را تنظیم می‌کنیم
          if (!isDraftJS) {
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
      if (!target) return "";

      const searchInput = target.closest('input[data-testid="SearchBox_Search_Input"]') || 
                         (target.tagName === 'INPUT' && (target.placeholder === 'Search' || target.parentElement?.querySelector('[data-testid="dm-search-close"]')) ? target : null);
      if (searchInput) return searchInput.value.trim();

      const dmField = target.closest('[data-testid="dmComposerTextInput"]') || 
                     (target.getAttribute('role') === 'textbox' && target.closest('[data-testid="DM_Inline_Composer"]') ? target : null);
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
