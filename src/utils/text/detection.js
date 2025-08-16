/**
 * Advanced Text Extraction and Replacement System
 * Complete port from OLD/src/utils/textExtraction.js with Vue architecture compatibility
 * Handles complex DOM structures, multi-line text, and preserves styling
 */

import { ErrorHandler } from "../../error-management/ErrorHandler.js";
import { ErrorTypes } from "../../error-management/ErrorTypes.js";
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'detection');

// Translation cache (same as OLD version)
const translationCache = new Map();

/**
 * جمع‌آوری تمام text nodes از عنصر هدف
 * @param {Element} targetElement - المنت هدف برای استخراج text nodes
 * @returns {Object} - {textNodes: Node[], originalTextsMap: Map}
 */
export function collectTextNodes(targetElement) {
  const walker = document.createTreeWalker(
    targetElement,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        // Skip text in hidden elements
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        const style = window.getComputedStyle(parent);
        if (style.display === "none" || style.visibility === "hidden") {
          return NodeFilter.FILTER_REJECT;
        }

        // Skip empty text nodes
        if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;

        return NodeFilter.FILTER_ACCEPT;
      },
    },
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

  logger.debug('[AdvancedTextExtraction] Collected text nodes:', {
    totalNodes: textNodes.length,
    uniqueTexts: originalTextsMap.size
  });

  return { textNodes, originalTextsMap };
}

/**
 * تولید شناسه منحصر به فرد برای tracking
 * @returns {string} - شناسه منحصر به فرد
 */
function generateUniqueId() {
  return `translate-it-${Math.random().toString(36).substring(2, 15)}-${Date.now()}`;
}

/**
 * تشخیص جهت متن (RTL/LTR) و اعمال direction مناسب
 * @param {Element} element - المنت هدف
 * @param {string} text - متن برای تشخیص جهت
 */
function correctTextDirection(element, text) {
  // Simple RTL detection - can be enhanced with more sophisticated logic
  const rtlChars = /[\u0590-\u083F]|[\u08A0-\u08FF]|[\uFB1D-\uFDFF]|[\uFE70-\uFEFF]/;
  const hasRTL = rtlChars.test(text);
  
  if (hasRTL) {
    element.style.direction = 'rtl';
    element.style.textAlign = 'right';
  } else {
    element.style.direction = 'ltr';
    element.style.textAlign = 'left';
  }
}

/**
 * ذخیره استایل‌های اصلی المنت والد
 * @param {Element} parentElement - المنت والد
 */
function storeOriginalParentStyles(parentElement) {
  if (!parentElement.getAttribute('data-translate-it-original-styles')) {
    const originalStyles = {
      direction: parentElement.style.direction || '',
      textAlign: parentElement.style.textAlign || '',
    };
    parentElement.setAttribute(
      'data-translate-it-original-styles', 
      JSON.stringify(originalStyles)
    );
  }
}

/**
 * اعمال ترجمه‌ها با جایگزینی text nodes با span containers
 * @param {Node[]} textNodes - آرایه text nodes
 * @param {Map<string, string>} translations - نگاشت متن اصلی به ترجمه
 * @param {Object} context - context شامل tracking و error handling
 */
export function applyTranslationsToNodes(textNodes, translations, context = {}) {
  logger.debug('[AdvancedTextExtraction] Applying translations to nodes:', {
    nodeCount: textNodes.length,
    translationCount: translations.size
  });

  // Initialize tracking if not provided
  if (!context.translatedElements) {
    context.translatedElements = new Set();
  }
  if (!context.originalTexts) {
    context.originalTexts = new Map();
  }

  textNodes.forEach((textNode, index) => {
    if (!textNode.parentNode || textNode.nodeType !== Node.TEXT_NODE) {
      logger.warn('[AdvancedTextExtraction] Invalid text node:', textNode);
      return;
    }

    const originalText = textNode.textContent;
    const trimmedOriginalText = originalText.trim();
    const translatedText = translations.get(trimmedOriginalText);

    if (!translatedText || !trimmedOriginalText) {
      return;
    }

    try {
      const parentElement = textNode.parentNode;
      
      // Store original parent styles
      storeOriginalParentStyles(parentElement);

      // Create container span for translation
      const containerSpan = document.createElement("span");
      const uniqueId = generateUniqueId();
      
      // Set tracking attributes
      containerSpan.setAttribute("data-translate-it-original-id", uniqueId);
      containerSpan.setAttribute("data-translate-it-original-text", originalText);
      containerSpan.setAttribute("data-translate-it-translated", "true");

      // Apply correct text direction
      correctTextDirection(containerSpan, translatedText);

      // Handle multi-line text
      const originalLines = originalText.split("\n");
      const translatedLines = translatedText.split("\n");

      originalLines.forEach((originalLine, lineIndex) => {
        const translatedLine = translatedLines[lineIndex] !== undefined 
          ? translatedLines[lineIndex] 
          : "";

        const innerSpan = document.createElement("span");
        innerSpan.textContent = translatedLine;

        // Store original text for potential revert
        const lineId = `${uniqueId}-line-${lineIndex}`;
        context.originalTexts.set(lineId, {
          originalText: originalLine,
          wrapperElement: innerSpan,
          containerElement: containerSpan,
          parentElement: parentElement,
          originalNode: textNode
        });

        containerSpan.appendChild(innerSpan);

        // Add line break if not last line
        if (lineIndex < originalLines.length - 1) {
          const br = document.createElement("br");
          br.setAttribute("data-translate-it-br", "true");
          containerSpan.appendChild(br);
        }
      });

      // Safe DOM replacement
      parentElement.replaceChild(containerSpan, textNode);
      
      // Track for revert capability
      context.translatedElements.add(containerSpan);

      logger.debug('[AdvancedTextExtraction] Successfully replaced text node:', {
        uniqueId,
        originalText: trimmedOriginalText.substring(0, 50) + '...',
        translatedText: translatedText.substring(0, 50) + '...'
      });

    } catch (error) {
      logger.error('[AdvancedTextExtraction] Error replacing text node:', error, {
        textNode,
        originalText: originalText.substring(0, 100),
        parentElement: textNode.parentNode
      });

      const errorHandler = context.errorHandler || ErrorHandler.getInstance();
      errorHandler.handle(error, {
        type: ErrorTypes.UI,
        context: "advanced-text-extraction-replace",
        details: {
          nodeIndex: index,
          originalText: originalText.substring(0, 100)
        }
      });
    }
  });

  logger.debug('[AdvancedTextExtraction] Translation application completed:', {
    trackedElements: context.translatedElements?.size || 0,
    trackedTexts: context.originalTexts?.size || 0
  });
}

/**
 * بازگردانی تمام ترجمه‌ها به متن اصلی
 * @param {Object} context - context شامل tracking data
 */
export function revertAllTranslations(context = {}) {
  logger.debug('[AdvancedTextExtraction] Starting revert process');

  if (!context.translatedElements || !context.originalTexts) {
    logger.warn('[AdvancedTextExtraction] No tracking data found for revert');
    return 0;
  }

  let successfulReverts = 0;

  // Find all span elements with translation data
  const containers = document.querySelectorAll("span[data-translate-it-original-text]");

  for (const container of containers) {
    const originalText = container.getAttribute("data-translate-it-original-text");
    const uniqueId = container.getAttribute("data-translate-it-original-id");

    if (originalText !== null && uniqueId) {
      try {
        const parentElement = container.parentNode;
        if (!parentElement) continue;

        // Create original text node
        const originalTextNode = document.createTextNode(originalText);

        // Replace translated content with original
        parentElement.replaceChild(originalTextNode, container);
        successfulReverts++;

        // Clean up tracking
        context.translatedElements.delete(container);
        
        // Remove related entries from originalTexts
        for (const [key] of context.originalTexts.entries()) {
          if (key.startsWith(uniqueId)) {
            context.originalTexts.delete(key);
          }
        }

      } catch (error) {
        logger.error('[AdvancedTextExtraction] Failed to revert individual element:', error);
      }
    }
  }

  logger.debug('[AdvancedTextExtraction] Revert completed:', {
    successfulReverts,
    remainingElements: context.translatedElements?.size || 0
  });

  return successfulReverts;
}

/**
 * تفکیک متن‌های cached و جدید (exact port from OLD)
 * @param {Map<string, Node[]>} originalTextsMap - نگاشت متن اصلی به nodes
 * @returns {Object} - {textsToTranslate: string[], cachedTranslations: Map}
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

  logger.debug('[AdvancedTextExtraction] Text separation completed:', {
    totalTexts: originalTextsMap.size,
    cachedTexts: cachedTranslations.size,
    newTexts: textsToTranslate.length
  });

  return { textsToTranslate, cachedTranslations };
}

/**
 * گسترش متن‌ها برای ترجمه (exact port from OLD)
 * @param {string[]} textsToTranslate - آرایه متن‌های برای ترجمه
 * @returns {Object} - {expandedTexts, originMapping, originalToExpandedIndices}
 */
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

/**
 * تجدید جمع‌آوری ترجمه‌ها (exact port from OLD)
 * @param {Array} translatedData - داده‌های ترجمه شده
 * @param {string[]} expandedTexts - متن‌های گسترش‌یافته
 * @param {Array} originMapping - نگاشت منشاء
 * @param {string[]} textsToTranslate - متن‌های اصلی برای ترجمه
 * @param {Map} cachedTranslations - ترجمه‌های کش شده
 * @returns {Map} - نگاشت جدید ترجمه‌ها
 */
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
      logger.debug(
        `[AdvancedTextExtraction] Invalid or missing translation data for item at index ${i}:`,
        translatedItem,
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
      logger.debug(
        `[AdvancedTextExtraction] No translation segments found for original text "${originalText}". Using original text.`
      );
      newTranslations.set(originalText, originalText);
    }
  });

  return newTranslations;
}

/**
 * پارس و تمیز کردن پاسخ ترجمه (simplified version of OLD parseAndCleanTranslationResponse)
 * @param {string} translatedJsonString - رشته JSON ترجمه
 * @returns {Array} - آرایه پارس شده
 */
export function parseAndCleanTranslationResponse(translatedJsonString) {
  let cleanJsonString = translatedJsonString.trim();

  // Find first JSON structure (preferably array)
  const jsonMatch = cleanJsonString.match(
    /(\[(?:.|\n|\r)*\]|\{(?:.|\n|\r)*\})/s
  );

  if (!jsonMatch || !jsonMatch[1]) {
    logger.error('[AdvancedTextExtraction] No JSON structure found in response');
    return [];
  }

  let potentialJsonString = jsonMatch[1].trim();

  try {
    return JSON.parse(potentialJsonString);
  } catch (initialError) {
    logger.warn('[AdvancedTextExtraction] Initial JSON parse failed, attempting repair');

    // Attempt repair if it looks like an array
    if (potentialJsonString.startsWith("[") && initialError instanceof SyntaxError) {
      const lastCommaIndex = potentialJsonString.lastIndexOf(",", potentialJsonString.length - 2);

      if (lastCommaIndex !== -1) {
        let repairedJsonString = potentialJsonString.substring(0, lastCommaIndex);
        repairedJsonString = repairedJsonString.trimEnd() + "]";

        try {
          const parsedResult = JSON.parse(repairedJsonString);
          logger.warn('[AdvancedTextExtraction] Successfully parsed JSON after repair');
          return parsedResult;
        } catch (repairError) {
          logger.error('[AdvancedTextExtraction] Repair attempt also failed:', repairError);
          return [];
        }
      }
    }

    logger.error('[AdvancedTextExtraction] Cannot repair JSON:', initialError);
    return [];
  }
}

/**
 * پاکسازی تمام tracking data
 * @param {Object} context - context شامل tracking data
 */
export function clearTrackingData(context = {}) {
  if (context.translatedElements) {
    context.translatedElements.clear();
  }
  if (context.originalTexts) {
    context.originalTexts.clear();
  }
  logger.debug('[AdvancedTextExtraction] Tracking data cleared');
}

export function isSingleWordOrShortPhrase(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }
  const trimmedText = text.trim();
  if (trimmedText.length === 0) {
    return false;
  }

  // Define thresholds
  const MAX_WORDS = 3;
  const MAX_CHARS = 30;

  const words = trimmedText.split(/\s+/); // Split by one or more whitespace characters

  return words.length <= MAX_WORDS && trimmedText.length <= MAX_CHARS;
}