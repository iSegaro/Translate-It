// src/utils/framework-compat/text-insertion/strategies/before-input.js

import { smartDelay } from "../helpers.js";

// Lazy logger to avoid initialization order issues
let _logger;
const getLogger = () => {
  if (!_logger) {
    _logger = createLogger(LOG_COMPONENTS.BACKGROUND, 'before-input');
  }
  return _logger;
};

import { createLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';


/**
 * تلاش برای تزریق با beforeinput event (مدرن)
 * @param {HTMLElement} element - المان هدف
 * @param {string} text - متن برای درج
 * @param {boolean} hasSelection - آیا انتخاب دارد
 * @returns {Promise<boolean>}
 */
export async function tryBeforeInputInsertion(element, text, hasSelection) {
  try {
    getLogger().debug('Attempting beforeinput event simulation');

    // بررسی پشتیبانی از beforeinput
    if (typeof InputEvent === "undefined") {
      getLogger().debug('InputEvent not supported');
      return false;
    }

    element.focus();
    await smartDelay(10);

    // اگر انتخاب ندارد، کل محتوا را انتخاب کن
    if (!hasSelection) {
      if (element.isContentEditable) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        element.setSelectionRange(0, element.value.length);
      }
    }

    // ایجاد beforeinput event
    const beforeInputEvent = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      composed: true,
      inputType: "insertText",
      data: text,
    });

    // ارسال beforeinput
    const isAllowed = element.dispatchEvent(beforeInputEvent);
    if (!isAllowed) {
      getLogger().debug('beforeinput was prevented');
      return false;
    }

    // اگر ویرایشگر beforeinput را مدیریت نکرد، خودمان متن را درج می‌کنیم
    await smartDelay(20);

    // ارسال input event
    const inputEvent = new InputEvent("input", {
      bubbles: true,
      cancelable: false,
      composed: true,
      inputType: "insertText",
      data: text,
    });
    element.dispatchEvent(inputEvent);

    await smartDelay(50);
    return true;
  } catch (error) {
    getLogger().error('Error:', error);
    return false;
  }
}
