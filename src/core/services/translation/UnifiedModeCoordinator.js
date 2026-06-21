/**
 * Unified Mode Coordinator - Manages mode-specific translation behaviors
 * Coordinates between the Unified Service and the Translation Engine for different UI modes.
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { TranslationMode } from '@/shared/config/config.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { RequestStatus } from './TranslationRequestTracker.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'UnifiedModeCoordinator');

export class UnifiedModeCoordinator {
  /**
   * Process a translation request based on its mode.
   * 
   * @param {object} request - The request record from Tracker
   * @param {object} deps - { translationEngine, backgroundService }
   */
  async processRequest(request, { translationEngine }) {
    const { mode } = request;
    request.status = RequestStatus.PROCESSING;
    request.data.priority = await this._resolvePriority(mode);

    switch (mode) {
      case TranslationMode.Field:
        return await this.processFieldTranslation(request, { translationEngine });
      case TranslationMode.Page:
        return await this.processPageTranslation(request, { translationEngine });
      case TranslationMode.PDF:
        return await this.processPdfTranslation(request, { translationEngine });
      case TranslationMode.Subtitle:
        return await this.processSubtitleTranslation(request, { translationEngine });
      case TranslationMode.Select_Element:
        return await this.processSelectElementTranslation(request, { translationEngine });
      default:
        return await this.processStandardTranslation(request, { translationEngine });
    }
  }

  /**
   * Resolve translation priority based on UI mode.
   * @private
   */
  async _resolvePriority(mode) {
    const { TranslationPriority } = await import('@/features/translation/core/RateLimitManager.js');
    
    // Mapping priorities to modes
    const highPriorityModes = new Set([
      TranslationMode.Field, TranslationMode.Selection, TranslationMode.Dictionary_Translation,
      TranslationMode.Popup_Translate, TranslationMode.Sidepanel_Translate, TranslationMode.Mobile_Translate,
    ]);
    
    if (highPriorityModes.has(mode)) {
      return TranslationPriority.HIGH;
    }
    
    if ([TranslationMode.Page, TranslationMode.Select_Element, TranslationMode.PDF].includes(mode)) {
      return TranslationPriority.LOW;
    }

    return TranslationPriority.NORMAL;
  }

  /**
   * Specialized handler for Whole Page Translation (Batch processing).
   * Now simplified to delegate orchestration to ProviderCoordinator.
   */
  async processPageTranslation(request, deps) {
    const { data } = request;
    
    // Explicitly check for missing text to match legacy error message
    if (!data.text) {
      throw new Error('No text provided for translation');
    }

    const items = typeof data.text === 'string' ? JSON.parse(data.text) : data.text;
    
    const result = await this._processGenericBatch(request, deps, {
      mode: TranslationMode.Page,
      items,
      useRawItems: false, // Page mode expects array of strings for traditional providers
      transformOutput: (results) => ({
        success: true,
        translatedText: JSON.stringify(results),
        actualCharCount: results.reduce((sum, r) => sum + (r.text?.length || 0), 0),
        originalCharCount: items.reduce((sum, i) => sum + (i.text?.length || i.length || 0), 0),
        error: null
      }),
      handleError: async (error, items) => {
        const { isFatalError, matchErrorToType } = await import('@/shared/error-management/ErrorMatcher.js');
        const fallbackResults = items.map(item => ({ text: item.text || item }));
        return {
          success: true, 
          translatedText: JSON.stringify(fallbackResults),
          actualCharCount: 0,
          originalCharCount: items.reduce((sum, i) => sum + (i.text?.length || i.length || 0), 0),
          hasError: true,
          error: error.message,
          errorType: matchErrorToType(error),
          isFatal: isFatalError(error)
        };
      }
    });

    return result;
  }

  /**
   * Handler for Text Field (Input) translations.
   */
  async processFieldTranslation(request, { translationEngine }) {
    const messageForEngine = {
      action: MessageActions.TRANSLATE,
      messageId: request.messageId,
      context: request.context || 'content', 
      data: { ...request.data, mode: TranslationMode.Field, enableDictionary: false }
    };
    return await translationEngine.handleTranslateMessage(messageForEngine, request.sender);
  }

  /**
   * Handler for Select Element translations.
   */
  async processSelectElementTranslation(request, { translationEngine }) {
    const enhancedData = {
      ...request.data,
      enableDictionary: false,
      options: { ...request.data.options, forceStreaming: true, enableDictionary: false }
    };
    return await translationEngine.handleTranslateMessage({
      action: MessageActions.TRANSLATE,
      messageId: request.messageId,
      context: request.context || 'content', 
      data: enhancedData
    }, request.sender);
  }

  /**
   * Handler for PDF translation batches.
   */
  async processPdfTranslation(request, { translationEngine }) {
    const enhancedData = {
      ...request.data,
      mode: TranslationMode.PDF,
      enableDictionary: false,
      options: {
        ...request.data.options,
        rawJsonPayload: true,
        pdfTranslation: true,
        enableDictionary: false
      }
    };

    return await translationEngine.handleTranslateMessage({
      action: MessageActions.TRANSLATE,
      messageId: request.messageId,
      context: request.context || 'pdf-translation',
      data: enhancedData
    }, request.sender);
  }

  /**
   * Default handler for standard translations (Selection, Popup, etc.).
   */
  async processStandardTranslation(request, { translationEngine }) {
    return await translationEngine.handleTranslateMessage({
      action: MessageActions.TRANSLATE,
      messageId: request.messageId,
      context: request.context || 'content',
      data: request.data
    }, request.sender);
  }

  /**
   * Specialized handler for Subtitle Translation (Batch processing).
   * Similar to Page translation but optimized for Subtitle cues.
   */
  async processSubtitleTranslation(request, deps) {
    return await this._processGenericBatch(request, deps, {
      mode: TranslationMode.Subtitle,
      items: request.data.items,
      useRawItems: true, // Subtitles need IDs and context for AI providers
      transformOutput: (results, totalChars) => ({
        success: true,
        results, // SubtitleCoordinator expects 'results'
        actualCharCount: totalChars,
        originalCharCount: totalChars
      })
    });
  }

  /**
   * Generic handler for batch translation operations (Page, Subtitle).
   * Implements common logic for lifecycle management, character counting, and provider coordination.
   * 
   * @private
   */
  async _processGenericBatch(request, { translationEngine }, options) {
    const { messageId, data } = request;
    const { provider, priority, promptTemplate, instruction } = data;
    const { mode, items, transformOutput, handleError, useRawItems = false } = options;
    
    const sourceLanguage = data.sourceLanguage || data.sourceLang || 'auto';
    const targetLanguage = data.targetLanguage || data.targetLang;

    // Validate that items is an array. Empty arrays are allowed to proceed to provider init for test compatibility.
    if (!items || !Array.isArray(items)) {
      throw new Error(`No items provided for ${mode} translation`);
    }

    const providerInstance = await translationEngine.getProvider(provider);
    if (!providerInstance) throw new Error(`Provider '${provider}' initialization failed`);

    // Guard against empty items after provider check to avoid null pointer in sampleText
    if (items.length === 0) {
      if (transformOutput) return transformOutput([], 0);
      return { success: true, results: [], actualCharCount: 0, originalCharCount: 0 };
    }
    
    const totalOriginalChars = items.reduce((sum, item) => {
      const text = typeof item === 'string' ? item : (item.text || '');
      return sum + (text?.length || 0);
    }, 0);

    const sampleText = (items[0]?.text || items[0] || '').substring(0, 100);
    const abortController = translationEngine.lifecycleRegistry.registerRequest(messageId, sampleText, mode.toLowerCase());

    let timeoutId;

    try {
      const sessionId = request.sessionId || data.sessionId || messageId;
      
      // Determine what to pass to the provider
      const translationPayload = useRawItems 
        ? items 
        : items.map(item => (typeof item === 'string' ? item : item.text) || '');

      // Timeout Protection (5 minutes) for each batch call
      const BATCH_TIMEOUT_MS = 300000;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const timeoutError = new Error(`Batch translation timed out after ${BATCH_TIMEOUT_MS}ms`);
          timeoutError.type = 'TIMEOUT';
          reject(timeoutError);
        }, BATCH_TIMEOUT_MS);
        
        // Link timeout cleanup to abort signal
        if (abortController?.signal) {
          abortController.signal.addEventListener('abort', () => clearTimeout(timeoutId));
        }
      });

      const response = await Promise.race([
        providerInstance.translate(translationPayload, sourceLanguage, targetLanguage, {
          mode,
          abortController,
          messageId,
          sessionId,
          priority,
          promptTemplate,
          instruction,
          rawJsonPayload: true 
        }),
        timeoutPromise
      ]);

      const translatedSegments = (response && typeof response === 'object' && response.translatedText !== undefined) 
        ? response.translatedText 
        : response;

      const resultsArray = Array.isArray(translatedSegments) ? translatedSegments : [translatedSegments];
      
      const finalResults = items.map((item, idx) => {
        const translated = resultsArray[idx];
        const translatedText = translated !== undefined 
          ? (typeof translated === 'object' ? translated.text : translated) 
          : (typeof item === 'string' ? item : item.text);
          
        return typeof item === 'string' ? { text: translatedText } : { ...item, text: translatedText };
      });

      if (transformOutput) {
        return transformOutput(finalResults, totalOriginalChars);
      }

      return {
        success: true,
        results: finalResults,
        actualCharCount: totalOriginalChars,
        originalCharCount: totalOriginalChars
      };
    } catch (error) {
      if (handleError) {
        return await handleError(error, items);
      }
      logger.error(`[UnifiedCoordinator] ${mode} batch failed:`, error);
      throw error;
    } finally {
      clearTimeout(timeoutId);
      translationEngine.lifecycleRegistry.unregisterRequest(messageId);
    }
  }
}
