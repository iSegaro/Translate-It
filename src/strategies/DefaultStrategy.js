// src/strategies/DefaultStrategy.js

import { ErrorTypes } from "../services/ErrorTypes.js";
import PlatformStrategy from "./PlatformStrategy.js";
import { delay } from "../utils/helpers.js";
import { filterXSS } from "xss";

export default class DefaultStrategy extends PlatformStrategy {
  constructor(notifier, errorHandler) {
    super(notifier);
    this.errorHandler = errorHandler;
  }

  /**
   * استخراج متن از المان‌های استاندارد (ایمن‌سازی شده)
   */
  extractText(target) {
    try {
      if (!target || !(target instanceof Element)) return "";

      // حالت contenteditable - بررسی انتخاب متن
      if (target.isContentEditable) {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
          return selection.toString().trim();
        }
        return target.innerText?.trim?.() || "";
      }

      // حالت input/textarea - بررسی انتخاب متن
      if (["TEXTAREA", "INPUT"].includes(target.tagName)) {
        if (target.selectionStart !== target.selectionEnd) {
          return target.value.substring(target.selectionStart, target.selectionEnd).trim();
        }
        return target.value?.trim?.() || "";
      }

      // حالت fallback برای سایر المان‌ها
      return target.textContent?.trim?.() || "";
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "default-strategy-extractText",
      });
      return "";
    }
  }

  async updateElement(element, translatedText) {
    try {
      if (translatedText !== undefined && translatedText !== null) {
        this.applyVisualFeedback(element);

        // بررسی وجود انتخاب متن
        const hasSelection = this._hasTextSelection(element);

        if (element.isContentEditable) {
          if (hasSelection) {
            // جایگزینی فقط متن انتخاب شده
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed) {
              selection.deleteContents();
              const textNode = document.createTextNode(translatedText);
              selection.getRangeAt(0).insertNode(textNode);
              selection.removeAllRanges();
            }
          } else {
            // جایگزینی کل محتوا
            const htmlText = translatedText.replace(/\n/g, "<br>");
            const trustedHTML = filterXSS(htmlText, {
              whiteList: {
                br: []
              },
              stripIgnoreTag: true,
              stripIgnoreTagBody: ['script', 'style'],
              onIgnoreTagAttr: function (tag, name, value, _isWhiteAttr) {
                // Block javascript: and data: URLs
                if (name === 'href' || name === 'src') {
                  if (value.match(/^(javascript|data|vbscript):/i)) {
                    return '';
                  }
                }
                return false;
              }
            });

            const parser = new DOMParser();
            const doc = parser.parseFromString(
              trustedHTML,
              "text/html"
            );

            element.textContent = "";
            Array.from(doc.body.childNodes).forEach((node) => {
              element.appendChild(node);
            });
          }
          this.applyTextDirection(element, translatedText);
        } else {
          if (hasSelection) {
            // جایگزینی فقط متن انتخاب شده در input/textarea
            const start = element.selectionStart;
            const end = element.selectionEnd;
            const value = element.value;
            const newValue = value.substring(0, start) + translatedText + value.substring(end);
            element.value = newValue;
            
            // تنظیم موقعیت کرسر
            const newCursorPosition = start + translatedText.length;
            element.setSelectionRange(newCursorPosition, newCursorPosition);
          } else {
            // جایگزینی کل محتوا
            element.value = translatedText;
          }
          this.applyTextDirection(element, translatedText);
        }

        await delay(500);

        return true;
      }
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
      return selection && !selection.isCollapsed && selection.toString().trim().length > 0;
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
