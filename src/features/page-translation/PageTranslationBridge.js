// PageTranslationBridge - Bridge between Manager and domtranslator library
import {
  DOMTranslator,
  NodesTranslator,
  PersistentDOMTranslator,
  IntersectionScheduler
} from 'domtranslator';
import { createNodesFilter } from 'domtranslator/utils/nodes';
import { PageTranslationHelper } from './PageTranslationHelper.js';

export class PageTranslationBridge {
  constructor(logger) {
    this.logger = logger;
    this.domTranslator = null;
    this.persistentTranslator = null;
    this.intersectionScheduler = null;
    this.nodeFilter = null;
  }

  async initialize(settings, onTranslateCallback, onTrackNodeCallback) {
    try {
      if (settings.lazyLoading) {
        this.intersectionScheduler = new IntersectionScheduler({ rootMargin: settings.rootMargin });
      }

      const nodesTranslator = new NodesTranslator(onTranslateCallback);

      // Override translate and update to capture nodes for tracking
      const originalTranslate = nodesTranslator.translate.bind(nodesTranslator);
      nodesTranslator.translate = (node, callback) => {
        try {
          const textContent = node.nodeValue || node.value || (node.nodeType === Node.ATTRIBUTE_NODE ? node.nodeValue : '');
          onTrackNodeCallback(textContent, node);
          
          return originalTranslate(node, (text) => {
            if (typeof callback === 'function') callback(text, node);
          });
        } catch (err) {
          if (err.message && err.message.includes('already been translated')) return;
          throw err;
        }
      };

      const originalUpdate = nodesTranslator.update.bind(nodesTranslator);
      nodesTranslator.update = (node, callback) => {
        try {
          const textContent = node.nodeValue || node.value || (node.nodeType === Node.ATTRIBUTE_NODE ? node.nodeValue : '');
          onTrackNodeCallback(textContent, node);
          
          return originalUpdate(node, (text) => {
            if (typeof callback === 'function') callback(text, node);
          });
        } catch (err) {
          if (err.message && err.message.includes('already been translated')) return;
          throw err;
        }
      };

      this.nodeFilter = createNodesFilter({
        ignoredSelectors: settings.excludedSelectors || ['script', 'style', 'noscript', 'code', 'pre', '[data-translate-ignore]'],
        attributesList: settings.attributesToTranslate || ['title', 'alt', 'placeholder', 'value', 'aria-label', 'aria-placeholder', 'aria-roledescription', 'data-label', 'data-title', 'data-placeholder'],
      });

      const config = { filter: this.nodeFilter };
      if (this.intersectionScheduler) config.scheduler = this.intersectionScheduler;
      
      this.domTranslator = new DOMTranslator(nodesTranslator, config);
      
      if (settings.autoTranslateOnDOMChanges) {
        this.persistentTranslator = new PersistentDOMTranslator(this.domTranslator);
      }
    } catch (error) {
      this.logger.error('Error initializing domtranslator components:', error);
      throw error;
    }
  }

  translate(element) {
    if (this.persistentTranslator) {
      this.persistentTranslator.translate(element);
    } else if (this.domTranslator) {
      this.domTranslator.translate(element);
    }
  }

  restore(element) {
    try {
      if (this.persistentTranslator) {
        this.persistentTranslator.restore(element);
      }
      if (this.domTranslator) {
        this.domTranslator.restore(element);
      }
    } catch (_) { /* ignore */ }
  }

  cleanup() {
    this.domTranslator = null;
    this.persistentTranslator = null;
    this.intersectionScheduler = null;
  }
}
