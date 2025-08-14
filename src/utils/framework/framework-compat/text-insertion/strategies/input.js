// src/utils/framework-compat/text-insertion/strategies/input.js

import { smartDelay } from "../helpers.js";

// Lazy logger to avoid initialization order issues
let _logger;
const getLogger = () => {
  if (!_logger) {
    _logger = createLogger(LOG_COMPONENTS.BACKGROUND, 'input');
  }
  return _logger;
};

import { createLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';


/**
 * روش عمومی input/textarea (با حفظ undo)
 */
export async function tryInputInsertion(element, text, hasSelection, start, end) {
  try {
    getLogger().debug('Attempting input/textarea insertion with undo preservation');

    // Focus element
    element.focus();
    await smartDelay(10);

    const currentValue = element.value || "";
    let startPos, endPos;

    if (start !== null && end !== null) {
      startPos = start;
      endPos = end;
    } else if (hasSelection) {
      startPos = element.selectionStart;
      endPos = element.selectionEnd;
    } else {
      startPos = 0;
      endPos = currentValue.length;
    }

    // تنظیم انتخاب
    element.setSelectionRange(startPos, endPos);
    await smartDelay(10);

    // تلاش برای استفاده از execCommand برای حفظ undo
    if (typeof document.execCommand === "function") {
      const execResult = document.execCommand("insertText", false, text);
      if (execResult) {
        getLogger().init('Used execCommand for undo preservation');

        // رویدادهای ضروری
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));

        return true;
      }
    }

    // fallback: جایگزینی مستقیم (بدون undo)
    getLogger().debug('Falling back to direct value assignment (no undo)');
    const newValue =
      currentValue.substring(0, startPos) +
      text +
      currentValue.substring(endPos);
    element.value = newValue;

    // تنظیم cursor
    const newCursorPosition = startPos + text.length;
    element.setSelectionRange(newCursorPosition, newCursorPosition);

    // رویدادهای ضروری
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));

    return true;
  } catch (error) {
    getLogger().error('Error:', error);
    return false;
  }
}
