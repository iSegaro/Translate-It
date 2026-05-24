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

import { globalSelectElementState, revertSelectElementTranslation } from './DomTranslatorState.js';
import { collectTextNodes, collectBlockGroups, generateElementId, extractContextMetadata } from './DomTranslatorUtils.js';
import { BlockGroupReconstructor } from './BlockGroupReconstructor.js';
import * as DirectionManager from '@/utils/dom/DomDirectionManager.js';

// Import hover manager dependencies
import { hoverPreviewLookup } from '@/features/shared/hover-preview/HoverPreviewLookup.js';
import { PAGE_TRANSLATION_ATTRIBUTES } from '@/features/page-translation/PageTranslationConstants.js';

export { getSelectElementTranslationState, revertSelectElementTranslation } from './DomTranslatorState.js';

// Strategy X - Subtree Exclusion Active Set
const activeTranslationRoots = new Set();

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
    this.translatedSegmentMap = new Map();

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
      
      // Generate a fresh session ID for this specific translation request
      this.currentSessionId = `s${Math.random().toString(36).substr(2, 6)}`;
      
      if (onProgress) await onProgress({ status: TRANSLATION_STATUS.TRANSLATING, message: 'Translating...' });

      const originalHTML = element.innerHTML;
      const elementId = generateElementId();
      const originalClone = element.cloneNode(true);
      this.translatedSegmentMap = new Map();
      
      // 1. Collect all valid text nodes using V2 or V3 extraction based on feature flag
      const isBlockGroupingEnabled = await getFeatureSemanticBlockGroupingAsync();
      let textNodesData = [];
      const groupMap = new Map();
      const groups = [];

      if (isBlockGroupingEnabled) {
        this.sessionContext = {
          blockMap: new WeakMap(),
          blockCounter: { value: 0 },
          activeSessionId: this.currentSessionId
        };
        const translationUnits = collectBlockGroups(element, this.sessionContext);
        
        // Build groups and maps for V3 block grouping
        const blockMap = new Map();
        for (const unit of translationUnits) {
          if (unit.mode === 'V2_PASSTHROUGH') {
            const group = {
              blockId: unit.blockId,
              isV2Passthrough: true,
              units: [unit],
              id: unit.id,
              text: unit.text,
              role: unit.inlineParentTags[0] || 'span'
            };
            groups.push(group);
            groupMap.set(unit.id, group);
          } else {
            let group = blockMap.get(unit.blockId);
            if (!group) {
              group = {
                blockId: unit.blockId,
                isV2Passthrough: false,
                units: [],
                id: unit.blockId,
                role: unit.inlineParentTags[0] || 'div'
              };
              blockMap.set(unit.blockId, group);
              groups.push(group);
              groupMap.set(unit.blockId, group);
            }
            group.units.push(unit);
            // Also map segment IDs to their parent group to support fallback lookup
            groupMap.set(unit.id, group);
          }
        }
        
        this.groupMap = groupMap;

        textNodesData = translationUnits.map(unit => ({
          node: unit.node,
          text: unit.text,
          uid: unit.id,
          blockId: unit.blockId,
          role: unit.inlineParentTags[0] || 'span'
        }));
      } else {
        this.groupMap = null;
        textNodesData = collectTextNodes(element);
      }

      if (textNodesData.length === 0) throw new Error('No translatable text found');

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

      // 2. Prepare payload - CRITICAL: Must be 1:1 mapping with textNodesData
      // Use abbreviated keys to save tokens: t=text, i=uid, b=blockId, r=role
      let textsToTranslate = [];
      if (isBlockGroupingEnabled) {
        textsToTranslate = groups.map(g => {
          if (g.isV2Passthrough) {
            return {
              t: g.text || '',
              i: g.id,
              b: g.blockId,
              r: g.role
            };
          } else {
            const assembled = BlockGroupReconstructor.injectMarkers(g.units, this.currentSessionId);
            return {
              t: assembled,
              i: g.id,
              b: g.blockId,
              r: g.role
            };
          }
        });
      } else {
        textsToTranslate = textNodesData.map(data => ({ 
          t: data.text || '',
          i: data.uid,
          b: data.blockId,
          r: data.role
        }));
      }

      const nodeMap = new Map();
      textNodesData.forEach(data => nodeMap.set(data.uid, data));

      // Context
      const contextMetadata = extractContextMetadata(element);
      const contextSummary = contextMetadata.contextSummary; // Extract the summary
      const isAIContextEnabled = await getAIContextTranslationEnabledAsync();

      const [provider, targetLanguage] = await Promise.all([
        options.provider || getEffectiveProviderAsync(TranslationMode.Select_Element),
        options.targetLanguage || getTargetLanguageAsync()
      ]);

      if (!this.originalSettings) await this._loadOriginalSettings();

      // Store state BEFORE translation
      this._storeTranslationState({ 
        element, 
        elementId, 
        originalHTML, 
        originalTextNodesData: textNodesData.map(d => ({ node: d.node, originalText: d.text })), 
        targetLanguage,
        partial: true
      });

      const messageId = `m${Math.random().toString(36).substr(2, 6)}`;
      this.currentMessageId = messageId;
      let effectiveTargetLanguage = targetLanguage;
      
      // Tracking processed nodes to avoid multi-batch conflicts
      const processedUids = new Set();
      let lastProcessedIndex = 0;

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
                data.data.forEach((translatedItem, index) => {
                  // Handle both abbreviated and full keys for backward compatibility
                  const uid = translatedItem?.i || translatedItem?.uid || (data.originalData && (data.originalData[index]?.i || data.originalData[index]?.uid));
                  const text = translatedItem?.t || translatedItem?.text || translatedItem;

                  if (isBlockGroupingEnabled && groupMap && groupMap.has(uid)) {
                    const group = groupMap.get(uid);
                    if (group.isV2Passthrough) {
                      const unit = group.units[0];
                      if (!processedUids.has(unit.id)) {
                        this._applyTranslationToNode(unit.node, text, effectiveTargetLanguage, element);
                        processedUids.add(unit.id);
                        this.translatedSegmentMap.set(unit.id, text);
                      }
                    } else {
                      const anyProcessed = group.units.some(u => processedUids.has(u.id));
                      if (!anyProcessed) {
                        try {
                          BlockGroupReconstructor.apply(group.units, text, effectiveTargetLanguage, element, this.currentSessionId);
                          group.units.forEach(u => processedUids.add(u.id));
                          
                          // Capture split segment translations for shadow comparison
                          try {
                            const parsed = BlockGroupReconstructor.splitTranslatedBlock(text, group.units, this.currentSessionId);
                            parsed.forEach(seg => {
                              this.translatedSegmentMap.set(seg.id, seg.text);
                            });
                          } catch {}
                        } catch (error) {
                          this.logger.error(`[Reconstructor] Apply failed for block group ${group.blockId}:`, error);
                          this._rollbackBlockGroup(this.currentSessionId, group.blockId);
                          throw error;
                        }
                      }
                    }
                  } else {
                    let nodeData = null;
                    if (uid) {
                      nodeData = nodeMap.get(uid);
                    }

                    // Fallback to sequential index ONLY if UID mapping fails or is missing
                    if (!nodeData) {
                      nodeData = textNodesData[lastProcessedIndex++];
                    } else {
                      // If we found by UID, update our sequential pointer if possible
                      const currentIdx = textNodesData.findIndex(d => d.uid === uid);
                      if (currentIdx !== -1) lastProcessedIndex = Math.max(lastProcessedIndex, currentIdx + 1);
                    }

                    if (nodeData && !processedUids.has(nodeData.uid)) {
                      this._applyTranslationToNode(nodeData.node, text, effectiveTargetLanguage, element);
                      processedUids.add(nodeData.uid);
                      this.translatedSegmentMap.set(nodeData.uid, text);
                    }
                  }
                });

                // Emit progress update based on batch index if available (OUTSIDE the loop)
                if (data.batchIndex !== undefined && data.totalBatches !== undefined) {
                  pageEventBus.emit('select-element-translation-progress', {
                    completed: data.batchIndex + 1,
                    total: data.totalBatches,
                    isRequestProgress: true
                  });
                  this.progressEmitted = true; // Mark that progress has been emitted
                }
              }
            } catch (err) {
              this.logger.error('Error during onStreamUpdate processing:', err);
              safeResolve({ success: false, error: err });
            }
          },
          onStreamEnd: (data) => {
            if (isSettled) return;
            if (data.cancelled) return safeResolve({ success: false, cancelled: true });
            if (data.success === false || data.error) {
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
            if (isSettled || !this.currentMessageId) return;
            
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
        },
        context: MessageContexts.SELECT_ELEMENT,
      });

      // CRITICAL: Await stream completion if streaming was used, otherwise process direct response
      let result;
      if (response?.success && (response.streaming || response.type === 'stream_end')) {
        result = await streamEndPromise;
      } else if (response?.success) {
        result = await this._handleDirectResponse(response, textNodesData, nodeMap, effectiveTargetLanguage, element);
      } else {
        result = response;
      }

      // Update effective target language from result if it changed
      if (result?.targetLanguage) {
        effectiveTargetLanguage = result.targetLanguage;
      }

      // If the result contains an error, throw it now
      if (result && result.success === false && result.error) {
        throw result.error;
      }

      const finalResult = await this._finalizeTranslation({
        result, element, elementId, targetLanguage: effectiveTargetLanguage, onComplete, sessionId: this.currentSessionId
      });

      // --- Phase 6 Shadow Mode Validation Gate ---
      if (isBlockGroupingEnabled && finalResult?.success) {
        try {
          const { ShadowComparisonEngine } = await import('./ShadowComparisonEngine.js');
          const v2Clone = originalClone.cloneNode(true);
          const v2TextNodes = collectTextNodes(v2Clone);
          
          this.logger.debug('[ShadowMode] textsToTranslate:', textsToTranslate);
          this.logger.debug('[ShadowMode] keys in translatedSegmentMap:', Array.from(this.translatedSegmentMap.keys()));
          this.logger.debug('[ShadowMode] values in translatedSegmentMap:', Array.from(this.translatedSegmentMap.values()));
          this.logger.debug('[ShadowMode] UIDs in v2TextNodes:', v2TextNodes.map(n => n.uid));
          
          v2TextNodes.forEach((nodeData) => {
            const translatedText = this.translatedSegmentMap.get(nodeData.uid);
            if (translatedText !== undefined) {
              this._applyTranslationToNode(nodeData.node, translatedText, effectiveTargetLanguage, v2Clone);
            }
          });

          const comparison = ShadowComparisonEngine.compare(v2Clone, element);
          if (!comparison.equivalent) {
            this.logger.error(`[ShadowMode] Reconstruction anomaly detected!\nReason: ${comparison.reason}`);
          } else {
            this.logger.debug('[ShadowMode] Reconstruction perfectly validated. Semantic equivalence verified.');
          }
        } catch (shadowError) {
          this.logger.warn('[ShadowMode] Failed to execute shadow comparison gate:', shadowError.message);
        }
      }

      return finalResult;

    } catch (error) {
      this.isTranslating = false; 
      
      const type = matchErrorToType(error);
      const isCancellation = type === ErrorTypes.USER_CANCELLED || type === ErrorTypes.TRANSLATION_CANCELLED;

      if (!isCancellation) {
        this.logger.debug('Translation error in DomTranslatorAdapter:', error.message || error);
      }

      if (onError) await onError({ status: TRANSLATION_STATUS.ERROR, error });
      throw error;
    } finally {
      activeTranslationRoots.delete(element);
      this._cleanupCurrentSession(true);
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
    
    // Check if the text itself contains mixed direction scripts (both RTL and LTR characters present)
    const hasRtl = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(translation);
    const hasLtr = /[a-zA-Z]/.test(translation);
    const isTextMixed = hasRtl && hasLtr;
    if (isTextMixed) return true;
    
    // Check if the detected direction of the translated segment differs from container computed direction
    const detectedDir = DirectionManager.detectDirectionFromContent(translation);
    let parentDir = 'ltr';
    try {
      parentDir = window.getComputedStyle(node.parentElement).direction || 'ltr';
    } catch (e) {
      // Fallback if window or getComputedStyle is not defined in mock environment
    }
    
    return detectedDir !== parentDir;
  }

  _applyTranslationToNode(textNode, translatedText, targetLanguage, rootElement) {
    if (!textNode || !translatedText) return;
    
    // Safety check: extract string content
    let finalTranslation = '';
    if (typeof translatedText === 'string') {
      finalTranslation = translatedText;
    } else if (typeof translatedText === 'object' && translatedText !== null) {
      finalTranslation = translatedText.text || translatedText.translation || '';
    }
    
    if (!finalTranslation || finalTranslation.trim() === '') return;

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

  async _handleDirectResponse(response, textNodesData, nodeMap, targetLanguage, element) {
    this.logger.debug(`[DomTranslatorAdapter] _handleDirectResponse called (batchCount: ${this.batchCount})`);

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

      results.forEach((item, i) => {
        // Handle abbreviated key 'i' for UID
        const uid = item?.i || item?.uid || item?.id;
        const text = item?.t || item?.text || item;

        if (text === undefined || text === null) {
          this.logger.warn(`[DomTranslatorAdapter] Skipping undefined/null translation at index ${i}`);
          return;
        }

        if (isBlockGroupingEnabled && this.groupMap && this.groupMap.has(uid)) {
          const group = this.groupMap.get(uid);
          if (group.isV2Passthrough) {
            const unit = group.units[0];
            if (!processedUids.has(unit.id)) {
              this._applyTranslationToNode(unit.node, text, finalTargetLanguage, element);
              processedUids.add(unit.id);
              this.translatedSegmentMap.set(unit.id, text);
            }
          } else {
            const anyProcessed = group.units.some(u => processedUids.has(u.id));
            if (!anyProcessed) {
              try {
                 BlockGroupReconstructor.apply(group.units, text, finalTargetLanguage, element, this.currentSessionId);
                 group.units.forEach(u => processedUids.add(u.id));
                 
                 // Capture split segment translations for shadow comparison
                 try {
                   const parsed = BlockGroupReconstructor.splitTranslatedBlock(text, group.units, this.currentSessionId);
                   parsed.forEach(seg => {
                     this.translatedSegmentMap.set(seg.id, seg.text);
                   });
                 } catch {}
              } catch (error) {
                this.logger.error(`[Reconstructor] Apply failed for block group ${group.blockId}:`, error);
                this._rollbackBlockGroup(this.currentSessionId, group.blockId);
                throw error;
              }
            }
          }
        } else {
          let nodeData = uid ? nodeMap.get(uid) : null;
          if (!nodeData) {
            nodeData = textNodesData[i];
          }
          if (nodeData && !processedUids.has(nodeData.uid)) {
            this._applyTranslationToNode(nodeData.node, text, finalTargetLanguage, element);
            processedUids.add(nodeData.uid);
            this.translatedSegmentMap.set(nodeData.uid, text);
          }
        }
      });

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
      this.logger.error('Invalid translation format during direct handling:', err);
      throw new Error('Invalid translation format');
    }
  }

  async _finalizeTranslation({ result, element, elementId, targetLanguage, onComplete, sessionId }) {
    if (!result?.success) {
      if (result.cancelled) return { success: false, cancelled: true, element };
      throw result.error || new Error('Translation failed');
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
    return { success: true, elementId, element };
  }

  _storeTranslationState(data) {
    const { element, originalTextNodesData, sessionId } = data;
    
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

  _cleanupCurrentSession(isSuccess = false) {
    this.isTranslating = false;
    const messageId = this.currentMessageId;
    if (messageId) {
      // Use the correct API from contentScriptIntegration
      if (!isSuccess) {
        contentScriptIntegration.streamingHandler.cancelHandler(messageId);
      }
      this.currentMessageId = null;
    }
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
