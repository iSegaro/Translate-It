// src/utils/framework-compat/text-insertion/helpers.js

import { getScopedLogger } from '@/shared/logging/logger.js';
const logger = getScopedLogger("Background", 'helpers');


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
    
    // بررسی اضافی: اگر محتوا فقط متن ترجمه شده باشد (حالت جایگزینی کامل)
    const isCompleteReplacement = currentText === expectedText;
    
    // بررسی اینکه آیا متن در فیلد به‌روزرسانی شده یا خیر
    const hasAnyChange = currentText !== initialContent;

  logger.debug('Verification details', {
      hasNewText,
      contentChanged,
      isCompleteReplacement,
      hasAnyChange,
      currentText: currentText?.substring(0, 50) + (currentText?.length > 50 ? '...' : ''),
      expectedText: expectedText?.substring(0, 50) + (expectedText?.length > 50 ? '...' : ''),
      initialContent: initialContent?.substring(0, 50) + (initialContent?.length > 50 ? '...' : ''),
      currentLength: currentText?.length || 0,
      initialLength: initialContent.length,
      expectedTextLength: expectedText.length,
      currentTextFull: currentText, // Full text for debugging
      expectedTextFull: expectedText, // Full text for debugging
    });

    // موفقیت در صورتی که یکی از شرایط زیر برقرار باشد:
    // 1. متن مورد انتظار در محتوای فعلی موجود باشد
    // 2. محتوای فعلی دقیقاً همان متن مورد انتظار باشد (جایگزینی کامل)
    // 3. هر نوع تغییری نسبت به محتوای اولیه رخ داده باشد
    const isSuccess = hasNewText || isCompleteReplacement || hasAnyChange;
    
    logger.debug(`Final result: ${isSuccess ? 'SUCCESS' : 'FAILED'}`);
    
    return isSuccess;
  } catch (error) {
  logger.error('Error:', error);
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
  logger.error('Error:', error);
    return element.firstChild || element;
  }
}

/**
 * تاخیر ساده
 */
export function smartDelay(baseDelay = 100) {
  return new Promise((resolve) => setTimeout(resolve, baseDelay));
}
