/**
 * Optimized JSON Handler - Specialized strategy for Select Element translation
 * Manages complex batching, adaptive delays, and real-time result streaming.
 */

import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import { MessageFormat } from "@/shared/messaging/core/MessagingCore.js";
import { ResponseFormat } from "@/shared/config/translationConstants.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { TranslationMode, getAIConversationHistoryEnabledAsync } from "@/shared/config/config.js";
import browser from "webextension-polyfill";
import { statsManager } from '@/features/translation/core/TranslationStatsManager.js';
import { isFatalError, matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { appendTranslationDiagnostic } from '@/features/translation/ir/TranslationOperation.js';
import { createManifestViewFromUnits } from '@/features/translation/ir/RequestUnitManifest.js';
import { TranslationContractValidator } from '@/features/translation/core/TranslationContractValidator.js';
import { parseV3Intervals } from '@/features/translation/core/V3IntervalParser.js';
import { TRANSLATION_BATCH_EXECUTION_TIMEOUT_MS } from '@/shared/constants/translation.js';
import { TranslationCallPurpose, nameToRegistryId } from '@/features/translation/providers/ProviderConstants.js';
import { findProviderById } from '@/features/translation/providers/ProviderManifest.js';
import { resolveOperationSourceLanguage } from '@/features/translation/core/OperationSourceLanguageResolver.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'OptimizedJsonHandler');
const MAX_PARENT_RECOVERIES_PER_BATCH = 2;

function createAbortError(signal, message = 'Translation task cancelled') {
  const isUserCancellation = signal?.reason === 'user-cancelled' || signal?.reason === 'user_cancelled';
  const error = new Error(message);
  error.name = 'AbortError';
  if (isUserCancellation) {
    error.type = ErrorTypes.USER_CANCELLED;
    error.isCancelled = true;
  } else {
    error.operationAborted = true;
    error.cancellationReason = typeof signal?.reason === 'string'
      && signal.reason
      && signal.reason !== 'timeout'
      ? signal.reason
      : 'operation-abort';
  }
  return error;
}

function getParentRecoveryCharacterLimit(primaryFragmentLimit) {
  // Halve marker density without producing tiny recovery calls; never exceed primary policy.
  return Math.min(primaryFragmentLimit, Math.max(500, Math.floor(primaryFragmentLimit / 2)));
}

function getParentRecoveryStageLimit(primaryFragmentLimit, recoveryStage) {
  if (recoveryStage === 2) return getParentRecoveryCharacterLimit(primaryFragmentLimit);
  return Math.min(primaryFragmentLimit, Math.max(500, Math.floor(primaryFragmentLimit * 0.75)));
}

function markerSummary(text, maxMarkers = 32) {
  const matches = typeof text === 'string'
    ? text.match(/@@TI_SEG_[^@]*@@/g) || []
    : [];
  return {
    count: matches.length,
    ids: matches.slice(0, maxMarkers),
    idsTruncated: matches.length > maxMarkers,
  };
}

function recoveryTextSummary(text) {
  const markers = markerSummary(text);
  return {
    length: typeof text === 'string' ? text.length : 0,
    markerCount: markers.count,
    markerIds: markers.ids,
    markerIdsTruncated: markers.idsTruncated,
  };
}

function leadingIntervalSummary(text) {
  const parsed = parseV3Intervals(typeof text === 'string' ? text : '', { grammar: 'ti' });
  const leading = parsed.intervals[0]?.text || '';
  return {
    length: leading.length,
    firstMarkerId: parsed.markers[0]?.normalizedIdentity || null,
  };
}

export class OptimizedJsonHandler {
  /**
   * Orchestrates the optimized translation process.
   */
  async execute(engine, data, providerInstance, originalSourceLang, originalTargetLang, messageId, sender, uiContext = 'unknown', executionContext = null) {
    const { text, sourceLanguage, mode, options } = data;
    let targetLanguage = data.targetLanguage;
    const localDeadlineAt = Date.now() + TRANSLATION_BATCH_EXECUTION_TIMEOUT_MS;
    const suppliedDeadlineAt = executionContext?.deadlineAt;
    const operationDeadlineAt = Number.isFinite(suppliedDeadlineAt)
      ? Math.min(suppliedDeadlineAt, localDeadlineAt)
      : localDeadlineAt;
    const operationExecutionContext = {
      ...(executionContext || {}),
      deadlineAt: operationDeadlineAt,
    };
    const sessionId = data.sessionId || messageId;
    const tabId = sender?.tab?.id;
    const frameId = typeof sender?.frameId === 'number' ? sender.frameId : null;
    const abortController = engine.lifecycleRegistry.getAbortController(messageId) || 
                             engine.lifecycleRegistry.registerRequest(messageId, typeof text === 'string' ? text.substring(0, 100) : '', uiContext);
    if (!abortController) {
      const cancellationReason = engine.lifecycleRegistry.getCancellationReason?.(messageId)
        || 'operation-abort';
      const error = new Error('Translation operation aborted before execution');
      if (cancellationReason === 'user-cancelled') {
        error.type = ErrorTypes.USER_CANCELLED;
      } else {
        error.operationAborted = true;
        error.cancellationReason = cancellationReason;
      }
      throw error;
    }

    let hasErrors = false;
    let lastError = null;
    let detectedSourceLanguage = sourceLanguage;
    let fragmentedUnits;
    const historyEnabled = await getAIConversationHistoryEnabledAsync();
    const laneLabel = historyEnabled ? 'ordered history lane' : 'stateless parallel lane';

    try {
      const segments = typeof text === 'string' ? JSON.parse(text) : text;
      const v3Parents = new Map(
        (Array.isArray(segments) ? segments : [])
          .filter((segment) => segment && typeof segment === 'object' && (segment.blockId != null || segment.b != null))
          .map((segment) => [segment.blockId ?? segment.b, segment])
      );
      const { getProviderConfiguration } = await import('@/features/translation/core/ProviderConfigurations.js');
      const { getProviderOptimizationLevelAsync } = await import('@/shared/config/config.js');
      
      const level = await getProviderOptimizationLevelAsync(providerInstance.providerName);
      const providerConfig = getProviderConfiguration(providerInstance.providerName, level);
      
      // Mode-specific overrides for structured batch translation
      const modeOverrides = providerConfig?.batching?.modeOverrides || {};
      const structuredOverride = mode === TranslationMode.Select_Element
        ? (modeOverrides.select_element || modeOverrides[TranslationMode.Select_Element] || {})
        : mode === TranslationMode.PDF
          ? (modeOverrides.pdf_translation || modeOverrides.pdf || modeOverrides[TranslationMode.PDF] || {})
          : {};
      const optimalSize = structuredOverride.optimalSize || providerConfig?.batching?.optimalSize || 25;
      const characterLimit = structuredOverride.characterLimit || providerConfig?.batching?.characterLimit || providerConfig?.batching?.maxChars || 5000;

      const manifestUnits = executionContext?.manifestView?.units;
      const hasManifestMembership = Array.isArray(manifestUnits) && manifestUnits.length === segments.length
        && typeof engine.createIntelligentMembershipBatches === 'function';
      const batches = hasManifestMembership
        ? engine.createIntelligentMembershipBatches(segments, manifestUnits, optimalSize, characterLimit)
        : engine.createIntelligentBatches(segments, optimalSize, characterLimit);

      let bypassAutoSequentialGate = false;
      if (!historyEnabled && sourceLanguage === 'auto' && batches.length > 0) {
        const providerId = nameToRegistryId(providerInstance.providerName) || providerInstance.providerName;
        const providerManifest = findProviderById(providerId);
        const supportsBilingual = providerManifest?.features?.includes('bilingual') ?? true;

        try {
          const operationResolution = await resolveOperationSourceLanguage({
            items: segments,
            sourceLanguage,
            targetLanguage,
            originalSourceLanguage: originalSourceLang,
            originalMode: data.originalMode || mode,
            mode,
            providerName: providerInstance.providerName,
            supportsBilingual,
            historyEnabled: false,
            url: options?.url ?? data.url,
            tabId: options?.tabId ?? tabId,
          });

          bypassAutoSequentialGate = operationResolution.canBypassSequentialGate === true;
          if (bypassAutoSequentialGate) {
            detectedSourceLanguage = operationResolution.effectiveSourceLanguage;
            targetLanguage = operationResolution.effectiveTargetLanguage;
            logger.debug('[JsonHandler] AUTO source resolved locally before dispatch', {
              language: detectedSourceLanguage,
              provenance: operationResolution.detection?.provenance,
              confidence: operationResolution.detection?.confidence,
              bypassReason: operationResolution.bypassReason,
              batchCount: batches.length,
            });
          } else {
            logger.debug('[JsonHandler] AUTO source using first-batch fallback', {
              bypassReason: operationResolution.bypassReason,
              batchCount: batches.length,
            });
          }
        } catch (resolutionError) {
          logger.debug('[JsonHandler] AUTO source resolution unavailable; using first-batch fallback', {
            reason: resolutionError?.message || 'UNKNOWN_RESOLUTION_ERROR',
            batchCount: batches.length,
          });
        }
      }

      logger.debug(`[JsonHandler] Executing ${batches.length} batches for ${segments.length} segments (Concurrency: ${providerConfig.rateLimit.maxConcurrent})`);
      logger.debug(`[JsonHandler] Structured batch ${laneLabel} (${mode})`);

      // Tracks whether the operation's semantic source/target pair is settled.
      // Starts as the bypass decision, and is upgraded once the first resolved
      // batch proves a concrete source (AUTO denied path). Later batches and
      // parent recovery inherit this fact so ProviderCoordinator does not
      // re-run semantic swap/detection per batch.
      let languagePairResolved = bypassAutoSequentialGate;

      const self = this;
      let completedBatchCount = 0;
      const batchResults = Array.from({ length: batches.length }, () => []);
      fragmentedUnits = new Map();
      const skipStreaming = mode === TranslationMode.PDF;
      const emittedLogicalIds = new Set();
      const logicalIdOverrides = new WeakMap();
      let abortInitiator = null;

        const appendFragmentDiagnostic = (type, parentId) => appendTranslationDiagnostic(executionContext, {
        type,
        stage: 'optimized-json-handler',
        parentId,
        });

        const createParentValidationError = (parentId, sourceText, translatedText, validation) => {
          const violation = validation.violations[0];
          const error = new Error(`V3 marker contract violation for fragmented parent ${parentId}: ${violation.reason || violation.code}`);
          error.isFatal = true;
          error.type = ErrorTypes.VALIDATION;
          error.parentRecovery = {
            parentId,
            sourceText,
            violation,
            markerCount: validation.source?.markers?.length ?? null,
            originalError: error,
          };
          return error;
        };

        const isRecoverableParentViolation = (violation) => [
          'V3_MARKER_COUNT_MISMATCH',
          'V3_MARKER_IDENTITY_MISMATCH',
          'V3_DUPLICATE_MARKER',
          'V3_MISSING_MARKER',
          'V3_UNEXPECTED_MARKER',
          'V3_MARKER_ORDER_MISMATCH',
          'V3_EMPTY_TRANSLATED_INTERVAL',
        ].includes(violation?.code);

        const buildV3ParentResult = (seed, translatedText) => {
          const logicalItem = { ...seed, t: translatedText, text: translatedText };
          delete logicalItem.fragment;
          delete logicalItem.mapped;
          delete logicalItem.intervalId;
          delete logicalItem.intervalIndex;
          delete logicalItem.markerId;
          delete logicalItem.isSplit;
          delete logicalItem.partIndex;
          delete logicalItem.isV3Fragment;
          delete logicalItem.parentId;
          delete logicalItem.fragmentIndex;
          delete logicalItem.fragmentCount;
          delete logicalItem.fragmentJoinerBefore;
          delete logicalItem.__sourceT;
          delete logicalItem.recoveryFragmentIndex;
          delete logicalItem.recoveryStage;
          delete logicalItem.recoveryFragmentCount;
          return logicalItem;
        };

        const runParentRecoveryStage = async ({ failure, batchExecutionContext, parallelExecution, recoveryStage, fragmentLimit, violation: stageViolation }) => {
          const { parentId, violation: primaryViolation } = failure.parentRecovery;
          const violation = stageViolation || primaryViolation;
          if (!isRecoverableParentViolation(violation)) throw failure;
          if (abortController.signal.aborted || engine.isCancelled(messageId)) {
            throw createAbortError(abortController.signal);
          }
          if (operationDeadlineAt - Date.now() <= 0) {
            const timeout = new Error(`Batch translation timed out after ${TRANSLATION_BATCH_EXECUTION_TIMEOUT_MS}ms`);
            timeout.type = ErrorTypes.TRANSLATION_TIMEOUT;
            if (!abortController.signal.aborted) abortController.abort();
            throw timeout;
          }

          const sourceParent = v3Parents.get(parentId);
          if (!sourceParent) throw failure;
          const parsedSource = parseV3Intervals(sourceParent.t ?? sourceParent.text ?? '', { grammar: 'ti' });
          const recoveryIntervals = parsedSource.intervals
            .map((interval, intervalIndex) => ({
              intervalId: `parent-${recoveryStage}-${intervalIndex}`,
              i: `parent-${recoveryStage}-${intervalIndex}`,
              intervalIndex,
              markerId: interval.markerId,
              text: interval.text,
            }))
            .filter(({ text }) => text.trim() !== '');
          if (recoveryIntervals.length === 0) {
            appendTranslationDiagnostic(executionContext, {
              type: 'PARENT_RECOVERY_FAILED',
              stage: 'parent-recovery',
              parentId,
              originalReason: violation.reason || violation.code,
              recoveryStage,
              recoveryFragmentCount: 0,
              unitCount: 0,
              strategy: 'PARENT_RECOVERY',
              attempt: recoveryStage,
              finalReason: 'NO_TRANSLATABLE_INTERVALS',
              callPurpose: TranslationCallPurpose.PARENT_RECOVERY,
            });
            throw failure;
          }
          const recoveryFragments = [];
          let currentFragment = [];
          let currentLength = 0;
          for (const interval of recoveryIntervals) {
            if (currentFragment.length > 0 && currentLength + interval.text.length > fragmentLimit) {
              recoveryFragments.push(currentFragment);
              currentFragment = [];
              currentLength = 0;
            }
            currentFragment.push(interval);
            currentLength += interval.text.length;
          }
          if (currentFragment.length > 0) recoveryFragments.push(currentFragment);
          appendTranslationDiagnostic(executionContext, {
            type: 'PARENT_RECOVERY_STARTED',
            stage: 'parent-recovery',
            parentId,
            originalReason: violation.reason || violation.code,
            recoveryStage,
            primaryFragmentLimit: characterLimit,
            recoveryFragmentLimit: fragmentLimit,
            primaryFragmentCount: failure.parentRecovery.primaryFragmentCount,
            recoveryFragmentCount: recoveryFragments.length,
            unitCount: recoveryIntervals.length,
            markerCount: failure.parentRecovery.markerCount,
            strategy: 'PARENT_RECOVERY',
            attempt: recoveryStage,
            callPurpose: TranslationCallPurpose.PARENT_RECOVERY,
          });
          logger.debug(`[JsonHandler] PARENT_RECOVERY stage ${recoveryStage} started`, {
            parentId,
            recoveryStage,
            recoveryFragmentCount: recoveryFragments.length,
          });

          let recoveryResults;
          const recoveryRemainingMs = operationDeadlineAt - Date.now();
          let recoveryTimeoutId;
          const recoveryTimeout = new Promise((_, reject) => {
            recoveryTimeoutId = setTimeout(() => {
              const timeout = new Error(`Batch translation timed out after ${TRANSLATION_BATCH_EXECUTION_TIMEOUT_MS}ms`);
              timeout.type = ErrorTypes.TRANSLATION_TIMEOUT;
              if (!abortController.signal.aborted) abortController.abort();
              reject(timeout);
            }, recoveryRemainingMs);
          });
          try {
            recoveryResults = await Promise.race([
              Promise.all(recoveryFragments.map(async (fragment, fragmentIndex) => {
            if (abortController.signal.aborted || engine.isCancelled(messageId)) {
              throw createAbortError(abortController.signal);
            }
            if (operationDeadlineAt - Date.now() <= 0) {
              const timeout = new Error(`Batch translation timed out after ${TRANSLATION_BATCH_EXECUTION_TIMEOUT_MS}ms`);
              timeout.type = ErrorTypes.TRANSLATION_TIMEOUT;
              if (!abortController.signal.aborted) abortController.abort();
              throw timeout;
            }
            const recoveryContext = {
              ...batchExecutionContext,
              deadlineAt: operationDeadlineAt,
            };
            const response = await self._performBatchCall(
              providerInstance,
              fragment,
              detectedSourceLanguage,
              targetLanguage,
              mode,
              abortController,
              messageId,
              sessionId,
              {
                ...options?.contextMetadata,
                callPurpose: TranslationCallPurpose.PARENT_RECOVERY,
                conversationParticipates: false,
                useParentConversationLifecycle: false,
                parentRecoveryIntervalUnits: true,
              },
              options?.contextSummary,
              engine,
              sender,
              originalSourceLang,
              originalTargetLang,
              parallelExecution,
              recoveryContext,
              TranslationCallPurpose.PARENT_RECOVERY,
              languagePairResolved
            );
            const translated = response?.translatedText !== undefined ? response.translatedText : response;
            const sourceText = fragment.map(({ text }) => text).join('');
            const providerText = Array.isArray(translated)
              ? translated.map((item) => item?.t ?? item?.text ?? item ?? '').join('')
              : translated;
            const sourceSummary = recoveryTextSummary(sourceText);
            const providerSummary = recoveryTextSummary(providerText);
            if (fragmentIndex === 0) {
              const sourceLeading = leadingIntervalSummary(sourceParent.t ?? sourceParent.text ?? '');
              const providerLeadingText = Array.isArray(translated)
                ? (translated[0]?.t ?? translated[0]?.text ?? '')
                : providerText;
              const providerLeading = { length: providerLeadingText.length, firstMarkerId: sourceLeading.firstMarkerId };
              logger.debug('[JsonHandler] PARENT_RECOVERY leading interval seam', {
                event: 'PARENT_RECOVERY_DIAGNOSTIC',
                parentId,
                recoveryStage,
                recoveryFragmentIndex: fragmentIndex,
                sourceLeadingIntervalLength: sourceLeading.length,
                providerLeadingIntervalLength: providerLeading.length,
                firstMarkerId: providerLeading.firstMarkerId || sourceLeading.firstMarkerId,
              });
            }
            logger.debug('[JsonHandler] PARENT_RECOVERY provider response summary', {
              parentId,
              recoveryStage,
              recoveryFragmentIndex: fragmentIndex,
              recoveryFragmentCount: recoveryFragments.length,
              sourceLength: sourceSummary.length,
              translatedLength: providerSummary.length,
              sourceMarkerCount: sourceSummary.markerCount,
              translatedMarkerCount: providerSummary.markerCount,
              sourceMarkerIds: sourceSummary.markerIds,
              translatedMarkerIds: providerSummary.markerIds,
            });
            const mapped = self._mapResults(fragment, translated, executionContext);
            const mappedText = mapped.map((item) => item?.t ?? item?.text ?? item).join('');
            const mappedSummary = recoveryTextSummary(mappedText);
            if (fragmentIndex === 0) {
              const mappedLeadingText = mapped[0]?.t ?? mapped[0]?.text ?? '';
              const mappedLeading = { length: mappedLeadingText.length, firstMarkerId: sourceParent ? leadingIntervalSummary(sourceParent.t ?? sourceParent.text ?? '').firstMarkerId : null };
              logger.debug('[JsonHandler] PARENT_RECOVERY mapped leading interval seam', {
                event: 'PARENT_RECOVERY_DIAGNOSTIC',
                parentId,
                recoveryStage,
                recoveryFragmentIndex: fragmentIndex,
                mappedLeadingIntervalLength: mappedLeading.length,
                firstMarkerId: mappedLeading.firstMarkerId,
              });
            }
            logger.debug('[JsonHandler] PARENT_RECOVERY mapped response summary', {
              parentId,
              recoveryStage,
              recoveryFragmentIndex: fragmentIndex,
              recoveryFragmentCount: recoveryFragments.length,
              sourceLength: sourceSummary.length,
              translatedLength: mappedSummary.length,
              sourceMarkerCount: sourceSummary.markerCount,
              translatedMarkerCount: mappedSummary.markerCount,
              sourceMarkerIds: sourceSummary.markerIds,
              translatedMarkerIds: mappedSummary.markerIds,
            });
            return { fragment, mapped, recoveryFragmentIndex: fragmentIndex };
              })),
              recoveryTimeout,
            ]);
          } catch (recoveryError) {
            const normalizedRecoveryError = recoveryError?.name === 'AbortError'
              && !recoveryError?.type
              && !recoveryError?.operationAborted
              ? createAbortError(abortController.signal, recoveryError.message)
              : recoveryError;
            const recoveryType = normalizedRecoveryError?.operationAborted
              ? null
              : normalizedRecoveryError?.type || matchErrorToType(normalizedRecoveryError);
            const isCancellation = (normalizedRecoveryError?.name === 'AbortError' && !normalizedRecoveryError?.type)
              || normalizedRecoveryError?.operationAborted
              || normalizedRecoveryError?.isCancelled
              || recoveryType === ErrorTypes.USER_CANCELLED
              || recoveryType === ErrorTypes.TRANSLATION_CANCELLED;
            if (recoveryType === ErrorTypes.TRANSLATION_TIMEOUT || isCancellation) throw normalizedRecoveryError;
            appendTranslationDiagnostic(executionContext, {
              type: 'PARENT_RECOVERY_FAILED',
              stage: 'parent-recovery',
              parentId,
              originalReason: violation.reason || violation.code,
              recoveryStage,
              recoveryFragmentCount: recoveryFragments.length,
              strategy: 'PARENT_RECOVERY',
              attempt: recoveryStage,
              finalReason: recoveryType,
              callPurpose: TranslationCallPurpose.PARENT_RECOVERY,
            });
            logger.debug(`[JsonHandler] PARENT_RECOVERY stage ${recoveryStage} failed`, {
              parentId,
              recoveryStage,
              recoveryFragmentCount: recoveryFragments.length,
              reason: recoveryType,
            });
            throw failure;
          } finally {
            clearTimeout(recoveryTimeoutId);
          }

          const ordered = recoveryResults.sort((a, b) => a.recoveryFragmentIndex - b.recoveryFragmentIndex);
          const translatedByInterval = new Map();
          for (const result of ordered) {
            for (const item of result.mapped) {
              const intervalId = item?.i ?? item?.id;
              if (translatedByInterval.has(intervalId)) {
                const duplicate = new Error(`Duplicate recovery interval id: ${intervalId}`);
                duplicate.type = ErrorTypes.VALIDATION;
                duplicate.isFatal = true;
                throw duplicate;
              }
              translatedByInterval.set(intervalId, item?.t ?? item?.text ?? '');
            }
          }
          const expectedIntervalIds = recoveryIntervals.map(({ intervalId }) => intervalId);
          if (expectedIntervalIds.some((id) => !translatedByInterval.has(id))
              || [...translatedByInterval.keys()].some((id) => !expectedIntervalIds.includes(id))) {
            const missing = expectedIntervalIds.filter((id) => !translatedByInterval.has(id));
            const unexpected = [...translatedByInterval.keys()].filter((id) => !expectedIntervalIds.includes(id));
            const identityError = new Error('Parent recovery interval identity mismatch');
            identityError.type = ErrorTypes.VALIDATION;
            identityError.isFatal = true;
            identityError.missingIntervalIds = missing;
            identityError.unexpectedIntervalIds = unexpected;
            throw identityError;
          }
          const translatedText = parsedSource.intervals
            .map((interval, intervalIndex) => {
              const intervalId = `parent-${recoveryStage}-${intervalIndex}`;
              const translatedInterval = translatedByInterval.has(intervalId)
                ? translatedByInterval.get(intervalId)
                : interval.text;
              const marker = intervalIndex > 0 ? parsedSource.markers[intervalIndex - 1]?.raw || '' : '';
              const joiner = intervalIndex > 0 ? (parsedSource.intervals[intervalIndex - 1].text.match(/\s*$/)?.[0] || '') : '';
              return `${intervalIndex === 0 ? '' : joiner + marker}${translatedInterval}`;
            })
            .join('');
          const validation = TranslationContractValidator.validateV3Parent(
            sourceParent.t ?? sourceParent.text ?? '',
            translatedText,
            parentId
          );
          const sourceSummary = recoveryTextSummary(sourceParent.t ?? sourceParent.text ?? '');
          const translatedSummary = recoveryTextSummary(translatedText);
          logger.debug('[JsonHandler] PARENT_RECOVERY reassembled response summary', {
            parentId,
            recoveryStage,
            sourceLength: sourceSummary.length,
            translatedLength: translatedSummary.length,
            sourceMarkerCount: sourceSummary.markerCount,
            translatedMarkerCount: translatedSummary.markerCount,
            sourceMarkerIds: sourceSummary.markerIds,
            translatedMarkerIds: translatedSummary.markerIds,
            sourceIntervalCount: validation?.source?.intervals?.length ?? null,
            translatedIntervalCount: validation?.translated?.intervals?.length ?? null,
          });
          if (!validation?.isValid) {
            const finalViolation = validation?.violations?.[0];
            appendTranslationDiagnostic(executionContext, {
              type: 'PARENT_RECOVERY_FAILED',
              stage: 'parent-recovery',
              parentId,
              originalReason: violation.reason || violation.code,
              recoveryStage,
              recoveryFragmentCount: recoveryFragments.length,
              strategy: 'PARENT_RECOVERY',
              attempt: recoveryStage,
              finalReason: finalViolation?.code,
              callPurpose: TranslationCallPurpose.PARENT_RECOVERY,
            });
            if (finalViolation?.code === 'V3_EMPTY_TRANSLATED_INTERVAL') {
              const sourceInterval = validation.source?.intervals?.[finalViolation.intervalIndex];
              const translatedInterval = validation.translated?.intervals?.[finalViolation.intervalIndex];
              logger.debug('[JsonHandler] PARENT_RECOVERY empty translated interval', {
                parentId,
                recoveryStage,
                intervalIndex: finalViolation.intervalIndex,
                markerId: finalViolation.markerId ?? sourceInterval?.markerId ?? null,
                sourceIntervalLength: sourceInterval?.text?.length ?? 0,
                translatedIntervalLength: translatedInterval?.text?.length ?? 0,
                sourceWhitespaceOnly: sourceInterval?.text?.trim() === '',
                translatedWhitespaceOnly: translatedInterval?.text?.trim() === '',
              });
            }
            if (!isRecoverableParentViolation(finalViolation)) {
              const terminalError = new Error(
                `V3 marker contract violation for fragmented parent ${parentId}: ${finalViolation?.reason || finalViolation?.code}`
              );
              terminalError.isFatal = true;
              terminalError.type = ErrorTypes.VALIDATION;
              terminalError.v3Violation = finalViolation;
              throw terminalError;
            }
            return {
              recoverableFailure: failure,
              recoveryViolation: finalViolation,
            };
          }

          appendTranslationDiagnostic(executionContext, {
            type: 'PARENT_RECOVERY_SUCCEEDED',
            stage: 'parent-recovery',
            parentId,
            originalReason: violation.reason || violation.code,
            recoveryStage,
            recoveryFragmentCount: recoveryFragments.length,
            unitCount: recoveryIntervals.length,
            strategy: 'PARENT_RECOVERY',
            attempt: recoveryStage,
            callPurpose: TranslationCallPurpose.PARENT_RECOVERY,
          });
          logger.debug(`[JsonHandler] PARENT_RECOVERY stage ${recoveryStage} succeeded`, {
            parentId,
            recoveryStage,
            recoveryFragmentCount: recoveryFragments.length,
          });
          return buildV3ParentResult(sourceParent, translatedText);
        };

        const recoverFailedV3Parent = async (failure, batchExecutionContext, parallelExecution) => {
          const stage1 = await runParentRecoveryStage({
            failure,
            batchExecutionContext,
            parallelExecution,
            recoveryStage: 1,
            fragmentLimit: getParentRecoveryStageLimit(characterLimit, 1),
          });
          if (!stage1?.recoverableFailure) return stage1;

          const remainingMs = operationDeadlineAt - Date.now();
          if (remainingMs <= 0) {
            const timeout = new Error(`Batch translation timed out after ${TRANSLATION_BATCH_EXECUTION_TIMEOUT_MS}ms`);
            timeout.type = ErrorTypes.TRANSLATION_TIMEOUT;
            if (!abortController.signal.aborted) abortController.abort();
            throw timeout;
          }

          const stage2 = await runParentRecoveryStage({
            failure: stage1.recoverableFailure,
            batchExecutionContext,
            parallelExecution,
            recoveryStage: 2,
            fragmentLimit: getParentRecoveryStageLimit(characterLimit, 2),
            violation: stage1.recoveryViolation,
          });
          if (stage2?.recoverableFailure) throw failure;
          return stage2;
        };

        const extractLogicalId = (item) => {
          if (typeof item !== 'object' || item === null) return undefined;
          // Structured PDF cells carry i/b/blockId (all = block.id); per-cell
          // identity (cellId) takes precedence so distinct cells of one block are
          // not treated as duplicates. Nullish semantics keep valid falsy IDs
          // (e.g. numeric cellId 0) intact and skip fallback only for null/
          // undefined. Non-PDF items without cellId fall through to the prior
          // identity policy.
          return item.uid ?? item.cellId ?? item.i ?? item.id ?? item.blockId;
        };

        // Single publication path for the canonical batch result: dedupe against
        // already-emitted identities, terminal acceptance, batchResults, streaming.
        // Shared by the success path and the outer catch (preserved prefix/suffix
        // on recovery failure) so both go through exactly-once visibility.
        const publishResults = async (resultsToPublish, batchContext, batchIndex) => {
          const filteredResults = [];
          const acceptedManifestUnits = [];
          for (let idx = 0; idx < resultsToPublish.length; idx++) {
            const item = resultsToPublish[idx];
            const logicalId = logicalIdOverrides.get(item) ?? extractLogicalId(item);
            if (logicalId !== undefined && emittedLogicalIds.has(logicalId)) {
              appendTranslationDiagnostic(executionContext, {
                type: 'DUPLICATE_IDENTITY_SUPPRESSED',
                stage: 'optimized-json-handler',
                parentId: String(logicalId),
              });
              continue;
            }
            if (logicalId !== undefined) emittedLogicalIds.add(logicalId);
            filteredResults.push(item);
            // Track accepted manifest units for terminal observation
            // (only valid for non-fragment batches where manifestView.units aligns positionally)
            if (batchContext?.manifestView?.units && idx < batchContext.manifestView.units.length) {
              acceptedManifestUnits.push(batchContext.manifestView.units[idx]);
            }
          }
          // Terminal observation: accept only manifest units that survived suppression
          if (mode === TranslationMode.Select_Element
              && providerInstance.constructor.isAI
              && acceptedManifestUnits.length > 0) {
            executionContext?.onTerminalUnitsAccepted?.(acceptedManifestUnits);
          }
          batchResults[batchIndex] = filteredResults;
          completedBatchCount++;
          if (!skipStreaming && filteredResults.length > 0) {
            await self._streamResults(
              tabId,
              messageId,
              filteredResults,
              batchIndex,
              batches.length,
              targetLanguage,
              detectedSourceLanguage,
              mode,
              completedBatchCount,
              abortController,
              engine,
              frameId
            );
          }
        };

        const collectCompleteFragments = (mappedResults, state = {}) => {
          const completeResults = state.completeResults ?? [];
          const sameBatchIds = state.sameBatchIds ?? new Set();
          const startIndex = state.startIndex ?? 0;

          const validateAndAdd = (item, logicalIdOverride) => {
            const logicalId = logicalIdOverride ?? extractLogicalId(item);
            if (logicalId !== undefined && sameBatchIds.has(logicalId)) {
              const err = new Error(`Duplicate identity in batch: ${String(logicalId)}`);
              err.isFatal = true;
              err.type = ErrorTypes.VALIDATION;
              throw err;
            }
            if (logicalIdOverride !== undefined) logicalIdOverrides.set(item, logicalIdOverride);
            if (logicalId !== undefined) sameBatchIds.add(logicalId);
            completeResults.push(item);
          };

          for (let index = startIndex; index < mappedResults.length; index++) {
            const result = mappedResults[index];
           if (result?.isV2Unit === true && result?.isSplitFragment === true) {
             const { parentId, fragmentIndex, fragmentCount } = result;
             if (!parentId || !Number.isInteger(fragmentIndex) || !Number.isInteger(fragmentCount) || fragmentIndex < 0 || fragmentIndex >= fragmentCount) {
               appendFragmentDiagnostic('INCOMPLETE_FRAGMENT_EVENT_SUPPRESSED', parentId);
               continue;
             }

             let parent = fragmentedUnits.get(parentId);
             if (!parent) {
               parent = { expectedCount: fragmentCount, fragments: new Map(), failed: false, emitted: false };
               fragmentedUnits.set(parentId, parent);
             }

             if (parent.failed || parent.emitted || parent.expectedCount !== fragmentCount || parent.fragments.has(fragmentIndex)) continue;
             parent.fragments.set(fragmentIndex, result);

             if (parent.fragments.size !== parent.expectedCount) continue;

             const orderedFragments = Array.from({ length: parent.expectedCount }, (_, index) => parent.fragments.get(index));
             if (orderedFragments.some(fragment => !fragment)) {
               parent.failed = true;
               parent.fragments.clear();
               appendFragmentDiagnostic('INCOMPLETE_FRAGMENT_EVENT_SUPPRESSED', parentId);
               continue;
             }

             const translatedText = orderedFragments
               .map((fragment, index) => `${index === 0 ? '' : (fragment.fragmentJoinerBefore || '')}${fragment.t || fragment.text || ''}`)
               .join('');
             const logicalItem = { ...orderedFragments[0] };
             delete logicalItem.isSplit;
             delete logicalItem.isSplitFragment;
             delete logicalItem.partIndex;
             delete logicalItem.parentId;
             delete logicalItem.fragmentIndex;
             delete logicalItem.fragmentCount;
             delete logicalItem.fragmentJoinerBefore;
             delete logicalItem.isV2Unit;
              validateAndAdd({ ...logicalItem, i: parentId, t: translatedText, text: translatedText });
              parent.emitted = true;
              parent.fragments.clear();
              appendFragmentDiagnostic('FRAGMENTED_UNIT_COMPLETED', parentId);
              continue;
            }

            if (result?.isV3Fragment === true) {
             const { parentId, fragmentIndex, fragmentCount } = result;
             if (!parentId || !Number.isInteger(fragmentIndex) || !Number.isInteger(fragmentCount) || fragmentIndex < 0 || fragmentIndex >= fragmentCount) {
               appendFragmentDiagnostic('INCOMPLETE_FRAGMENT_EVENT_SUPPRESSED', parentId);
               continue;
             }

             let parent = fragmentedUnits.get(parentId);
             if (!parent) {
               parent = { expectedCount: fragmentCount, fragments: new Map(), failed: false, emitted: false };
               fragmentedUnits.set(parentId, parent);
             }

             if (parent.failed || parent.emitted || parent.expectedCount !== fragmentCount || parent.fragments.has(fragmentIndex)) continue;
             parent.fragments.set(fragmentIndex, result);

             if (parent.fragments.size !== parent.expectedCount) continue;

             const orderedFragments = Array.from({ length: parent.expectedCount }, (_, index) => parent.fragments.get(index));
             if (orderedFragments.some(fragment => !fragment)) {
               parent.failed = true;
               parent.fragments.clear();
               appendFragmentDiagnostic('INCOMPLETE_FRAGMENT_EVENT_SUPPRESSED', parentId);
               continue;
             }

              const translatedText = orderedFragments
                .map((fragment, index) => `${index === 0 ? '' : (fragment.fragmentJoinerBefore || '')}${fragment.t || fragment.text || ''}`)
                .join('');
              const sourceText = orderedFragments
                .map((fragment, index) => `${index === 0 ? '' : (fragment.fragmentJoinerBefore || '')}${fragment.__sourceT ?? fragment.t ?? fragment.text ?? ''}`)
                .join('');
               const validation = TranslationContractValidator.validateV3Parent(sourceText, translatedText, parentId);
                if (validation && !validation.isValid) {
                 const violation = validation.violations[0];
                 const parentIdStr = String(parentId ?? 'unknown');
                 const reason = violation.reason || violation.code || 'V3_CONTRACT_VIOLATION';
                 appendTranslationDiagnostic(executionContext, {
                  type: 'V3_MARKER_CONTRACT_REJECTED',
                  stage: 'optimized-json-handler',
                  parentId: parentIdStr,
                   expectedMarkerCount: violation.expectedMarkerCount ?? null,
                   actualMarkerCount: violation.actualMarkerCount ?? null,
                   reason,
                 });
const parentError = createParentValidationError(parentIdStr, sourceText, translatedText, validation);
                    parentError.parentRecovery.completeResults = completeResults;
                    parentError.parentRecovery.primaryFragmentCount = orderedFragments.length;
                    parentError.parentRecovery.sameBatchIds = sameBatchIds;
                    parentError.parentRecovery.resumeIndex = index;
                    throw parentError;
              }
               validateAndAdd(buildV3ParentResult(orderedFragments[0], translatedText), `v3:${parentId}`);
              parent.emitted = true;
              parent.fragments.clear();
              appendFragmentDiagnostic('FRAGMENTED_UNIT_COMPLETED', parentId);
              continue;
            }

            const logicalId = extractLogicalId(result);
            if (logicalId !== undefined && sameBatchIds.has(logicalId)) {
              const err = new Error(`Duplicate identity in batch: ${String(logicalId)}`);
              err.isFatal = true;
              err.type = ErrorTypes.VALIDATION;
              throw err;
            }
            if (logicalId !== undefined) sameBatchIds.add(logicalId);
            completeResults.push(result);
         }

         return completeResults;
       };

       const discardFailedFragments = (batchPayload) => {
         for (const payload of batchPayload) {
           const isV2Fragment = payload?.isV2Unit === true && payload?.isSplitFragment === true;
           const isV3Fragment = payload?.isV3Fragment === true;
           if (!isV2Fragment && !isV3Fragment) continue;
           const parentId = payload.parentId;
           if (!parentId) continue;
           const parent = fragmentedUnits.get(parentId) || { expectedCount: payload.fragmentCount, fragments: new Map(), failed: false, emitted: false };
           if (parent.emitted || parent.failed) continue;
           parent.failed = true;
           parent.fragments.clear();
           fragmentedUnits.set(parentId, parent);
           appendFragmentDiagnostic('FRAGMENTED_UNIT_FAILED', parentId);
         }
       };
      
      // Preserve the ordered lane when conversation continuity is enabled.
      if (historyEnabled) {
        // STRATEGY: SEQUENTIAL
        // Preserve existing batch ordering and turn continuity semantics.
        for (let i = 0; i < batches.length; i++) {
          await processBatch(batches[i], i, { parallelExecution: false });
          if (hasErrors && lastError && isFatalError(lastError)) break;
        }
      } else {
        // STRATEGY: CONTROLLED PARALLEL (stateless lane)
        // Let RateLimitManager handle the actual concurrency and delays.
        
        let startIndex = 0;
        // OPTIMIZATION: If source is auto, wait for the first batch to detect the language.
        // This prevents redundant detection calls for all subsequent batches.
        if (!bypassAutoSequentialGate && detectedSourceLanguage === 'auto' && batches.length > 0) {
          logger.debug(`[JsonHandler] Auto-detection mode: Executing first batch sequentially to resolve source language...`);
          await processBatch(batches[0], 0, { parallelExecution: false });
          
          // If first batch failed fatally, don't continue
          if (hasErrors && lastError && isFatalError(lastError)) {
            const serializedError = MessageFormat.serializeTranslationError(lastError);
            return { 
              success: false, 
              streaming: true, 
              error: serializedError,
              errorDetails: serializedError,
              results: batchResults.flat()
            };
          }
          startIndex = 1;
        }

        // Process remaining batches. They will be queued in RateLimitManager.
        const batchPromises = batches.slice(startIndex).map((batch, i) => processBatch(batch, i + startIndex, { parallelExecution: true }));
        await Promise.all(batchPromises);
      }

      async function processBatch(batch, i, { parallelExecution = false } = {}) {
        let timeoutId = null;
        let onAbort = null;
        let timeoutError = null;
        let didTimeout = false;
        let batchPayload = [];
        let batchExecutionContext;

        const checkCancellation = () => {
          if (engine.isCancelled(messageId) || abortController.signal.aborted) {
            throw createAbortError(abortController.signal);
          }
        };

        try {
          checkCancellation();

          const remainingMs = operationDeadlineAt - Date.now();
          if (remainingMs <= 0) {
            didTimeout = true;
            timeoutError = new Error(`Batch translation timed out after ${TRANSLATION_BATCH_EXECUTION_TIMEOUT_MS}ms`);
            timeoutError.type = ErrorTypes.TRANSLATION_TIMEOUT;
            appendTranslationDiagnostic(executionContext, {
              type: 'BATCH_TIMEOUT',
              stage: 'optimized-json-handler',
              batchIndex: i,
              reason: timeoutError.message,
              code: timeoutError.type,
            });
            if (!abortController.signal.aborted) abortController.abort();
            throw timeoutError;
          }

          const statsBefore = statsManager.getSessionSummary(sessionId);
          const charsBefore = statsBefore ? statsBefore.chars : 0;
          const originalCharsBefore = statsBefore ? statsBefore.originalChars : 0;

          // Timeout Protection (5 minutes) for each batch call
          const BATCH_TIMEOUT_MS = TRANSLATION_BATCH_EXECUTION_TIMEOUT_MS;
          const timeoutPromise = new Promise((resolve) => {
            timeoutId = setTimeout(() => {
              didTimeout = true;
              timeoutError = new Error(`Batch translation timed out after ${BATCH_TIMEOUT_MS}ms`);
              timeoutError.type = ErrorTypes.TRANSLATION_TIMEOUT;
              appendTranslationDiagnostic(executionContext, {
                type: 'BATCH_TIMEOUT',
                stage: 'optimized-json-handler',
                batchIndex: i,
                reason: timeoutError.message,
                code: timeoutError.type,
              });
              resolve({ __kind: 'timeout', error: timeoutError });
              if (!abortController.signal.aborted) abortController.abort();
            }, remainingMs);
            
            // Shared abort must settle local wait immediately, even when the
            // provider ignores the signal and leaves its promise pending.
            onAbort = () => {
              clearTimeout(timeoutId);
              resolve({ __kind: 'abort' });
            };
            abortController.signal.addEventListener('abort', onAbort);
            if (abortController.signal.aborted) onAbort();
          });
          if (abortController.signal.aborted) checkCancellation();
            
           batchPayload = hasManifestMembership ? batch.map(({ payload }) => payload) : batch;
           const explicitParentIds = batch.map(item => item && typeof item === 'object'
             ? (item.parentId ?? item.blockId)
             : null);
           const hasExplicitParentIdentity = explicitParentIds.some(parentId => parentId !== null && parentId !== undefined);
           const hasMissingParentIdentity = explicitParentIds.some(parentId => parentId === null || parentId === undefined);
           const ownedCount = explicitParentIds.filter(parentId => (
             parentId !== null
             && parentId !== undefined
             && executionContext?.operation?.getParentCandidate(parentId)
           )).length;
           const unownedCount = explicitParentIds.filter(parentId => (
             parentId !== null
             && parentId !== undefined
             && !executionContext?.operation?.getParentCandidate(parentId)
           )).length;
           if (hasExplicitParentIdentity && hasMissingParentIdentity) {
             appendTranslationDiagnostic(executionContext, {
               type: 'MIXED_PARENT_CONVERSATION_OWNERSHIP',
               stage: 'optimized-json-handler',
               batchIndex: i,
               reason: 'Batch mixes explicit and missing canonical parent identity',
             });
             const ownershipError = new Error('Mixed parent conversation ownership')
             ownershipError.type = ErrorTypes.VALIDATION
             ownershipError.isFatal = true
              throw ownershipError
            }
           if (ownedCount > 0 && unownedCount > 0) {
             appendTranslationDiagnostic(executionContext, {
               type: 'MIXED_PARENT_CONVERSATION_OWNERSHIP',
               stage: 'optimized-json-handler',
               batchIndex: i,
               reason: 'Batch mixes owned and unowned canonical parents',
             });
             const ownershipError = new Error('Mixed parent conversation ownership')
             ownershipError.type = ErrorTypes.VALIDATION
             ownershipError.isFatal = true
             throw ownershipError
           }
           const useParentConversationLifecycle = providerInstance.constructor.isAI
             && hasExplicitParentIdentity
             && ownedCount > 0
             && unownedCount === 0;
           const batchContextMetadata = {
             ...options?.contextMetadata,
             ...(useParentConversationLifecycle && { useParentConversationLifecycle: true }),
           };
          batchExecutionContext = hasManifestMembership
            ? self._createBatchExecutionContext(operationExecutionContext, batch)
            : operationExecutionContext;
          const providerPromise = self._performBatchCall(
              providerInstance, 
              batchPayload, 
              detectedSourceLanguage, 
              targetLanguage, 
              mode, 
              abortController, 
              messageId, 
              sessionId, 
               batchContextMetadata, 
              options?.contextSummary,
              engine,
              sender,
               originalSourceLang,
               originalTargetLang,
               parallelExecution,
                batchExecutionContext,
                null,
                languagePairResolved
            );

          // Guard provider promise so late rejection after timeout cannot become
          // an unhandled rejection. The outcome object normalizes resolution/rejection
          // into a value the race can consume without leaking.
          const guardedProviderPromise = providerPromise.then(
            (value) => ({ __kind: 'provider-success', value }),
            (error) => ({ __kind: 'provider-error', error })
          );

          // timeoutPromise resolves (not rejects) with an outcome object
          let translatedBatchResponse = await Promise.race([
            guardedProviderPromise,
            timeoutPromise
          ]);

          // Unwrap guarded provider outcome
          if (translatedBatchResponse && typeof translatedBatchResponse === 'object' && translatedBatchResponse.__kind === 'provider-error') {
            throw translatedBatchResponse.error;
          } else if (translatedBatchResponse && typeof translatedBatchResponse === 'object' && translatedBatchResponse.__kind === 'timeout') {
            throw translatedBatchResponse.error;
          } else if (translatedBatchResponse && typeof translatedBatchResponse === 'object' && translatedBatchResponse.__kind === 'provider-success') {
            translatedBatchResponse = translatedBatchResponse.value;
          } else if (translatedBatchResponse && typeof translatedBatchResponse === 'object' && translatedBatchResponse.__kind === 'abort') {
            checkCancellation();
          }

          checkCancellation();

          // Capture detected language from the first successful batch if it's currently 'auto'
          if (!bypassAutoSequentialGate && detectedSourceLanguage === 'auto' && translatedBatchResponse?.detectedLanguage) {
            detectedSourceLanguage = translatedBatchResponse.detectedLanguage;
            logger.debug(`[JsonHandler] Captured detected source language: ${detectedSourceLanguage}`);

            // The response lifecycle proved a concrete semantic source. Later
            // batches and PARENT_RECOVERY inherit the resolved pair so the
            // semantic swap/detection is not repeated for this operation.
            // A response that keeps source unresolved (e.g. 'auto') does not
            // upgrade the flag: per-batch AUTO behavior is preserved.
            if (detectedSourceLanguage !== 'auto') {
              languagePairResolved = true;
            }
          }

          const translatedBatch = (translatedBatchResponse && typeof translatedBatchResponse === 'object' && translatedBatchResponse.translatedText !== undefined)
            ? translatedBatchResponse.translatedText
            : translatedBatchResponse;

           const mappedResults = self._mapResults(batchPayload, translatedBatch, executionContext);
            let completeResults;
            let collectionState;
            let parentRecoveryCount = 0;
            while (true) {
              try {
                completeResults = collectCompleteFragments(mappedResults, collectionState);
                break;
              } catch (batchError) {
                if (!batchError.parentRecovery || parentRecoveryCount >= MAX_PARENT_RECOVERIES_PER_BATCH) throw batchError;
                parentRecoveryCount++;
                const parentRecovery = batchError.parentRecovery;
                let recoveredParent;
                try {
                  recoveredParent = await recoverFailedV3Parent(batchError, batchExecutionContext, parallelExecution);
                } catch (recoveryError) {
                  const normalizedRecoveryError = recoveryError?.name === 'AbortError'
                    && !recoveryError?.type
                    && !recoveryError?.operationAborted
                    ? createAbortError(abortController.signal, recoveryError.message)
                    : recoveryError;
                  const recoveryType = normalizedRecoveryError?.operationAborted
                    ? null
                    : normalizedRecoveryError?.type || matchErrorToType(normalizedRecoveryError);
                  if (recoveryType === ErrorTypes.TRANSLATION_TIMEOUT) {
                    didTimeout = true;
                    timeoutError = normalizedRecoveryError;
                  }
                  // Recovery failures must still publish the results collected before
                  // the offending parent. Re-anchor the snapshot captured at the throw
                  // site when the provider rewrote the error object.
                  if (!normalizedRecoveryError.parentRecovery) normalizedRecoveryError.parentRecovery = parentRecovery;
                  throw normalizedRecoveryError;
                }
                const { completeResults: preservedResults, sameBatchIds, resumeIndex, parentId } = parentRecovery;
                // The recovered parent replaces the failed original; clear its fragment
                // state so any trailing fragments are not double-collected.
                const failedParent = fragmentedUnits.get(parentId);
                if (failedParent) {
                  failedParent.emitted = true;
                  failedParent.fragments.clear();
                }
                completeResults = [...(preservedResults || []), recoveredParent];
                logicalIdOverrides.set(recoveredParent, `v3:${parentId}`);
                if (resumeIndex === undefined || !sameBatchIds) break;
                sameBatchIds.add(`v3:${parentId}`);
                // Resume collection after the recovered parent so valid same-batch
                // suffixes survive without a full re-run.
                collectionState = {
                  completeResults,
                  sameBatchIds,
                  startIndex: resumeIndex + 1,
                };
              }
            }
          checkCancellation();
          await publishResults(completeResults, batchExecutionContext, i);
          
          const statsAfter = statsManager.getSessionSummary(sessionId);
          if (statsAfter) {
            statsManager.printSummary(sessionId, {
              status: 'Batch',
              batchChars: statsAfter.chars - charsBefore,
              batchOriginalChars: statsAfter.originalChars - originalCharsBefore
            });
          }
          
        } catch (batchError) {
          if (didTimeout) {
            fragmentedUnits.clear();
            throw timeoutError;
          }

          const normalizedBatchError = batchError?.name === 'AbortError'
            && !batchError?.type
            && !batchError?.operationAborted
            ? createAbortError(abortController.signal, batchError.message)
            : batchError;
          const errorType = normalizedBatchError.operationAborted
            ? null
            : normalizedBatchError.type || matchErrorToType(normalizedBatchError);
          const isCancellation = (normalizedBatchError.name === 'AbortError' && !normalizedBatchError.type) ||
                               normalizedBatchError.operationAborted ||
                               normalizedBatchError.isCancelled || 
                               errorType === ErrorTypes.USER_CANCELLED || 
                               errorType === ErrorTypes.TRANSLATION_CANCELLED;

          if (isCancellation) {
            fragmentedUnits.clear();
            logger.debug(`[JsonHandler] Batch ${i + 1} cancelled for messageId: ${messageId}`);

            // Queue cancellation is owned by handleCancelTranslation. Cancelling
            // here races provider failures and rewrites them as USER_CANCELLED.
            return;
          }
          
            logger.debug(`[JsonHandler] Batch ${i + 1} failed:`, normalizedBatchError.message);
            discardFailedFragments(batchPayload);
           appendTranslationDiagnostic(executionContext, {
             type: 'STRUCTURED_BATCH_FAILURE',
             stage: 'optimized-json-handler',
             batchIndex: i,
              reason: normalizedBatchError.message,
              code: normalizedBatchError.operationAborted
                ? normalizedBatchError.cancellationReason
                : normalizedBatchError.type || matchErrorToType(normalizedBatchError),
             fallback: true,
           });
hasErrors = true;
           lastError = normalizedBatchError;
            const preservedResults = normalizedBatchError?.parentRecovery?.completeResults;
           if (preservedResults && preservedResults.length > 0) {
             // Recovery failed (or a later parent violated after a recovery): keep
             // the valid prefix/suffix collected before the failing parent instead
             // of discarding the whole batch. publishResults already counts the batch.
             await publishResults(preservedResults, batchExecutionContext, i);
           } else {
             batchResults[i] = [];
             // Count the attempted batch to keep progress accounting stable.
             // Never stream the original batch as translated output on failure.
             completedBatchCount++;
           }
          
          // Stop all other batches if error is fatal (429, etc.)
           if (isFatalError(normalizedBatchError)) {
            abortInitiator = 'fatal-error';
            if (!abortController.signal.aborted) abortController.abort();
          }
        } finally {
          clearTimeout(timeoutId);
          abortController.signal.removeEventListener('abort', onAbort);
        }
      }

      if (batches.length > 0) await new Promise(resolve => setTimeout(resolve, 50));

      // Final check for cancellation before sending end-of-stream markers
      if (abortController.signal.aborted || engine.isCancelled(messageId)) {
        logger.debug(`[JsonHandler] Skipping stream end markers for cancelled request: ${messageId}`);
        if (hasErrors && lastError && abortInitiator === 'fatal-error') {
          const serializedError = MessageFormat.serializeTranslationError(lastError);
          return {
            success: false,
            streaming: true,
            error: serializedError,
            errorDetails: serializedError,
            results: batchResults.flat()
          };
        }
        const cancellation = createAbortError(abortController.signal);
        if (lastError && !cancellation.isCancelled) {
          const serializedError = MessageFormat.serializeTranslationError(lastError);
          return {
            success: false,
            streaming: true,
            error: serializedError,
            errorDetails: serializedError,
            results: batchResults.flat()
          };
        }
        return { success: false, streaming: true, error: cancellation };
      }

      if (!skipStreaming) {
        if (hasErrors) {
          await this._sendStreamError(tabId, messageId, lastError, targetLanguage, detectedSourceLanguage, mode, frameId);
        } else {
          await this._sendStreamEnd(tabId, messageId, providerInstance.providerName, targetLanguage, detectedSourceLanguage, mode, frameId);
        }
      }

      statsManager.printSummary(sessionId, { status: 'Streaming', success: !hasErrors, clear: true });

      const formattedError = lastError ? MessageFormat.serializeTranslationError(lastError) : null;

      return {
        success: !hasErrors,
        streaming: true,
        error: formattedError,
        ...(formattedError && { errorDetails: formattedError }),
        results: batchResults.flat(),
        metadata: {
          batchCount: batches.length
        }
      };
    } finally {
      fragmentedUnits?.clear();
      engine.lifecycleRegistry.unregisterRequest(messageId);
    }
  }

  async _performBatchCall(providerInstance, batch, source, target, mode, abortController, messageId, sessionId, contextMetadata, contextSummary, engine, sender, originalSourceLang = null, originalTargetLang = null, parallelExecution = false, executionContext = null, callPurpose = null, languagePairResolved = false) {
    const isArrayInput = Array.isArray(batch);
    const textsToTranslate = isArrayInput
      ? (contextMetadata?.parentRecoveryIntervalUnits
        ? batch
        : batch.map(item => typeof item === 'object' ? (item.t || item.text || '') : (item || '')))
      : (typeof batch === 'object' ? (batch.t || batch.text || '') : (batch || ''));

    const expectedFormat = (providerInstance.constructor.batchStrategy === 'json' || providerInstance.constructor.isAI)
      ? ResponseFormat.JSON_OBJECT
      : ResponseFormat.STRING;

    return await providerInstance.translate(
      textsToTranslate,
      source,
      target,
      {
        mode, abortController, messageId, sessionId, contextMetadata, contextSummary,
        engine, sender, priority: 'high', rawJsonPayload: true, parallelExecution,
         originalSourceLang, originalTargetLang,
         ...(languagePairResolved && { languagePairResolved: true }),
         expectedFormat,
         ...(callPurpose && { callPurpose }),
         executionContext
      }
    );
  }

  _createBatchExecutionContext(executionContext, batch) {
    if (!executionContext?.manifestView || !Array.isArray(batch)) return executionContext

    if (batch.some(({ isSplitFragment, isV3Fragment }) => isSplitFragment || isV3Fragment)) {
      return { ...executionContext, manifestView: null };
    }

    const manifestUnits = batch.map(({ manifestUnit }) => manifestUnit)

    return {
      ...executionContext,
      manifestView: createManifestViewFromUnits(executionContext.manifestView, manifestUnits),
    }
  }

  _mapResults(originalBatch, translatedResults, executionContext = null) {
    // Robust normalization: AI providers might return objects, arrays, or bridged structures
    let rawItems = [];
    let currentResults = translatedResults;

    // Handle case where translatedResults is a unified response object (Safety fallback)
    if (currentResults && typeof currentResults === 'object' && !Array.isArray(currentResults) && currentResults.translatedText !== undefined) {
      currentResults = currentResults.translatedText;
    }

    // Handle case where translatedResults is a string that looks like JSON
    if (typeof currentResults === 'string' && 
        (currentResults.trim().startsWith('{') || currentResults.trim().startsWith('['))) {
      try {
        currentResults = JSON.parse(currentResults);
      } catch { /* ignore */ }
    }

    if (Array.isArray(currentResults)) {
      rawItems = currentResults;
    } else if (typeof currentResults === 'object' && currentResults !== null) {
      // Extract from common AI wrappers
      rawItems = currentResults.translations || 
                 currentResults.results || 
                 Object.values(currentResults).find(v => Array.isArray(v)) || 
                 Object.values(currentResults);
    } else {
      rawItems = [currentResults];
    }
    
    // Shared pipeline contract: every nonblank source segment must receive valid
    // nonblank translated text. Missing, blank, or raw-JSON output is a typed
    // failure — never a silent source-fill into the success path.
    const rejectInvalidResult = (index, code) => {
      const errorMsg = `Invalid translation result at segment index ${index} (code: ${code})`;
      logger.error(`[JsonHandler] ${errorMsg}`);
      const err = new Error(errorMsg);
      err.isFatal = true;
      err.type = ErrorTypes.VALIDATION;
      throw err;
    };

    const results = rawItems.map((item, index) => {
      if (item === null || item === undefined) {
        rejectInvalidResult(index, 'NULL_TRANSLATION_RESULT');
      }
      let text;
      if (typeof item === 'object') {
        text = item.t ?? item.text ?? item.translation;
        if (text === undefined || text === null) {
          rejectInvalidResult(index, 'MISSING_TRANSLATION_TEXT');
        }
      } else {
        text = String(item);
      }

      // FINAL SAFETY: If the extracted text still looks like JSON (e.g. contains {"translations":),
      // it means parsing failed completely. We should NOT show this to the user.
        if (typeof text === 'string' && text.length > 20 && 
          (text.includes('{"') || text.includes('["')) && 
          (text.includes('":') || text.includes('",'))) {
          logger.warn('[JsonHandler] Extracted text looks like raw JSON, rejecting to prevent UI corruption');
          appendTranslationDiagnostic(executionContext, {
            type: 'STRUCTURED_RESULT_REJECTED',
            stage: 'optimized-json-handler',
            code: 'RAW_JSON_RESULT',
          });
          rejectInvalidResult(index, 'RAW_JSON_RESULT');
      }
      
      return text;
    });

    if (results.length !== originalBatch.length) {
      const errorMsg = `Segment count mismatch: expected ${originalBatch.length}, received ${results.length}`;
      logger.error(`[JsonHandler] ${errorMsg}`);
      const err = new Error(errorMsg);
      err.isFatal = true;
      err.type = ErrorTypes.VALIDATION;
      throw err;
    }

    return originalBatch.map((item, idx) => {
      const translatedContent = results[idx];
      const sourceText = typeof item === 'object' ? (item.t ?? item.text) : item;
      const sourceIsBlank = typeof sourceText === 'string' && sourceText.trim() === '';

      // Blank output stays acceptable only for blank source positions.
      if (typeof translatedContent !== 'string' || (translatedContent.trim() === '' && !sourceIsBlank)) {
        rejectInvalidResult(idx, 'EMPTY_TRANSLATION_RESULT');
      }

      if (typeof item === 'object' && item !== null) {
        const isFragment = item.isV3Fragment === true
          || item.isSplitFragment === true
          || item.isSplit === true;
        if (!isFragment && typeof sourceText === 'string' && sourceText.includes('@@TI_SEG_')) {
          const blockId = String(item.b ?? item.blockId ?? item.i ?? item.uid ?? 'unknown');
          const validation = TranslationContractValidator.validateV3Parent(sourceText, translatedContent, blockId);
          if (validation && !validation.isValid) {
            const violation = validation.violations[0];
            const reason = violation.reason || violation.code || 'V3_CONTRACT_VIOLATION';
            appendTranslationDiagnostic(executionContext, {
              type: 'V3_MARKER_CONTRACT_REJECTED',
              stage: 'optimized-json-handler',
              parentId: blockId,
              expectedMarkerCount: violation.expectedMarkerCount ?? null,
              actualMarkerCount: violation.actualMarkerCount ?? null,
              reason,
            });
            const err = new Error(`V3 marker contract violation for block ${blockId}: ${reason}`);
            err.isFatal = true;
            err.type = ErrorTypes.VALIDATION;
            throw err;
          }
        }
        const result = { ...item, t: translatedContent, text: translatedContent };
        if (item.isV3Fragment === true) {
          result.__sourceT = sourceText;
        }
        return result;
      }
      return translatedContent;
    });
  }

  async _streamResults(tabId, messageId, translatedData, batchIndex, totalBatches, targetLanguage, sourceLanguage, translationMode, completedCount = null, abortController = null, engine = null, frameId = null) {
    if (!tabId) return;
    const isCancelled = () => {
      if (abortController?.signal?.aborted) return true;
      if (messageId && typeof engine?.isCancelled === 'function') {
        return engine.isCancelled(messageId);
      }
      return false;
    };

    if (isCancelled()) return;

    const streamMessage = {
      action: MessageActions.TRANSLATION_STREAM_UPDATE,
      messageId: messageId,
      data: {
        success: true,
        data: translatedData,
        batchIndex,
        totalBatches,
        completedCount: typeof completedCount === 'number' ? completedCount : batchIndex + 1,
        isComplete: typeof completedCount === 'number' ? completedCount === totalBatches : batchIndex === totalBatches - 1,
        sourceLanguage,
        targetLanguage,
        translationMode,
        timestamp: Date.now()
      }
    };
    try {
      await Promise.resolve();
      if (isCancelled()) return;
      const sendArgs = [tabId, streamMessage];
      if (typeof frameId === 'number') sendArgs.push({ frameId });
      await browser.tabs.sendMessage(...sendArgs);
    } catch (err) {
      logger.warn(`[JsonHandler] Failed to stream to tab ${tabId}:`, err.message);
    }
  }

  async _sendStreamEnd(tabId, messageId, providerName, targetLanguage, sourceLanguage, translationMode, frameId = null) {
    if (!tabId) return;
    const endMessage = {
      action: MessageActions.TRANSLATION_STREAM_END,
      messageId,
      data: {
        success: true,
        completed: true,
        provider: providerName,
        sourceLanguage,
        targetLanguage,
        translationMode,
        timestamp: Date.now()
      }
    };
    try {
      const sendArgs = [tabId, endMessage];
      if (typeof frameId === 'number') sendArgs.push({ frameId });
      await browser.tabs.sendMessage(...sendArgs);
    } catch { /* ignore */ }
  }

  async _sendStreamError(tabId, messageId, lastError, targetLanguage, sourceLanguage, translationMode, frameId = null) {
    if (!tabId) return;
    const serializedError = lastError ? MessageFormat.serializeTranslationError(lastError) : null;
    const endMessage = {
      action: MessageActions.TRANSLATION_STREAM_END,
      messageId,
      data: {
        success: false,
        error: serializedError,
        errorDetails: serializedError,
        sourceLanguage,
        targetLanguage,
        translationMode,
        timestamp: Date.now()
      }
    };
    try {
      const sendArgs = [tabId, endMessage];
      if (typeof frameId === 'number') sendArgs.push({ frameId });
      await browser.tabs.sendMessage(...sendArgs);
    } catch { /* ignore */ }
  }
}
