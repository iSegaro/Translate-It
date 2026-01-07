// Placeholder Reassembly - Reassemble translations with original inline elements
// Part of the Contextual Sentence Translation system

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { cleanupPlaceholderIds } from './PlaceholderRegistry.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'placeholderReassembly');

/**
 * Regex pattern for AI placeholders with whitespace tolerance
 * Format: [[AIWC-0]], [[AIWC-1]], etc.
 * Handles variations: [[AIWC-0]], [[ AIWC-0 ]], [[AIWC-0 ]]
 */
const PLACEHOLDER_REGEX_AI = /\[\[\s*AIWC-(\d+)\s*\]\]/g;

/**
 * Regex pattern for traditional provider placeholders (HTML span format)
 * Format: <span translate="no" data-aiwc-ph-id="0">0</span>
 */
const PLACEHOLDER_REGEX_TRADITIONAL = /<span[^>]*translate="no"[^>]*data-aiwc-ph-id="(\d+)"[^>]*>/g;

/**
 * Placeholder boundary regex for validation (AI format)
 */
const PLACEHOLDER_BOUNDARY_REGEX = /\[\[AIWC-\d+\]\]/g;

/**
 * Extract placeholder IDs from translated text
 * @param {string} translatedText - The translated text containing placeholders
 * @param {string} format - The placeholder format ('ai' or 'traditional')
 * @returns {Array} Array of found placeholder objects with id and position
 */
export function extractPlaceholdersFromTranslation(translatedText, format = 'ai') {
  const regex = format === 'traditional' ? PLACEHOLDER_REGEX_TRADITIONAL : PLACEHOLDER_REGEX_AI;
  const placeholders = [];
  let match;

  while ((match = regex.exec(translatedText)) !== null) {
    placeholders.push({
      id: parseInt(match[1], 10),
      position: match.index,
      fullMatch: match[0],
      length: match[0].length
    });
  }

  logger.debug(`Extracted ${placeholders.length} placeholders from translation`, {
    format,
    ids: placeholders.map(p => p.id)
  });

  return placeholders;
}

/**
 * Validate that placeholder count matches expected
 * @param {Array} foundPlaceholders - Placeholders found in translation
 * @param {PlaceholderRegistry} registry - The placeholder registry
 * @returns {Object} Validation result
 */
export function validatePlaceholders(foundPlaceholders, registry) {
  const expectedCount = registry.size;
  const foundCount = foundPlaceholders.length;
  const foundIds = new Set(foundPlaceholders.map(p => p.id));
  const expectedIds = new Set(registry.getAllIds());

  const missingIds = Array.from(expectedIds).filter(id => !foundIds.has(id));
  const extraIds = Array.from(foundIds).filter(id => !expectedIds.has(id));

  const isValid = missingIds.length === 0 && extraIds.length === 0 && foundCount === expectedCount;

  return {
    isValid,
    expectedCount,
    foundCount,
    missingIds,
    extraIds,
    foundIds: Array.from(foundIds)
  };
}

/**
 * Check if a position is inside a placeholder marker
 * CRITICAL: Never split inside or adjacent to placeholder markers
 * @param {string} text - The text to check
 * @param {number} position - The position to check
 * @returns {boolean} True if position is inside a placeholder
 */
export function isInsidePlaceholder(text, position) {
  const matches = [...text.matchAll(PLACEHOLDER_BOUNDARY_REGEX)];

  for (const match of matches) {
    const startIndex = match.index;
    const endIndex = match.index + match[0].length;

    // Check if position is inside placeholder
    if (position >= startIndex && position < endIndex) {
      return true;
    }

    // Also protect 2 characters before and after placeholders
    if (Math.abs(position - startIndex) <= 2 || Math.abs(position - endIndex) <= 2) {
      return true;
    }
  }

  return false;
}

/**
 * Reassemble translation by replacing placeholders with original HTML
 * @param {string} translatedText - The translated text with placeholders
 * @param {PlaceholderRegistry} registry - The placeholder registry
 * @param {HTMLElement} blockContainer - The block container for cleanup
 * @param {string} format - The placeholder format ('ai' or 'traditional')
 * @returns {Object} Reassembly result with HTML and metadata
 */
export function reassembleTranslationWithPlaceholders(
  translatedText,
  registry,
  blockContainer,
  format = 'ai'
) {
  logger.debug('Starting placeholder reassembly', {
    textLength: translatedText.length,
    format,
    registrySize: registry.size
  });

  // Extract placeholders from translation
  const foundPlaceholders = extractPlaceholdersFromTranslation(translatedText, format);

  // Validate placeholders
  const validation = validatePlaceholders(foundPlaceholders, registry);

  if (!validation.isValid) {
    logger.warn('Placeholder validation failed', {
      expected: validation.expectedCount,
      found: validation.foundCount,
      missing: validation.missingIds,
      extra: validation.extraIds
    });

    return {
      success: false,
      error: 'Placeholder validation failed',
      validation,
      fallback: true
    };
  }

  // Replace placeholders with original HTML
  let reassembledHTML = translatedText;
  const replacements = [];

  // Sort by position in reverse order to avoid position shifting issues
  const sortedPlaceholders = [...foundPlaceholders].sort((a, b) => b.position - a.position);

  for (const placeholder of sortedPlaceholders) {
    const originalHTML = registry.getPlaceholderHTML(placeholder.id);
    const element = registry.getPlaceholderOrRecover(placeholder.id);

    if (!originalHTML || !element) {
      logger.error(`Could not recover placeholder [${placeholder.id}]`);
      return {
        success: false,
        error: `Could not recover placeholder [${placeholder.id}]`,
        placeholderId: placeholder.id,
        fallback: true
      };
    }

    // Replace placeholder marker with original HTML
    const placeholderMarker = placeholder.fullMatch;
    reassembledHTML =
      reassembledHTML.slice(0, placeholder.position) +
      originalHTML +
      reassembledHTML.slice(placeholder.position + placeholder.length);

    replacements.push({
      id: placeholder.id,
      placeholder: placeholderMarker,
      originalHTML
    });
  }

  logger.debug('Placeholder reassembly successful', {
    replacementCount: replacements.length,
    htmlLength: reassembledHTML.length
  });

  return {
    success: true,
    html: reassembledHTML,
    replacements,
    validation
  };
}

/**
 * Handle missing placeholders by falling back to atomic extraction
 * @param {string} translatedText - The translated text
 * @returns {Object} Fallback result
 */
export function handleMissingPlaceholders(translatedText) {
  logger.warn('Handling missing placeholders - falling back to atomic extraction');

  // Clean up placeholder markers from translated text
  const cleanedText = translatedText.replace(/\[\[AIWC-\d+\]\]/g, '').trim();

  return {
    success: false,
    error: 'Placeholders missing or corrupted',
    fallback: true,
    cleanedText,
    suggestion: 'Fallback to atomic extraction required'
  };
}

/**
 * Apply reassembled HTML to block container
 * @param {HTMLElement} blockContainer - The block container
 * @param {string} reassembledHTML - The reassembled HTML
 * @returns {Promise<void>}
 */
export async function applyReassembledHTML(blockContainer, reassembledHTML) {
  logger.debug('Applying reassembled HTML to block container', {
    tagName: blockContainer.tagName,
    htmlLength: reassembledHTML.length
  });

  try {
    // Replace the innerHTML with reassembled content
    // eslint-disable-next-line noUnsanitized/property -- Applying reassembled translation with placeholders
    blockContainer.innerHTML = reassembledHTML;

    logger.debug('Successfully applied reassembled HTML');
  } catch (error) {
    logger.error('Failed to apply reassembled HTML', { error });
    throw error;
  }
}

/**
 * Complete reassembly workflow with cleanup
 * @param {string} translatedText - The translated text with placeholders
 * @param {PlaceholderRegistry} registry - The placeholder registry
 * @param {HTMLElement} blockContainer - The block container
 * @param {string} format - The placeholder format
 * @returns {Promise<Object>} Result object with success status and metadata
 */
export async function completeReassemblyWorkflow(
  translatedText,
  registry,
  blockContainer,
  format = 'ai'
) {
  try {
    // Step 1: Reassemble translation
    const reassemblyResult = reassembleTranslationWithPlaceholders(
      translatedText,
      registry,
      blockContainer,
      format
    );

    if (!reassemblyResult.success) {
      // Cleanup and return failure
      cleanupPlaceholderIds(blockContainer);
      registry.clear(blockContainer);
      return reassemblyResult;
    }

    // Step 2: Apply reassembled HTML
    await applyReassembledHTML(blockContainer, reassemblyResult.html);

    // Step 3: Cleanup temporary attributes
    const cleanedCount = cleanupPlaceholderIds(blockContainer);

    // Step 4: Clear registry
    registry.clear();

    logger.info('Reassembly workflow complete', {
      replacements: reassemblyResult.replacements.length,
      cleanedAttributes: cleanedCount
    });

    return {
      success: true,
      html: reassemblyResult.html,
      replacements: reassemblyResult.replacements,
      cleanedAttributes: cleanedCount
    };
  } catch (error) {
    logger.error('Reassembly workflow failed', { error });

    // Cleanup on error
    cleanupPlaceholderIds(blockContainer);
    registry.clear(blockContainer);

    return {
      success: false,
      error: error.message,
      fallback: true
    };
  }
}

/**
 * Validate that placeholder boundaries are preserved in text chunks
 * Used for batching protection to ensure placeholders aren't split
 * @param {Array} chunks - Array of text chunks
 * @param {string} originalText - Original text before chunking
 * @returns {boolean} True if no placeholders were split
 */
export function validatePlaceholderBoundaries(chunks, originalText) {
  // Count placeholders in original text
  const originalMatches = originalText.match(PLACEHOLDER_BOUNDARY_REGEX);
  const originalCount = originalMatches ? originalMatches.length : 0;

  // Count placeholders in all chunks
  let chunkCount = 0;
  for (const chunk of chunks) {
    const matches = chunk.match(PLACEHOLDER_BOUNDARY_REGEX);
    if (matches) {
      chunkCount += matches.length;
    }

    // Also check for broken placeholders (incomplete markers)
    const brokenPattern = /\[\[AIWC-\d+$|^\d+\]\]|\[\[AIWC-|AIWC-\d+\]\]/;
    if (brokenPattern.test(chunk)) {
      logger.error('Found broken placeholder in chunk', { chunk: chunk.substring(0, 100) });
      return false;
    }
  }

  const isValid = chunkCount === originalCount;

  if (!isValid) {
    logger.warn('Placeholder boundary validation failed', {
      originalCount,
      chunkCount
    });
  }

  return isValid;
}

/**
 * Export utilities for testing
 */
export const __testing__ = {
  PLACEHOLDER_REGEX_AI,
  PLACEHOLDER_REGEX_TRADITIONAL,
  PLACEHOLDER_BOUNDARY_REGEX,
  extractPlaceholdersFromTranslation,
  validatePlaceholders,
  isInsidePlaceholder,
  reassembleTranslationWithPlaceholders,
  handleMissingPlaceholders,
  validatePlaceholderBoundaries
};
