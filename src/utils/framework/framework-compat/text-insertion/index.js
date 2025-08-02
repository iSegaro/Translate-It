// src/utils/framework-compat/text-insertion/index.js

import { logME } from "../../../core/helpers.js";
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

  logME(
    "[optimizedTextInsertion] Using strategy:",
    strategy,
    "for",
    window.location.hostname
  );

  // تنظیم انتخاب در صورت نیاز
  if (start !== null && end !== null) {
    if (element.isContentEditable) {
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
        logME("[optimizedTextInsertion] ✅ Google Docs method succeeded");
        return true;
      }
      break;
    }

    case "paste-first": {
      const pasteFirstSuccess =
        (await tryOptimizedPasteInsertion(element, text, hasSelection)) ||
        (await tryExecCommandInsertion(element, text, hasSelection));
      if (pasteFirstSuccess) {
        logME("[optimizedTextInsertion] ✅ Paste-first strategy succeeded");
        return true;
      }
      break;
    }

    case "exec-first": {
      const execFirstSuccess =
        (await tryExecCommandInsertion(element, text, hasSelection)) ||
        (await tryOptimizedPasteInsertion(element, text, hasSelection));
      if (execFirstSuccess) {
        logME("[optimizedTextInsertion] ✅ Exec-first strategy succeeded");
        return true;
      }
      break;
    }
  }

  // اگر استراتژی بهینه موفق نشد، از روش عمومی استفاده کن
  logME("[optimizedTextInsertion] Falling back to universal method");
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
    // Focus کردن المان
    element.focus();
    await smartDelay(10);

    // ذخیره محتوای اولیه برای تأیید تغییرات
    const initialContent =
      element.isContentEditable ?
        element.textContent || element.innerText
      : element.value;

    // تنظیم انتخاب در صورت نیاز
    if (start !== null && end !== null) {
      if (element.isContentEditable) {
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
    }

    // بررسی انتخاب موجود
    const hasSelection = checkTextSelection(element);
    logME("[universalTextInsertion] Initial state:", {
      hasSelection,
      isContentEditable: element.isContentEditable,
      tagName: element.tagName,
      initialLength: initialContent.length,
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
      logME("[universalTextInsertion] ✅ execCommand succeeded and verified");
      return true;
    }

    // استراتژی 2: Paste Event Simulation (سازگار با frameworks)
    const pasteSuccess = await tryPasteInsertion(element, text, hasSelection);
    if (
      pasteSuccess &&
      (await verifyTextInsertion(element, text, initialContent))
    ) {
      logME("[universalTextInsertion] ✅ Paste event succeeded and verified");
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
      logME(
        "[universalTextInsertion] ✅ beforeinput event succeeded and verified"
      );
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
        logME(
          "[universalTextInsertion] ✅ ContentEditable method succeeded and verified"
        );
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
        logME(
          "[universalTextInsertion] ✅ Input method succeeded and verified"
        );
        return true;
      }
    }

    logME("[universalTextInsertion] ❌ All methods failed verification");
    return false;
  } catch (error) {
    logME("[universalTextInsertion] Error:", error);
    return false;
  }
}
