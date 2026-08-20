import {
  DOMTranslator,
  NodesTranslator,
  PersistentDOMTranslator,
  IntersectionScheduler
} from 'domtranslator';
import { createNodesFilter } from 'domtranslator/utils/nodes';
import { applyNodeDirection, isRTL, restoreElementDirection, BIDI_MARKS } from '@/utils/dom/DomDirectionManager.js';
import { hoverPreviewLookup } from '@/features/shared/hover-preview/HoverPreviewLookup.js';
import { 
  PAGE_TRANSLATION_ATTRIBUTES, 
  PAGE_TRANSLATION_SELECTORS
} from './PageTranslationConstants.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';

export class PageTranslationBridge extends ResourceTracker {
  constructor() {
    super('page-translation-bridge');
    this.logger = getScopedLogger(LOG_COMPONENTS.PAGE_TRANSLATION, 'Bridge');
    this.session = null;
    this.showOriginalOnHover = true; // Initial default
  }

  async initialize(settings, onTranslateCallback, sessionContext = null) {
    this.cleanup();
    
    // Explicitly set from settings (defaulted to true if undefined)
    this.showOriginalOnHover = settings.showOriginalOnHover ?? true;
    const isTargetRTL = isRTL(settings.targetLanguage);

    // Reset lookup for a new session
    hoverPreviewLookup.clear();

    const currentSession = {
      intersectionScheduler: null,
      domTranslator: null,
      persistentTranslator: null,
      context: sessionContext,
      root: null,
      active: true,
    };
    const targetGenerations = new WeakMap();
    const applyDecisions = new WeakMap();

    const nextTargetGeneration = (node) => {
      const generation = (targetGenerations.get(node) || 0) + 1;
      targetGenerations.set(node, generation);
      return generation;
    };

    const getCurrentNodeValue = (node) => {
      if (!node) return '';
      if (node.nodeType === Node.ATTRIBUTE_NODE) return node.value ?? node.nodeValue ?? '';
      return node.nodeValue ?? '';
    };

    const isFreshTarget = (node, sourceValue, generation) => {
      if (!currentSession.active || this.session !== currentSession || !node) return false;

      const owner = node.nodeType === Node.ATTRIBUTE_NODE ? node.ownerElement : node;
      const root = currentSession.root;
      if (!owner?.isConnected || (root && (!root.isConnected || !root.contains(owner)))) return false;

      if (node.nodeType === Node.ATTRIBUTE_NODE) {
        const currentAttribute = owner.getAttributeNode(node.name);
        if (currentAttribute !== node || node.nodeValue !== sourceValue) return false;
      } else if (!node.isConnected || node.nodeValue !== sourceValue) {
        return false;
      }

      return generation === undefined || targetGenerations.get(node) === generation;
    };

    const recordApplyDecision = (node, generation, outcome, settlement = null, ownsStorage = false) => {
      if (!node) return;
      let decisions = applyDecisions.get(node);
      if (!decisions) {
        decisions = new Map();
        applyDecisions.set(node, decisions);
      }
      decisions.set(generation, {
        generation,
        outcome,
        settlement,
        ownsStorage,
        session: currentSession,
      });
    };

    const getApplyDecision = (node, generation = targetGenerations.get(node)) => (
      applyDecisions.get(node)?.get(generation)
    );

    const forgetApplyDecision = (node, generation) => {
      const decisions = applyDecisions.get(node);
      if (!decisions) return;
      decisions.delete(generation);
      if (decisions.size === 0) applyDecisions.delete(node);
    };

    const isActiveTarget = (node) => {
      if (!currentSession.active || this.session !== currentSession || !node) return false;
      const owner = node.nodeType === Node.ATTRIBUTE_NODE ? node.ownerElement : node;
      const root = currentSession.root;
      return Boolean(owner?.isConnected && (!root || (root.isConnected && root.contains(owner))));
    };

    if (settings.lazyLoading) {
      currentSession.intersectionScheduler = new IntersectionScheduler({ rootMargin: settings.rootMargin });
    }

    /**
     * Standard translator callback for domtranslator.
     * Note: In domtranslator 1.x, the constructor callback ONLY receives (text, score).
     * We synchronously capture the current node before any async work to prevent de-sync.
     */
    const translateWithContext = async (text, score) => {
      // CRITICAL: Capture the node IMMEDIATELY as the first line.
      // Since domtranslator's walk is synchronous, this is the only safe way 
      // to link the text to the node before the event loop yields.
      const node = nodesTranslator.currentNode;
      const sourceValue = getCurrentNodeValue(node);
      const generation = nodesTranslator.currentTaskGeneration;
      const ownsStorage = nodesTranslator.currentTaskOwnsStorage === true;

      if (!text || !text.trim()) {
        recordApplyDecision(node, generation, 'accepted-pending', null, ownsStorage);
        return text;
      }

      // 1. Capture original whitespace to preserve formatting
      const leadingMatch = text.match(/^(\s*)/);
      const trailingMatch = text.match(/(\s*)$/);
      const leadingWhitespace = leadingMatch ? leadingMatch[1] : '';
      const trailingWhitespace = trailingMatch ? trailingMatch[1] : '';
      const trimmedText = text.trim();

      // 2. Request translation for trimmed text
      // We pass the node as the 4th argument
      const settlement = await onTranslateCallback(trimmedText, sessionContext, score, node);
      const hasSettlement = settlement && settlement.__pageTranslationSettlement === true;
      const translated = hasSettlement ? settlement.text : settlement;

      // Validate before NodesTranslator receives provider output. Its own updateId
      // protects DOM writes, but cannot correct page-level settlement accounting.
      if (node && (!currentSession.active || this.session !== currentSession)) {
        settlement?.settle?.('cancelled');
        recordApplyDecision(node, generation, 'cancelled', settlement, ownsStorage);
        return getCurrentNodeValue(node);
      }

      if (node && hasSettlement && settlement.state !== 'pending') {
        recordApplyDecision(node, generation, settlement.state, settlement, ownsStorage);
        return getCurrentNodeValue(node);
      }

      if (node && !isFreshTarget(node, sourceValue, generation)) {
        settlement?.settle?.('stale');
        recordApplyDecision(node, generation, 'stale', settlement, ownsStorage);
        return getCurrentNodeValue(node);
      }

      recordApplyDecision(node, generation, 'accepted-pending', settlement, ownsStorage);
      
      // OPTIMIZATION: Preserve ZWNJ, Tatweel, Dashes and BiDi marks if the provider 
      // returned a "cleaned" version of the same text.
      // We ignore: ZWSP(\u200b), ZWNJ(\u200c), ZWJ(\u200d), LRM(\u200e), RLM(\u200f), BOM(\ufeff), Tatweel(\u0640), EnDash(\u2013), EmDash(\u2014)
      const normalizeForComparison = (s) => s ? s.replace(/[\u200b-\u200f\uFEFF\u0640\u2013\u2014]/g, '').replace(/\s+/g, ' ').trim() : '';
      const isFunctionallyIdentical = translated && 
        normalizeForComparison(translated) === normalizeForComparison(trimmedText);

      // FIX: Only apply marks if the text was actually translated (different from original)
      // and not just a ZWNJ-stripped version of the original.
      if (translated && translated !== trimmedText && !isFunctionallyIdentical) {
        // 3. Inject BiDi Isolation Mark (RLM/LRM) directly into the string.
        const mark = isTargetRTL ? BIDI_MARKS.RLM : BIDI_MARKS.LRM;
        
        return leadingWhitespace + mark + translated.trim() + trailingWhitespace;
      }
      
      // Use trimmedText if functionally identical to preserve ZWNJ
      return leadingWhitespace + (isFunctionallyIdentical ? trimmedText : (translated ? translated.trim() : trimmedText)) + trailingWhitespace;
    };

    class GuardedNodesTranslator extends NodesTranslator {
      translateNodeContent(node, callback) {
        const nodeData = this.nodeStorage.get(node);
        if (!nodeData) throw new Error('Node is not register');
        if (node.nodeValue === null) return;

        const nodeId = nodeData.id;
        const nodeContext = nodeData.updateId;
        const taskGeneration = this.currentTaskGeneration;
        return this.translateCallback(node.nodeValue, nodeData.importanceScore).then((text) => {
          const actualNodeData = this.nodeStorage.get(node);
          const decision = getApplyDecision(node, taskGeneration);
          const isCurrentStorage = actualNodeData
            && nodeId === actualNodeData.id
            && nodeContext === actualNodeData.updateId;

          if (!isCurrentStorage) {
            if (decision?.settlement?.state === 'pending') {
              const outcome = decision.session === currentSession && currentSession.active
                ? 'stale'
                : 'cancelled';
              decision.settlement.settle(outcome);
            }
            if (decision) decision.outcome = decision.session === currentSession && currentSession.active
              ? 'stale'
              : 'cancelled';
            forgetApplyDecision(node, taskGeneration);
            return;
          }

          const canPreserveProviderFailure = decision?.outcome === 'failed'
            && decision.session === currentSession
            && isActiveTarget(node)
            && decision.generation === targetGenerations.get(node)
            && decision.settlement?.state === 'failed';

          if (canPreserveProviderFailure) {
            actualNodeData.originalText = node.nodeValue !== null ? node.nodeValue : '';
            node.nodeValue = text;
            decision.outcome = 'failed-applied';
            try {
              if (callback) callback(node);
            } finally {
              forgetApplyDecision(node, taskGeneration);
            }
            return;
          }

          const canApply = decision
            && decision.session === currentSession
            && currentSession.active
            && decision.generation === targetGenerations.get(node)
            && decision.outcome === 'accepted-pending'
            && (!decision.settlement || decision.settlement.state === 'pending');

          if (!canApply) {
            if (decision?.settlement?.state === 'pending') {
              decision.settlement.settle(
                decision.session === currentSession && currentSession.active ? 'stale' : 'cancelled'
              );
            }
            if (decision?.ownsStorage
                && decision.generation === targetGenerations.get(node)
                && this.nodeStorage.get(node) === nodeData) {
              this.nodeStorage.delete(node);
            }
            if (decision) decision.outcome = decision.session === currentSession && currentSession.active
              ? 'stale'
              : 'cancelled';
            forgetApplyDecision(node, taskGeneration);
            return;
          }

          try {
            actualNodeData.originalText = node.nodeValue !== null ? node.nodeValue : '';
            node.nodeValue = text;
          } catch (error) {
            if (decision.settlement?.state === 'pending') {
              decision.settlement.settle(
                decision.session === currentSession && currentSession.active ? 'stale' : 'cancelled'
              );
            }
            decision.outcome = decision.session === currentSession && currentSession.active
              ? 'stale'
              : 'cancelled';
            forgetApplyDecision(node, taskGeneration);
            throw error;
          }
          decision.outcome = 'applied';
          decision.settlement?.settle?.('accepted');
          try {
            if (callback) callback(node);
          } finally {
            forgetApplyDecision(node, taskGeneration);
          }
        });
      }
    }

    const nodesTranslator = new GuardedNodesTranslator(translateWithContext);

    /**
     * MONKEY-PATCH: Capture the node being processed by NodesTranslator.
     * This allows us to pass the node to the scheduler for visibility checks.
     * We set it directly on the instance as the walk is synchronous.
     */
    const originalTranslate = nodesTranslator.translate;
    nodesTranslator.translate = function(node, callback) {
      this.currentNode = node;
      this.currentTaskGeneration = nextTargetGeneration(node);
      this.currentTaskOwnsStorage = typeof this.has === 'function' ? !this.has(node) : true;
      return originalTranslate.call(this, node, callback);
    };

    const originalUpdate = nodesTranslator.update;
    nodesTranslator.update = function(node, callback) {
      this.currentNode = node;
      this.currentTaskGeneration = nextTargetGeneration(node);
      this.currentTaskOwnsStorage = false;
      return originalUpdate.call(this, node, callback);
    };

    /**
     * FIX: Since domtranslator doesn't pass the node to the constructor's callback,
     * we wrap its core methods (translate and update) to intercept the processed node.
     * This allows us to apply container-level direction (CSS) after text is swapped.
     */
    const wrapWithDirection = (originalFn) => {
      const bridge = this;
      return function(node, callback) {
        const originalValue = node?.nodeType === Node.ATTRIBUTE_NODE
          ? node.value
          : node?.textContent;

        // Wrap the processed node callback
        const wrappedCallback = (processedNode) => {
          const decision = getApplyDecision(node);
          const shouldPostProcess = !decision
            || (
              decision.session === currentSession
              && currentSession.active
              && decision.generation === targetGenerations.get(node)
              && decision.outcome === 'applied'
            );

          if (!shouldPostProcess) {
            // PersistentDOMTranslator uses callback to mark its own write as handled.
            // Keep that internal bookkeeping, but suppress semantic page effects.
            if (callback) callback(processedNode);
            return;
          }

          if (processedNode) {
            const { TRANSLATED_MARKER, HAS_ORIGINAL } = PAGE_TRANSLATION_ATTRIBUTES;

            if (bridge.showOriginalOnHover && node) {
              hoverPreviewLookup.add(node, originalValue);
            }
            
            // Determine if it was actually translated by checking for the BiDi mark
            const textContent = processedNode.nodeType === Node.TEXT_NODE ? processedNode.textContent : processedNode.value;
            const hasMark = textContent && (textContent.includes(BIDI_MARKS.RLM) || textContent.includes(BIDI_MARKS.LRM));

            if (processedNode.nodeType === Node.TEXT_NODE) {
              try {
                if (hasMark) {
                  // 1. Apply directional logic (Unicode marks + container alignment) only for RTL targets
                  if (isTargetRTL) {
                    applyNodeDirection(processedNode, settings.targetLanguage);
                  }
                  
                  // 2. Mark the parent for tooltip display regardless of target direction
                  const parent = processedNode.parentElement;
                  if (parent) {
                    parent.setAttribute(TRANSLATED_MARKER, 'true');
                    if (bridge.showOriginalOnHover) {
                      parent.setAttribute(HAS_ORIGINAL, 'true');
                    }
                  }
                }
              } catch (e) {
                bridge.logger.warn('Failed to apply direction/marking to node', e);
              }
            } else if (processedNode.nodeType === Node.ATTRIBUTE_NODE) {
              // For attributes, we mark the owner element only if translated
              if (hasMark && bridge.showOriginalOnHover && processedNode.ownerElement) {
                processedNode.ownerElement.setAttribute(HAS_ORIGINAL, 'true');
                processedNode.ownerElement.setAttribute(TRANSLATED_MARKER, 'true');
              }
            }
          }
          
          // Call original callback if provided (e.g., from PersistentDOMTranslator)
          if (callback) callback(processedNode);
        };
        
        try {
          return originalFn.call(this, node, wrappedCallback);
        } catch (e) {
          if (e.message && e.message.includes('already been translated')) {
            bridge.logger.debug('Node already translated, skipping.', node);
            return; // Silently ignore this specific error
          }
          throw e;
        }
      };
    };

    // Intercept both initial translations and dynamic updates
    nodesTranslator.translate = wrapWithDirection(nodesTranslator.translate);
    nodesTranslator.update = wrapWithDirection(nodesTranslator.update);

    const filter = createNodesFilter({
      ignoredSelectors: [
        ...(settings.excludedSelectors || []), 
        `#${PAGE_TRANSLATION_SELECTORS.UI_HOST_MAIN}`,
        `#${PAGE_TRANSLATION_SELECTORS.UI_HOST_IFRAME}`,
        `#${PAGE_TRANSLATION_SELECTORS.TOOLTIP_ID}`,
        `.${PAGE_TRANSLATION_SELECTORS.INTERNAL_IGNORE_CLASS}`
      ],
      attributesList: settings.attributesToTranslate || ['title', 'alt', 'placeholder'],
    });

    currentSession.nodesTranslator = nodesTranslator;
    currentSession.filter = filter;
    currentSession.autoTranslateOnDOMChanges = settings.autoTranslateOnDOMChanges ?? true;

    currentSession.domTranslator = new DOMTranslator(nodesTranslator, {
      scheduler: currentSession.intersectionScheduler,
      filter: filter
    });

    // We always wrap in PersistentDOMTranslator to handle dynamic content consistently
    currentSession.persistentTranslator = new PersistentDOMTranslator(currentSession.domTranslator);

    this.session = currentSession;
  }

  translate(element) {
    if (!this.session) return;
    this.session.root = element;
    this.session.active = true;
    
    // Respect auto-translate setting: 
    // Use persistentTranslator (MutationObserver) only if enabled.
    // Otherwise, use basic domTranslator for a single-pass translation.
    if (this.session.autoTranslateOnDOMChanges && this.session.persistentTranslator) {
      this.logger.debug('Starting persistent translation (Auto-translate enabled)');
      this.session.persistentTranslator.translate(element);
    } else if (this.session.domTranslator) {
      this.logger.debug('Starting single-pass translation (Auto-translate disabled)');
      this.session.domTranslator.translate(element);
    }
  }

  stopPersistence() {
    if (this.session && this.session.persistentTranslator) {
      try {
        const pt = this.session.persistentTranslator;
        // Search for the observer in observedNodesStorage (it's a Map of node -> XMutationObserver)
        if (pt.observedNodesStorage) {
          for (const observer of pt.observedNodesStorage.values()) {
            observer.disconnect();
          }
          // Do NOT clear storage, so PersistentDOMTranslator.restore can still find the node if called later
        }
      } catch (e) {
        this.logger.warn('Failed to stop persistence:', e.message);
      }
    }
  }

  restore(element) {
    if (!this.session) return;

    try {
      // 1. Surgical Restore: Revert all direction and alignment changes
      restoreElementDirection(element);

      const pt = this.session.persistentTranslator;
      const dt = this.session.domTranslator;

      // 2. Check if the node is still actively observed
      const isObserved = pt && pt.observedNodesStorage && pt.observedNodesStorage.has(element);

      if (isObserved) {
        pt.restore(element);
      } else if (dt) {
        // Fallback to direct DOM restore if persistence was stopped or node is not in observer storage
        dt.restore(element);
      }
    } catch (e) {
      this.logger.warn('[Bridge] Restore failed:', e.message);
      // Last resort fallback directly on domTranslator
      if (this.session.domTranslator) {
        try { this.session.domTranslator.restore(element); } catch {
          // Silent fallback
        }
      }
    } finally {
      this.cleanup();
    }
  }

  cleanup() {
    if (!this.session) return;

    this.session.active = false;

    try {
      // 1. Manually disconnect all internal observers just in case
      const pt = this.session.persistentTranslator;
      if (pt && pt.observedNodesStorage) {
        for (const observer of pt.observedNodesStorage.values()) {
          observer.disconnect();
        }
        pt.observedNodesStorage.clear();
      }

      const is = this.session.intersectionScheduler;
      if (is && is.intersectionObserver && is.intersectionObserver.intersectionObserver) {
        is.intersectionObserver.intersectionObserver.disconnect();
      }
    } catch (e) {
      this.logger.error('Bridge Cleanup failed', e);
    } finally {
      this.session = null;
    }
  }
}
