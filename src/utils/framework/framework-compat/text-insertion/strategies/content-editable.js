// src/utils/framework-compat/text-insertion/strategies/content-editable.js

import { smartDelay } from "../helpers.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.FRAMEWORK, 'content-editable');


/**
 * روش عمومی contentEditable (با حفظ undo)
 */
export async function tryContentEditableInsertion(element, text, hasSelection) {
  try {
  logger.debug('Attempting contentEditable insertion with undo preservation');

    // Focus element
    element.focus();
    await smartDelay(10);

    const selection = window.getSelection();

    // اگر انتخاب ندارد، کل محتوا را انتخاب کن
    if (!hasSelection) {
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
      await smartDelay(10);
  logger.debug('Selected all content for full replacement');
    }

    // تلاش برای استفاده از execCommand برای حفظ undo
    if (
      typeof document.execCommand === "function" &&
      selection.rangeCount > 0
    ) {
      // حذف محتوای انتخاب شده
      const deleteResult = document.execCommand("delete", false);
      await smartDelay(10);

      if (deleteResult) {
        // درج متن جدید با حفظ خطوط جدید
        const lines = text.split("\n");
        let insertSuccess = true;

        for (let i = 0; i < lines.length; i++) {
          if (i > 0) {
            // اضافه کردن line break
            const brResult = document.execCommand("insertHTML", false, "<br>");
            if (!brResult) insertSuccess = false;
          }

          if (lines[i]) {
            // اضافه کردن خط متن
            const textResult = document.execCommand(
              "insertText",
              false,
              lines[i]
            );
            if (!textResult) insertSuccess = false;
          }
        }

        if (insertSuccess) {
          logger.init('Used execCommand for undo preservation');

          // رویدادهای ضروری
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));

          return true;
        }
      }
    }

    // fallback: جایگزینی مستقیم (بدون undo)
  logger.debug('Falling back to direct DOM manipulation (no undo)');

    if (hasSelection && selection.rangeCount > 0) {
      // جایگزینی انتخاب
      const range = selection.getRangeAt(0);
      range.deleteContents();

      // تبدیل متن به HTML ساده با حفظ خطوط جدید
      const lines = text.split("\n");
      const fragment = document.createDocumentFragment();

      lines.forEach((line, index) => {
        if (index > 0) {
          fragment.appendChild(document.createElement("br"));
        }
        if (line) {
          fragment.appendChild(document.createTextNode(line));
        }
      });

      range.insertNode(fragment);

      // تنظیم cursor بعد از متن
      range.setStartAfter(fragment.lastChild || fragment);
      range.setEndAfter(fragment.lastChild || fragment);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      // جایگزینی کل محتوا
      element.textContent = "";
      const lines = text.split("\n");

      lines.forEach((line, index) => {
        if (index > 0) {
          element.appendChild(document.createElement("br"));
        }
        if (line) {
          element.appendChild(document.createTextNode(line));
        }
      });

      // تنظیم cursor در انتها
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    // رویدادهای ضروری
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));

    return true;
  } catch (error) {
  logger.error('Error:', error);
    return false;
  }
}