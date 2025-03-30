// src/utils/textExtraction.js
import { ErrorHandler, ErrorTypes } from "../services/ErrorService.js";
import { CONFIG, getDebugModeAsync, IsDebug } from "../config.js";

/**
 * جداسازی متن‌های موجود در حافظه کش و متن‌های جدید برای ترجمه.
 *
 * @param {Map<string, Node[]>} originalTextsMap نگاشت بین متن اصلی و گره‌های متنی مربوطه.
 * @param {Map<string, string>} translationCache حافظه کش ترجمه‌ها.
 * @returns {{textsToTranslate: string[], cachedTranslations: Map<string, string>}}
 * آرایه‌ای از متن‌های جدید برای ترجمه و نگاشتی از ترجمه‌های موجود در کش.
 */
export function separateCachedAndNewTexts(originalTextsMap, translationCache) {
  const textsToTranslate = [];
  const cachedTranslations = new Map();
  const uniqueOriginalTexts = Array.from(originalTextsMap.keys());

  uniqueOriginalTexts.forEach((text) => {
    if (translationCache.has(text)) {
      cachedTranslations.set(text, translationCache.get(text));
    } else {
      textsToTranslate.push(text);
    }
  });

  return { textsToTranslate, cachedTranslations };
}

/**
 * جمع‌آوری تمام گره‌های متنی در یک المان و ایجاد نگاشت از متن اصلی به گره‌ها.
 *
 * @param {HTMLElement} targetElement المانی که باید گره‌های متنی آن جمع‌آوری شود.
 * @returns {{textNodes: Node[], originalTextsMap: Map<string, Node[]>}}
 * آرایه‌ای از گره‌های متنی و نگاشتی از متن اصلی به لیست گره‌های متنی.
 */
export function collectTextNodes(targetElement) {
  const walker = document.createTreeWalker(
    targetElement,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  const textNodes = [];
  const originalTextsMap = new Map();
  let node;

  while ((node = walker.nextNode())) {
    const trimmedText = node.textContent.trim();
    textNodes.push(node);

    if (trimmedText) {
      if (originalTextsMap.has(trimmedText)) {
        originalTextsMap.get(trimmedText).push(node);
      } else {
        originalTextsMap.set(trimmedText, [node]);
      }
    }
  }

  return { textNodes, originalTextsMap };
}

/**
 * اعمال ترجمه‌ها به گره‌های متنی و ذخیره اطلاعات برای بازگشت به حالت قبل.
 *
 * @param {Node[]} textNodes آرایه‌ای از گره‌های متنی.
 * @param {Map<string, string>} translations نگاشتی از متن اصلی به متن ترجمه‌شده.
 * @param {object} context شیء context شامل state و IconManager.
 */
export function applyTranslationsToNodes(textNodes, translations, context) {
  textNodes.forEach((textNode) => {
    const originalText = textNode.textContent.trim();
    const translatedText = translations.get(originalText);

    if (translatedText) {
      const parentElement = textNode.parentElement;
      if (parentElement) {
        const uniqueId =
          Math.random().toString(36).substring(2, 15) +
          Math.random().toString(36).substring(2, 15);
        parentElement.setAttribute(
          "AIWritingCompanion-data-original-text-id",
          uniqueId
        );

        context.state.originalTexts.set(uniqueId, {
          originalInnerHTML: parentElement.innerHTML,
          translatedText: translatedText,
          parent: parentElement,
        });
        textNode.textContent = translatedText;
        context.IconManager.applyTextDirection(parentElement, translatedText);
      }
    }
  });
}

/**
 * بازگردانی متن‌های ترجمه‌شده به حالت اولیه.
 *
 * @param {object} context شیء context شامل state، errorHandler و notifier.
 */
export async function revertTranslations(context) {
  let successfulReverts = 0;

  try {
    for (const [uniqueId, data] of context.state.originalTexts.entries()) {
      try {
        if (!data.parent || !data.originalInnerHTML || !data.parent.isConnected)
          continue;

        data.parent.innerHTML = data.originalInnerHTML;
        successfulReverts++;
      } catch (error) {
        context.errorHandler.handle(error, {
          type: ErrorTypes.UI,
          context: "revert-translations",
          elementId: uniqueId,
        });
      }
    }

    if (successfulReverts > 0) {
      context.notifier.show(`${successfulReverts}`, "revert");
    } else {
      if ((await IsDebug()) === true) {
        context.notifier.show("هیچ متنی برای بازگردانی یافت نشد", "warning");
      }
    }
  } catch (error) {
    context.errorHandler.handle(error, {
      type: ErrorTypes.UI,
      context: "revert-translations-main",
    });
  } finally {
    // پاکسازی state
    context.state.originalTexts.clear();
    context.IconManager?.cleanup();
  }
}
