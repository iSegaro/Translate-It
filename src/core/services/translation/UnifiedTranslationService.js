/**
 * Unified Translation Service - Centralized coordination for all translation operations
 *
 * This service provides a single point of coordination for translation requests,
 * eliminating duplicate processing and ensuring consistent behavior across all translation modes.
 *
 * Architecture:
 * - RequestTracker: Tracks all active translation requests
 * - ResultDispatcher: Handles result delivery with duplicate prevention
 * - ModeCoordinator: Manages mode-specific behaviors
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { TranslationMode, getModeProvidersAsync, getTranslationApiAsync } from '@/shared/config/config.js';
import { MessageFormat, MessageContexts } from '@/shared/messaging/core/MessagingCore.js';
import { translationRequestTracker, RequestStatus } from './TranslationRequestTracker.js';
import ExtensionContextManager from '@/core/extensionContext.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'UnifiedTranslationService');


/**
 * Unified Translation Service
 */
export class UnifiedTranslationService {
  constructor() {
    // Initialize components
    this.requestTracker = translationRequestTracker; // Use singleton instance
    this.resultDispatcher = new TranslationResultDispatcher();
    this.modeCoordinator = new TranslationModeCoordinator();

    // Service references (to be injected)
    this.translationEngine = null;
    this.backgroundService = null;

    logger.info('UnifiedTranslationService initialized');
  }

  /**
   * Initialize service dependencies
   */
  initialize({ translationEngine, backgroundService }) {
    this.translationEngine = translationEngine;
    this.backgroundService = backgroundService;

    logger.info('UnifiedTranslationService dependencies initialized');
  }

  /**
   * Determine the effective provider based on mode and settings
   * @private
   */
  async _resolveEffectiveProvider(data, context) {
    // 1. If context is from UI, specific tools, or content (for batch page translation), respect the provider passed in the request
    const uiContexts = [
      MessageContexts.POPUP,
      MessageContexts.SIDEPANEL,
      MessageContexts.SELECT_ELEMENT,
      MessageContexts.PAGE_TRANSLATION_BATCH,
      MessageContexts.CONTENT,
      MessageContexts.MOBILE_TRANSLATE
    ];
    if (uiContexts.includes(context) && data.provider) {
      return data.provider;
    }

    // 2. Check for mode-specific provider in settings
    const modeProviders = await getModeProvidersAsync();
    const modeSpecificProvider = modeProviders ? modeProviders[data.mode] : null;

    if (modeSpecificProvider && modeSpecificProvider !== 'default') {
      logger.debug(`[UnifiedService] Using mode-specific provider for ${data.mode}: ${modeSpecificProvider}`);
      return modeSpecificProvider;
    }

    // 3. Fallback to global provider (already passed in data.provider usually, but let's be sure)
    return data.provider || await getTranslationApiAsync();
  }

  /**
   * Main entry point for all translation requests
   */
  async handleTranslationRequest(message, sender) {
    const { messageId, data, context } = message;

    // Resolve the effective provider based on mode settings
    if (data) {
      data.provider = await this._resolveEffectiveProvider(data, context);
    }

    logger.info(`[UnifiedService] Processing translation request: ${messageId} (${data?.text?.length || 0} chars, mode: ${data?.mode || 'unknown'}, provider: ${data?.provider || 'unknown'})`);
    // Service availability checked silently

    // Check if service is initialized
    if (!this.translationEngine || !this.backgroundService) {
      logger.warn(`[UnifiedService] Service not fully initialized. Engine: ${!!this.translationEngine}, Background: ${!!this.backgroundService}`);

      // Try to get dependencies from global scope
      if (!this.translationEngine && globalThis.backgroundService?.translationEngine) {
        // Getting translation engine from global backgroundService
        this.translationEngine = globalThis.backgroundService.translationEngine;
      }

      if (!this.backgroundService && globalThis.backgroundService) {
        // Getting background service from global scope
        this.backgroundService = globalThis.backgroundService;
      }

      // If still not available, throw error
      if (!this.translationEngine || !this.backgroundService) {
        throw new Error('Translation service not initialized. Please try again.');
      }
    }

    try {
      // Validate message
      if (!MessageFormat.validate(message)) {
        throw new Error(`Invalid message format: ${JSON.stringify(message)}`);
      }

      // Check for duplicate active request
      const existingRequest = this.requestTracker.getRequest(messageId);
      if (existingRequest && this.requestTracker.isRequestActive(messageId)) {
        // Duplicate active request detected
        return { success: false, error: 'Request already processing' };
      }

      // If request exists but is not active (completed/failed), we can proceed with new request
      if (existingRequest && !this.requestTracker.isRequestActive(messageId)) {
        // Found inactive request, proceeding with new request
      }

      // Create new request record
      const request = this.requestTracker.createRequest({
        messageId,
        data,
        sender,
        timestamp: Date.now()
      });

      // Process based on translation mode
      const result = await this.modeCoordinator.processRequest(request, {
        translationEngine: this.translationEngine,
        backgroundService: this.backgroundService
      });

      // Update request status
      this.requestTracker.updateRequest(messageId, {
        status: result.success ? RequestStatus.COMPLETED : RequestStatus.FAILED,
        result
      });

      // For field mode, return result directly without dispatching
      // For other modes, dispatch result
      if (request.mode === TranslationMode.Field) {
        // Field mode - returning result directly
        return result;
      }

      // Dispatch result for non-field modes
      await this.resultDispatcher.dispatchResult({
        messageId,
        result,
        request,
        originalMessage: message
      });

      return result;

    } catch (error) {
      logger.error('[UnifiedService] Translation request failed:', error);

      // Update request status
      this.requestTracker.updateRequest(messageId, {
        status: RequestStatus.FAILED,
        result: { success: false, error: error.message }
      });

      return MessageFormat.createErrorResponse(error, messageId);
    }
  }

  /**
   * Handle streaming translation updates
   */
  async handleStreamingUpdate(message) {
    const { messageId, data } = message;

    // Streaming update handled

    // Forward to result dispatcher for streaming handling
    await this.resultDispatcher.dispatchStreamingUpdate({
      messageId,
      data,
      request: this.requestTracker.getRequest(messageId)
    });
  }

  /**
   * Cancel an active translation request
   */
  async cancelRequest(messageId) {
    logger.info(`[UnifiedService] Cancelling request: ${messageId}`);

    const request = this.requestTracker.getRequest(messageId);
    if (!request) {
      return { success: false, error: 'Request not found' };
    }

    // Update status
    this.requestTracker.updateRequest(messageId, {
      status: RequestStatus.CANCELLED
    });

    // Cancel in translation engine
    if (this.translationEngine) {
      this.translationEngine.cancelTranslation(messageId);
    }

    // Notify result dispatcher
    await this.resultDispatcher.dispatchCancellation({
      messageId,
      request
    });

    return { success: true };
  }

  /**
   * Clean up completed requests (periodic maintenance)
   */
  cleanup() {
    const count = this.requestTracker.cleanup();
    if (count > 0) {
      logger.debug(`[UnifiedService] Cleaned up ${count} completed requests`);
    }
  }
}


/**
 * Translation Result Dispatcher
 * Handles delivery of translation results with duplicate prevention
 */
class TranslationResultDispatcher {
  constructor() {
    this.processedResults = new Set(); // Set of processed messageIds
    this.resultQueue = new Map(); // messageId -> result data
  }

  /**
   * Dispatch translation result
   */
  async dispatchResult({ messageId, result, request, originalMessage }) {
    // Check for duplicate result processing
    if (this.processedResults.has(messageId)) {
      return;
    }

    // Mark as processed
    this.processedResults.add(messageId);

    // Clean up old processed results (prevent memory leak)
    if (this.processedResults.size > 1000) {
      const oldest = this.processedResults.values().next().value;
      this.processedResults.delete(oldest);
    }

    // Dispatch based on mode
    if (request.mode === TranslationMode.Field) {
      await this.dispatchFieldResult({ messageId, result, request, originalMessage });
    } else if (request.mode === TranslationMode.Select_Element) {
      await this.dispatchSelectElementResult({ messageId, result, request, originalMessage });
    } else {
      // For other modes, return directly
    }
  }

  /**
   * Dispatch field or page mode translation result
   */
  async dispatchFieldResult({ messageId, result, request }) {

    // Send back to original tab
    try {
      const mode = request.mode === TranslationMode.Page ? TranslationMode.Page : TranslationMode.Field;
      
      await browser.tabs.sendMessage(request.sender.tab.id, {
        action: MessageActions.TRANSLATION_RESULT_UPDATE,
        messageId,
        data: {
          ...result,
          translationMode: mode,  // Use translationMode to match ContentMessageHandler
          context: mode === TranslationMode.Page ? 'page-mode' : 'field-mode',
          elementData: request.elementData
          // Note: Not marking as direct response for field mode - need to process in content script
        }
      });

      // Result handled silently
    } catch (sendError) {
      // Use centralized context error detection
      if (ExtensionContextManager.isContextError(sendError)) {
        ExtensionContextManager.handleContextError(sendError, 'unified-translation-service');
      } else {
        logger.warn(`[UnifiedTranslationService] Failed to dispatch result:`, sendError);
      }
    }
  }

  /**
   * Dispatch select-element translation result
   */
  async dispatchSelectElementResult({ messageId, result, request }) {

    // For select-element, we might need broadcast
    if (result.streaming || (result.translatedText && result.translatedText.length > 2000)) {
      await this.broadcastResult({ messageId, result, request });
    }
  }

  /**
   * Broadcast result to all tabs (for streaming/large content)
   */
  async broadcastResult({ messageId, result, request }) {

    const tabs = await browser.tabs.query({});

    for (const tab of tabs) {
      try {
        await browser.tabs.sendMessage(tab.id, {
          action: MessageActions.TRANSLATION_RESULT_UPDATE,
          messageId,
          data: {
            ...result,
            translationMode: request?.mode || result?.translationMode || 'unknown',  // Include the mode
            context: 'broadcast',
            isBroadcast: true // Mark as broadcast to prevent duplicate processing
          }
        });
      } catch (sendError) {
        // Use centralized context error detection
        if (!ExtensionContextManager.isContextError(sendError)) {
          logger.debug(`Could not broadcast to tab ${tab.id}:`, sendError.message);
        }
        // Context errors are handled silently via ExtensionContextManager
      }
    }
  }

  /**
   * Handle streaming updates
   */
  async dispatchStreamingUpdate({ messageId, data, request }) {
    // Only forward if request exists and is still active
    if (request && request.status === RequestStatus.PROCESSING) {
      await this.broadcastResult({
        messageId,
        result: { streaming: true, ...data },
        request
      });
    }
  }

  /**
   * Handle cancellation
   */
  async dispatchCancellation({ messageId, request }) {
    // Notify original tab about cancellation
    if (request?.sender?.tab?.id) {
      try {
        await browser.tabs.sendMessage(request.sender.tab.id, {
          action: MessageActions.TRANSLATION_CANCELLED,
          messageId
        });
      } catch (sendError) {
        // Use centralized context error detection
        if (ExtensionContextManager.isContextError(sendError)) {
          ExtensionContextManager.handleContextError(sendError, 'unified-translation-service');
        } else {
          logger.warn(`[UnifiedTranslationService] Failed to send cancellation:`, sendError);
        }
      }
    }
  }
}

/**
 * Translation Mode Coordinator
 * Manages mode-specific translation behaviors
 */
class TranslationModeCoordinator {
  /**
   * Process request based on mode
   */
  async processRequest(request, { translationEngine }) {
    const { mode } = request;

    // Update request status
    request.status = RequestStatus.PROCESSING;

    // Determine priority based on mode using project constants
    const { TranslationPriority } = await import('@/features/translation/core/RateLimitManager.js');
    let priority = TranslationPriority.NORMAL;

    // Priority mapping based on TranslationMode constants
    const highPriorityModes = new Set([
      TranslationMode.Field,
      TranslationMode.Selection,
      TranslationMode.Dictionary_Translation,
      TranslationMode.Popup_Translate,
      TranslationMode.Sidepanel_Translate,
      TranslationMode.Mobile_Translate,
    ]);
    
    const lowPriorityModes = new Set([
      TranslationMode.Page,
      TranslationMode.Select_Element,
      TranslationMode.ScreenCapture
    ]);

    if (highPriorityModes.has(mode)) {
      priority = TranslationPriority.HIGH;
    } else if (lowPriorityModes.has(mode)) {
      priority = TranslationPriority.LOW;
    }

    // Attach priority to request data for downstream use
    request.data.priority = priority;

    // Route to appropriate handler using TranslationMode constants
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
   * Process page mode translation (Batch)
   */
  async processPageTranslation(request, { translationEngine }) {
    const { messageId, data } = request;
    const { text, provider, sourceLanguage, targetLanguage, priority } = data;

    if (!text) {
      throw new Error('No text provided for translation');
    }

    // Parse texts array
    const textsToTranslate = typeof text === 'string' ? JSON.parse(text) : text;
    const segments = textsToTranslate.map(item => item.text || item);

    // Get the provider instance
    const providerInstance = await translationEngine.getProvider(provider || ProviderRegistryIds.GOOGLE_V2);
    if (!providerInstance) {
      throw new Error(`Provider '${provider}' not found or failed to initialize`);
    }

    // Get rate limit manager and provider info
    const { rateLimitManager } = await import('@/features/translation/core/RateLimitManager.js');
    const { registryIdToName, isProviderType, ProviderTypes, ProviderRegistryIds } = await import('@/features/translation/providers/ProviderConstants.js');
    const { CONFIG: globalConfig } = await import('@/shared/config/config.js');

    rateLimitManager.reloadConfigurations();

    // AI providers need larger batches
    const pName = registryIdToName(provider || ProviderRegistryIds.GOOGLE_V2);
    const isAI = isProviderType(pName, ProviderTypes.AI);
    const OPTIMAL_BATCH_SIZE = globalConfig.WHOLE_PAGE_CHUNK_SIZE;
    const OPTIMAL_CHAR_LIMIT = isAI ? globalConfig.WHOLE_PAGE_AI_MAX_CHARS : globalConfig.WHOLE_PAGE_MAX_CHARS;
    
    const batches = translationEngine.createIntelligentBatches(segments, OPTIMAL_BATCH_SIZE, OPTIMAL_CHAR_LIMIT);
    const results = new Array(segments.length).fill(null);
    const errorMessages = [];
    let hasErrors = false;

    // Check if provider supports batch/chunk
    const isAIProvider = providerInstance?.constructor?.type === "ai" || typeof providerInstance?._translateBatch === 'function';
    
    // Create abort controller
    const abortController = new AbortController();
    translationEngine.activeTranslations.set(messageId, abortController);

    try {
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        if (translationEngine.isCancelled(messageId)) break;

        // Non-AI providers need delays to avoid 429
        if (i > 0 && !isAIProvider) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        try {
          const batchResult = await rateLimitManager.executeWithRateLimit(
            provider || ProviderRegistryIds.GOOGLE_V2,
            () => {
              if (isAIProvider) {
                return providerInstance._translateBatch(
                  batch,
                  sourceLanguage || 'auto',
                  targetLanguage,
                  TranslationMode.Page,
                  abortController,
                  translationEngine,
                  messageId,
                  data.sessionId || messageId,
                  priority // Use detected priority (LOW)
                );
              } else {
                return providerInstance._translateChunk(
                  batch,
                  sourceLanguage || 'auto',
                  targetLanguage,
                  TranslationMode.Page,
                  abortController
                );
              }
            },
            `batch-${i + 1}/${batches.length}`,
            priority // Use detected priority (LOW)
          );

          // Apply results
          if (Array.isArray(batchResult)) {
            for (let j = 0; j < batch.length; j++) {
              const segmentIndex = segments.indexOf(batch[j]);
              if (segmentIndex !== -1 && segmentIndex < results.length) {
                results[segmentIndex] = batchResult[j] || batch[j];
              }
            }
          }
        } catch (batchError) {
          hasErrors = true;
          const msg = batchError.message || String(batchError);
          if (!errorMessages.includes(msg)) errorMessages.push(msg);
          
          // Fallback to original
          for (const segment of batch) {
            const idx = segments.indexOf(segment);
            if (idx !== -1 && results[idx] === null) results[idx] = segment;
          }
        }
      }

      // Cleanup
      for (let i = 0; i < results.length; i++) {
        if (results[i] === null) results[i] = segments[i];
      }

      const finalResults = results.map(text => ({ text }));

      if (hasErrors) {
        return {
          success: false,
          error: errorMessages.join(', ') || 'Batch translation failed',
          partialResults: JSON.stringify(finalResults)
        };
      }

      return {
        success: true,
        translatedText: JSON.stringify(finalResults)
      };
    } finally {
      translationEngine.activeTranslations.delete(messageId);
    }
  }

  /**
   * Process Field mode translation
   */
  async processFieldTranslation(request, { translationEngine }) {
    const { messageId, data } = request;

    // Use translation engine directly
    if (!translationEngine) {
      throw new Error('Translation engine not available');
    }

    // Ensure dictionary is disabled for field mode
    const enhancedData = {
      ...data,
      mode: TranslationMode.Field,
      enableDictionary: false,
      options: {
        ...(data.options || {}),
        enableDictionary: false
      }
    };

    // Create the expected message format for translation engine
    const messageForEngine = {
      action: MessageActions.TRANSLATE,
      messageId: messageId,
      context: 'content', 
      data: enhancedData
    };

    return await translationEngine.handleTranslateMessage(messageForEngine, request.sender);
  }

  /**
   * Process select-element translation
   */
  async processSelectElementTranslation(request, { translationEngine }) {
    // For select-element, always use streaming for better UX
    const enhancedData = {
      ...request.data,
      enableDictionary: false,
      options: {
        ...request.data.options,
        forceStreaming: true,
        enableDictionary: false
      }
    };

    const result = await translationEngine.handleTranslateMessage({
      action: MessageActions.TRANSLATE,
      messageId: request.messageId,
      context: 'content', 
      data: enhancedData
    }, request.sender);

    return result;
  }

  /**
   * Process standard translation
   */
  async processStandardTranslation(request, { translationEngine }) {
    const result = await translationEngine.handleTranslateMessage({
      action: MessageActions.TRANSLATE,
      messageId: request.messageId,
      context: 'content', // Add required context
      data: request.data
    }, request.sender);

    return result;
  }
}

// Export singleton instance
export const unifiedTranslationService = new UnifiedTranslationService();