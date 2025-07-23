// src/utils/framework-compat/text-insertion/strategies/paste.js

import { logME } from "../../../helpers.js";
import { smartDelay } from "../helpers.js";

/**
 * تلاش برای جایگذاری با Paste Event (روش قدیمی)
 */
export async function tryPasteInsertion(element, text, hasSelection) {
  try {
    logME("[tryPasteInsertion] Attempting paste event simulation");

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
      if (element.isContentEditable) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
        logME(
          "[tryPasteInsertion] Selected all content in contentEditable for undo preservation"
        );
      } else {
        element.setSelectionRange(0, element.value.length);
        logME(
          "[tryPasteInsertion] Selected all content in input/textarea for undo preservation"
        );
      }
    }

    // ارسال event
    element.dispatchEvent(pasteEvent);

    // تأیید موفقیت
    await smartDelay(100);

    // بررسی اینکه متن واقعاً اضافه شده
    const currentText =
      element.isContentEditable ?
        element.textContent || element.innerText
      : element.value;

    if (currentText && currentText.includes(text)) {
      logME("[tryPasteInsertion] Success verified");
      clipboardData.clearData();
      return true;
    }

    clipboardData.clearData();
    return false;
  } catch (error) {
    logME("[tryPasteInsertion] Error:", error);
    return false;
  }
}
