// src/utils/framework-compat/index.js

import { createLogger } from "../../core/logger.js";
import { checkTextSelection } from "./selectionUtils.js";
import { simulateNaturalTyping } from "./naturalTyping.js";
import {
  universalTextInsertion,
  optimizedTextInsertion,
} from "./text-insertion/index.js";
import { handleSimpleReplacement } from "./simpleReplacement.js";

const logger = createLogger('Translation', 'TextReplacement');


/**
 * جایگزینی هوشمند متن با چندین استراتژی fallback
 * @param {HTMLElement} element - المان هدف
 * @param {string} newValue - مقدار جدید
 * @param {number} start - موقعیت شروع انتخاب (اختیاری)
 * @param {number} end - موقعیت پایان انتخاب (اختیاری)
 * @param {boolean} useNaturalTyping - استفاده از تایپ طبیعی
 */
export async function smartTextReplacement(
  element,
  newValue,
  start = null,
  end = null,
  useNaturalTyping = true
) {
  if (!element) return false;

  try {
    logger.debug('Starting text replacement with strategies', {
      tagName: element.tagName,
      isContentEditable: element.isContentEditable,
      hasSpellcheck: element.hasAttribute("spellcheck"),
      spellcheckValue: element.getAttribute("spellcheck"),
      hostname: window.location.hostname,
    });

    // استراتژی 1: Optimized Text Insertion
    const optimizedSuccess = await optimizedTextInsertion(
      element,
      newValue,
      start,
      end
    );
    if (optimizedSuccess) {
      logger.debug('Optimized text insertion succeeded');
      return true;
    }

    // استراتژی 2: Universal Text Insertion (fallback کامل)
    const universalSuccess = await universalTextInsertion(
      element,
      newValue,
      start,
      end
    );
    if (universalSuccess) {
      logger.debug('Universal text insertion succeeded');
      return true;
    }

    // استراتژی 3: Natural Typing (برای سایت‌های خاص)
    const naturalTypingSites = [
      "deepseek.com",
      "chat.openai.com",
      "claude.ai",
      "reddit.com",
    ];
    const shouldUseNaturalTyping =
      useNaturalTyping &&
      naturalTypingSites.some((site) =>
        window.location.hostname.includes(site)
      );

    if (shouldUseNaturalTyping) {
      logger.debug('Trying natural typing', { hostname: window.location.hostname });

      // بررسی انتخاب فعلی
      const hasCurrentSelection = checkTextSelection(element);

      // اگر محدوده مشخص شده یا انتخاب فعلی داریم
      if ((start !== null && end !== null) || hasCurrentSelection) {
        if (start !== null && end !== null && !element.isContentEditable) {
          element.setSelectionRange(start, end);
        }
        const success = await simulateNaturalTyping(element, newValue, 5, true);
        if (success) {
          logger.debug('Natural typing (partial replacement) succeeded');
          return true;
        }
      } else {
        const success = await simulateNaturalTyping(
          element,
          newValue,
          5,
          false
        );
        if (success) {
          logger.debug('Natural typing (full replacement) succeeded');
          return true;
        }
      }
    }

    // استراتژی 4: Simple Replacement (fallback نهایی)
    logME("[smartTextReplacement] Falling back to simple replacement");
    return handleSimpleReplacement(element, newValue, start, end);
  } catch (error) {
    logME("[smartTextReplacement] Error in smart replacement:", error);
    return false;
  }
}

// Re-export all the necessary functions for backward compatibility
export { isComplexEditor } from "./editorDetection.js";
export { checkTextSelection } from "./selectionUtils.js";
export { simulateNaturalTyping } from "./naturalTyping.js";
export {
  universalTextInsertion,
  optimizedTextInsertion,
} from "./text-insertion/index.js";
export { smartDelay } from "./text-insertion/helpers.js";
export { handleSimpleReplacement } from "./simpleReplacement.js";
