// src/utils/framework-compat/text-insertion/strategies/paste-optimized.js

import { smartDelay } from "../helpers.js";

// Lazy logger to avoid initialization order issues
let _logger;
const getLogger = () => {
  if (!_logger) {
    _logger = createLogger(LOG_COMPONENTS.BACKGROUND, 'paste-optimized');
  }
  return _logger;
};

import { createLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';


/**
 * تلاش برای جایگذاری با Paste Event بهینه‌شده (الهام از example.js)
 */
export async function tryOptimizedPasteInsertion(element, text, hasSelection) {
  try {
    getLogger().debug('Attempting optimized paste insertion');

    // ایجاد DataTransfer object
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", text);

    // ایجاد paste event
    const pasteEvent = new ClipboardEvent("paste", {
      clipboardData,
      data: text,
      dataType: "text/plain",
      bubbles: true,
      cancelable: true,
      composed: true,
    });

    // ویژگی ویژه برای Google Docs (از example.js)
    if (window.location.hostname.includes("docs.google.com")) {
      pasteEvent.docs_plus_ = true;
    }

    // اگر انتخاب ندارد، کل محتوا را انتخاب کن
    if (!hasSelection) {
      if (element.isContentEditable) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
        getLogger().debug('Selected all content in contentEditable');
      } else {
        element.setSelectionRange(0, element.value.length);
        getLogger().debug('Selected all content in input/textarea');
      }
    }

    // Focus element
    element.focus();
    await smartDelay(10);

    // ارسال event
    element.dispatchEvent(pasteEvent);

    // کمی صبر کن تا event پردازش شود
    await smartDelay(100);

    // تنظیف clipboard data
    clipboardData.clearData();

    // بررسی موفقیت
    const currentText =
      element.isContentEditable ?
        element.textContent || element.innerText
      : element.value;

    const success = currentText && currentText.includes(text);

    if (success) {
      getLogger().init('Optimized paste succeeded');
      return true;
    }

    return false;
  } catch (error) {
    getLogger().error('Error:', error);
    return false;
  }
}
