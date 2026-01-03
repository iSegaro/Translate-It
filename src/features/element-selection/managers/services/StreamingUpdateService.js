import { getScopedLogger } from "../../../../shared/logging/logger.js";
import { LOG_COMPONENTS } from "../../../../shared/logging/logConstants.js";
import { findBestTranslationMatch } from "../../utils/textProcessing.js";
import { generateUniqueId } from "../../utils/domManipulation.js";
import { ensureSpacingBeforeInlineElements, preserveAdjacentSpacing } from "../../utils/spacingUtils.js";
import { detectTextDirectionFromContent } from "../../utils/textDirection.js";
import { getTargetLanguageAsync } from "@/shared/config/config.js";

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
 * StreamingUpdateService - Processes real-time streaming translation updates
 * Handles translation data processing, quality checks, and immediate DOM application
 *
 * Responsibilities:
 * - Process streaming translation updates
 * - Apply translations immediately for real-time feedback
 * - Handle JSON array parsing in streaming responses
 * - Text similarity calculation for quality validation
 * - LTR portion wrapping in RTL text
 *
 * @memberof module:features/element-selection/managers/services
 */
export class StreamingUpdateService {
  constructor(uiManager) {
    this.uiManager = uiManager;
    this.logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'StreamingUpdateService');
  }

  /**
   * Initialize the streaming update service
   */
  initialize() {
    this.logger.debug('StreamingUpdateService initialized');
  }

  /**
   * Process streaming update and apply translations to DOM
   * @param {Object} message - Stream update message
   * @returns {Promise<void>}
   */
  async processStreamUpdate(message) {
    const { messageId, data } = message;
    const orchestrator = this.uiManager.orchestrator;

    this.logger.debug(`Processing stream update ${messageId} (success: ${data?.success})`);

    // Check if the request still exists (may have been cancelled)
    const request = orchestrator.requestManager.getRequest(messageId);
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
      const originalRequest = orchestrator.requestManager.getRequest(originalId);

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
      orchestrator.requestManager.markRequestError(messageId, data.error);

      // Clear the global translation in progress flag on error
      window.isTranslationInProgress = false;

      // Dismiss notification on error
      this.uiManager.notificationService.dismissStatusNotification();
      if (!this.uiManager.notificationService.statusNotification) {
        // For Select Element mode, dismiss the Select Element notification
        this.uiManager.notificationService.dismissSelectElementNotification();
      }

      // Notify SelectElementManager to perform cleanup
      if (window.selectElementManagerInstance) {
        window.selectElementManagerInstance.performPostTranslationCleanup();
      }

      // Trigger stream end processing to properly clean up the failed stream
      try {
        await this.uiManager.streamEndService.processStreamEnd({
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
        orchestrator.requestManager.updateRequestStatus(messageId, 'error', {
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
   * @param {Object} request - Translation request
   * @param {Object} data - Stream data
   */
  async _processStreamTranslationData(request, data) {
    const { data: translatedBatch, originalData: originalBatch } = data;
    const { expandedTexts, textNodes, originMapping } = request;

    this.logger.debug(`Processing translation batch: ${translatedBatch.length} segments`);

    // Store translated segments and immediately apply to DOM for real-time streaming
    const newlyAppliedTranslations = new Map();

    for (let i = 0; i < translatedBatch.length; i++) {
      let translatedText = translatedBatch[i];
      const originalText = originalBatch[i];

      // CRITICAL FIX: Handle JSON array in streaming translations
      if (typeof translatedText === 'string') {
        let cleanTranslatedText = translatedText;

        // Remove markdown code blocks
        if (translatedText.includes('```json')) {
          cleanTranslatedText = translatedText.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
        }

        if (cleanTranslatedText.startsWith('[') && cleanTranslatedText.endsWith(']')) {
          try {
            const parsedArray = JSON.parse(cleanTranslatedText);
            if (Array.isArray(parsedArray) && parsedArray.length > 0) {
              // Extract translation text from array
              if (typeof parsedArray[0] === 'string') {
                if (parsedArray.length === 1) {
                  translatedText = parsedArray[0];
                } else {
                  // Check if original text has paragraph structure
                  const originalExpandedText = expandedTexts[i] || '';
                  const originalHasParagraphs = originalExpandedText.includes('\n\n');
                  translatedText = originalHasParagraphs ? parsedArray.join('\n\n') : parsedArray.join('\n');
                }
              } else if (parsedArray[0] && parsedArray[0].text) {
                const objectTexts = parsedArray.map(item => item.text).filter(Boolean);
                if (objectTexts.length === 1) {
                  translatedText = objectTexts[0];
                } else {
                  const originalExpandedText = expandedTexts[i] || '';
                  const originalHasParagraphs = originalExpandedText.includes('\n\n');
                  translatedText = originalHasParagraphs ? objectTexts.join('\n\n') : objectTexts.join('\n');
                }
              }
              this.logger.debug(`Streaming JSON array parsed: ${parsedArray.length} segments`);
            }
          } catch (parseError) {
            this.logger.debug(`Failed to parse streaming JSON array: ${parseError.message}`);
            // Use original translatedText if parsing fails
          }
        }
      }

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
   * @param {Array} textNodes - Text nodes to update
   * @param {Map} newTranslations - New translations to apply
   * @param {Object} request - Translation request
   */
  async _applyStreamingTranslationsImmediately(textNodes, newTranslations, request) {
    this.logger.debug(`Applying ${newTranslations.size} streaming translations immediately`);

    // Get target language for better RTL detection
    const targetLanguage = await getTargetLanguageAsync();

    const appliedNodes = new Set();
    let appliedCount = 0;

    // Apply translations to matching text nodes and segment elements
    for (const textNode of textNodes) {
      // Handle both TEXT_NODE (legacy) and ELEMENT_NODE with segment-id (new approach)
      let actualNode = textNode;

      // For segment ID nodes, find the current DOM element
      if (textNode.node && textNode.segmentId) {
        const segmentId = textNode.segmentId;
        actualNode = document.querySelector(`[data-segment-id="${segmentId}"]`);
      }

      if (!actualNode || !actualNode.parentNode || appliedNodes.has(actualNode)) {
        continue;
      }

      // Accept both TEXT_NODE (legacy) and ELEMENT_NODE with segment-id (new approach)
      if (actualNode.nodeType !== Node.TEXT_NODE &&
          !(actualNode.nodeType === Node.ELEMENT_NODE && actualNode.hasAttribute && actualNode.hasAttribute('data-segment-id'))) {
        continue;
      }

      const originalText = actualNode.textContent;
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
          if (actualNode.parentNode?.classList?.contains?.('aiwc-translation-wrapper')) {
            // Node already translated, skip
            continue;
          }

          // Create outer wrapper (FONT tag as per requested structure)
          const wrapperSpan = document.createElement("font");
          wrapperSpan.className = "aiwc-translation-wrapper aiwc-streaming-update";
          wrapperSpan.setAttribute("data-aiwc-original-id", uniqueId);
          wrapperSpan.setAttribute("data-aiwc-streaming", "true");
          if (request.messageId) {
            wrapperSpan.setAttribute("data-message-id", request.messageId);
          }

          // CRITICAL: Detect direction from actual translation content for correct punctuation placement
          const detectedDir = detectTextDirectionFromContent(translatedText, targetLanguage);
          wrapperSpan.setAttribute("dir", detectedDir);
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

          // Handle both TEXT_NODE (legacy) and ELEMENT_NODE with segment-id (new approach)
          if (actualNode.nodeType === Node.TEXT_NODE) {
            // Legacy approach: Create wrapper with inner font for TEXT_NODE
            const translationSpan = document.createElement("font");
            translationSpan.className = "aiwc-translation-inner";

            // CRITICAL FIX: Apply general spacing correction for streaming translations
            // This prevents words from sticking together when followed by inline elements
            let processedText = ensureSpacingBeforeInlineElements(textNode, originalText, translatedText);

            // ENHANCED: Preserve spacing between adjacent translated segments
            // This fixes issues like "به روز شد6 روز پیش" vs "به روز شد 6 روز پیش"
            processedText = preserveAdjacentSpacing(textNode, originalText, processedText);

            // Preserve original whitespace as fallback
            const leadingWhitespace = originalText.match(/^\s*/)[0];
            if (leadingWhitespace && !processedText.startsWith(' ')) {
              processedText = leadingWhitespace + processedText;
            }

            // CRITICAL: Skip applying if translation is identical to original
            if (processedText === originalText) {
              this.logger.debug(`Skipping streaming translation for TEXT_NODE - identical to original`, {
                originalPreview: originalText.substring(0, 30)
              });
              appliedCount++;
              continue;
            }

            // Detect direction for proper LTR portion handling
            const detectedDir = detectTextDirectionFromContent(processedText, targetLanguage);

            // CRITICAL FIX: For RTL text, wrap LTR portions (English words, numbers) in spans with dir="ltr"
            // This prevents repositioning issues like "X" moving in "40% off"
            if (detectedDir === 'rtl') {
              const processedHTML = wrapLTRPortions(processedText, detectedDir);
              // eslint-disable-next-line noUnsanitized/property -- Content is escaped via escapeHtml() in wrapLTRPortions()
              translationSpan.innerHTML = processedHTML;
            } else {
              translationSpan.textContent = processedText;
            }

            // CRITICAL: Don't apply direction to inner - let it inherit from wrapper

            // Add the translation span to the background font, then to wrapper
            backgroundFont.appendChild(translationSpan);
            wrapperSpan.appendChild(backgroundFont);
          } else if (actualNode.nodeType === Node.ELEMENT_NODE && actualNode.hasAttribute('data-segment-id')) {
            // CRITICAL: Preserve original whitespace for proper spacing
            // Extract leading and trailing whitespace from original text
            const leadingWhitespace = originalText.match(/^(\s*)/)[1];
            const trailingWhitespace = originalText.match(/(\s*)$/)[1];

            // Reconstruct text with preserved whitespace
            let finalText = translatedText;
            if (leadingWhitespace && !translatedText.startsWith(' ')) {
              finalText = leadingWhitespace + finalText;
            }
            if (trailingWhitespace && !translatedText.endsWith(' ')) {
              finalText = finalText + trailingWhitespace;
            }

            // CRITICAL: Skip applying if translation is identical to original
            // This prevents unnecessary DOM manipulation and direction changes
            if (finalText === originalText) {
              this.logger.debug(`Skipping streaming translation - identical to original`, {
                segmentId: actualNode.getAttribute('data-segment-id'),
                originalPreview: originalText.substring(0, 30)
              });
              appliedCount++;
              continue;
            }

            // Apply direction based on actual translation content
            const nodeDetectedDir = detectTextDirectionFromContent(finalText, targetLanguage);

            // CRITICAL FIX: For RTL text, wrap LTR portions (English words, numbers) in spans with dir="ltr"
            // This prevents repositioning issues like "X" moving in "40% off"
            if (nodeDetectedDir === 'rtl') {
              const processedHTML = wrapLTRPortions(finalText, nodeDetectedDir);
              // eslint-disable-next-line noUnsanitized/property -- Content is escaped via escapeHtml() in wrapLTRPortions()
              actualNode.innerHTML = processedHTML;
            } else {
              actualNode.textContent = finalText;
            }

            actualNode.setAttribute("dir", nodeDetectedDir);
            // CRITICAL FIX: Add unicode-bidi: isolate to prevent parent dir="auto" from affecting RTL segments with emojis
            actualNode.style.unicodeBidi = "isolate";
            if (targetLanguage) {
              actualNode.setAttribute("lang", targetLanguage);
            }

            // Store original text for potential revert
            if (!actualNode.hasAttribute('data-original-text')) {
              actualNode.setAttribute('data-original-text', originalText);
            }

            appliedCount++;
            appliedNodes.add(actualNode);

            this.logger.debug(`Applied streaming translation to segment element`, {
              matchType: matchType,
              original: originalText.substring(0, 30) + '...',
              translated: translatedText.substring(0, 30) + '...',
              finalText: finalText.substring(0, 30) + '...',
              segmentId: actualNode.getAttribute('data-segment-id')
            });
            continue; // Skip the wrapper replacement logic for ELEMENT_NODE
          }

          // Replace the original node with the wrapper (only for TEXT_NODE)
          const nextElementSibling = actualNode.nextSibling;
          parentElement.removeChild(actualNode);

          if (nextElementSibling) {
            parentElement.insertBefore(wrapperSpan, nextElementSibling);
          } else {
            parentElement.appendChild(wrapperSpan);
          }

          // Store original text for potential revert
          wrapperSpan.setAttribute("data-aiwc-original-text", originalText);

          appliedCount++;
          appliedNodes.add(actualNode);

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

    // CRITICAL FIX: Apply direction correction immediately after streaming batch
    // This ensures text flows correctly while more segments are being translated
    if (appliedCount > 0 && request.element) {
      try {
        await this.uiManager.directionManager.applyStreamingDirection(
          request.element,
          targetLanguage
        );
      } catch (directionError) {
        this.logger.warn('Failed to apply streaming direction correction:', directionError);
        // Don't fail the translation if direction correction fails
      }
    }
  }

  /**
   * Calculate Levenshtein distance between two strings for similarity matching
   * @private
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Levenshtein distance
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
   * @private
   * @param {string} originalText - Original text
   * @param {string} translatedText - Translated text
   * @returns {boolean} Whether the translation appears to be partial
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
   * Cleanup streaming update service
   */
  cleanup() {
    this.logger.debug('StreamingUpdateService cleanup completed');
  }
}
