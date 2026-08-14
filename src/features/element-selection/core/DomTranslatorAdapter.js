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
import { pageEventBus } from '@/core/PageEventBus.js';
import {
  getTargetLanguageAsync,
  getAIContextTranslationEnabledAsync,
  getSourceLanguageAsync,
  getEffectiveProviderAsync,
  getFeatureSemanticBlockGroupingAsync
} from '@/config.js';
import { AUTO_DETECT_VALUE } from '@/shared/constants/core.js';
import { TRANSLATION_STATUS } from '@/shared/constants/translation.js';
import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { TranslationMode } from '@/shared/config/config.js';
import { MessageContexts, ActionReasons } from '@/shared/messaging/core/MessagingCore.js';
import { registerTranslation, contentScriptIntegration } from '@/shared/messaging/core/ContentScriptIntegration.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { isFatalError, matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';

import { registryIdToName, isProviderType, ProviderTypes } from '@/features/translation/providers/ProviderConstants.js';

import {
  globalSelectElementState,
  pruneDisconnectedSelectElementTranslations,
  revertSelectElementTranslation
} from './DomTranslatorState.js';
import { collectTextNodes, collectBlockGroups, generateElementId, extractContextMetadata } from './DomTranslatorUtils.js';
import { SelectElementExtractionMode, isSelectElementTraversable, SelectElementReason } from './SelectElementPolicy.js';
import { BlockGroupReconstructor, BlockGroupMutationFailure } from './BlockGroupReconstructor.js';
import * as DirectionManager from '@/utils/dom/DomDirectionManager.js';

// Import hover manager dependencies
import { hoverPreviewLookup } from '@/features/shared/hover-preview/HoverPreviewLookup.js';
import { PAGE_TRANSLATION_ATTRIBUTES } from '@/features/page-translation/PageTranslationConstants.js';

export { getSelectElementTranslationState, revertSelectElementTranslation } from './DomTranslatorState.js';

// Strategy X - Subtree Exclusion Active Set
const activeTranslationRoots = new Set();

class DirectMutationFailure {
  constructor(cause) {
    this.cause = cause;
  }
}

function unwrapMutationFailure(error) {
  return error instanceof DirectMutationFailure || error instanceof BlockGroupMutationFailure
    ? error.cause
    : error;
}

function attachTranslationOutcome(error, outcome) {
  const meaningfulError = error && typeof error === 'object' && 'cause' in error
    ? error.cause
    : error;
  const normalizedError = error instanceof Error
    ? error
    : Object.assign(new Error(String(meaningfulError || 'Translation failed')), { cause: error });
  normalizedError.translationOutcome = outcome;
  return normalizedError;
}

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
    this.currentSessionId = null;
    this.currentTranslationToken = null;
    this.translatedSegmentMap = new Map();
    // Operation-local: mirrors the background ConversationAcceptanceCoordinator
    // registration decision for the current translation. Reset per operation.
    this._conversationAcceptanceEnabled = false;

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
    let translationToken = null;
    let getCurrentOutcome = () => ({ committedParentCount: 0, totalParentCount: 0, cancelled: false });
    let terminalStreamFailure = false;
    this.logger.operation('Starting element translation');

    try {
      // Strategy X - Subtree Exclusion Check
      for (const root of activeTranslationRoots) {
        if (root === element || root.contains(element) || element.contains(root)) {
          const error = new Error('Translation already in progress for this element');
          error.isFatal = false;
          error.type = ErrorTypes.FEATURE_BLOCKED;
          throw error;
        }
      }
      activeTranslationRoots.add(element);

      this.isTranslating = true;
      // Reset per operation: never let a previous translation's participation
      // decision leak into this one.
      this._conversationAcceptanceEnabled = false;
      
      // Generate a fresh session ID and entropy-scoped escaping prefix for this specific translation request
      this.currentSessionId = `s${Math.random().toString(36).substr(2, 6)}`;
      this.currentEntropy = Math.random().toString(36).substr(2, 4);
      
      if (onProgress) await onProgress({ status: TRANSLATION_STATUS.TRANSLATING, message: 'Translating...' });

      const originalHTML = element.innerHTML;
      const elementId = generateElementId();
      const originalClone = element.cloneNode(true);
      this.translatedSegmentMap = new Map();

      // Resolve provider and target language early to determine extraction strategy
      const [provider, targetLanguage] = await Promise.all([
        options.provider || getEffectiveProviderAsync(TranslationMode.Select_Element),
        options.targetLanguage || getTargetLanguageAsync()
      ]);

      // 1. Collect all valid text nodes using V2 or V3 extraction based on feature flag and provider type
      const isAIProvider = isProviderType(registryIdToName(provider), ProviderTypes.AI);
      const isBlockGroupingEnabled = isAIProvider && (await getFeatureSemanticBlockGroupingAsync());
      // Resolve the abstract extraction mode once per operation; the policy
      // decides traversal/capability from this mode (never from provider names).
      const extractionMode = isBlockGroupingEnabled
        ? SelectElementExtractionMode.V3
        : SelectElementExtractionMode.V2;

      // Capability preflight: the policy owns mode capability. A PRE/CODE root
      // under V2 is valid content the current mode cannot represent — surface it
      // as a capability-specific no-content outcome instead of letting the
      // collector report a misleading "no translatable text" result. Element-level
      // policy only: no DOM walk, no provider request, no collector call.
      const preflight = isSelectElementTraversable(element, { isRoot: true, extractionMode });
      if (!preflight.traversable && preflight.reason === SelectElementReason.UNSUPPORTED_MODE) {
        const error = new Error('Selected content is not supported by the current extraction mode');
        error.type = ErrorTypes.NO_TRANSLATABLE_CONTENT;
        error.reason = SelectElementReason.UNSUPPORTED_MODE;
        throw error;
      }
      
      let textNodesData = [];
      const groupMap = new Map();
      const groups = [];

      if (isBlockGroupingEnabled) {
        this.sessionContext = {
          blockMap: new WeakMap(),
          blockCounter: { value: 0 },
          activeSessionId: this.currentSessionId
        };
        const translationUnits = collectBlockGroups(element, this.sessionContext, { extractionMode });
        
        // Build groups and maps for V3 block grouping
        const blockMap = new Map();
        for (const unit of translationUnits) {
          let group = blockMap.get(unit.blockId);
          if (!group) {
            group = {
              blockId: unit.blockId,
              isV2Passthrough: false,
              units: [],
              id: unit.blockId,
              role: unit.inlineParentTags[0] || 'div',
              pendingResultsByUid: new Map(),
              invalid: false,
              applied: false,
            };
            blockMap.set(unit.blockId, group);
            groups.push(group);
            groupMap.set(unit.blockId, group);
          }
          if (unit.mode === 'V2_PASSTHROUGH') group.isV2Passthrough = true;
          group.units.push(unit);
          groupMap.set(unit.id, group);
        }
        
        this.groupMap = groupMap;

        textNodesData = translationUnits.map(unit => ({
          node: unit.node,
          text: unit.node.textContent, // Use literal nodeValue/textContent for absolute fidelity on revert
          uid: unit.id,
          blockId: unit.blockId,
          role: unit.inlineParentTags[0] || 'span'
        }));
      } else {
        this.groupMap = null;
        this.sessionContext = undefined;
        textNodesData = collectTextNodes(element, { extractionMode });
      }

      if (textNodesData.length === 0) {
        const error = new Error('No translatable text found');
        error.type = ErrorTypes.NO_TRANSLATABLE_CONTENT;
        throw error;
      }

      // Validate segment count to prevent timeout issues
      const MAX_SEGMENTS = 1000; // Prevent excessive API calls and timeouts
      const WARNING_SEGMENTS = 500; // Increased from 200
      if (textNodesData.length > MAX_SEGMENTS) {
        this.logger.debug(`[DomTranslatorAdapter] Element contains ${textNodesData.length} segments, exceeding limit of ${MAX_SEGMENTS}`);
        throw new Error(`Element is too large to translate (${textNodesData.length} text segments). Please select a smaller element.`);
      } else if (textNodesData.length > WARNING_SEGMENTS) {
        this.logger.debug(`[DomTranslatorAdapter] Element contains ${textNodesData.length} segments, translation may take longer`);
      }

      // Store batch count for progress tracking (will be updated after receiving response)
      this.batchCount = null;
      this.totalSegments = textNodesData.length;
      this.progressEmitted = false; // Flag to prevent duplicate progress emissions

      this.logger.debug(`[DomTranslatorAdapter] Initial progress: 0/? batches (${this.totalSegments} segments)`);

      // Emit initial progress (0/total batches) - will be updated after receiving response
      pageEventBus.emit('select-element-translation-progress', {
        completed: 0,
        total: 1, // Default, will be updated after receiving batch count from response
        isRequestProgress: true // Flag to indicate this is API request count
      });

      // 2. Prepare payload - keep the original node map stable with a 1:1 mapping.
      // Use abbreviated keys to save tokens: t=text, i=uid, b=blockId, r=role
      let textsToTranslate = [];
      if (isBlockGroupingEnabled) {
        textsToTranslate = groups.flatMap(g => {
          if (g.isV2Passthrough) {
            return g.units.map(unit => ({
              t: unit.text || '',
              i: unit.id,
              b: g.blockId,
              r: g.role
            }));
          } else {
            const assembled = BlockGroupReconstructor.injectMarkers(g.units, this.currentSessionId, this.currentEntropy);
            return {
              t: assembled,
              i: g.id,
              b: g.blockId,
              r: g.role
            };
          }
        });
      } else {
        textsToTranslate = textNodesData.map((data) => ({
          t: data.text || '',
          i: data.uid,
          b: data.blockId,
          r: data.role,
          isV2Unit: true
        }));
      }

      const nodeMap = new Map();
      textNodesData.forEach(data => nodeMap.set(data.uid, data));
      const directParentStates = new Map();
      const conversationParents = isBlockGroupingEnabled
        ? groups.map(group => ({
            parentId: group.blockId,
            cleanSource: group.isV2Passthrough
              ? group.units.map(unit => `${unit.leadingWS || ''}${unit.text}${unit.trailingWS || ''}`).join('')
              : group.units.map(unit => `${unit.leadingWS || ''}${unit.text}${unit.trailingWS || ''}`).join(''),
          }))
        : textNodesData.reduce((parents, data, sourceOrder) => {
            const parentId = typeof data.blockId === 'string' && data.blockId.trim()
              ? data.blockId
              : null;
            if (!parentId) return parents;
            let parent = directParentStates.get(parentId);
            if (!parent) {
              parent = {
                parentId,
                sourceOrder,
                cleanSource: '',
                handoffParent: { parentId, cleanSource: '' },
                expectedUids: new Set(),
                pendingResultsByUid: new Map(),
                invalid: false,
                applied: false,
                acknowledged: false,
              };
              directParentStates.set(parentId, parent);
              parents.push(parent.handoffParent);
            }
            parent.cleanSource += data.text || '';
            parent.expectedUids.add(data.uid);
            parent.handoffParent.cleanSource = parent.cleanSource;
            return parents;
            }, []);

      getCurrentOutcome = (cancelled = false) => {
        const parents = isBlockGroupingEnabled ? groups : Array.from(directParentStates.values());
        const totalParentCount = parents.length;
        const committedParentCount = parents.filter(parent => parent.applied === true).length;
        return { committedParentCount, totalParentCount, cancelled };
      };

      const applyCompleteDirectParent = (parent, targetLanguage, translationToken) => {
        if (!parent || parent.invalid || parent.applied) return;
        if (parent.pendingResultsByUid.size !== parent.expectedUids.size) return;
        if (translationToken && !this._isCurrentTranslation(translationToken)) return;

        const plan = [];
        for (const uid of parent.expectedUids) {
          const pending = parent.pendingResultsByUid.get(uid);
          const nodeData = pending?.nodeData;
          if (
            !pending
            || !nodeData
            || nodeData.blockId !== parent.parentId
            || !this._isDirectSourceCurrent(nodeData, translationToken)
            || typeof pending.translatedText !== 'string'
            || !pending.translatedText.trim()
          ) {
            parent.invalid = true;
            return;
          }
          plan.push({ nodeData, translatedText: pending.translatedText });
        }

        const mutationSnapshot = {
          nodes: plan.map(({ nodeData }) => ({ node: nodeData.node, value: nodeData.node.nodeValue })),
          attributeParents: new Map(),
          directionSnapshots: [],
          hoverNodes: plan.map(({ nodeData }) => ({ node: nodeData.node, value: hoverPreviewLookup.get(nodeData.node) })),
        };
        const directionElements = new Set();
        for (const { nodeData } of plan) {
          const parentElement = nodeData.node.parentElement;
          if (parentElement && !mutationSnapshot.attributeParents.has(parentElement)) {
            mutationSnapshot.attributeParents.set(parentElement, {
              present: parentElement.hasAttribute(PAGE_TRANSLATION_ATTRIBUTES.HAS_ORIGINAL),
              value: parentElement.getAttribute(PAGE_TRANSLATION_ATTRIBUTES.HAS_ORIGINAL),
            });
          }
          for (const snapshot of DirectionManager.captureNodeDirectionState(nodeData.node, element)) {
            if (!directionElements.has(snapshot.element)) {
              directionElements.add(snapshot.element);
              mutationSnapshot.directionSnapshots.push(snapshot);
            }
          }
        }

        try {
          for (const { nodeData, translatedText } of plan) {
            this._applyTranslationToNode(nodeData.node, translatedText, targetLanguage, element);
          }
          parent.applied = true;
          if (!parent.acknowledged) {
            parent.acknowledged = true;
            this._sendParentAcceptanceAck(
              parent.parentId,
              plan.map(({ translatedText }) => translatedText).join(''),
              true,
              translationToken
            ).catch(() => {});
          }
        } catch (error) {
          parent.invalid = true;
          parent.applied = false;
          parent.acknowledged = false;
          for (const { node, value } of [...mutationSnapshot.nodes].reverse()) {
            try {
              if (node) node.nodeValue = value;
            } catch (rollbackError) {
              this.logger.error('[DomTranslatorAdapter] Direct text rollback failed', { error: rollbackError });
            }
          }
          for (const [parentElement, state] of mutationSnapshot.attributeParents) {
            try {
              if (state.present) parentElement.setAttribute(PAGE_TRANSLATION_ATTRIBUTES.HAS_ORIGINAL, state.value);
              else parentElement.removeAttribute(PAGE_TRANSLATION_ATTRIBUTES.HAS_ORIGINAL);
            } catch (rollbackError) {
              this.logger.error('[DomTranslatorAdapter] Direct attribute rollback failed', { error: rollbackError });
            }
          }
          const directionFailures = DirectionManager.restoreNodeDirectionState(mutationSnapshot.directionSnapshots) || [];
          for (const failure of directionFailures) {
            this.logger.error('[DomTranslatorAdapter] Direct direction rollback failed', failure);
          }
          for (const { node, value } of mutationSnapshot.hoverNodes) {
            try {
              if (value === undefined) hoverPreviewLookup.delete(node);
              else hoverPreviewLookup.add(node, value);
            } catch (rollbackError) {
              this.logger.error('[DomTranslatorAdapter] Direct hover rollback failed', { error: rollbackError });
            }
          }
          throw new DirectMutationFailure(error);
        }
      };

      const ingestDirectResult = (item, index, targetLanguage, translationToken) => {
        if (translationToken && !this._isCurrentTranslation(translationToken)) return;
        const identityResult = this._getResultIdentity(item);
        const uid = identityResult.identity;
        const contentResult = this._getResultContent(item);
        const nodeData = nodeMap.get(uid);

        if (identityResult.status !== 'valid') {
          this._logRejectedMapping(index, uid, identityResult.status);
          return;
        }
        if (!nodeData) {
          this._logRejectedMapping(index, uid, 'unknown');
          return;
        }
        const parent = directParentStates.get(nodeData.blockId);
        if (!parent || !parent.expectedUids.has(uid)) {
          this._logRejectedMapping(index, uid, 'wrong-parent');
          return;
        }
        if (contentResult.status !== 'valid') {
          this._logRejectedContent(index, contentResult.status);
          parent.invalid = true;
          return;
        }
        if (parent.invalid || parent.applied) return;
        if (parent.pendingResultsByUid.has(uid)) {
          this._logRejectedMapping(index, uid, 'duplicate');
          parent.invalid = true;
          return;
        }

        parent.pendingResultsByUid.set(uid, {
          nodeData,
          translatedText: contentResult.content,
        });
      };

      const finalizeDirectParents = (targetLanguage, translationToken) => {
        for (const parent of directParentStates.values()) {
          applyCompleteDirectParent(parent, targetLanguage, translationToken);
        }
      };

      // Context
      const contextMetadata = extractContextMetadata(element);
      const contextSummary = contextMetadata.contextSummary; // Extract the summary
      const isAIContextEnabled = await getAIContextTranslationEnabledAsync();

      if (!this.originalSettings) await this._loadOriginalSettings();

      // Store state BEFORE translation
      this._storeTranslationState({ 
        element, 
        elementId, 
        originalHTML, 
        originalTextNodesData: textNodesData.map(d => ({ 
          node: d.node, 
          originalText: d.text,
          blockId: d.blockId
        })), 
        targetLanguage,
        sessionId: this.currentSessionId,
        partial: true
      });

      const messageId = `m${Math.random().toString(36).substr(2, 6)}`;
      this.currentMessageId = messageId;
      translationToken = { messageId, cancelled: false };
      this.currentTranslationToken = translationToken;
      let effectiveTargetLanguage = targetLanguage;
      
      // Tracking processed nodes to avoid multi-batch conflicts
      const processedUids = new Set();

      const ingestPassthroughResult = (group, uid, contentResult, targetLanguage, token) => {
        if (group.invalid || group.applied) return;
        if (contentResult.status !== 'valid') {
          group.invalid = true;
          return;
        }
        if (group.pendingResultsByUid.has(uid)) {
          group.invalid = true;
          return;
        }
        group.pendingResultsByUid.set(uid, contentResult.content);
        if (group.pendingResultsByUid.size !== group.units.length) return;

        const translatedUnits = group.units.map(unit => ({
          ...unit,
          text: group.pendingResultsByUid.get(unit.id),
        }));
        const translatedBlock = BlockGroupReconstructor.injectMarkers(translatedUnits, this.currentSessionId, this.currentEntropy);
        const reconstruction = BlockGroupReconstructor.apply(
          group.units,
          translatedBlock,
          targetLanguage,
          element,
          this.currentSessionId,
          this.currentEntropy
        );
        this._commitBlockGroup(group, reconstruction, translatedBlock, processedUids, token);
        group.applied = true;
      };

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
            if (!this._isCurrentTranslation(translationToken)) return;
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
                const resultIdentities = data.data.map(item => this._getResultIdentity(item));
                const duplicateIdentities = new Set(
                  resultIdentities
                    .filter(result => result.status === 'valid')
                    .map(result => result.identity)
                    .filter((identity, index, identities) => identities.indexOf(identity) !== index)
                );
                data.data.forEach((translatedItem, index) => {
                   if (translatedItem?.isSplitFragment === true || translatedItem?.isV3Fragment === true) {
                      this.logger.warn('[DomTranslatorAdapter] Suppressed incomplete fragment event');
                      return;
                    }
                   // Handle documented aliases for canonical unit identity.
                   const identityResult = this._getResultIdentity(translatedItem);
                   const uid = identityResult.identity;
                   const contentResult = this._getResultContent(translatedItem);
                   const text = contentResult.content;

                   if (!isBlockGroupingEnabled) {
                     ingestDirectResult(translatedItem, index, effectiveTargetLanguage, translationToken);
                     return;
                   }

                   if (identityResult.status !== 'valid' || (isBlockGroupingEnabled && duplicateIdentities.has(uid))) {
                      const duplicateGroup = groupMap?.get(uid);
                      if (duplicateGroup?.isV2Passthrough) duplicateGroup.invalid = true;
                      this._logRejectedMapping(index, uid, duplicateIdentities.has(uid) ? 'duplicate' : identityResult.status);
                      return;
                    }

                   if (isBlockGroupingEnabled && groupMap && groupMap.has(uid)) {
                    const group = groupMap.get(uid);
                      if (group.isV2Passthrough) {
                         try {
                           if (!this._isCurrentTranslation(translationToken)) return;
                           ingestPassthroughResult(group, uid, contentResult, effectiveTargetLanguage, translationToken);
                         } catch (error) {
                           const originalError = unwrapMutationFailure(error);
                           this.logger.error(`[Reconstructor] Apply failed for V2 group ${group.blockId}:`, originalError);
                           if (error instanceof BlockGroupMutationFailure) {
                             error.rollbackFailures.forEach(failure => this.logger.error('[Reconstructor] Group rollback failed', failure));
                           }
                           this._sendParentAcceptanceAck(group.blockId, null, false, translationToken).catch(() => {});
                           throw error;
                         }
                    } else {
                      if (contentResult.status !== 'valid') {
                        this._logRejectedContent(index, contentResult.status);
                        group.invalid = true;
                        return;
                      }
                      const anyProcessed = group.units.some(u => processedUids.has(u.id));
                      if (!anyProcessed) {
                        try {
                           if (!this._isCurrentTranslation(translationToken)) return;
                           const reconstruction = BlockGroupReconstructor.apply(group.units, text, effectiveTargetLanguage, element, this.currentSessionId, this.currentEntropy);
                           this._commitBlockGroup(group, reconstruction, text, processedUids, translationToken);
                        } catch (error) {
                          const originalError = unwrapMutationFailure(error);
                          this.logger.error(`[Reconstructor] Apply failed for block group ${group.blockId}:`, originalError);
                          if (error instanceof BlockGroupMutationFailure) {
                            error.rollbackFailures.forEach(failure => this.logger.error('[Reconstructor] Group rollback failed', failure));
                          } else {
                            this._rollbackBlockGroup(this.currentSessionId, group.blockId);
                          }
                           this._sendParentAcceptanceAck(group.blockId, null, false, translationToken).catch(() => {});
                           throw error;
                        }
                      }
                    }
                   } else {
                     ingestDirectResult(translatedItem, index, effectiveTargetLanguage, translationToken);
                   }
                 });

                 if (!isBlockGroupingEnabled) {
                   finalizeDirectParents(effectiveTargetLanguage, translationToken);
                 }

                 // Emit progress update using completed count when available, with batch index as fallback.
                if (data.totalBatches !== undefined) {
                  const completed = typeof data.completedCount === 'number'
                    ? data.completedCount
                    : (typeof data.batchIndex === 'number' ? data.batchIndex + 1 : undefined);

                  if (typeof completed === 'number') {
                    pageEventBus.emit('select-element-translation-progress', {
                      completed,
                      total: data.totalBatches,
                      isRequestProgress: true
                    });
                    this.progressEmitted = true; // Mark that progress has been emitted
                  }
                }
              }
            } catch (err) {
              this.logger.error('Error during onStreamUpdate processing:', err);
              safeResolve({ success: false, error: err });
            }
          },
           onStreamEnd: (data) => {
             if (isSettled) return;
             if (!this._isCurrentTranslation(translationToken)) return safeResolve({ success: false, cancelled: true });
             if (data.cancelled) return safeResolve({ success: false, cancelled: true });
             if (data.success === false || data.error) {
               terminalStreamFailure = true;
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
            if (isSettled) return;
            if (!this._isCurrentTranslation(translationToken)) {
              return safeResolve({ success: false, cancelled: true });
            }
            
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
          isExplicitProvider: !!options.provider,
          sourceLanguage: AUTO_DETECT_VALUE,
          targetLanguage: effectiveTargetLanguage,
          originalSourceLang: this.originalSettings.source,
          originalTargetLang: this.originalSettings.target,
          mode: TranslationMode.Select_Element,
          contextMetadata: isAIContextEnabled ? contextMetadata : null,
          contextSummary: contextSummary,
          options: { rawJsonPayload: true, enableDictionary: false, smartContext: isAIContextEnabled },
          sessionId: this.currentSessionId,
          conversationParents,
        },
        context: MessageContexts.SELECT_ELEMENT,
      });

      // Authoritative background signal: parent acceptance ACKs are only emitted
      // when the ConversationAcceptanceCoordinator registered a handle for this
      // request (mirrors the background participation decision).
      this._conversationAcceptanceEnabled = response?.conversationAcceptance === true;

      // CRITICAL: Await stream completion if streaming was used, otherwise process direct response
      let result;
      if (response?.success && (response.streaming || response.type === 'stream_end')) {
        if (response.metadata?.batchCount !== undefined) {
          this.batchCount = response.metadata.batchCount;
        }
        result = await streamEndPromise;
      } else if (response?.success) {
        result = await this._handleDirectResponse(
          response,
          textNodesData,
          nodeMap,
          effectiveTargetLanguage,
          element,
          translationToken,
          ingestDirectResult,
          finalizeDirectParents,
          ingestPassthroughResult
        );
      } else {
        result = response;
      }

      // Update effective target language from result if it changed
      if (result?.targetLanguage) {
        effectiveTargetLanguage = result.targetLanguage;
      }

       // If the result contains an error, throw it now
       if (result && result.success === false && result.error) {
         const outcome = getCurrentOutcome(Boolean(result.cancelled));
         if (terminalStreamFailure
             && !outcome.cancelled
             && outcome.totalParentCount > 0
             && outcome.committedParentCount === outcome.totalParentCount) {
           this.logger.warn('[DomTranslatorAdapter] Suppressed terminal stream failure after complete commit', {
             committedParentCount: outcome.committedParentCount,
             totalParentCount: outcome.totalParentCount,
           });
           result = { success: true, targetLanguage: result.targetLanguage };
         } else {
           throw attachTranslationOutcome(result.error, outcome);
         }
       }

      // Snapshot request-local commit state while parent/group objects still exist.
      const committedParentCount = isBlockGroupingEnabled
        ? groups.filter(group => group.applied === true).length
        : Array.from(directParentStates.values()).filter(parent => parent.applied === true).length;
      const rejectedParentCount = isBlockGroupingEnabled
        ? groups.filter(group => group.invalid === true).length
        : Array.from(directParentStates.values()).filter(parent => parent.invalid === true).length;

      this.logger.debug('[DomTranslatorAdapter] Operation commit summary', {
        committedParentCount,
        rejectedParentCount,
        zeroCommit: committedParentCount === 0,
      });

       const finalResult = await this._finalizeTranslation({
        result, element, elementId, targetLanguage: effectiveTargetLanguage, onComplete, sessionId: this.currentSessionId, committedParentCount, totalParentCount: getCurrentOutcome().totalParentCount
       });

      // --- Phase 6 Shadow Mode Validation Gate ---
      if (isBlockGroupingEnabled && finalResult?.success) {
        try {
          const { ShadowComparisonEngine } = await import('./ShadowComparisonEngine.js');
          const v2Clone = originalClone.cloneNode(true);

          // Map live text nodes to clone text nodes to bypass disconnected getComputedStyle issues
          const liveToCloneMap = new WeakMap();
          const walker1 = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
          const walker2 = document.createTreeWalker(v2Clone, NodeFilter.SHOW_TEXT, null);
          let n1, n2;
          while ((n1 = walker1.nextNode()) && (n2 = walker2.nextNode())) {
            liveToCloneMap.set(n1, n2);
          }

          // Extract unique units from groupMap safely
          const uniqueUnits = Array.from(new Set(
            Array.from(this.groupMap.values()).flatMap(group => group.units)
          ));

          this.logger.debug('[ShadowMode] textsToTranslate:', textsToTranslate);
          this.logger.debug('[ShadowMode] keys in translatedSegmentMap:', Array.from(this.translatedSegmentMap.keys()));
          this.logger.debug('[ShadowMode] mapped units for V2 simulation:', uniqueUnits.length);

          uniqueUnits.forEach((unit) => {
            if (!unit || !unit.id) return;
            const translatedText = this.translatedSegmentMap.get(unit.id);

            if (translatedText !== undefined) {
              const targetNodeInClone = liveToCloneMap.get(unit.node);
              if (targetNodeInClone) {
                this._applyTranslationToNode(targetNodeInClone, translatedText, effectiveTargetLanguage, v2Clone);
              }
            }
          });

          const comparison = ShadowComparisonEngine.compare(v2Clone, element, []);

          if (!comparison.equivalent) {
            this.logger.error(`[ShadowMode] Reconstruction anomaly detected!\nReason: ${comparison.reason}`);
          } else if (comparison.warnings && comparison.warnings.length > 0) {
            this.logger.debug(`[ShadowMode] Reconstruction validated with non-fatal attribute changes:\n${comparison.warnings.join('\n')}`);
          } else {
            this.logger.debug('[ShadowMode] Reconstruction perfectly validated. Semantic equivalence verified.');
          }
        } catch (shadowError) {
          this.logger.warn('[ShadowMode] Failed to execute shadow comparison gate:', shadowError.message);
        }
      }

      return finalResult;

    } catch (error) {
      const originalError = unwrapMutationFailure(error);
      this.isTranslating = false; 

      const type = matchErrorToType(originalError);
      const isCancellation = type === ErrorTypes.USER_CANCELLED || type === ErrorTypes.TRANSLATION_CANCELLED;
      const outcome = getCurrentOutcome(isCancellation);
      const finalError = attachTranslationOutcome(originalError, outcome);

      if (!isCancellation) {
        this.logger.debug('Translation error in DomTranslatorAdapter:', finalError);
      }

      if (onError) await onError({ status: TRANSLATION_STATUS.ERROR, error: finalError });
      throw finalError;
    } finally {
      activeTranslationRoots.delete(element);
      this._cleanupCurrentSession(true, translationToken);
    }
  }

  _shouldInjectBidi(node, translation) {
    if (!node || !node.parentElement) return false;
    let parent = node.parentElement;
    while (parent) {
      const tag = parent.tagName.toUpperCase();
      if (['PRE', 'CODE', 'INPUT', 'TEXTAREA'].includes(tag)) return false;
      if (parent.contentEditable === 'true' || parent.getAttribute('contenteditable') === 'true') return false;
      parent = parent.parentElement;
    }
    
    if (!translation || typeof translation !== 'string') return false;

    // Skip pure punctuation, numbers or spacing nodes to avoid unnecessary pollution
    const hasAlphaNumeric = /[\p{L}\p{N}]/u.test(translation);
    if (!hasAlphaNumeric) return false;
    
    // Check if the detected direction of the translated segment differs from container explicit direction
    const detectedDir = DirectionManager.detectDirectionFromContent(translation);
    let parentDir = 'ltr';
    try {
      // Avoid getComputedStyle layout flush by reading attributes directly
      const dirNode = node.parentElement.closest('[dir]');
      if (dirNode) {
        parentDir = (dirNode.dir || dirNode.getAttribute('dir')).toLowerCase();
      } else {
        parentDir = document.documentElement.dir || 'ltr';
      }
    } catch {
      // Ignore style computation errors
    }
    
    return detectedDir !== parentDir;
  }

  _getResultIdentity(item) {
    if (!item || typeof item !== 'object') return { status: 'missing', identity: null };

    const aliases = ['i', 'uid', 'id']
      .filter(alias => Object.prototype.hasOwnProperty.call(item, alias));
    if (aliases.length === 0) return { status: 'missing', identity: null };

    const values = aliases.map(alias => item[alias]);
    if (values.some(value => typeof value !== 'string' || !value.trim())) {
      return { status: 'missing', identity: null };
    }

    const identities = new Set(values);
    if (identities.size > 1) return { status: 'ambiguous', identity: null };
    return { status: 'valid', identity: values[0] };
  }

  _logRejectedMapping(index, identity, reason) {
    this.logger.warn('[DomTranslatorAdapter] Rejected translation result mapping', {
      reason,
      resultIndex: index,
      identityPresent: Boolean(identity),
      identityKnown: reason !== 'unknown',
    });
  }

  _getResultContent(item) {
    if (!item || typeof item !== 'object') return { status: 'invalid', content: null };

    const fields = ['t', 'text', 'translation'];
    const field = fields.find(name => Object.prototype.hasOwnProperty.call(item, name));
    if (!field) return { status: 'missing', content: null };

    const content = item[field];
    if (typeof content !== 'string' || !content.trim()) {
      return { status: 'invalid', content: null };
    }
    return { status: 'valid', content };
  }

  _logRejectedContent(index, reason) {
    this.logger.warn('[DomTranslatorAdapter] Rejected translation result content', {
      reason,
      resultIndex: index,
    });
  }

  _isDirectSourceCurrent(nodeData, translationToken = null) {
    if (translationToken && !this._isCurrentTranslation(translationToken)) return false;
    const node = nodeData?.node;
    return Boolean(
      node?.isConnected
      && typeof nodeData?.text === 'string'
      && node.nodeValue === nodeData.text
    );
  }

  _applyTranslationToNode(textNode, translatedText, targetLanguage, rootElement) {
    if (!textNode || !translatedText) return;
    
    // Safety check: extract string content
    let finalTranslation = typeof translatedText === 'string' ? translatedText : null;
    if (!finalTranslation || !finalTranslation.trim()) return;

    const originalText = textNode.textContent;
    const leadingMatch = originalText.match(/^(\s*)/);
    const trailingMatch = originalText.match(/(\s*)$/);
    const leadingWhitespace = leadingMatch ? leadingMatch[1] : '';
    const trailingWhitespace = trailingMatch ? trailingMatch[1] : '';
    const trimmedOriginal = originalText.trim();

    // OPTIMIZATION: Preserve ZWNJ, Tatweel, Dashes and BiDi marks if the provider 
    // returned a "cleaned" version of the same text.
    // We ignore: ZWSP(\u200b), ZWNJ(\u200c), ZWJ(\u200d), LRM(\u200e), RLM(\u200f), BOM(\ufeff), Tatweel(\u0640), EnDash(\u2013), EmDash(\u2014)
    const normalizeForComparison = (s) => s ? s.replace(/[\u200b-\u200f\uFEFF\u0640\u2013\u2014]/g, '').replace(/\s+/g, ' ').trim() : '';
    const isFunctionallyIdentical = normalizeForComparison(finalTranslation) === normalizeForComparison(trimmedOriginal);
    if (isFunctionallyIdentical) {
      finalTranslation = trimmedOriginal;
    } else {
      finalTranslation = finalTranslation.trim();
    }

    // 1. Register original text before modification for Hover Tooltip
    hoverPreviewLookup.add(textNode, originalText);

    // 2. Mark the immediate parent element as having original text (Surgical marking)
    const parentElement = textNode.parentElement;
    if (parentElement && parentElement.getAttribute(PAGE_TRANSLATION_ATTRIBUTES.HAS_ORIGINAL) !== 'true') {
      parentElement.setAttribute(PAGE_TRANSLATION_ATTRIBUTES.HAS_ORIGINAL, 'true');
    }

    // BiDi Text & Punctuation Support (Conditional & Context-Aware)
    let finalValue;
    if (this._shouldInjectBidi(textNode, finalTranslation)) {
      const detectedDir = DirectionManager.detectDirectionFromContent(finalTranslation);
      const bidiMark = detectedDir === 'rtl' ? DirectionManager.BIDI_MARKS.RLM : DirectionManager.BIDI_MARKS.LRM;
      finalValue = leadingWhitespace + bidiMark + finalTranslation + bidiMark + trailingWhitespace;
    } else {
      finalValue = leadingWhitespace + finalTranslation + trailingWhitespace;
    }

    textNode.nodeValue = finalValue;
    DirectionManager.applyNodeDirection(textNode, targetLanguage, rootElement);
  }

  _commitBlockGroup(group, reconstruction, translatedText, processedUids, translationToken) {
    const previousMap = new Map(group.units.map(unit => [
      unit.id,
      { present: this.translatedSegmentMap.has(unit.id), value: this.translatedSegmentMap.get(unit.id) }
    ]));
    const previousProcessed = new Map(group.units.map(unit => [unit.id, processedUids.has(unit.id)]));

    try {
      reconstruction.segments.forEach(segment => this.translatedSegmentMap.set(segment.id, segment.text));
      group.units.forEach(unit => processedUids.add(unit.id));
      if (!group.isV2Passthrough) {
        try {
          const parsed = BlockGroupReconstructor.splitTranslatedBlock(
            translatedText,
            group.units,
            this.currentSessionId,
            this.currentEntropy
          );
          parsed.forEach(segment => this.translatedSegmentMap.set(segment.id, segment.text));
        } catch {
          // Optional shadow refinement must not reject an accepted reconstruction.
        }
      }
      if (translationToken && !this._isCurrentTranslation(translationToken)) {
        throw new Error('Grouped translation became stale before acceptance');
      }
      reconstruction.transaction.finalize();
      group.applied = true;
      this._sendParentAcceptanceAck(group.blockId, reconstruction.cleanResult, true, translationToken).catch(() => {});
    } catch (error) {
      for (const [uid, state] of previousMap) {
        if (state.present) this.translatedSegmentMap.set(uid, state.value);
        else this.translatedSegmentMap.delete(uid);
      }
      for (const [uid, wasProcessed] of previousProcessed) {
        if (wasProcessed) processedUids.add(uid);
        else processedUids.delete(uid);
      }
      throw new BlockGroupMutationFailure(error, reconstruction.transaction.rollback());
    }
  }

  async _handleDirectResponse(response, textNodesData, nodeMap, targetLanguage, element, translationToken, ingestDirectResult, finalizeDirectParents, ingestPassthroughResult) {
    this.logger.debug(`[DomTranslatorAdapter] _handleDirectResponse called (batchCount: ${this.batchCount})`);

    if (this.sessionContext === undefined && (!ingestDirectResult || !finalizeDirectParents)) {
      throw new Error('Direct response requires canonical parent lifecycle callbacks');
    }

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

      if (rawResults && typeof rawResults === 'object' && Array.isArray(rawResults.translations)) {
        rawResults = rawResults.translations;
      }

      const results = Array.isArray(rawResults) ? rawResults : [rawResults];
      const finalTargetLanguage = response.targetLanguage || targetLanguage;

      const processedUids = new Set();
      const isBlockGroupingEnabled = this.sessionContext !== undefined;

      const resultIdentities = results.map(item => this._getResultIdentity(item));
      const duplicateIdentities = new Set(
        resultIdentities
          .filter(result => result.status === 'valid')
          .map(result => result.identity)
          .filter((identity, index, identities) => identities.indexOf(identity) !== index)
      );

      results.forEach((item, i) => {
        if (translationToken && !this._isCurrentTranslation(translationToken)) return;
        if (item?.isSplitFragment === true) {
          this.logger.warn('[DomTranslatorAdapter] Suppressed incomplete V2 fragment result');
          return;
        }
        const identityResult = this._getResultIdentity(item);
        const uid = identityResult.identity;
        const contentResult = this._getResultContent(item);
        const text = contentResult.content;

        if (!isBlockGroupingEnabled) {
          ingestDirectResult(item, i, finalTargetLanguage, translationToken);
          return;
        }

        if (identityResult.status !== 'valid' || (isBlockGroupingEnabled && duplicateIdentities.has(uid))) {
          const duplicateGroup = this.groupMap?.get(uid);
          if (duplicateGroup?.isV2Passthrough) duplicateGroup.invalid = true;
          this._logRejectedMapping(i, uid, duplicateIdentities.has(uid) ? 'duplicate' : identityResult.status);
          return;
        }

        if (isBlockGroupingEnabled && this.groupMap && this.groupMap.has(uid)) {
          const group = this.groupMap.get(uid);
          if (group.isV2Passthrough) {
               try {
                 if (translationToken && !this._isCurrentTranslation(translationToken)) return;
                 ingestPassthroughResult(group, uid, contentResult, finalTargetLanguage, translationToken);
               } catch (error) {
                 const originalError = unwrapMutationFailure(error);
                 this.logger.error(`[Reconstructor] Apply failed for V2 group ${group.blockId}:`, originalError);
                 if (error instanceof BlockGroupMutationFailure) {
                   error.rollbackFailures.forEach(failure => this.logger.error('[Reconstructor] Group rollback failed', failure));
                 }
                 this._sendParentAcceptanceAck(group.blockId, null, false, translationToken).catch(() => {});
                 throw error;
               }
          } else {
            if (contentResult.status !== 'valid') {
              this._logRejectedContent(i, contentResult.status);
              group.invalid = true;
              return;
            }
            const anyProcessed = group.units.some(u => processedUids.has(u.id));
            if (!anyProcessed) {
              try {
                  if (translationToken && !this._isCurrentTranslation(translationToken)) return;
                  const reconstruction = BlockGroupReconstructor.apply(group.units, text, finalTargetLanguage, element, this.currentSessionId, this.currentEntropy);
                  this._commitBlockGroup(group, reconstruction, text, processedUids, translationToken);
               } catch (error) {
                 const originalError = unwrapMutationFailure(error);
                 this.logger.error(`[Reconstructor] Apply failed for block group ${group.blockId}:`, originalError);
                 if (error instanceof BlockGroupMutationFailure) {
                   error.rollbackFailures.forEach(failure => this.logger.error('[Reconstructor] Group rollback failed', failure));
                 } else {
                   this._rollbackBlockGroup(this.currentSessionId, group.blockId);
                 }
                  this._sendParentAcceptanceAck(group.blockId, null, false, translationToken).catch(() => {});
                  throw error;
              }
            }
          }
          }
      });

      if (finalizeDirectParents) finalizeDirectParents(finalTargetLanguage, translationToken);

      // Emit final progress for non-streaming mode
      // Use batch count if available, otherwise use 1 (single request)
      const total = this.batchCount || 1;

      // Prevent duplicate progress emissions (e.g., when streaming mode also calls this)
      if (!this.progressEmitted || this.batchCount !== null) {
        this.logger.debug(`[DomTranslatorAdapter] _handleDirectResponse emitting final progress: ${total}/${total} (batchCount: ${this.batchCount})`);
        pageEventBus.emit('select-element-translation-progress', {
          completed: total,
          total: total,
          isRequestProgress: true // Always use request progress for consistency
        });
        this.progressEmitted = true;
      } else {
        this.logger.debug(`[DomTranslatorAdapter] _handleDirectResponse skipping duplicate progress emit`);
      }

      return {
        success: true,
        isNonStreaming: true,
        translatedResults: results,
        targetLanguage: finalTargetLanguage
      };
    } catch (err) {
      this.logger.error('Direct translation handling failed:', err);
      const errorType = matchErrorToType(err);
      if (
        err?.type
        || err?.statusCode
        || err?.isCancelled
        || err?.name === 'AbortError'
        || err instanceof DirectMutationFailure
        || err instanceof BlockGroupMutationFailure
        || errorType === ErrorTypes.USER_CANCELLED
        || errorType === ErrorTypes.TRANSLATION_CANCELLED
        || errorType === ErrorTypes.TRANSLATION_TIMEOUT
      ) {
        throw err;
      }
      throw new Error('Invalid translation format');
    }
  }

  async _finalizeTranslation({ result, element, elementId, targetLanguage, onComplete, sessionId, committedParentCount = 0, totalParentCount = 0 }) {
    const translationOutcome = {
      committedParentCount,
      totalParentCount,
      cancelled: Boolean(result?.cancelled),
    };
    if (!result?.success) {
      if (result.cancelled) return {
        success: false,
        cancelled: true,
        element,
        committedParentCount,
        totalParentCount,
        translationOutcome,
      };
      const error = attachTranslationOutcome(result.error || new Error('Translation failed'), translationOutcome);
      throw error;
    }

    // Operation-level contract: provider/transport success is not operation success.
    // At least one logical parent must have reached the accepted/applied terminal state.
    if (committedParentCount === 0) {
      const error = new Error('No translation results were accepted');
      error.type = ErrorTypes.NO_ACCEPTED_TRANSLATION_RESULTS;
      return {
        success: false,
        error: attachTranslationOutcome(error, translationOutcome),
        committedParentCount,
        totalParentCount,
        translationOutcome,
        element,
      };
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

    // Non-terminal partial completion: some requested logical parents committed,
    // at least one remains uncommitted (invalid/pending/missing/rejected), and the
    // stream/provider completed normally. Keeps success true to avoid failure/retry
    // semantics while exposing the partial bit to the consuming feature.
    const partial = committedParentCount > 0 && committedParentCount < totalParentCount;
    if (partial) {
      this.logger.debug('[DomTranslatorAdapter] Select Element translation completed partially', {
        committedParentCount,
        totalParentCount,
      });
    }
    return { success: true, partial, elementId, element, committedParentCount, totalParentCount };
  }

  async _sendParentAcceptanceAck(parentId, cleanResult, accepted, translationToken = null) {
    // No-op when the operation did not register conversation acceptance:
    // the background has no handle for this message, so the ACK would be
    // dropped as "unknown message". Emission mirrors registration exactly.
    if (!this._conversationAcceptanceEnabled) return;
    if (translationToken && !this._isCurrentTranslation(translationToken)) return;
    if (!this.currentMessageId || !parentId) {
      this.logger.error('[DomTranslatorAdapter] Missing canonical blockId for parent acceptance ACK', {
        code: 'MISSING_CANONICAL_PARENT_IDENTITY',
        messageId: this.currentMessageId,
        accepted,
      });
      return;
    }
    await sendRegularMessage({
      action: MessageActions.PARENT_ACCEPTANCE_ACK,
      messageId: this.currentMessageId,
      data: { parentId, cleanResult: accepted ? cleanResult : undefined, accepted },
    }, { silent: true });
  }

  _storeTranslationState(data) {
    const { element, originalTextNodesData, sessionId } = data;
    pruneDisconnectedSelectElementTranslations();
    
    // Ensure absolute immutability of the rollback text node snapshots and register them
    const frozenTextNodesData = originalTextNodesData
      ? originalTextNodesData.map(d => Object.freeze({
          node: d.node,
          originalText: Object.freeze(String(d.originalText)),
          blockId: d.blockId || null
        }))
      : null;

    // Enforce namespaced and session-scoped snapshots for rollback safety
    if (frozenTextNodesData && sessionId) {
      if (!globalSelectElementState.snapshots) {
        globalSelectElementState.snapshots = new Map();
      }
      frozenTextNodesData.forEach(d => {
        const blockId = d.blockId || 'default';
        const key = `${sessionId}:${blockId}`;
        let blockSnapshots = globalSelectElementState.snapshots.get(key);
        if (!blockSnapshots) {
          blockSnapshots = [];
          globalSelectElementState.snapshots.set(key, blockSnapshots);
        }
        blockSnapshots.push(d);
      });
    }

    const stateEntry = { 
      ...data, 
      originalTextNodesData: frozenTextNodesData,
      originalDir: element.getAttribute('dir'),
      originalStyleDirection: element.style.direction,
      originalTextAlign: element.style.textAlign,
      timestamp: Date.now() 
    };
    
    globalSelectElementState.translationHistory.push(stateEntry);
    globalSelectElementState.currentTranslation = stateEntry; // IMPORTANT: Set current translation pointer
  }

  _rollbackBlockGroup(sessionId, blockId) {
    if (!sessionId || !blockId) return;
    const key = `${sessionId}:${blockId}`;
    const snapshots = globalSelectElementState.snapshots?.get(key);
    if (snapshots && snapshots.length > 0) {
      this.logger.warn(`[Rollback] Performing atomic rollback for block group ${blockId} (Session: ${sessionId})`);
      snapshots.forEach(({ node, originalText }) => {
        if (node && node.parentNode && document.documentElement.contains(node)) {
          node.nodeValue = originalText;
        }
      });
    }
  }

  _cleanupCurrentSession(isSuccess = false, token = this.currentTranslationToken) {
    if (token && this.currentTranslationToken !== token) {
      if (!isSuccess) token.cancelled = true;
      return;
    }

    this.isTranslating = false;
    const messageId = this.currentMessageId;
    if (token && !isSuccess) token.cancelled = true;
    if (messageId) {
      // Use the correct API from contentScriptIntegration
      if (!isSuccess) {
        contentScriptIntegration.streamingHandler.cancelHandler(messageId);
      }
      this.currentMessageId = null;
    }
    if (this.currentTranslationToken === token) this.currentTranslationToken = null;
    this.translatedSegmentMap.clear();
  }

  _isCurrentTranslation(token) {
    return Boolean(token)
      && !token.cancelled
      && this.currentTranslationToken === token
      && this.currentMessageId === token.messageId;
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
    if (this.currentSessionId) {
      sendRegularMessage({ action: MessageActions.CANCEL_SESSION, data: { sessionId: this.currentSessionId } }).catch(() => {});
    }
    super.cleanup();
  }
}

export default DomTranslatorAdapter;
