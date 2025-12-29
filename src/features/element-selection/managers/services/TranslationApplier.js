import { getScopedLogger } from "../../../../shared/logging/logger.js";
import { LOG_COMPONENTS } from "../../../../shared/logging/logConstants.js";
import { normalizeForMatching } from "../../utils/textProcessing.js";
import { generateUniqueId } from "../../utils/domManipulation.js";
import { detectTextDirectionFromContent } from "../../utils/textDirection.js";

/**
 * Helper function to escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Helper function to wrap LTR portions within RTL text with proper direction
 * This fixes issues where English words/numbers in Persian text get repositioned
 * @param {string} text - Text to process
 * @param {string} direction - Detected direction ('rtl' or 'ltr')
 * @returns {string} Processed HTML with LTR portions wrapped
 */
function wrapLTRPortions(text, direction) {
  // Only process if direction is RTL
  if (direction !== 'rtl') {
    return escapeHtml(text);
  }

  // Define Strong LTR character class:
  // - Latin Letters (Basic + Extended)
  // - Digits (0-9)
  // - Greek (\u0370-\u03FF)
  // - Cyrillic (\u0400-\u052F)
  // - CJK (Chinese, Japanese, Korean) (\u3040-\u30FF, \u4E00-\u9FFF, \uAC00-\uD7AF)
  // This covers English, Numbers, Russian, Greek, CJK, and most European languages.
  const ltrCharRange = 'A-Za-z0-9\\u00C0-\\u00D6\\u00D8-\\u00f6\\u00f8-\\u024f\\u0370-\\u03FF\\u0400-\\u052F\\u3040-\\u309F\\u30A0-\\u30FF\\u4E00-\\u9FFF\\uAC00-\\uD7AF';
  
  // Quick check: If no Strong LTR characters exist, return original text escaped.
  if (!new RegExp(`[${ltrCharRange}]`).test(text)) {
    return escapeHtml(text);
  }

  // Regex Strategy: Group contiguous LTR words separated by spaces into a single LTR segment.
  // Pattern Explanation:
  // ([...]+             : Capture Group starting with one or more LTR chars
  //   (?:               : Non-capturing group for subsequent words
  //     \s+             : One or more whitespace characters (creates the link)
  //     [...]+          : One or more LTR chars
  //   )*                : Repeat 0 or more times
  // )
  // This treats "Agent Zero" as a single block, preventing the RTL reordering issue (Zero Agent).
  // Punctuation (.,-,etc) will naturally break the sequence, protecting sentence structure.
  const ltrPhraseRegex = new RegExp(`([${ltrCharRange}]+(?:\\s+[${ltrCharRange}]+)*)`, 'g');

  // Split text by the LTR phrases. The capturing group ensures the phrases are included in the result array.
  const parts = text.split(ltrPhraseRegex);

  return parts.map(part => {
    // Identify if this part is an LTR phrase by checking if it starts with an LTR char
    // (Trimming ensures we don't count whitespace-only artifacts, though regex structure largely prevents them)
    if (part && new RegExp(`^[${ltrCharRange}]`).test(part.trim())) {
      return `<span dir="ltr">${escapeHtml(part)}</span>`;
    }
    return escapeHtml(part);
  }).join('');
}

/**
 * TranslationApplier - Core DOM manipulation for applying translations
 * Handles translation lookup, wrapper creation, and node replacement
 *
 * Responsibilities:
 * - Core DOM manipulation for applying translations
 * - Translation lookup with multiple matching strategies
 * - Wrapper creation and node replacement
 * - TEXT_NODE and ELEMENT_NODE handling
 * - Skip identical translation logic
 * - Empty node rescue mode
 * - Fallback matching strategies
 * - LTR portion wrapping in RTL text
 *
 * @memberof module:features/element-selection/managers/services
 */
export class TranslationApplier {
  constructor(uiManager) {
    this.uiManager = uiManager;
    this.logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'TranslationApplier');
  }

  /**
   * Initialize the translation applier
   */
  initialize() {
    this.logger.debug('TranslationApplier initialized');
  }

  /**
   * Apply translations directly to DOM nodes using wrapper approach for Revert compatibility
   * @param {Array} textNodes - Array of text nodes to translate
   * @param {Map} translations - Map of original text to translated text
   * @param {Object} options - Application options
   * @returns {Promise<Object>} Application result
   */
  async applyTranslationsToNodes(textNodes, translations, options = {}) {
    this.logger.debug("DETERMINISTIC TRANSLATION APPLICATION", {
      textNodesCount: textNodes.length,
      translationsSize: translations.size,
      skipStreamingUpdates: options.skipStreamingUpdates || false,
      isFinalResult: options.isFinalResult || false,
      messageId: options.messageId
    });

    // Get target language for better RTL detection
    const { getTargetLanguageAsync } = await import("../../../../config.js");
    const targetLanguage = await getTargetLanguageAsync();

    let processedCount = 0;
    const unmatchedNodes = [];

    // Filter out undefined or null nodes to prevent errors
    // Accept both TEXT_NODE (legacy) and ELEMENT_NODE with segment-id (new approach)
    const validTextNodes = textNodes.map(node => {
      // For segment ID nodes, find the current DOM element
      if (node.node && node.segmentId) {
        const segmentId = node.segmentId;
        const actualNode = document.querySelector(`[data-segment-id="${segmentId}"]`);
        if (actualNode && actualNode.parentNode) {
          this.logger.debug(`Found segment element for ID ${segmentId}`, {
            nodeName: actualNode.nodeName,
            nodeType: actualNode.nodeType,
            hasParent: !!actualNode.parentNode,
            parentName: actualNode.parentNode?.nodeName
          });
          return actualNode;
        } else {
          this.logger.debug(`Segment element not found or has no parent for ID ${segmentId}`, {
            segmentId,
            found: !!actualNode,
            hasParent: actualNode?.parentNode
          });
        }
      }
      return node;
    }).filter(node => {
      if (!node) {
        return false;
      }

      // Check if node has parent (critical for DOM manipulation)
      if (!node.parentNode) {
        this.logger.debug(`Filtering out node without parent`, {
          nodeType: node.nodeType,
          nodeName: node.nodeName,
          hasSegmentId: node.hasAttribute?.('data-segment-id')
        });
        return false;
      }

      // Accept both TEXT_NODE (legacy) and ELEMENT_NODE with segment-id (new approach)
      const isValid = node.nodeType === Node.TEXT_NODE ||
        (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute && node.hasAttribute('data-segment-id'));

      if (!isValid) {
        this.logger.debug(`Filtering out invalid node type`, {
          nodeType: node.nodeType,
          nodeName: node.nodeName,
          hasSegmentId: node.hasAttribute?.('data-segment-id')
        });
      }

      return isValid;
    });

    this.logger.debug('Filtered text nodes', {
      originalCount: textNodes.length,
      validCount: validTextNodes.length
    });

    // CRITICAL: Create a comprehensive lookup table for DETERMINISTIC matching
    const translationLookup = new Map();

    // Add all translation keys with EXTENSIVE indexing strategies
    for (const [originalKey, translation] of translations.entries()) {
      // Strategy 1: Exact key
      translationLookup.set(originalKey, translation);

      // Strategy 2: Trimmed key
      const trimmedKey = originalKey.trim();
      if (trimmedKey !== originalKey) {
        translationLookup.set(trimmedKey, translation);
      }

      // Strategy 3: Normalized whitespace
      const normalizedKey = originalKey.replace(/\s+/g, ' ').trim();
      if (normalizedKey !== originalKey && normalizedKey !== trimmedKey) {
        translationLookup.set(normalizedKey, translation);
      }

      // Strategy 4: All whitespace removed (for phone numbers)
      const noWhitespaceKey = originalKey.replace(/\s+/g, '');
      if (noWhitespaceKey !== originalKey) {
        translationLookup.set(noWhitespaceKey, translation);
      }

      // CRITICAL FIX: Strategy 5 - Phone number with newlines (common case)
      if (trimmedKey.match(/^\+?[\d\s\-()]+$/)) {
        // Generate variations for phone numbers with different whitespace patterns
        const withTrailingSpaces = trimmedKey + '\n';
        const withLeadingSpaces = '\n' + trimmedKey;
        const withBothSpaces = '\n' + trimmedKey + '\n';
        const withExtraSpaces = trimmedKey + '\n                            ';
        const withDifferentSpaces = trimmedKey + '\n                          ';

        translationLookup.set(withTrailingSpaces, translation);
        translationLookup.set(withLeadingSpaces, translation);
        translationLookup.set(withBothSpaces, translation);
        translationLookup.set(withExtraSpaces, translation);
        translationLookup.set(withDifferentSpaces, translation);
      }

      // Strategy 6: Multiple trailing newlines and spaces (for text content)
      if (trimmedKey.length > 0) {
        const withNewlines = originalKey + '\n';
        const withMultipleNewlines = originalKey + '\n\n';
        const withSpaces = originalKey + ' ';
        const withLeadingSpaces = ' ' + originalKey;
        const withTrailingSpaces = originalKey + ' ';
        const withBothSpaces = ' ' + originalKey + ' ';

        translationLookup.set(withNewlines, translation);
        translationLookup.set(withMultipleNewlines, translation);
        translationLookup.set(withSpaces, translation);
        translationLookup.set(withLeadingSpaces, translation);
        translationLookup.set(withTrailingSpaces, translation);
        translationLookup.set(withBothSpaces, translation);
      }

      // Strategy 7: Enhanced variations for long text content (main issue case)
      if (trimmedKey.length > 50) {
        // Common whitespace pattern variations for long content
        const variations = [
          originalKey.replace(/\s+/g, ' '), // Single spaces only
          originalKey.replace(/\s+/g, '\n'), // Newlines instead of spaces
          originalKey.replace(/\n+/g, ' '), // Replace newlines with spaces
          originalKey.replace(/\n\s*\n/g, '\n'), // Remove empty lines
          originalKey.replace(/^\s+|\s+$/g, ''), // Trim both ends
          originalKey.replace(/\s*$/g, ''), // Remove trailing whitespace only
          originalKey.replace(/^\s*/g, ''), // Remove leading whitespace only
        ];

        variations.forEach(variation => {
          if (variation !== originalKey && variation.length > 20) {
            translationLookup.set(variation, translation);
          }
        });
      }
    }

    this.logger.debug(`ENHANCED Translation lookup table created`, {
      totalKeys: translationLookup.size,
      originalKeys: translations.size,
      lookupStrategies: ['exact', 'trimmed', 'normalized', 'no_whitespace', 'phone_variants', 'newline_variants']
    });

    // Apply translations using wrapper approach for Revert compatibility
    for (let nodeIndex = 0; nodeIndex < validTextNodes.length; nodeIndex++) {
      const textNode = validTextNodes[nodeIndex];

      // Enhanced null check for parentNode
      if (!textNode || !textNode.parentNode) {
        this.logger.debug(`Skipping node ${nodeIndex}: no parent node`, {
          nodeType: textNode?.nodeType,
          hasSegmentId: textNode?.hasAttribute?.('data-segment-id'),
          nodeName: textNode?.nodeName
        });
        continue;
      }

      // Handle both TEXT_NODE (legacy) and ELEMENT_NODE with segment-id (new approach)
      let originalText;
      if (textNode.nodeType === Node.TEXT_NODE) {
        originalText = textNode.textContent;
      } else if (textNode.nodeType === Node.ELEMENT_NODE && textNode.hasAttribute('data-segment-id')) {
        // CRITICAL FIX: Use data-original-text attribute if available (contains actual original English)
        // Otherwise fall back to textContent
        // This is necessary because in the final phase, textContent has already been
        // translated by the streaming phase, so we need the stored original text
        originalText = textNode.getAttribute('data-original-text') || textNode.textContent;
      } else {
        continue; // Skip unsupported node types
      }
      const trimmedOriginalText = originalText.trim();

      // Check if node was already updated during streaming - look for any wrapper in the hierarchy
      let isAlreadyTranslated = false;
      let translationWrapper = null;
      let translationInner = null;

      // Check current node and all ancestors for translation wrapper
      let currentNode = textNode;
      while (currentNode && currentNode !== document.body) {
        if (currentNode.classList?.contains?.('aiwc-translation-wrapper')) {
          isAlreadyTranslated = true;
          translationWrapper = currentNode;
          translationInner = currentNode.querySelector('.aiwc-translation-inner');
          break;
        }
        currentNode = currentNode.parentNode;
      }

      // CRITICAL FIX: Also check if segment has content different from original (streaming translation)
      if (!isAlreadyTranslated && textNode.nodeType === Node.ELEMENT_NODE && textNode.hasAttribute('data-segment-id')) {
        const originalTextAttr = textNode.getAttribute('data-original-text');
        const currentContent = textNode.textContent;
        // If content differs from original, it was translated in streaming phase
        if (originalTextAttr && currentContent && currentContent !== originalTextAttr && currentContent !== originalTextAttr.trim()) {
          isAlreadyTranslated = true;
          this.logger.debug(`Segment has streaming translation (no wrapper)`, {
            segmentId: textNode.getAttribute('data-segment-id'),
            originalText: originalTextAttr.substring(0, 30),
            currentContent: currentContent.substring(0, 30)
          });
        }
      }

      // DEBUG: Enhanced logging for translation detection
      if (textNode.textContent.trim().length > 5) {
        this.logger.debug(`TRANSLATION DETECTION for node ${nodeIndex}`, {
          nodeClasses: textNode.parentNode?.className || 'NO_CLASSES',
          foundWrapper: !!translationWrapper,
          foundInner: !!translationInner,
          isAlreadyTranslated,
          nodePreview: textNode.textContent.substring(0, 30) + '...'
        });
      }

      // ENHANCED: Robust detection for text that needs complete final translation
      const isImportantLongText = trimmedOriginalText.length > 5; // Lower threshold for better detection
      const containsComplexContent = originalText.trim().length > 0 && /[A-Za-z]{2,}/.test(originalText); // Check original, not trimmed
      const hasMeaningfulContent = originalText.trim().length > 0; // Basic content check
      const isOriginalLongText = originalText.length > 20; // More realistic threshold
      const isTranslationCandidate = isImportantLongText || containsComplexContent || hasMeaningfulContent || isOriginalLongText;

      // ENHANCED: Comprehensive logging for debugging node candidacy issues
      this.logger.debug(`ENHANCED NODE CANDIDACY CHECK for node ${nodeIndex}`, {
        originalLength: originalText.length,
        trimmedLength: trimmedOriginalText.length,
        isAlreadyTranslated,
        skipStreamingUpdates: options.skipStreamingUpdates,
        isImportantLongText,
        containsComplexContent,
        hasMeaningfulContent,
        isOriginalLongText,
        isTranslationCandidate,
        willProcessReplacement: options.skipStreamingUpdates && isAlreadyTranslated && isTranslationCandidate,
        originalPreview: originalText.substring(0, 50) + '...',
        trimmedPreview: trimmedOriginalText.substring(0, 30) + '...',
        originalTextHash: originalText.length > 0 ? originalText.substring(0, 10).replace(/\s/g, '_') : 'empty',
        trimmedTextHash: trimmedOriginalText.length > 0 ? trimmedOriginalText.substring(0, 10).replace(/\s/g, '_') : 'empty'
      });

      // CRITICAL FIX: For final results, ALWAYS process ALL nodes, not just already translated ones
      if (options.isFinalResult && isTranslationCandidate) {
        this.logger.debug(`FINAL RESULT PROCESSING for node ${nodeIndex}`, {
          isAlreadyTranslated,
          originalLength: originalText.length,
          trimmedLength: trimmedOriginalText.length,
          skipStreamingUpdates: options.skipStreamingUpdates
        });
      }

      // ENHANCED FIX: Process ALL nodes for final results, regardless of translation status
      // For non-final results, only process nodes that were already translated during streaming
      const shouldProcessNode = options.isFinalResult
        ? isTranslationCandidate // Process ALL translation candidates for final results
        : (options.skipStreamingUpdates && isAlreadyTranslated && isTranslationCandidate); // Only streaming updates for non-final

      if (shouldProcessNode) {
        // Apply the translation processing logic
        const result = await this._processNodeForTranslation(
          textNode,
          originalText,
          trimmedOriginalText,
          translationLookup,
          translationInner,
          translationWrapper,
          isAlreadyTranslated,
          targetLanguage,
          options,
          nodeIndex
        );

        if (result.applied) {
          processedCount++;
        } else if (result.unmatched) {
          unmatchedNodes.push(result.unmatched);
        }
      }
    }

    this.logger.debug("TRANSLATION APPLICATION COMPLETE", {
      totalNodes: textNodes.length,
      validNodes: validTextNodes.length,
      appliedCount: processedCount,
      unmatchedCount: unmatchedNodes.length,
      targetLanguage: targetLanguage,
      translationsAvailable: translations.size,
      unmatchedNodes: unmatchedNodes.slice(0, 5),
      availableTranslations: Array.from(translations.keys()).slice(0, 15)
    });

    // Return result for compatibility
    return {
      appliedCount: processedCount,
      totalNodes: validTextNodes.length,
      targetLanguage: targetLanguage
    };
  }

  /**
   * Process a single node for translation
   * @private
   */
  async _processNodeForTranslation(
    textNode,
    originalText,
    trimmedOriginalText,
    translationLookup,
    translationInner,
    translationWrapper,
    isAlreadyTranslated,
    targetLanguage,
    options,
    nodeIndex
  ) {
    // Always try to find a complete final translation first
    let finalTranslation = null;
    let matchStrategy = '';

    // ENHANCED: Multi-strategy translation lookup with comprehensive fallbacks
    // Strategy 1: Exact match
    if (translationLookup.has(originalText)) {
      finalTranslation = translationLookup.get(originalText);
      matchStrategy = 'exact';
    }
    // Strategy 2: Trimmed match
    else if (translationLookup.has(trimmedOriginalText)) {
      finalTranslation = translationLookup.get(trimmedOriginalText);
      matchStrategy = 'trimmed';
    }
    // Strategy 3: Normalized whitespace
    else {
      const normalizedOriginal = originalText.replace(/\s+/g, ' ').trim();
      if (translationLookup.has(normalizedOriginal)) {
        finalTranslation = translationLookup.get(normalizedOriginal);
        matchStrategy = 'normalized';
      }
    }

    // ENHANCED: Special handling for empty nodes (likely processed during streaming)
    if (!finalTranslation && (trimmedOriginalText.length === 0 || originalText.trim().length === 0)) {
      // This is likely a node that was processed during streaming and now contains only whitespace
      // Find substantial translations from the lookup table
      const substantialTranslations = [];

      for (const [key, translation] of translationLookup.entries()) {
        const translationLength = translation.trim().length;
        if (translationLength > 20) { // Only consider substantial translations
          substantialTranslations.push({
            key,
            translation,
            length: translationLength
          });
        }
      }

      // Sort by length descending and get the longest one
      substantialTranslations.sort((a, b) => b.length - a.length);

      if (substantialTranslations.length > 0) {
        const bestMatch = substantialTranslations[0];
        finalTranslation = bestMatch.translation;
        matchStrategy = 'empty_node_substantial_match';

        this.logger.debug(`EMPTY NODE MATCH: Found substantial translation (${bestMatch.length} chars) for empty node ${nodeIndex}`, {
          nodeOriginalLength: originalText.length,
          translationLength: bestMatch.length,
          keyPreview: bestMatch.key.substring(0, 50) + '...',
          translationPreview: bestMatch.translation.substring(0, 50) + '...',
          nodeIndex,
          isEmptyNode: trimmedOriginalText.length === 0
        });
      }
    }

    // ENHANCED: Advanced fallback matching for difficult cases
    if (!finalTranslation && trimmedOriginalText.length > 20) {
      // Strategy 4: Fuzzy matching - find best partial match
      let bestMatch = null;
      let bestScore = 0;

      for (const [key, translation] of translationLookup.entries()) {
        const keyTrimmed = key.trim();

        // Skip very short keys
        if (keyTrimmed.length < 10) continue;

        // Calculate similarity score
        let score = 0;

        // Check if current node text contains translation key
        if (trimmedOriginalText.includes(keyTrimmed)) {
          score = (keyTrimmed.length / trimmedOriginalText.length) * 100;
        }
        // Check if translation key contains current node text
        else if (keyTrimmed.includes(trimmedOriginalText)) {
          score = (trimmedOriginalText.length / keyTrimmed.length) * 100;
        }
        // Check word overlap for similar content
        else {
          const nodeWords = new Set(trimmedOriginalText.toLowerCase().split(/\s+/));
          const keyWords = new Set(keyTrimmed.toLowerCase().split(/\s+/));
          const intersection = new Set([...nodeWords].filter(x => keyWords.has(x)));
          const union = new Set([...nodeWords, ...keyWords]);

          if (union.size > 0) {
            score = (intersection.size / union.size) * 100;
          }
        }

        // Update best match if this score is better
        if (score > bestScore && score > 30) { // 30% minimum similarity threshold
          bestScore = score;
          bestMatch = translation;
          matchStrategy = `fuzzy_${Math.round(score)}%`;
        }
      }

      if (bestMatch) {
        finalTranslation = bestMatch;
        this.logger.debug(`FUZZY MATCH FOUND for node ${nodeIndex}`, {
          score: bestScore,
          strategy: matchStrategy,
          originalLength: trimmedOriginalText.length,
          translationLength: bestMatch.length
        });
      }
    }

    // ENHANCED: Smart fallback for missing original text nodes (rescue mode)
    if (!finalTranslation && (trimmedOriginalText.length === 0 || originalText.trim().length === 0)) {
      // This node likely contained the original English text that was translated during streaming
      // RESCUE MODE: Find the longest available translation (most likely to be the complete translation)
      let longestTranslation = '';
      let longestKey = '';
      let longestLength = 0;

      this.logger.debug(`RESCUE MODE: Looking for longest translation for empty node ${nodeIndex}`, {
        originalLength: originalText.length,
        trimmedLength: trimmedOriginalText.length,
        totalLookupEntries: translationLookup.size
      });

      for (const [key, translation] of translationLookup.entries()) {
        const translationLength = translation.trim().length;
        // Prioritize translations that are substantial (not just whitespace or single characters)
        if (translationLength > longestLength && translationLength > 10) {
          longestTranslation = translation;
          longestKey = key;
          longestLength = translationLength;
        }
      }

      // Apply rescue translation if found and it's substantial
      if (longestTranslation && longestLength > 30) {
        finalTranslation = longestTranslation;
        matchStrategy = 'rescue_longest_translation';

        this.logger.debug(`RESCUE MODE SUCCESS: Applying longest translation (${longestLength} chars) to empty node ${nodeIndex}`, {
          originalLength: originalText.length,
          translationLength: longestLength,
          longestKeyPreview: longestKey.substring(0, 50) + '...',
          translationPreview: longestTranslation.substring(0, 50) + '...',
          nodeIndex,
          isEmptyNode: trimmedOriginalText.length === 0
        });
      }
    }

    // ENHANCED: Last resort - find any translation with reasonable length match
    if (!finalTranslation && trimmedOriginalText.length > 50) {
      for (const [, translation] of translationLookup.entries()) {
        // Only consider translations with reasonable length similarity
        const lengthRatio = translation.length / trimmedOriginalText.length;
        if (lengthRatio > 0.3 && lengthRatio < 3.0) {
          finalTranslation = translation;
          matchStrategy = 'length_based_fallback';

          this.logger.debug(`LENGTH-BASED FALLBACK for node ${nodeIndex}`, {
            originalLength: trimmedOriginalText.length,
            translationLength: translation.length,
            lengthRatio: lengthRatio
          });
          break;
        }
      }
    }

    // DEBUG: Log translation lookup results
    this.logger.debug(`TRANSLATION LOOKUP for node ${nodeIndex}`, {
      isFinalResult: options.isFinalResult,
      isAlreadyTranslated,
      originalLength: originalText.length,
      trimmedLength: trimmedOriginalText.length,
      foundFinalTranslation: !!finalTranslation,
      matchStrategy: matchStrategy,
      finalTranslationLength: finalTranslation ? finalTranslation.length : 0,
      currentTranslationLength: translationInner ? translationInner.textContent.length : 0,
      originalPreview: originalText.substring(0, 50) + '...',
      trimmedPreview: trimmedOriginalText.substring(0, 30) + '...',
      finalPreview: finalTranslation ? finalTranslation.substring(0, 50) + '...' : 'NONE',
      isRescueMode: matchStrategy.includes('rescue') || matchStrategy.includes('empty_node'),
      isEmptyNode: trimmedOriginalText.length === 0
    });

    // Handle empty lines and whitespace-only text
    const isPhoneLike = /[\d+\-()\s]/.test(originalText.trim()) && originalText.trim().length > 3;
    const hasActualContent = originalText.trim().length > 0 && !/^\s+$/.test(originalText);

    if ((originalText === '\n\n' || originalText === '\n' || /^\s*$/.test(originalText)) && !isPhoneLike && !hasActualContent) {
      this.logger.debug('Preserving empty line or whitespace text node', {
        originalText: JSON.stringify(originalText),
        isPhoneLike,
        hasActualContent
      });
      return { applied: true };
    }

    // DETERMINISTIC MATCHING using the lookup table
    let translatedText = null;

    // Use finalTranslation if we found it
    if (finalTranslation) {
      translatedText = finalTranslation;
    } else {
      // Try direct lookup using original text
      if (translationLookup.has(originalText)) {
        translatedText = translationLookup.get(originalText);
      }
      // Direct lookup using trimmed text
      else if (translationLookup.has(trimmedOriginalText)) {
        translatedText = translationLookup.get(trimmedOriginalText);
      }
      // Normalized whitespace lookup
      else {
        const normalizedOriginal = originalText.replace(/\s+/g, ' ').trim();
        if (translationLookup.has(normalizedOriginal)) {
          translatedText = translationLookup.get(normalizedOriginal);
        }
      }

      // No whitespace lookup (critical for phone numbers)
      if (!translatedText) {
        const noWhitespaceOriginal = originalText.replace(/\s+/g, '');
        if (translationLookup.has(noWhitespaceOriginal)) {
          translatedText = translationLookup.get(noWhitespaceOriginal);
        }
      }
    }

    if (!translatedText) {
      this.logger.debug(`NO MATCH FOUND for node ${nodeIndex}`, {
        originalText: JSON.stringify(originalText),
        trimmedOriginalText: JSON.stringify(trimmedOriginalText),
        normalizedOriginal: JSON.stringify(originalText.replace(/\s+/g, ' ').trim()),
        noWhitespaceOriginal: JSON.stringify(originalText.replace(/\s+/g, '')),
        lookupSize: translationLookup.size,
        lookupKeys: Array.from(translationLookup.keys()).slice(0, 10).map(k => JSON.stringify(k))
      });

      return {
        applied: false,
        unmatched: {
          index: nodeIndex,
          originalText: originalText.substring(0, 50),
          fullText: originalText,
          normalizedText: normalizeForMatching(originalText),
          trimmedText: trimmedOriginalText,
          textLength: originalText.length
        }
      };
    }

    // CRITICAL FIX: Handle JSON array translations (common with some providers or segmented text)
    // Sometimes providers return markdown code blocks with JSON inside
    let jsonText = translatedText;
    if (typeof jsonText === 'string') {
        // Clean markdown code blocks if present (```json ... ``` or ``` ... ```)
        if (jsonText.includes('```')) {
            jsonText = jsonText.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
        }
        
        // If the translation text looks like a JSON array string (e.g. '["Hello", "World"]'), parse and join it
        if (jsonText.trim().startsWith('[') && jsonText.trim().endsWith(']')) {
          try {
            const parsed = JSON.parse(jsonText);
            if (Array.isArray(parsed)) {
              // Join array elements with newline to reconstruct the full text and preserve line breaks
              // This fixes the issue where users see literal ["..."] or markdown code blocks in the UI
              translatedText = parsed.join('\n');
              this.logger.debug(`Parsed and flattened JSON array translation for node ${nodeIndex}`, {
                 originalTextLength: originalText.length,
                 parsedLength: translatedText.length
              });
            }
          } catch (e) {
            // If parsing fails, leave as is (might just be text that happens to look like JSON)
            this.logger.debug(`Failed to parse potential JSON array translation`, { error: e.message });
          }
        }
    }

    // Apply the translation
    return await this._applyTranslationToNode(
      textNode,
      originalText,
      translatedText,
      targetLanguage,
      options,
      nodeIndex
    );
  }

  /**
   * Apply translation to a single node
   * @private
   */
  async _applyTranslationToNode(
    textNode,
    originalText,
    translatedText,
    targetLanguage,
    options,
    nodeIndex
  ) {
    try {
      // CRITICAL: For ELEMENT_NODE segments, use simple approach (consistent with streaming)
      if (textNode.nodeType === Node.ELEMENT_NODE && textNode.hasAttribute('data-segment-id')) {
        // Check if segment already has translated content from streaming phase
        const currentContent = textNode.textContent;
        const hasExistingTranslation = currentContent && currentContent !== originalText && currentContent !== originalText.trim();

        // Only process if we have a valid translation, otherwise preserve existing content
        if (translatedText && translatedText !== 'NONE' && translatedText !== originalText) {
          // Process text for ELEMENT_NODE
          const { ensureSpacingBeforeInlineElements, preserveAdjacentSpacing } = await import("../../utils/spacingUtils.js");
          let processedText = ensureSpacingBeforeInlineElements(textNode, originalText, translatedText);
          processedText = preserveAdjacentSpacing(textNode, originalText, processedText);

          // Preserve original leading AND trailing whitespace
          const leadingWhitespace = originalText.match(/^\s*/)[0];
          const trailingWhitespace = originalText.match(/\s*$/)[0];

          if (leadingWhitespace && !processedText.startsWith(' ')) {
            processedText = leadingWhitespace + processedText;
          }
          if (trailingWhitespace && !processedText.endsWith(' ')) {
            processedText = processedText + trailingWhitespace;
          }

          // CRITICAL: Skip applying if processed text is identical to original
          if (processedText === originalText) {
            this.logger.debug(`Skipping fallback translation - identical to original`, {
              nodeIndex: nodeIndex,
              originalPreview: originalText.substring(0, 30)
            });
            return { applied: true };
          }

          // Apply direction based on actual translation content
          const fallbackDetectedDir = detectTextDirectionFromContent(processedText, targetLanguage);

          // CRITICAL FIX: For RTL text, wrap LTR portions (English words, numbers) in spans with dir="ltr"
          // This prevents repositioning issues like "X" moving in "40% off"
          if (fallbackDetectedDir === 'rtl') {
            const processedHTML = wrapLTRPortions(processedText, fallbackDetectedDir);
            textNode.innerHTML = processedHTML;
            
            // CRITICAL FIX: Ensure parent container alignment for RTL
            // When translating a text node inside a block container (like a div or p), 
            // merely setting dir="rtl" on the span isn't enough to right-align the text visually.
            // We must force the parent block container to text-align: right.
            const parentBlock = textNode.closest('div, p, li, h1, h2, h3, h4, h5, h6, article, section, blockquote');
            if (parentBlock) {
               // We DO NOT force text-align: right anymore.
               // Rationale: dir="rtl" automatically sets the "start" alignment to the right.
               // If the element has explicit "text-align: center", that takes precedence over the default start alignment.
               // Forcing style.textAlign = 'right' overrides 'center', which is wrong.
               
               // Also enforce isolation on parent to prevent LTR leakage
               if (!parentBlock.hasAttribute('data-original-unicode-bidi')) {
                 parentBlock.setAttribute('data-original-unicode-bidi', parentBlock.style.unicodeBidi || '');
               }
               parentBlock.style.unicodeBidi = 'isolate';
               
               // And set direction if needed
               if (!parentBlock.hasAttribute('data-original-direction')) {
                 parentBlock.setAttribute('data-original-direction', parentBlock.getAttribute('dir') || '');
               }
               parentBlock.setAttribute('dir', 'rtl');
            }
          } else {
            textNode.textContent = processedText;
          }

          textNode.setAttribute("dir", fallbackDetectedDir);
          textNode.style.unicodeBidi = "isolate";
          if (targetLanguage) {
            textNode.setAttribute("lang", targetLanguage);
          }

          // Store original text for potential revert
          if (!textNode.hasAttribute('data-original-text')) {
            textNode.setAttribute('data-original-text', originalText);
          }

          return { applied: true };
        } else if (hasExistingTranslation) {
          // Keep existing streaming translation, ensure dir is set based on content
          const existingDir = detectTextDirectionFromContent(textNode.textContent, targetLanguage);
          textNode.setAttribute("dir", existingDir);
          textNode.style.unicodeBidi = "isolate";
          if (targetLanguage) {
            textNode.setAttribute("lang", targetLanguage);
          }

          // Store original text for potential revert
          if (!textNode.hasAttribute('data-original-text')) {
            textNode.setAttribute('data-original-text', originalText);
          }

          return { applied: true };
        }
      } else {
        // For TEXT_NODE, use wrapper structure
        const parentElement = textNode.parentNode;
        const uniqueId = generateUniqueId();

        // CRITICAL FIX: Apply general spacing correction for final translations
        const { ensureSpacingBeforeInlineElements, preserveAdjacentSpacing } = await import("../../utils/spacingUtils.js");
        let processedText = ensureSpacingBeforeInlineElements(textNode, originalText, translatedText);
        processedText = preserveAdjacentSpacing(textNode, originalText, processedText);

        // CRITICAL: Preserve original leading AND trailing whitespace
        const leadingWhitespace = originalText.match(/^\s*/)[0];
        const trailingWhitespace = originalText.match(/\s*$/)[0];

        if (leadingWhitespace && !processedText.startsWith(' ')) {
          processedText = leadingWhitespace + processedText;
        }
        if (trailingWhitespace && !processedText.endsWith(' ')) {
          processedText = processedText + trailingWhitespace;
        }

        // CRITICAL: Skip applying wrapper if translation is identical to original
        if (processedText === originalText) {
          this.logger.debug(`Skipping wrapper translation - identical to original`, {
            nodeIndex: nodeIndex,
            originalPreview: originalText.substring(0, 30)
          });
          return { applied: true };
        }

        // Create outer wrapper (FONT tag as per requested structure)
        const wrapperSpan = document.createElement("font");
        wrapperSpan.className = "aiwc-translation-wrapper";
        wrapperSpan.setAttribute("data-aiwc-original-id", uniqueId);
        wrapperSpan.setAttribute("data-message-id", options.messageId || '');

        // CRITICAL: Detect direction from actual translation content for correct punctuation placement
        const wrapperDetectedDir = detectTextDirectionFromContent(translatedText, targetLanguage);
        wrapperSpan.setAttribute("dir", wrapperDetectedDir);
        wrapperSpan.style.unicodeBidi = "isolate";
        if (targetLanguage) {
          wrapperSpan.setAttribute("lang", targetLanguage);
        }

        // Add hidden BR to isolate content
        const br = document.createElement("br");
        br.hidden = true;
        wrapperSpan.appendChild(br);

        // Create background wrapper (FONT tag)
        const backgroundFont = document.createElement("font");
        backgroundFont.className = "aiwc-translation-background";

        // Create inner font for translated content
        const translationSpan = document.createElement("font");
        translationSpan.className = "aiwc-translation-inner";

        // CRITICAL FIX: For RTL text, wrap LTR portions (English words, numbers) in spans with dir="ltr"
        // This prevents repositioning issues like "X" moving in "40% off"
        if (wrapperDetectedDir === 'rtl') {
          const processedHTML = wrapLTRPortions(processedText, wrapperDetectedDir);
          translationSpan.innerHTML = processedHTML;
        } else {
          translationSpan.textContent = processedText;
        }

        // Assemble wrapper structure and replace the node
        backgroundFont.appendChild(translationSpan);
        wrapperSpan.appendChild(backgroundFont);
        parentElement.replaceChild(wrapperSpan, textNode);

        // Store the original text content in the wrapper for potential revert
        wrapperSpan.setAttribute("data-aiwc-original-text", originalText);

        return { applied: true };
      }
    } catch (error) {
      this.logger.error('Error applying translation to text node:', error, {
        originalText: originalText.substring(0, 50),
        nodeIndex: nodeIndex
      });
      return { applied: false };
    }

    return { applied: false };
  }

  /**
   * Cleanup translation applier
   */
  cleanup() {
    this.logger.debug('TranslationApplier cleanup completed');
  }
}
