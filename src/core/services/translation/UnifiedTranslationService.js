/**
 * Unified Translation Service - Centralized coordination for all translation operations
 * Coordinates requests, delivery, and mode behaviors across the extension.
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { TranslationMode, getModeProvidersAsync, getTranslationApiAsync } from '@/shared/config/config.js';
import { MessageFormat, MessageContexts } from '@/shared/messaging/core/MessagingCore.js';
import { translationRequestTracker, RequestStatus } from './TranslationRequestTracker.js';
import { UnifiedResultDispatcher } from './UnifiedResultDispatcher.js';
import { UnifiedModeCoordinator } from './UnifiedModeCoordinator.js';
import { statsManager } from '@/features/translation/core/TranslationStatsManager.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'UnifiedTranslationService');

export class UnifiedTranslationService {
  constructor() {
    this.requestTracker = translationRequestTracker;
    this.resultDispatcher = new UnifiedResultDispatcher();
    this.modeCoordinator = new UnifiedModeCoordinator();

    this.translationEngine = null;
    this.backgroundService = null;

    logger.info('UnifiedTranslationService initialized');
  }

  /**
   * Initialize service with required background dependencies.
   */
  initialize({ translationEngine, backgroundService }) {
    this.translationEngine = translationEngine;
    this.backgroundService = backgroundService;
    logger.info('UnifiedTranslationService dependencies initialized');
  }

  /**
   * Determine the effective provider based on request context and mode settings.
   * @private
   */
  async _resolveEffectiveProvider(data, context) {
    const uiContexts = [
      MessageContexts.POPUP, MessageContexts.SIDEPANEL, MessageContexts.SELECT_ELEMENT,
      MessageContexts.PAGE_TRANSLATION_BATCH, MessageContexts.CONTENT, MessageContexts.MOBILE_TRANSLATE
    ];
    
    if (uiContexts.includes(context) && data.provider) return data.provider;

    const modeProviders = await getModeProvidersAsync();
    const modeSpecificProvider = modeProviders ? modeProviders[data.mode] : null;

    if (modeSpecificProvider && modeSpecificProvider !== 'default') {
      logger.debug(`Using mode-specific provider for ${data.mode}: ${modeSpecificProvider}`);
      return modeSpecificProvider;
    }

    return data.provider || await getTranslationApiAsync();
  }

  /**
   * Main entry point for all incoming translation requests.
   */
  async handleTranslationRequest(message, sender) {
    const { messageId, data, context } = message;

    if (data) {
      data.provider = await this._resolveEffectiveProvider(data, context);
    }

    const estimatedChars = typeof data?.text === 'string' ? data.text.length : 0;
    logger.info(`Request: ${messageId} (${estimatedChars.toLocaleString()} chars, mode: ${data?.mode || 'unknown'}, provider: ${data?.provider || 'unknown'})`);

    // Ensure dependencies are available
    if (!this.translationEngine || !this.backgroundService) {
      this.translationEngine = this.translationEngine || globalThis.backgroundService?.translationEngine;
      this.backgroundService = this.backgroundService || globalThis.backgroundService;
      if (!this.translationEngine || !this.backgroundService) throw new Error('Translation service not initialized');
    }

    try {
      if (!MessageFormat.validate(message)) throw new Error('Invalid message format');

      const existingRequest = this.requestTracker.getRequest(messageId);
      if (existingRequest && this.requestTracker.isRequestActive(messageId)) {
        return { success: false, error: 'Request already processing' };
      }

      const request = this.requestTracker.createRequest({
        messageId, data, sessionId: data?.sessionId || messageId, sender, timestamp: Date.now()
      });

      // Delegate processing to coordinator
      const result = await this.modeCoordinator.processRequest(request, {
        translationEngine: this.translationEngine,
        backgroundService: this.backgroundService
      });

      this.requestTracker.updateRequest(messageId, {
        status: result.success ? RequestStatus.COMPLETED : RequestStatus.FAILED,
        result
      });

      // Special handling for Field mode (direct return)
      if (request.mode === TranslationMode.Field) return result;

      // Delegate result delivery to dispatcher
      await this.resultDispatcher.dispatchResult({ messageId, result, request, originalMessage: message });

      // Post-processing stats logging
      this._logSessionStats(request, result, messageId);

      return result;

    } catch (error) {
      logger.debug('Request failed:', error.message);
      this.requestTracker.updateRequest(messageId, {
        status: RequestStatus.FAILED,
        result: { success: false, error: error.message }
      });
      return MessageFormat.createErrorResponse(error, messageId);
    }
  }

  /**
   * Log translation performance and consumption stats.
   * @private
   */
  _logSessionStats(request, result, messageId) {
    const mode = request.mode;
    const sessionId = request.sessionId || request.data?.sessionId;
    const summaryId = sessionId || messageId;
    const isMultiBatch = !!(sessionId && sessionId !== messageId);

    if (mode === TranslationMode.Page) {
      statsManager.printSummary(summaryId, { 
        status: 'Batch', 
        batchChars: result.actualCharCount || 0,
        batchOriginalChars: result.originalCharCount || 0
      });
    } else if (!isMultiBatch || (mode === TranslationMode.Select_Element && !result.streaming)) {
      statsManager.printSummary(summaryId, { 
        status: 'Session', success: result.success, 
        clear: mode !== TranslationMode.Select_Element 
      });
    }
  }

  /**
   * Handle real-time streaming updates from the engine.
   */
  async handleStreamingUpdate(message) {
    await this.resultDispatcher.dispatchStreamingUpdate({
      messageId: message.messageId,
      data: message.data,
      request: this.requestTracker.getRequest(message.messageId)
    });
  }

  /**
   * Cancel an active request through the engine and notify UI.
   */
  async cancelRequest(messageId) {
    logger.info(`Cancelling request: ${messageId}`);
    const request = this.requestTracker.getRequest(messageId);
    if (!request) return { success: false, error: 'Request not found' };

    this.requestTracker.updateRequest(messageId, { status: RequestStatus.CANCELLED });
    if (this.translationEngine) this.translationEngine.cancelTranslation(messageId);
    
    await this.resultDispatcher.dispatchCancellation({ messageId, request });
    return { success: true };
  }

  /**
   * Periodically clean up old request records.
   */
  cleanup() {
    const count = this.requestTracker.cleanup();
    if (count > 0) logger.debug(`Cleaned up ${count} records`);
  }
}

export const unifiedTranslationService = new UnifiedTranslationService();
