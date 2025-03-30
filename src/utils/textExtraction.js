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
 * @returns {Promise<number>} تعداد عناصری که با موفقیت به حالت اولیه بازگردانده شدند.
 */
export async function revertTranslations(context) {
  let successfulReverts = 0;
  let errors = [];

  // لیست آی‌دی‌های عناصری که باید بازگردانی شوند
  const idsToRevert = Array.from(context.state.originalTexts.keys());

  try {
    // ابتدا تمام عناصر را بررسی می‌کنیم تا از اتصال آنها به DOM اطمینان حاصل کنیم
    const elementsToRevert = idsToRevert.filter((uniqueId) => {
      const data = context.state.originalTexts.get(uniqueId);
      return (
        data && data.parent && data.parent.isConnected && data.originalInnerHTML
      );
    });

    // اگر هیچ عنصری برای بازگردانی نیست
    if (elementsToRevert.length === 0) {
      if (await IsDebug()) {
        context.notifier.show("هیچ متنی برای بازگردانی یافت نشد", "warning");
      }
      return 0;
    }

    // بازگردانی عناصر
    for (const uniqueId of elementsToRevert) {
      try {
        const data = context.state.originalTexts.get(uniqueId);

        // استفاده از روش ایمن‌تر برای بازگردانی
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = data.originalInnerHTML;

        // حفظ ویژگی‌های عنصر اصلی به جز محتوای داخلی
        const parentAttributes = data.parent.attributes;
        const attributesToPreserve = {};

        for (let i = 0; i < parentAttributes.length; i++) {
          const attr = parentAttributes[i];
          // ذخیره تمام ویژگی‌ها به جز ویژگی خاص افزونه
          if (attr.name !== "AIWritingCompanion-data-original-text-id") {
            attributesToPreserve[attr.name] = attr.value;
          }
        }

        // جایگزینی محتوا
        while (data.parent.firstChild) {
          data.parent.removeChild(data.parent.firstChild);
        }

        while (tempDiv.firstChild) {
          data.parent.appendChild(tempDiv.firstChild);
        }

        // حذف ویژگی خاص افزونه
        data.parent.removeAttribute("AIWritingCompanion-data-original-text-id");

        // بازگرداندن جهت متن به حالت اول
        _resetTextDirection(data.parent);

        successfulReverts++;
      } catch (error) {
        errors.push({
          error,
          uniqueId,
          message: `Failed to revert element with ID: ${uniqueId}`,
        });

        context.errorHandler.handle(error, {
          type: ErrorTypes.PARSE_TEXT,
          context: "revert-translations",
          elementId: uniqueId,
        });
      }
    }

    // نمایش نتیجه به کاربر
    if (successfulReverts > 0) {
      context.notifier.show(`${successfulReverts}`, "revert");
    } else if (errors.length > 0) {
      context.notifier.show("خطا در بازگردانی متن‌ها", "error");
      if (await IsDebug()) {
        console.error("Translation reversion errors:", errors);
      }
    }
  } catch (error) {
    context.errorHandler.handle(error, {
      type: ErrorTypes.UI,
      context: "revert-translations-main",
    });
  } finally {
    // پاکسازی state برای عناصری که با موفقیت بازگردانی شدند
    // به جای پاکسازی کل state، فقط عناصر موفق را حذف می‌کنیم
    // این کار امکان تلاش مجدد برای عناصر ناموفق را فراهم می‌کند

    if (successfulReverts === context.state.originalTexts.size) {
      // اگر همه عناصر بازگردانی شدند، کل state را پاک می‌کنیم
      context.state.originalTexts.clear();
      context.IconManager?.cleanup();
    } else {
      // فقط عناصر موفق را حذف می‌کنیم
      idsToRevert.forEach((uniqueId) => {
        if (errors.findIndex((e) => e.uniqueId === uniqueId) === -1) {
          context.state.originalTexts.delete(uniqueId);
        }
      });

      // اگر تمام عملیات‌ها ناموفق بودند، نمایش خطا
      if (successfulReverts === 0 && context.state.originalTexts.size > 0) {
        if (await IsDebug()) {
          console.error(
            "Failed to revert any translations. Keeping state for retry."
          );
        }
      }
    }
  }

  return successfulReverts;
}

function _resetTextDirection(element) {
  if (element && element.hasAttribute("dir")) {
    element.removeAttribute("dir");
  }

  // اگر کلاس‌های مرتبط با جهت متن وجود دارند، آن‌ها را حذف کنید
  if (element) {
    element.classList.remove("rtl-text", "ltr-text");
    // هر کلاس دیگری که ممکن است توسط IconManager اضافه شده باشد
  }
}
