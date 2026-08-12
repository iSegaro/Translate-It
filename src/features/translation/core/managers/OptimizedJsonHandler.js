/**
 * Optimized JSON Handler - Specialized strategy for Select Element translation
 * Manages complex batching, adaptive delays, and real-time result streaming.
 */

import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
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

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'OptimizedJsonHandler');

export class OptimizedJsonHandler {
  /**
   * Orchestrates the optimized translation process.
   */
  async execute(engine, data, providerInstance, originalSourceLang, originalTargetLang, messageId, sender, uiContext = 'unknown', executionContext = null) {
    const { text, sourceLanguage, targetLanguage, mode, options } = data;
    const sessionId = data.sessionId || messageId;
    const tabId = sender?.tab?.id;
    const abortController = engine.lifecycleRegistry.getAbortController(messageId) || 
                             engine.lifecycleRegistry.registerRequest(messageId, typeof text === 'string' ? text.substring(0, 100) : '', uiContext);

    let hasErrors = false;
    let lastError = null;
    let detectedSourceLanguage = sourceLanguage;
    let fragmentedUnits;
    const historyEnabled = await getAIConversationHistoryEnabledAsync();
    const laneLabel = historyEnabled ? 'ordered history lane' : 'stateless parallel lane';

    try {
      const segments = typeof text === 'string' ? JSON.parse(text) : text;
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

      logger.debug(`[JsonHandler] Executing ${batches.length} batches for ${segments.length} segments (Concurrency: ${providerConfig.rateLimit.maxConcurrent})`);
      logger.debug(`[JsonHandler] Structured batch ${laneLabel} (${mode})`);

      const self = this;
      let completedBatchCount = 0;
      const accumulatedResults = [];
      fragmentedUnits = new Map();
      const skipStreaming = mode === TranslationMode.PDF;
      const emittedLogicalIds = new Set();
      let abortInitiator = null;

      const appendFragmentDiagnostic = (type, parentId) => appendTranslationDiagnostic(executionContext, {
        type,
        stage: 'optimized-json-handler',
        parentId,
      });

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

        const collectCompleteFragments = (mappedResults) => {
          const completeResults = [];
          const sameBatchIds = new Set();

          const validateAndAdd = (item) => {
            const logicalId = extractLogicalId(item);
            if (logicalId !== undefined && sameBatchIds.has(logicalId)) {
              const err = new Error(`Duplicate identity in batch: ${String(logicalId)}`);
              err.isFatal = true;
              err.type = ErrorTypes.VALIDATION;
              throw err;
            }
            if (logicalId !== undefined) sameBatchIds.add(logicalId);
            completeResults.push(item);
          };

          for (const result of mappedResults) {
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
                 const err = new Error(`V3 marker contract violation for fragmented parent ${parentIdStr}: ${reason}`);
                err.isFatal = true;
                err.type = ErrorTypes.VALIDATION;
                throw err;
              }
              const logicalItem = { ...orderedFragments[0] };
              delete logicalItem.isSplit;
              delete logicalItem.partIndex;
              delete logicalItem.isV3Fragment;
              delete logicalItem.parentId;
              delete logicalItem.fragmentIndex;
              delete logicalItem.fragmentCount;
              delete logicalItem.fragmentJoinerBefore;
              delete logicalItem.__sourceT;
              validateAndAdd({ ...logicalItem, i: parentId, t: translatedText, text: translatedText });
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
        if (detectedSourceLanguage === 'auto' && batches.length > 0) {
          logger.debug(`[JsonHandler] Auto-detection mode: Executing first batch sequentially to resolve source language...`);
          await processBatch(batches[0], 0, { parallelExecution: false });
          
          // If first batch failed fatally, don't continue
          if (hasErrors && lastError && isFatalError(lastError)) {
            return { 
              success: false, 
              streaming: true, 
              error: {
                message: lastError.message || String(lastError),
                type: lastError.type || matchErrorToType(lastError),
                statusCode: lastError.statusCode
              },
              results: accumulatedResults
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

        const checkCancellation = () => {
          if (engine.isCancelled(messageId) || abortController.signal.aborted) {
            const abortError = new Error('Translation task cancelled');
            abortError.name = 'AbortError';
            abortError.isCancelled = true;
            throw abortError;
          }
        };

        try {
          checkCancellation();

          const statsBefore = statsManager.getSessionSummary(sessionId);
          const charsBefore = statsBefore ? statsBefore.chars : 0;
          const originalCharsBefore = statsBefore ? statsBefore.originalChars : 0;

          // Timeout Protection (5 minutes) for each batch call
          const BATCH_TIMEOUT_MS = 300000;
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
              abortController.abort();
            }, BATCH_TIMEOUT_MS);
            
            // Link timeout cleanup to abort signal
            onAbort = () => clearTimeout(timeoutId);
            abortController.signal.addEventListener('abort', onAbort);
          });

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
           const batchExecutionContext = hasManifestMembership
            ? self._createBatchExecutionContext(executionContext, batch)
            : executionContext;
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
                batchExecutionContext
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
          }

          checkCancellation();

          // Capture detected language from the first successful batch if it's currently 'auto'
          if (detectedSourceLanguage === 'auto' && translatedBatchResponse?.detectedLanguage) {
            detectedSourceLanguage = translatedBatchResponse.detectedLanguage;
            logger.debug(`[JsonHandler] Captured detected source language: ${detectedSourceLanguage}`);
          }

          const translatedBatch = (translatedBatchResponse && typeof translatedBatchResponse === 'object' && translatedBatchResponse.translatedText !== undefined)
            ? translatedBatchResponse.translatedText
            : translatedBatchResponse;

          const mappedResults = self._mapResults(batchPayload, translatedBatch, executionContext);
          const completeResults = collectCompleteFragments(mappedResults);
          checkCancellation();
          const filteredResults = [];
          const acceptedManifestUnits = [];
          for (let idx = 0; idx < completeResults.length; idx++) {
            const item = completeResults[idx];
            const logicalId = extractLogicalId(item);
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
            if (batchExecutionContext?.manifestView?.units && idx < batchExecutionContext.manifestView.units.length) {
              acceptedManifestUnits.push(batchExecutionContext.manifestView.units[idx]);
            }
          }
          // Terminal observation: accept only manifest units that survived suppression
          if (mode === TranslationMode.Select_Element
              && providerInstance.constructor.isAI
              && acceptedManifestUnits.length > 0) {
            executionContext?.onTerminalUnitsAccepted?.(acceptedManifestUnits);
          }
          accumulatedResults.push(...filteredResults);
          completedBatchCount++;
          if (!skipStreaming && filteredResults.length > 0) {
            await self._streamResults(
              tabId,
              messageId,
              filteredResults,
              i,
              batches.length,
              targetLanguage,
              detectedSourceLanguage,
              mode,
              completedBatchCount,
              abortController,
              engine
            );
          }
          
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

          const errorType = matchErrorToType(batchError);
          const isCancellation = batchError.name === 'AbortError' || 
                               batchError.isCancelled || 
                               errorType === ErrorTypes.USER_CANCELLED || 
                               errorType === ErrorTypes.TRANSLATION_CANCELLED;

          if (isCancellation) {
            fragmentedUnits.clear();
            logger.debug(`[JsonHandler] Batch ${i + 1} cancelled for messageId: ${messageId}`);
            
            // FIX: Explicitly cancel any other pending batches for this provider in the QueueManager
            // to prevent them from even attempting to start.
            if (providerInstance.providerName) {
              import('@/features/translation/core/ProviderCoordinator.js').then(({ providerCoordinator }) => {
                if (providerCoordinator && providerCoordinator.queueManager) {
                  // Actually, QueueManager is a singleton, we can use it directly
                }
              }).catch(() => { /* ignore */ });
              
              // More robust way: Use the QueueManager singleton directly
              import('@/features/translation/core/QueueManager.js').then(({ queueManager }) => {
                if (queueManager) {
                  queueManager.cancelByMessageId(messageId);
                }
              }).catch(() => { /* ignore */ });
            }
            
            return; // Exit silently on cancellation
          }
          
           logger.debug(`[JsonHandler] Batch ${i + 1} failed:`, batchError.message);
           discardFailedFragments(batchPayload);
           appendTranslationDiagnostic(executionContext, {
             type: 'STRUCTURED_BATCH_FAILURE',
             stage: 'optimized-json-handler',
             batchIndex: i,
             reason: batchError.message,
             code: batchError.type || matchErrorToType(batchError),
             fallback: true,
           });
          hasErrors = true;
          lastError = batchError;
          
          // Count the attempted batch to keep progress accounting stable.
          // Never stream the original batch as translated output on failure.
          completedBatchCount++;
          
          // Stop all other batches if error is fatal (429, etc.)
          if (isFatalError(batchError)) {
            abortInitiator = 'fatal-error';
            abortController.abort();
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
          return {
            success: false,
            streaming: true,
            error: {
              message: lastError.message || String(lastError),
              type: lastError.type || matchErrorToType(lastError),
              statusCode: lastError.statusCode
            },
            results: accumulatedResults
          };
        }
        return { success: false, streaming: true, error: { type: ErrorTypes.USER_CANCELLED, message: 'Cancelled' } };
      }

      if (!skipStreaming) {
        if (hasErrors) {
          await this._sendStreamError(tabId, messageId, lastError, targetLanguage, detectedSourceLanguage, mode);
        } else {
          await this._sendStreamEnd(tabId, messageId, providerInstance.providerName, targetLanguage, detectedSourceLanguage, mode);
        }
      }

      statsManager.printSummary(sessionId, { status: 'Streaming', success: !hasErrors, clear: true });

      const formattedError = lastError ? {
        message: lastError.message || String(lastError),
        type: lastError.type || matchErrorToType(lastError),
        statusCode: lastError.statusCode
      } : null;

      return {
        success: !hasErrors,
        streaming: true,
        error: formattedError,
        results: accumulatedResults,
        metadata: {
          batchCount: batches.length
        }
      };
    } finally {
      fragmentedUnits?.clear();
      engine.lifecycleRegistry.unregisterRequest(messageId);
    }
  }

  async _performBatchCall(providerInstance, batch, source, target, mode, abortController, messageId, sessionId, contextMetadata, contextSummary, engine, sender, originalSourceLang = null, originalTargetLang = null, parallelExecution = false, executionContext = null) {
    const isArrayInput = Array.isArray(batch);
    const textsToTranslate = isArrayInput 
      ? batch.map(item => typeof item === 'object' ? (item.t || item.text || '') : (item || ''))
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
         expectedFormat,
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

  async _streamResults(tabId, messageId, translatedData, batchIndex, totalBatches, targetLanguage, sourceLanguage, translationMode, completedCount = null, abortController = null, engine = null) {
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
      await browser.tabs.sendMessage(tabId, streamMessage);
    } catch (err) {
      logger.warn(`[JsonHandler] Failed to stream to tab ${tabId}:`, err.message);
    }
  }

  async _sendStreamEnd(tabId, messageId, providerName, targetLanguage, sourceLanguage, translationMode) {
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
      await browser.tabs.sendMessage(tabId, endMessage);
    } catch { /* ignore */ }
  }

  async _sendStreamError(tabId, messageId, lastError, targetLanguage, sourceLanguage, translationMode) {
    if (!tabId) return;
    const endMessage = {
      action: MessageActions.TRANSLATION_STREAM_END,
      messageId,
      data: {
        success: false,
        error: lastError ? { 
          message: lastError.message || String(lastError), 
          type: lastError.type || matchErrorToType(lastError),
          statusCode: lastError.statusCode
        } : null,
        sourceLanguage,
        targetLanguage,
        translationMode,
        timestamp: Date.now()
      }
    };
    try {
      await browser.tabs.sendMessage(tabId, endMessage);
    } catch { /* ignore */ }
  }
}
