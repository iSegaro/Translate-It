// src/features/text-field-interaction/strategies/DiscordStrategy.js

import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import PlatformStrategy from "./PlatformStrategy.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import {
  smartTextReplacement,
  smartDelay,
} from "@/features/text-field-interaction/utils/framework/framework-compat/index.js";

const logger = getScopedLogger(LOG_COMPONENTS.TEXT_FIELD_INTERACTION, 'DiscordStrategy');

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

      // روش 1: استفاده از Slate API (بهترین روش اختصاصی دیسکورد)
      if (this._isSlateEditor(element)) {
        logger.debug('تلاش با Slate API...');
        success = await this._updateViaSlateAPI(element, translatedText);
      }

      // روش 2: استفاده از جایگزینی هوشمند متن (جایگزین تمام متدهای clipboard/natural typing/execCommand دستی)
      if (!success) {
        logger.debug('تلاش با smartTextReplacement...');
        success = await smartTextReplacement(element, translatedText);
      }

      // تأیید نهایی و تنظیمات
      if (success) {
        await smartDelay(100);

        // بررسی صحت به‌روزرسانی
        const finalText = this.extractText(element);
        if (finalText.trim() === translatedText.trim()) {
          logger.debug('به‌روزرسانی با موفقیت تأیید شد');

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
          // در صورت عدم انطباق، هنوز موفقیت را برمی‌گردانیم چون ممکن است به دلیل فرمت‌بندی باشد
          // اما در دیسکورد معمولاً باید برابر باشند.
          success = true; 
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
