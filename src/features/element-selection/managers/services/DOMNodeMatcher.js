import { getScopedLogger } from "../../../../shared/logging/logger.js";
import { LOG_COMPONENTS } from "../../../../shared/logging/logConstants.js";
import { normalizeForMatching, findBestTranslationMatch, calculateTextMatchScore } from "../../utils/textProcessing.js";

/**
 * DOMNodeMatcher - Finds and matches DOM nodes to translations
 * Handles node finding, multi-segment matching, partial matching, and validation
 *
 * Responsibilities:
 * - Find DOM nodes that should receive translations
 * - Multi-segment and partial text matching
 * - Node validation and filtering
 * - Multi-segment and single-segment translation handling
 *
 * @memberof module:features/element-selection/managers/services
 */
export class DOMNodeMatcher {
  constructor(uiManager) {
    this.uiManager = uiManager;
    this.logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'DOMNodeMatcher');
  }

  /**
   * Initialize the DOM node matcher
   */
  initialize() {
    this.logger.debug('DOMNodeMatcher initialized');
  }

  /**
   * Find nodes that should be updated with translation
   * @param {Array} textNodes - Available text nodes
   * @param {string} originalText - Original text to match
   * @param {Set} processedNodeIds - IDs of already processed nodes
   * @returns {Promise<Array>} Nodes to update
   */
  async _findNodesToUpdate(textNodes, originalText, processedNodeIds) {
    const originalTextTrimmed = originalText.trim();

    // Create a map of node text content to nodes for faster lookup
    const nodeTextMap = new Map();
    textNodes.forEach(node => {
      if (processedNodeIds.has(node)) return;

      const nodeText = node.textContent.trim();
      const nodeFullText = node.textContent; // Keep full text for better matching

      if (!nodeTextMap.has(nodeText)) {
        nodeTextMap.set(nodeText, []);
      }
      nodeTextMap.get(nodeText).push({ node, fullText: nodeFullText });
    });

    // Priority 1: Exact trimmed match (for segments without newlines)
    if (!originalTextTrimmed.includes('\n') && nodeTextMap.has(originalTextTrimmed)) {
      return nodeTextMap.get(originalTextTrimmed).map(item => item.node);
    }

    // Priority 2: Exact full text match
    for (const [, nodeList] of nodeTextMap) {
      for (const { node, fullText } of nodeList) {
        if (fullText === originalText) {
          return [node];
        }
      }
    }

    // Priority 3: Handle multi-segment text and partial matching
    // This includes both multi-segment text and single segments that need partial matching
    if (originalTextTrimmed.includes('\n') || originalTextTrimmed.length > 50) {
      return this._findNodesForMultiSegmentText(textNodes, originalText, processedNodeIds);
    }

    // Priority 4: Partial match with high confidence (fallback for short text)
    return this._findNodesWithConfidentPartialMatch(textNodes, originalText, processedNodeIds);
  }

  /**
   * Find nodes for multi-segment text and partial matching
   * @private
   * @param {Array} textNodes - Available text nodes
   * @param {string} originalText - Original text
   * @param {Set} processedNodeIds - IDs of already processed nodes
   * @returns {Array} Nodes for multi-segment text
   */
  _findNodesForMultiSegmentText(textNodes, originalText, processedNodeIds) {
    const originalTextTrimmed = originalText.trim();

    // Handle empty line segments differently
    if (originalTextTrimmed === '' || originalTextTrimmed === '\n') {
      return []; // Empty segments don't need DOM nodes
    }

    // Split into segments for multi-segment text, or treat as single segment
    const segments = originalTextTrimmed.includes('\n')
      ? originalTextTrimmed.split('\n').filter(seg => seg.trim().length > 0)
      : [originalTextTrimmed];

    if (segments.length === 0) return [];

    this.logger.debug(`Finding nodes for ${segments.length} segments (${textNodes.length} nodes available)`);

    // For each segment, try to find a corresponding node
    const foundNodes = [];
    const remainingNodes = textNodes.filter(node => !processedNodeIds.has(node));

    // Try to match each segment with an unused node
    for (const segment of segments) {
      const segmentTrimmed = segment.trim();

      // Skip empty or very short segments
      if (segmentTrimmed.length < 3) continue;

      let bestMatch = null;
      let bestScore = 0;

      // Find the best matching node for this segment
      for (const node of remainingNodes) {
        if (foundNodes.includes(node)) continue; // Skip already assigned nodes

        const nodeText = node.textContent.trim();
        let score = 0;

        // Exact match gets highest score
        if (nodeText === segmentTrimmed) {
          score = 100;
        }
        // Node text contains segment
        else if (nodeText.includes(segmentTrimmed)) {
          score = 80;
        }
        // Segment contains node text
        else if (segmentTrimmed.includes(nodeText)) {
          score = 60;
        }
        // Partial match based on word overlap
        else {
          const segmentWords = segmentTrimmed.toLowerCase().split(/\s+/);
          const nodeWords = nodeText.toLowerCase().split(/\s+/);
          const commonWords = segmentWords.filter(word =>
            word.length > 2 && nodeWords.includes(word)
          );

          if (commonWords.length > 0) {
            score = (commonWords.length / Math.max(segmentWords.length, nodeWords.length)) * 40;
          }
        }

        if (score > bestScore && score >= 30) { // Minimum threshold
          bestScore = score;
          bestMatch = node;
        }
      }

      if (bestMatch) {
        foundNodes.push(bestMatch);
      }
    }

    // Only log matching summary if there were multiple segments
    if (segments.length > 1) {
      this.logger.debug(`Multi-segment matching: ${foundNodes.length}/${segments.length} nodes matched`);
    }

    return foundNodes;
  }

  /**
   * Find nodes with confident partial matching
   * @private
   * @param {Array} textNodes - Available text nodes
   * @param {string} originalText - Original text
   * @param {Set} processedNodeIds - IDs of already processed nodes
   * @returns {Array} Nodes with confident partial match
   */
  _findNodesWithConfidentPartialMatch(textNodes, originalText, processedNodeIds) {
    const originalTextClean = originalText.trim();
    const originalTextLower = originalTextClean.toLowerCase();

    // Create scoring system for node matching
    const nodeScores = new Map();

    textNodes.forEach(node => {
      if (processedNodeIds.has(node)) return;

      const nodeText = node.textContent.trim();
      const nodeTextLower = nodeText.toLowerCase();

      // Skip very short matches
      if (nodeText.length < 3) return;

      let score = 0;

      // Exact match gets highest score
      if (nodeText === originalTextClean) {
        score = 100;
      }
      // Contains relationship
      else if (nodeText.includes(originalTextClean)) {
        score = 80;
      }
      else if (originalTextClean.includes(nodeText)) {
        score = 70;
      }
      // Substring matching with length consideration
      else {
        const maxLen = Math.max(nodeText.length, originalTextClean.length);
        const minLen = Math.min(nodeText.length, originalTextClean.length);

        // If one is much shorter than the other, check if it's a meaningful substring
        if (minLen / maxLen > 0.3) { // At least 30% length match
          const longer = nodeText.length > originalTextClean.length ? nodeText : originalTextClean;
          const shorter = nodeText.length > originalTextClean.length ? originalTextClean : nodeText;

          if (longer.includes(shorter)) {
            score = (minLen / maxLen) * 60;
          }
        }
      }

      // Additional scoring for exact word matches
      if (score > 0 && score < 100) {
        const originalWords = originalTextLower.split(/\s+/);
        const nodeWords = nodeTextLower.split(/\s+/);

        const commonWords = originalWords.filter(word =>
          word.length > 2 && nodeWords.includes(word)
        );

        if (commonWords.length > 0) {
          score += (commonWords.length / Math.max(originalWords.length, nodeWords.length)) * 20;
        }
      }

      if (score > 30) { // Threshold for confident match
        nodeScores.set(node, score);
      }
    });

    // Sort by score and return the best match
    const sortedNodes = Array.from(nodeScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0]);

    return sortedNodes.length > 0 ? [sortedNodes[0]] : [];
  }

  /**
   * Filter valid nodes for translation to prevent incorrect assignments
   * @private
   * @param {Array} nodesToUpdate - Nodes to update
   * @param {string} originalText - Original text
   * @param {string} originalTextKey - Original text key
   * @param {Map} appliedTranslations - Already applied translations
   * @returns {Array} Filtered valid nodes
   */
  _filterValidNodesForTranslation(nodesToUpdate, originalText, originalTextKey, appliedTranslations) {
    if (nodesToUpdate.length === 0) return nodesToUpdate;

    const originalTextTrimmed = originalText.trim();
    const originalTextKeyTrimmed = originalTextKey ? originalTextKey.trim() : '';

    return nodesToUpdate.filter(node => {
      const nodeText = node.textContent.trim();

      // If this node already has a translation that's completely different, skip it
      if (appliedTranslations.has(node)) {
        const existingTranslation = appliedTranslations.get(node);

        // If the existing translation is for a very different original text, skip
        if (existingTranslation.originalTextKey && existingTranslation.originalTextKey !== originalTextKey) {
          const existingTrimmed = existingTranslation.originalTextKey.trim();
          const currentTrimmed = originalTextKeyTrimmed;

          // Check if they're substantially different
          if (this._areTextsSubstantiallyDifferent(existingTrimmed, currentTrimmed)) {
            this.logger.debug(`Skipping node with existing different translation`);
            return false;
          }
        }
      }

      // Additional validation: ensure node text is reasonable match for original
      if (nodeText.length < 3) return false; // Skip very short nodes

      // For very long original texts, ensure node has substantial content
      if (originalTextTrimmed.length > 200 && nodeText.length < 20) {
        return false;
      }

      // Check word overlap for confidence
      const nodeWords = nodeText.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const originalWords = originalTextTrimmed.toLowerCase().split(/\s+/).filter(w => w.length > 2);

      if (nodeWords.length > 0 && originalWords.length > 0) {
        const commonWords = nodeWords.filter(word => originalWords.includes(word));
        const overlapRatio = commonWords.length / Math.max(nodeWords.length, originalWords.length);

        // Require at least 20% word overlap for confidence
        if (overlapRatio < 0.2) {
          this.logger.debug(`Node rejected: insufficient word overlap (${(overlapRatio * 100).toFixed(0)}%)`);
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Check if two texts are substantially different
   * @private
   * @param {string} text1 - First text
   * @param {string} text2 - Second text
   * @returns {boolean} Whether texts are substantially different
   */
  _areTextsSubstantiallyDifferent(text1, text2) {
    if (text1 === text2) return false;

    // If one is empty and the other isn't
    if ((text1.length === 0) !== (text2.length === 0)) return true;

    // If length difference is more than 50%
    const maxLength = Math.max(text1.length, text2.length);
    const minLength = Math.min(text1.length, text2.length);
    if (minLength / maxLength < 0.5) return true;

    // Check word overlap
    const words1 = text1.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const words2 = text2.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    if (words1.length > 0 && words2.length > 0) {
      const commonWords = words1.filter(word => words2.includes(word));
      const overlapRatio = commonWords.length / Math.max(words1.length, words2.length);
      return overlapRatio < 0.3; // Less than 30% word overlap means substantially different
    }

    return false;
  }

  /**
   * Handle multi-segment translation
   * @private
   * @param {Array} nodesToUpdate - Nodes to update
   * @param {Object} request - Translation request
   * @param {number} expandedIndex - Expanded index
   * @param {number} originalIndex - Original index
   * @param {string} originalTextKey - Original text key
   * @param {Array} translatedBatch - Translated batch
   * @param {Array} originalBatch - Original batch
   */
  async _handleMultiSegmentTranslation(nodesToUpdate, request, expandedIndex, originalIndex, originalTextKey, translatedBatch, originalBatch) {
    const { expandedTexts, originMapping, translatedSegments } = request;

    // Enhanced node tracking to prevent incorrect assignments
    const targetNodeTexts = new Set();
    nodesToUpdate.forEach(node => {
      targetNodeTexts.add(node.textContent.trim());
      targetNodeTexts.add(node.textContent); // Include full text for better matching
    });

    // Collect all related translations for this multi-segment text
    const allSegments = [];
    const segmentMappings = [];

    // Find all segments that belong to the same original text
    for (let j = 0; j < expandedTexts.length; j++) {
      const { originalIndex: segOriginalIndex, isEmptyLine } = originMapping[j];
      if (segOriginalIndex === originalIndex) {
        // Handle empty lines - preserve structure without adding extra newlines
        if (isEmptyLine) {
          allSegments.push('\n'); // Use newline for structure preservation
          segmentMappings.push({ type: 'empty', originalIndex: j });
          continue;
        }

        // First check if we already have the translation from translatedSegments
        if (translatedSegments.has(j)) {
          allSegments.push(translatedSegments.get(j));
          segmentMappings.push({ type: 'cached', originalIndex: j });
          continue;
        }

        // Find the translated text for this segment using originalBatch->translatedBatch mapping
        const originalSegment = expandedTexts[j];
        let segmentTranslation = null;
        let batchIndex = -1;

        // Find the index in originalBatch that matches our segment
        for (let k = 0; k < originalBatch.length; k++) {
          if (originalBatch[k] === originalSegment && k < translatedBatch.length) {
            segmentTranslation = translatedBatch[k];
            batchIndex = k;
            break;
          }
        }

        if (segmentTranslation) {
          allSegments.push(segmentTranslation);
          segmentMappings.push({ type: 'translated', originalIndex: j, batchIndex });
        } else {
          // Fallback: use original segment if translation not found
          this.logger.debug(`Translation not found for segment: "${originalSegment}"`);
          allSegments.push(originalSegment);
          segmentMappings.push({ type: 'fallback', originalIndex: j });
        }
      }
    }

    this.logger.debug(`Multi-segment translation collected: ${allSegments.length} segments`);

    // Validate that this translation should be applied to these nodes
    const shouldApplyTranslation = this._validateNodeSegmentMatch(nodesToUpdate, originalTextKey, allSegments);

    if (!shouldApplyTranslation) {
      this.logger.debug(`Skipping multi-segment translation due to node-segment mismatch`, {
        nodeTexts: Array.from(targetNodeTexts),
        originalTextKey: originalTextKey.substring(0, 100)
      });
      return;
    }

    // Combine all segments into a single translation with proper spacing
    let combinedTranslation = allSegments.join('');

    // If the original text had newlines, preserve the paragraph structure
    if (originalTextKey && originalTextKey.includes('\n')) {
      const originalLines = originalTextKey.split('\n');
      if (originalLines.length > 1 && allSegments.length >= originalLines.filter(line => line.trim()).length) {
        // Reconstruct with line breaks - preserve empty lines properly
        const translatedLines = [];
        let segmentIndex = 0;

        for (const line of originalLines) {
          if (line.trim() === '') {
            // Preserve empty lines with empty string (newline will be added by join)
            translatedLines.push('');
          } else if (segmentIndex < allSegments.length) {
            translatedLines.push(allSegments[segmentIndex++]);
          }
        }

        // Use single newlines to avoid extra spacing, but ensure proper paragraph breaks
        combinedTranslation = translatedLines.join('\n');
      }
    }

    // Post-process: Remove excessive newlines (3+ consecutive newlines -> 2 newlines for paragraphs)
    // This preserves paragraph structure while removing extra spacing
    combinedTranslation = combinedTranslation.replace(/\n{3,}/g, '\n\n');

    // Create a translation map with the combined translation
    const translationMap = new Map();
    nodesToUpdate.forEach(node => {
      // Use both full text and trimmed text as keys for robustness
      const nodeFullText = node.textContent;
      const nodeTrimmedText = nodeFullText.trim();

      translationMap.set(nodeTrimmedText, combinedTranslation);
      if (nodeFullText !== nodeTrimmedText) {
        translationMap.set(nodeFullText, combinedTranslation);
      }
    });

    await this.uiManager.translationApplier.applyTranslationsToNodes(nodesToUpdate, translationMap);
  }

  /**
   * Handle single-segment translation
   * @private
   * @param {Array} nodesToUpdate - Nodes to update
   * @param {string} originalText - Original text
   * @param {string} translatedText - Translated text
   */
  async _handleSingleSegmentTranslation(nodesToUpdate, originalText, translatedText) {
    const translationMap = new Map();
    nodesToUpdate.forEach(node => {
      const nodeText = node.textContent.trim();
      translationMap.set(nodeText, translatedText);
    });

    await this.uiManager.translationApplier.applyTranslationsToNodes(nodesToUpdate, translationMap);
  }

  /**
   * Validate that nodes match segments for multi-segment translation
   * @private
   * @param {Array} nodesToUpdate - Nodes to update
   * @param {string} originalTextKey - Original text key
   * @param {Array} segments - Translation segments
   * @returns {boolean} Whether nodes match segments
   */
  _validateNodeSegmentMatch(nodesToUpdate, originalTextKey, segments) {
    if (nodesToUpdate.length === 0) return false;

    const originalTextTrimmed = originalTextKey.trim();
    const nonEmptySegments = segments.filter(s => s.trim().length > 0);

    // For single node, check if it's reasonable to apply multi-segment translation
    if (nodesToUpdate.length === 1) {
      const node = nodesToUpdate[0];
      const nodeText = node.textContent.trim();

      // If node text is very short but we have long segments, this might be mismatch
      if (nodeText.length < 10 && nonEmptySegments.some(s => s.trim().length > 50)) {
        this.logger.debug(`Node too short for multi-segment translation`);
        return false;
      }

      // Check if node text is a substring of the original or vice versa
      if (nodeText === originalTextTrimmed ||
          originalTextTrimmed.includes(nodeText) ||
          nodeText.includes(originalTextTrimmed)) {
        return true;
      }

      // Check word overlap for confidence
      const nodeWords = nodeText.toLowerCase().split(/\s+/);
      const originalWords = originalTextTrimmed.toLowerCase().split(/\s+/);
      const commonWords = nodeWords.filter(word =>
        word.length > 2 && originalWords.includes(word)
      );

      // If at least 30% of words match, consider it valid
      const wordOverlapRatio = commonWords.length / Math.max(nodeWords.length, originalWords.length);
      return wordOverlapRatio >= 0.3;
    }

    // For multiple nodes, this is more likely to be correct
    return true;
  }

  /**
   * Debug tool to analyze text matching issues
   * @param {Array} textNodes - Text nodes to analyze
   * @param {Map} translations - Available translations
   * @returns {Object} Analysis results
   */
  debugTextMatching(textNodes, translations) {
    const analysis = {
      totalNodes: textNodes.length,
      exactMatches: 0,
      fuzzyMatches: 0,
      unmatchedNodes: [],
      translationKeys: Array.from(translations.keys()),
      recommendations: []
    };

    const translationArray = Array.from(translations.entries());

    textNodes.forEach((node, index) => {
      if (!node || !node.textContent) return;

      const originalText = node.textContent;
      const trimmedText = originalText.trim();
      const normalizedText = normalizeForMatching(originalText);

      // Check for exact matches
      const exactMatch = translations.has(trimmedText) || translations.has(originalText);
      if (exactMatch) {
        analysis.exactMatches++;
        return;
      }

      // Check for fuzzy matches
      const fuzzyMatch = findBestTranslationMatch(originalText, translations, 20);
      if (fuzzyMatch) {
        analysis.fuzzyMatches++;
        return;
      }

      // Unmatched node - collect detailed info
      analysis.unmatchedNodes.push({
        index,
        original: originalText,
        trimmed: trimmedText,
        normalized: normalizedText,
        length: originalText.length,
        possibleMatches: translationArray
          .map(([key]) => {
            const score = calculateTextMatchScore(normalizedText, key);
            return { key: key.substring(0, 50), score, type: score.type };
          })
          .filter(match => match.score > 10)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
      });
    });

    // Generate recommendations
    if (analysis.unmatchedNodes.length > 0) {
      const unmatchedWithSimilarContent = analysis.unmatchedNodes.filter(node =>
        node.possibleMatches.length > 0 && node.possibleMatches[0].score > 15
      );

      if (unmatchedWithSimilarContent.length > 0) {
        analysis.recommendations.push({
          type: 'lower_fuzzy_threshold',
          message: `Consider lowering fuzzy matching threshold. ${unmatchedWithSimilarContent.length} nodes have potential matches with scores 15-30.`,
          nodes: unmatchedWithSimilarContent.length
        });
      }

      const veryShortUnmatched = analysis.unmatchedNodes.filter(node => node.length < 10);
      if (veryShortUnmatched.length > 0) {
        analysis.recommendations.push({
          type: 'short_nodes',
          message: `${veryShortUnmatched.length} very short nodes (< 10 chars) remain unmatched. Consider adjusting minimum text length.`,
          nodes: veryShortUnmatched.length
        });
      }
    }

    return analysis;
  }

  /**
   * Cleanup DOM node matcher
   */
  cleanup() {
    this.logger.debug('DOMNodeMatcher cleanup completed');
  }
}
