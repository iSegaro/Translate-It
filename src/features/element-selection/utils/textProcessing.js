// Text Processing Utilities for Element Selection
// Dedicated text processing functions for Select Element feature
// Independent from shared utilities

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

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

  logger.debug(`Expanding ${textsToTranslate.length} texts for translation (max segment: ${config.maxSegmentLength} chars)`);

  if (!config.useOptimization) {
    return expandTextsLegacy(textsToTranslate);
  }

  // Optimized implementation: less aggressive splitting with structure preservation
  const expandedTexts = [];
  const originMapping = [];
  const originalToExpandedIndices = new Map();

  textsToTranslate.forEach((originalText, originalIndex) => {
    const segments = processTextIntoSegments(originalText, config);

    // Only log detailed info for longer texts that are actually being segmented
    if (originalText.length > 100 && segments.length > 1) {
      logger.debug(`Text ${originalIndex}: split into ${segments.length} segments (${originalText.length} chars)`);
    }

    const currentExpandedIndices = [];

    segments.forEach((segment, segmentIndex) => {
      const trimmedSegment = segment.trim();

      // CRITICAL FIX: Handle blank line markers (double newlines) - preserve as structural markers
      if (segment === '\n\n') {
        // Add blank line placeholder for structure preservation
        expandedTexts.push('\n\n'); // Use double newline for blank lines
        originMapping.push({ originalIndex, segmentIndex, isBlankLine: true, isEmptyLine: true });
        currentExpandedIndices.push(expandedTexts.length - 1);
        return;
      }

      // Handle single newlines (also preserve structure)
      if (segment === '\n' || segment === '\r\n') {
        expandedTexts.push('\n'); // Single newline marker
        originMapping.push({ originalIndex, segmentIndex, isBlankLine: false, isSingleNewline: true });
        currentExpandedIndices.push(expandedTexts.length - 1);
        return;
      }

      // Special handling for truly empty segments
      if (segment.length === 0 || segment === '') {
        // Skip truly empty segments
        return;
      }

      // Skip very short segments unless configured to preserve them
      if (!config.preserveShortSegments && trimmedSegment.length < config.minTextLength) {
        return;
      }

      expandedTexts.push(trimmedSegment);
      originMapping.push({ originalIndex, segmentIndex, isBlankLine: false, isContent: true });
      currentExpandedIndices.push(expandedTexts.length - 1);
    });

    // If no segments were added (all were too short), add the original
    if (currentExpandedIndices.length === 0) {
      expandedTexts.push(originalText);
      originMapping.push({ originalIndex, segmentIndex: 0, isBlankLine: false, isContent: true });
      currentExpandedIndices.push(expandedTexts.length - 1);
    }

    originalToExpandedIndices.set(originalIndex, currentExpandedIndices);
  });

  logger.debug(`Text expansion complete: ${textsToTranslate.length} texts → ${expandedTexts.length} segments`);
  return { expandedTexts, originMapping, originalToExpandedIndices };
}

/**
 * Process text into segments based on configuration
 * CRITICAL: Preserves blank lines between segments by including them as empty segments
 * @param {string} text - Text to process
 * @param {Object} config - Processing configuration
 * @returns {string[]} Array of text segments including empty line markers
 */
function processTextIntoSegments(text, config) {
  if (!text || typeof text !== 'string') {
    return [text || ''];
  }

  // VERY AGGRESSIVE FIX: Only split extremely long texts, never split on newlines
  if (text.length <= 1000) {
    // Keep everything as one piece - no splitting whatsoever
    return [text];
  }

  // CRITICAL FIX: Use a more sophisticated splitting that preserves blank lines
  // We split on double newlines but preserve the structure
  const segments = [];
  const DOUBLE_NEWLINE_REGEX = /\n\s*\n/;

  // Split while keeping track of what was between segments
  let lastIndex = 0;
  let match;

  // Create a regex with lastIndex tracking
  const regex = new RegExp(DOUBLE_NEWLINE_REGEX, 'g');
  const parts = [];

  // Split on double newlines, but preserve the segments and the delimiters
  while ((match = regex.exec(text)) !== null) {
    // Add the part before this delimiter
    parts.push(text.substring(lastIndex, match.index));

    // Add a marker for the double newline (blank line)
    parts.push('\n\n');

    lastIndex = match.index + match[0].length;
  }

  // Add the remaining part after the last delimiter
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  } else if (parts.length === 0) {
    // No delimiters found, return entire text as single segment
    return [text];
  }

  // Process parts: keep actual content, normalize blank line markers
  let hasContentAfterProcessing = false;
  parts.forEach((part) => {
    // Check if this is a blank line marker
    if (part === '\n\n') {
      // Preserve blank line as special marker
      segments.push('\n\n');
    } else {
      const trimmedPart = part.trim();
      if (trimmedPart.length > 0) {
        segments.push(trimmedPart);
        hasContentAfterProcessing = true;
      }
    }
  });

  // If we ended up with no actual content (only blank lines), return original
  if (!hasContentAfterProcessing && text.length > 0) {
    return [text];
  }

  // If we have no segments after processing, return original
  if (segments.length === 0) {
    return [text];
  }

  // Further split very long segments (but not blank line markers)
  const finalSegments = [];
  segments.forEach(segment => {
    if (segment === '\n\n') {
      // Preserve blank line markers
      finalSegments.push('\n\n');
    } else if (segment.length <= config.maxSegmentLength) {
      finalSegments.push(segment);
    } else {
      // Split long segments at sentence boundaries
      const sentences = splitAtSentenceBoundaries(segment, config.maxSegmentLength);
      finalSegments.push(...sentences);
    }
  });

  return finalSegments;
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
 * CRITICAL: Preserves blank lines by including them as markers in segments
 * @param {string[]} textsToTranslate - Texts to expand
 * @returns {Object} Expansion result
 */
function expandTextsLegacy(textsToTranslate) {
  const expandedTexts = [];
  const originMapping = [];
  const originalToExpandedIndices = new Map();

  textsToTranslate.forEach((originalText, originalIndex) => {
    // AGGRESSIVE FIX: Prevent all text fragmentation for most cases
    let segments = [];

    // VERY AGGRESSIVE: Only split extremely long texts (>1000 chars)
    if (originalText.length <= 1000) {
      // Keep everything as one piece - no splitting at all
      segments = [originalText];
    } else {
      // CRITICAL FIX: Split on double newlines while preserving the blank line markers
      const DOUBLE_NEWLINE_REGEX = /\n\s*\n/;
      const parts = [];

      // Use manual splitting to preserve blank line information
      let lastIndex = 0;
      let match;
      const regex = new RegExp(DOUBLE_NEWLINE_REGEX, 'g');

      while ((match = regex.exec(originalText)) !== null) {
        // Add the part before this delimiter
        const beforeDelimiter = originalText.substring(lastIndex, match.index);
        if (beforeDelimiter.trim().length > 0) {
          parts.push(beforeDelimiter.trim());
        }

        // Add blank line marker
        parts.push('\n\n');

        lastIndex = match.index + match[0].length;
      }

      // Add remaining part
      const remaining = originalText.substring(lastIndex);
      if (remaining.trim().length > 0) {
        parts.push(remaining.trim());
      }

      // If no delimiters found, use original as single segment
      if (parts.length === 0) {
        segments = [originalText];
      } else {
        segments = parts;
      }

      // If any segment is still too long (>1500 chars), split on sentence boundaries as last resort
      if (segments.some(seg => seg !== '\n\n' && seg.length > 1500)) {
        const newSegments = [];
        segments.forEach(segment => {
          if (segment === '\n\n') {
            // Preserve blank line markers
            newSegments.push(segment);
          } else if (segment.length > 1500) {
            // Split at sentence boundaries for long segments
            const subSegments = splitAtSentenceBoundaries(segment, 1500);
            newSegments.push(...subSegments);
          } else {
            newSegments.push(segment);
          }
        });
        segments = newSegments;
      }
    }

    const currentExpandedIndices = [];

    segments.forEach((segment, segmentIndex) => {
      // CRITICAL FIX: Handle blank line markers
      if (segment === '\n\n') {
        expandedTexts.push('\n\n');
        originMapping.push({ originalIndex, segmentIndex, isBlankLine: true, isEmptyLine: true });
        currentExpandedIndices.push(expandedTexts.length - 1);
        return;
      }

      // Handle single newlines
      if (segment === '\n') {
        expandedTexts.push('\n');
        originMapping.push({ originalIndex, segmentIndex, isBlankLine: false, isSingleNewline: true });
        currentExpandedIndices.push(expandedTexts.length - 1);
        return;
      }

      // ENHANCED: Better handling of empty/whitespace segments
      const trimmedSegment = segment.trim();

      // Only treat as empty line if it's truly just whitespace or very short
      if (trimmedSegment.length === 0 && segment.length < 10) {
        // Add double newline for structural breaks (blank lines)
        expandedTexts.push('\n\n');
        originMapping.push({ originalIndex, segmentIndex, isBlankLine: true, isEmptyLine: true });
        currentExpandedIndices.push(expandedTexts.length - 1);
      } else {
        // Keep the segment as-is with its original structure
        expandedTexts.push(trimmedSegment);
        originMapping.push({ originalIndex, segmentIndex, isBlankLine: false, isContent: true, isEmptyLine: false });
        currentExpandedIndices.push(expandedTexts.length - 1);
      }
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
  * @returns {Map} Map of original texts to translated texts with multi-strategy indexing
 */
export function reassembleTranslations(
  translatedData,
  expandedTexts,
  originMapping,
  textsToTranslate
) {
  if (!Array.isArray(translatedData) || !Array.isArray(expandedTexts) || !Array.isArray(originMapping)) {
    logger.error('reassembleTranslations: Invalid input parameters');
    return new Map();
  }

  const newTranslations = new Map();
  const translatedSegmentsMap = new Map();

  // Note: translatedData length should match filtered expandedTexts length
  // but originMapping contains the original structure info
  const numItemsToProcess = Math.min(expandedTexts.length, translatedData.length);

  // Process translated segments
  for (let i = 0; i < numItemsToProcess; i++) {
    const translatedItem = translatedData[i];
    const mappingInfo = originMapping[i];

    if (translatedItem && typeof translatedItem.text === "string" && mappingInfo) {
      const { originalIndex, isBlankLine, isSingleNewline, isContent } = mappingInfo;
      if (!translatedSegmentsMap.has(originalIndex)) {
        translatedSegmentsMap.set(originalIndex, []);
      }

      // CRITICAL FIX: Handle blank line markers - preserve structure with double newlines
      if (isBlankLine) {
        // Use double newline for blank lines (paragraph separation)
        translatedSegmentsMap.get(originalIndex).push('\n\n');
      } else if (isSingleNewline) {
        // Use single newline for line breaks
        translatedSegmentsMap.get(originalIndex).push('\n');
      } else if (isContent) {
        // Regular content segment
        const originalText = expandedTexts[i] || '';
        let processedTranslation = translatedItem.text;

        // CRITICAL FIX: Strip leading/trailing newlines from translation to avoid duplication
        // The blank line markers will be added separately
        processedTranslation = processedTranslation.replace(/^\n+|\n+$/g, '');

        // Only add newline if original had newline AND translation doesn't already have it
        if (originalText.endsWith('\n') && !processedTranslation.endsWith('\n')) {
          processedTranslation += '\n';
        }

        translatedSegmentsMap.get(originalIndex).push(processedTranslation);
      } else {
        // Legacy handling for isEmptyLine
        const { isEmptyLine } = mappingInfo;
        if (isEmptyLine) {
          translatedSegmentsMap.get(originalIndex).push('\n\n'); // Use double newline
        } else {
          const originalText = expandedTexts[i] || '';
          let processedTranslation = translatedItem.text;
          // Strip leading/trailing newlines from translation
          processedTranslation = processedTranslation.replace(/^\n+|\n+$/g, '');
          if (originalText.endsWith('\n') && !processedTranslation.endsWith('\n')) {
            processedTranslation += '\n';
          }
          translatedSegmentsMap.get(originalIndex).push(processedTranslation);
        }
      }
    } else {
      logger.debug(`Invalid translation data at index ${i}, using fallback`);

      // Use original text as fallback
      if (mappingInfo) {
        const { originalIndex, isBlankLine, isSingleNewline, isContent, isEmptyLine } = mappingInfo;
        if (!translatedSegmentsMap.has(originalIndex)) {
          translatedSegmentsMap.set(originalIndex, []);
        }

        if (isBlankLine) {
          translatedSegmentsMap.get(originalIndex).push('\n\n'); // Double newline for blank lines
        } else if (isSingleNewline) {
          translatedSegmentsMap.get(originalIndex).push('\n'); // Single newline
        } else if (isContent || isEmptyLine === false) {
          // Use the original text from the expandedTexts array as fallback
          const originalSegmentText = expandedTexts[i] || '';
          translatedSegmentsMap.get(originalIndex).push(originalSegmentText);
        } else {
          // Legacy fallback
          if (isEmptyLine) {
            translatedSegmentsMap.get(originalIndex).push('\n\n');
          } else {
            const originalSegmentText = expandedTexts[i] || '';
            translatedSegmentsMap.get(originalIndex).push(originalSegmentText);
          }
        }
      }
    }
  }

  // Reassemble translations for each original text
  textsToTranslate.forEach((originalText, originalIndex) => {
    if (translatedSegmentsMap.has(originalIndex)) {
      const segments = translatedSegmentsMap.get(originalIndex);

      // Only log detailed reassembly info for complex texts
      if (segments.length > 2) {
        logger.debug(`Reassembling text ${originalIndex}: ${segments.length} segments (${originalText.length} chars)`);
      }

      // AGGRESSIVE FIX: Accept ALL segments to prevent content loss
      const validSegments = segments.filter((segment, segmentIndex) => {
        const trimmedSegment = segment.trim();

        // ENHANCED: Detailed logging for debugging content loss
        if (originalText.length > 100 && segments.length > 1) {
          logger.debug(`🔍 SEGMENT VALIDATION ${originalIndex}:${segmentIndex}`, {
            originalSegment: JSON.stringify(segment),
            trimmedSegment: JSON.stringify(trimmedSegment),
            segmentLength: segment.length,
            trimmedLength: trimmedSegment.length,
            isNewline: segment === '\n',
            isDoubleNewline: segment === '\n\n',
            hasContent: trimmedSegment.length > 0
          });
        }

        // VERY PERMISSIVE: Accept almost everything to prevent content loss
        const isValid = trimmedSegment.length > 0 ||  // Has actual content
                       segment === '\n' ||  // Is single newline
                       segment === '\n\n' ||  // CRITICAL: Is double newline (blank line)
                       segment === '\r\n' ||  // Is Windows newline
                       (segment.length > 0 && /\s/.test(segment));  // Has any whitespace

        // Log if a segment is being rejected (should be very rare)
        if (!isValid && originalText.length > 100) {
          logger.debug(`⚠️ REASSEMBLY: Rejecting segment ${originalIndex}:${segmentIndex}`, {
            segmentPreview: segment.substring(0, 50),
            segmentLength: segment.length,
            trimmedLength: trimmedSegment.length
          });
        }

        return isValid;
      });

      // Log if we lost any segments during validation
      if (validSegments.length !== segments.length) {
        logger.debug(`⚠️ REASSEMBLY: Lost ${segments.length - validSegments.length} segments during validation`, {
          originalSegments: segments.length,
          validSegments: validSegments.length,
          originalIndex
        });
      }

      // Build reassembled text by joining valid segments directly
      // This preserves the original structure without adding extra newlines
      let reassembledText = validSegments.join('');

      // AGGRESSIVE FIX: Skip content loss detection for most texts to prevent over-correction
      if (originalText.length > 1000) {
        // Only do content loss detection for very long texts
        const originalContentWords = originalText.trim().split(/\s+/).filter(w => w.length > 0).length;
        const reassembledContentWords = reassembledText.trim().split(/\s+/).filter(w => w.length > 0).length;

        const contentLossRatio = originalContentWords > 0 ? reassembledContentWords / originalContentWords : 1;

        if (contentLossRatio < 0.5 && originalContentWords > 20) {
          logger.error(`❌ REASSEMBLY: Significant content loss detected in long text`, {
            originalIndex,
            originalLength: originalText.length,
            reassembledLength: reassembledText.length,
            lossPercent: Math.round((1 - contentLossRatio) * 100)
          });

          // For long texts, try to recover by joining segments with spaces
          reassembledText = validSegments.join(' ');
        }
      } else {
        // For shorter texts, trust the reassembly and skip validation
        logger.debug(`🔧 SKIPPING content loss detection for shorter text ${originalIndex} (${originalText.length} chars)`);
      }

      // MINIMAL post-processing - only clean up truly excessive newlines
      reassembledText = reassembledText.replace(/\n{8,}/g, '\n\n');

      // CRITICAL: Debug logging for complex texts to ensure content preservation
      const originalTrimmed = originalText.trim();
      if (originalTrimmed.length > 50 && segments.length > 1) {
        logger.debug(`🔍 REASSEMBLY DEBUG for text ${originalIndex}`, {
          originalLength: originalText.length,
          reassembledLength: reassembledText.length,
          segmentCount: segments.length,
          originalPreview: originalText.substring(0, 100) + '...',
          reassembledPreview: reassembledText.substring(0, 100) + '...'
        });
      }

      // CRITICAL FIX: Multi-strategy key indexing for reliable DOM matching
      // This ensures the reassembled translation can be found during DOM application
      // Strategy 1: Exact original text key (primary)
      newTranslations.set(originalText, reassembledText);

      // Strategy 2: Trimmed version (most common matching scenario)
      if (originalTrimmed !== originalText) {
        newTranslations.set(originalTrimmed, reassembledText);
      }

      // Strategy 3: Normalized whitespace (handles whitespace variations)
      const normalizedKey = originalText.replace(/\s+/g, ' ').trim();
      if (normalizedKey !== originalText && normalizedKey !== originalTrimmed) {
        newTranslations.set(normalizedKey, reassembledText);
      }

      // Strategy 4: All whitespace removed (for phone numbers, etc.)
      const noWhitespaceKey = originalText.replace(/\s+/g, '');
      if (noWhitespaceKey !== originalText) {
        newTranslations.set(noWhitespaceKey, reassembledText);
      }

      // Log the indexing strategies for debugging complex texts
      if (originalTrimmed.length > 50 && segments.length > 1) {
        logger.debug(`🔑 REASSEMBLY INDEXING for text ${originalIndex}`, {
          strategies: [
            { key: 'exact', length: originalText.length },
            { key: 'trimmed', length: originalTrimmed.length, different: originalTrimmed !== originalText },
            { key: 'normalized', length: normalizedKey.length, different: normalizedKey !== originalText && normalizedKey !== originalTrimmed },
            { key: 'no_whitespace', length: noWhitespaceKey.length, different: noWhitespaceKey !== originalText }
          ],
          totalEntries: newTranslations.size
        });
      }
    } else {
      // No translated parts found for this text, use original with multi-strategy indexing
      const originalTrimmed = originalText.trim();

      // Strategy 1: Exact original text key (primary)
      newTranslations.set(originalText, originalText);

      // Strategy 2: Trimmed version
      if (originalTrimmed !== originalText) {
        newTranslations.set(originalTrimmed, originalText);
      }

      // Strategy 3: Normalized whitespace
      const normalizedKey = originalText.replace(/\s+/g, ' ').trim();
      if (normalizedKey !== originalText && normalizedKey !== originalTrimmed) {
        newTranslations.set(normalizedKey, originalText);
      }

      // Strategy 4: All whitespace removed
      const noWhitespaceKey = originalText.replace(/\s+/g, '');
      if (noWhitespaceKey !== originalText) {
        newTranslations.set(noWhitespaceKey, originalText);
      }
    }
  });

  logger.debug(`Reassembled ${newTranslations.size} translations with multi-strategy indexing`);

  // Log detailed breakdown for debugging
  if (textsToTranslate.length > 0) {
    const avgEntriesPerText = Math.round(newTranslations.size / textsToTranslate.length * 10) / 10;
    logger.debug(`📈 REASSEMBLY STATISTICS`, {
      originalTexts: textsToTranslate.length,
      totalLookupEntries: newTranslations.size,
      avgEntriesPerOriginal: avgEntriesPerText,
      indexingStrategies: ['exact', 'trimmed', 'normalized', 'no_whitespace']
    });
  }

  return newTranslations;
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
 * Normalize text for consistent matching between extraction and translation application
 * This function ensures that text extracted from DOM and text used for matching
 * translations follow the same normalization rules
 * @param {string} text - Text to normalize
 * @param {Object} options - Normalization options
 * @returns {string} Normalized text
 */
export function normalizeForMatching(text, options = {}) {
  const {
    preserveWhitespace = false,
    normalizeNewlines = true,
    trimExtreme = true,
    collapseSpaces = false
  } = options;

  if (!text || typeof text !== 'string') {
    return '';
  }

  let normalized = text;

  // Normalize line endings
  if (normalizeNewlines) {
    normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  if (preserveWhitespace) {
    // Preserve essential structure but normalize problematic whitespace
    // Convert tabs to spaces
    normalized = normalized.replace(/\t/g, ' ');

    // Collapse multiple spaces into single spaces (but preserve newlines)
    if (collapseSpaces) {
      normalized = normalized.replace(/ {2,}/g, ' ');
    }

    // Trim only extreme whitespace at very beginning/end
    if (trimExtreme) {
      normalized = normalized.replace(/^[ \t]{6,}/g, '  ').replace(/[ \t]{6,}$/g, '  ');
    }
  } else {
    // Standard trimming for matching
    normalized = normalized.trim();
  }

  return normalized;
}

/**
 * Enhanced text matching with multiple strategies
 * @param {string} nodeText - Text from DOM node
 * @param {string} translationKey - Text to match against
 * @returns {Object} Match result with score and type
 */
export function calculateTextMatchScore(nodeText, translationKey) {
  if (!nodeText || !translationKey) {
    return { score: 0, type: 'invalid' };
  }

  const nodeNormalized = normalizeForMatching(nodeText, { preserveWhitespace: false });
  const keyNormalized = normalizeForMatching(translationKey, { preserveWhitespace: false });

  // Exact match gets highest score
  if (nodeNormalized === keyNormalized) {
    return { score: 100, type: 'exact' };
  }

  // Contains relationship
  if (nodeNormalized.includes(keyNormalized) || keyNormalized.includes(nodeNormalized)) {
    const longerText = Math.max(nodeNormalized.length, keyNormalized.length);
    const shorterText = Math.min(nodeNormalized.length, keyNormalized.length);
    const containsScore = (shorterText / longerText) * 90;
    return { score: containsScore, type: 'contains' };
  }

  // Word overlap scoring with stricter criteria
  const nodeWords = nodeNormalized.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const keyWords = keyNormalized.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  if (nodeWords.length === 0 || keyWords.length === 0) {
    return { score: 0, type: 'no_words' };
  }

  const commonWords = nodeWords.filter(word => keyWords.includes(word));
  const overlapRatio = commonWords.length / Math.max(nodeWords.length, keyWords.length);
  const overlapScore = overlapRatio * 50; // Reduced from 70

  // Length similarity bonus with stricter penalty
  const lengthRatio = Math.min(nodeNormalized.length, keyNormalized.length) /
                      Math.max(nodeNormalized.length, keyNormalized.length);

  // Only give length bonus if lengths are reasonably similar
  const lengthBonus = lengthRatio > 0.5 ? lengthRatio * 15 : 0;

  // Penalty for very different lengths
  const lengthPenalty = lengthRatio < 0.3 ? -20 : 0;

  const finalScore = overlapScore + lengthBonus + lengthPenalty;

  return {
    score: finalScore,
    type: 'word_overlap',
    details: {
      overlapRatio,
      lengthRatio,
      commonWords: commonWords.length
    }
  };
}

/**
 * Find best matching translation for a text node
 * @param {string} nodeText - Text from DOM node
 * @param {Map} translations - Available translations
 * @param {number} minScore - Minimum acceptable score
 * @returns {Object} Best match result
 */
export function findBestTranslationMatch(nodeText, translations, minScore = 30) {
  let bestMatch = null;
  let bestScore = 0;

  for (const [originalText, translatedText] of translations.entries()) {
    const matchResult = calculateTextMatchScore(nodeText, originalText);

    if (matchResult.score > bestScore && matchResult.score >= minScore) {
      bestScore = matchResult.score;
      bestMatch = {
        originalText,
        translatedText,
        score: matchResult.score,
        type: matchResult.type,
        details: matchResult.details
      };
    }
  }

  return bestMatch;
}

/**
 * Utility object with commonly used text processing functions
 */
export const ElementTextProcessingUtils = {
  expand: expandTextsForTranslation,
  reassemble: reassembleTranslations,
  validate: isValidTextContent,
  clean: cleanText,
  parseResponse: parseAndCleanTranslationResponse,
  checkMismatch: handleTranslationLengthMismatch,
  normalizeForMatching,
  calculateTextMatchScore,
  findBestTranslationMatch
};