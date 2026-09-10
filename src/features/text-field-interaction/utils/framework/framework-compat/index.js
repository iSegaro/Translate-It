// src/utils/framework-compat/index.js

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { checkTextSelection } from "./selectionUtils.js";
import { resolveScopedInputRange } from "./fieldSourceSnapshot.js";
import { resolveScopedContentEditable, hasScopedCESelection } from "./contentEditableScope.js";
import { simulateNaturalTyping } from "./naturalTyping.js";
import {
  universalTextInsertion,
  optimizedTextInsertion,
} from "./text-insertion/index.js";
import { handleSimpleReplacement } from "./simpleReplacement.js";

const logger = getScopedLogger(LOG_COMPONENTS.FRAMEWORK, 'TextReplacement');

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
  useNaturalTyping = true,
  applicationContext = null
) {
  if (!element) return false;
  const isCurrent = applicationContext?.isCurrent || (() => true);
  if (!isCurrent()) return false;

  // Canonical request-time Field scope (Issue #201): when applicationContext
  // carries fieldSource for a native INPUT/TEXTAREA, the captured scope is
  // authoritative over both the passed range and the live DOM selection, so a
  // later caret/selection movement can never redirect the output. Absent
  // descriptors (legacy direct callers) flow through untouched here. A refused
  // (stale) scope must never mutate.
  const scoped = resolveScopedInputRange(element, start, end, applicationContext);
  if (scoped.refused) {
    logger.debug('Refusing scoped field replacement: stale source snapshot');
    return false;
  }
  start = scoped.start;
  end = scoped.end;

  // Same authority for contentEditable: validate the captured scope, then aim
  // the live window selection (bookmark restore for selection scope, select-all
  // for full scope) so downstream insertion layers replace exactly the aim.
  // Absent descriptors and non-CE targets pass through untouched. Layers
  // re-aim just in time via ensureCEAim before each CE mutation.
  const ceScoped = resolveScopedContentEditable(element, applicationContext);
  if (ceScoped.refused) {
    logger.debug('Refusing scoped contentEditable replacement: stale source');
    return false;
  }

  try {
    logger.debug('Starting text replacement with strategies', {
      tagName: element.tagName,
      isContentEditable: element.isContentEditable,
      hasSpellcheck: element.hasAttribute("spellcheck"),
      spellcheckValue: element.getAttribute("spellcheck"),
      hostname: typeof window !== 'undefined' ? window.location.hostname : '',
    });

    // استراتژی 1: Optimized Text Insertion
    const optimizedSuccess = await optimizedTextInsertion(
      element,
      newValue,
      start,
      end,
      applicationContext
    );
    if (!isCurrent()) return false;
    if (optimizedSuccess) {
      logger.debug('Optimized text insertion succeeded');
      return true;
    }

    // استراتژی 2: Universal Text Insertion (fallback کامل)
      const universalSuccess = await universalTextInsertion(
        element,
        newValue,
        start,
        end,
        applicationContext
      );
      if (!isCurrent()) return false;
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
      typeof window !== 'undefined' &&
      naturalTypingSites.some((site) =>
        typeof window !== 'undefined' && window.location.hostname.includes(site)
      );

    if (shouldUseNaturalTyping) {
      logger.debug('Trying natural typing', { hostname: typeof window !== 'undefined' ? window.location.hostname : '' });

      // بررسی انتخاب فعلی (whitespace-scoped aims count as selections here).
      // Note: simulateNaturalTyping itself yields without mutating for
      // explicit CE descriptors (char-by-char typing cannot hold a range);
      // simpleReplacement below remains the final scoped fallback.
      const hasCurrentSelection = checkTextSelection(element)
        || hasScopedCESelection(element, applicationContext);

      // اگر محدوده مشخص شده یا انتخاب فعلی داریم
      if ((start !== null && end !== null) || hasCurrentSelection) {
        if (start !== null && end !== null && !element.isContentEditable) {
          element.setSelectionRange(start, end);
        }
        const success = await simulateNaturalTyping(element, newValue, 5, true, applicationContext);
        if (!isCurrent()) return false;
        if (success) {
          logger.debug('Natural typing (partial replacement) succeeded');
          return true;
        }
      } else {
        const success = await simulateNaturalTyping(
          element,
          newValue,
          5,
          false,
          applicationContext
        );
        if (!isCurrent()) return false;
        if (success) {
          logger.debug('Natural typing (full replacement) succeeded');
          return true;
        }
      }
    }

    // استراتژی 4: Simple Replacement (fallback نهایی)
    logger.debug('Falling back to simple replacement');
    return handleSimpleReplacement(element, newValue, start, end, applicationContext);
  } catch (error) {
    logger.warn('Error in smart replacement:', error);
    return false;
  }
}

// Re-export all the necessary functions for backward compatibility
export { isComplexEditor } from "./editorDetection.js";
export { checkTextSelection } from "./selectionUtils.js";
export { captureFieldTranslationSource, validateFieldSourceSnapshot, getFieldSourceScope, resolveScopedInputRange, INVALID_FIELD_SCOPE } from "./fieldSourceSnapshot.js";
export {
  serializeContentEditableText,
  getContentEditableSelection,
  bookmarkContentEditableRange,
  restoreContentEditableBookmark,
  readContentEditableBookmarkText,
  validateContentEditableSelection,
  validateContentEditableFull,
  hasScopedCESelection,
  ensureCEAim,
  resolveScopedContentEditable,
  nodePathFromRoot,
  resolveNodePath,
  lineageFromRoot,
  isValidContentEditableBookmark,
  buildMultilineFragment,
} from "./contentEditableScope.js";
export { simulateNaturalTyping } from "./naturalTyping.js";
export {
  universalTextInsertion,
  optimizedTextInsertion,
} from "./text-insertion/index.js";
export { smartDelay } from "./text-insertion/helpers.js";
export { handleSimpleReplacement } from "./simpleReplacement.js";
