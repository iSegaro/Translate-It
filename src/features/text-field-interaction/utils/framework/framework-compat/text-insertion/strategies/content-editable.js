// src/utils/framework-compat/text-insertion/strategies/content-editable.js

import { smartDelay } from "../helpers.js";
import { buildMultilineFragment, ensureCEAim, hasScopedCESelection } from "../../contentEditableScope.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.FRAMEWORK, 'content-editable');


/**
 * روش عمومی contentEditable (با حفظ undo)
 */
export async function tryContentEditableInsertion(element, text, hasSelection, applicationContext = null) {
  const isCurrent = applicationContext?.isCurrent || (() => true);
  if (!isCurrent()) return false;
  try {
  logger.debug('Attempting contentEditable insertion with undo preservation');

    // Focus element
    element.focus();
    await smartDelay(10);
    if (!isCurrent()) return false;

    if (typeof window === 'undefined') {
      return false;
    }

    const selection = window.getSelection();

    // اگر انتخاب ندارد، کل محتوا را انتخاب کن — مگر اینکه محدوده انتخاب
    // دارای scope معتبر باشد که از قبل هدف‌گیری شده است.
    if (!hasSelection && !hasScopedCESelection(element, applicationContext)) {
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
      await smartDelay(10);
      if (!isCurrent()) return false;
  logger.debug('Selected all content for full replacement');
    }

    // تلاش برای استفاده از execCommand برای حفظ undo
    // JIT aim just before mutating: revalidate + restore the captured CE scope
    // (or fail closed) so a moved live selection cannot redirect output.
    if (!ensureCEAim(element, applicationContext)) return false;
    if (
      typeof document.execCommand === "function" &&
      selection.rangeCount > 0
    ) {
      // حذف محتوای انتخاب شده
      const deleteResult = document.execCommand("delete", false);
      await smartDelay(10);
      if (!isCurrent()) return false;

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
          if (!isCurrent()) return false;
          logger.init('Used execCommand for undo preservation');

          // رویدادهای ضروری
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));

          return true;
        }
      }
    }

    // fallback: جایگزینی مستقیم (بدون undo)
    if (!isCurrent()) return false;
    // JIT re-aim (a select-all or a moved caret above must not redirect a
    // scoped request); whitespace-scoped aims count as selections here.
    if (!ensureCEAim(element, applicationContext)) return false;
    const fallbackHasSelection = hasSelection || hasScopedCESelection(element, applicationContext);
  logger.debug('Falling back to direct DOM manipulation (no undo)');

    if (fallbackHasSelection && selection.rangeCount > 0) {
      if (!isCurrent()) return false;
      // جایگزینی انتخاب
      const range = selection.getRangeAt(0);
      range.deleteContents();

      // تبدیل متن به HTML ساده با حفظ خطوط جدید (سازنده مشترک)
      const fragment = buildMultilineFragment(text);
      const anchor = fragment.lastChild;
      range.insertNode(fragment);

      // تنظیم cursor بعد از متن
      if (anchor) {
        range.setStartAfter(anchor);
        range.setEndAfter(anchor);
      }
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      // جایگزینی کل محتوا
      if (!isCurrent()) return false;
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
    logger.warn('Error:', error);
    return false;
  }
}
