// src/utils/textExtraction.js
import { ErrorHandler, ErrorTypes } from "../services/ErrorService.js";
import { IsDebug } from "../config.js";
import { logME } from "./helpers.js";

const translationCache = new Map();

/**
 * جداسازی متن‌های موجود در حافظه کش و متن‌های جدید برای ترجمه.
 *
 * @param {Map<string, Node[]>} originalTextsMap نگاشت بین متن اصلی و گره‌های متنی مربوطه.
 * @param {Map<string, string>} translationCache حافظه کش ترجمه‌ها.
 * @returns {{textsToTranslate: string[], cachedTranslations: Map<string, string>}}
 * آرایه‌ای از متن‌های جدید برای ترجمه و نگاشتی از ترجمه‌های موجود در کش.
 */
export function separateCachedAndNewTexts(originalTextsMap) {
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
      // ایجاد container برای نگهداری ترجمه
      const containerSpan = document.createElement("span");
      const uniqueId = generateUniqueId();
      containerSpan.setAttribute("data-aiwc-original-id", uniqueId);
      // ذخیره کامل متن اصلی در attribute برای revert
      containerSpan.setAttribute("data-aiwc-original-text", originalText);

      const originalLines = originalText.split("\n");
      const translatedLines = translatedText.split("\n");

      originalLines.forEach((originalLine, index) => {
        // ایجاد span داخلی برای هر خط ترجمه
        const translatedLine =
          translatedLines[index] !== undefined ? translatedLines[index] : "";
        const innerSpan = document.createElement("span");
        innerSpan.textContent = translatedLine;
        // ثبت هر خط در state برای پشتیبانی از امکانات دیگر (در صورت نیاز)
        context.state.originalTexts.set(uniqueId, {
          originalText: originalLine,
          wrapperElement: innerSpan,
        });
        context.IconManager.applyTextDirection(innerSpan, translatedLine);
        containerSpan.appendChild(innerSpan);

        // اضافه کردن <br> با نشانه‌گذاری برای خطوط جداگانه (جزء ترجمه چند خطی)
        if (index < originalLines.length - 1) {
          const br = document.createElement("br");
          br.setAttribute("data-aiwc-br", "true");
          containerSpan.appendChild(br);
        }
      });

      try {
        parentElement.replaceChild(containerSpan, textNode);
      } catch (error) {
        logME("AIWC Error replacing text node with container:", error, {
          textNode,
          containerSpan,
          parentElement,
        });
        context.state.originalTexts.delete(uniqueId);
        error = ErrorHandler.processError(error);
        context.errorHandler.handle(error, {
          type: ErrorTypes.PARSE_SELECT_ELEMENT,
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
  // یافتن تمام span هایی که دارای data-aiwc-original-text هستند
  const containers = document.querySelectorAll("span[data-aiwc-original-text]");

  containers.forEach((container) => {
    const originalText = container.getAttribute("data-aiwc-original-text");
    if (originalText !== null) {
      try {
        // ایجاد یک گره متنی جدید با متن اصلی ذخیره شده
        const originalTextNode = document.createTextNode(originalText);
        // جایگزینی container با گره متنی اصلی
        container.parentNode.replaceChild(originalTextNode, container);
        successfulReverts++;

        // حذف گره‌های <br> مجاور که با ویژگی data-aiwc-br نشانه‌گذاری شده‌اند
        let nextNode = originalTextNode.nextSibling;
        while (
          nextNode &&
          nextNode.nodeName === "BR" &&
          nextNode.getAttribute("data-aiwc-br") === "true"
        ) {
          const nodeToRemove = nextNode;
          nextNode = nextNode.nextSibling;
          nodeToRemove.parentNode.removeChild(nodeToRemove);
        }
      } catch (error) {
        const errorMessage = `Failed to revert container with original text.`;
        context.errorHandler.handle(error, {
          type: ErrorTypes.PARSE_SELECT_ELEMENT,
          context: "revert-translations-replace",
          elementId: container.getAttribute("data-aiwc-original-id"),
        });
        logME(errorMessage, error);
      }
    }
  });

  if (successfulReverts > 0) {
    context.notifier.show(`${successfulReverts} مورد بازگردانی شد`, "revert");
  } else if (await IsDebug()) {
    context.notifier.show("هیچ متنی برای بازگردانی یافت نشد", "warning");
  }

  // پاکسازی state و انجام cleanup
  context.IconManager?.cleanup();
  context.state.originalTexts.clear();

  return successfulReverts;
}

export function parseAndCleanTranslationResponse(
  translatedJsonString,
  context
) {
  let cleanJsonString = translatedJsonString.trim();

  // یافتن اولین ساختار JSON در متن
  const jsonMatch = cleanJsonString.match(/(\[.*\]|\{.*\})/s);

  if (!jsonMatch) {
    const error = new Error("هیچ ساختار JSON معتبری در پاسخ یافت نشد.");
    context.errorHandler.handle(error, {
      type: ErrorTypes.PARSE_SELECT_ELEMENT,
      context: "parseAndCleanTranslationResponse-JSON",
      content: translatedJsonString,
    });
    return []; // برگرداندن یک آرایه خالی به عنوان مقدار پیش‌فرض
  }

  try {
    cleanJsonString = jsonMatch[1].trim();
    return JSON.parse(cleanJsonString);
  } catch (error) {
    const processedError = ErrorHandler.processError(error);
    context.errorHandler.handle(processedError, {
      type: ErrorTypes.PARSE_SELECT_ELEMENT,
      context: "parseAndCleanTranslationResponse-Error",
      content: translatedJsonString,
    });
    return []; // برگرداندن یک آرایه خالی در صورت بروز خطا
  }
}

export function expandTextsForTranslation(textsToTranslate) {
  const expandedTexts = [];
  const originMapping = [];
  const originalToExpandedIndices = new Map();

  textsToTranslate.forEach((originalText, originalIndex) => {
    const segments = originalText.split("\n");
    const currentExpandedIndices = [];

    segments.forEach((segment, segmentIndex) => {
      expandedTexts.push(segment);
      originMapping.push({ originalIndex, segmentIndex });
      currentExpandedIndices.push(expandedTexts.length - 1);
    });
    originalToExpandedIndices.set(originalIndex, currentExpandedIndices);
  });

  return { expandedTexts, originMapping, originalToExpandedIndices };
}

export function handleTranslationLengthMismatch(translatedData, expandedTexts) {
  if (!Array.isArray(translatedData)) {
    logME("پاسخ ترجمه یک آرایه نیست.", "داده پارس شده:", translatedData);
    throw new Error("Translated response is not an array.");
  }

  if (translatedData.length !== expandedTexts.length) {
    logME(
      "عدم تطابق طول در پاسخ ترجمه شناسایی شد.",
      `طول مورد انتظار (بر اساس متن‌های گسترش‌یافته): ${expandedTexts.length}`,
      `طول دریافت شده: ${translatedData.length}`,
      "علت احتمالی: تقسیم/ادغام متفاوت متن توسط API یا افزودن/حذف آیتم‌ها.",
      "تلاش برای پردازش با داده‌های موجود ادامه می‌یابد..."
    );
  }
}

export function reassembleTranslations(
  translatedData,
  expandedTexts,
  originMapping,
  textsToTranslate,
  cachedTranslations
) {
  const newTranslations = new Map();
  const translatedSegmentsMap = new Map();

  const numItemsToProcess = Math.min(
    expandedTexts.length,
    translatedData.length
  );

  for (let i = 0; i < numItemsToProcess; i++) {
    const translatedItem = translatedData[i];
    const mappingInfo = originMapping[i];

    if (
      translatedItem &&
      typeof translatedItem.text === "string" &&
      mappingInfo
    ) {
      const { originalIndex } = mappingInfo;
      if (!translatedSegmentsMap.has(originalIndex)) {
        translatedSegmentsMap.set(originalIndex, []);
      }
      translatedSegmentsMap.get(originalIndex).push(translatedItem.text);
    } else {
      console.warn(
        `داده ترجمه نامعتبر یا گمشده برای آیتم در اندیس ${i}.`,
        "آیتم دریافتی:",
        translatedItem,
        "اطلاعات نگاشت:",
        mappingInfo
      );
      if (mappingInfo) {
        const { originalIndex } = mappingInfo;
        if (!translatedSegmentsMap.has(originalIndex)) {
          translatedSegmentsMap.set(originalIndex, []);
        }
        translatedSegmentsMap.get(originalIndex).push(expandedTexts[i]);
      }
    }
  }

  textsToTranslate.forEach((originalText, originalIndex) => {
    if (translatedSegmentsMap.has(originalIndex)) {
      const segments = translatedSegmentsMap.get(originalIndex);
      const reassembledText = segments.join("\n");
      newTranslations.set(originalText, reassembledText);
      translationCache.set(originalText, reassembledText);
    } else if (!cachedTranslations.has(originalText)) {
      logME(
        `هیچ بخش ترجمه‌ای برای متن اصلی "${originalText}" یافت نشد. از متن اصلی استفاده می‌شود.`
      );
      newTranslations.set(originalText, originalText);
    }
  });

  return newTranslations;
}
