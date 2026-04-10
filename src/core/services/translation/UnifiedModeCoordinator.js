/**
 * Unified Mode Coordinator - Manages mode-specific translation behaviors
 * Coordinates between the Unified Service and the Translation Engine for different UI modes.
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { TranslationMode } from '@/shared/config/config.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { RequestStatus } from './TranslationRequestTracker.js';
import { statsManager } from '@/features/translation/core/TranslationStatsManager.js';

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

    const { TranslationPriority } = await import('@/features/translation/core/RateLimitManager.js');
    let priority = TranslationPriority.NORMAL;

    // Mapping priorities to modes
    const highPriorityModes = new Set([
      TranslationMode.Field, TranslationMode.Selection, TranslationMode.Dictionary_Translation,
      TranslationMode.Popup_Translate, TranslationMode.Sidepanel_Translate, TranslationMode.Mobile_Translate,
    ]);
    
    if (highPriorityModes.has(mode)) {
      priority = TranslationPriority.HIGH;
    } else if ([TranslationMode.Page, TranslationMode.Select_Element].includes(mode)) {
      priority = TranslationPriority.LOW;
    }

    request.data.priority = priority;

    switch (mode) {
      case TranslationMode.Field:
        return await this.processFieldTranslation(request, { translationEngine });
      case TranslationMode.Page:
        return await this.processPageTranslation(request, { translationEngine });
      case TranslationMode.Select_Element:
        return await this.processSelectElementTranslation(request, { translationEngine });
      default:
        return await this.processStandardTranslation(request, { translationEngine });
    }
  }

  /**
   * Specialized handler for Whole Page Translation (Batch processing).
   * Now simplified to delegate orchestration to ProviderCoordinator.
   */
  async processPageTranslation(request, { translationEngine }) {
    const { messageId, data } = request;
    const { text, provider, sourceLanguage, targetLanguage, priority } = data;

    if (!text) throw new Error('No text provided for translation');

    // Parse incoming segments
    const segments = typeof text === 'string' ? JSON.parse(text).map(item => item.text || item) : text.map(item => item.text || item);
    const totalOriginalChars = segments.reduce((sum, t) => sum + (t?.length || 0), 0);

    const providerInstance = await translationEngine.getProvider(provider);
    if (!providerInstance) throw new Error(`Provider '${provider}' initialization failed`);

    const abortController = translationEngine.lifecycleRegistry.registerRequest(messageId, typeof text === 'string' ? text.substring(0, 100) : '');

    try {
      const sessionId = request.sessionId || data.sessionId || messageId;
      
      // Execute the whole array via Provider (Coordinator will handle chunking internally)
      const translatedSegments = await providerInstance.translate(segments, sourceLanguage || 'auto', targetLanguage, {
        mode: TranslationMode.Page,
        abortController,
        messageId,
        sessionId,
        priority,
        rawJsonPayload: true // Treat as handled structure
      });

      // Ensure we have an array of results that matches the input length
      const results = Array.isArray(translatedSegments) ? translatedSegments : [translatedSegments];
      
      const finalResults = segments.map((original, idx) => ({
        text: results[idx] !== undefined ? results[idx] : original
      }));

      return {
        success: true,
        translatedText: JSON.stringify(finalResults),
        actualCharCount: totalOriginalChars, // Approximate or get from stats if needed
        originalCharCount: totalOriginalChars,
        error: null
      };
    } catch (error) {
      logger.error(`[UnifiedCoordinator] Page translation failed:`, error.message);
      return {
        success: false,
        translatedText: JSON.stringify(segments.map(s => ({ text: s }))),
        error: error.message
      };
    } finally {
      translationEngine.lifecycleRegistry.unregisterRequest(messageId);
    }
  }

  /**
   * Handler for Text Field (Input) translations.
   */
  async processFieldTranslation(request, { translationEngine }) {
    const messageForEngine = {
      action: MessageActions.TRANSLATE,
      messageId: request.messageId,
      context: 'content', 
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
      context: 'content', 
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
      context: 'content',
      data: request.data
    }, request.sender);
  }
}
