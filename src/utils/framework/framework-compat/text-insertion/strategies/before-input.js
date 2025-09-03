// src/utils/framework-compat/text-insertion/strategies/before-input.js

import { smartDelay } from "../helpers.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.FRAMEWORK, 'before-input');


/**
 * تلاش برای تزریق با beforeinput event (مدرن)
 * @param {HTMLElement} element - المان هدف
 * @param {string} text - متن برای درج
 * @param {boolean} hasSelection - آیا انتخاب دارد
 * @returns {Promise<boolean>}
 */
export async function tryBeforeInputInsertion(element, text, hasSelection) {
  try {
  logger.debug('Attempting beforeinput event simulation');

    // بررسی پشتیبانی از beforeinput
    if (typeof InputEvent === "undefined") {
  logger.debug('InputEvent not supported');
      return false;
    }

    element.focus();
    await smartDelay(10);

    // اگر انتخاب ندارد، کل محتوا را انتخاب کن
    if (!hasSelection) {
      if (element.isContentEditable && typeof window !== 'undefined') {
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
  logger.debug('beforeinput was prevented');
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
  logger.error('Error:', error);
    return false;
  }
}
