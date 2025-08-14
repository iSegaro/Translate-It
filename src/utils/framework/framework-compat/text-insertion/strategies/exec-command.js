// src/utils/framework-compat/text-insertion/strategies/exec-command.js

import { smartDelay } from "../helpers.js";
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'exec-command');


/**
 * تلاش برای جایگذاری با execCommand (بهترین روش برای حفظ undo)
 */
export async function tryExecCommandInsertion(element, text, hasSelection) {
  try {
    // بررسی پشتیبانی از execCommand
    if (typeof document.execCommand !== "function") {
      return false;
    }

  logger.debug('Attempting execCommand insertText', {
      hasSelection,
      isContentEditable: element.isContentEditable,
      tagName: element.tagName,
    });

    // Focus element first
    element.focus();
    await smartDelay(10);

    // برای input/textarea
    if (!element.isContentEditable) {
      if (hasSelection) {
        // اگر انتخاب دارد، مستقیماً جایگزین کن
        const result = document.execCommand("insertText", false, text);
        if (result) {
          logger.init('execCommand succeeded for input/textarea with selection');
          await smartDelay(50);
          return true;
        }
      } else {
        // اگر انتخاب ندارد، ابتدا همه را انتخاب کن سپس جایگزین کن
        element.setSelectionRange(0, element.value.length);
        await smartDelay(10);
        const result = document.execCommand("insertText", false, text);
        if (result) {
          logger.init('execCommand succeeded for input/textarea full replacement');
          await smartDelay(50);
          return true;
        }
      }
    }

    // برای contentEditable
    if (element.isContentEditable) {
      const selection = window.getSelection();

      if (hasSelection && selection && !selection.isCollapsed) {
        // اگر انتخاب دارد، حذف سپس درج
        const deleteResult = document.execCommand("delete", false);
        await smartDelay(10);
        const insertResult = document.execCommand("insertText", false, text);
        if (deleteResult && insertResult) {
          logger.init('execCommand succeeded for contentEditable with selection');
          await smartDelay(50);
          return true;
        }
      } else {
        // اگر انتخاب ندارد، ابتدا همه را انتخاب کن
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
        await smartDelay(10);

        // حذف محتوای انتخاب شده
        const deleteResult = document.execCommand("delete", false);
        await smartDelay(10);

        // درج متن جدید
        const insertResult = document.execCommand("insertText", false, text);
        if (deleteResult && insertResult) {
          logger.init('execCommand succeeded for contentEditable full replacement');
          await smartDelay(50);
          return true;
        }
      }
    }

    return false;
  } catch (error) {
  logger.error('Error:', error);
    return false;
  }
}
