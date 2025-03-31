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
    // فقط گره‌های متنی که مستقیماً در DOM هستند و والد دارند را پردازش کن
    if (!textNode.parentNode || textNode.nodeType !== Node.TEXT_NODE) {
      return;
    }

    const originalText = textNode.textContent; // ذخیره متن کامل، نه فقط trim شده
    const trimmedOriginalText = originalText.trim();
    const translatedText = translations.get(trimmedOriginalText);

    // فقط در صورتی ادامه بده که متن trim شده، ترجمه داشته باشد
    if (translatedText && trimmedOriginalText) {
      const parentElement = textNode.parentNode; // والد گره متنی

      // --- تغییر کلیدی: ایجاد wrapper span ---
      const wrapperSpan = document.createElement("span");
      const uniqueId = generateUniqueId();

      // شناسه و متن ترجمه شده را به span جدید اعمال کن
      wrapperSpan.setAttribute("data-aiwc-original-id", uniqueId);
      wrapperSpan.textContent = translatedText;

      // ذخیره متن *اصلی* گره متنی (نه innerHTML والد) برای بازگردانی
      context.state.originalTexts.set(uniqueId, {
        originalText: originalText, // متن اصلی گره متنی
        // parent: parentElement, // دیگر نیازی به ذخیره والد نیست
        // originalInnerHTML: parentElement.innerHTML, // دیگر نیازی به این نیست
        wrapperElement: wrapperSpan, // مرجع به span ایجاد شده (اختیاری، برای دسترسی سریع‌تر)
      });

      // اعمال استایل‌ها (مثل جهت متن) به span جدید
      context.IconManager.applyTextDirection(wrapperSpan, translatedText);

      // جایگزینی گره متنی اصلی با span جدید در DOM
      try {
        parentElement.replaceChild(wrapperSpan, textNode);
      } catch (error) {
        console.error(
          "AIWC Error replacing text node with wrapper span:",
          error,
          { textNode, wrapperSpan, parentElement }
        );
        // اگر جایگزینی ناموفق بود، این ترجمه را از state حذف کن
        context.state.originalTexts.delete(uniqueId);
        // (می‌توانید خطا را به ErrorHandler نیز ارسال کنید)
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
        if (await IsDebug()) {
          console.warn(
            `AIWC: Wrapper span with ID ${uniqueId} not found for revert.`
          );
        }
        // چون عنصر پیدا نشد، فرض می‌کنیم بازگردانی لازم نیست یا ممکن نیست
        // و آن را از state حذف می‌کنیم تا در تلاش‌های بعدی مشکل‌ساز نشود.
        revertedIds.add(uniqueId);
      }
    }

    // نمایش نتیجه به کاربر
    if (successfulReverts > 0) {
      context.notifier.show(`${successfulReverts} مورد بازگردانی شد`, "revert"); // پیام واضح‌تر
    } else if (errors.length > 0 && idsToRevert.length > 0) {
      context.notifier.show("خطا در بازگردانی برخی متن‌ها", "error");
      if (await IsDebug()) {
        console.error("Translation reversion errors:", errors);
      }
    }
  } catch (error) {
    context.errorHandler.handle(error, {
      type: ErrorTypes.UI, // یا خطای عمومی‌تر
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
