/**
 * Base AI Provider - Enhanced base class for AI translation services (Gemini, OpenAI, etc.)
 * Provides centralized batching, prompt preparation, and streaming support for AI models.
 */

import { BaseProvider } from "@/features/translation/providers/BaseProvider.js";
import {
  getProviderStreaming,
  getProviderBatching,
  getProviderFeatures
} from "@/features/translation/core/ProviderConfigurations.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ResponseFormat } from "@/shared/config/translationConstants.js";
import { AIConversationHelper } from "./utils/AIConversationHelper.js";
import { AIResponseParser } from "./utils/AIResponseParser.js";
import { AITextProcessor } from "./utils/AITextProcessor.js";
import { TranslationMode, getProviderOptimizationLevelAsync } from "@/shared/config/config.js";
import { AIStreamManager } from "./utils/AIStreamManager.js";
import { isCancellationError } from "@/shared/error-management/ErrorMatcher.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { appendTranslationDiagnostic } from "@/features/translation/ir/TranslationOperation.js";
import { TranslationCallPurpose } from "@/features/translation/providers/ProviderConstants.js";
import { classifyRecoveryFailure } from "@/features/translation/ir/RecoveryClassification.js";

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'BaseAIProvider');

function createConversationCommitCandidate() {
  let staged = null;
  let settled = false;
  return {
    stage(payload) {
      if (!settled && !staged) staged = payload;
    },
    async commit() {
      if (settled || !staged) return;
      settled = true;
      await AIConversationHelper.updateSessionHistory(
        staged.sessionId,
        staged.userContent,
        staged.assistantContent,
        { callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION }
      );
    },
    discard() {
      if (!settled) {
        settled = true;
        staged = null;
      }
    }
  };
}

function getSelectiveRecoveryPlan(parsed, texts) {
  const invalidUnits = Array.isArray(parsed?.invalidUnits) ? parsed.invalidUnits : [];
  const mappingFacts = parsed?.mappingFacts;
  if (!Array.isArray(texts)
      || !Array.isArray(parsed?.results)
      || parsed.results.length !== texts.length) {
    return null;
  }
  if (!mappingFacts?.identityReliable) {
    return null;
  }
  if (!mappingFacts.complete) {
    return null;
  }
  if (mappingFacts.ambiguous) {
    return null;
  }
  if (invalidUnits.length === 0) {
    return null;
  }

  const indexes = invalidUnits.map(({ requestIndex }) => requestIndex);
  if (indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= texts.length)) {
    return null;
  }
  const invalidIndexes = [...new Set(indexes)].sort((a, b) => a - b);
  if (invalidIndexes.length !== indexes.length) {
    return null;
  }
  if (invalidIndexes.length >= texts.length) {
    return null;
  }
  if (invalidIndexes.some((index) => parsed.results[index] === undefined)) {
    return null;
  }

  return {
    invalidIndexes,
    recoveryTexts: invalidIndexes.map((index) => texts[index]),
  };
}

function validateSelectiveRecoveryResult(recoveryResult, expectedCount) {
  const values = Array.isArray(recoveryResult) ? recoveryResult : [recoveryResult];
  if (values.length !== expectedCount || values.some((value) => typeof value !== 'string' || value.trim() === '')) {
    const error = new Error(`Selective structured recovery returned ${values.length} invalid results; expected ${expectedCount}`);
    error.type = ErrorTypes.API_RESPONSE_INVALID;
    throw error;
  }
  return values;
}

function collectRecoveryViolationCodes(parsed) {
  const invalidUnits = Array.isArray(parsed?.invalidUnits) ? parsed.invalidUnits : [];
  const codes = new Set();
  for (const unit of invalidUnits) {
    if (Array.isArray(unit?.violationCodes)) {
      for (const code of unit.violationCodes) {
        if (typeof code === 'string') codes.add(code);
      }
    }
  }
  return [...codes];
}

function formatDiagnosticId(value, maxLength = 32) {
  if (typeof value !== 'string' || !value) return null;
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}…`;
}

export class BaseAIProvider extends BaseProvider {
  // AI-specific capabilities - to be overridden by subclasses
  static isAI = true;
  static supportsDictionary = true;

  /**
   * Configuration Resolvers - Unified with ProviderConfigurations.js and User Levels
   */
  async getSupportsStreaming() {
    const level = await getProviderOptimizationLevelAsync(this.providerName);
    return getProviderStreaming(this.providerName, level).enabled;
  }

  async getBatchingConfig(mode = null) {
    const level = await getProviderOptimizationLevelAsync(this.providerName);
    return getProviderBatching(this.providerName, mode, level);
  }

  async getBatchStrategy(mode = null) {
    const config = await this.getBatchingConfig(mode);
    return config.strategy || 'json';
  }

  async getSupportsImageTranslation() {
    const level = await getProviderOptimizationLevelAsync(this.providerName);
    return getProviderFeatures(this.providerName, level).supportsImageTranslation;
  }

  constructor(providerName) {
    super(providerName);
  }

  /**
   * Enhanced batch translation with streaming support
   */
  async _batchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority, sessionId, expectedFormat, options = {}) {
    const supportsStreaming = await this.getSupportsStreaming();
    const batchStrategy = await this.getBatchStrategy(translateMode);

    // 1. Try streaming if supported and beneficial
    // FIX: Only enter streaming path if thresholds are met OR if already initialized by coordinator
    const shouldStream = await this._shouldUseStreaming(texts, messageId, engine, translateMode);
    const isAlreadyStreaming = messageId && AIStreamManager.isStreamActive(messageId);

    if (supportsStreaming && (shouldStream || isAlreadyStreaming)) {
      return this._streamingBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority, sessionId, expectedFormat, options);
    }

    // 2. If not streaming but segments exist, use the provider's batch strategy (e.g. smart JSON batching)
    if (texts.length >= 1 && (batchStrategy === 'json' || batchStrategy === 'smart')) {
      return this._translateBatch(texts, sourceLang, targetLang, translateMode, abortController, engine, messageId, sessionId, options, expectedFormat, priority);
    }

    // 3. Fallback to traditional sequential batching for single segments or non-JSON providers
    return this.executeSequentialBatch(texts, sourceLang, targetLang, {
      translateMode,
      engine,
      messageId,
      abortController,
      priority,
      sessionId,
      expectedFormat,
      contextMetadata: options,
    });
  }

  /**
   * Entry point for image translation with rate limiting
   */
  async translateImage(base64Image, sourceLang, targetLang, options = {}) {
    const { priority, sessionId, abortController, messageId } = options;
    const context = `${this.providerName.toLowerCase()}-image-translation`;

    return await this._executeWithRateLimit(
      (opts) => this._translateImageInternal(base64Image, sourceLang, targetLang, { ...opts, ...options }),
      context,
      priority,
      { sessionId, abortController, messageId }
    );
  }

  /**
   * Abstract method for internal image translation logic
   * @protected
   */
  async _translateImageInternal() {
    throw new Error(`translateImage not supported by ${this.providerName}`);
  }

  /**
   * Determine if streaming should be used for this request
   */
  async _shouldUseStreaming(texts, messageId, engine, translateMode) {
    // Disable internal AI streaming for Select Element or Page modes 
    if (translateMode === TranslationMode.Select_Element || translateMode === TranslationMode.Page || translateMode === TranslationMode.PDF) {
      return false;
    }

    const supportsStreaming = await this.getSupportsStreaming();
    return supportsStreaming && 
           messageId && 
           engine && 
           (texts.length > 1 || AITextProcessor.getTotalComplexity(texts) > 100);
  }

  /**
   * Batch translation implementation (e.g. using JSON)
   * @protected
   */
  async _translateBatch(texts, sourceLang, targetLang, translateMode, abortController, engine, messageId, sessionId, contextMetadata = null, expectedFormat = null, priority = null) {
    const structuredFormat = expectedFormat || ResponseFormat.JSON_ARRAY;
    // Per-call completion slot: the adapter records the completion during its
    // physical response, and recordProviderCompletion publishes the frozen
    // record into this fresh per-call slot. Parallel batches share one
    // operation, so the slot is derived per call to keep the correlation
    // response-scoped (no "latest completion" shared state).
    const baseExecutionContext = contextMetadata?.executionContext;
    const completionRef = baseExecutionContext ? { record: null } : null;
    const callExecutionContext = baseExecutionContext
      ? { ...baseExecutionContext, completionRef }
      : null;
    const callContextMetadata = callExecutionContext
      ? { ...contextMetadata, executionContext: callExecutionContext }
      : contextMetadata;
    const conversationCommitCandidate = (
      structuredFormat === ResponseFormat.JSON_ARRAY || structuredFormat === ResponseFormat.JSON_OBJECT
    ) ? createConversationCommitCandidate() : null;
    let acceptedResults;
    try {
      const response = await this.executeStructuredBatch(texts, sourceLang, targetLang, {
        translateMode,
        abortController,
        messageId,
        sessionId,
        contextMetadata: callContextMetadata,
        expectedFormat,
        priority,
        conversationCommitCandidate,
      });

      // Stats recording is handled by ProviderRequestEngine. 
      // Orchestrators (like OptimizedJsonHandler or UnifiedService) handle the reporting.
      const executionContext = callExecutionContext || contextMetadata?.executionContext;

      const parsed = AIResponseParser.parseBatchResult(
        response,
        texts.length,
        texts,
        this.providerName,
        expectedFormat || ResponseFormat.JSON_ARRAY,
        executionContext,
        executionContext?.manifestView,
        completionRef?.record ?? null,
      );

      // Recovery classification (ADR-016 P4): only responses entering structured
      // recovery are classified. It combines the normalized completion of this
      // primary response with parser/validator facts to describe WHY it failed.
      // Accepted responses remain unclassified; recovery policy, retry, and
      // recovery shape are unchanged — classification is decision input, not policy.
      const recoveryClassification = parsed.contractViolation
        ? classifyRecoveryFailure({
            completion: completionRef?.record ?? null,
            parseFailed: parsed.parseFailed === true,
            contractViolation: parsed.contractViolation === true,
            violationCodes: collectRecoveryViolationCodes(parsed),
          })
        : null;

      if (completionRef?.record) {
        logger.debug(`[${this.providerName}] Provider completion record`, {
          provider: completionRef.record.provider,
          model: completionRef.record.model,
          termination: completionRef.record.termination,
          responseId: formatDiagnosticId(completionRef.record.responseId),
          usage: completionRef.record.usage,
        });
      }

      // Structured recovery: the parser reports facts only; recovery ownership stays
      // here. A contract violation triggers exactly one sequential re-request.
      // The sequential pass returns a scalar for a single segment; normalize it to
      // the canonical structured-batch array shape so downstream contract cleaning
      // (ProviderCoordinator._cleanResult) receives the same shape as the normal path.
      if (parsed.contractViolation) {
        const selectivePlan = getSelectiveRecoveryPlan(parsed, texts);
        const recoveryStrategy = selectivePlan ? 'SELECTIVE' : 'FULL';
        const mappingFacts = parsed.mappingFacts || {};
        conversationCommitCandidate?.discard();
        logger.warn(`[${this.providerName}] Structured response violated its contract; sequential recovery started`);
        logger.debug(`[${this.providerName}] Structured recovery triggered`, {
          classification: recoveryClassification?.classification ?? null,
          termination: recoveryClassification?.termination ?? null,
          parseFailed: parsed.parseFailed === true,
          contractViolation: parsed.contractViolation === true,
          invalidUnitCount: Array.isArray(parsed.invalidUnits) ? parsed.invalidUnits.length : 0,
          violationCodes: collectRecoveryViolationCodes(parsed),
          mappingFacts: {
            identityReliable: mappingFacts.identityReliable ?? null,
            complete: mappingFacts.complete ?? null,
            ambiguous: mappingFacts.ambiguous ?? null,
          },
          strategy: recoveryStrategy,
          unitCount: texts.length,
        });
        appendTranslationDiagnostic(executionContext, {
          type: 'RECOVERY_TRIGGERED',
          stage: 'recovery',
          provider: this.providerName,
          code: 'CONTRACT_VIOLATION',
          count: texts.length,
          classification: recoveryClassification?.classification ?? null,
        });

        let recoveryResult;
        try {
          recoveryResult = await this.executeSequentialBatch(selectivePlan?.recoveryTexts || texts, sourceLang, targetLang, {
            translateMode,
            engine,
            messageId,
            abortController,
            priority,
            sessionId,
            expectedFormat: ResponseFormat.STRING,
            contextMetadata,
            repairContext: parsed.repairContext,
            callPurpose: TranslationCallPurpose.STRUCTURED_RECOVERY,
          });
        } catch (error) {
          if (!abortController?.signal?.aborted && !isCancellationError(error)) {
            appendTranslationDiagnostic(executionContext, {
              type: 'RECOVERY_FAILED',
              stage: 'recovery',
              provider: this.providerName,
              reason: error.message,
              ...(typeof error.type === 'string' && { code: error.type }),
            });
            logger.debug(`[${this.providerName}] Structured recovery failed`, {
              classification: recoveryClassification?.classification ?? null,
              strategy: recoveryStrategy,
              errorType: typeof error.type === 'string' ? error.type : null,
            });
          }
          throw error;
        }

        const recoveryValues = selectivePlan
          ? validateSelectiveRecoveryResult(recoveryResult, selectivePlan.invalidIndexes.length)
          : (Array.isArray(recoveryResult) ? recoveryResult : [recoveryResult]);
        const finalResults = selectivePlan
          ? (() => {
            const merged = [...parsed.results];
            selectivePlan.invalidIndexes.forEach((index, recoveryIndex) => {
              merged[index] = recoveryValues[recoveryIndex];
            });
            return merged;
          })()
          : recoveryValues;

        appendTranslationDiagnostic(executionContext, {
          type: 'RECOVERY_SUCCEEDED',
          stage: 'recovery',
          provider: this.providerName,
        });
        logger.debug(`[${this.providerName}] Structured recovery completed`, {
          classification: recoveryClassification?.classification ?? null,
          strategy: recoveryStrategy,
          recoveredUnitCount: recoveryValues.length,
        });
        return finalResults;
      }

      acceptedResults = parsed.results;
    } catch (error) {
      conversationCommitCandidate?.discard();
      // Error accounting is owned exclusively by ProviderRequestEngine.executeApiCall:
      // TranslationStatsManager.errors counts failed physical HTTP calls only.
      // This batch boundary only logs and rethrows; it must not double-record transport
      // failures or classify cancellation, timeout, or pre-transport rejection as one.
      logger.debug(`[${this.providerName}] Batch translation failed:`, error.message);

      // EVERY error is thrown - never return original text as a "successful" translation.
      // - Transient (Network, 429, 5xx): thrown so QueueManager can retry.
      // - Fatal (401, 403): thrown to inform the UI and stop the process.
      // - Non-fatal, non-transient: thrown so the failure surfaces loudly instead of
      //   silently reporting the untranslated original as a success.
      throw error;
    }

    // Late-settlement guard: the outer handler (e.g. OptimizedJsonHandler) may
    // abort the signal immediately after the provider response resolved but
    // before this commit point. Once aborted, the user never receives the
    // result, so the conversation must not be written. Discard the staged
    // candidate and fail loudly as USER_CANCELLED.
    if (abortController?.signal?.aborted) {
      conversationCommitCandidate?.discard();
      const cancelError = new Error('Translation cancelled by user');
      cancelError.name = 'AbortError';
      cancelError.type = ErrorTypes.USER_CANCELLED;
      throw cancelError;
    }

    await conversationCommitCandidate?.commit();
    return acceptedResults;
  }

  async executeStructuredBatch(texts, sourceLang, targetLang, {
    translateMode,
    abortController,
    messageId,
    sessionId,
    contextMetadata = null,
    expectedFormat = null,
    priority = null,
    conversationCommitCandidate = null,
  } = {}) {
    const { systemPrompt, userText } = await this._preparePromptAndText(texts, sourceLang, targetLang, translateMode, contextMetadata, sessionId);
    logger.debugLazy(() => [`[${this.providerName}] Batch Prompt preparation complete`, {
      systemPrompt,
      userText: typeof userText === 'string' ? userText : JSON.parse(userText)
    }]);
    const finalUserText = typeof userText === 'string' ? userText : JSON.stringify(userText);
    const context = `${this.providerName.toLowerCase()}-batch-translation`;
    return this._executeWithRateLimit(
      (opts) => this._callAI(systemPrompt, finalUserText, {
        ...opts,
        abortController,
        messageId,
        sessionId,
        mode: translateMode,
        sourceLang,
        targetLang,
        isBatch: true,
        expectedFormat: expectedFormat || ResponseFormat.JSON_ARRAY,
        executionContext: contextMetadata?.executionContext,
        callPurpose: TranslationCallPurpose.PRIMARY_TRANSLATION,
        conversationCommitCandidate,
      }),
      context,
      priority,
      { sessionId, abortController, messageId, executionContext: contextMetadata?.executionContext }
    );
  }

  async executeSequentialBatch(texts, sourceLang, targetLang, {
    translateMode,
    engine,
    messageId,
    abortController,
    priority,
    sessionId,
    expectedFormat,
    contextMetadata = {},
    repairContext = null,
    callPurpose,
  } = {}) {
    return this._traditionalBatchTranslate(
      texts, sourceLang, targetLang, translateMode, engine, messageId, abortController,
      priority,
      sessionId,
      expectedFormat,
      {
        ...contextMetadata,
        ...(repairContext && { repairContext }),
        ...(callPurpose && { callPurpose }),
      }
    );
  }

  /**
   * Traditional sequential translation for small segments
   */
  async _traditionalBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority, sessionId, expectedFormat, options = {}) {
    const results = [];
    const context = `${this.providerName.toLowerCase()}-traditional-sequential`;
    const callPurpose = options.callPurpose === TranslationCallPurpose.STRUCTURED_RECOVERY
      ? TranslationCallPurpose.STRUCTURED_RECOVERY
      : TranslationCallPurpose.PRIMARY_TRANSLATION;

    for (let i = 0; i < texts.length; i++) {
      if (abortController?.signal?.aborted) {
        const cancelError = new Error('Translation cancelled by user');
        cancelError.name = 'AbortError';
        cancelError.type = ErrorTypes.USER_CANCELLED;
        throw cancelError;
      }
      
      const text = texts[i];
      const { systemPrompt, userText } = await this._preparePromptAndText(text, sourceLang, targetLang, translateMode, options, sessionId);
      
      logger.debugLazy(() => [`[${this.providerName}] Traditional Prompt preparation complete`, { systemPrompt, userText }]);
      const chunkContext = `${context}-segment-${i + 1}/${texts.length}`;

      try {
        const response = await this._executeWithRateLimit(
          (opts) => this._callAI(systemPrompt, userText, {
            ...opts,
            abortController,
            messageId,
            sessionId,
            mode: translateMode,
            sourceLang,
            targetLang,
            expectedFormat: expectedFormat || ResponseFormat.STRING,
            executionContext: options.executionContext,
            callPurpose,
          }),
          chunkContext,
          priority,
          { sessionId, abortController, messageId }
        );
        
        results.push(AIResponseParser.cleanAIResponse(response, expectedFormat || ResponseFormat.STRING));
      } catch (error) {
        logger.error(`[${this.providerName}] Traditional segment translation failed:`, error.message);
        // No silent success: a failed segment fails the batch loudly. The error
        // propagates for retry (transient) or explicit failure reporting (fatal/permanent).
        throw error;
      }
    }
    return results.length === 1 && texts.length === 1 ? results[0] : results;
  }

  /**
   * Streaming batch translation implementation
   * Sends segments in multiple batches for real-time updates
   * @protected
   */
  async _streamingBatchTranslate(texts, sourceLang, targetLang, translateMode, engine, messageId, abortController, priority, sessionId, expectedFormat, options = {}) {
    logger.debug(`[${this.providerName}] Starting streaming translation for ${texts.length} segments`);

    // Ensure streaming is initialized in the central manager
    if (messageId && engine && !AIStreamManager.isStreamActive(messageId)) {
      try {
        const sender = typeof engine.getStreamingSender === 'function' ? engine.getStreamingSender(messageId) : null;
        if (sender) {
          // If we have sender info, we can safely initialize the stream even if coordinator skipped it
          const { streamingManager } = await import("@/features/translation/core/StreamingManager.js");
          streamingManager.initializeStream(messageId, sender, this, texts, sessionId);
          logger.debug(`[${this.providerName}] Late-initialized stream for messageId: ${messageId}`);
        }
      } catch (err) {
        logger.warn(`[${this.providerName}] Failed to late-initialize stream:`, err.message);
      }
    }

    // Check one last time if we can actually stream
    const canStream = messageId && AIStreamManager.isStreamActive(messageId);
    if (!canStream) {
      logger.debug(`[${this.providerName}] Streaming not active for ${messageId}, falling back to standard batch`);
      return this._translateBatch(texts, sourceLang, targetLang, translateMode, abortController, engine, messageId, sessionId, options, expectedFormat, priority);
    }

    // Get batching configuration
    const batchingConfig = await this.getBatchingConfig(translateMode);
    const characterLimit = batchingConfig.characterLimit || 5000;

    // 1. Pre-process segments: Split oversized single segments into multiple pieces
    // This ensures that even a single 30k char text is streamed in multiple batches
    const fragmentedTexts = [];
    for (const text of texts) {
      const isObject = typeof text === 'object' && text !== null;
      const content = isObject ? (text.t || text.text || "") : text;
      
      if (typeof content === 'string' && content.length > characterLimit && !AITextProcessor.hasPlaceholders([text])) {
        logger.debug(`[${this.providerName}] Splitting oversized segment (${content.length} chars) for streaming`);
        const chunks = AITextProcessor.smartChunkWithPlaceholders(content, characterLimit);
        
        // Convert chunks back to the original format (preserving IDs if they were objects)
        const typedChunks = chunks.map(chunk => isObject ? { ...text, t: chunk, text: chunk } : chunk);
        fragmentedTexts.push(...typedChunks);
      } else {
        fragmentedTexts.push(text);
      }
    }

    const batches = AITextProcessor.createOptimalBatches(fragmentedTexts, this.providerName, translateMode, batchingConfig);
    const allResults = [];

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      if (abortController?.signal?.aborted || (engine && engine.isCancelled?.(messageId))) {
        const cancelError = new Error('Translation cancelled by user');
        cancelError.type = 'USER_CANCELLED';
        throw cancelError;
      }

      const batch = batches[batchIndex];

      try {
        const batchResponse = await this._translateBatch(
          batch,
          sourceLang,
          targetLang,
          translateMode,
          abortController,
          engine,
          messageId,
          sessionId,
          options,
          expectedFormat,
          priority,
        );

        const batchResults = Array.isArray(batchResponse) ? batchResponse : [batchResponse];
        allResults.push(...batchResults);

        // Stream batch results to content script
        if (engine && messageId) {
          await AIStreamManager.streamBatchResults(
            this.providerName,
            batchResults,
            batch,
            batchIndex,
            messageId,
            engine,
            sourceLang,
            targetLang
          );
        }

        logger.debug(`[${this.providerName}] Batch ${batchIndex + 1}/${batches.length} completed (${batchResults.length} segments)`);
      } catch (error) {
        logger.error(`[${this.providerName}] Batch ${batchIndex + 1} failed:`, error);

        // Stream error to content script
        if (engine && messageId) {
          await AIStreamManager.streamErrorResults(this.providerName, error, batchIndex, messageId, engine);
        }

        throw error;
      }
    }

    // Send stream end notification
    if (engine && messageId) {
      await AIStreamManager.sendStreamEnd(this.providerName, messageId, engine, { targetLanguage: targetLang });
    }

    return allResults;
  }

  /**
   * Helper to prepare the prompt and text for AI models
   * @protected
   */
  async _preparePromptAndText(texts, sourceLang, targetLang, translateMode, contextMetadata, sessionId = null) {
    return await AIConversationHelper.preparePromptAndText(texts, sourceLang, targetLang, translateMode, this.constructor.type, sessionId, contextMetadata);
  }

  /**
   * Abstract method to call the actual AI API
   * @protected
   */
  async _callAI() {
    throw new Error(`_callAI not implemented by ${this.providerName}`);
  }
}
