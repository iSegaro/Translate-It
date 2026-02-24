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
    this.translatedNodes = new Map(); // Track translated nodes (Map allows iteration)
    this.abortController = null;

    // domtranslator instances
    this.domTranslator = null;
    this.persistentTranslator = null;
    this.intersectionScheduler = null;

    // Batching state
    this.nodeQueue = [];
    this.batchSize = 50;
    this.batchPromises = [];

    // Settings
    this.settings = {
      lazyLoading: true,
      autoTranslateOnDOMChanges: false,
    };

    this.logger.debug('PageTranslationManager created');
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
      this.translatedNodes = new Map();
      this.isTranslated = false;
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

      // Collect all translatable nodes
      const nodes = this._collectTranslatableNodes();
      const totalNodes = nodes.length;

      this.logger.debug(`Found ${totalNodes} translatable nodes`);

      if (totalNodes === 0) {
        throw new Error('No translatable content found on this page');
      }

      // Check for maximum elements limit
      const maxElements = this.settings.maxElements || 1000;
      if (totalNodes > maxElements) {
        throw new Error(
          `Page has too many translatable elements (${totalNodes}). ` +
          `Maximum is ${maxElements}. Try selecting a specific section instead.`
        );
      }

      // Prepare batch texts
      const textsToTranslate = [];
      const nodeData = [];

      for (const node of nodes) {
        const text = node.nodeValue || node.value;
        if (text && text.trim()) {
          textsToTranslate.push({ text: text.trim() });
          nodeData.push({ node, originalText: text });

          // Store original for revert
          if (!this.translatedNodes.has(node)) {
            this.translatedNodes.set(node, text);
          }
        }
      }

      this.logger.debug('Prepared texts for translation', {
        count: textsToTranslate.length,
      });

      // Get translation settings
      const provider = await getTranslationApiAsync();
      const targetLanguage = await getTargetLanguageAsync();

      // Calculate appropriate timeout based on number of segments
      // Average: ~1 second per batch of 20 segments
      const estimatedTimeout = Math.max(60000, Math.ceil(textsToTranslate.length / 20) * 1500);

      this.logger.debug('Using extended timeout for page translation:', {
        segmentsCount: textsToTranslate.length,
        timeout: `${estimatedTimeout}ms`
      });

      // Send batch translation request - use PAGE_TRANSLATE_BATCH for actual translation
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
      }, { timeout: estimatedTimeout });

      if (!result?.success || !result?.translatedText) {
        throw new Error(result?.error || 'Translation failed');
      }

      // Parse translated texts
      const translatedTexts = JSON.parse(result.translatedText);

      this.logger.debug(`Received ${translatedTexts.length} translations`);
      this.logger.debug('Sample translations:', {
        original: nodeData[0]?.originalText,
        translated: translatedTexts[0]?.text || translatedTexts[0],
        total: translatedTexts.length
      });

      // Apply translations to DOM
      let translatedCount = 0;
      nodeData.forEach((data, index) => {
        if (index < translatedTexts.length) {
          const translatedItem = translatedTexts[index];
          const translatedText = translatedItem?.text || translatedItem || data.originalText;

          // Apply translation
          if (data.node.nodeType === Node.TEXT_NODE) {
            data.node.nodeValue = translatedText;
          } else if (data.node.nodeType === Node.ATTRIBUTE_NODE) {
            data.node.value = translatedText;
          }

          translatedCount++;

          // Debug first few translations
          if (index < 3) {
            this.logger.debug(`Applied translation ${index + 1}:`, {
              original: data.originalText?.substring(0, 50),
              translated: translatedText?.substring(0, 50),
              nodeType: data.node.nodeType
            });
          }

          // Emit progress events periodically
          if (translatedCount % 50 === 0 || translatedCount === nodeData.length) {
            pageEventBus.emit('page-translation-progress', {
              translated: translatedCount,
              total: nodeData.length,
              progress: Math.round((translatedCount / nodeData.length) * 100),
            });
          }
        }
      });

      this.isTranslated = true;

      this.logger.info(`Page translation completed: ${translatedCount} nodes translated`);

      // Emit complete event
      pageEventBus.emit('page-translation-complete', {
        translatedCount,
        totalNodes,
        url: this.currentUrl,
      });

      return {
        success: true,
        translatedCount,
        totalNodes,
      };
    } catch (error) {
      this.logger.error('Page translation failed', error);

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
    if (this.translatedNodes.size === 0) {
      this.logger.warn('No translated content to restore');
      return { success: false, reason: 'no_translation' };
    }

    this.logger.info('Restoring original page content');

    try {
      let restoredCount = 0;

      // Restore all translated nodes
      this.translatedNodes.forEach((originalText, node) => {
        if (node.parentNode) {
          if (node.nodeType === Node.TEXT_NODE) {
            node.nodeValue = originalText;
          } else if (node.nodeType === Node.ATTRIBUTE_NODE) {
            node.value = originalText;
          }
          restoredCount++;
        }
      });

      // Clear translated nodes
      this.translatedNodes = new Map();
      this.isTranslated = false;

      // Remove direction attributes
      const translatedElements = document.querySelectorAll('[data-page-translated]');
      translatedElements.forEach(el => {
        el.removeAttribute('dir');
        el.removeAttribute('data-page-translated');
        el.removeAttribute('data-translate-dir');
      });

      this.logger.info(`Page content restored: ${restoredCount} nodes restored`);

      // Emit complete event
      pageEventBus.emit('page-restore-complete', {
        restoredCount,
        url: this.currentUrl,
      });

      return {
        success: true,
        restoredCount,
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

      // Create translator callback that batches requests
      const translatorCallback = this._createTranslatorCallback();

      // Create DOMTranslator
      const config = {
        filter: this.nodeFilter,
      };

      // Add scheduler if lazy loading is enabled
      if (this.intersectionScheduler) {
        config.scheduler = this.intersectionScheduler;
      }

      // Create NodesTranslator wrapper
      const nodesTranslator = {
        translate: async (node, callback) => {
          // This will be called by domtranslator for each node
          // We'll handle this differently for whole page translation
          return callback?.(node);
        },
        restore: (node) => {
          // Restore original text
          const originalText = this.translatedNodes.get(node);
          if (originalText && node.parentNode) {
            node.nodeValue = originalText;
          }
          this.translatedNodes.delete(node);
        },
      };

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
   * Create translator callback (not used in current implementation)
   * We use batch translation instead
   */
  _createTranslatorCallback() {
    // Placeholder for future per-node translation
    return async (text, score) => {
      // This would be called for each node individually
      // But we use batch translation instead
      return text;
    };
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
   * Collect all translatable nodes from page
   */
  _collectTranslatableNodes() {
    const nodes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ATTRIBUTE, {
      acceptNode: (node) => {
        const parent = node.parentElement || node.ownerElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        // Check if parent is excluded
        const tagName = parent.tagName;
        if (this.nodeFilter && !this.nodeFilter(node)) {
          return NodeFilter.FILTER_REJECT;
        }

        // Check visibility
        try {
          const style = window.getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT;
          }
        } catch {
          // Accept if getComputedStyle fails
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node;
    while ((node = walker.nextNode())) {
      nodes.push(node);
    }

    this.logger.debug(`Collected ${nodes.length} translatable nodes`);

    return nodes;
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

    // Restore translated content
    if (this.translatedNodes.size > 0) {
      await this.restorePage();
    }

    // Clear translators
    this.domTranslator = null;
    this.persistentTranslator = null;
    this.intersectionScheduler = null;

    // Clear state
    this.translatedNodes = new Map();
    this.nodeQueue = [];
    this.batchPromises = [];

    // Use ResourceTracker cleanup
    super.cleanup();

    this.logger.debug('PageTranslationManager cleanup completed');
  }
}

// Singleton instance
export const pageTranslationManager = new PageTranslationManager();
