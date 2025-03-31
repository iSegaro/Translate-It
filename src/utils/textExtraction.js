// src/utils/textExtraction.js
import { ErrorHandler, ErrorTypes } from "../services/ErrorService.js";
import { CONFIG, getDebugModeAsync, IsDebug } from "../config.js";
import { logME } from "./helpers.js";

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
 * Generates a unique ID for tracking translated elements.
 * @returns {string} A unique identifier string.
 */
function generateUniqueId() {
  // Simple but effective for runtime uniqueness within a page session
  return `aiwc-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * اعمال ترجمه‌ها با جایگزینی گره‌های متنی با عناصر span حاوی ترجمه.
 * هر span یک ID منحصر به فرد برای بازگردانی دریافت می‌کند.
 *
 * @param {Node[]} textNodes آرایه‌ای از گره‌های متنی که باید ترجمه شوند.
 * @param {Map<string, string>} translations نگاشتی از متن اصلی به متن ترجمه‌شده.
 * @param {object} context شیء context شامل state و IconManager.
 */
export function applyTranslationsToNodes(textNodes, translations, context) {
  textNodes.forEach((textNode) => {
    if (!textNode.parentNode || textNode.nodeType !== Node.TEXT_NODE) {
      return;
    }

    const originalText = textNode.textContent;
    const trimmedOriginalText = originalText.trim();
    const translatedText = translations.get(trimmedOriginalText);

    if (translatedText && trimmedOriginalText) {
      const parentElement = textNode.parentNode;
      const originalLines = originalText.split("\n");
      const translatedLines = translatedText.split("\n");
      const fragment = document.createDocumentFragment();

      originalLines.forEach((originalLine, index) => {
        const translatedLine =
          translatedLines[index] !== undefined ? translatedLines[index] : "";
        const uniqueId = generateUniqueId();
        const wrapperSpan = document.createElement("span");
        wrapperSpan.setAttribute("data-aiwc-original-id", uniqueId);
        wrapperSpan.textContent = translatedLine;

        context.state.originalTexts.set(uniqueId, {
          originalText: originalLine, // ذخیره متن خط اصلی
          wrapperElement: wrapperSpan,
        });

        context.IconManager.applyTextDirection(wrapperSpan, translatedLine);
        fragment.appendChild(wrapperSpan);

        // اضافه کردن <br> اگر این آخرین خط نیست و خط اصلی خالی نیست
        if (index < originalLines.length - 1 && originalLine.trim() !== "") {
          fragment.appendChild(document.createElement("br"));
        } else if (
          index < originalLines.length - 1 &&
          originalLine.trim() === ""
        ) {
          // برای حفظ خطوط خالی هم یک <br> اضافه می‌کنیم
          fragment.appendChild(document.createElement("br"));
        }
      });

      try {
        parentElement.replaceChild(fragment, textNode);
      } catch (error) {
        logME("AIWC Error replacing text node with fragment:", error, {
          textNode,
          fragment,
          parentElement,
        });
        originalLines.forEach((originalLine, index) => {
          const uniqueId = Array.from(context.state.originalTexts.keys()).find(
            (key) =>
              context.state.originalTexts.get(key)?.originalText ===
              originalLine
          );
          if (uniqueId) {
            context.state.originalTexts.delete(uniqueId);
          }
        });
        error = ErrorHandler.processError(error);
        context.errorHandler.handle(error, {
          type: ErrorTypes.PARSE_TEXT,
          context: "textExtraction-apply-translations-replace",
          elementId: "multiple",
        });
      }
    }
  });
}

/**
 * بازگردانی متن‌های ترجمه‌شده به حالت اولیه با جایگزینی wrapper span ها.
 *
 * @param {object} context شیء context شامل state، errorHandler و notifier.
 * @returns {Promise<number>} تعداد عناصری که با موفقیت به حالت اولیه بازگردانده شدند.
 */
export async function revertTranslations(context) {
  let successfulReverts = 0;
  let errors = [];
  const idsToRevert = Array.from(context.state.originalTexts.keys());
  const revertedIds = new Set(); // برای جلوگیری از پاک کردن state موارد ناموفق

  if (idsToRevert.length === 0) {
    if (await IsDebug()) {
      context.notifier.show("هیچ متنی برای بازگردانی یافت نشد", "warning");
    }
    return 0;
  }

  try {
    for (const uniqueId of idsToRevert) {
      const data = context.state.originalTexts.get(uniqueId);
      if (!data || !data.originalText) {
        errors.push({ uniqueId, message: "Missing data in state" });
        continue; // برو به ID بعدی اگر داده‌ها ناقص هستند
      }

      // --- تغییر کلیدی: یافتن wrapper span با شناسه ---
      const wrapperSelector = `[data-aiwc-original-id="${uniqueId}"]`;
      const wrapperSpan = document.querySelector(wrapperSelector);

      if (wrapperSpan && wrapperSpan.isConnected) {
        try {
          // ایجاد یک گره متنی جدید با متن اصلی ذخیره شده
          const originalTextNode = document.createTextNode(data.originalText);

          // جایگزینی wrapper span با گره متنی اصلی
          wrapperSpan.parentNode.replaceChild(originalTextNode, wrapperSpan);

          successfulReverts++;
          revertedIds.add(uniqueId); // علامت‌گذاری ID به عنوان موفق
        } catch (error) {
          const errorMessage = `Failed to replace wrapper span for ID: ${uniqueId}`;
          errors.push({ error, uniqueId, message: errorMessage });
          context.errorHandler.handle(error, {
            type: ErrorTypes.DOM_MANIPULATION, // یا نوع خطای مناسب دیگر
            context: "revert-translations-replace",
            elementId: uniqueId,
          });
        }
      } else {
        // اگر wrapper span پیدا نشد یا از DOM حذف شده بود
        errors.push({
          uniqueId,
          message: `Wrapper span not found or disconnected for ID: ${uniqueId}`,
        });
        logME(`AIWC: Wrapper span with ID ${uniqueId} not found for revert.`);
        // چون عنصر پیدا نشد، فرض می‌کنیم بازگردانی لازم نیست یا ممکن نیست
        // و آن را از state حذف می‌کنیم تا در تلاش‌های بعدی مشکل‌ساز نشود.
        revertedIds.add(uniqueId);
      }
    }

    // نمایش نتیجه به کاربر
    if (successfulReverts > 0) {
      context.notifier.show(`${successfulReverts} مورد بازگردانی شد`, "revert");
    } else if (errors.length > 0 && idsToRevert.length > 0) {
      if (await IsDebug()) {
        context.notifier.show("خطا در بازگردانی برخی متن‌ها", "info");
        console.warn("Translation reversion errors:", errors);
      }
    }
  } catch (error) {
    context.errorHandler.handle(error, {
      type: ErrorTypes.PARSE_TEXT,
      context: "revert-translations-main-loop",
    });
  } finally {
    // --- تغییر کلیدی: پاکسازی state ---
    // فقط ID هایی که با موفقیت بازگردانی شدند یا پیدا نشدند را از state حذف کن
    revertedIds.forEach((id) => {
      context.state.originalTexts.delete(id);
    });

    // اگر هیچ متنی در state باقی نمانده، cleanup را اجرا کن
    if (context.state.originalTexts.size === 0) {
      context.IconManager?.cleanup(); // اطمینان از وجود IconManager
    }

    if ((await IsDebug()) && context.state.originalTexts.size > 0) {
      console.warn(
        "AIWC: Some translations could not be reverted and remain in state:",
        context.state.originalTexts
      );
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
