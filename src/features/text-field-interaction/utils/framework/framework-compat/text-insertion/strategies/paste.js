// src/utils/framework-compat/text-insertion/strategies/paste.js

import { smartDelay } from "../helpers.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.FRAMEWORK, 'paste');


/**
 * تلاش برای جایگذاری با Paste Event (روش قدیمی)
 */
export async function tryPasteInsertion(element, text, hasSelection, applicationContext = null) {
  const isCurrent = applicationContext?.isCurrent || (() => true);
  if (!isCurrent()) return false;
  try {
  logger.debug('Attempting paste event simulation');

    // ایجاد DataTransfer object
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", text);

    // ایجاد paste event
    const pasteEvent = new ClipboardEvent("paste", {
      clipboardData,
      bubbles: true,
      cancelable: true,
      composed: true,
    });

    // اضافه کردن ویژگی‌های اضافی برای سازگاری بیشتر
    Object.defineProperties(pasteEvent, {
      data: { value: text, writable: false },
      dataType: { value: "text/plain", writable: false },
    });

    // اگر انتخاب ندارد، کل محتوا را انتخاب کن (برای حفظ undo)
    if (!hasSelection) {
      if (element.isContentEditable && typeof window !== 'undefined') {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
  logger.debug('Selected all content in contentEditable for undo preservation');
      } else {
        element.setSelectionRange(0, element.value.length);
  logger.debug('Selected all content in input/textarea for undo preservation');
      }
    }

    // ارسال event
    if (!isCurrent()) return false;
    element.dispatchEvent(pasteEvent);

    // تأیید موفقیت
    await smartDelay(100);
    if (!isCurrent()) return false;

    // بررسی اینکه متن واقعاً اضافه شده
    const currentText =
      element.isContentEditable ?
        element.textContent || element.innerText
      : element.value;

    if (currentText && currentText.includes(text)) {
  logger.init('Success verified');
      clipboardData.clearData();
      return true;
    }

    clipboardData.clearData();
    return false;
  } catch (error) {
    logger.warn('Error:', error);
    return false;
  }
}
