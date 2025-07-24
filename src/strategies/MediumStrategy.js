// src/strategies/MediumStrategy.js
import { ErrorTypes } from "../services/ErrorTypes.js";
import PlatformStrategy from "./PlatformStrategy.js";
import { delay, logME } from "../utils/helpers.js";

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
      target.closest('[data-testid="editor-container"]') // اضافه کردن شناسه جدید
    );
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
   * به‌روزرسانی فیلد متنی مدیوم با پشتیبانی از انتخاب متن
   * - برای input/textarea: جایگزینی مستقیم یا انتخاب شده
   * - برای contenteditable: جایگزینی هوشمند با حفظ انتخاب
   */
  async updateElement(element, translatedText) {
    try {
      // 1. برای input/textarea
      if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
        const hasSelection = this._hasTextSelection(element);
        
        if (hasSelection) {
          // جایگزینی فقط متن انتخاب شده
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
        
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        this.applyVisualFeedback(element);
        return true;
      }

      // 2. برای فیلدهای contenteditable مدیوم
      const mediumField = this.findMediumTextField(element);
      if (!mediumField) {
        return false;
      }

      await this.safeFocus(mediumField);
      const hasSelection = this._hasTextSelection(mediumField);

      if (hasSelection) {
        // جایگزینی متن انتخاب شده
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          const textNode = document.createTextNode(translatedText);
          range.insertNode(textNode);
          
          // پاک کردن انتخاب
          selection.removeAllRanges();
          
          // ارسال رویدادهای لازم
          this.triggerStateUpdate(mediumField);
          this.applyVisualFeedback(mediumField);
          return true;
        }
      } else {
        // جایگزینی سطر فعلی
        const success = await this.replaceCurrentLine(mediumField, translatedText);
        if (success) {
          this.triggerStateUpdate(mediumField);
          this.applyVisualFeedback(mediumField);
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
        // بررسی انتخاب متن در input/textarea
        if (target.selectionStart !== target.selectionEnd) {
          const selectedText = target.value.substring(target.selectionStart, target.selectionEnd).trim();
          if (selectedText) {
            return selectedText;
          }
        }
        return target?.value?.trim?.() || "";
      }

      // تلاش برای یافتن فیلد معتبر مدیوم
      const mediumField = this.findMediumTextField(target);
      if (!mediumField) return "";

      // بررسی انتخاب متن در contenteditable
      if (mediumField.isContentEditable) {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
          // بررسی اینکه انتخاب در داخل همین المان است
          if (mediumField.contains(selection.anchorNode)) {
            const selectedText = selection.toString().trim();
            if (selectedText) {
              return selectedText;
            }
          }
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

  async safeFocus(element) {
    try {
      if (!element.isConnected) {
        return null;
      }

      element.focus({ preventScroll: true });
      await delay(150); // افزایش تاخیر برای اطمینان

      // بررسی وضعیت فوکوس
      if (document.activeElement !== element) {
        element.focus({ preventScroll: true });
        await delay(100);
      }

      return element;
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "medium-strategy-safeFocus",
      });
    }
  }

  async selectAllContent(element) {
    document.execCommand("selectAll");
    await delay(100);
    return element;
  }

  async simulatePaste(element, text) {
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    dt.setData("text/html", text.replace(/\n/g, "<br>"));

    const pasteEvent = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: dt,
    });

    element.dispatchEvent(pasteEvent);
    await delay(50);
  }

  /**
   * پیدا کردن فیلد متن مدیوم با الگوریتم پیشرفته
   */
  findMediumTextField(startElement) {
    // جستجو در سلسله مراتب والدین
    let currentElement = startElement;
    for (let i = 0; i < 5; i++) {
      // حداکثر 5 سطح بالاتر
      if (!currentElement) break;

      const candidate = currentElement.closest(
        '[role="textbox"][contenteditable="true"], [data-testid="editor-container"]'
      );
      if (candidate) return candidate;

      currentElement = currentElement.parentElement;
    }

    // جستجوی جایگزین در صورت عدم یافتن
    return document.querySelector(
      '[role="textbox"][contenteditable="true"], [data-testid="editor-container"]'
    );
  }

  /**
   * استخراج سطر فعلی (پاراگراف فعلی) بجای کل محتوا
   */
  extractCurrentLine(element) {
    try {
      const selection = window.getSelection();
      
      // اگر cursor در المان وجود دارد
      if (selection && selection.rangeCount > 0 && element.contains(selection.anchorNode)) {
        // یافتن نزدیک‌ترین div یا p به cursor
        let currentNode = selection.anchorNode;
        
        // اگر text node است، به parent برو
        if (currentNode.nodeType === Node.TEXT_NODE) {
          currentNode = currentNode.parentElement;
        }
        
        // پیدا کردن نزدیک‌ترین div یا p
        while (currentNode && currentNode !== element) {
          if (currentNode.tagName === 'DIV' || currentNode.tagName === 'P') {
            const text = currentNode.innerText?.trim();
            if (text) {
              logME('[MediumStrategy] Found current line:', text.substring(0, 50));
              return text;
            }
            break;
          }
          currentNode = currentNode.parentElement;
        }
      }
      
      // fallback: اولین div یا p غیرخالی
      const firstParagraph = element.querySelector('div, p');
      if (firstParagraph) {
        const text = firstParagraph.innerText?.trim();
        if (text) {
          logME('[MediumStrategy] Using first paragraph:', text.substring(0, 50));
          return text;
        }
      }
      
      // آخرین fallback: کل محتوا
      const fullText = element.innerText?.trim();
      logME('[MediumStrategy] Using full content as fallback:', fullText?.substring(0, 50));
      return fullText || "";
      
    } catch (error) {
      logME('[MediumStrategy] extractCurrentLine error:', error);
      return element.innerText?.trim() || "";
    }
  }

  /**
   * جایگزینی سطر فعلی بجای کل محتوا
   */
  async replaceCurrentLine(element, translatedText) {
    try {
      const selection = window.getSelection();
      
      // اگر cursor در المان وجود دارد
      if (selection && selection.rangeCount > 0 && element.contains(selection.anchorNode)) {
        // یافتن نزدیک‌ترین div یا p به cursor
        let currentNode = selection.anchorNode;
        
        // اگر text node است، به parent برو
        if (currentNode.nodeType === Node.TEXT_NODE) {
          currentNode = currentNode.parentElement;
        }
        
        // پیدا کردن نزدیک‌ترین div یا p
        while (currentNode && currentNode !== element) {
          if (currentNode.tagName === 'DIV' || currentNode.tagName === 'P') {
            // جایگزینی فقط این پاراگراف
            currentNode.innerText = translatedText;
            
            // قرار دادن cursor در انتهای متن
            const range = document.createRange();
            range.selectNodeContents(currentNode);
            range.collapse(false); // به انتها
            selection.removeAllRanges();
            selection.addRange(range);
            
            logME('[MediumStrategy] Current line replaced successfully');
            return true;
          }
          currentNode = currentNode.parentElement;
        }
      }
      
      // fallback: اولین div یا p را جایگزین کن
      const firstParagraph = element.querySelector('div, p');
      if (firstParagraph) {
        firstParagraph.innerText = translatedText;
        logME('[MediumStrategy] First paragraph replaced as fallback');
        return true;
      }
      
      // آخرین fallback: کل المان
      element.innerText = translatedText;
      logME('[MediumStrategy] Full element replaced as final fallback');
      return true;
      
    } catch (error) {
      logME('[MediumStrategy] replaceCurrentLine error:', error);
      return false;
    }
  }

  triggerStateUpdate(element) {
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
      })
    );
  }
}
