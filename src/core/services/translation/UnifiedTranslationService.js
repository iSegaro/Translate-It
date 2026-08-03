/**
 * Unified Translation Service - Centralized coordination for all translation operations
 * Coordinates requests, delivery, and mode behaviors across the extension.
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { 
  TranslationMode, 
  getModeProvidersAsync, 
  getTranslationApiAsync, 
  getPopupMaxCharsAsync,
  getSidepanelMaxCharsAsync,
  getSelectionMaxCharsAsync,
  getSelectElementMaxCharsAsync
} from '@/shared/config/config.js';
import { MessageFormat, MessageContexts, ActionReasons } from '@/shared/messaging/core/MessagingCore.js';
import { RequestStatus, translationRequestTracker } from './TranslationRequestTracker.js';
import { UnifiedResultDispatcher } from './UnifiedResultDispatcher.js';
import { UnifiedModeCoordinator } from './UnifiedModeCoordinator.js';
import { statsManager } from '@/features/translation/core/TranslationStatsManager.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { isEligibleForDictionaryUpgrade } from '@/features/translation/utils/translationModeHelper.js';
import {
  appendTranslationDiagnostic,
  createTranslationOperation,
  deriveRecoverySummary,
  finalizeTranslationOperation,
} from '@/features/translation/ir/TranslationOperation.js';
import { createManifestView, createRequestUnitManifest } from '@/features/translation/ir/RequestUnitManifest.js';
import { TerminalExecutionRouter } from '@/features/translation/ir/TerminalExecutionRouter.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'UnifiedTranslationService');

export class UnifiedTranslationService {
  constructor() {
    this.requestTracker = translationRequestTracker;
    this.resultDispatcher = new UnifiedResultDispatcher();
    this.modeCoordinator = new UnifiedModeCoordinator();

    this.translationEngine = null;
    this.backgroundService = null;
    this._operations = new WeakMap();
    this._diagnosticReports = new WeakMap();

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
    // 1. Direct UI Override (Highest Priority)
    // If the request is marked explicitly by the UI (e.g. user manually changed dropdown)
    if (data.isExplicitProvider && data.provider) {
      logger.debug(`[UnifiedTranslationService] Using EXPLICIT UI provider override: ${data.provider}`);
      return data.provider;
    }

    const modeProviders = await getModeProvidersAsync();
    const modeSpecificProvider = modeProviders ? modeProviders[data.mode] : null;

    // 2. Feature-Specific Setting (e.g., Dictionary, Page Translation)
    if (modeSpecificProvider && modeSpecificProvider !== 'default') {
      logger.debug(`[UnifiedTranslationService] Using mode-specific provider for ${data.mode}: ${modeSpecificProvider}`);
      return modeSpecificProvider;
    }

    const uiContexts = [
      MessageContexts.POPUP, MessageContexts.SIDEPANEL, MessageContexts.SELECT_ELEMENT, MessageContexts.PDF_TRANSLATION,
      MessageContexts.PAGE_TRANSLATION_BATCH, MessageContexts.CONTENT, MessageContexts.MOBILE_TRANSLATE
    ];
    
    // 3. Use UI-provided provider as fallback (Standard behavioral consistency)
    if (uiContexts.includes(context) && data.provider) return data.provider;

    // 4. Global default
    return data.provider || await getTranslationApiAsync();
  }

  /**
   * Main entry point for all incoming translation requests.
   */
  async handleTranslationRequest(message, sender) {
    const { messageId, data, context } = message;
    logger.debug(`[UnifiedTranslationService] Received request: ${messageId}, context: ${context}, sessionId: ${data?.sessionId}`);

    if (data) {
      // --- Universal Dictionary Upgrade Detection ---
      // We check for single words here to resolve the correct mode-specific provider
      // before passing the request to the engine.
      let effectiveMode = data.mode || TranslationMode.Selection;
      if (await isEligibleForDictionaryUpgrade(data.text, effectiveMode, data)) {
        logger.debug(`[UnifiedTranslationService] Detected single word, using dictionary mode for provider resolution.`);
        effectiveMode = TranslationMode.Dictionary_Translation;
      }

      data.provider = await this._resolveEffectiveProvider({ ...data, mode: effectiveMode }, context);
    }

    // Calculate estimated characters for limit validation
    let estimatedChars = 0;
    if (typeof data?.text === 'string') {
      estimatedChars = data.text.length;
    } else if (Array.isArray(data?.items)) {
      estimatedChars = data.items.reduce((sum, item) => sum + (typeof item === 'string' ? item.length : (item.text?.length || 0)), 0);
    }
    const mode = data?.mode || 'unknown';

    // 1. Character Limit Validation
    let charLimit = 50000; // Default safety limit
    if (context === MessageContexts.POPUP) {
      charLimit = await getPopupMaxCharsAsync();
    } else if (context === MessageContexts.SIDEPANEL) {
      charLimit = await getSidepanelMaxCharsAsync();
    } else if (mode === TranslationMode.Select_Element || mode === TranslationMode.PDF) {
      charLimit = await getSelectElementMaxCharsAsync();
    } else if (mode === TranslationMode.Selection || context === MessageContexts.SELECTION_MANAGER) {
      charLimit = await getSelectionMaxCharsAsync();
    }

    if (estimatedChars > charLimit) {
      logger.debug(`[UnifiedTranslationService] Text too long for context ${context}/mode ${mode}: ${estimatedChars} > ${charLimit}`);
      return {
        success: false,
        error: {
          type: ErrorTypes.TEXT_TOO_LONG,
          message: `Text too long (${estimatedChars.toLocaleString()} chars). Max allowed for this context is ${charLimit.toLocaleString()} chars.`,
          context: context,
          timestamp: Date.now()
        }
      };
    }

    logger.info(`Request: ${messageId} (${estimatedChars.toLocaleString()} chars, mode: ${mode}, provider: ${data?.provider || 'unknown'})`);

    // Ensure dependencies are available
    if (!this.translationEngine || !this.backgroundService) {
      this.translationEngine = this.translationEngine || globalThis.backgroundService?.translationEngine;
      this.backgroundService = this.backgroundService || globalThis.backgroundService;
      if (!this.translationEngine || !this.backgroundService) throw new Error('Translation service not initialized');
    }

    let tracked = false;
    try {
      if (!MessageFormat.validate(message)) throw new Error('Invalid message format');

      const existingRequest = this.requestTracker.getRequest(messageId);
      if (existingRequest) {
        return {
          success: false,
          error: this.requestTracker.isRequestActive(messageId)
            ? 'Request already processing'
            : 'Request messageId already exists'
        };
      }

      const request = this.requestTracker.createRequest({
        messageId, 
        data, 
        sessionId: data?.sessionId || message.sessionId || messageId, 
        sender, 
        timestamp: Date.now(),
        context
      });
      tracked = true;
      if (!request || request.messageId !== messageId) {
        throw new Error('Translation request registration failed');
      }

      const requestUnitManifest = createRequestUnitManifest(data?.text);
      const operation = createTranslationOperation(messageId, requestUnitManifest);
      const executionContext = {
        operation,
        manifestView: createManifestView(requestUnitManifest),
        onTerminalUnitsAccepted: TerminalExecutionRouter.createTerminalUnitsObserver(operation),
      };
      this._setOperation(request, executionContext.operation);

      let result;
      try {
        result = await this.modeCoordinator.processRequest(request, {
          translationEngine: this.translationEngine,
          backgroundService: this.backgroundService,
          executionContext
        });
      } catch (error) {
        logger.debug('Request failed:', error.message);
        const transition = error.type === 'TIMEOUT'
          ? this.requestTracker.markTimeout(messageId)
          : this.requestTracker.failRequest(messageId, error);
        if (!transition.accepted) return this._createSuppressedResponse(messageId, transition);
        if (error.type === 'TIMEOUT') {
          await this._finalizeAcceptedTimeout(request, messageId, error.message);
        } else {
          this._finalizeDiagnostics(request, executionContext, {
            type: 'OPERATION_FAILED',
            stage: 'service',
            reason: error.message,
            code: error.type,
          });
        }
        return MessageFormat.createErrorResponse(error, messageId);
      }

      const transition = this.requestTracker.completeRequest(messageId, result);
      if (!transition.accepted) return this._createSuppressedResponse(messageId, transition);
      TerminalExecutionRouter.routeTerminalExecution(executionContext.operation, { status: transition.status });
      this._finalizeDiagnostics(request, executionContext, {
        type: transition.status === RequestStatus.FAILED ? 'OPERATION_FAILED' : 'OPERATION_COMPLETED',
        stage: 'service',
        ...(transition.status === RequestStatus.FAILED && {
          reason: typeof result.error === 'object' ? result.error?.message : result.error,
          code: typeof result.error === 'object' ? result.error?.type : undefined,
        }),
      });

      // Special handling for Field mode (direct return)
      if (request.mode === TranslationMode.Field) return result;

      try {
        await this.resultDispatcher.dispatchResult({ messageId, result, request, originalMessage: message });
      } catch (error) {
        logger.error('Result dispatch failed:', error.message);
        return MessageFormat.createErrorResponse(error, messageId);
      }

      // Post-processing stats logging
      this._logSessionStats(request, result, messageId);

      return result;

    } catch (error) {
      logger.debug('Request setup failed:', error.message);
      if (tracked && this.requestTracker.isRequestActive(messageId)) {
        const transition = this.requestTracker.failRequest(messageId, error);
        if (!transition.accepted) return this._createSuppressedResponse(messageId, transition);
        const request = this.requestTracker.getRequest(messageId);
        const operation = this._getOperation(request);
        this._finalizeDiagnostics(request, { operation }, {
          type: 'OPERATION_FAILED',
          stage: 'service',
          reason: error.message,
          code: error.type,
        });
      }
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
    } else if (!isMultiBatch || ((mode === TranslationMode.Select_Element || mode === TranslationMode.PDF) && !result.streaming)) {
      statsManager.printSummary(summaryId, { 
        status: 'Session', success: result.success, 
        clear: mode !== TranslationMode.Select_Element && mode !== TranslationMode.PDF 
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
   * Cancel an active service-owned request.
   * User-cancellation entry point only; timeout stays outside this API.
   * Returns { handled } so callers can fall back for non-service requests.
   */
  async cancelRequest(messageId, reason = ActionReasons.USER_CANCELLED) {
    logger.info(`Cancelling request: ${messageId}`);
    const request = this.requestTracker.getRequest(messageId);
    if (!request) return { handled: false, success: false, error: 'Request not found' };

    const cancellation = this.requestTracker.cancelRequest(messageId, reason);
    if (!cancellation.accepted) return { handled: true, success: false, error: cancellation.reason };

    const operation = this._getOperation(request);
    TerminalExecutionRouter.routeTerminalExecution(operation, { status: cancellation.status });
    this._finalizeDiagnostics(request, { operation }, {
      type: 'OPERATION_CANCELLED',
      stage: 'service',
      reason: cancellation.reason,
      cancelled: true,
    });
    if (this.translationEngine) this.translationEngine.cancelTranslation(messageId);
    
    await this.resultDispatcher.dispatchCancellation({ messageId, request });
    return { handled: true, success: true };
  }

  async handleTimeout(messageId, reason = 'Translation timed out') {
    const request = this.requestTracker.getRequest(messageId);
    if (!request) return { handled: false, success: false, error: 'Request not found' };
    const timeout = this.requestTracker.markTimeout(messageId);
    if (!timeout.accepted) return { handled: true, success: false, error: timeout.reason };
    await this._finalizeAcceptedTimeout(request, messageId, reason);
    return { handled: true, success: true };
  }

  async _finalizeAcceptedTimeout(request, messageId, reason) {
    const operation = this._getOperation(request);
    this._finalizeDiagnostics(request, { operation }, {
      type: 'OPERATION_TIMEOUT',
      stage: 'service',
      reason,
      code: 'TIMEOUT',
    });
    try {
      await this.translationEngine?.cancelTranslation(messageId);
    } catch (error) {
      logger.debug('Timeout cancellation failed:', error.message);
    }
  }

  _createCancelledResponse(messageId) {
    return {
      success: false,
      cancelled: true,
      messageId,
      error: {
        type: ErrorTypes.USER_CANCELLED,
        message: 'Translation cancelled by user'
      }
    };
  }

  _createSuppressedResponse(messageId, transition) {
    if (transition.status === 'cancelled') return this._createCancelledResponse(messageId);
    if (transition.status === 'timeout') {
      return {
        success: false,
        timedOut: true,
        messageId,
        error: { type: ErrorTypes.TRANSLATION_TIMEOUT, message: 'Translation timed out' }
      };
    }
    return {
      success: false,
      suppressed: true,
      messageId,
      reason: transition.reason,
      status: transition.status
    };
  }

  _finalizeDiagnostics(request, executionContext, terminalFact) {
    appendTranslationDiagnostic(executionContext, terminalFact);
    const report = finalizeTranslationOperation(executionContext);
    if (report) {
      this._setDiagnosticReport(request, report);
      const terminalStatus = {
        OPERATION_COMPLETED: 'completed',
        OPERATION_FAILED: 'failed',
        OPERATION_CANCELLED: 'cancelled',
        OPERATION_TIMEOUT: 'timeout',
      }[terminalFact.type];
      if (terminalStatus) {
        statsManager.recordOperationQuality(deriveRecoverySummary(report, {
          terminalStatus,
          operationSucceeded: terminalStatus === 'completed',
        }));
      }
    }
    this._clearOperation(request);
  }

  _setOperation(request, operation) {
    this._operations.set(request, operation);
  }

  _getOperation(request) {
    return this._operations.get(request) || null;
  }

  _clearOperation(request) {
    this._operations.delete(request);
  }

  _setDiagnosticReport(request, report) {
    this._diagnosticReports.set(request, report);
    this.requestTracker._setDiagnosticReport?.(request, report);
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
