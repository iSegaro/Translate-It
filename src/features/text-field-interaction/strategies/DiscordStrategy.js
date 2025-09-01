// src/features/text-field-interaction/strategies/DiscordStrategy.js

import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import PlatformStrategy from "./PlatformStrategy.js";
import { delay} from "@/core/helpers.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'DiscordStrategy');


export default class DiscordStrategy extends PlatformStrategy {
  constructor(notifier, errorHandler) {
    super(notifier);
    this.errorHandler = errorHandler;
  }

  extractText(target) {
    try {
      if (!target || !(target instanceof HTMLElement)) return "";
      if (target.isContentEditable) {
        return target.innerText?.trim?.() || "";
      }
      return target.value?.trim?.() || target.textContent?.trim?.() || "";
    } catch (error) {
      this.errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "discord-strategy-extractText",
      });
      return "";
    }
  }

  /**
   * تشخیص ادیتور Slate.js دیسکورد
   */
  _isSlateEditor(element) {
    return (
      element.hasAttribute("data-slate-editor") &&
      element.hasAttribute("data-slate-node") &&
      element.getAttribute("data-slate-node") === "value"
    );
  }

  /**
   * پیدا کردن React Fiber برای دسترسی به instance کامپوننت
   */
  _getReactFiber(element) {
    const fiberKey = Object.keys(element).find(
      (key) =>
        key.startsWith("__reactInternalInstance") ||
        key.startsWith("__reactFiber"),
    );
    return fiberKey ? element[fiberKey] : null;
  }

  /**
   * پیدا کردن Slate editor instance از React
   */
  _getSlateEditor(element) {
    try {
      const fiber = this._getReactFiber(element);
      if (!fiber) return null;

      // جستجو در fiber tree برای پیدا کردن Slate editor
      let currentFiber = fiber;
      let attempts = 0;
      const maxAttempts = 50;

      while (currentFiber && attempts < maxAttempts) {
        attempts++;

        // بررسی props و state برای Slate editor
        if (currentFiber.memoizedProps) {
          const props = currentFiber.memoizedProps;
          if (props.editor && typeof props.editor === "object") {
            if (props.editor.children || props.editor.operations) {
              return props.editor;
            }
          }
        }

        if (currentFiber.stateNode && currentFiber.stateNode.editor) {
          return currentFiber.stateNode.editor;
        }

        // ادامه جستجو در والدین
        currentFiber =
          currentFiber.return ||
          currentFiber._debugOwner ||
          currentFiber.parent;
      }

      return null;
    } catch (error) {
      logger.debug('خطا در _getSlateEditor:', error);
      return null;
    }
  }

  /**
   * به‌روزرسانی محتوا از طریق Slate API
   */
  async _updateViaSlateAPI(element, translatedText) {
    try {
      const slateEditor = this._getSlateEditor(element);
      if (!slateEditor) {
        logger.debug('Slate editor instance پیدا نشد');
        return false;
      }

      logger.debug('Slate editor instance پیدا شد');

      // تلاش برای استفاده از Slate Transforms
      if (window.Slate && window.Slate.Transforms) {
        const { Transforms, Editor } = window.Slate;

        // انتخاب تمام محتوا
        Transforms.select(slateEditor, {
          anchor: Editor.start(slateEditor, []),
          focus: Editor.end(slateEditor, []),
        });

        // حذف محتوای فعلی
        Transforms.delete(slateEditor);

        // درج متن جدید
        Transforms.insertText(slateEditor, translatedText);

        logger.debug('محتوا از طریق Slate API به‌روزرسانی شد');
        return true;
      }

      return false;
    } catch (error) {
      logger.debug('خطا در _updateViaSlateAPI:', error);
      return false;
    }
  }

  /**
   * شبیه‌سازی تایپ طبیعی کاربر
   */
  async _simulateNaturalTyping(element, translatedText) {
    try {
      element.focus();
      await delay(50);

      // انتخاب تمام محتوا
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
      }

      // شبیه‌سازی کلید حذف برای پاک کردن محتوا
      const deleteEvents = [
        new KeyboardEvent("keydown", {
          key: "Backspace",
          keyCode: 8,
          bubbles: true,
          cancelable: true,
        }),
        new KeyboardEvent("keyup", {
          key: "Backspace",
          keyCode: 8,
          bubbles: true,
          cancelable: true,
        }),
      ];

      for (const event of deleteEvents) {
        element.dispatchEvent(event);
        await delay(10);
      }

      // شبیه‌سازی تایپ کردن متن جدید
      for (let i = 0; i < translatedText.length; i++) {
        const char = translatedText[i];

        // رویداد keydown
        element.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: char,
            bubbles: true,
            cancelable: true,
          }),
        );

        // رویداد beforeinput
        element.dispatchEvent(
          new InputEvent("beforeinput", {
            inputType: "insertText",
            data: char,
            bubbles: true,
            cancelable: true,
          }),
        );

        // رویداد input
        element.dispatchEvent(
          new InputEvent("input", {
            inputType: "insertText",
            data: char,
            bubbles: true,
            cancelable: true,
          }),
        );

        // رویداد keyup
        element.dispatchEvent(
          new KeyboardEvent("keyup", {
            key: char,
            bubbles: true,
            cancelable: true,
          }),
        );

        // تاخیر کوتاه برای شبیه‌سازی واقعی‌تر
        if (i % 5 === 0) await delay(10);
      }

      return true;
    } catch (error) {
      logger.debug('خطا در _simulateNaturalTyping:', error);
      return false;
    }
  }

  /**
   * روش بهینه‌شده با استفاده از clipboard و سیگنال‌های مناسب
   */
  async _updateViaClipboard(element, translatedText) {
    try {
      element.focus();
      await delay(50);

      // انتخاب تمام محتوا
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
      }

      // کپی متن جدید در کلیپ‌بورد
      await navigator.clipboard.writeText(translatedText);

      // ارسال رویداد beforeinput برای paste
      const beforeInputEvent = new InputEvent("beforeinput", {
        inputType: "insertFromPaste",
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(beforeInputEvent);

      // ارسال رویداد paste
      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: new DataTransfer(),
      });

      // تنظیم داده‌های clipboard
      pasteEvent.clipboardData.setData("text/plain", translatedText);
      pasteEvent.clipboardData.setData("text/html", translatedText);

      element.dispatchEvent(pasteEvent);

      // تاخیر برای اعمال تغییرات
      await delay(100);

      // تأیید نهایی با input event
      element.dispatchEvent(
        new InputEvent("input", {
          inputType: "insertFromPaste",
          bubbles: true,
          cancelable: true,
        }),
      );

      return true;
    } catch (error) {
      logger.debug('خطا در _updateViaClipboard:', error);
      return false;
    }
  }

  /**
   * روش fallback با execCommand
   */
  async _fallbackExecCommand(element, translatedText) {
    try {
      element.focus();

      // انتخاب تمام محتوا
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
      }

      // استفاده از execCommand
      if (document.queryCommandSupported("insertText")) {
        const success = document.execCommand(
          "insertText",
          false,
          translatedText,
        );
        if (success) {
          element.dispatchEvent(
            new Event("input", { bubbles: true, cancelable: true }),
          );
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.debug('خطا در _fallbackExecCommand:', error);
      return false;
    }
  }

  async updateElement(element, translatedText) {
    if (translatedText === undefined || translatedText === null) {
      return false;
    }

    // بررسی وجود modal shortcuts
    const shortcutsModal = document.querySelector(
      ".keyboardShortcutsModal_f061f6",
    );
    if (shortcutsModal) {
      return false;
    }

    let success = false;

    try {
      logger.debug('شروع به‌روزرسانی element با متن:', translatedText.substring(0, 50) + "...",
      );

      // روش 1: استفاده از Slate API (بهترین روش)
      if (this._isSlateEditor(element)) {
        logger.debug('تلاش با Slate API...');
        success = await this._updateViaSlateAPI(element, translatedText);
      }

      // روش 2: شبیه‌سازی clipboard paste
      if (!success) {
        logger.debug('تلاش با clipboard paste...');
        success = await this._updateViaClipboard(element, translatedText);
      }

      // روش 3: شبیه‌سازی تایپ طبیعی
      if (!success) {
        logger.debug('تلاش با شبیه‌سازی تایپ...');
        success = await this._simulateNaturalTyping(element, translatedText);
      }

      // روش 4: fallback با execCommand
      if (!success) {
        logger.debug('تلاش با execCommand...');
        success = await this._fallbackExecCommand(element, translatedText);
      }

      // تأیید نهایی و تنظیمات
      if (success) {
        await delay(100);

        // بررسی صحت به‌روزرسانی
        const finalText = this.extractText(element);
        if (finalText.trim() === translatedText.trim()) {
          logger.debug('به‌روزرسانی با موفقیت تأیید شد');

          // اعمال direction
          this.applyTextDirection(element, translatedText);

          // اعمال visual feedback
          await this.applyVisualFeedback(element);

          // فوکوس مجدد برای حفظ حالت ادیتور
          element.focus();

          // تنظیم cursor در انتهای متن
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            const textNode = element.querySelector(
              '[data-slate-string="true"]',
            );
            if (textNode && textNode.firstChild) {
              range.setStart(textNode.firstChild, textNode.textContent.length);
              range.setEnd(textNode.firstChild, textNode.textContent.length);
              selection.removeAllRanges();
              selection.addRange(range);
            }
          }
        } else {
          logger.debug('متن نهایی مطابقت نداشت. انتظار:', translatedText.trim(),
            "دریافت:",
            finalText.trim(),
          );
          success = false;
        }
      }
    } catch (error) {
      logger.debug('خطای عمومی در updateElement:', error);
      success = false;
      await this.errorHandler.handle(error, {
        type: error.type || ErrorTypes.UI,
        context: "Discord-strategy-updateElement",
        errorMessage: error.message,
      });
    }

    if (!success) {
      logger.debug('همه روش‌ها ناموفق بودند');
    }

    return success;
  }
}
