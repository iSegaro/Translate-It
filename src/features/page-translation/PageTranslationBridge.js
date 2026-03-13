import {
  DOMTranslator,
  NodesTranslator,
  PersistentDOMTranslator,
  IntersectionScheduler
} from 'domtranslator';
import { createNodesFilter } from 'domtranslator/utils/nodes';

export class PageTranslationBridge {
  constructor(logger) {
    this.logger = logger;
    this.session = null;
  }

  async initialize(settings, onTranslateCallback, sessionContext = null) {
    this.cleanup();

    const currentSession = {
      intersectionScheduler: null,
      domTranslator: null,
      persistentTranslator: null,
      context: sessionContext
    };

    if (settings.lazyLoading) {
      currentSession.intersectionScheduler = new IntersectionScheduler({ rootMargin: settings.rootMargin });
    }

    // Standard translator callback with context, priority score, and direction application
    const translateWithContext = async (text, score, node) => {
      // In domtranslator callback, the second arg is score, third is node (optional)
      const translated = await onTranslateCallback(text, sessionContext, score);
      
      // Post-process: Apply RTL direction if needed
      if (translated && node && node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentElement;
        if (parent) {
          parent.setAttribute('data-page-translated', 'true');
          
          // Basic heuristic for RTL detection (can be expanded)
          const isRTL = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(translated);
          if (isRTL) {
            parent.setAttribute('dir', 'rtl');
            parent.setAttribute('data-translate-dir', 'rtl');
          }
        }
      }
      
      return translated;
    };

    const nodesTranslator = new NodesTranslator(translateWithContext);
    const filter = createNodesFilter({
      ignoredSelectors: settings.excludedSelectors || ['script', 'style', 'noscript', 'code', 'pre', '[data-translate-ignore]'],
      attributesList: settings.attributesToTranslate || ['title', 'alt', 'placeholder'],
    });

    currentSession.nodesTranslator = nodesTranslator;
    currentSession.filter = filter;

    currentSession.domTranslator = new DOMTranslator(nodesTranslator, {
      scheduler: currentSession.intersectionScheduler,
      filter: filter
    });

    // We always wrap in PersistentDOMTranslator to handle dynamic content consistently
    currentSession.persistentTranslator = new PersistentDOMTranslator(currentSession.domTranslator);

    this.session = currentSession;
  }

  translate(element) {
    if (!this.session || !this.session.persistentTranslator) return;
    this.session.persistentTranslator.translate(element);
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
      const pt = this.session.persistentTranslator;
      const dt = this.session.domTranslator;

      // 1. Check if the node is still actively observed
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
