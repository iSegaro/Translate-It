// src/utils/framework-compat/text-insertion/helpers.js

import { logME } from "../../../core/helpers.js";

/**
 * تأیید موفقیت‌آمیز بودن تزریق متن
 * @param {HTMLElement} element - المان هدف
 * @param {string} expectedText - متن مورد انتظار
 * @param {string} initialContent - محتوای اولیه برای مقایسه
 * @returns {Promise<boolean>}
 */
export async function verifyTextInsertion(element, expectedText, initialContent = "") {
  try {
    await smartDelay(50); // اجازه به DOM برای به‌روزرسانی

    const currentText =
      element.isContentEditable ?
        element.textContent || element.innerText
      : element.value;

    // بررسی که متن جدید اضافه شده یا تغییری رخ داده
    const hasNewText = currentText && currentText.includes(expectedText);
    const contentChanged = currentText !== initialContent;

    logME("[verifyTextInsertion]", {
      hasNewText,
      contentChanged,
      currentLength: currentText?.length || 0,
      initialLength: initialContent.length,
      expectedTextLength: expectedText.length,
    });

    return hasNewText && contentChanged;
  } catch (error) {
    logME("[verifyTextInsertion] Error:", error);
    return false;
  }
}

/**
 * پیدا کردن text node در موقعیت مشخص
 */
export function findTextNodeAtPosition(element, position) {
  try {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let currentPos = 0;
    let node;

    while ((node = walker.nextNode())) {
      const length = node.textContent.length;
      if (currentPos + length >= position) {
        return node;
      }
      currentPos += length;
    }

    return element.firstChild || element;
  } catch (error) {
    logME("[findTextNodeAtPosition] Error:", error);
    return element.firstChild || element;
  }
}

/**
 * تاخیر ساده
 */
export function smartDelay(baseDelay = 100) {
  return new Promise((resolve) => setTimeout(resolve, baseDelay));
}
