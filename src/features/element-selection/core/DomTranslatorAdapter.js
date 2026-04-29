/**
 * DomTranslatorAdapter - Specialized Orchestrator for "Select Element" Translation.
 * 
 * NOTE: This is NOT a wrapper for the 'DomTranslator' library used in Whole Page Translation.
 * It is a custom, high-performance implementation specifically engineered for surgical 
 * element selection.
 * 
 * Key Advantages over general library:
 * 1. AI/DeepL Context Injection: Automatically gathers headings and metadata to improve LLM accuracy.
 * 2. Structural Block Batching: Groups text nodes by semantic blocks (P, DIV) to prevent sentence fragmentation.
 * 3. Token Optimization: Uses an abbreviated JSON protocol (t, i, b, r) saving ~75% overhead.
 * 4. Resilient UID Mapping: Ensures 1:1 text node restoration even with asynchronous streaming updates.
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { 
  getTranslationApiAsync, 
  getTargetLanguageAsync, 
  getAIContextTranslationEnabledAsync,
  getSourceLanguageAsync
} from '@/config.js';
import { AUTO_DETECT_VALUE, TRANSLATION_STATUS } from '@/shared/config/constants.js';
import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { TranslationMode } from '@/shared/config/config.js';
import { MessageContexts, ActionReasons } from '@/shared/messaging/core/MessagingCore.js';
import { registerTranslation, contentScriptIntegration } from '@/shared/messaging/core/ContentScriptIntegration.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { isFatalError, matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';

import { globalSelectElementState, revertSelectElementTranslation } from './DomTranslatorState.js';
import { collectTextNodes, generateElementId, extractContextMetadata } from './DomTranslatorUtils.js';
import * as DirectionManager from '@/utils/dom/DomDirectionManager.js';

// Import hover manager dependencies
import { hoverPreviewLookup } from '@/features/shared/hover-preview/HoverPreviewLookup.js';
import { PAGE_TRANSLATION_ATTRIBUTES } from '@/features/page-translation/PageTranslationConstants.js';

// Export state and revert logic for external use
export { getSelectElementTranslationState, revertSelectElementTranslation } from './DomTranslatorState.js';

/**
 * Specialized adapter that coordinates between background services and visual DOM management.
 * Designed for low-latency, high-precision translation of specific DOM branches.
 */
export class DomTranslatorAdapter extends ResourceTracker {
  constructor() {
    super('dom-translator-adapter');
    this.logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'DomTranslatorAdapter');
    this.errorHandler = ErrorHandler.getInstance();
    
    this.isTranslating = false;
    this.currentMessageId = null;
    this.currentStreamEndReject = null;
    
    // Persistent session ID for the duration of this adapter's life
    this.sessionMessageId = `s${Math.random().toString(36).substr(2, 6)}`;

    // Cache for original settings
    this.originalSettings = null;
  }

  async initialize() {
    await this._loadOriginalSettings();
  }

  /**
   * Loads original settings from storage
   */
  async _loadOriginalSettings() {
    const [source, target] = await Promise.all([
      getSourceLanguageAsync(),
      getTargetLanguageAsync()
    ]);
    this.originalSettings = { source, target };
  }

  /**
   * Main translation method
   */
  async translateElement(element, options = {}) {
    const { onProgress, onComplete, onError } = options;
    this.logger.operation('Starting element translation');

    try {
      this.isTranslating = true;
      if (onProgress) await onProgress({ status: TRANSLATION_STATUS.TRANSLATING, message: 'Translating...' });

      const originalHTML = element.innerHTML;
      const elementId = generateElementId();
      
      // 1. Collect all valid text nodes
      const textNodesData = collectTextNodes(element);
      if (textNodesData.length === 0) throw new Error('No translatable text found');

      // 2. Prepare payload - CRITICAL: Must be 1:1 mapping with textNodesData
      // Use abbreviated keys to save tokens: t=text, i=uid, b=blockId, r=role
      const textsToTranslate = textNodesData.map(data => ({ 
        t: data.text || '',
        i: data.uid,
        b: data.blockId,
        r: data.role
      }));

      const nodeMap = new Map();
      textNodesData.forEach(data => nodeMap.set(data.uid, data));

      // Context
      const contextMetadata = extractContextMetadata(element);
      const contextSummary = contextMetadata.contextSummary; // Extract the summary
      const isAIContextEnabled = await getAIContextTranslationEnabledAsync();

      const [provider, targetLanguage] = await Promise.all([
        options.provider || getTranslationApiAsync(),
        options.targetLanguage || getTargetLanguageAsync()
      ]);

      if (!this.originalSettings) await this._loadOriginalSettings();

      // Store state BEFORE translation
      this._storeTranslationState({ 
        element, 
        elementId, 
        originalHTML, 
        originalTextNodesData: textNodesData.map(d => ({ node: d.node, originalText: d.text })), 
        targetLanguage,
        partial: true
      });

      const messageId = `m${Math.random().toString(36).substr(2, 6)}`;
      this.currentMessageId = messageId;
      let effectiveTargetLanguage = targetLanguage;
      
      // Tracking processed nodes to avoid multi-batch conflicts
      const processedUids = new Set();
      let lastProcessedIndex = 0;

      // ELIMINATE UNCAUGHT PROMISE ERRORS: Use resolve-only pattern for the stream promise
      const streamEndPromise = new Promise((resolve) => {
        let isSettled = false;

        const safeResolve = (val) => {
          if (isSettled) return;
          isSettled = true;
          resolve(val);
        };

        registerTranslation(messageId, {
          onStreamUpdate: (data) => {
            if (isSettled) return;
            try {
              if (data.success === false || data.error) {
                if (isFatalError(data.error)) {
                  const errObj = typeof data.error === 'object' ? data.error : { message: data.error, type: matchErrorToType(data.error) };
                  const error = new Error(errObj.message || 'Fatal error');
                  Object.assign(error, errObj);
                  error.isFatal = true;
                  safeResolve({ success: false, error }); // Resolve with error data
                }
                return;
              }

              if (!options.targetLanguage && data.targetLanguage && data.targetLanguage !== effectiveTargetLanguage) {
                effectiveTargetLanguage = data.targetLanguage;
              }

              if (data.data && Array.isArray(data.data)) {
                data.data.forEach((translatedItem, index) => {
                  // Handle both abbreviated and full keys for backward compatibility
                  const uid = translatedItem?.i || translatedItem?.uid || (data.originalData && (data.originalData[index]?.i || data.originalData[index]?.uid));
                  
                  let nodeData = null;
                  if (uid) {
                    nodeData = nodeMap.get(uid);
                  } 
                  
                  // Fallback to sequential index ONLY if UID mapping fails or is missing
                  if (!nodeData) {
                    nodeData = textNodesData[lastProcessedIndex++];
                  } else {
                    // If we found by UID, update our sequential pointer if possible
                    const currentIdx = textNodesData.findIndex(d => d.uid === uid);
                    if (currentIdx !== -1) lastProcessedIndex = Math.max(lastProcessedIndex, currentIdx + 1);
                  }
                  
                  if (nodeData && !processedUids.has(nodeData.uid)) {
                    // Extract text from abbreviated key 't' or full key 'text'
                    const text = translatedItem?.t || translatedItem?.text || translatedItem;
                    this._applyTranslationToNode(nodeData.node, text, effectiveTargetLanguage, element);
                    processedUids.add(nodeData.uid);
                  }
                });
              }
            } catch (err) {
              this.logger.error('Error during onStreamUpdate processing:', err);
            }
          },
          onStreamEnd: (data) => {
            if (isSettled) return;
            if (data.cancelled) return safeResolve({ success: false, cancelled: true });
            if (data.success === false || data.error) {
              const errObj = typeof data.error === 'object' ? data.error : { message: data.error, type: matchErrorToType(data.error) };
              const error = new Error(errObj.message || 'Stream failed');
              Object.assign(error, errObj);
              return safeResolve({ success: false, error });
            }

            // Capture final language from stream end metadata if available
            const finalLang = data.targetLanguage || effectiveTargetLanguage;
            safeResolve({ success: true, targetLanguage: finalLang });
          },
          onError: (error) => {
            if (isSettled || !this.currentMessageId) return;
            
            // Still resolve to allow cleanup, but pass the error
            safeResolve({ success: false, error });
          }
        });
      });

      this.isTranslating = true;
      this.currentMessageId = messageId;

      await contentScriptIntegration.initialize();
      
      const response = await contentScriptIntegration.sendTranslationRequest({
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
          contextMetadata: isAIContextEnabled ? contextMetadata : null,
          contextSummary: contextSummary,
          options: { rawJsonPayload: true, enableDictionary: false, smartContext: isAIContextEnabled },
          sessionId: this.sessionMessageId, 
        },
        context: MessageContexts.SELECT_ELEMENT,
      });

      let result;
      if (response?.streaming) {
        result = await streamEndPromise;
      } else if (response?.success) {
        result = await this._handleDirectResponse(response, textNodesData, nodeMap, effectiveTargetLanguage, element);
      } else {
        throw new Error(response?.error?.message || response?.error || 'Translation failed');
      }

      // Update effective target language from result if it changed
      if (result?.targetLanguage) {
        effectiveTargetLanguage = result.targetLanguage;
      }

      // If the result contains an error (from resolve-only pattern), throw it now
      if (result && result.success === false && result.error) {
        throw result.error;
      }

      return await this._finalizeTranslation({
        result, element, elementId, targetLanguage: effectiveTargetLanguage, onComplete, sessionId: this.sessionMessageId
      });

    } catch (error) {
      this.isTranslating = false; 
      
      const type = matchErrorToType(error);
      const isCancellation = type === ErrorTypes.USER_CANCELLED || type === ErrorTypes.TRANSLATION_CANCELLED;

      if (!isCancellation && !error.alreadyHandled) {
        this.logger.debug('Handling translation error and showing toast', error);
        
        await this.errorHandler.handle(error, {
          context: 'select-element',
          component: 'DomTranslatorAdapter',
          showToast: true,
          forceToast: true 
        });
        error.alreadyHandled = true; 
      }

      if (onError) await onError({ status: TRANSLATION_STATUS.ERROR, error });
      throw error;
    } finally {
      this._cleanupCurrentSession(true);
    }
  }

  _applyTranslationToNode(textNode, translatedText, targetLanguage, rootElement) {
    if (!textNode || !translatedText) return;
    
    // Safety check: extract string content
    let finalTranslation = '';
    if (typeof translatedText === 'string') {
      finalTranslation = translatedText;
    } else if (typeof translatedText === 'object' && translatedText !== null) {
      finalTranslation = translatedText.text || translatedText.translation || '';
    }
    
    if (!finalTranslation || finalTranslation.trim() === '') return;

    const originalText = textNode.textContent;
    const leadingMatch = originalText.match(/^(\s*)/);
    const trailingMatch = originalText.match(/(\s*)$/);
    const leadingWhitespace = leadingMatch ? leadingMatch[1] : '';
    const trailingWhitespace = trailingMatch ? trailingMatch[1] : '';
    
    const detectedDir = DirectionManager.detectDirectionFromContent(finalTranslation);
    const bidiMark = detectedDir === 'rtl' ? DirectionManager.BIDI_MARKS.RLM : DirectionManager.BIDI_MARKS.LRM;
    
    // 1. Register original text before modification for Hover Tooltip
    hoverPreviewLookup.add(textNode, originalText);

    // 2. Mark the immediate parent element as having original text (Surgical marking)
    const parentElement = textNode.parentElement;
    if (parentElement && parentElement.getAttribute(PAGE_TRANSLATION_ATTRIBUTES.HAS_ORIGINAL) !== 'true') {
      parentElement.setAttribute(PAGE_TRANSLATION_ATTRIBUTES.HAS_ORIGINAL, 'true');
    }

    textNode.nodeValue = leadingWhitespace + bidiMark + finalTranslation + bidiMark + trailingWhitespace;
    DirectionManager.applyNodeDirection(textNode, targetLanguage, rootElement);
  }

  async _handleDirectResponse(response, textNodesData, nodeMap, targetLanguage, element) {
    try {
      // Robust result extraction - handle both unified response and direct results
      let rawResults = response.translatedText;
      
      // If it's already an object/array, don't re-parse
      if (typeof rawResults === 'string' && (rawResults.trim().startsWith('[') || rawResults.trim().startsWith('{'))) {
        try {
          rawResults = JSON.parse(rawResults);
        } catch (e) {
          this.logger.warn('Failed to parse translatedText as JSON:', e.message);
        }
      }
      
      const results = Array.isArray(rawResults) ? rawResults : [rawResults];
      const finalTargetLanguage = response.targetLanguage || targetLanguage;

      results.forEach((item, i) => {
        // Handle abbreviated key 'i' for UID
        const uid = item?.i || item?.uid;
        const nodeData = uid ? nodeMap.get(uid) : textNodesData[i];
        if (nodeData) {
          // Handle abbreviated key 't' for text
          const text = item?.t || item?.text || item;
          this._applyTranslationToNode(nodeData.node, text, finalTargetLanguage, element);
        }
      });

      return { 
        success: true, 
        isNonStreaming: true, 
        translatedResults: results,
        targetLanguage: finalTargetLanguage 
      };
    } catch (err) {
      this.logger.error('Invalid translation format during direct handling:', err);
      throw new Error('Invalid translation format');
    }
  }

  async _finalizeTranslation({ result, element, elementId, targetLanguage, onComplete, sessionId }) {
    if (!result?.success) {
      if (result.cancelled) return { success: false, cancelled: true, element };
      throw result.error || new Error('Translation failed');
    }

    const finalTarget = result.targetLanguage || targetLanguage;
    
    // Non-streaming fallback already applied translations in _handleDirectResponse
    
    DirectionManager.applyElementDirection(element, finalTarget);
    
    // Update the existing state entry with finalized metadata
    if (globalSelectElementState.currentTranslation) {
      globalSelectElementState.currentTranslation.targetLanguage = finalTarget;
      globalSelectElementState.currentTranslation.partial = false;
      globalSelectElementState.currentTranslation.sessionId = sessionId;
    }

    if (onComplete) await onComplete({ status: TRANSLATION_STATUS.COMPLETED, elementId, translated: true });
    return { success: true, elementId, element };
  }

  _storeTranslationState(data) {
    const { element } = data;
    const stateEntry = { 
      ...data, 
      originalDir: element.getAttribute('dir'),
      originalStyleDirection: element.style.direction,
      originalTextAlign: element.style.textAlign,
      timestamp: Date.now() 
    };
    
    globalSelectElementState.translationHistory.push(stateEntry);
    globalSelectElementState.currentTranslation = stateEntry; // IMPORTANT: Set current translation pointer
  }

  _cleanupCurrentSession(isSuccess = false) {
    this.isTranslating = false;
    const messageId = this.currentMessageId;
    if (messageId) {
      // Use the correct API from contentScriptIntegration
      if (!isSuccess) {
        contentScriptIntegration.streamingHandler.cancelHandler(messageId);
      }
      this.currentMessageId = null;
    }
  }

  async cancelTranslation(options = {}) {
    const { silent = false } = options;
    if (!this.isTranslating) return;

    if (!silent) {
      this.logger.debug('Cancelling element translation');
    }

    const messageId = this.currentMessageId;
    if (messageId) {
      try {
        // 1. Stop the network request in background
        contentScriptIntegration.cancelTranslationRequest(messageId, ActionReasons.USER_CANCELLED);
      } catch (error) {
        if (!silent) {
          this.logger.warn('Failed to cancel translation request:', error);
        }
      }
    }

    // 2. Clear state pointers
    this._cleanupCurrentSession(false);

    // NOTE: We do NOT revert partial translations on cancel.
    // The user can manually revert via the Revert button if desired.
    // Partial translations that were already applied remain visible.
  }

  isCurrentlyTranslating() { return this.isTranslating; }
  hasTranslation() { return globalSelectElementState.translationHistory?.length > 0; }
  async revertTranslation() { return await revertSelectElementTranslation(); }

  async cleanup() {
    if (this.sessionMessageId) {
      sendRegularMessage({ action: MessageActions.CANCEL_SESSION, data: { sessionId: this.sessionMessageId } }).catch(() => {});
    }
    super.cleanup();
  }
}

export default DomTranslatorAdapter;
