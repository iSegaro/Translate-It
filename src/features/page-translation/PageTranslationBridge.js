import {
  DOMTranslator,
  NodesTranslator,
  PersistentDOMTranslator,
  IntersectionScheduler
} from 'domtranslator';
import { createNodesFilter } from 'domtranslator/utils/nodes';
import { applyNodeDirection, isRTL, restoreElementDirection, BIDI_MARKS } from '@/utils/dom/DomDirectionManager.js';
import { pageTranslationLookup } from './utils/PageTranslationLookup.js';
import { 
  PAGE_TRANSLATION_ATTRIBUTES, 
  PAGE_TRANSLATION_SELECTORS
} from './PageTranslationConstants.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';

export class PageTranslationBridge extends ResourceTracker {
  constructor(logger) {
    super('page-translation-bridge');
    this.logger = logger;
    this.session = null;
    this.showOriginalOnHover = true; // Initial default
  }

  async initialize(settings, onTranslateCallback, sessionContext = null) {
    this.cleanup();
    
    // Explicitly set from settings (defaulted to true if undefined)
    this.showOriginalOnHover = settings.showOriginalOnHover ?? true;
    const isTargetRTL = isRTL(settings.targetLanguage);

    // Reset lookup for a new session
    pageTranslationLookup.clear();

    const currentSession = {
      intersectionScheduler: null,
      domTranslator: null,
      persistentTranslator: null,
      context: sessionContext
    };

    if (settings.lazyLoading) {
      currentSession.intersectionScheduler = new IntersectionScheduler({ rootMargin: settings.rootMargin });
    }

    /**
     * Standard translator callback for domtranslator.
     * Note: In domtranslator 1.x, the constructor callback ONLY receives (text, score).
     * The 'node' argument is NOT passed here. We handle direction in the wrapped methods below.
     */
    const translateWithContext = async (text, score) => {
      if (!text || !text.trim()) return text;

      // 1. Capture original whitespace to preserve formatting
      const leadingMatch = text.match(/^(\s*)/);
      const trailingMatch = text.match(/(\s*)$/);
      const leadingWhitespace = leadingMatch ? leadingMatch[1] : '';
      const trailingWhitespace = trailingMatch ? trailingMatch[1] : '';
      const trimmedText = text.trim();

      // 2. Request translation for trimmed text
      const translated = await onTranslateCallback(trimmedText, sessionContext, score);
      
      // FIX: Only apply marks if the text was actually translated (different from original)
      if (translated && translated !== trimmedText) {
        // 3. Inject BiDi Isolation Mark (RLM/LRM) directly into the string.
        // This provides immediate string-level direction correction even before CSS is applied.
        const mark = isTargetRTL ? BIDI_MARKS.RLM : BIDI_MARKS.LRM;
        
        return leadingWhitespace + mark + translated + trailingWhitespace;
      }
      
      return leadingWhitespace + (translated || trimmedText) + trailingWhitespace;
    };

    const nodesTranslator = new NodesTranslator(translateWithContext);

    /**
     * FIX: Since domtranslator doesn't pass the node to the constructor's callback,
     * we wrap its core methods (translate and update) to intercept the processed node.
     * This allows us to apply container-level direction (CSS) after text is swapped.
     */
    const wrapWithDirection = (originalFn) => {
      const bridge = this;
      return function(node, callback) {
        // 1. CAPTURE: Store original text before domtranslator replaces it.
        // This is used for the "Show original on hover" feature.
        if (bridge.showOriginalOnHover && node) {
          if (node.nodeType === Node.TEXT_NODE) {
            pageTranslationLookup.add(node, node.textContent);
          } else if (node.nodeType === Node.ATTRIBUTE_NODE) {
            pageTranslationLookup.add(node, node.value);
          }
        }

        // Wrap the processed node callback
        const wrappedCallback = (processedNode) => {
          if (processedNode) {
            const { TRANSLATED_MARKER, HAS_ORIGINAL } = PAGE_TRANSLATION_ATTRIBUTES;
            
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
            bridge.logger.warn('Node already translated, skipping.', node);
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
