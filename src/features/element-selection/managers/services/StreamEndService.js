import { getScopedLogger } from "../../../../shared/logging/logger.js";
import { LOG_COMPONENTS } from "../../../../shared/logging/logConstants.js";
import { reassembleTranslations } from "../../utils/textProcessing.js";
import { unifiedTranslationCoordinator } from '@/shared/messaging/core/UnifiedTranslationCoordinator.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { getTargetLanguageAsync } from "@/shared/config/config.js";

/**
 * StreamEndService - Handles stream completion and final result processing
 * Manages stream end (success and error paths) and non-streaming translation results
 *
 * Responsibilities:
 * - Handle stream completion (success and error paths)
 * - Process non-streaming translation results
 * - Coordinate final result assembly and fallback processing
 * - Handle timeout and retry scenarios
 *
 * @memberof module:features/element-selection/managers/services
 */
export class StreamEndService {
  constructor(uiManager) {
    this.uiManager = uiManager;
    this.logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'StreamEndService');
  }

  /**
   * Initialize the stream end service
   */
  initialize() {
    this.logger.debug('StreamEndService initialized');
  }

  /**
   * Process stream end and complete translation
   * @param {Object} message - Stream end message
   * @returns {Promise<void>}
   */
  async processStreamEnd(message) {
    const { messageId, data } = message;
    const orchestrator = this.uiManager.orchestrator;
    const request = orchestrator.requestManager.getRequest(messageId);

    if (!request) {
      this.logger.debug("Received stream end for already completed message:", messageId);
      return;
    }

    // Check if request was cancelled
    if (request.status === 'cancelled') {
      this.logger.debug("Ignoring stream end for cancelled message:", { messageId });
      orchestrator.requestManager.removeRequest(messageId);
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
      this.uiManager.notificationService.dismissStatusNotification();
      this.uiManager.notificationService.dismissSelectElementNotification();

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
   * @param {string} messageId - Message ID
   * @param {Object} request - Translation request
   */
  async _handleStreamEndSuccess(messageId, request) {
    this.logger.debug(`Stream ended successfully for messageId: ${messageId}. Processing final result...`);

    const orchestrator = this.uiManager.orchestrator;

    // Get target language once for direction detection
    const targetLanguage = await getTargetLanguageAsync();

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
          // Enhanced JSON array handling for all cases (not just single segment)
          try {
            // Clean translatedText by removing markdown code blocks first
            let cleanTranslatedText = translatedText;

            // Remove markdown code blocks
            if (translatedText.includes('```json')) {
              cleanTranslatedText = translatedText.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
            }

            // Check if translatedText is a JSON array string
            if (cleanTranslatedText.startsWith('[') && cleanTranslatedText.endsWith(']')) {
              const parsed = JSON.parse(cleanTranslatedText);
              if (Array.isArray(parsed) && parsed.length > 0) {
                // Handle both string and object formats in array
                if (typeof parsed[0] === 'string') {
                  // For multiple translations, join them with proper spacing and structure preservation
                  if (parsed.length === 1) {
                    finalTranslatedData.push({ text: parsed[0] });
                  } else {
                    // Check if original text has paragraph structure to preserve
                    const originalExpandedText = request.expandedTexts[i] || '';
                    const originalHasParagraphs = originalExpandedText.includes('\n\n');

                    if (originalHasParagraphs) {
                      // Preserve paragraph structure with double newlines
                      const joinedText = parsed.join('\n\n');
                      finalTranslatedData.push({ text: joinedText });
                    } else {
                      // Check if any translations contain newlines for proper joining
                      const hasNewlines = parsed.some(text => text.includes('\n'));
                      const joinedText = hasNewlines ? parsed.join('\n') : parsed.join(' ');
                      finalTranslatedData.push({ text: joinedText });
                    }
                  }
                } else if (parsed[0] && parsed[0].text) {
                  // Handle object format
                  const objectTexts = parsed.map(item => item.text).filter(Boolean);
                  if (objectTexts.length === 1) {
                    finalTranslatedData.push({ text: objectTexts[0] });
                  } else {
                    // Check if original text has paragraph structure to preserve
                    const originalExpandedText = request.expandedTexts[i] || '';
                    const originalHasParagraphs = originalExpandedText.includes('\n\n');

                    if (originalHasParagraphs) {
                      // Preserve paragraph structure with double newlines
                      const joinedText = objectTexts.join('\n\n');
                      finalTranslatedData.push({ text: joinedText });
                    } else {
                      const hasNewlines = objectTexts.some(text => text.includes('\n'));
                      const joinedText = hasNewlines ? objectTexts.join('\n') : objectTexts.join(' ');
                      finalTranslatedData.push({ text: joinedText });
                    }
                  }
                } else {
                  finalTranslatedData.push({ text: translatedText });
                }
              } else {
                finalTranslatedData.push({ text: translatedText });
              }
            } else {
              // Not a JSON array, use as-is
              finalTranslatedData.push({ text: translatedText });
            }
          } catch (parseError) {
            // If parsing fails, use as-is
            this.logger.debug(`Failed to parse JSON array translation in streaming: ${parseError.message}`);
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
      orchestrator.stateManager.addTranslatedElement(request.element, newTranslations);

      // CRITICAL FIX: Force apply complete translations to replace ALL streaming segments
      this.logger.debug(`Force applying complete final translations to replace streaming content`);
      await this.uiManager.translationApplier.applyTranslationsToNodes(request.textNodes, newTranslations, {
        skipStreamingUpdates: true, // This ensures replacement of streaming content
        messageId: messageId,
        forceUpdate: true, // Force replacement of existing streaming translations
        isFinalResult: true, // Mark this as the final complete result
        finalResultAuthority: true // Add explicit authority flag for complete override
      });

      // CRITICAL: Apply RTL direction to parent elements for proper text display
      // Simplified approach - just applies dir attribute without wrapper structure
      await this.uiManager.directionManager.applyImmersiveTranslatePattern(request.element, newTranslations, messageId, targetLanguage);

      // Mark request as completed to prevent further stream updates
      orchestrator.requestManager.updateRequestStatus(messageId, 'completed', {
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
          await this.uiManager.translationApplier.applyTranslationsToNodes(request.textNodes, fallbackTranslations, {
            skipStreamingUpdates: true,
            messageId: messageId,
            forceUpdate: true,
            isFinalResult: true
          });

          // CRITICAL: Apply RTL direction to parent elements for proper text display (fallback case)
          await this.uiManager.directionManager.applyImmersiveTranslatePattern(request.element, fallbackTranslations, messageId, targetLanguage);

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
   * @param {string} messageId - Message ID
   * @param {Object} request - Translation request
   * @param {Object} data - Stream data
   */
  async _handleStreamEndError(messageId, request, data) {
    this.logger.debug(`Stream ended with error for messageId: ${messageId}`, data?.error || request.lastError);

    const orchestrator = this.uiManager.orchestrator;

    // Create error object
    const errorMessage = data?.error?.message || request.lastError?.message || 'Translation failed during streaming';
    const error = new Error(errorMessage);
    error.originalError = data?.error || request.lastError;

    // Check if we should retry with a fallback provider
    const shouldRetry = orchestrator.errorHandlerService.isRecoverableError(error, request);

    if (shouldRetry) {
      this.logger.debug('Attempting retry with fallback provider due to recoverable error', {
        messageId,
        errorType: error.originalError?.type || 'unknown'
      });

      const retrySuccess = await orchestrator.errorHandlerService.retryWithFallbackProvider(
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
    await orchestrator.errorHandlerService.showErrorToUser(error, {
      context: 'select-element-streaming-translation-end',
      type: 'TRANSLATION_FAILED',
      showToast: true
    });

    // Notify UnifiedTranslationCoordinator about the streaming error
    unifiedTranslationCoordinator.handleStreamingError(messageId, error);

    // Mark request as completed with error to prevent further stream updates
    orchestrator.requestManager.updateRequestStatus(messageId, 'error', {
      error: error.message || 'Translation failed'
    });
    this.logger.debug(`Request ${messageId} marked as error state to prevent further stream updates`);
  }

  /**
   * Handle stream end processing errors
   * @private
   * @param {string} messageId - Message ID
   * @param {Error} error - Processing error
   */
  async _handleStreamEndProcessingError(messageId, error) {
    const orchestrator = this.uiManager.orchestrator;

    // Notify UnifiedTranslationCoordinator about the error
    unifiedTranslationCoordinator.handleStreamingError(messageId, error);

    // Ensure cleanup happens even if there's an error
    orchestrator.requestManager.removeRequest(messageId);
    window.isTranslationInProgress = false;

    // Dismiss any remaining notifications
    this.uiManager.notificationService.dismissStatusNotification();
    this.uiManager.notificationService.dismissSelectElementNotification();

    // Show error to user
    await orchestrator.errorHandlerService.showErrorToUser(error, {
      context: 'stream_end_processing',
      messageId,
      showToast: true
    });
  }

  /**
   * Handle non-streaming translation result
   * @param {Object} message - Translation result message
   * @returns {Promise<void>}
   */
  async handleTranslationResult(message) {
    const { messageId, data } = message;
    this.logger.debug("Received non-streaming translation result:", { messageId });

    const orchestrator = this.uiManager.orchestrator;
    const request = orchestrator.requestManager.getRequest(messageId);
    if (!request) {
      this.logger.debug("Received translation result for unknown message:", messageId);
      // Trigger cleanup if translation succeeded
      if (data?.success && orchestrator.isActive()) {
        this.logger.debug("Triggering cleanup for unknown request due to successful translation");
        this.uiManager.triggerPostTranslationCleanup();
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
      orchestrator.requestManager.updateRequestStatus(messageId, 'error', { error: e.message });
    } finally {
      await this._finalizeNonStreamingRequest(messageId);
    }
  }

  /**
   * Process successful non-streaming translation result
   * @private
   * @param {Object} request - Translation request
   * @param {Object} data - Translation data
   */
  async _processNonStreamingSuccess(request, data) {
    const { translatedText } = data;
    const orchestrator = this.uiManager.orchestrator;

    // Get target language once for direction detection
    const targetLanguage = await getTargetLanguageAsync();

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
            let translationText = translatedData[translatedIndex];

            // CRITICAL FIX: Handle case where translation text is a JSON array string
            // Check for both direct JSON array and markdown code blocks
            let cleanTranslationText = translationText;

            // Remove markdown code blocks first
            if (translationText.includes('```json')) {
              cleanTranslationText = translationText.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
            }

            if (cleanTranslationText.startsWith('[') && cleanTranslationText.endsWith(']')) {
              try {
                const parsedArray = JSON.parse(cleanTranslationText);
                if (Array.isArray(parsedArray) && parsedArray.length > 0) {
                  // Join multiple translations with proper spacing and structure preservation
                  if (parsedArray.length === 1) {
                    translationText = parsedArray[0];
                  } else {
                    // Check if original text has paragraph structure to preserve
                    const originalExpandedText = expandedTexts[translatedIndex] || '';
                    const originalHasParagraphs = originalExpandedText.includes('\n\n');

                    if (originalHasParagraphs) {
                      // Preserve paragraph structure with double newlines
                      translationText = parsedArray.join('\n\n');
                    } else {
                      // Check if any translations contain newlines for structure preservation
                      const hasNewlines = parsedArray.some(text => text.includes('\n'));
                      translationText = hasNewlines ? parsedArray.join('\n') : parsedArray.join(' ');
                    }
                  }
                  this.logger.debug(`Parsed JSON array translation: ${parsedArray.length} segments -> final length: ${translationText.length}`);
                }
              } catch (parseError) {
                this.logger.warn(`Failed to parse JSON array translation: ${parseError.message}`);
                // Use original translation text if parsing fails
              }
            }

            finalTranslatedData.push({ text: translationText });
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
    orchestrator.stateManager.addTranslatedElement(element, newTranslations);

    // Apply translations directly to DOM nodes with isFinalResult flag
    await this.uiManager.translationApplier.applyTranslationsToNodes(textNodes, newTranslations, {
      isFinalResult: true,
      messageId: request.id
    });

    // CRITICAL: Apply RTL direction to parent elements for proper text display
    await this.uiManager.directionManager.applyImmersiveTranslatePattern(element, newTranslations, request.id, targetLanguage);

    orchestrator.requestManager.updateRequestStatus(request.id, 'completed', { result: data });
    this.logger.debug("Translation applied successfully to DOM elements (fallback)", { messageId: request.id });
  }

  /**
   * Process failed non-streaming translation result
   * @private
   * @param {Object} request - Translation request
   * @param {Object} data - Error data
   */
  async _processNonStreamingError(request, data) {
    const orchestrator = this.uiManager.orchestrator;
    orchestrator.requestManager.updateRequestStatus(request.id, 'error', { error: data?.error });
    this.logger.error("Translation failed (fallback)", { messageId: request.id, error: data?.error });

    await orchestrator.errorHandlerService.showErrorToUser(
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
   * @param {string} messageId - Message ID
   */
  async _finalizeNonStreamingRequest(messageId) {
    const orchestrator = this.uiManager.orchestrator;

    // Clear the global translation in progress flag
    window.isTranslationInProgress = false;

    this.uiManager.notificationService.dismissStatusNotification();
    orchestrator.requestManager.removeRequest(messageId);

    // Notify SelectElementManager to perform cleanup
    if (window.selectElementManagerInstance) {
      window.selectElementManagerInstance.performPostTranslationCleanup();
    }
  }

  /**
   * Cleanup stream end service
   */
  cleanup() {
    this.logger.debug('StreamEndService cleanup completed');
  }
}
