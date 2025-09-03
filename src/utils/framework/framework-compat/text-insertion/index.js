// src/utils/framework-compat/text-insertion/index.js

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { checkTextSelection } from "../selectionUtils.js";
import { detectOptimalStrategy } from "./detector.js";
import {
  findTextNodeAtPosition,
  smartDelay,
  verifyTextInsertion,
} from "./helpers.js";
import {
  tryBeforeInputInsertion,
  tryContentEditableInsertion,
  tryExecCommandInsertion,
  tryGoogleDocsInsertion,
  tryInputInsertion,
  tryOptimizedPasteInsertion,
  tryPasteInsertion,
} from "./strategies/index.js";

const logger = getScopedLogger('Translation', 'TextInsertion');

/**
 * جایگذاری بهینه‌شده متن با تشخیص هوشمند استراتژی
 * @param {HTMLElement} element - المان هدف
 * @param {string} text - متن برای جایگذاری
 * @param {number} start - موقعیت شروع انتخاب (اختیاری)
 * @param {number} end - موقعیت پایان انتخاب (اختیاری)
 */
export async function optimizedTextInsertion(
  element,
  text,
  start = null,
  end = null
) {
  if (!element || !text) return false;

  const strategy = detectOptimalStrategy(element);
  const hasSelection = checkTextSelection(element);

  logger.debug('Using optimized insertion strategy', { strategy, hostname: typeof window !== 'undefined' ? window.location.hostname : '' });

  // تنظیم انتخاب در صورت نیاز
  if (start !== null && end !== null) {
    if (element.isContentEditable && typeof window !== 'undefined') {
      const selection = window.getSelection();
      const range = document.createRange();
      const textNode = findTextNodeAtPosition(element, start);
      if (textNode) {
        range.setStart(textNode, Math.min(start, textNode.textContent.length));
        range.setEnd(textNode, Math.min(end, textNode.textContent.length));
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } else {
      element.setSelectionRange(start, end);
    }
  }

  switch (strategy) {
    case "google-docs": {
      const googleDocsSuccess = await tryGoogleDocsInsertion(element, text);
      if (googleDocsSuccess) {
        logger.debug('Google Docs insertion method succeeded');
        return true;
      }
      break;
    }

    case "paste-first": {
      const pasteFirstSuccess =
        (await tryOptimizedPasteInsertion(element, text, hasSelection)) ||
        (await tryExecCommandInsertion(element, text, hasSelection));
      if (pasteFirstSuccess) {
        logger.debug('Paste-first insertion strategy succeeded');
        return true;
      }
      break;
    }

    case "exec-first": {
      const execFirstSuccess =
        (await tryExecCommandInsertion(element, text, hasSelection)) ||
        (await tryOptimizedPasteInsertion(element, text, hasSelection));
      if (execFirstSuccess) {
        logger.debug('Exec-first insertion strategy succeeded');
        return true;
      }
      break;
    }
  }

  // اگر استراتژی بهینه موفق نشد، از روش عمومی استفاده کن
  logger.debug('Falling back to universal insertion method');
  return await universalTextInsertion(element, text, start, end);
}

/**
 * جایگذاری عمومی متن - استراتژی چندلایه با تأیید موفقیت
 * استراتژی: execCommand → beforeinput → pasteText → MutationObserver → fallback
 * @param {HTMLElement} element - المان هدف
 * @param {string} text - متن برای جایگذاری
 * @param {number} start - موقعیت شروع انتخاب (اختیاری)
 * @param {number} end - موقعیت پایان انتخاب (اختیاری)
 */
export async function universalTextInsertion(
  element,
  text,
  start = null,
  end = null
) {
  if (!element || !text) return false;

  try {
    // Focus کردن المان با اطمینان
    if (document.activeElement !== element) {
      element.focus();
      await smartDelay(20);
    }

    // ذخیره محتوای اولیه برای تأیید تغییرات
    const initialContent =
      element.isContentEditable ?
        element.textContent || element.innerText
      : element.value;

    // تنظیم انتخاب در صورت نیاز یا انتخاب کل محتوا برای جایگزینی
    if (start !== null && end !== null) {
    if (element.isContentEditable && typeof window !== 'undefined') {
      // برای contentEditable از selection API استفاده کن
      const selection = window.getSelection();
      const range = document.createRange();

      // پیدا کردن text node مناسب
      const textNode = findTextNodeAtPosition(element, start);
      if (textNode) {
        range.setStart(
          textNode,
          Math.min(start, textNode.textContent.length)
        );
        range.setEnd(textNode, Math.min(end, textNode.textContent.length));
        selection.removeAllRanges();
        selection.addRange(range);
      }
      } else {
        // برای input/textarea
        element.setSelectionRange(start, end);
      }
    } else {
      // انتخاب کل محتوا برای جایگزینی کامل
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

    await smartDelay(10);

    // بررسی انتخاب موجود
    const hasSelection = checkTextSelection(element);
    logger.debug('Universal insertion initial state', {
      hasSelection,
      isContentEditable: element.isContentEditable,
      tagName: element.tagName,
      initialLength: initialContent.length,
      activeElement: document.activeElement === element,
    });

    // استراتژی 1: execCommand insertText (بهترین حفظ undo/redo)
    const execSuccess = await tryExecCommandInsertion(
      element,
      text,
      hasSelection
    );
    if (
      execSuccess &&
      (await verifyTextInsertion(element, text, initialContent))
    ) {
      logger.debug('execCommand insertion succeeded and verified');
      return true;
    }

    // استراتژی 2: Paste Event Simulation (سازگار با frameworks)
    const pasteSuccess = await tryPasteInsertion(element, text, hasSelection);
    if (
      pasteSuccess &&
      (await verifyTextInsertion(element, text, initialContent))
    ) {
      logger.debug('Paste event insertion succeeded and verified');
      return true;
    }

    // استراتژی 3: beforeinput Event Simulation (مدرن)
    const beforeInputSuccess = await tryBeforeInputInsertion(
      element,
      text,
      hasSelection
    );
    if (
      beforeInputSuccess &&
      (await verifyTextInsertion(element, text, initialContent))
    ) {
      logger.debug('beforeinput event insertion succeeded and verified');
      return true;
    }

    // استراتژی 4: Element-specific fallback methods
    if (element.isContentEditable) {
      // contentEditable عمومی
      const contentEditableSuccess = await tryContentEditableInsertion(
        element,
        text,
        hasSelection
      );
      if (
        contentEditableSuccess &&
        (await verifyTextInsertion(element, text, initialContent))
      ) {
        logger.debug('ContentEditable insertion method succeeded and verified');
        return true;
      }
    } else {
      // Input/textarea
      const inputSuccess = await tryInputInsertion(
        element,
        text,
        hasSelection,
        start,
        end
      );
      if (
        inputSuccess &&
        (await verifyTextInsertion(element, text, initialContent))
      ) {
        logger.debug('Input insertion method succeeded and verified');
        return true;
      }
    }

    logger.warn('All universal insertion methods failed verification');
    return false;
  } catch (error) {
    logger.error('Universal text insertion error', error);
    return false;
  }
}
