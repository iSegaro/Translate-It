// DomTranslatorAdapter - Simplified adapter for Select Element translation
// Uses one-shot translation instead of recursive node processing

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { getTranslationApiAsync, getTargetLanguageAsync } from '@/config.js';
import { AUTO_DETECT_VALUE } from '@/shared/config/constants.js';
import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { TranslationMode } from '@/shared/config/config.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { registerTranslation, contentScriptIntegration } from '@/shared/messaging/core/ContentScriptIntegration.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';

/**
 * RTL language codes for automatic direction detection
 */
const RTL_LANGUAGES = new Set([
  'ar', 'he', 'fa', 'ur', 'yi', 'ps', 'sd', 'ckb', 'dv', 'ug',
  'ae', 'arc', 'xh', 'zu'
]);

/**
 * Tags that are safe to apply RTL direction without breaking layout
 */
const TEXT_TAGS = new Set([
  'P', 'SPAN', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'A', 
  'TD', 'TH', 'DT', 'DD', 'LABEL', 'CAPTION', 'Q', 'CITE', 
  'SMALL', 'STRONG', 'EM', 'B', 'I', 'U', 'S', 'BUTTON',
  'INPUT', 'TEXTAREA'
]);

/**
 * Global translation state for Select Element mode
 * This persists even when SelectElementManager is deactivated
 * so ESC key revert can work properly
 */
const globalSelectElementState = {
  currentTranslation: null,
  isTranslating: false,
};

// Make it available globally for RevertHandler access
if (typeof window !== 'undefined') {
  window.__selectElementTranslationState__ = globalSelectElementState;
}

/**
 * Get the global Select Element translation state
 * @returns {Object} Global state object
 */
export function getSelectElementTranslationState() {
  return globalSelectElementState;
}

/**
 * Adapter class that provides one-shot translation for Select Element mode
 * Simplified from domtranslator library usage - no recursive node processing
 */
export class DomTranslatorAdapter extends ResourceTracker {
  constructor() {
    super('dom-translator-adapter');

    this.logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'DomTranslatorAdapter');

    // Use global state instead of instance state
    this.isTranslating = false;

    // Track current translation info for cancellation
    this.currentMessageId = null;
    this.currentStreamEndReject = null;

    // Centralized error handler
    this.errorHandler = ErrorHandler.getInstance();
  }

  /**
   * Initialize the adapter
   */
  async initialize() {
    // Initialization is handled by ResourceTracker
  }

  /**
   * Translate text content using one-shot translation
   * @param {HTMLElement} element - Element to translate
   * @param {Object} options - Translation options
   * @returns {Promise<Object>} Translation result
   */
  async translateElement(element, options = {}) {
    const {
      onProgress = null,
      onComplete = null,
      onError = null,
    } = options;

    this.logger.operation('Starting element translation (one-shot)');

    // Accumulated translation results from streaming batches
    let accumulatedTranslations = [];
    let streamEndResolve = null;
    let streamEndReject = null;

    // Flag to track if error was already handled in streaming callback
    // Must be declared outside try block so catch can access it
    let errorHandledInStream = false;

    try {
      this.isTranslating = true;

      // Notify translation start
      if (onProgress) {
        await onProgress({ status: 'translating', message: 'Translating...' });
      }

      // Store original state before translation
      const originalHTML = element.innerHTML;
      const elementId = this._generateElementId();

      // Collect all text nodes within the element
      const textNodes = this._collectTextNodes(element);

      if (textNodes.length === 0) {
        this.logger.warn('No text content found in element');
        throw new Error('No translatable text found in element');
      }

      this.logger.debug('Collected text nodes for translation:', {
        count: textNodes.length,
      });

      // Store original text BEFORE translation for revert
      const originalTextNodesData = textNodes.map(node => ({
        node,
        originalText: node.textContent
      }));

      // Prepare texts for batch translation
      const textsToTranslate = textNodes.map(node => ({
        text: node.textContent.trim()
      })).filter(item => item.text);

      if (textsToTranslate.length === 0) {
        this.logger.warn('No translatable text after filtering');
        throw new Error('No translatable text found in element');
      }

      this.logger.debug('Prepared texts for translation:', {
        count: textsToTranslate.length,
        preview: textsToTranslate.map(t => t.text.substring(0, 30)).join(' | '),
      });

      // Get provider and target language
      const provider = await getTranslationApiAsync();
      const targetLanguage = await getTargetLanguageAsync();
      const isTargetRTL = RTL_LANGUAGES.has(targetLanguage.toLowerCase().split('-')[0]);

      // Generate message ID for this request
      const messageId = `select-element-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Store for cancellation
      this.currentMessageId = messageId;

      // Track how many text nodes have been translated so far
      let translatedNodeCount = 0;

      // Create a promise that resolves when stream ends
      const streamEndPromise = new Promise((resolve, reject) => {
        streamEndResolve = resolve;
        streamEndReject = reject;
        // Store reject function for cancellation
        this.currentStreamEndReject = reject;
      });

      // Register stream handlers with ContentScriptIntegration
      await contentScriptIntegration.initialize();

      registerTranslation(messageId, {
        onStreamUpdate: (data) => {
          // Debug log to see what we receive
          this.logger.debug('onStreamUpdate called with data:', {
            hasData: !!data,
            keys: data ? Object.keys(data) : 'none',
            hasDataData: !!data?.data,
            dataDataIsArray: Array.isArray(data?.data),
            dataDataLength: data?.data?.length,
          });

          // Apply translations immediately as each batch arrives
          // data.data contains the batchResults from StreamingManager
          if (data.data && Array.isArray(data.data)) {
            this.logger.debug(`Received translation batch: ${data.data.length} items`);

            // Apply each translation immediately to the corresponding text node
            data.data.forEach((translatedItem) => {
              if (translatedNodeCount < textNodes.length) {
                const textNode = textNodes[translatedNodeCount];
                const originalText = textNode.textContent.trim();

                if (originalText) {
                  const translatedText = translatedItem?.text || translatedItem || originalText;

                  // Preserve leading/trailing whitespace
                  const hasLeadingSpace = /^\s/.test(textNode.textContent);
                  const hasTrailingSpace = /\s$/.test(textNode.textContent);

                  let finalText = translatedText;
                  if (hasLeadingSpace) finalText = ' ' + finalText;
                  if (hasTrailingSpace) finalText = finalText + ' ';

                  textNode.nodeValue = finalText;

                  // Apply RTL IMMEDIATELY to this specific node's parent if it's a text tag
                  // This prevents flicker without affecting the main container structure
                  if (isTargetRTL) {
                    const parent = textNode.parentElement;
                    if (parent && TEXT_TAGS.has(parent.tagName) && parent.children.length === 0) {
                      parent.setAttribute('dir', 'rtl');
                    }
                  }
                }

                translatedNodeCount++;
              }
            });

            this.logger.debug(`Applied ${data.data.length} translations, total: ${translatedNodeCount}/${textNodes.length}`);

            // Also accumulate for final validation
            accumulatedTranslations.push(...data.data);
          }
        },
        onStreamEnd: async (data) => {
          // Stream end signals completion
          this.logger.debug(`Stream ended with ${translatedNodeCount}/${textNodes.length} translations applied`, data);

          // Check if stream was cancelled by user
          if (data.cancelled) {
            this.logger.debug('Stream was cancelled by user:', data.reason);
            errorHandledInStream = true;

            // Use the cancellation reason as error message
            const errorMessage = data.reason || 'Translation cancelled by user';
            const error = new Error(errorMessage);
            error.type = 'USER_CANCELLED';

            // Don't show notification for user cancellation - it's expected behavior
            // Just resolve with cancellation info
            streamEndResolve({
              success: false,
              error: errorMessage,
              errorHandled: true,
              cancelled: true
            });
            return;
          }

          // Check if stream ended with an error
          if (data.success === false || data.error) {
            this.logger.error('Stream ended with error:', data.error);
            errorHandledInStream = true;

            // Extract error message and type from data
            let errorMessage = 'Translation failed';
            let errorType = 'STREAMING_ERROR';

            if (typeof data.error === 'string') {
              errorMessage = data.error;
            } else if (data.error?.message) {
              errorMessage = data.error.message;
              errorType = data.error.type || errorType;
            } else if (data.error) {
              // error is a truthy value but not an object (fallback)
              errorMessage = String(data.error);
            }

            // Create proper error object
            const error = new Error(errorMessage);
            error.type = errorType;

            this.logger.debug('Extracted error from stream end:', { errorMessage, errorType, originalData: data });

            // Use centralized error handling
            await this.errorHandler.handle(error, {
              context: 'select-element-streaming',
              component: 'DomTranslatorAdapter',
              showToast: true,
              showInUI: false
            });

            // Resolve with failure
            streamEndResolve({
              success: false,
              error: errorMessage,
              errorHandled: true
            });
          } else {
            // Stream completed successfully
            streamEndResolve({
              success: true,
              translatedCount: translatedNodeCount,
              totalCount: textNodes.length,
            });
          }
        },
        onError: async (error) => {
          this.logger.error('Stream error', error);
          // Mark error as handled in streaming callback
          errorHandledInStream = true;
          // Use centralized error handling
          await this.errorHandler.handle(error, {
            context: 'select-element-streaming',
            component: 'DomTranslatorAdapter',
            showToast: true,
            showInUI: false
          });
          // Resolve with failure instead of rejecting - error already handled above
          streamEndResolve({
            success: false,
            error: error.message || String(error),
            errorHandled: true // Flag to indicate error was already handled
          });
        }
      });

      // Send batch translation request
      const translationRequest = {
        action: MessageActions.TRANSLATE,
        messageId,
        data: {
          text: JSON.stringify(textsToTranslate),
          provider,
          sourceLanguage: AUTO_DETECT_VALUE,
          targetLanguage,
          mode: TranslationMode.Select_Element,
          options: { rawJsonPayload: true },
        },
        context: 'select-element',
      };

      // Send the request and handle both streaming and non-streaming responses
      const directResponsePromise = sendRegularMessage(translationRequest);

      // Wait for either direct response (non-streaming) or stream end (streaming)
      const result = await Promise.race([
        directResponsePromise.then(response => {
          // If we get a complete translation response (non-streaming), use it
          if (response?.success && response?.translatedText && !response?.streaming) {
            this.logger.debug('Received direct (non-streaming) translation response');
            // Parse and return as stream-compatible format
            try {
              const parsed = JSON.parse(response.translatedText);
              return {
                success: true,
                isNonStreaming: true,
                translatedResults: Array.isArray(parsed) ? parsed : [parsed],
              };
            } catch (error) {
              this.logger.error('Failed to parse non-streaming response:', error);
              throw new Error('Invalid translation response format');
            }
          }
          // If streaming=true, wait for stream end promise
          return streamEndPromise;
        }),
        streamEndPromise
      ]);

      if (!result?.success) {
        // Check if translation was cancelled by user
        if (result.cancelled) {
          this.logger.debug('Translation was cancelled by user, preserving partial translations for revert');

          // Store partial translation state for revert - user might want to undo what was translated
          globalSelectElementState.currentTranslation = {
            elementId,
            element,
            originalHTML,  // Keep for full fallback
            originalTextNodes: originalTextNodesData,  // Use original data saved before translation
            targetLanguage,
            timestamp: Date.now(),
            partial: true,  // Mark as partial translation
            translatedCount: translatedNodeCount,  // How many nodes were actually translated
          };

          // Don't throw error - just return early to avoid error notification
          return {
            success: false,
            cancelled: true,
            element,
          };
        }

        // If error was already handled in streaming callback, we still need to throw
        // so that startTranslation can perform cleanup (dismiss notification, etc.)
        // Mark the error as already handled to prevent duplicate notifications
        if (result.errorHandled) {
          const error = new Error(result.error || 'Translation failed');
          error.alreadyHandled = true;
          this.logger.debug('Error already handled in streaming callback, throwing for cleanup');
          throw error;
        }
        // Otherwise throw for non-streaming errors
        throw new Error(result?.error || 'Translation failed');
      }

      // Handle non-streaming response - apply all translations at once
      if (result.isNonStreaming && result.translatedResults) {
        const translatedTexts = result.translatedResults;

        this.logger.debug('Applying non-streaming translations:', {
          count: translatedTexts.length,
          preview: translatedTexts.map(t => (t?.text || t)?.substring(0, 30)).join(' | '),
        });

        // Apply each translation
        translatedTexts.forEach((translatedItem, index) => {
          if (index < textNodes.length) {
            const textNode = textNodes[index];
            const originalText = textNode.textContent.trim();

            if (originalText) {
              const translatedText = translatedItem?.text || translatedItem || originalText;

              // Preserve leading/trailing whitespace
              const hasLeadingSpace = /^\s/.test(textNode.textContent);
              const hasTrailingSpace = /\s$/.test(textNode.textContent);

              let finalText = translatedText;
              if (hasLeadingSpace) finalText = ' ' + finalText;
              if (hasTrailingSpace) finalText = finalText + ' ';

              textNode.nodeValue = finalText;

              // Apply RTL to this specific node's parent if it's a text tag
              if (RTL_LANGUAGES.has(targetLanguage.toLowerCase().split('-')[0])) {
                const parent = textNode.parentElement;
                if (parent && TEXT_TAGS.has(parent.tagName) && parent.children.length === 0) {
                  parent.setAttribute('dir', 'rtl');
                }
              }
            }
          }
        });
      }

      // Apply direction attribute based on target language
      this._applyDirectionToElement(element, targetLanguage);

      // Store translation state for revert
      globalSelectElementState.currentTranslation = {
        elementId,
        element,
        originalHTML,  // Keep for full fallback
        originalTextNodes: originalTextNodesData,  // Use original data saved before translation
        targetLanguage,
        timestamp: Date.now(),
      };

      this.logger.info('Element translation completed', {
        elementId,
        targetLanguage,
        translatedCount: result.isNonStreaming ? result.translatedResults?.length : result.translatedCount,
        totalCount: result.isNonStreaming ? result.translatedResults?.length : result.totalCount,
        isRTL: RTL_LANGUAGES.has(targetLanguage.toLowerCase().split('-')[0]),
      });

      // Notify completion
      if (onComplete) {
        await onComplete({
          status: 'completed',
          elementId,
          translated: true,
        });
      }

      return {
        success: true,
        elementId,
        element,
        originalHTML,
      };
    } catch (error) {
      this.logger.error('Element translation failed', error);

      // Only handle error if it wasn't already handled in streaming callback
      if (!errorHandledInStream) {
        // Use centralized error handling
        await this.errorHandler.handle(error, {
          context: 'select-element-translation',
          component: 'DomTranslatorAdapter',
          showToast: true,
          showInUI: false
        });
      }

      // Notify error
      if (onError) {
        await onError({ status: 'error', error });
      }

      throw error;
    } finally {
      this.isTranslating = false;
      this.currentMessageId = null;
      this.currentStreamEndReject = null;
      accumulatedTranslations = [];
      streamEndResolve = null;
      streamEndReject = null;
      errorHandledInStream = false;
    }
  }

  /**
   * Revert the last translation
   * @returns {Promise<boolean>} Success status
   */
  async revertTranslation() {
    if (!globalSelectElementState.currentTranslation) {
      this.logger.debug('No translation to revert');
      return false;
    }

    try {
      const { element, originalHTML, originalTextNodes } = globalSelectElementState.currentTranslation;

      if (originalTextNodes && originalTextNodes.length > 0) {
        // Restore each text node individually
        originalTextNodes.forEach(({ node, originalText }) => {
          // Check if node is still in DOM
          if (node.parentNode) {
            node.nodeValue = originalText;
          }
        });

        this.logger.info('Text nodes restored', {
          count: originalTextNodes.length
        });
      } else if (originalHTML && element) {
        // Fallback to full HTML restore
        // eslint-disable-next-line noUnsanitized/property
        element.innerHTML = originalHTML;
      }

      // Remove direction attributes from the element and all its text children
      element.removeAttribute('dir');
      element.removeAttribute('data-translate-dir');
      
      const childTextElements = element.querySelectorAll(Array.from(TEXT_TAGS).join(','));
      childTextElements.forEach(child => child.removeAttribute('dir'));

      // Hide translation overlay via event bus
      pageEventBus.emit('hide-translation', { element });

      this.logger.info('Translation reverted', {
        elementId: globalSelectElementState.currentTranslation.elementId,
      });

      globalSelectElementState.currentTranslation = null;
      return true;
    } catch (error) {
      this.logger.error('Failed to revert translation', error);
      return false;
    }
  }

  /**
   * Apply direction attribute based on target language
   * @param {HTMLElement} element - Element to apply direction to
   * @param {string} targetLanguage - Target language code
   */
  _applyDirectionToElement(element, targetLanguage) {
    const langCode = targetLanguage.toLowerCase().split('-')[0];
    const isRTL = RTL_LANGUAGES.has(langCode);

    if (!isRTL) {
      element.setAttribute('dir', 'ltr');
      element.setAttribute('data-translate-dir', 'ltr');
      return;
    }

    // Surgical RTL application ONLY:
    // 1. Apply to the root element ONLY if it's a safe text tag and a leaf
    const isLeaf = element.children.length === 0;
    if (isLeaf && TEXT_TAGS.has(element.tagName)) {
      element.setAttribute('dir', 'rtl');
    }

    // 2. Apply to all child text tags that might contain translated text
    const childTextElements = element.querySelectorAll(Array.from(TEXT_TAGS).join(','));
    childTextElements.forEach(child => {
      // Only apply to children that are either leaves or have very simple structure
      if (child.children.length === 0) {
        child.setAttribute('dir', 'rtl');
      }
    });

    element.setAttribute('data-translate-dir', 'rtl');

    this.logger.debug('Applied surgical direction to element', {
      langCode,
      isRTL,
      tagName: element.tagName
    });
  }

  /**
   * Generate unique element ID
   * @returns {string} Unique ID
   */
  _generateElementId() {
    return `element-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Collect all text nodes within an element
   * @param {HTMLElement} element - Root element
   * @returns {Text[]} Array of text nodes
   */
  _collectTextNodes(element) {
    const textNodes = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        // Skip certain element types
        const tagName = parent.tagName;
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME'].includes(tagName)) {
          return NodeFilter.FILTER_REJECT;
        }

        // Check visibility
        try {
          const style = window.getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT;
          }
        } catch {
          // If getComputedStyle fails, accept the node
        }

        // Accept nodes with non-whitespace content
        return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });

    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }

    this.logger.debug(`Collected ${textNodes.length} text nodes for translation`);

    return textNodes;
  }

  /**
   * Check if currently translating
   * @returns {boolean} Translation status
   */
  isCurrentlyTranslating() {
    return this.isTranslating;
  }

  /**
   * Check if there's a translation to revert
   * @returns {boolean} Has translation state
   */
  hasTranslation() {
    return globalSelectElementState.currentTranslation !== null;
  }

  /**
   * Get current translation state
   * @returns {Object|null} Current translation state
   */
  getCurrentTranslation() {
    return globalSelectElementState.currentTranslation;
  }

  /**
   * Cancel ongoing translation
   */
  async cancelTranslation() {
    if (this.isTranslating) {
      this.logger.debug('Cancelling translation');

      const messageId = this.currentMessageId;

      // Step 1: Send cancellation to background to stop actual translation
      // This must be done BEFORE rejecting the stream promise
      if (messageId) {
        try {
          const { sendMessage } = await import('@/shared/messaging/core/UnifiedMessaging.js');
          const { MessageActions } = await import('@/shared/messaging/core/MessageActions.js');

          await sendMessage({
            action: MessageActions.CANCEL_TRANSLATION,
            data: {
              messageId,
              reason: 'user_cancelled',
              context: 'select-element'
            }
          });

          this.logger.debug(`Sent CANCEL_TRANSLATION to background for ${messageId}`);
        } catch (error) {
          this.logger.warn('Failed to send cancellation to background:', error);
        }
      }

      // Step 2: Reject the stream promise to stop waiting
      if (this.currentStreamEndReject) {
        this.currentStreamEndReject(new Error('Translation cancelled by user'));
        this.currentStreamEndReject = null;
      }

      // Step 3: Cancel the streaming handler to stop processing further updates
      if (messageId) {
        try {
          const { contentScriptIntegration } = await import('@/shared/messaging/core/ContentScriptIntegration.js');
          contentScriptIntegration.streamingHandler.cancelHandler(messageId);
          this.logger.debug(`Cancelled streaming handler for ${messageId}`);
        } catch (error) {
          this.logger.warn('Failed to cancel streaming handler:', error);
        }
        this.currentMessageId = null;
      }

      this.isTranslating = false;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    // Revert any active translation
    if (this.hasTranslation()) {
      await this.revertTranslation();
    }

    // Clear references
    globalSelectElementState.currentTranslation = null;

    // Use ResourceTracker cleanup
    super.cleanup();
  }
}

/**
 * Global function to revert Select Element translation
 * This can be called from RevertHandler even when SelectElementManager is deactivated
 * @returns {Promise<boolean>} Success status
 */
export async function revertSelectElementTranslation() {
  const state = getSelectElementTranslationState();

  if (!state.currentTranslation) {
    return false;
  }

  try {
    const { element, originalHTML, originalTextNodes } = state.currentTranslation;

    if (originalTextNodes && originalTextNodes.length > 0) {
      // Restore each text node individually
      originalTextNodes.forEach(({ node, originalText }) => {
        // Check if node is still in DOM
        if (node.parentNode) {
          node.nodeValue = originalText;
        }
      });

      const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'GlobalRevert');
      logger.info('Text nodes restored via global function', {
        count: originalTextNodes.length
      });
    } else if (originalHTML && element) {
      // Fallback to full HTML restore
      // eslint-disable-next-line noUnsanitized/property
      element.innerHTML = originalHTML;
    }

    // Remove direction attributes from the element and all its text children
    element.removeAttribute('dir');
    element.removeAttribute('data-translate-dir');
    
    const childTextElements = element.querySelectorAll(Array.from(TEXT_TAGS).join(','));
    childTextElements.forEach(child => child.removeAttribute('dir'));

    // Hide translation overlay via event bus
    pageEventBus.emit('hide-translation', { element });

    // Clear state
    state.currentTranslation = null;

    return true;
  } catch (error) {
    const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'GlobalRevert');
    logger.error('Failed to revert translation via global function', error);
    return false;
  }
}

export default DomTranslatorAdapter;
