import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import PlatformStrategy from "./PlatformStrategy.js";
import { delay} from "@/core/helpers.js";

const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'TwitterStrategy');

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

  clearTweetField(tweetField) {
    if (!tweetField) return;
    try {
      tweetField.focus();
      
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(tweetField);
      selection.removeAllRanges();
      selection.addRange(range);
      
      if (document.queryCommandSupported && document.queryCommandSupported('delete')) {
        document.execCommand('delete', false, null);
      } else {
        selection.deleteContents();
      }
      
      if (tweetField.textContent && tweetField.textContent.trim()) {
        tweetField.textContent = '';
      }
      
      tweetField.dispatchEvent(new Event('input', { bubbles: true }));
      tweetField.dispatchEvent(new Event('change', { bubbles: true }));
      
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "twitter-strategy-clearTweetField",
      });
    }
  }

  async pasteText(tweetField, text) {
    if (!tweetField || typeof text !== "string") return;
    try {
      const trimmedText = text.trim();
      tweetField.focus();
      await delay(30);

      if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
        const success = document.execCommand('insertText', false, trimmedText);
        if (success) {
          await delay(50);
          this.setCursorToEnd(tweetField);
          return;
        }
      }
      
      try {
        const selection = window.getSelection();
        const range = selection.getRangeAt(0) || document.createRange();
        
        range.deleteContents();
        
        const textNode = document.createTextNode(trimmedText);
        range.insertNode(textNode);
        
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        selection.removeAllRanges();
        selection.addRange(range);
        
      } catch (insertError) {
        tweetField.textContent = trimmedText;
      }

      tweetField.dispatchEvent(new Event('input', { bubbles: true }));
      tweetField.dispatchEvent(new Event('change', { bubbles: true }));

      await delay(50);
      this.setCursorToEnd(tweetField);
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "twitter-strategy-pasteText",
      });
      throw error;
    }
  }

  setCursorToEnd(tweetField) {
    if (!tweetField) return;
    try {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(tweetField);
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

      if (this.isDMElement(element)) {
        const dmField = element.closest('[data-testid="dmComposerTextInput"]');
        if (dmField) {
          dmField.focus();
          await this.applyVisualFeedback(dmField);
          this.clearTweetField(dmField);
          await delay(50);
          await this.pasteText(dmField, translatedText);
          return true;
        }
      }

      if (this.isTwitterElement(element)) {
        const tweetField = element.closest('[data-testid="tweetTextarea_0"]');
        if (tweetField) {
          tweetField.focus();
          
          await this.applyVisualFeedback(tweetField);
          
          this.clearTweetField(tweetField);
          await delay(50);
          
          await this.pasteText(tweetField, translatedText);

          logger.init('Tweet field updated successfully.');
          return true;
        }
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

    const result = el.tagName === "INPUT" || el.tagName === "TEXTAREA";

    return result;
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
        const field = element.querySelector(selector);

        return field;
      }

      const field = document.querySelector(selector);

      return field;
    } catch {
      return null;
    }
  }
}
