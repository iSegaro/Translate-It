// src/utils/textExtraction.js
import { ErrorHandler } from "../../error-management/ErrorService.js";
import { ErrorTypes } from "../../error-management/ErrorTypes.js";
import { IsDebug } from "../../config.js";

// Lazy logger to avoid initialization order issues
let _logger;
const getLogger = () => {
  if (!_logger) {
    _logger = createLogger(LOG_COMPONENTS.BACKGROUND, 'extraction');
  }
  return _logger;
};

import { correctTextDirection } from "./textDetection.js";
import { getTranslationString } from "../i18n/i18n.js";

import { createLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';


const translationCache = new Map();

/**
 * Get the global translation cache for external access
 * @returns {Map} The translation cache map
 */
export function getTranslationCache() {
  return translationCache;
}

/**
 * پاکسازی تمام حافظه‌های کش مورد استفاده در این ماژول.
 * این شامل کش ترجمه‌ها و متن‌های اصلی ذخیره شده در state می‌شود.
 *
 * @param {object} context شیء context شامل state.
 */
export function clearAllCaches(context) {
  // پاکسازی حافظه کش ترجمه‌ها
  translationCache.clear();
  // getLogger().debug('translationCache با موفقیت پاکسازی شد.');

  // پاکسازی متن‌های اصلی ذخیره شده در state (اگر context و state موجود باشند)
  if (context && context.state && context.state.originalTexts) {
    context.state.originalTexts.clear();
    // getLogger().debug('state.originalTexts با موفقیت پاکسازی شد.');
  } else {
    // getLogger().debug('شیء context یا state.originalTexts در دسترس نیست.', "warning");
  }
}

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
    false,
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
      // ذخیره‌ی استایل‌های اولیه جهت (direction) و تراز متن (text-align) در المان پدر (در صورت نیاز).
      // اگر این تابع برای جلوگیری از تغییر ناخواسته استایل والد پس از حذف کدهای قبلی جهت‌دهی به والد است، نگه داشتن آن مفید است.
      storeOriginalParentStyles(parentElement);

      // ایجاد containerSpan برای نگهداری ترجمه
      const containerSpan = document.createElement("span");
      const uniqueId = generateUniqueId();
      containerSpan.setAttribute("data-aiwc-original-id", uniqueId);
      // ذخیره کامل متن اصلی در attribute برای revert
      containerSpan.setAttribute("data-aiwc-original-text", originalText);

      // <<<< اعمال جهت‌دهی صحیح به خود containerSpan بر اساس کل متن ترجمه شده >>>>
      correctTextDirection(containerSpan, translatedText);

      const originalLines = originalText.split("\n");
      const translatedLines = translatedText.split("\n");

      originalLines.forEach((originalLine, index) => {
        const translatedLine =
          translatedLines[index] !== undefined ? translatedLines[index] : "";
        const innerSpan = document.createElement("span");
        innerSpan.textContent = translatedLine;

        // معمولاً نیازی به تنظیم direction برای هر innerSpan نیست اگر dir والد (containerSpan) صحیح باشد.
        // مرورگر باید جریان متن را درون جهت‌دهی والد به درستی مدیریت کند.

        // این قسمت به نظر می‌رسد متن اصلی را برای بازگردانی ذخیره می‌کند.
        context.state.originalTexts.set(uniqueId, {
          originalText: originalLine, // متن اصلی خط
          wrapperElement: innerSpan, // span ای که حاوی خط ترجمه شده است
        });

        containerSpan.appendChild(innerSpan);

        if (index < originalLines.length - 1) {
          const br = document.createElement("br");
          br.setAttribute("data-aiwc-br", "true"); // برای شناسایی و حذف احتمالی هنگام بازگردانی
          containerSpan.appendChild(br);
        }
      });

      // -- روش قدیمی برای نمایش راستچین و چپ چین متن‌ها --
      // کدهای قبلی که جهت‌دهی را به parentElement اعمال می‌کردند حذف شده‌اند:
      // applyTextDirection(parentElement, true);
      // correctTextDirection(parentElement, translatedLines); // <<<< (به containerSpan منتقل شد) >>>>

      try {
        parentElement.replaceChild(containerSpan, textNode);
      } catch (error) {
        getLogger().error('Error replacing text node with container:', error,
          {
            textNode,
            containerSpan,
            parentElement,
          },
        );
        // اگر خطایی رخ داد، اطلاعات ذخیره شده برای این uniqueId را حذف کنید
        if (context.state.originalTexts.has(uniqueId)) {
          context.state.originalTexts.delete(uniqueId);
        }

        const processedError = ErrorHandler.processError(error);
        // اطمینان از اینکه context.errorHandler موجود است
        if (
          context.errorHandler &&
          typeof context.errorHandler.handle === "function"
        ) {
          context.errorHandler.handle(processedError, {
            type: ErrorTypes.UI,
            context: "textExtraction-apply-translations-replace",
            elementId: "multiple", // یا uniqueId اگر مربوط به یک المنت خاص است
          });
        }
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
        // قبل از جایگزینی، بازیابی استایل‌های اصلی المان پدر
        const parentElement = container.parentNode;
        restoreOriginalParentStyles(parentElement);

        // ایجاد گره متنی اصلی
        const originalTextNode = document.createTextNode(originalText);
        parentElement.replaceChild(originalTextNode, container);
        successfulReverts++;

        // حذف <br> های اضافه همراه ترجمه
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
          type: ErrorTypes.UI,
          context: "revert-translations-replace",
          elementId: container.getAttribute("data-aiwc-original-id"),
        });
        logME(errorMessage, error);
      }
    }
  });

  if (successfulReverts > 0) {
    context.notifier.show(
      `${successfulReverts} ${(await getTranslationString("STATUS_Revert_Number")) || "(مورد بازگردانی شد)"}`,
      "revert",
    );
  } else if (await IsDebug()) {
    context.notifier.show(
      (await getTranslationString("STATUS_REVERT_NOT_FOUND")) ||
        "(هیچ متنی برای بازگردانی یافت نشد)",
      "warning",
    );
  }

  context.IconManager?.cleanup();
  context.state.originalTexts.clear();

  return successfulReverts;
}

export function parseAndCleanTranslationResponse(
  translatedJsonString,
  context,
) {
  let cleanJsonString = translatedJsonString.trim();

  // 1. یافتن اولین ساختار JSON (ترجیحاً آرایه)
  // این Regex کمی بهبود یافته تا فضای خالی قبل/بعد براکت‌ها را هم در نظر بگیرد
  // و اولویت را به آرایه ([...]) بدهد اگر هر دو ممکن باشند (گرچه بعید است)
  const jsonMatch = cleanJsonString.match(
    /(\[(?:.|\n|\r)*\]|\{(?:.|\n|\r)*\})/s,
  );

  if (!jsonMatch || !jsonMatch[1]) {
    // No JSON structure found — this is not always fatal: some providers
    // return plain string responses (separated by markers). Don't notify
    // the user here to avoid showing spurious errors; fall back to
    // string-based parsing in the caller.
    getLogger().debug('No JSON structure (array or object) found in the response string.');
    return []; // برگرداندن آرایه خالی
  }

  let potentialJsonString = jsonMatch[1].trim();

  // 2. تلاش اول برای پارس کردن
  try {
    // اگر مستقیما پارس شد، نتیجه را برگردان
    return JSON.parse(potentialJsonString);
  } catch (initialError) {
    getLogger().error('Initial JSON.parse failed. Attempting repair by removing the last element.', initialError.message, // لاگ کردن پیام خطا اولیه
    );

    // 3. تلاش برای تعمیر فقط اگر شبیه آرایه باشد
    //    و خطای اولیه از نوع SyntaxError باشد (محتمل‌ترین نوع خطا برای JSON نامعتبر)
    if (
      potentialJsonString.startsWith("[") &&
      initialError instanceof SyntaxError
    ) {
      // پیدا کردن آخرین ویرگول (,) که نشان‌دهنده جداکننده آیتم‌هاست
      // جستجو را از یکی مانده به آخر شروع می‌کنیم تا از براکت انتهایی احتمالی صرف نظر شود
      const lastCommaIndex = potentialJsonString.lastIndexOf(
        ",",
        potentialJsonString.length - 2, // نادیده گرفتن کاراکتر آخر
      );

      // اگر ویرگولی پیدا شد (یعنی حداقل دو آیتم وجود داشته یا یک آیتم و یک ویرگول اضافی)
      if (lastCommaIndex !== -1) {
        // رشته را تا قبل از آخرین ویرگول جدا کن
        let repairedJsonString = potentialJsonString.substring(
          0,
          lastCommaIndex,
        );

        // اطمینان از اینکه رشته با براکت بسته ] تمام می‌شود
        // (ممکن است فضای خالی یا کاراکترهای خراب بعد از ویرگول وجود داشته باشد)
        repairedJsonString = repairedJsonString.trimEnd() + "]";

        getLogger().debug('Attempting to parse repaired JSON string:', repairedJsonString);

        // 4. تلاش دوم برای پارس کردن رشته تعمیر شده
        try {
          const parsedResult = JSON.parse(repairedJsonString);
          getLogger().init('Successfully parsed JSON after removing the potentially corrupted last element.', "warning",
          );
          // می‌توانید در اینجا یک نوع هشدار خاص برای handler ارسال کنید که تعمیر موفق بود
          // context.errorHandler.handle(new Error("JSON repaired successfully"), { type: ..., level: 'warning' });
          return parsedResult; // نتیجه تعمیر شده را برگردان
        } catch (repairError) {
          // اگر تعمیر هم ناموفق بود
          getLogger().error('Repair attempt also failed.', repairError.message, // لاگ کردن پیام خطای دوم
          );
          // خطای اولیه را به handler ارسال کن چون ریشه مشکل همان بود
          const processedError = ErrorHandler.processError(initialError);
          context.errorHandler.handle(processedError, {
            type: ErrorTypes.API_RESPONSE_INVALID,
            context: "parseAndCleanTranslationResponse-RepairFailed",
          });
          getLogger().debug('Original problematic string:', potentialJsonString); // لاگ کردن رشته مشکل‌دار اصلی
          return []; // برگرداندن آرایه خالی
        }
      } else {
        // اگر ویرگولی پیدا نشد (مثلاً فقط یک آیتم خراب بود مثل "[{"text":"a"" )
        getLogger().debug('Could not repair JSON: No comma found to separate the last element.',  );
        const processedError = ErrorHandler.processError(initialError);
        context.errorHandler.handle(processedError, {
          type: ErrorTypes.API_RESPONSE_INVALID,
          context: "parseAndCleanTranslationResponse-NoCommaForRepair",
        });
        getLogger().debug('Original problematic string:', potentialJsonString);
        return [];
      }
    } else {
      // اگر خطای اولیه SyntaxError نبود یا رشته با '[' شروع نشده بود
      getLogger().error('Initial parse failed, and repair condition not met (not array or not SyntaxError).',  );
      const processedError = ErrorHandler.processError(initialError);
      context.errorHandler.handle(processedError, {
        type: ErrorTypes.API_RESPONSE_INVALID,
        context: "parseAndCleanTranslationResponse-InitialErrorNotRepaired",
      });
      getLogger().debug('Original problematic string:', potentialJsonString);
      return [];
    }
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
    getLogger().debug('پاسخ ترجمه یک آرایه نیست.', "داده پارس شده:", translatedData);
    // throw new Error("Translated response is not an array.");
    return false;
  }

  if (translatedData.length !== expandedTexts.length) {
    getLogger().debug('عدم تطابق طول.', `طول مورد انتظار (بر اساس متن‌های گسترش‌یافته): ${expandedTexts.length}`,
      `طول دریافت شده: ${translatedData.length}`,
      "علت احتمالی: تقسیم/ادغام متفاوت متن توسط API یا افزودن/حذف آیتم‌ها.",
      "تلاش برای پردازش با داده‌های موجود ادامه می‌یابد...",
    );

    if (
      Math.abs(translatedData.length - expandedTexts.length) <
      (3 / 7) * expandedTexts.length
    ) {
      return true;
    }

    return false;
  }

  return true;
}

/**
 * ذخیره‌ی استایل‌های اولیه جهت (direction) و تراز متن (text-align) در المان پدر.
 * اگر قبلاً استایلی ذخیره نشده باشد، استایل‌های موجود در المان پدر (به صورت inline) ذخیره خواهند شد.
 * @param {HTMLElement} parentElement المان پدر مورد نظر.
 */
export function storeOriginalParentStyles(parentElement) {
  if (!parentElement.dataset.aiwcOriginalDirection) {
    parentElement.dataset.aiwcOriginalDirection =
      parentElement.style.direction || "";
  }
  if (!parentElement.dataset.aiwcOriginalTextAlign) {
    parentElement.dataset.aiwcOriginalTextAlign =
      parentElement.style.textAlign || "";
  }
}

/**
 * بازیابی و بازگردانی استایل‌های اولیه جهت (direction) و تراز متن (text-align) از المان پدر.
 * پس از بازگردانی، اطلاعات ذخیره شده پاک می‌شود.
 * @param {HTMLElement} parentElement المان پدر مورد نظر.
 */
export function restoreOriginalParentStyles(parentElement) {
  if (parentElement.dataset.aiwcOriginalDirection !== undefined) {
    parentElement.style.direction = parentElement.dataset.aiwcOriginalDirection;
    delete parentElement.dataset.aiwcOriginalDirection;
  }
  if (parentElement.dataset.aiwcOriginalTextAlign !== undefined) {
    parentElement.style.textAlign = parentElement.dataset.aiwcOriginalTextAlign;
    delete parentElement.dataset.aiwcOriginalTextAlign;
  }
}

export function reassembleTranslations(
  translatedData,
  expandedTexts,
  originMapping,
  textsToTranslate,
  cachedTranslations,
) {
  const newTranslations = new Map();
  const translatedSegmentsMap = new Map();

  const numItemsToProcess = Math.min(
    expandedTexts.length,
    translatedData.length,
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
      getLogger().debug('داده ترجمه نامعتبر یا گمشده برای آیتم در اندیس ${i}.', "آیتم دریافتی:",
        translatedItem,
        "اطلاعات نگاشت:",
        mappingInfo,
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
      // logME(
      //   `هیچ بخش ترجمه‌ای برای متن اصلی "${originalText}" یافت نشد. از متن اصلی استفاده می‌شود.`
      // );
      newTranslations.set(originalText, originalText);
    }
  });

  return newTranslations;
}
