import { getScopedLogger } from "../../../../shared/logging/logger.js";
import { LOG_COMPONENTS } from "../../../../shared/logging/logConstants.js";
import { reassembleTranslations } from "../../utils/textProcessing.js";
import { generateUniqueId } from "../../utils/domManipulation.js";
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
      return;
    }

    // Check if request was cancelled
    if (request.status === 'cancelled') {
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
    const { expandedTexts } = request;

    this.logger.debug(`Processing translation batch: ${translatedBatch.length} segments`);

    // Store all translated segments for later reassembly
    // Let the existing reassembly logic handle the complex mapping
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
          this.logger.warn(`Translation not found for segment: "${originalSegment}"`);
          allSegments.push(originalSegment);
          segmentMappings.push({ type: 'fallback', originalIndex: j });
        }
      }
    }

    this.logger.debug(`Multi-segment translation collected: ${allSegments.length} segments`);

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

    // Use the proper reassembly function to preserve empty lines and structure
    const newTranslations = reassembleTranslations(
      finalTranslatedData,
      request.expandedTexts, // Original expandedTexts with placeholders
      request.originMapping,
      request.textsToTranslate,
      new Map() // No cached translations
    );

    // Store in state manager for potential revert
    this.orchestrator.stateManager.addTranslatedElement(request.element, newTranslations);

    // Apply translations to DOM nodes using the existing function
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
   * Apply translations directly to DOM nodes using wrapper approach for Revert compatibility
   * @param {Array} textNodes - Array of text nodes to translate
   * @param {Map} translations - Map of original text to translated text
   */
  async applyTranslationsToNodes(textNodes, translations) {
    this.logger.debug("Applying translations directly to DOM nodes using wrapper approach", {
      textNodesCount: textNodes.length,
      translationsSize: translations.size,
      availableTranslations: Array.from(translations.entries()).map(([k, v]) => ({
        original: k.substring(0, 50) + (k.length > 50 ? '...' : ''),
        translated: v.substring(0, 50) + (v.length > 50 ? '...' : '')
      }))
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

    // Apply translations using wrapper approach for Revert compatibility
    validTextNodes.forEach((textNode, nodeIndex) => {
      if (!textNode.parentNode || textNode.nodeType !== Node.TEXT_NODE) {
        return;
      }

      const originalText = textNode.textContent;
      const trimmedOriginalText = originalText.trim();

      // Handle empty lines and whitespace-only text (preserve structure but don't translate)
      if (originalText === '\n\n' || originalText === '\n' || /^\s*$/.test(originalText)) {
        this.logger.debug('Preserving empty line or whitespace text node', {
          originalText: JSON.stringify(originalText)
        });
        processedCount++;
        return; // Don't translate empty lines, just preserve them
      }

      // Find matching translation
      let translatedText = null;
      let matchType = '';

      // Try exact match first
      if (translations.has(trimmedOriginalText)) {
        translatedText = translations.get(trimmedOriginalText);
        matchType = 'exact_trimmed';
      } else if (translations.has(originalText)) {
        translatedText = translations.get(originalText);
        matchType = 'exact_full';
      } else {
        // Try to find a translation that contains this text
        for (const [origText, transText] of translations.entries()) {
          const origTextTrimmed = origText.trim();

          if (origTextTrimmed.includes(trimmedOriginalText) || trimmedOriginalText.includes(origTextTrimmed)) {
            translatedText = transText;
            matchType = 'contains';
            break;
          }
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

          // Create inner span for translated content
          const translationSpan = document.createElement("span");
          translationSpan.className = "aiwc-translation-inner";

          // Preserve leading whitespace from original text
          const leadingWhitespace = originalText.match(/^\s*/)[0];

          // Check if the original text ends with whitespace that should create a visual line break
          originalText.match(/\s*$/)[0];

          // Start with leading whitespace
          let processedText = leadingWhitespace + translatedText;

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
          fullText: originalText.substring(0, 50)
        });
      }
    });

    this.logger.debug("Translation application complete using wrapper approach", {
      totalNodes: textNodes.length,
      validNodes: validTextNodes.length,
      appliedCount: processedCount,
      unmatchedCount: unmatchedNodes.length,
      targetLanguage: targetLanguage,
      unmatchedNodes: unmatchedNodes.slice(0, 3) // Show first few unmatched
    });

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