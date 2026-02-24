// PageTranslationManager - Whole page translation using domtranslator library
// Provides recursive DOM translation with lazy loading and auto-translation on DOM changes

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { TranslationMode } from '@/shared/config/config.js';
import { getTranslationApiAsync, getTargetLanguageAsync, getWholePageLazyLoadingAsync, getWholePageAutoTranslateOnDOMChangesAsync } from '@/config.js';
import { AUTO_DETECT_VALUE } from '@/shared/config/constants.js';
import { pageEventBus } from '@/core/PageEventBus.js';

// Import domtranslator library
import {
  DOMTranslator,
  NodesTranslator,
  PersistentDOMTranslator,
  IntersectionScheduler
} from 'domtranslator';
import { createNodesFilter } from 'domtranslator/utils/nodes';

/**
 * RTL language codes for automatic direction detection
 */
const RTL_LANGUAGES = new Set([
  'ar', 'he', 'fa', 'ur', 'yi', 'ps', 'sd', 'ckb', 'dv', 'ug',
]);

/**
 * Tags that are safe to apply RTL direction without breaking layout
 */
const TEXT_TAGS = new Set([
  'P', 'SPAN', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'A', 
  'TD', 'TH', 'DT', 'DD', 'LABEL', 'CAPTION', 'Q', 'CITE', 
  'SMALL', 'STRONG', 'EM', 'B', 'I', 'U', 'S', 'BUTTON',
  'INPUT', 'TEXTAREA'
]);

/**
 * PageTranslationManager - Manages whole page translation
 * Uses domtranslator library for recursive DOM traversal and translation
 */
export class PageTranslationManager extends ResourceTracker {
  constructor() {
    super('page-translation-manager');

    this.logger = getScopedLogger(LOG_COMPONENTS.PAGE_TRANSLATION, 'PageTranslationManager');

    // State
    this.isActive = false;
    this.isTranslating = false;
    this.isTranslated = false;
    this.currentUrl = null;
    this.translatedNodes = new WeakSet(); // Track translated nodes using WeakSet for better memory management
    this.abortController = null;

    // domtranslator instances
    this.domTranslator = null;
    this.persistentTranslator = null;
    this.intersectionScheduler = null;

    // Batching state
    this.queue = [];
    this.batchTimer = null;
    this.translatedCount = 0;
    this.isFlushing = false;
    this.targetLanguage = 'fa';

    // Settings
    this.settings = {
      lazyLoading: true,
      autoTranslateOnDOMChanges: false,
      chunkSize: 50,
      debounceDelay: 1000, // Increase delay for better batching
    };

    this.logger.debug('PageTranslationManager created');
  }

  /**
   * Enqueue a text for batch translation
   */
  async _enqueueTranslation(text, node) {
    if (!text || !text.trim()) return text;

    return new Promise((resolve, reject) => {
      this.queue.push({ text: text.trim(), node, resolve, reject });

      // If we're already flushing, don't start another timer, 
      // the current flush will pick up new items if they arrive before it starts,
      // or the next flush will handle them.
      if (this.isFlushing) return;

      if (this.queue.length >= this.settings.chunkSize) {
        this._flushBatch();
      } else {
        if (this.batchTimer) clearTimeout(this.batchTimer);
        this.batchTimer = setTimeout(() => this._flushBatch(), this.settings.debounceDelay);
      }
    });
  }

  /**
   * Flush the current translation queue
   */
  async _flushBatch() {
    if (this.queue.length === 0 || this.isFlushing) return;
    if (this.batchTimer) clearTimeout(this.batchTimer);

    this.isFlushing = true;
    
    // Take a chunk of texts
    const currentBatch = this.queue.splice(0, this.settings.chunkSize);

    try {
      this.logger.debug(`Flushing batch of ${currentBatch.length} texts. Remaining in queue: ${this.queue.length}`);

      const provider = await getTranslationApiAsync();
      const targetLanguage = await getTargetLanguageAsync();
      this.targetLanguage = targetLanguage;

      const textsToTranslate = currentBatch.map(item => ({ text: item.text }));

      const result = await sendRegularMessage({
        action: MessageActions.PAGE_TRANSLATE_BATCH,
        data: {
          text: JSON.stringify(textsToTranslate),
          provider,
          sourceLanguage: AUTO_DETECT_VALUE, 
          targetLanguage,
          mode: TranslationMode.Page,
          options: { rawJsonPayload: true },
        },
        context: 'page-translation',
      }, { timeout: 60000 });

      if (!result?.success || !result?.translatedText) {
        throw new Error(result?.error || 'Batch translation failed');
      }

      const translatedTexts = JSON.parse(result.translatedText);

      currentBatch.forEach((item, index) => {
        const translated = translatedTexts[index]?.text || translatedTexts[index] || item.text;
        
        // Handle RTL direction carefully to preserve layout
        if (item.node && RTL_LANGUAGES.has(this.targetLanguage)) {
          const element = item.node.nodeType === Node.TEXT_NODE ? item.node.parentElement : item.node.ownerElement;
          
          if (element && !element.hasAttribute('data-page-translated')) {
            // Apply RTL ONLY to leaf text elements (no other element children)
            // This prevents flipping the order of icons/images and their text
            const isLeaf = element.children.length === 0;
            
            if (isLeaf && TEXT_TAGS.has(element.tagName)) {
              element.setAttribute('dir', 'rtl');
              // Note: We intentionally avoid setting textAlign: right here
              // to keep the element in its original layout position.
            } else if (item.node.nodeType === Node.ATTRIBUTE_NODE && (item.node.name === 'placeholder' || item.node.name === 'title')) {
              element.setAttribute('dir', 'rtl');
            }
            
            element.setAttribute('data-page-translated', 'true');
          }
        }
        
        item.resolve(translated);
        this.translatedCount++;
      });

      this._reportProgress();
    } catch (error) {
      this.logger.error('Batch translation failed', error);
      currentBatch.forEach(item => item.resolve(item.text));
    } finally {
      this.isFlushing = false;
      
      // If there are still items in queue, schedule another flush with a small delay
      // to avoid overwhelming the provider/background
      if (this.queue.length > 0) {
        if (this.batchTimer) clearTimeout(this.batchTimer);
        this.batchTimer = setTimeout(() => this._flushBatch(), 200);
      }
    }
  }

  /**
   * Report translation progress
   */
  _reportProgress() {
    pageEventBus.emit('page-translation-progress', {
      translated: this.translatedCount,
      progress: -1, // Indeterminate since total nodes can change in dynamic pages
    });
  }

  /**
   * Initialize the manager
   */
  async initialize() {
    if (this.isActive) {
      this.logger.debug('PageTranslationManager already initialized');
      return;
    }

    this.logger.debug('Initializing PageTranslationManager');

    try {
      // Load settings
      await this._loadSettings();

      // Create nodes filter using domtranslator utility
      this.nodeFilter = this._createNodesFilter();

      // Initialize domtranslator components
      await this._initializeDomTranslator();

      this.isActive = true;
      this.logger.info('PageTranslationManager initialized successfully');
    } catch (error) {
      this.logger.error('Error initializing PageTranslationManager:', error);
      throw error;
    }
  }

  /**
   * Translate the entire page
   */
  async translatePage(options = {}) {
    if (this.isTranslating) {
      this.logger.warn('Translation already in progress');
      return { success: false, reason: 'already_translating' };
    }

    if (this.currentUrl !== window.location.href) {
      // URL changed, reset translation state
      this.isTranslated = false;
      this.translatedCount = 0;
      this.currentUrl = window.location.href;
    }

    this.isTranslating = true;
    this.abortController = new AbortController();

    this.logger.info('Starting whole page translation');

    try {
      // Emit start event
      pageEventBus.emit('page-translation-start', { url: this.currentUrl });

      // Ensure translator is initialized
      if (!this.domTranslator) {
        await this.initialize();
      }

      // Start translation using domtranslator
      this.domTranslator.translate(document.documentElement);

      // If persistent translator is active, it's already observing
      if (this.persistentTranslator) {
        this.logger.debug('Persistent translation is active');
      }

      this.isTranslated = true;
      this.logger.info('Page translation initiated');

      // Emit complete event (initiated)
      pageEventBus.emit('page-translation-complete', {
        url: this.currentUrl,
      });

      return {
        success: true,
      };
    } catch (error) {
      this.logger.error('Page translation failed to start', error);

      // Emit error event
      pageEventBus.emit('page-translation-error', { error });

      throw error;
    } finally {
      this.isTranslating = false;
      this.abortController = null;
    }
  }

  /**
   * Restore original page content
   */
  async restorePage() {
    this.logger.info('Restoring original page content');

    try {
      if (this.domTranslator) {
        this.domTranslator.restore(document.documentElement);
      }

      // Clear state
      this.isTranslated = false;
      this.translatedCount = 0;

      // Remove direction attributes
      const translatedElements = document.querySelectorAll('[data-page-translated]');
      translatedElements.forEach(el => {
        el.removeAttribute('dir');
        el.removeAttribute('data-page-translated');
        el.removeAttribute('data-translate-dir');
      });

      this.logger.info('Page content restored');

      // Emit complete event
      pageEventBus.emit('page-restore-complete', {
        url: this.currentUrl,
      });

      return {
        success: true,
      };
    } catch (error) {
      this.logger.error('Failed to restore page content', error);

      // Emit error event
      pageEventBus.emit('page-restore-error', { error });

      throw error;
    }
  }

  /**
   * Cancel ongoing translation
   */
  cancelTranslation() {
    if (this.abortController) {
      this.abortController.abort();
      this.isTranslating = false;
      this.logger.info('Translation cancelled');

      pageEventBus.emit('page-translation-cancelled');
    }
  }

  /**
   * Load settings from storage
   */
  async _loadSettings() {
    this.settings.lazyLoading = await getWholePageLazyLoadingAsync();
    this.settings.autoTranslateOnDOMChanges = await getWholePageAutoTranslateOnDOMChangesAsync();

    // Get other settings
    const { CONFIG } = await import('@/shared/config/config.js');
    this.settings.excludedSelectors = CONFIG.WHOLE_PAGE_EXCLUDED_SELECTORS;
    this.settings.attributesToTranslate = CONFIG.WHOLE_PAGE_ATTRIBUTES_TO_TRANSLATE;
    this.settings.maxElements = CONFIG.WHOLE_PAGE_MAX_ELEMENTS;
    this.settings.chunkSize = CONFIG.WHOLE_PAGE_CHUNK_SIZE;
    this.settings.debounceDelay = CONFIG.WHOLE_PAGE_DEBOUNCE_DELAY;

    this.logger.debug('Settings loaded', this.settings);
  }

  /**
   * Initialize domtranslator components
   */
  async _initializeDomTranslator() {
    try {
      // Create scheduler if lazy loading is enabled
      if (this.settings.lazyLoading) {
        this.intersectionScheduler = new IntersectionScheduler();
      }

      // Create NodesTranslator with batching callback
      // NodesTranslator expects (text, score) => Promise<string>
      const nodesTranslator = new NodesTranslator(async (text) => {
        // Find the node being translated. This is a bit tricky with the basic NodesTranslator API.
        // But we can override NodesTranslator.translate below to capture the node.
        return await this._enqueueTranslation(text, this._lastNodeBeingTranslated);
      });

      // Wrap translate to capture the current node
      const originalTranslate = nodesTranslator.translate.bind(nodesTranslator);
      nodesTranslator.translate = (node, callback) => {
        this._lastNodeBeingTranslated = node;
        return originalTranslate(node, callback);
      };
      
      const originalUpdate = nodesTranslator.update.bind(nodesTranslator);
      nodesTranslator.update = (node, callback) => {
        this._lastNodeBeingTranslated = node;
        return originalUpdate(node, callback);
      };

      // Create DOMTranslator
      const config = {
        filter: this.nodeFilter,
      };

      // Add scheduler if lazy loading is enabled
      if (this.intersectionScheduler) {
        config.scheduler = this.intersectionScheduler;
      }

      this.domTranslator = new DOMTranslator(nodesTranslator, config);

      // Wrap in PersistentDOMTranslator if auto-translate is enabled
      if (this.settings.autoTranslateOnDOMChanges) {
        this.persistentTranslator = new PersistentDOMTranslator(this.domTranslator);
      }

      this.logger.debug('DomTranslator components initialized', {
        lazyLoading: this.settings.lazyLoading,
        autoTranslate: this.settings.autoTranslateOnDOMChanges,
      });
    } catch (error) {
      this.logger.error('Error initializing domtranslator components:', error);
      throw error;
    }
  }

  /**
   * Create nodes filter using domtranslator utility
   */
  _createNodesFilter() {
    return createNodesFilter({
      ignoredSelectors: this.settings.excludedSelectors || [
        'script',
        'style',
        'noscript',
        'iframe',
        'code',
        'pre',
        '[data-translate-ignore]'
      ],
      attributesList: this.settings.attributesToTranslate || [
        'title',
        'alt',
        'placeholder',
        'aria-label'
      ],
    });
  }

  /**
   * Check if currently translating
   */
  isCurrentlyTranslating() {
    return this.isTranslating;
  }

  /**
   * Check if page is translated
   */
  isPageTranslated() {
    return this.isTranslated;
  }

  /**
   * Get current translation status
   */
  getStatus() {
    return {
      isActive: this.isActive,
      isTranslating: this.isTranslating,
      isTranslated: this.isTranslated,
      currentUrl: this.currentUrl,
      translatedNodesCount: this.translatedNodes.size || 0,
      settings: this.settings,
    };
  }

  /**
   * Update settings and reinitialize if needed
   */
  async updateSettings(newSettings) {
    this.logger.info('Updating settings', newSettings);

    // Update settings
    Object.assign(this.settings, newSettings);

    // Reinitialize domtranslator components
    await this._initializeDomTranslator();

    // If page is translated, re-translate with new settings
    if (this.isTranslated) {
      this.logger.info('Re-translating with new settings');
      await this.restorePage();
      await this.translatePage();
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    this.logger.debug('Cleaning up PageTranslationManager');

    // Cancel ongoing translation
    this.cancelTranslation();

    // Clear timers
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Restore translated content
    if (this.isTranslated) {
      await this.restorePage();
    }

    // Clear translators
    this.domTranslator = null;
    this.persistentTranslator = null;
    this.intersectionScheduler = null;

    // Clear state
    this.translatedNodes = new Map();
    this.queue = [];
    this.translatedCount = 0;

    // Use ResourceTracker cleanup
    super.cleanup();

    this.logger.debug('PageTranslationManager cleanup completed');
  }
}

// Singleton instance
export const pageTranslationManager = new PageTranslationManager();
