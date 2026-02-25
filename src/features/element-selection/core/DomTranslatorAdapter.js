/**
 * DomTranslatorAdapter - Orchestrator for Select Element translation
 * Coordinates between background services and visual DOM management
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { getTranslationApiAsync, getTargetLanguageAsync } from '@/config.js';
import { AUTO_DETECT_VALUE } from '@/shared/config/constants.js';
import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { TranslationMode } from '@/shared/config/config.js';
import { registerTranslation, contentScriptIntegration } from '@/shared/messaging/core/ContentScriptIntegration.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';

import { RTL_LANGUAGES } from './DomTranslatorConstants.js';
import { globalSelectElementState, revertSelectElementTranslation } from './DomTranslatorState.js';
import { collectTextNodes, generateElementId } from './DomTranslatorUtils.js';
import * as DirectionManager from './DomDirectionManager.js';

// Export state and revert logic for external use
export { getSelectElementTranslationState, revertSelectElementTranslation } from './DomTranslatorState.js';

export class DomTranslatorAdapter extends ResourceTracker {
  constructor() {
    super('dom-translator-adapter');
    this.logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'DomTranslatorAdapter');
    this.errorHandler = ErrorHandler.getInstance();
    
    this.isTranslating = false;
    this.currentMessageId = null;
    this.currentStreamEndReject = null;
  }

  async initialize() {
    // Initialization handled by ResourceTracker
  }

  /**
   * Main translation method
   */
  async translateElement(element, options = {}) {
    const { onProgress, onComplete, onError } = options;
    this.logger.operation('Starting element translation (one-shot)');

    try {
      this.isTranslating = true;
      if (onProgress) await onProgress({ status: 'translating', message: 'Translating...' });

      const originalHTML = element.innerHTML;
      const elementId = generateElementId();
      const textNodes = collectTextNodes(element);

      if (textNodes.length === 0) throw new Error('No translatable text found');

      const originalTextNodesData = textNodes.map(node => ({ node, originalText: node.textContent }));
      const textsToTranslate = textNodes.map(node => ({ text: node.textContent.trim() })).filter(item => item.text);

      const provider = await getTranslationApiAsync();
      const targetLanguage = await getTargetLanguageAsync();

      // IMPORTANT: Store state BEFORE translation starts.
      // This allows Revert to work even if an error occurs during streaming
      // after some nodes have already been modified.
      this._storeTranslationState({ 
        element, 
        elementId, 
        originalHTML, 
        originalTextNodesData, 
        targetLanguage,
        partial: true // Initially mark as partial
      });

      const messageId = `select-element-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      this.currentMessageId = messageId;
      let translatedNodeCount = 0;
      let effectiveTargetLanguage = targetLanguage;

      const streamEndPromise = new Promise((resolve, reject) => {
        this.currentStreamEndReject = reject;
        registerTranslation(messageId, {
          onStreamUpdate: (data) => {
            if (data.targetLanguage && data.targetLanguage !== effectiveTargetLanguage) {
              effectiveTargetLanguage = data.targetLanguage;
            }

            if (data.data && Array.isArray(data.data)) {
              data.data.forEach((translatedItem) => {
                if (translatedNodeCount < textNodes.length) {
                  const textNode = textNodes[translatedNodeCount];
                  const translatedText = translatedItem?.text || translatedItem || textNode.textContent;

                  // Preserve whitespace and apply text
                  const hasLeading = /^\s/.test(textNode.textContent);
                  const hasTrailing = /\s$/.test(textNode.textContent);
                  textNode.nodeValue = (hasLeading ? ' ' : '') + translatedText + (hasTrailing ? ' ' : '');

                  // Visual Direction Management
                  DirectionManager.applyNodeDirection(textNode, effectiveTargetLanguage);
                  translatedNodeCount++;
                }
              });
            }
          },
          onStreamEnd: (data) => {
            if (data.cancelled) return resolve({ success: false, cancelled: true });
            if (data.success === false) return resolve({ success: false, error: data.error, errorHandled: true });
            
            resolve({
              success: true,
              translatedCount: translatedNodeCount,
              targetLanguage: data.targetLanguage || effectiveTargetLanguage
            });
          },
          onError: async (error) => {
            // Ignore errors if we are already cleaning up or if the session is no longer active
            if (!this.currentMessageId || error.message === 'Handler cancelled') {
              return;
            }

            await this.errorHandler.handle(error, { context: 'select-element-streaming', showToast: true });
            resolve({ success: false, error: error.message, errorHandled: true });
          }
        });
      });

      await contentScriptIntegration.initialize();
      const directResponsePromise = sendRegularMessage({
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
      });

      const result = await Promise.race([
        directResponsePromise.then(res => (!res?.streaming && res?.success) ? this._handleDirectResponse(res, textNodes) : streamEndPromise),
        streamEndPromise
      ]);

      return await this._finalizeTranslation({
        result, element, elementId, originalHTML, originalTextNodesData, targetLanguage: effectiveTargetLanguage, onComplete
      });

    } catch (error) {
      if (onError) await onError({ status: 'error', error });
      throw error;
    } finally {
      // Cleanup with success flag based on whether an error occurred
      this._cleanupCurrentSession(true);
    }
  }

  async _handleDirectResponse(response, textNodes) {
    try {
      const parsed = JSON.parse(response.translatedText);
      const results = Array.isArray(parsed) ? parsed : [parsed];
      
      // If we got a direct response, we unregister the stream handler 
      // immediately and silently
      if (this.currentMessageId) {
        try {
          contentScriptIntegration.streamingHandler.unregisterHandler(this.currentMessageId);
          this.currentMessageId = null; 
        } catch (e) {}
      }
      
      return { success: true, isNonStreaming: true, translatedResults: results };
    } catch (e) {
      throw new Error('Invalid translation format');
    }
  }

  async _finalizeTranslation({ result, element, elementId, originalHTML, originalTextNodesData, targetLanguage, onComplete }) {
    if (!result?.success) {
      if (result.cancelled) {
        return { success: false, cancelled: true, element };
      }
      throw new Error(result.error || 'Translation failed');
    }

    // Unregister stream handler on success before finalizing
    if (this.currentMessageId) {
      try {
        contentScriptIntegration.streamingHandler.unregisterHandler(this.currentMessageId);
        this.currentMessageId = null; 
      } catch (e) {}
    }

    const finalTarget = result.targetLanguage || targetLanguage;

    // Apply non-streaming results if needed
    if (result.isNonStreaming) {
      result.translatedResults.forEach((item, i) => {
        if (i < originalTextNodesData.length) {
          const textNode = originalTextNodesData[i].node;
          textNode.nodeValue = item?.text || item || textNode.textContent;
          DirectionManager.applyNodeDirection(textNode, finalTarget);
        }
      });
    }

    DirectionManager.applyDirection(element, finalTarget);

    // Update target language and mark as no longer partial
    if (globalSelectElementState.currentTranslation) {
      globalSelectElementState.currentTranslation.targetLanguage = finalTarget;
      globalSelectElementState.currentTranslation.partial = false;
    }

    if (onComplete) await onComplete({ status: 'completed', elementId, translated: true });
    return { success: true, elementId, element };
  }

  _storeTranslationState(data) {
    // Add to history instead of overwriting
    globalSelectElementState.translationHistory.push({ ...data, timestamp: Date.now() });
  }

  _cleanupCurrentSession(isSuccess = false) {
    const messageId = this.currentMessageId;
    
    // Clear state
    this.isTranslating = false;
    this.currentMessageId = null;
    this.currentStreamEndReject = null;

    if (messageId) {
      try { 
        if (isSuccess) {
          // Silent removal on success
          contentScriptIntegration.streamingHandler.unregisterHandler(messageId); 
        } else {
          // Force stop on error or cancellation
          contentScriptIntegration.streamingHandler.cancelHandler(messageId);
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Cancel ongoing translation
   */
  async cancelTranslation() {
    if (this.isTranslating) {
      this.logger.debug('Cancelling translation');
      const messageId = this.currentMessageId;

      if (messageId) {
        try {
          // Send cancellation to background
          await sendRegularMessage({
            action: MessageActions.CANCEL_TRANSLATION,
            data: { messageId, reason: 'user_cancelled', context: 'select-element' }
          });
          this.logger.debug(`Sent CANCEL_TRANSLATION to background for ${messageId}`);
        } catch (error) {
          this.logger.warn('Failed to send cancellation to background:', error);
        }
      }

      // Stop waiting for stream
      if (this.currentStreamEndReject) {
        this.currentStreamEndReject(new Error('Translation cancelled by user'));
        this.currentStreamEndReject = null;
      }

      this._cleanupCurrentSession(false);
    }
  }

  /**
   * Check if currently translating
   * @returns {boolean}
   */
  isCurrentlyTranslating() {
    return this.isTranslating;
  }

  /**
   * Get current translation state (last in history)
   * @returns {Object|null}
   */
  getCurrentTranslation() {
    const history = globalSelectElementState.translationHistory;
    return history && history.length > 0 ? history[history.length - 1] : null;
  }

  /**
   * Get all translations in history
   * @returns {Array}
   */
  getAllTranslations() {
    return globalSelectElementState.translationHistory || [];
  }

  async revertTranslation() {
    return await revertSelectElementTranslation();
  }

  hasTranslation() {
    const history = globalSelectElementState.translationHistory;
    return history && history.length > 0;
  }

  async cleanup() {
    if (this.hasTranslation()) await this.revertTranslation();
    super.cleanup();
  }
}

export default DomTranslatorAdapter;
