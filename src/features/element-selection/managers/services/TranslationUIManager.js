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

    // Track multi-segment translations to avoid duplicate node replacement
    const processedNodeIds = new Set();

    for (let i = 0; i < translatedBatch.length; i++) {
      const translatedText = translatedBatch[i];
      const originalText = originalBatch[i];

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
        continue;
      }

      // Check if this is part of a multi-segment translation
      const isMultiSegment = originalText.includes('\n') ||
                            (originalTextKey && originalTextKey !== originalText &&
                             (originalTextKey.includes('\n') || originalTextKey.length > 100));

      // Find nodes to update
      let nodesToUpdate = await this._findNodesToUpdate(textNodes, originalText, processedNodeIds);

      // Mark nodes as processed for multi-segment translations
      if (isMultiSegment && nodesToUpdate.length > 0) {
        nodesToUpdate.forEach(node => processedNodeIds.add(node));
      }

      if (nodesToUpdate.length > 0) {
        // Apply translations based on segment type
        if (isMultiSegment) {
          await this._handleMultiSegmentTranslation(nodesToUpdate, request, expandedIndex, originalIndex, originalTextKey, translatedBatch, originalBatch);
        } else {
          await this._handleSingleSegmentTranslation(nodesToUpdate, originalText, translatedText);
        }

        request.translatedSegments.set(expandedIndex, translatedText);
      }
    }
  }

  /**
   * Find nodes that should be updated with translation
   * @private
   */
  async _findNodesToUpdate(textNodes, originalText, processedNodeIds) {
    // Try exact match first
    let nodesToUpdate = textNodes.filter(node => {
      const nodeText = node.textContent.trim();
      // Skip nodes that have already been processed
      if (processedNodeIds.has(node)) return false;
      return nodeText === originalText.trim();
    });

    // If no exact match, the text might be split across multiple nodes
    if (nodesToUpdate.length === 0) {
      nodesToUpdate = await this._findNodesWithPartialMatch(textNodes, originalText, processedNodeIds);
    }

    return nodesToUpdate;
  }

  /**
   * Find nodes using partial matching for split text
   * @private
   */
  async _findNodesWithPartialMatch(textNodes, originalText, processedNodeIds) {
    const originalTextClean = originalText.trim();
    let nodesToUpdate = [];

    // Special handling for text that might contain newlines
    if (originalTextClean.includes('\n') || originalTextClean.includes('...')) {
      const textParts = originalTextClean.split(/[\n...]+/).filter(part => part.length > 10);

      if (textParts.length > 0) {
        // Find nodes that contain any of the significant parts
        nodesToUpdate = textNodes.filter(node => {
          if (processedNodeIds.has(node)) return false;
          const nodeText = node.textContent.trim();
          return textParts.some(part =>
            nodeText.includes(part) || part.includes(nodeText)
          );
        });
      }
    } else {
      // For non-split text, try substring matching
      const firstPart = originalTextClean.substring(0, Math.min(50, originalTextClean.length));
      nodesToUpdate = textNodes.filter(node => {
        if (processedNodeIds.has(node)) return false;
        const nodeText = node.textContent.trim();
        return nodeText.includes(firstPart) || firstPart.includes(nodeText);
      });
    }

    return nodesToUpdate;
  }

  /**
   * Handle multi-segment translation
   * @private
   */
  async _handleMultiSegmentTranslation(nodesToUpdate, request, expandedIndex, originalIndex, originalTextKey, translatedBatch, originalBatch) {
    const { expandedTexts, originMapping, translatedSegments } = request;

    // Collect all related translations for this multi-segment text
    const allSegments = [];

    // Find all segments that belong to the same original text
    for (let j = 0; j < expandedTexts.length; j++) {
      const { originalIndex: segOriginalIndex, isEmptyLine } = originMapping[j];
      if (segOriginalIndex === originalIndex) {
        // Handle empty lines
        if (isEmptyLine) {
          allSegments.push('\n');
          continue;
        }

        // First check if we already have the translation from translatedSegments
        if (translatedSegments.has(j)) {
          allSegments.push(translatedSegments.get(j));
          continue;
        }

        // Find the translated text for this segment using originalBatch->translatedBatch mapping
        const originalSegment = expandedTexts[j];
        let segmentTranslation = null;

        // Find the index in originalBatch that matches our segment
        for (let k = 0; k < originalBatch.length; k++) {
          if (originalBatch[k] === originalSegment && k < translatedBatch.length) {
            segmentTranslation = translatedBatch[k];
            break;
          }
        }

        if (segmentTranslation) {
          allSegments.push(segmentTranslation);
        } else {
          // Fallback: use original segment if translation not found
          this.logger.warn(`Translation not found for segment: "${originalSegment}"`);
          allSegments.push(originalSegment);
        }
      }
    }

    this.logger.debug(`Multi-segment translation collected:`, {
      originalIndex,
      segmentCount: allSegments.length,
      segments: allSegments.map((s, i) => ({ index: i, content: s.substring(0, 50) + (s.length > 50 ? '...' : '') }))
    });

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
      const nodeText = node.textContent.trim();
      translationMap.set(nodeText, combinedTranslation);
    });

    await this.applyTranslationsToNodes(nodesToUpdate, translationMap);
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