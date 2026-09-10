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

  async updateElement(element, translatedText, applicationContext = null) {
    const isCurrent = this.getApplicationGuard(applicationContext);
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
        if (!isCurrent()) return false;
        // Scoped Field application: when a request-time scope is present, the
        // single canonical pipeline enforces it (captured range or full) with
        // stale validation instead of this direct full-value assignment.
        if (applicationContext?.fieldSource) {
          return await smartTextReplacement(element, translatedText, null, null, undefined, applicationContext);
        }
        element.value = translatedText;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }

      let field = null;

      // Scoped CE application must run on the capture root itself: bookmarks and
      // canonical identity are rooted at the request-time element, and resolving
      // outward to the composer container would misalign them (central validation
      // would refuse). Legacy descriptor-absent calls keep the historical resolve.
      // The passed element is the stored request target.
      const ceFieldSource = applicationContext?.fieldSource?.targetKind === 'contenteditable'
        ? applicationContext.fieldSource
        : null;
      if (ceFieldSource && element.isContentEditable) {
        field = element;
      }

      if (!field) {
        if (this.isDMElement(element)) {
          field = element.closest('[data-testid="dmComposerTextInput"]') || 
                 (element.getAttribute('role') === 'textbox' ? element : null);
        } else if (this.isTwitterElement(element)) {
          field = element.closest('[data-testid="tweetTextarea_0"]');
        }
      }

      // Fallback: If no specific field found but the element itself looks like a Twitter editor or a standard input
      if (!field && element && (element.isContentEditable || element.tagName === 'TEXTAREA' || element.tagName === 'INPUT')) {
        field = element;
      }

      if (field) {
        field.focus();
        await this.applyVisualFeedback(field);
        if (!isCurrent()) return false;
        
        await smartDelay(50);
        if (!isCurrent()) return false;
        
        const isDraftJS = this.isTwitterElement(element) || this.isDMElement(element);
        // Request-time CE selection scope replaces only the captured bookmark
        // range (centrally restored into the live selection below): a select-all
        // here would wipe it and full-replace a partial request. Full and
        // legacy scopes keep the historical select-all for Draft.js state.
        const isScopedCESelection = applicationContext?.fieldSource?.scope === 'selection'
          && (applicationContext?.fieldSource?.targetKind ?? 'native') === 'contenteditable';

        if (isDraftJS && !isScopedCESelection) {
          // هک برای Draft.js توییتر (توییت و DM): انتخاب کل
          // به جای حذف جداگانه، اجازه می‌دهیم insertText خودش جایگزین کند تا State ادیتور به هم نریزد
          document.execCommand('selectAll', false, null);
          await smartDelay(20);
          if (!isCurrent()) return false;
        }

        // Observe input notifications during the shared replace: paste-style
        // layers rely on editor-handled events and emit none themselves, while
        // direct-mutation layers emit input/change. Dispatch the manual input
        // nudge below only when nothing was observed (exactly-once, no dups).
        let observedInput = false;
        const markObservedInput = () => { observedInput = true; };
        field.addEventListener('input', markObservedInput);
        // استفاده از جایگزینی هوشمند متن (جایگزین clearTweetField و pasteText)
        // The observer is always detached (success, false, throw, stale).
        let success = false;
        try {
          success = await smartTextReplacement(field, translatedText, null, null, undefined, applicationContext);
        } finally {
          field.removeEventListener('input', markObservedInput);
        }

        if (success) {
          if (!isCurrent()) return false;
          // برای توییتر/Draft.js، فقط اگر لازم بود مکان‌نما را تنظیم می‌کنیم
          if (!isDraftJS) {
            this.setCursorToEnd(field);
          } else if (!observedInput) {
            // برای توییتر، اجبار به بروزرسانی State با ارسال رویداد input —
            // فقط وقتی پایپ‌لاین خودش هیچ input منتشر نکرده باشد.
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
