import { getScopedLogger } from "../../../../shared/logging/logger.js";
import { LOG_COMPONENTS } from "../../../../shared/logging/logConstants.js";
import { applyTranslationsToNodes, reassembleTranslations } from "../../utils/textExtraction.js";
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
   * Show status notification for translation progress
   * @param {string} messageId - Message ID
   * @param {string} context - Translation context
   */
  async showStatusNotification(messageId, context = 'select-element') {
    // Only show status notification if not for SelectElement mode
    // SelectElement mode has its own notification management
    if (context === 'select-element') {
      this.logger.debug("Skipping status notification for SelectElement mode");
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

    this.logger.debug('Showed status notification', { messageId, context });
    return this.statusNotification;
  }

  /**
   * Dismiss active status notification
   */
  dismissStatusNotification() {
    if (this.statusNotification) {
      pageEventBus.emit('dismiss_notification', { id: this.statusNotification });
      this.logger.debug("Dismissed status notification");
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
    this.logger.debug("Dismissed Select Element notification", options);
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

    this.logger.debug('Showed timeout notification', { messageId });
  }

  
  
  /**
   * Process streaming update and apply translations to DOM
   * @param {Object} message - Stream update message
   */
  async processStreamUpdate(message) {
    const { messageId, data } = message;

    this.logger.debug(`Processing stream update:`, {
      messageId,
      success: data?.success,
      batchIndex: data?.batchIndex,
      translatedBatchLength: data?.data?.length,
      originalBatchLength: data?.originalData?.length
    });

    // Check if the request still exists (may have been cancelled)
    const request = this.orchestrator.requestManager.getRequest(messageId);
    if (!request) {
      this.logger.debug(`Ignoring stream update for unknown/cancelled request: ${messageId}`);
      return;
    }

    // Check if request was cancelled
    if (request.status === 'cancelled') {
      this.logger.debug(`Ignoring stream update for cancelled request: ${messageId}`);
      return;
    }

    if (!data.success) {
      this.logger.warn(`Received failed stream update for messageId: ${messageId}`, data.error);

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
    const { textsToTranslate, originMapping, expandedTexts, textNodes } = request;

    // Enhanced tracking to prevent duplicate translations
    const processedNodeIds = new Set();
    const processedOriginalTexts = new Set();
    const appliedTranslations = new Map(); // Track which translations were applied to which nodes

    for (let i = 0; i < translatedBatch.length; i++) {
      const translatedText = translatedBatch[i];
      const originalText = originalBatch[i];

      // Skip if we've already processed this exact original text
      if (processedOriginalTexts.has(originalText)) {
        this.logger.debug(`Skipping already processed original text: "${originalText.substring(0, 50)}..."`);
        continue;
      }

      // Find the original index in the expandedTexts array
      // Handle both actual text and empty line placeholders
      let expandedIndex = -1;

      // First try exact match for non-empty lines
      if (originalText.trim() !== '') {
        expandedIndex = expandedTexts.findIndex(text => text === originalText);
      } else {
        // For empty strings, find the next empty line placeholder
        // This handles cases where [[EMPTY_LINE]] was replaced with '' for API
        for (let j = 0; j < expandedTexts.length; j++) {
          if (expandedTexts[j] === '[[EMPTY_LINE]]' && originMapping[j]?.isEmptyLine) {
            expandedIndex = j;
            break;
          }
        }
      }

      if (expandedIndex === -1) {
        this.logger.debug(`Could not find original text for translated segment: "${originalText}"`);
        continue;
      }

      const { originalIndex, isEmptyLine } = originMapping[expandedIndex];
      const originalTextKey = textsToTranslate[originalIndex];

      // Handle empty lines - preserve structure with newline character
      if (isEmptyLine) {
        this.logger.debug(`Preserving empty line segment at index ${expandedIndex}`);
        request.translatedSegments.set(expandedIndex, '\n'); // Use newline to preserve empty line structure
        processedOriginalTexts.add(originalText);
        continue;
      }

      // Check if this is part of a multi-segment translation
      const isMultiSegment = originalText.includes('\n') ||
                            (originalTextKey && originalTextKey !== originalText &&
                             (originalTextKey.includes('\n') || originalTextKey.length > 100));

      // Find nodes to update
      let nodesToUpdate = await this._findNodesToUpdate(textNodes, originalText, processedNodeIds);

      // Additional validation: ensure we're not applying the same translation to unrelated nodes
      if (nodesToUpdate.length > 0) {
        nodesToUpdate = this._filterValidNodesForTranslation(nodesToUpdate, originalText, originalTextKey, appliedTranslations);
      }

      // Mark nodes as processed for multi-segment translations
      if (isMultiSegment && nodesToUpdate.length > 0) {
        nodesToUpdate.forEach(node => {
          processedNodeIds.add(node);
          // Track which translation was applied to this node
          appliedTranslations.set(node, {
            originalText: originalText,
            originalTextKey: originalTextKey,
            translatedText: translatedText,
            isMultiSegment: true
          });
        });
      } else if (nodesToUpdate.length > 0) {
        // Also track single segment translations
        nodesToUpdate.forEach(node => {
          appliedTranslations.set(node, {
            originalText: originalText,
            originalTextKey: originalTextKey,
            translatedText: translatedText,
            isMultiSegment: false
          });
        });
      }

      if (nodesToUpdate.length > 0) {
        // Apply translations based on segment type
        if (isMultiSegment) {
          await this._handleMultiSegmentTranslation(nodesToUpdate, request, expandedIndex, originalIndex, originalTextKey, translatedBatch, originalBatch);
        } else {
          await this._handleSingleSegmentTranslation(nodesToUpdate, originalText, translatedText);
        }

        request.translatedSegments.set(expandedIndex, translatedText);
        processedOriginalTexts.add(originalText);
      } else {
        this.logger.debug(`No valid nodes found for translation: "${originalText.substring(0, 50)}..."`);
      }
    }
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

    // Priority 1: Exact trimmed match
    if (nodeTextMap.has(originalTextTrimmed)) {
      return nodeTextMap.get(originalTextTrimmed).map(item => item.node);
    }

    // Priority 2: Exact full text match
    for (const [nodeText, nodeList] of nodeTextMap) {
      for (const { node, fullText } of nodeList) {
        if (fullText === originalText) {
          return [node];
        }
      }
    }

    // Priority 3: Handle multi-segment text (text with newlines)
    if (originalTextTrimmed.includes('\n')) {
      return this._findNodesForMultiSegmentText(textNodes, originalText, processedNodeIds, nodeTextMap);
    }

    // Priority 4: Partial match with high confidence
    return this._findNodesWithConfidentPartialMatch(textNodes, originalText, processedNodeIds);
  }

  /**
   * Find nodes for multi-segment text (text with newlines)
   * @private
   */
  _findNodesForMultiSegmentText(textNodes, originalText, processedNodeIds, nodeTextMap) {
    const segments = originalText.trim().split('\n').filter(seg => seg.trim().length > 0);

    if (segments.length === 0) return [];

    // Find nodes that contain the most substantial segments
    const candidateNodes = [];

    for (const segment of segments) {
      const segmentTrimmed = segment.trim();
      if (segmentTrimmed.length < 5) continue; // Skip very short segments

      // Look for exact segment match
      if (nodeTextMap.has(segmentTrimmed)) {
        candidateNodes.push(...nodeTextMap.get(segmentTrimmed).map(item => item.node));
      }
    }

    // If we found candidate nodes, return the most relevant ones
    if (candidateNodes.length > 0) {
      // Remove duplicates and already processed nodes
      const uniqueNodes = [...new Set(candidateNodes)].filter(node => !processedNodeIds.has(node));

      // If we have multiple candidates, prefer the one with the most substantial content
      if (uniqueNodes.length > 1) {
        return uniqueNodes.sort((a, b) => {
          const aLength = a.textContent.trim().length;
          const bLength = b.textContent.trim().length;
          return bLength - aLength; // Prefer longer content
        }).slice(0, 1); // Return only the best match
      }

      return uniqueNodes;
    }

    return [];
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
            this.logger.debug(`Skipping node with existing different translation`, {
              nodeText: nodeText.substring(0, 30),
              existingOriginal: existingTrimmed.substring(0, 30),
              currentOriginal: currentTrimmed.substring(0, 30)
            });
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
          this.logger.debug(`Node rejected due to insufficient word overlap`, {
            nodeText: nodeText.substring(0, 30),
            originalText: originalTextTrimmed.substring(0, 30),
            overlapRatio
          });
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
    const { expandedTexts, originMapping, translatedSegments, textNodes } = request;

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
        // Handle empty lines
        if (isEmptyLine) {
          allSegments.push('\n');
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
          this.logger.warn(`Translation not found for segment: "${originalSegment}"`);
          allSegments.push(originalSegment);
          segmentMappings.push({ type: 'fallback', originalIndex: j });
        }
      }
    }

    this.logger.debug(`Multi-segment translation collected:`, {
      originalIndex,
      segmentCount: allSegments.length,
      targetNodeTexts: Array.from(targetNodeTexts),
      segments: allSegments.map((s, i) => ({
        index: i,
        content: s.substring(0, 50) + (s.length > 50 ? '...' : ''),
        mapping: segmentMappings[i]
      }))
    });

    // Validate that this translation should be applied to these nodes
    const shouldApplyTranslation = this._validateNodeSegmentMatch(nodesToUpdate, originalTextKey, allSegments);

    if (!shouldApplyTranslation) {
      this.logger.warn(`Skipping multi-segment translation due to node-segment mismatch`, {
        nodeTexts: Array.from(targetNodeTexts),
        originalTextKey: originalTextKey.substring(0, 100)
      });
      return;
    }

    // Combine all segments into a single translation with proper spacing
    let combinedTranslation = allSegments.join('');

    // If the original text had newlines, preserve the paragraph structure
    if (originalTextKey && originalTextKey.includes('\n')) {
      const originalLines = originalTextKey.split('\n').filter(line => line.trim());
      if (originalLines.length > 1 && allSegments.length >= originalLines.length) {
        // Reconstruct with line breaks - preserve empty lines properly
        const translatedLines = [];
        let segmentIndex = 0;

        for (const line of originalLines) {
          if (line.trim() === '') {
            translatedLines.push('');
          } else if (segmentIndex < allSegments.length) {
            translatedLines.push(allSegments[segmentIndex++]);
          }
        }

        combinedTranslation = translatedLines.join('\n\n');
      }
    }

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
        this.logger.debug(`Node text too short for multi-segment translation`, {
          nodeText: nodeText.substring(0, 30),
          segmentCount: nonEmptySegments.length
        });
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

    this.logger.info("Translation stream finished for message:", messageId, {
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
   * Handle successful stream end
   * @private
   */
  async _handleStreamEndSuccess(messageId, request) {
    // Create final translated data array that matches the full expandedTexts structure
    const finalTranslatedData = [];
    for (let i = 0; i < request.expandedTexts.length; i++) {
      const translatedText = request.translatedSegments.get(i);
      const mappingInfo = request.originMapping[i];

      if (mappingInfo?.isEmptyLine) {
        // Preserve empty line structure with newline character
        finalTranslatedData.push({ text: '\n' });
      } else if (translatedText !== undefined) {
        finalTranslatedData.push({ text: translatedText });
      } else {
        // Fallback to original text if no translation found
        const originalText = request.filteredExpandedTexts ? request.filteredExpandedTexts[i] : request.expandedTexts[i];
        finalTranslatedData.push({ text: originalText });
      }
    }

    // Use the proper reassembly function to preserve empty lines
    const newTranslations = reassembleTranslations(
      finalTranslatedData,
      request.expandedTexts, // Original expandedTexts with placeholders
      request.originMapping,
      request.textsToTranslate,
      new Map() // No cached translations
    );

    this.orchestrator.stateManager.addTranslatedElement(request.element, newTranslations);

    // Apply translations to DOM nodes
    await this.applyTranslationsToNodes(request.textNodes, newTranslations);

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
      this.logger.debug("Showed success notification for previously timed out request");
    }
  }

  /**
   * Handle stream end with errors
   * @private
   */
  async _handleStreamEndError(messageId, request, data) {
    this.logger.warn(`Stream ended with error for messageId: ${messageId}`, data?.error || request.lastError);

    // Create error object
    const errorMessage = data?.error?.message || request.lastError?.message || 'Translation failed during streaming';
    const error = new Error(errorMessage);
    error.originalError = data?.error || request.lastError;

    // Check if we should retry with a fallback provider
    const shouldRetry = this.orchestrator.errorHandlerService.isRecoverableError(error, request);

    if (shouldRetry) {
      this.logger.info('Attempting retry with fallback provider due to recoverable error', {
        messageId,
        errorType: error.originalError?.type || 'unknown'
      });

      const retrySuccess = await this.orchestrator.errorHandlerService.retryWithFallbackProvider(
        messageId,
        JSON.stringify(request.textsToTranslate.map(t => ({ text: t }))),
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
    const translatedData = JSON.parse(translatedText);
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
          finalTranslatedData.push({ text: translatedData[translatedIndex].text });
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
    this.logger.info("Translation applied successfully to DOM elements (fallback)", { messageId: request.id });
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
   * Apply translations directly to DOM nodes
   * @param {Array} textNodes - Array of text nodes to translate
   * @param {Map} translations - Map of original text to translated text
   */
  async applyTranslationsToNodes(textNodes, translations) {
    this.logger.debug("Applying translations directly to DOM nodes", {
      textNodesCount: textNodes.length,
      translationsSize: translations.size,
      sampleTranslations: Array.from(translations.entries()).slice(0, 3).map(([key, value]) => [
      (typeof key === 'string' ? key.substring(0, 50) : String(key).substring(0, 50)) + ((typeof key === 'string' ? key : String(key)).length > 50 ? '...' : ''),
      (typeof value === 'string' ? value.substring(0, 50) : String(value).substring(0, 50)) + ((typeof value === 'string' ? value : String(value)).length > 50 ? '...' : '')
    ])
    });

    // Get target language for better RTL detection
    const { getTargetLanguageAsync } = await import("../../../../config.js");
    const targetLanguage = await getTargetLanguageAsync();

    // Create context with target language for improved RTL detection
    const context = {
      state: {
        originalTexts: this.orchestrator.stateManager.originalTexts || new Map()
      },
      targetLanguage: targetLanguage
    };

    // Use the existing applyTranslationsToNodes from extraction utilities
    const result = applyTranslationsToNodes(textNodes, translations, context);

    this.logger.debug("Translations applied directly to DOM nodes", {
      appliedCount: translations.size,
      result: result,
      targetLanguage: targetLanguage
    });
  }

  /**
   * Trigger post-translation cleanup through SelectElementManager
   */
  triggerPostTranslationCleanup() {
    if (window.selectElementManagerInstance && typeof window.selectElementManagerInstance.performPostTranslationCleanup === 'function') {
      this.logger.debug('Triggering SelectElementManager cleanup');
      window.selectElementManagerInstance.performPostTranslationCleanup();
    } else {
      this.logger.warn('Cannot trigger cleanup: SelectElementManager not available');
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
   * Cleanup UI manager
   */
  cleanup() {
    this.dismissStatusNotification();
    this.statusNotification = null;
    this.cacheCompleted = false;

    this.logger.debug('TranslationUIManager cleanup completed');
  }
}