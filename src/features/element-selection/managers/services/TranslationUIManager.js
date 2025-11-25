import { getScopedLogger } from "../../../../shared/logging/logger.js";
import { LOG_COMPONENTS } from "../../../../shared/logging/logConstants.js";
import { reassembleTranslations, normalizeForMatching, findBestTranslationMatch, calculateTextMatchScore } from "../../utils/textProcessing.js";
import { generateUniqueId } from "../../utils/domManipulation.js";
import { ensureSpacingBeforeInlineElements } from "../../utils/spacingUtils.js";
import { correctTextDirection } from "../../utils/textDirection.js";
import { getTranslationString } from "../../../../utils/i18n/i18n.js";
import { pageEventBus } from '@/core/PageEventBus.js';
import { unifiedTranslationCoordinator } from '@/shared/messaging/core/UnifiedTranslationCoordinator.js';

/**
 * Manages UI notifications, DOM updates, and SelectElementManager coordination
 * Handles translation progress feedback, cleanup, and global state management
 */
export class TranslationUIManager {
  constructor(orchestrator) {
    this.orchestrator = orchestrator;
    this.logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'TranslationUIManager');

    // UI state tracking
    this.statusNotification = null;
    this.cacheCompleted = false;
  }

  /**
   * Initialize the UI manager
   */
  initialize() {
    this.logger.debug('TranslationUIManager initialized');
  }

  /**
   * Calculate Levenshtein distance between two strings for similarity matching
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Levenshtein distance
   * @private
   */
  _calculateLevenshteinDistance(str1, str2) {
    const matrix = [];

    // Initialize matrix
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    // Calculate distances
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Determine if a translation is partial or complete
   * @param {string} originalText - Original text
   * @param {string} translatedText - Translated text
   * @returns {boolean} Whether the translation appears to be partial
   * @private
   */
  _isPartialTranslation(originalText, translatedText) {
    // If translation is significantly shorter, it's likely partial
    const lengthRatio = translatedText.length / originalText.length;
    if (lengthRatio < 0.3) return true;

    // If original text contains common English phrases but translation doesn't have their Persian equivalents
    const englishPhrases = ['expert', 'builders', 'providing', 'comprehensive', 'construction', 'renovation', 'services', 'across', 'available', 'year', 'building', 'needs'];
    const persianEquivalents = ['متخصص', 'سازندگان', 'ارائه', 'جامع', 'ساخت و ساز', 'بازسازی', 'خدمات', 'در سراسر', 'موجود', 'سال', 'ساختمانی', 'نیازها'];

    const hasEnglishPhrases = englishPhrases.some(phrase =>
      originalText.toLowerCase().includes(phrase)
    );
    const hasPersianEquivalents = persianEquivalents.some(phrase =>
      translatedText.toLowerCase().includes(phrase)
    );

    return hasEnglishPhrases && !hasPersianEquivalents;
  }

  /**
   * Show status notification for translation progress
   * @param {string} messageId - Message ID
   * @param {string} context - Translation context
   */
  async showStatusNotification(messageId, context = 'select-element') {
    // Only show status notification if not for SelectElement mode
    // SelectElement mode has its own notification management
    if (context === 'select-element') {
      this.statusNotification = null;
      return null;
    }

    const statusMessage = await getTranslationString("SELECT_ELEMENT_TRANSLATING") || "Translating...";
    this.statusNotification = `status-${messageId}`;

    pageEventBus.emit('show-notification', {
      id: this.statusNotification,
      message: statusMessage,
      type: "status",
    });

  return this.statusNotification;
  }

  /**
   * Dismiss active status notification
   */
  dismissStatusNotification() {
    if (this.statusNotification) {
      pageEventBus.emit('dismiss_notification', { id: this.statusNotification });
      this.statusNotification = null;
    }
  }

  /**
   * Dismiss SelectElement notification
   * @param {Object} options - Dismissal options
   */
  dismissSelectElementNotification(options = {}) {
    pageEventBus.emit('dismiss-select-element-notification', {
      reason: 'translation-complete',
      ...options
    });
      }

  /**
   * Show timeout notification to user
   * @param {string} messageId - Message ID
   */
  async showTimeoutNotification(messageId) {
    const timeoutMessage = await getTranslationString('ERRORS_TRANSLATION_TIMEOUT');

    pageEventBus.emit('show-notification', {
      type: 'warning',
      title: 'Translation Timeout',
      message: timeoutMessage || 'Translation is taking longer than expected. Please wait or try again.',
      duration: 10000,
      id: `timeout-${messageId}`
    });

      }

  
  
  /**
   * Process streaming update and apply translations to DOM
   * @param {Object} message - Stream update message
   */
  async processStreamUpdate(message) {
    const { messageId, data } = message;

    this.logger.debug(`Processing stream update ${messageId} (success: ${data?.success})`);

    // Check if the request still exists (may have been cancelled)
    const request = this.orchestrator.requestManager.getRequest(messageId);
    if (!request) {
      this.logger.debug(`Stream update for non-existent request: ${messageId}`);

      // For fallback requests, we should actively ignore them to prevent background from sending more
      if (messageId.startsWith('fallback-')) {
        this.logger.debug(`Ignoring fallback stream update for non-existent request: ${messageId}`);
        return;
      }

      return;
    }

    // Check if request was cancelled or completed
    if (request.status === 'cancelled' || request.status === 'completed') {
      this.logger.debug(`Ignoring stream update for ${request.status} request: ${messageId}`);
      return;
    }

    // Enhanced fallback request handling
    if (messageId.startsWith('fallback-')) {
      this.logger.debug(`Processing fallback request: ${messageId}`);

      // For fallback requests, always check if any related translation is already complete
      const originalId = messageId.replace(/^fallback-/, '');
      const originalRequest = this.orchestrator.requestManager.getRequest(originalId);

      // Check if original request completed successfully
      if (originalRequest && originalRequest.status === 'completed' && originalRequest.translatedSegments.size > 0) {
        this.logger.debug(`Ignoring fallback stream update: original request ${originalId} already completed with ${originalRequest.translatedSegments.size} segments`);
        return;
      }

      // Also check if there are any existing translated elements in the DOM that match this translation
      const existingWrappers = document.querySelectorAll('.aiwc-translation-wrapper[data-message-id]');
      if (existingWrappers.length > 0) {
        // Check if any wrappers belong to the same original translation
        for (const wrapper of existingWrappers) {
          const wrapperMessageId = wrapper.getAttribute('data-message-id');
          if (wrapperMessageId === originalId) {
            this.logger.debug(`Ignoring fallback stream update: found existing DOM translations for original request ${originalId}`);
            return;
          }
        }
      }

      // Check global translation flag and last completed translation
      if (!window.isTranslationInProgress && window.lastCompletedTranslationId === originalId) {
        this.logger.debug(`Ignoring fallback stream update: translation ${originalId} already completed globally`);
        return;
      }
    }

    // Check if request is already completed (error state) to prevent processing failed stream updates after termination
    if (request && (request.status === 'error' || request.status === 'completed')) {
      this.logger.debug(`Ignoring stream update for already completed request: ${messageId} (status: ${request.status})`);
      return;
    }

    if (!data.success) {
      this.logger.debug(`Received failed stream update for messageId: ${messageId}`, data.error);

      // Mark request as having errors
      this.orchestrator.requestManager.markRequestError(messageId, data.error);

      // Clear the global translation in progress flag on error
      window.isTranslationInProgress = false;

      // Dismiss notification on error
      this.dismissStatusNotification();
      if (!this.statusNotification) {
        // For Select Element mode, dismiss the Select Element notification
        this.dismissSelectElementNotification();
      }

      // Notify SelectElementManager to perform cleanup
      if (window.selectElementManagerInstance) {
        window.selectElementManagerInstance.performPostTranslationCleanup();
      }

      // Trigger stream end processing to properly clean up the failed stream
      try {
        await this.processStreamEnd({
          messageId: messageId,
          data: {
            success: false,
            error: data.error,
            finished: true
          }
        });
      } catch (streamEndError) {
        this.logger.error('Error during stream end processing for failed stream update:', streamEndError);
        // Fallback cleanup if stream end processing fails
        this.orchestrator.requestManager.updateRequestStatus(messageId, 'error', {
          error: data.error?.message || 'Translation stream failed'
        });
      }

      return;
    }

    // Ensure the translation in progress flag remains set during streaming
    window.isTranslationInProgress = true;

    // Process the stream update data
    return await this._processStreamTranslationData(request, data);
  }

  /**
   * Process actual translation data from stream update
   * @private
   */
  async _processStreamTranslationData(request, data) {
    const { data: translatedBatch, originalData: originalBatch } = data;
    const { expandedTexts, textNodes, originMapping } = request;

    this.logger.debug(`Processing translation batch: ${translatedBatch.length} segments`);

    // Store translated segments and immediately apply to DOM for real-time streaming
    const newlyAppliedTranslations = new Map();

    for (let i = 0; i < translatedBatch.length; i++) {
      const translatedText = translatedBatch[i];
      const originalText = originalBatch[i];

      // Find the corresponding expanded index
      let expandedIndex = -1;

      // Try to find exact match
      expandedIndex = expandedTexts.findIndex(text => text === originalText);

      if (expandedIndex === -1) {
        this.logger.debug(`Original text not found for segment ${i}`);
        continue;
      }

      // Store the translation for reassembly later
      request.translatedSegments.set(expandedIndex, translatedText);

      // ENHANCED STREAMING: Validate translation quality before applying
      const mappingInfo = originMapping[expandedIndex];
      if (mappingInfo && !mappingInfo.isEmptyLine) {
        // Find the original text that this segment belongs to
        const originalIndex = mappingInfo.originalIndex;
        const originalTextKey = request.textsToTranslate[originalIndex];

        if (originalTextKey) {
          // CRITICAL: Check if this is a partial or complete translation
          const isPartialTranslation = this._isPartialTranslation(originalTextKey, translatedText);
          const hasMinimumContent = translatedText.trim().length > originalTextKey.trim().length * 0.1;

          // Only apply streaming translation if it has meaningful content
          if (hasMinimumContent) {
            // For streaming, apply individual segments immediately for real-time experience
            // But mark partial translations so they can be replaced later
            const translationData = {
              text: translatedText,
              isPartial: isPartialTranslation,
              segmentIndex: expandedIndex,
              originalIndex: originalIndex
            };

            newlyAppliedTranslations.set(originalTextKey.trim(), translationData);

            // Also try with the full original text if it's different
            const fullOriginalText = originalTextKey;
            if (fullOriginalText.trim() !== originalTextKey.trim()) {
              newlyAppliedTranslations.set(fullOriginalText, translationData);
            }

            this.logger.debug(`Streaming segment ${expandedIndex} applied`, {
              originalIndex,
              isPartial: isPartialTranslation,
              originalLength: originalTextKey.length,
              translatedLength: translatedText.length,
              originalPreview: originalTextKey.substring(0, 30) + '...',
              translatedPreview: translatedText.substring(0, 30) + '...'
            });
          } else {
            this.logger.debug(`Skipping streaming segment ${expandedIndex} - insufficient content`, {
              originalLength: originalTextKey.length,
              translatedLength: translatedText.length
            });
          }
        }
      }
    }

    // Apply newly translated segments immediately for real-time streaming
    if (newlyAppliedTranslations.size > 0) {
      await this._applyStreamingTranslationsImmediately(textNodes, newlyAppliedTranslations, request);
    }
  }

  /**
   * Apply streaming translations immediately to DOM nodes for real-time updates
   * @private
   */
  async _applyStreamingTranslationsImmediately(textNodes, newTranslations, request) {
    this.logger.debug(`Applying ${newTranslations.size} streaming translations immediately`);

    // Get target language for better RTL detection
    const { getTargetLanguageAsync } = await import("../../../../config.js");
    const targetLanguage = await getTargetLanguageAsync();

    const appliedNodes = new Set();
    let appliedCount = 0;

    // Apply translations to matching text nodes
    for (const textNode of textNodes) {
      if (!textNode.parentNode || textNode.nodeType !== Node.TEXT_NODE || appliedNodes.has(textNode)) {
        continue;
      }

      const originalText = textNode.textContent;
      const trimmedOriginalText = originalText.trim();

      // Skip empty lines and structure-only text
      if (originalText === '\n\n' || originalText === '\n' || /^\s*$/.test(originalText)) {
        continue;
      }

      // Find matching translation using enhanced fuzzy matching for streaming
      let translatedText = null;
      let matchType = '';

      // Try exact matches first (fastest path)
      let translationData = null;
      if (newTranslations.has(trimmedOriginalText)) {
        translationData = newTranslations.get(trimmedOriginalText);
        matchType = 'exact_trimmed_streaming';
      } else if (newTranslations.has(originalText)) {
        translationData = newTranslations.get(originalText);
        matchType = 'exact_full_streaming';
      } else {
        // Use enhanced fuzzy matching for streaming updates
        const bestMatch = findBestTranslationMatch(originalText, newTranslations, 45);

        if (bestMatch) {
          translationData = bestMatch.translatedText;
          matchType = `fuzzy_streaming_${bestMatch.type}_${Math.round(bestMatch.score)}`;
        }
      }

      // Extract actual text from translation data structure
      if (translationData && typeof translationData === 'object') {
        translatedText = translationData.text;
      } else if (typeof translationData === 'string') {
        translatedText = translationData;
      }

      // Apply translation if found and it's different from original
      if (translatedText && translatedText.trim() !== trimmedOriginalText) {
        try {
          const parentElement = textNode.parentNode;
          const uniqueId = generateUniqueId();

          // Check if this node is already inside a translation wrapper
          if (textNode.parentNode?.classList?.contains?.('aiwc-translation-wrapper')) {
            // Node already translated, skip
            continue;
          }

          // Create outer wrapper
          const wrapperSpan = document.createElement("span");
          wrapperSpan.className = "aiwc-translation-wrapper aiwc-streaming-update";
          wrapperSpan.setAttribute("data-aiwc-original-id", uniqueId);
          wrapperSpan.setAttribute("data-aiwc-streaming", "true");
          if (request.messageId) {
            wrapperSpan.setAttribute("data-message-id", request.messageId);
          }

          // Create inner span for translated content
          const translationSpan = document.createElement("span");
          translationSpan.className = "aiwc-translation-inner";

          // CRITICAL FIX: Apply general spacing correction for streaming translations
          // This prevents words from sticking together when followed by inline elements
          let processedText = ensureSpacingBeforeInlineElements(textNode, originalText, translatedText);

          // Preserve original whitespace as fallback
          const leadingWhitespace = originalText.match(/^\s*/)[0];
          if (leadingWhitespace && !processedText.startsWith(' ')) {
            processedText = leadingWhitespace + processedText;
          }

          translationSpan.textContent = processedText;

          // Apply text direction
          const detectOptions = targetLanguage ? {
            targetLanguage: targetLanguage,
            simpleDetection: true
          } : {};

          correctTextDirection(wrapperSpan, translatedText, {
            useWrapperElement: false,
            preserveExisting: true,
            detectOptions: detectOptions
          });

          // Add the translation span to the wrapper
          wrapperSpan.appendChild(translationSpan);

          // Replace the original text node with the wrapper
          const nextElementSibling = textNode.nextSibling;
          parentElement.removeChild(textNode);

          if (nextElementSibling) {
            parentElement.insertBefore(wrapperSpan, nextElementSibling);
          } else {
            parentElement.appendChild(wrapperSpan);
          }

          // Store original text for potential revert
          wrapperSpan.setAttribute("data-aiwc-original-text", originalText);

          appliedCount++;
          appliedNodes.add(textNode);

          this.logger.debug(`Applied streaming translation to node`, {
            matchType: matchType,
            original: originalText.substring(0, 30) + '...',
            translated: translatedText.substring(0, 30) + '...',
            uniqueId: uniqueId
          });

        } catch (error) {
          this.logger.error('Error applying streaming translation to text node:', error, {
            originalText: originalText.substring(0, 50)
          });
        }
      }
    }

    this.logger.debug(`Streaming translation application complete`, {
      totalNodes: textNodes.length,
      appliedCount: appliedCount,
      uniqueTranslations: newTranslations.size
    });
  }

  /**
   * Find nodes that should be updated with translation
   * @private
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

    await this.applyTranslationsToNodes(nodesToUpdate, translationMap);
  }

  /**
   * Validate that nodes match segments for multi-segment translation
   * @private
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
   * Handle single-segment translation
   * @private
   */
  async _handleSingleSegmentTranslation(nodesToUpdate, originalText, translatedText) {
    const translationMap = new Map();
    nodesToUpdate.forEach(node => {
      const nodeText = node.textContent.trim();
      translationMap.set(nodeText, translatedText);
    });

    await this.applyTranslationsToNodes(nodesToUpdate, translationMap);
  }

  
  /**
   * Process stream end and complete translation
   * @param {Object} message - Stream end message
   */
  async processStreamEnd(message) {
    const { messageId, data } = message;
    const request = this.orchestrator.requestManager.getRequest(messageId);

    if (!request) {
      this.logger.debug("Received stream end for already completed message:", messageId);
      return;
    }

    // Check if request was cancelled
    if (request.status === 'cancelled') {
      this.logger.debug("Ignoring stream end for cancelled message:", { messageId });
      this.orchestrator.requestManager.removeRequest(messageId);
      return;
    }

    // Check if request was already completed (e.g., by failed stream update processing)
    if (request.status === 'completed' || request.status === 'error') {
      this.logger.debug("Ignoring stream end for already completed message:", {
        messageId,
        status: request.status
      });
      return;
    }

    this.logger.debug("Translation stream finished for message:", messageId, {
      success: data?.success,
      error: data?.error,
      completed: data?.completed
    });

    try {
      // Clear the global translation in progress flag
      window.isTranslationInProgress = false;

      // Dismiss notifications
      this.dismissStatusNotification();
      this.dismissSelectElementNotification();

      // Handle stream end based on success/error state
      if (data?.error || !data?.success || request.hasErrors) {
        await this._handleStreamEndError(messageId, request, data);
      } else {
        await this._handleStreamEndSuccess(messageId, request);
      }
    } catch (error) {
      this.logger.error("Error during stream end processing:", error);
      await this._handleStreamEndProcessingError(messageId, error);
    }
  }

  /**
   * Handle successful stream end with enhanced final reassembly and replacement
   * @private
   */
  async _handleStreamEndSuccess(messageId, request) {
    this.logger.debug(`Stream ended successfully for messageId: ${messageId}. Processing final result...`);

    try {
      // Create final translated data array that matches the full expandedTexts structure
      const finalTranslatedData = [];
      for (let i = 0; i < request.expandedTexts.length; i++) {
        const translatedText = request.translatedSegments.get(i);
        const mappingInfo = request.originMapping[i];

        if (mappingInfo?.isEmptyLine) {
          // Preserve empty line structure with newline character
          finalTranslatedData.push({ text: '\n' });
        } else if (translatedText !== undefined) {
          // Handle single segment case where translatedText might be a JSON string
          if (request.expandedTexts.length === 1) {
            try {
              // Try to parse as JSON and extract the text properly
              const parsed = JSON.parse(translatedText);
              if (Array.isArray(parsed) && parsed.length > 0) {
                // Handle both string and object formats in array
                if (typeof parsed[0] === 'string') {
                  finalTranslatedData.push({ text: parsed[0] });
                } else if (parsed[0] && parsed[0].text) {
                  finalTranslatedData.push({ text: parsed[0].text });
                } else {
                  finalTranslatedData.push({ text: translatedText });
                }
              } else {
                finalTranslatedData.push({ text: translatedText });
              }
            } catch {
              // If parsing fails, use as-is
              finalTranslatedData.push({ text: translatedText });
            }
          } else {
            finalTranslatedData.push({ text: translatedText });
          }
        } else {
          // Fallback to original text if no translation found
          const originalText = request.filteredExpandedTexts ? request.filteredExpandedTexts[i] : request.expandedTexts[i];
          finalTranslatedData.push({ text: originalText });
        }
      }

      // CRITICAL FIX: Enhanced reassembly with segment validation
      this.logger.debug(`Reassembling ${finalTranslatedData.length} translated segments into final translations`);

      // Use the proper reassembly function to preserve empty lines and structure
      const newTranslations = reassembleTranslations(
        finalTranslatedData,
        request.expandedTexts, // Original expandedTexts with placeholders
        request.originMapping,
        request.textsToTranslate,
        new Map() // No cached translations
      );

      this.logger.debug(`Reassembly complete: ${newTranslations.size} final translations created`);

      // Store in state manager for potential revert
      this.orchestrator.stateManager.addTranslatedElement(request.element, newTranslations);

      // CRITICAL FIX: Force apply complete translations to replace ALL streaming segments
      this.logger.debug(`Force applying complete final translations to replace streaming content`);
      await this.applyTranslationsToNodes(request.textNodes, newTranslations, {
        skipStreamingUpdates: true, // This ensures replacement of streaming content
        messageId: messageId,
        forceUpdate: true, // Force replacement of existing streaming translations
        isFinalResult: true, // Mark this as the final complete result
        finalResultAuthority: true // Add explicit authority flag for complete override
      });

      // Mark request as completed to prevent further stream updates
      this.orchestrator.requestManager.updateRequestStatus(messageId, 'completed', {
        result: { success: true, translations: newTranslations }
      });

      // Set global flag to indicate translation is complete to prevent fallback updates
      window.lastCompletedTranslationId = messageId;
      window.isTranslationInProgress = false;

      // Notify UnifiedTranslationCoordinator that streaming completed successfully
      unifiedTranslationCoordinator.completeStreamingOperation(messageId, {
        success: true,
        translations: newTranslations
      });

      // Show success notification if this was a previously timed out request
      if (request.status === 'timeout') {
        pageEventBus.emit('show-notification', {
          type: 'success',
          title: 'Translation Completed',
          message: 'Translation completed successfully after timeout.',
          duration: 5000,
          id: `success-${messageId}`
        });
      }

    } catch (error) {
      this.logger.error(`Error processing final translation result:`, error);

      // Attempt fallback processing
      try {
        this.logger.debug(`Attempting fallback translation processing...`);

        // Create fallback translations using available segments
        const fallbackTranslations = new Map();
        for (const [originalTextKey, translationData] of request.translatedSegments.entries()) {
          if (translationData && translationData.translatedText) {
            // Clean segment markers if present
            let cleanText = translationData.translatedText;
            const segmentMatch = cleanText.match(/^\^?\[Part (\d+) of (\d+)\]/);
            if (segmentMatch) {
              cleanText = cleanText.replace(/^\^?\[Part \d+ of \d+\]\s*/, '');
            }
            fallbackTranslations.set(originalTextKey, cleanText);
          }
        }

        if (fallbackTranslations.size > 0) {
          await this.applyTranslationsToNodes(request.textNodes, fallbackTranslations, {
            skipStreamingUpdates: true,
            messageId: messageId,
            forceUpdate: true,
            isFinalResult: true
          });

          this.logger.debug(`Fallback translation processing completed: ${fallbackTranslations.size} translations applied`);
        }

      } catch (fallbackError) {
        this.logger.error(`Fallback processing also failed:`, fallbackError);
      }
    }
  }

  /**
   * Handle stream end with errors
   * @private
   */
  async _handleStreamEndError(messageId, request, data) {
    this.logger.debug(`Stream ended with error for messageId: ${messageId}`, data?.error || request.lastError);

    // Create error object
    const errorMessage = data?.error?.message || request.lastError?.message || 'Translation failed during streaming';
    const error = new Error(errorMessage);
    error.originalError = data?.error || request.lastError;

    // Check if we should retry with a fallback provider
    const shouldRetry = this.orchestrator.errorHandlerService.isRecoverableError(error, request);

    if (shouldRetry) {
      this.logger.debug('Attempting retry with fallback provider due to recoverable error', {
        messageId,
        errorType: error.originalError?.type || 'unknown'
      });

      const retrySuccess = await this.orchestrator.errorHandlerService.retryWithFallbackProvider(
        messageId,
        request.textsToTranslate.length === 1
          ? JSON.stringify(request.textsToTranslate)
          : JSON.stringify(request.textsToTranslate.map(t => ({ text: t }))),
        error
      );

      if (retrySuccess) {
        // Don't delete the original request yet - wait for retry to complete
        return;
      }
    }

    // Show error to user
    await this.orchestrator.errorHandlerService.showErrorToUser(error, {
      context: 'select-element-streaming-translation-end',
      type: 'TRANSLATION_FAILED',
      showToast: true
    });

    // Notify UnifiedTranslationCoordinator about the streaming error
    unifiedTranslationCoordinator.handleStreamingError(messageId, error);

    // Mark request as completed with error to prevent further stream updates
    this.orchestrator.requestManager.updateRequestStatus(messageId, 'error', {
      error: error.message || 'Translation failed'
    });
    this.logger.debug(`Request ${messageId} marked as error state to prevent further stream updates`);
  }

  /**
   * Handle stream end processing errors
   * @private
   */
  async _handleStreamEndProcessingError(messageId, error) {
    // Notify UnifiedTranslationCoordinator about the error
    unifiedTranslationCoordinator.handleStreamingError(messageId, error);

    // Ensure cleanup happens even if there's an error
    this.orchestrator.requestManager.removeRequest(messageId);
    window.isTranslationInProgress = false;

    // Dismiss any remaining notifications
    this.dismissStatusNotification();
    this.dismissSelectElementNotification();

    // Show error to user
    await this.orchestrator.errorHandlerService.showErrorToUser(error, {
      context: 'stream_end_processing',
      messageId,
      showToast: true
    });
  }

  /**
   * Handle non-streaming translation result
   * @param {Object} message - Translation result message
   */
  async handleTranslationResult(message) {
    const { messageId, data } = message;
    this.logger.debug("Received non-streaming translation result:", { messageId });

    const request = this.orchestrator.requestManager.getRequest(messageId);
    if (!request) {
      this.logger.debug("Received translation result for unknown message:", messageId);
      // Trigger cleanup if translation succeeded
      if (data?.success && this.orchestrator.isActive()) {
        this.logger.debug("Triggering cleanup for unknown request due to successful translation");
        this.triggerPostTranslationCleanup();
      }
      return;
    }

    if (request.status !== 'pending') {
      if (request.status === 'cancelled') {
        this.logger.debug("Ignoring translation result for cancelled message:", { messageId });
      } else {
        this.logger.debug("Received translation result for already processed message:", { messageId, status: request.status });
      }
      return;
    }

    try {
      if (data?.success) {
        await this._processNonStreamingSuccess(request, data);
      } else {
        await this._processNonStreamingError(request, data);
      }
    } catch (e) {
      this.logger.error("Unexpected error during fallback translation result handling:", e);
      this.orchestrator.requestManager.updateRequestStatus(messageId, 'error', { error: e.message });
    } finally {
      await this._finalizeNonStreamingRequest(messageId);
    }
  }

  /**
   * Process successful non-streaming translation result
   * @private
   */
  async _processNonStreamingSuccess(request, data) {
    const { translatedText } = data;

    // Handle JSON responses with markdown code blocks (similar to BaseAIProvider._parseBatchResult)
    let parsedData;
    try {
      // First try direct JSON parsing
      parsedData = JSON.parse(translatedText);
    } catch (error) {
      try {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = translatedText.match(/```json\s*([\s\S]*?)\s*```|(\[[\s\S]*\])/);
        if (jsonMatch) {
          const jsonString = jsonMatch[1] || jsonMatch[2];
          parsedData = JSON.parse(jsonString);
        } else {
          throw error;
        }
      } catch (secondError) {
        this.logger.error('Failed to parse JSON from API response:', {
          originalError: error.message,
          fallbackError: secondError.message,
          response: translatedText.substring(0, 200) + '...'
        });
        throw new Error(`Invalid JSON response from translation API: ${secondError.message}`);
      }
    }

    const translatedData = parsedData;
    const { textsToTranslate, originMapping, expandedTexts, filteredExpandedTexts, textNodes, element } = request;

    // Map filtered translation results back to original expanded structure
    const finalTranslatedData = [];
    let translatedIndex = 0;

    for (let i = 0; i < expandedTexts.length; i++) {
      const mappingInfo = originMapping[i];

      if (mappingInfo?.isEmptyLine) {
        // Preserve empty line structure with newline character
        finalTranslatedData.push({ text: '\n' });
      } else {
        // Use translated data if available, fallback to original
        if (translatedIndex < translatedData.length && translatedData[translatedIndex]) {
          // Handle both object and string formats uniformly
          if (typeof translatedData[translatedIndex] === 'string') {
            finalTranslatedData.push({ text: translatedData[translatedIndex] });
          } else if (translatedData[translatedIndex].text) {
            finalTranslatedData.push({ text: translatedData[translatedIndex].text });
          } else {
            finalTranslatedData.push({ text: filteredExpandedTexts?.[i] || expandedTexts[i] || '' });
          }
        } else {
          finalTranslatedData.push({ text: filteredExpandedTexts?.[i] || expandedTexts[i] || '' });
        }
        translatedIndex++;
      }
    }

    const newTranslations = reassembleTranslations(
      finalTranslatedData,
      expandedTexts,
      originMapping,
      textsToTranslate,
      new Map() // No cached translations
    );

    // Store translations in state manager for potential revert
    this.orchestrator.stateManager.addTranslatedElement(element, newTranslations);

    // Apply translations directly to DOM nodes
    await this.applyTranslationsToNodes(textNodes, newTranslations);

    this.orchestrator.requestManager.updateRequestStatus(request.id, 'completed', { result: data });
    this.logger.debug("Translation applied successfully to DOM elements (fallback)", { messageId: request.id });
  }

  /**
   * Process failed non-streaming translation result
   * @private
   */
  async _processNonStreamingError(request, data) {
    this.orchestrator.requestManager.updateRequestStatus(request.id, 'error', { error: data?.error });
    this.logger.error("Translation failed (fallback)", { messageId: request.id, error: data?.error });

    await this.orchestrator.errorHandlerService.showErrorToUser(
      new Error(data?.error?.message || 'Translation failed'),
      {
        context: 'select-element-translation-fallback',
        type: 'TRANSLATION_FAILED',
        showToast: true
      }
    );
  }

  /**
   * Finalize non-streaming request cleanup
   * @private
   */
  async _finalizeNonStreamingRequest(messageId) {
    // Clear the global translation in progress flag
    window.isTranslationInProgress = false;

    this.dismissStatusNotification();
    this.orchestrator.requestManager.removeRequest(messageId);

    // Notify SelectElementManager to perform cleanup
    if (window.selectElementManagerInstance) {
      window.selectElementManagerInstance.performPostTranslationCleanup();
    }
  }

  /**
   * Apply translations directly to DOM nodes using wrapper approach for Revert compatibility
   * @param {Array} textNodes - Array of text nodes to translate
   * @param {Map} translations - Map of original text to translated text
   * @param {Object} options - Application options
   */
  async applyTranslationsToNodes(textNodes, translations, options = {}) {
    this.logger.debug("DETERMINISTIC TRANSLATION APPLICATION", {
      textNodesCount: textNodes.length,
      translationsSize: translations.size,
      skipStreamingUpdates: options.skipStreamingUpdates || false,
      messageId: options.messageId
    });

    // Get target language for better RTL detection
    const { getTargetLanguageAsync } = await import("../../../../config.js");
    const targetLanguage = await getTargetLanguageAsync();

    let processedCount = 0;
    const unmatchedNodes = [];

    // Filter out undefined or null text nodes to prevent errors
    const validTextNodes = textNodes.filter(node => node && node.nodeType === Node.TEXT_NODE);

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
    validTextNodes.forEach((textNode, nodeIndex) => {
      if (!textNode.parentNode || textNode.nodeType !== Node.TEXT_NODE) {
        return;
      }

      const originalText = textNode.textContent;
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

        const wrapper = translationWrapper; // Use the wrapper we found in the hierarchy
        const translationInner = wrapper?.querySelector('.aiwc-translation-inner');

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
            translationPreview: bestMatch.translation.substring(0, 50) + '...'
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
          } else {
            this.logger.debug(`RESCUE MODE FAILED: No substantial translation found for empty node ${nodeIndex}`, {
              originalLength: originalText.length,
              longestFound: longestLength,
              totalEntries: translationLookup.size
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
          // Enhanced debugging for rescue cases
          isRescueMode: matchStrategy.includes('rescue') || matchStrategy.includes('empty_node'),
          isEmptyNode: trimmedOriginalText.length === 0
        });

        // CRITICAL FIX: For final results, apply translation even if node wasn't translated during streaming
        if (finalTranslation && (translationInner || options.isFinalResult)) {
          const currentTranslation = translationInner ? translationInner.textContent.trim() : '';
          const finalTrimmed = finalTranslation.trim();

          // ENHANCED: For empty nodes or untranslated nodes (final result only), always apply
          if (!translationInner && options.isFinalResult) {
            this.logger.debug(`APPLYING FINAL TRANSLATION TO NODE ${nodeIndex}`, {
              originalLength: originalText.length,
              finalLength: finalTrimmed.length,
              originalPreview: originalText.substring(0, 50) + '...',
              finalPreview: finalTrimmed.substring(0, 50) + '...',
              isEmptyNode: trimmedOriginalText.length === 0,
              matchStrategy: matchStrategy
            });

            // Apply the translation directly to the text node
            const translatedTextNode = document.createTextNode(finalTrimmed);
            textNode.parentNode.replaceChild(translatedTextNode, textNode);
            processedCount++;
            return;
          }

          // CRITICAL: Enhanced replacement logic with multiple quality checks
          // This ensures complete final translations are properly applied
          let shouldReplace = false;
          let replacementReason = '';

          // CRITICAL FIX: Final result has absolute authority - no competing conditions
          if (options.isFinalResult && currentTranslation !== finalTrimmed) {
            shouldReplace = true;
            replacementReason = 'final_result_authoritative';
          }

          // ENHANCED: Rescue mode translations should always replace partial streaming translations
          if (!shouldReplace && matchStrategy.includes('rescue') && currentTranslation.length > 0) {
            const rescueTranslationLength = finalTrimmed.length;
            const streamingTranslationLength = currentTranslation.length;

            // If rescue translation is significantly more complete, replace it
            if (rescueTranslationLength > streamingTranslationLength * 1.5) {
              shouldReplace = true;
              replacementReason = 'rescue_mode_completes_streaming';

              this.logger.debug(`RESCUE MODE OVERRIDE: Replacing streaming with complete translation for node ${nodeIndex}`, {
                streamingLength: streamingTranslationLength,
                rescueLength: rescueTranslationLength,
                improvementPercent: Math.round((rescueTranslationLength / streamingTranslationLength - 1) * 100),
                matchStrategy
              });
            }
          }
          // Only apply other checks if NOT a final result
          else if (!options.isFinalResult && currentTranslation !== finalTrimmed) {
            // Check 1: Final translation is substantially longer (10% threshold instead of 5%)
            if (finalTrimmed.length > currentTranslation.length * 1.10) {
              shouldReplace = true;
              replacementReason = 'length_improvement';
            }
            // Check 2: Final translation contains more complete content (has more words/segments)
            else {
              const currentWords = currentTranslation.split(/\s+/).length;
              const finalWords = finalTrimmed.split(/\s+/).length;

              if (finalWords > currentWords * 1.2) { // 20% more words (was 10%)
                shouldReplace = true;
                replacementReason = 'content_completeness';
              }
              // Check 3: Final translation is more comprehensive (contains more unique characters)
              else {
                const currentUniqueChars = new Set(currentTranslation.toLowerCase()).size;
                const finalUniqueChars = new Set(finalTrimmed.toLowerCase()).size;

                if (finalUniqueChars > currentUniqueChars * 1.10) { // 10% more unique content (was 5%)
                  shouldReplace = true;
                  replacementReason = 'content_richness';
                }
              }
            }
          }

          // CRITICAL FIX: Add comprehensive debug logging for replacement decisions
          this.logger.debug(`FINAL REPLACEMENT DECISION for node ${nodeIndex}`, {
            isFinalResult: options.isFinalResult,
            currentLength: currentTranslation.length,
            finalLength: finalTrimmed.length,
            shouldReplace: shouldReplace,
            replacementReason: replacementReason,
            contentComparison: {
              currentPreview: currentTranslation.substring(0, 100) + (currentTranslation.length > 100 ? '...' : ''),
              finalPreview: finalTrimmed.substring(0, 100) + (finalTrimmed.length > 100 ? '...' : ''),
              currentWordCount: currentTranslation.split(/\s+/).length,
              finalWordCount: finalTrimmed.split(/\s+/).length,
              currentUniqueChars: new Set(currentTranslation.toLowerCase()).size,
              finalUniqueChars: new Set(finalTrimmed.toLowerCase()).size
            },
            nodeIndex: nodeIndex,
            originalTextLength: originalText.length
          });

          if (shouldReplace) {
            this.logger.debug(`REPLACING streaming translation with complete final translation for node ${nodeIndex}`, {
              currentLength: currentTranslation.length,
              finalLength: finalTrimmed.length,
              improvement: finalTrimmed.length - currentTranslation.length,
              improvementPercent: Math.round((finalTrimmed.length / Math.max(currentTranslation.length, 1) - 1) * 100),
              reason: replacementReason,
              currentPreview: currentTranslation.substring(0, 50) + (currentTranslation.length > 50 ? '...' : ''),
              finalPreview: finalTrimmed.substring(0, 50) + (finalTrimmed.length > 50 ? '...' : '')
            });

            // Remove the existing wrapper completely
            const parentNode = wrapper.parentNode;
            if (parentNode) {
              parentNode.removeChild(wrapper);
              // Create a new text node to be processed below
              const newTextClone = textNode.cloneNode(true);
              parentNode.insertBefore(newTextClone, null);
              textNode = newTextClone; // Update reference for processing below
            }
          } else {
            // Current translation is good enough, keep it
            this.logger.debug(`Keeping current streaming translation for node ${nodeIndex} (no significant improvement)`);
            processedCount++;
            return;
          }
        }
      }

      // Handle empty lines and whitespace-only text (preserve structure but don't translate)
      // BUT NOT for phone numbers or content with actual characters
      const isPhoneLike = /[\d+\-()\s]/.test(originalText.trim()) && originalText.trim().length > 3;
      const hasActualContent = originalText.trim().length > 0 && !/^\s+$/.test(originalText);

      if ((originalText === '\n\n' || originalText === '\n' || /^\s*$/.test(originalText)) && !isPhoneLike && !hasActualContent) {
        this.logger.debug('Preserving empty line or whitespace text node', {
          originalText: JSON.stringify(originalText),
          isPhoneLike,
          hasActualContent
        });
        processedCount++;
        return; // Don't translate empty lines, just preserve them
      }

      // DETERMINISTIC MATCHING using the lookup table (100% accurate)
      let translatedText = null;
      let matchType = '';

          // CRITICAL: Add detailed debug logging for specific nodes
      if (nodeIndex === 14 || nodeIndex === 32) {
        this.logger.error(`DEBUGGING NODE ${nodeIndex}`, {
          originalText: JSON.stringify(originalText),
          trimmedOriginalText: JSON.stringify(trimmedOriginalText),
          textLength: originalText.length,
          lookupTableSize: translationLookup.size
        });
      }

      // DETERMINISTIC STRATEGY - Use lookup table with multiple fallback strategies

      // Strategy 1: Direct lookup using original text
      if (translationLookup.has(originalText)) {
        translatedText = translationLookup.get(originalText);
        matchType = 'lookup_exact';
        this.logger.debug(`LOOKUP EXACT MATCH for node ${nodeIndex}`);
      }
      // Strategy 2: Direct lookup using trimmed text
      else if (translationLookup.has(trimmedOriginalText)) {
        translatedText = translationLookup.get(trimmedOriginalText);
        matchType = 'lookup_trimmed';
        this.logger.debug(`LOOKUP TRIMMED MATCH for node ${nodeIndex}`);
      }
      // Strategy 3: Normalized whitespace lookup
      else {
        const normalizedOriginal = originalText.replace(/\s+/g, ' ').trim();
        if (translationLookup.has(normalizedOriginal)) {
          translatedText = translationLookup.get(normalizedOriginal);
          matchType = 'lookup_normalized';
          this.logger.debug(`LOOKUP NORMALIZED MATCH for node ${nodeIndex}`);
        }
      }

      // Strategy 4: No whitespace lookup (critical for phone numbers)
      if (!translatedText) {
        const noWhitespaceOriginal = originalText.replace(/\s+/g, '');
        if (translationLookup.has(noWhitespaceOriginal)) {
          translatedText = translationLookup.get(noWhitespaceOriginal);
          matchType = 'lookup_no_whitespace';
          this.logger.debug(`LOOKUP NO WHITESPACE MATCH for node ${nodeIndex}`);
        }
      }

      // CRITICAL: Enhanced debugging and fallback for unmatched nodes
      if (!translatedText) {
        this.logger.debug(`NO MATCH FOUND for node ${nodeIndex}`, {
          originalText: JSON.stringify(originalText),
          trimmedOriginalText: JSON.stringify(trimmedOriginalText),
          normalizedOriginal: JSON.stringify(originalText.replace(/\s+/g, ' ').trim()),
          noWhitespaceOriginal: JSON.stringify(originalText.replace(/\s+/g, '')),
          lookupSize: translationLookup.size,
          lookupKeys: Array.from(translationLookup.keys()).slice(0, 10).map(k => JSON.stringify(k))
        });

        // ENHANCED FALLBACK STRATEGY - Multiple matching approaches
        let bestMatch = null;
        let bestScore = 0;
        let bestMatchType = '';

        for (const [lookupKey, translation] of translationLookup.entries()) {
          let score = 0;
          let matchType = '';

          // Strategy 1: Contains matching (higher score for longer matches)
          if (lookupKey.includes(trimmedOriginalText) || trimmedOriginalText.includes(lookupKey)) {
            score = Math.max(lookupKey.length, trimmedOriginalText.length) / 10;
            matchType = 'fallback_contains';
          }

          // Strategy 2: Partial word matching
          const originalWords = trimmedOriginalText.toLowerCase().split(/\s+/);
          const lookupWords = lookupKey.toLowerCase().split(/\s+/);
          let commonWords = 0;
          for (const word of originalWords) {
            if (lookupWords.includes(word)) commonWords++;
          }
          if (commonWords > 0) {
            const wordScore = (commonWords / Math.max(originalWords.length, lookupWords.length)) * 50;
            if (wordScore > score) {
              score = wordScore;
              matchType = 'fallback_words';
            }
          }

          // Strategy 3: Levenshtein distance for similar strings (short texts only)
          if (trimmedOriginalText.length < 100 && lookupKey.length < 100) {
            const distance = this._calculateLevenshteinDistance(trimmedOriginalText, lookupKey);
            const maxLength = Math.max(trimmedOriginalText.length, lookupKey.length);
            const similarity = 1 - (distance / maxLength);
            const similarityScore = similarity * 100;
            if (similarityScore > score) {
              score = similarityScore;
              matchType = 'fallback_similarity';
            }
          }

          // Update best match if this one is better
          if (score > bestScore && score > 5) { // Minimum score threshold
            bestMatch = translation;
            bestScore = score;
            bestMatchType = matchType;
          }
        }

        if (bestMatch) {
          translatedText = bestMatch;
          matchType = bestMatchType;
          this.logger.debug(`ENHANCED FALLBACK MATCH for node ${nodeIndex} (${bestMatchType})`, {
            original: JSON.stringify(originalText.substring(0, 50)),
            matchScore: Math.round(bestScore),
            matchType: bestMatchType
          });
        } else {
          this.logger.error(`NO FALLBACK MATCH FOUND for node ${nodeIndex} - translation lost`);
        }
      }

      if (translatedText && translatedText.trim() !== trimmedOriginalText) {
        try {
          const parentElement = textNode.parentNode;
          const uniqueId = generateUniqueId();

          // Create outer wrapper (similar to working extension)
          const wrapperSpan = document.createElement("span");
          wrapperSpan.className = "aiwc-translation-wrapper";
          wrapperSpan.setAttribute("data-aiwc-original-id", uniqueId);
          wrapperSpan.setAttribute("data-message-id", options.messageId || '');

          // Create inner span for translated content
          const translationSpan = document.createElement("span");
          translationSpan.className = "aiwc-translation-inner";

          // CRITICAL FIX: Apply general spacing correction for final translations
          // This prevents words from sticking together when followed by inline elements
          let processedText = ensureSpacingBeforeInlineElements(textNode, originalText, translatedText);

          // Preserve original whitespace as fallback
          const leadingWhitespace = originalText.match(/^\s*/)[0];
          if (leadingWhitespace && !processedText.startsWith(' ')) {
            processedText = leadingWhitespace + processedText;
          }

          translationSpan.textContent = processedText;

          // Apply text direction to the wrapper with target language if available
          const detectOptions = targetLanguage ? {
            targetLanguage: targetLanguage,
            simpleDetection: true  // Use simple detection for RTL languages
          } : {};

          correctTextDirection(wrapperSpan, translatedText, {
            useWrapperElement: false,
            preserveExisting: true,
            detectOptions: detectOptions
          });

          // Add the translation span to the wrapper
          wrapperSpan.appendChild(translationSpan);

          // Replace the original text node with the wrapper
          try {
            // Store reference to next sibling before replacement
            const nextSibling = textNode.nextSibling;

            // Remove the original text node
            parentElement.removeChild(textNode);

            // Insert the wrapper at the same position
            if (nextSibling) {
              parentElement.insertBefore(wrapperSpan, nextSibling);
            } else {
              parentElement.appendChild(wrapperSpan);
            }

            // Store the original text content in the wrapper for potential revert
            wrapperSpan.setAttribute("data-aiwc-original-text", originalText);

            processedCount++;

            this.logger.debug(`Applied translation with wrapper to node ${nodeIndex}`, {
              matchType: matchType,
              original: originalText.substring(0, 30) + '...',
              translated: translatedText.substring(0, 30) + '...',
              uniqueId: uniqueId
            });

          } catch (error) {
            this.logger.error('Failed to replace text node with wrapper', error, {
              uniqueId: uniqueId,
              parentElement: parentElement.tagName
            });
            return;
          }

        } catch (error) {
          this.logger.error('Error applying translation to text node:', error, {
            originalText: originalText.substring(0, 50),
            nodeIndex: nodeIndex
          });
        }
      } else {
        unmatchedNodes.push({
          index: nodeIndex,
          originalText: originalText.substring(0, 50),
          fullText: originalText,
          normalizedText: normalizeForMatching(originalText),
          trimmedText: trimmedOriginalText,
          textLength: originalText.length
        });
      }
    });

    this.logger.debug("TRANSLATION APPLICATION COMPLETE", {
      totalNodes: textNodes.length,
      validNodes: validTextNodes.length,
      appliedCount: processedCount,
      unmatchedCount: unmatchedNodes.length,
      targetLanguage: targetLanguage,
      translationsAvailable: translations.size,
      unmatchedNodes: unmatchedNodes.slice(0, 5), // Show more unmatched for debugging
      unmatchedSample: unmatchedNodes.slice(0, 3).map(node => ({
        index: node.index,
        originalPreview: node.originalText,
        normalizedPreview: node.normalizedText,
        length: node.textLength
      })),
      availableTranslations: Array.from(translations.keys()).slice(0, 15) // Show more translation keys
    });

    // CRITICAL: Debug long translations to ensure complete content preservation
    const longTranslations = Array.from(translations.entries()).filter(([key, value]) =>
      key.length > 100 || value.length > 100
    );

    if (longTranslations.length > 0) {
      this.logger.debug("LONG TRANSLATIONS DEBUG", {
        count: longTranslations.length,
        details: longTranslations.map(([key, value], index) => ({
          index,
          originalLength: key.length,
          translatedLength: value.length,
          originalPreview: key.substring(0, 80) + (key.length > 80 ? '...' : ''),
          translatedPreview: value.substring(0, 80) + (value.length > 80 ? '...' : '')
        }))
      });
    }

    // Enhanced debug logging for unmatched nodes
    if (unmatchedNodes.length > 0 && this.logger.isDebugEnabled()) {
      const debugAnalysis = this.debugTextMatching(validTextNodes, translations);
      this.logger.debug('Text matching analysis for debugging', {
        exactMatches: debugAnalysis.exactMatches,
        fuzzyMatches: debugAnalysis.fuzzyMatches,
        unmatchedCount: debugAnalysis.unmatchedNodes.length,
        recommendations: debugAnalysis.recommendations,
        sampleUnmatched: debugAnalysis.unmatchedNodes.slice(0, 2).map(node => ({
          index: node.index,
          original: node.original,
          normalized: node.normalized,
          bestPotentialMatch: node.possibleMatches[0]
        }))
      });
    }

    // Return result for compatibility
    return {
      appliedCount: processedCount,
      totalNodes: validTextNodes.length,
      targetLanguage: targetLanguage
    };
  }

  /**
   * Trigger post-translation cleanup through SelectElementManager
   */
  triggerPostTranslationCleanup() {
    if (window.selectElementManagerInstance && typeof window.selectElementManagerInstance.performPostTranslationCleanup === 'function') {
      this.logger.debug('Triggering SelectElementManager cleanup');
      window.selectElementManagerInstance.performPostTranslationCleanup();
    } else {
      this.logger.debug('Cannot trigger cleanup: SelectElementManager not available');
    }
  }

  /**
   * Get UI statistics
   * @returns {Object} UI statistics
   */
  getUIStats() {
    return {
      activeStatusNotification: this.statusNotification !== null,
      cacheCompleted: this.cacheCompleted,
      translationInProgress: window.isTranslationInProgress || false
    };
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
   * Cleanup UI manager
   */
  cleanup() {
    this.dismissStatusNotification();
    this.statusNotification = null;
    this.cacheCompleted = false;

    this.logger.debug('TranslationUIManager cleanup completed');
  }
}