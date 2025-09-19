// Text Processing Utilities for Element Selection
// Dedicated text processing functions for Select Element feature
// Independent from shared utilities

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { getElementSelectionCache } from './cache.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'textProcessing');

/**
 * Default configuration for text processing
 */
const DEFAULT_CONFIG = {
  minTextLength: 3,
  minWordCount: 1,
  maxSegmentLength: 500,
  useOptimization: true,
  splitOnDoubleNewlines: true,
  preserveShortSegments: false
};

/**
 * Expand texts for translation by splitting into manageable segments
 * @param {string[]} textsToTranslate - Array of texts to expand
 * @param {Object} options - Processing options
 * @returns {Object} Expansion result with texts, mapping, and indices
 */
export function expandTextsForTranslation(textsToTranslate, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };

  if (!Array.isArray(textsToTranslate)) {
    logger.error('expandTextsForTranslation: Input must be an array');
    return { expandedTexts: [], originMapping: [], originalToExpandedIndices: new Map() };
  }

  logger.debug(`Expanding ${textsToTranslate.length} texts for translation`, {
    useOptimization: config.useOptimization,
    maxSegmentLength: config.maxSegmentLength
  });

  if (!config.useOptimization) {
    return expandTextsLegacy(textsToTranslate);
  }

  // Optimized implementation: less aggressive splitting
  const expandedTexts = [];
  const originMapping = [];
  const originalToExpandedIndices = new Map();

  textsToTranslate.forEach((originalText, originalIndex) => {
    const segments = processTextIntoSegments(originalText, config);
    const currentExpandedIndices = [];

    segments.forEach((segment, segmentIndex) => {
      const trimmedSegment = segment.trim();

      // Skip very short segments unless configured to preserve them
      if (!config.preserveShortSegments && trimmedSegment.length < config.minTextLength) {
        return;
      }

      expandedTexts.push(trimmedSegment);
      originMapping.push({ originalIndex, segmentIndex });
      currentExpandedIndices.push(expandedTexts.length - 1);
    });

    // If no segments were added (all were too short), add the original
    if (currentExpandedIndices.length === 0) {
      expandedTexts.push(originalText);
      originMapping.push({ originalIndex, segmentIndex: 0 });
      currentExpandedIndices.push(expandedTexts.length - 1);
    }

    originalToExpandedIndices.set(originalIndex, currentExpandedIndices);
  });

  logger.debug(`Text expansion: ${textsToTranslate.length} → ${expandedTexts.length} segments`);
  return { expandedTexts, originMapping, originalToExpandedIndices };
}

/**
 * Process text into segments based on configuration
 * @param {string} text - Text to process
 * @param {Object} config - Processing configuration
 * @returns {string[]} Array of text segments
 */
function processTextIntoSegments(text, config) {
  if (!text || typeof text !== 'string') {
    return [text || ''];
  }

  // For short texts, keep them intact
  if (text.length <= config.maxSegmentLength) {
    if (config.splitOnDoubleNewlines) {
      return text.split(/\n\n+/).filter(segment => segment.trim());
    }
    return [text];
  }

  // For longer texts, split more intelligently
  let segments = [];

  if (config.splitOnDoubleNewlines) {
    // Split on double newlines first
    segments = text.split(/\n\n+/);
  } else {
    // Split on single newlines for more granular control
    segments = text.split(/\n/);
  }

  // Further split very long segments
  const finalSegments = [];
  segments.forEach(segment => {
    if (segment.length <= config.maxSegmentLength) {
      finalSegments.push(segment);
    } else {
      // Split long segments at sentence boundaries
      const sentences = splitAtSentenceBoundaries(segment, config.maxSegmentLength);
      finalSegments.push(...sentences);
    }
  });

  return finalSegments.filter(segment => segment.trim());
}

/**
 * Split text at sentence boundaries when segments are too long
 * @param {string} text - Text to split
 * @param {number} maxLength - Maximum segment length
 * @returns {string[]} Array of segments
 */
function splitAtSentenceBoundaries(text, maxLength) {
  if (text.length <= maxLength) {
    return [text];
  }

  // Simple sentence boundary detection
  const sentenceEnders = /[.!?]+\s+/g;
  const sentences = text.split(sentenceEnders);

  const segments = [];
  let currentSegment = '';

  sentences.forEach((sentence, index) => {
    const potentialSegment = currentSegment + sentence + (index < sentences.length - 1 ? '. ' : '');

    if (potentialSegment.length <= maxLength) {
      currentSegment = potentialSegment;
    } else {
      // Current segment is getting too long
      if (currentSegment) {
        segments.push(currentSegment.trim());
        currentSegment = sentence + (index < sentences.length - 1 ? '. ' : '');
      } else {
        // Even single sentence is too long, force split
        segments.push(sentence.substring(0, maxLength));
        currentSegment = sentence.substring(maxLength) + (index < sentences.length - 1 ? '. ' : '');
      }
    }
  });

  if (currentSegment.trim()) {
    segments.push(currentSegment.trim());
  }

  return segments;
}

/**
 * Legacy text expansion for backward compatibility
 * @param {string[]} textsToTranslate - Texts to expand
 * @returns {Object} Expansion result
 */
function expandTextsLegacy(textsToTranslate) {
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
 * Reassemble translations from segments back to original structure
 * @param {Array} translatedData - Array of translated segments
 * @param {string[]} expandedTexts - Original expanded texts
 * @param {Array} originMapping - Mapping of segments to originals
 * @param {string[]} textsToTranslate - Original texts to translate
 * @param {Map} cachedTranslations - Cached translations
 * @returns {Map} Map of original texts to translated texts
 */
export function reassembleTranslations(
  translatedData,
  expandedTexts,
  originMapping,
  textsToTranslate,
  cachedTranslations
) {
  if (!Array.isArray(translatedData) || !Array.isArray(expandedTexts) || !Array.isArray(originMapping)) {
    logger.error('reassembleTranslations: Invalid input parameters');
    return new Map();
  }

  const cache = getElementSelectionCache();
  const newTranslations = new Map();
  const translatedSegmentsMap = new Map();

  const numItemsToProcess = Math.min(expandedTexts.length, translatedData.length);

  // Process translated segments
  for (let i = 0; i < numItemsToProcess; i++) {
    const translatedItem = translatedData[i];
    const mappingInfo = originMapping[i];

    if (translatedItem && typeof translatedItem.text === "string" && mappingInfo) {
      const { originalIndex } = mappingInfo;
      if (!translatedSegmentsMap.has(originalIndex)) {
        translatedSegmentsMap.set(originalIndex, []);
      }
      translatedSegmentsMap.get(originalIndex).push(translatedItem.text);
    } else {
      logger.debug(`Invalid translation data at index ${i}:`, {
        translatedItem,
        mappingInfo
      });

      // Use original text as fallback
      if (mappingInfo) {
        const { originalIndex } = mappingInfo;
        if (!translatedSegmentsMap.has(originalIndex)) {
          translatedSegmentsMap.set(originalIndex, []);
        }
        translatedSegmentsMap.get(originalIndex).push(expandedTexts[i] || '');
      }
    }
  }

  // Reassemble translations for each original text
  textsToTranslate.forEach((originalText, originalIndex) => {
    if (translatedSegmentsMap.has(originalIndex)) {
      const segments = translatedSegmentsMap.get(originalIndex);
      const reassembledText = segments.join("\n");
      newTranslations.set(originalText, reassembledText);

      // Cache the translation
      cache.setTranslation(originalText, reassembledText);
    } else if (!cachedTranslations.has(originalText)) {
      // No translated parts found for this text, use original
      newTranslations.set(originalText, originalText);
    }
  });

  logger.debug(`Reassembled ${newTranslations.size} translations`);
  return newTranslations;
}

/**
 * Separate cached and new texts for efficient translation
 * @param {Map} originalTextsMap - Map of original texts to nodes
 * @returns {Object} Object with textsToTranslate and cachedTranslations
 */
export function separateCachedAndNewTexts(originalTextsMap) {
  if (!originalTextsMap || !(originalTextsMap instanceof Map)) {
    logger.error('separateCachedAndNewTexts: Invalid originalTextsMap provided');
    return { textsToTranslate: [], cachedTranslations: new Map() };
  }

  const cache = getElementSelectionCache();
  const textsToTranslate = [];
  const cachedTranslations = new Map();
  const uniqueOriginalTexts = Array.from(originalTextsMap.keys());

  uniqueOriginalTexts.forEach((text) => {
    if (cache.hasTranslation(text)) {
      cachedTranslations.set(text, cache.getTranslation(text));
    } else {
      textsToTranslate.push(text);
    }
  });

  logger.debug(`Separated texts: ${textsToTranslate.length} new, ${cachedTranslations.size} cached`);
  return { textsToTranslate, cachedTranslations };
}

/**
 * Handle translation length mismatch between expected and received data
 * @param {Array} translatedData - Received translation data
 * @param {string[]} expandedTexts - Expected expanded texts
 * @returns {boolean} Whether the mismatch is acceptable
 */
export function handleTranslationLengthMismatch(translatedData, expandedTexts) {
  if (!Array.isArray(translatedData)) {
    logger.debug('Translation response is not an array:', translatedData);
    return false;
  }

  if (!Array.isArray(expandedTexts)) {
    logger.debug('Expanded texts is not an array:', expandedTexts);
    return false;
  }

  if (translatedData.length !== expandedTexts.length) {
    const expectedLength = expandedTexts.length;
    const receivedLength = translatedData.length;

    logger.debug(`Length mismatch: expected ${expectedLength}, received ${receivedLength}`);

    // Calculate acceptable mismatch threshold (3/7 ≈ 43%)
    const mismatchThreshold = (3 / 7) * expectedLength;
    const actualMismatch = Math.abs(receivedLength - expectedLength);

    if (actualMismatch < mismatchThreshold) {
      logger.debug('Mismatch is within acceptable range, continuing processing');
      return true;
    }

    logger.warn('Mismatch is too large, may cause translation errors');
    return false;
  }

  return true;
}

/**
 * Parse and clean translation response JSON
 * @param {string} translatedJsonString - Raw translation response
 * @param {Object} context - Context object for error handling
 * @returns {Array} Parsed translation array
 */
export function parseAndCleanTranslationResponse(translatedJsonString, context = {}) {
  if (!translatedJsonString || typeof translatedJsonString !== 'string') {
    logger.debug('Invalid translation response string provided');
    return [];
  }

  let cleanJsonString = translatedJsonString.trim();

  // Find first JSON structure (preferably array)
  const jsonMatch = cleanJsonString.match(/(\[(?:.|\n|\r)*\]|\{(?:.|\n|\r)*\})/s);

  if (!jsonMatch || !jsonMatch[1]) {
    logger.debug('No JSON structure found in response string');
    return [];
  }

  let potentialJsonString = jsonMatch[1].trim();

  // First parsing attempt
  try {
    const result = JSON.parse(potentialJsonString);
    logger.debug('Successfully parsed JSON response');
    return Array.isArray(result) ? result : [result];
  } catch (initialError) {
    logger.debug('Initial JSON parse failed, attempting repair');

    // Attempt repair for array structures only
    if (potentialJsonString.startsWith("[") && initialError instanceof SyntaxError) {
      return attemptJsonRepair(potentialJsonString, context);
    } else {
      logger.error('Parse failed and repair not applicable:', initialError.message);
      return [];
    }
  }
}

/**
 * Attempt to repair malformed JSON by removing potentially corrupted last element
 * @param {string} jsonString - Malformed JSON string
 * @param {Object} context - Context for error handling
 * @returns {Array} Parsed array or empty array
 */
function attemptJsonRepair(jsonString, context) {
  // Find last comma to remove potentially incomplete element
  const lastCommaIndex = jsonString.lastIndexOf(",", jsonString.length - 2);

  if (lastCommaIndex === -1) {
    logger.debug('No comma found for repair attempt');
    return [];
  }

  // Create repaired string
  let repairedJsonString = jsonString.substring(0, lastCommaIndex);
  repairedJsonString = repairedJsonString.trimEnd() + "]";

  logger.debug('Attempting to parse repaired JSON');

  try {
    const parsedResult = JSON.parse(repairedJsonString);
    logger.warn('Successfully parsed JSON after repair');
    return Array.isArray(parsedResult) ? parsedResult : [parsedResult];
  } catch (repairError) {
    logger.error('Repair attempt failed:', repairError.message);

    // Report error through context if available
    if (context.errorHandler && typeof context.errorHandler.handle === 'function') {
      context.errorHandler.handle(repairError, {
        type: 'API_RESPONSE_INVALID',
        context: 'element-selection-json-repair'
      });
    }

    return [];
  }
}

/**
 * Validate text content for translation worthiness
 * @param {string} text - Text to validate
 * @param {Object} options - Validation options
 * @returns {boolean} Whether text is worth translating
 */
export function isValidTextContent(text, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };

  if (!text || typeof text !== 'string' || text.length === 0) {
    return false;
  }

  // Minimum length requirement
  if (text.length < config.minTextLength) {
    return false;
  }

  // Skip pure numbers, symbols, or whitespace
  const onlyNumbersSymbols = /^[\d\s\p{P}\p{S}]+$/u.test(text);
  if (onlyNumbersSymbols) {
    return false;
  }

  // Skip URLs and email addresses
  const urlPattern = /^https?:\/\/|www\.|@.*\./;
  if (urlPattern.test(text)) {
    return false;
  }

  // Check word count
  const words = text.trim().split(/\s+/);
  if (words.length < config.minWordCount) {
    return false;
  }

  // Skip single common UI words
  if (words.length === 1) {
    const word = words[0].toLowerCase();
    const commonUIWords = [
      'ok', 'cancel', 'yes', 'no', 'submit', 'reset', 'login', 'logout',
      'menu', 'home', 'back', 'next', 'prev', 'previous', 'continue',
      'skip', 'done', 'finish', 'close', 'open', 'save', 'edit', 'delete',
      'search', 'filter', 'sort', 'view', 'hide', 'show', 'toggle'
    ];
    if (commonUIWords.includes(word)) {
      return false;
    }
  }

  return true;
}

/**
 * Clean and normalize text for processing
 * @param {string} text - Text to clean
 * @param {Object} options - Cleaning options
 * @returns {string} Cleaned text
 */
export function cleanText(text, options = {}) {
  const {
    normalizeWhitespace = true,
    removeEmptyLines = true,
    trimLines = true,
    maxLineLength = 1000
  } = options;

  if (!text || typeof text !== 'string') {
    return '';
  }

  let cleaned = text;

  // Normalize whitespace
  if (normalizeWhitespace) {
    cleaned = cleaned.replace(/[\r\n]+/g, '\n').replace(/[ \t]+/g, ' ');
  }

  // Process lines
  if (removeEmptyLines || trimLines || maxLineLength) {
    const lines = cleaned.split('\n');
    const processedLines = lines
      .map(line => {
        let processedLine = line;

        if (trimLines) {
          processedLine = processedLine.trim();
        }

        if (maxLineLength && processedLine.length > maxLineLength) {
          processedLine = processedLine.substring(0, maxLineLength) + '...';
        }

        return processedLine;
      })
      .filter(line => !removeEmptyLines || line.length > 0);

    cleaned = processedLines.join('\n');
  }

  return cleaned;
}

/**
 * Utility object with commonly used text processing functions
 */
export const ElementTextProcessingUtils = {
  expand: expandTextsForTranslation,
  reassemble: reassembleTranslations,
  separate: separateCachedAndNewTexts,
  validate: isValidTextContent,
  clean: cleanText,
  parseResponse: parseAndCleanTranslationResponse,
  checkMismatch: handleTranslationLengthMismatch
};