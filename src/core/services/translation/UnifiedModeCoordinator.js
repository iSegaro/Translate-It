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
   */
  async processPageTranslation(request, { translationEngine }) {
    const { messageId, data } = request;
    const { text, provider, sourceLanguage, targetLanguage, priority } = data;

    if (!text) throw new Error('No text provided for translation');

    const segments = typeof text === 'string' ? JSON.parse(text).map(item => item.text || item) : text.map(item => item.text || item);

    const { registryIdToName, isProviderType, ProviderTypes, ProviderRegistryIds } = await import('@/features/translation/providers/ProviderConstants.js');
    const { CONFIG: globalConfig } = await import('@/shared/config/config.js');
    const { rateLimitManager } = await import('@/features/translation/core/RateLimitManager.js');

    const providerInstance = await translationEngine.getProvider(provider || ProviderRegistryIds.GOOGLE_V2);
    if (!providerInstance) throw new Error(`Provider '${provider}' initialization failed`);

    rateLimitManager.reloadConfigurations();

    const pName = registryIdToName(provider || ProviderRegistryIds.GOOGLE_V2);
    const isAI = isProviderType(pName, ProviderTypes.AI);
    const OPTIMAL_BATCH_SIZE = globalConfig.WHOLE_PAGE_CHUNK_SIZE;
    const OPTIMAL_CHAR_LIMIT = isAI ? globalConfig.WHOLE_PAGE_AI_MAX_CHARS : globalConfig.WHOLE_PAGE_MAX_CHARS;
    
    const batches = translationEngine.createIntelligentBatches(segments, OPTIMAL_BATCH_SIZE, OPTIMAL_CHAR_LIMIT);
    const results = new Array(segments.length).fill(null);
    const errorMessages = [];
    let hasErrors = false;
    let totalActualChars = 0;
    const totalOriginalChars = segments.reduce((sum, t) => sum + (t?.length || 0), 0);

    const abortController = translationEngine.lifecycleRegistry.registerRequest(messageId, typeof text === 'string' ? text.substring(0, 100) : '');

    try {
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        if (translationEngine.isCancelled(messageId)) break;

        // Apply delay for non-AI providers to respect rate limits
        if (i > 0 && providerInstance.constructor.type !== "ai") {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        try {
          const sessionId = request.sessionId || data.sessionId || messageId;
          const statsBefore = statsManager.getSessionSummary(sessionId);
          const charsBefore = statsBefore ? statsBefore.chars : 0;

          if (abortController) abortController.sessionId = sessionId;

          const batchResult = await rateLimitManager.executeWithRateLimit(
            provider || ProviderRegistryIds.GOOGLE_V2,
            (opts) => {
              if (providerInstance.constructor.type === "ai") {
                return providerInstance._translateBatch(batch, sourceLanguage || 'auto', targetLanguage, TranslationMode.Page, abortController, translationEngine, messageId, sessionId, null);
              } else {
                return providerInstance._translateChunk(batch, sourceLanguage || 'auto', targetLanguage, TranslationMode.Page, abortController, 0, batch.length, i, batches.length, opts);
              }
            },
            `batch-${i + 1}/${batches.length}`,
            priority,
            { sessionId }
          );

          const statsAfter = statsManager.getSessionSummary(sessionId);
          totalActualChars += statsAfter ? (statsAfter.chars - charsBefore) : batch.reduce((sum, t) => sum + (t?.length || 0), 0);

          const chunkResults = Array.isArray(batchResult) ? batchResult : (batchResult?.results || []);
          if (Array.isArray(chunkResults)) {
            batch.forEach((segment, idx) => {
              const globalIdx = segments.indexOf(segment);
              if (globalIdx !== -1) results[globalIdx] = chunkResults[idx] || segment;
            });
          }
        } catch (batchError) {
          hasErrors = true;
          errorMessages.push(batchError.message || String(batchError));
          batch.forEach(s => { const idx = segments.indexOf(s); if (idx !== -1 && results[idx] === null) results[idx] = s; });
        }
      }

      const finalResults = results.map(text => ({ text: text || "" }));
      return {
        success: !hasErrors,
        translatedText: JSON.stringify(finalResults),
        actualCharCount: totalActualChars,
        originalCharCount: totalOriginalChars,
        error: hasErrors ? errorMessages.join(', ') : null
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
