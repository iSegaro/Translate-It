// src/utils/framework-compat/text-insertion/strategies/before-input.js

import { logME } from "../../../helpers.js";
import { smartDelay } from "../helpers.js";

/**
 * تلاش برای تزریق با beforeinput event (مدرن)
 * @param {HTMLElement} element - المان هدف
 * @param {string} text - متن برای درج
 * @param {boolean} hasSelection - آیا انتخاب دارد
 * @returns {Promise<boolean>}
 */
export async function tryBeforeInputInsertion(element, text, hasSelection) {
  try {
    logME("[tryBeforeInputInsertion] Attempting beforeinput event simulation");

    // بررسی پشتیبانی از beforeinput
    if (typeof InputEvent === "undefined") {
      logME("[tryBeforeInputInsertion] InputEvent not supported");
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
      logME("[tryBeforeInputInsertion] beforeinput was prevented");
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
    logME("[tryBeforeInputInsertion] Error:", error);
    return false;
  }
}
