/**
 * DomTranslatorAdapter - Orchestrator for Select Element translation
 * Coordinates between background services and visual DOM management
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { getTranslationApiAsync, getTargetLanguageAsync } from '@/config.js';
import { AUTO_DETECT_VALUE, TRANSLATION_STATUS } from '@/shared/config/constants.js';
import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { TranslationMode } from '@/shared/config/config.js';
import { MessageContexts, ActionReasons } from '@/shared/messaging/core/MessagingCore.js';
import { registerTranslation, contentScriptIntegration } from '@/shared/messaging/core/ContentScriptIntegration.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { isFatalError } from '@/shared/error-management/ErrorMatcher.js';

import { globalSelectElementState, revertSelectElementTranslation } from './DomTranslatorState.js';
import { collectTextNodes, generateElementId } from './DomTranslatorUtils.js';
import * as DirectionManager from '@/utils/dom/DomDirectionManager.js';

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
    
    // Persistent session ID for the duration of this adapter's life
    // This allows maintaining AI context between multiple translated elements
    this.sessionMessageId = `select-element-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Cache for original settings to avoid frequent storage calls
    this.originalSettings = null;
  }

  async initialize() {
    await this._loadOriginalSettings();
  }

  /**
   * Loads original settings (source/target) from storage once
   */
  async _loadOriginalSettings() {
    const { getSourceLanguageAsync, getTargetLanguageAsync } = await import('@/shared/config/config.js');
    const [source, target] = await Promise.all([
      getSourceLanguageAsync(),
      getTargetLanguageAsync()
    ]);
    this.originalSettings = { source, target };
    this.logger.debug('Original settings loaded:', this.originalSettings);
  }

  /**
   * Main translation method
   */
  async translateElement(element, options = {}) {
    const { onProgress, onComplete, onError } = options;
    this.logger.operation('Starting element translation (one-shot)');

    try {
      this.isTranslating = true;
      if (onProgress) await onProgress({ status: TRANSLATION_STATUS.TRANSLATING, message: 'Translating...' });

      const originalHTML = element.innerHTML;
      const elementId = generateElementId();
      const textNodes = collectTextNodes(element);

      if (textNodes.length === 0) throw new Error('No translatable text found');

      const originalTextNodesData = textNodes.map(node => ({ node, originalText: node.textContent }));
      const textsToTranslate = textNodes.map(node => ({ text: node.textContent.trim() })).filter(item => item.text);

      const [provider, targetLanguage] = await Promise.all([
        options.provider || getTranslationApiAsync(),
        options.targetLanguage || getTargetLanguageAsync()
      ]);

      // Ensure original settings are loaded (fallback)
      if (!this.originalSettings) await this._loadOriginalSettings();

      this.logger.debug('Element translation configuration:', { 
        provider, 
        targetLanguage,
        originalSourceLang: this.originalSettings.source,
        originalTargetLang: this.originalSettings.target
      });

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
            if (data.success === false || data.error) {
              const errorMsg = data.error?.message || (typeof data.error === 'string' ? data.error : 'Unknown update error');
              const errorType = data.error?.type || 'UNKNOWN';
              this.logger.error(`Stream update error: ${errorMsg} (${errorType})`);
              
              // If it's a fatal error, resolve immediately to stop waiting
              const isFatal = isFatalError(data.error);
              
              if (isFatal) {
                resolve({ 
                  success: false, 
                  error: data.error, 
                  errorHandled: false 
                });
              }
              return;
            }

            // ONLY update effectiveTargetLanguage if provided by server AND not explicitly set by user options
            if (!options.targetLanguage && data.targetLanguage && data.targetLanguage !== effectiveTargetLanguage) {
              effectiveTargetLanguage = data.targetLanguage;
              this.logger.debug('Effective target language updated from stream:', effectiveTargetLanguage);
            }

            if (data.data && Array.isArray(data.data)) {
              data.data.forEach((translatedItem) => {
                if (translatedNodeCount < textNodes.length) {
                  const textNode = textNodes[translatedNodeCount];
                  const translatedText = translatedItem?.text || translatedItem || textNode.textContent;

                  // Capture ALL original leading and trailing whitespace (including newlines)
                  const originalText = textNode.textContent;
                  const leadingMatch = originalText.match(/^(\s*)/);
                  const trailingMatch = originalText.match(/(\s*)$/);
                  
                  const leadingWhitespace = leadingMatch ? leadingMatch[1] : '';
                  const trailingWhitespace = trailingMatch ? trailingMatch[1] : '';

                  // Apply translation while preserving full whitespace structure
                  textNode.nodeValue = leadingWhitespace + translatedText + trailingWhitespace;

                  // Apply native auto-direction to parent only once per node
                  // Pass 'element' as the root to ensure the container direction is set early
                  DirectionManager.applyNodeDirection(textNode, effectiveTargetLanguage, element);
                  translatedNodeCount++;
                }
              });
            }
          },
          onStreamEnd: (data) => {
            if (data.cancelled) return resolve({ success: false, cancelled: true });
            
            // If stream ended with error, resolve without marking as handled
            // so the main catch block can show the toast notification
            if (data.success === false || data.error) {
              return resolve({ 
                success: false, 
                error: data.error, 
                errorHandled: false 
              });
            }
            
            // Again, only update if not explicitly set by options
            const finalLang = (!options.targetLanguage && data.targetLanguage) ? data.targetLanguage : effectiveTargetLanguage;
            
            resolve({
              success: true,
              translatedCount: translatedNodeCount,
              targetLanguage: finalLang
            });
          },
          onError: async (error) => {
            // Ignore errors if we are already cleaning up or if the session is no longer active
            if (!this.currentMessageId || error.message === 'Handler cancelled') {
              return;
            }

            await this.errorHandler.handle(error, { context: 'select-element-streaming', showToast: true });
            resolve({ success: false, error: error, errorHandled: true });
          }
        });
      });

      await contentScriptIntegration.initialize();
      
      this.logger.debug('Sending translation request:', {
        messageId,
        nodeCount: textNodes.length,
        payload: textsToTranslate,
        targetLanguage: effectiveTargetLanguage
      });

      // 1. Send initial message
      const response = await sendRegularMessage({
        action: MessageActions.TRANSLATE,
        messageId, 
        data: {
          text: JSON.stringify(textsToTranslate),
          provider,
          sourceLanguage: AUTO_DETECT_VALUE,
          targetLanguage: effectiveTargetLanguage,
          originalSourceLang: this.originalSettings.source,
          originalTargetLang: this.originalSettings.target,
          mode: TranslationMode.Select_Element,
          options: { 
            rawJsonPayload: true,
            enableDictionary: false 
          },
          sessionId: this.sessionMessageId, 
        },
        context: MessageContexts.SELECT_ELEMENT,
      });

      // 2. Decide how to wait for results
      let result;
      if (response?.streaming) {
        this.logger.debug('Response is streaming, waiting for streamEndPromise');
        result = await streamEndPromise;
      } else if (response?.success) {
        this.logger.debug('Response is direct (non-streaming), handling immediately');
        result = await this._handleDirectResponse(response);
      } else {
        this.logger.error('Initial translation request failed', response?.error);
        throw new Error(response?.error || 'Translation failed');
      }

      return await this._finalizeTranslation({
        result, element, elementId, originalTextNodesData, targetLanguage: effectiveTargetLanguage, onComplete
      });

    } catch (error) {
      this.logger.info('Element translation failed', error);

      // Use centralized error handling if not already handled
      if (!error.alreadyHandled) {
        await this.errorHandler.handle(error, {
          context: 'select-element-translation',
          component: 'DomTranslatorAdapter',
          showToast: true
        });
      }

      if (onError) await onError({ status: TRANSLATION_STATUS.ERROR, error });
      throw error;
    } finally {
      // Cleanup with success flag based on whether an error occurred
      this._cleanupCurrentSession(true);
    }
  }

  async _handleDirectResponse(response) {
    try {
      const parsed = JSON.parse(response.translatedText);
      const results = Array.isArray(parsed) ? parsed : [parsed];
      
      // If we got a direct response, we unregister the stream handler 
      // immediately and silently
      if (this.currentMessageId) {
        try {
          contentScriptIntegration.streamingHandler.unregisterHandler(this.currentMessageId);
          this.currentMessageId = null; 
        } catch {
          // Ignore unregistration errors
        }
      }
      
      return { success: true, isNonStreaming: true, translatedResults: results };
    } catch {
      throw new Error('Invalid translation format');
    }
  }

  async _finalizeTranslation({ result, element, elementId, originalTextNodesData, targetLanguage, onComplete }) {
    if (!result?.success) {
      if (result.cancelled) {
        return { success: false, cancelled: true, element };
      }
      
      // Extract error message correctly and preserve error properties for matching
      const errorData = result.error;
      const errorMessage = errorData?.message || (typeof errorData === 'string' ? errorData : ErrorTypes.TRANSLATION_FAILED);
      const error = new Error(errorMessage);
      
      // Copy properties to help ErrorMatcher detect the correct type
      if (errorData && typeof errorData === 'object') {
        Object.assign(error, errorData);
      }
      
      if (result.errorHandled) error.alreadyHandled = true;
      
      throw error;
    }

    // Unregister stream handler on success before finalizing
    if (this.currentMessageId) {
      try {
        contentScriptIntegration.streamingHandler.unregisterHandler(this.currentMessageId);
        this.currentMessageId = null; 
      } catch {
        // Ignore unregistration errors
      }
    }

    const finalTarget = result.targetLanguage || targetLanguage;

    // Apply non-streaming results if needed
    if (result.isNonStreaming) {
      result.translatedResults.forEach((item, i) => {
        if (i < originalTextNodesData.length) {
          const textNode = originalTextNodesData[i].node;
          const translatedText = item?.text || item || textNode.textContent;

          // Capture ALL original leading and trailing whitespace
          const originalText = originalTextNodesData[i].originalText;
          const leadingMatch = originalText.match(/^(\s*)/);
          const trailingMatch = originalText.match(/(\s*)$/);
          
          const leadingWhitespace = leadingMatch ? leadingMatch[1] : '';
          const trailingWhitespace = trailingMatch ? trailingMatch[1] : '';

          // Apply translation while preserving full whitespace structure
          textNode.nodeValue = leadingWhitespace + translatedText + trailingWhitespace;
          
          DirectionManager.applyNodeDirection(textNode, finalTarget, element);
        }
      });
    }

    DirectionManager.applyElementDirection(element, finalTarget);

    // Update target language and mark as no longer partial
    if (globalSelectElementState.currentTranslation) {
      globalSelectElementState.currentTranslation.targetLanguage = finalTarget;
      globalSelectElementState.currentTranslation.partial = false;
    }

    if (onComplete) await onComplete({ status: TRANSLATION_STATUS.COMPLETED, elementId, translated: true });
    return { success: true, elementId, element };
  }

  _storeTranslationState(data) {
    const { element } = data;
    // Add to history with original structural metadata for perfect revert
    globalSelectElementState.translationHistory.push({ 
      ...data, 
      originalDir: element.getAttribute('dir'),
      originalStyleDirection: element.style.direction,
      originalTextAlign: element.style.textAlign,
      originalDataDir: element.getAttribute('data-translate-dir'),
      timestamp: Date.now() 
    });
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
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Cancel ongoing translation
   */
  async cancelTranslation(options = {}) {
    const { silent = false } = options;

    if (this.isTranslating) {
      this.logger.debug(`Cancelling translation (silent: ${silent})`);
      const messageId = this.currentMessageId;

      if (messageId) {
        try {
          // Send cancellation to background
          await sendRegularMessage({
            action: MessageActions.CANCEL_TRANSLATION,
            data: { messageId, reason: ActionReasons.USER_CANCELLED, context: MessageContexts.SELECT_ELEMENT }
          });
          this.logger.debug(`Sent CANCEL_TRANSLATION to background for ${messageId}`);
        } catch (error) {
          this.logger.warn('Failed to send cancellation to background:', error);
        }
      }

      // Stop waiting for stream
      if (this.currentStreamEndReject) {
        const cancelError = new Error(ErrorTypes.USER_CANCELLED);
        if (silent) {
          cancelError.showToast = false;
        }
        this.currentStreamEndReject(cancelError);
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
    this.logger.info('Cleaning up DomTranslatorAdapter session');
    
    // Clear background AI session
    if (this.sessionMessageId) {
      sendRegularMessage({
        action: MessageActions.CANCEL_SESSION,
        data: { sessionId: this.sessionMessageId }
      }).catch(() => {});
    }

    // IMPORTANT: Do NOT revert translations in cleanup. 
    // This is called when switching tabs or deactivating the manager, 
    // and we want to keep already translated parts visible.
    // Revert is only called explicitly by the user via Revert button or ESC.

    super.cleanup();
  }
}

export default DomTranslatorAdapter;
