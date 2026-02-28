// PageTranslationManager - Whole page translation using domtranslator library
// Provides recursive DOM translation with lazy loading and auto-translation on DOM changes

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { TranslationMode } from '@/shared/config/config.js';
import { getTranslationApiAsync, getTargetLanguageAsync, getWholePageLazyLoadingAsync, getWholePageAutoTranslateOnDOMChangesAsync, getWholePageRootMarginAsync } from '@/config.js';
import { AUTO_DETECT_VALUE } from '@/shared/config/constants.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import NotificationManager from '@/core/managers/core/NotificationManager.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { getErrorMessage } from '@/shared/error-management/ErrorMessages.js';
import { matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';
import { NOTIFICATION_TIME } from '@/shared/config/constants.js';

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
    
    // Initialize base notifier synchronously for maximum reliability
    this.baseNotifier = new NotificationManager();
    this.notificationManager = null;

    // State
    this.isActive = false;
    this.isTranslating = false;
    this.isTranslated = false;
    this.currentUrl = null;
    this.translatedNodes = new WeakSet(); 
    this.abortController = null;
    
    // Node tracking to solve race conditions during async translation
    this._nodeTrackingQueue = new Map(); // text -> Array of Nodes

    // domtranslator instances
    this.domTranslator = null;
    this.persistentTranslator = null;
    this.intersectionScheduler = null;

    // Batching state
    this.queue = [];
    this.batchTimer = null;
    this.translatedCount = 0;
    this.activeFlushes = 0;
    this.lastFlushTime = 0;
    this.targetLanguage = 'fa';
    this.isFirstBatch = true; // Track first batch for longer debounce

    // Settings
    this.settings = {
      lazyLoading: true,
      rootMargin: '300px', // Default
      autoTranslateOnDOMChanges: false,
      chunkSize: 250, 
      maxCharsPerBatch: 5000, 
      debounceDelay: 500,
      maxConcurrentFlushes: 1, 
    };

    this.logger.debug('PageTranslationManager created');
  }

  /**
   * Normalize text for consistent tracking and comparison
   */
  _normalizeText(text) {
    if (!text) return '';
    return text.trim().replace(/\s+/g, ' ');
  }

  /**
   * Check if a node is within the current viewport (with default margin)
   */
  _isInViewport(node) {
    // Parse numeric value from rootMargin (e.g., '300px' -> 300)
    const marginValue = parseInt(this.settings.rootMargin, 10) || 300;
    return this._isInViewportWithMargin(node, marginValue);
  }

  /**
   * Check if a node is within the current viewport with custom margin
   * @param {Node} node - The node to check
   * @param {number} margin - Margin in pixels
   * @returns {boolean} True if node is in viewport with margin
   */
  _isInViewportWithMargin(node, margin = 300) {
    if (!node) return false;

    try {
      const element = node.nodeType === Node.TEXT_NODE ? node.parentElement :
                     (node.nodeType === Node.ATTRIBUTE_NODE ? node.ownerElement : node);

      if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;

      if (element.offsetParent === null && element.tagName !== 'BODY' && !(element instanceof SVGElement)) {
        return false;
      }

      const rect = element.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

      return (
        rect.bottom >= -margin &&
        rect.top <= viewportHeight + margin
      );
    } catch (e) {
      return false;
    }
  }

  /**
   * Enqueue a text for batch translation
   */
  async _enqueueTranslation(text, score = 0) {
    if (!text || !text.trim() || !this.isTranslating) return text;

    // Normalize text before looking up tracked nodes
    const normalizedText = this._normalizeText(text);

    // Retrieve the specific node associated with this text (FIFO)
    const nodeQueue = this._nodeTrackingQueue.get(normalizedText);
    const node = (nodeQueue && nodeQueue.length > 0) ? nodeQueue.shift() : null;

    if (!node) {
      // Fallback
      this.logger.warn('Could not find tracked node for text:', normalizedText.substring(0, 30));
      return text;
    }

    // Rely on domtranslator's scheduler for visibility/lazy loading
    // The library's IntersectionScheduler already ensures this is only called 
    // when the node is visible (or near viewport based on rootMargin)
    return this._doEnqueue(text, node);
  }

  /**
   * Actual enqueueing logic
   */
  _doEnqueue(text, node) {
    return new Promise((resolve, reject) => {
      this.queue.push({ text: text.trim(), node, resolve, reject });

      // If queue is getting large, flush it (allow more accumulation for debounce to catch up)
      if (this.queue.length >= this.settings.chunkSize * 5) {
        this._flushBatch();
      } else {
        if (this.batchTimer) clearTimeout(this.batchTimer);
        // Use longer debounce for first batch to allow complete DOM traversal
        // Extended to 2000ms to catch lazy-loaded content on modern pages
        const debounceDelay = this.isFirstBatch ? 2000 : this.settings.debounceDelay;
        if (this.isFirstBatch && this.queue.length <= 15) {
          const marginStr = this.settings.rootMargin || '300px';
          this.logger.debug(`[First Batch] Collecting viewport nodes with ${debounceDelay}ms debounce, rootMargin=${marginStr} (${this.queue.length} queued so far...)`);
        }
        this.batchTimer = setTimeout(() => this._flushBatch(), debounceDelay);
      }
    });
  }

  /**
   * Flush the current translation queue
   */
  async _flushBatch() {
    if (!this.isTranslating) {
      this.queue = [];
      if (this.batchTimer) clearTimeout(this.batchTimer);
      return;
    }

    if (this.queue.length === 0) return;
    
    // Check concurrency limit
    if (this.activeFlushes >= (this.settings.maxConcurrentFlushes || 1)) {
      return;
    }

    const now = Date.now();
    const timeSinceLastFlush = now - this.lastFlushTime;
    const minDelay = 1500; // Minimum delay between batches

    if (timeSinceLastFlush < minDelay) {
      if (this.batchTimer) clearTimeout(this.batchTimer);
      this.batchTimer = setTimeout(() => this._flushBatch(), minDelay - timeSinceLastFlush);
      return;
    }

    if (this.batchTimer) clearTimeout(this.batchTimer);

    this.activeFlushes++;
    
    let currentBatch = [];

    try {
      const providerRegistryId = await getTranslationApiAsync();
      const targetLanguage = await getTargetLanguageAsync();
      this.targetLanguage = targetLanguage;

      // PROVIDER-AWARE LIMITS:
      const { registryIdToName, isProviderType, ProviderTypes } = await import('@/features/translation/providers/ProviderConstants.js');
      const { CONFIG: globalConfig } = await import('@/shared/config/config.js');
      const providerName = registryIdToName(providerRegistryId);
      const isAI = isProviderType(providerName, ProviderTypes.AI);

      const effectiveChunkSize = this.settings.chunkSize;
      const effectiveMaxChars = isAI ? globalConfig.WHOLE_PAGE_AI_MAX_CHARS : globalConfig.WHOLE_PAGE_MAX_CHARS;

      // Character-aware batching logic
      let itemsToProcess = 0;
      let currentChars = 0;

      for (const item of this.queue) {
        const itemLen = item.text.length;
        if (itemsToProcess >= effectiveChunkSize || 
            (currentChars + itemLen > effectiveMaxChars && itemsToProcess > 0)) {
          break;
        }
        currentChars += itemLen;
        itemsToProcess++;
      }

      if (itemsToProcess === 0) {
        this.activeFlushes--;
        return;
      }

      this.lastFlushTime = Date.now();
      currentBatch = this.queue.splice(0, itemsToProcess);

      // Reset first batch flag after first flush
      this.isFirstBatch = false;

      this.logger.debug(`Flushing batch (${providerRegistryId}): ${currentBatch.length} texts, ${currentChars} chars. Queue: ${this.queue.length}`);

      const textsToTranslate = currentBatch.map(item => ({ text: item.text }));

      const result = await sendRegularMessage({
        action: MessageActions.PAGE_TRANSLATE_BATCH,
        data: {
          text: JSON.stringify(textsToTranslate),
          provider: providerRegistryId,
          sourceLanguage: AUTO_DETECT_VALUE, 
          targetLanguage,
          mode: TranslationMode.Page,
          options: { rawJsonPayload: true },
        },
        context: 'page-translation',
      }, { timeout: 60000 });

      if (!result?.success) {
        throw new Error(result?.error || 'Batch translation failed');
      }

      const translatedTexts = JSON.parse(result.translatedText);

      currentBatch.forEach((item, index) => {
        const translated = translatedTexts[index]?.text || translatedTexts[index] || item.text;
        
        if (item.node && RTL_LANGUAGES.has(this.targetLanguage)) {
          const element = item.node.nodeType === Node.TEXT_NODE ? item.node.parentElement : item.node.ownerElement;
          
          if (element && !element.hasAttribute('data-page-translated')) {
            const isLeaf = element.children.length === 0;
            if (isLeaf && TEXT_TAGS.has(element.tagName)) {
              element.setAttribute('dir', 'rtl');
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
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('Batch translation failed:', errorMsg);
      
      // KILL PROCESS: First, stop all future attempts
      this.isTranslating = false;
      this.queue = []; 
      if (this.batchTimer) clearTimeout(this.batchTimer);
      
      // SHOW ORGANIZED NOTIFICATION:
      (async () => {
        try {
          const underlyingType = matchErrorToType(error);
          const underlyingMessage = await getErrorMessage(underlyingType);
          const stoppedMessage = await getErrorMessage(ErrorTypes.PAGE_TRANSLATION_STOPPED);
          
          const fullMessage = stoppedMessage.includes('{error}') 
            ? stoppedMessage.replace('{error}', underlyingMessage)
            : `${stoppedMessage}: ${underlyingMessage}`;

          // Use ErrorHandler for consistent reporting
          ErrorHandler.getInstance().handle(new Error(fullMessage), {
            type: ErrorTypes.PAGE_TRANSLATION_STOPPED,
            context: 'page-translation',
            persistent: false, // Allow dismissal
            duration: NOTIFICATION_TIME.ERROR // Respect configured error timeout
          });
        } catch (err) {
          // Fallback if i18n fails
          ErrorHandler.getInstance().handle(error, {
            context: 'page-translation',
            persistent: false,
            duration: NOTIFICATION_TIME.ERROR
          });
        }
      })();

      // CLEANUP: Resolve current batch so they don't hang
      currentBatch.forEach(item => item.resolve(item.text));

      // Notify other components
      pageEventBus.emit('page-translation-error', { error: errorMsg, isFatal: true });
    } finally {
      this.activeFlushes--;
      if (this.isTranslating && this.queue.length > 0) {
        if (this.batchTimer) clearTimeout(this.batchTimer);
        this.batchTimer = setTimeout(() => this._flushBatch(), 50);
      }
    }
  }

  /**
   * Report translation progress
   */
  _reportProgress() {
    pageEventBus.emit('page-translation-progress', {
      translated: this.translatedCount,
      progress: -1,
    });
  }

  /**
   * Initialize the manager
   */
  async initialize() {
    if (this.isActive) return;

    this.logger.debug('Initializing PageTranslationManager');

    try {
      // Initialize specialized notification manager for other features if needed
      if (!this.notificationManager) {
        const { getSelectElementNotificationManager } = await import('@/features/element-selection/SelectElementNotificationManager.js');
        this.notificationManager = await getSelectElementNotificationManager(this.baseNotifier);
      }

      await this._loadSettings();
      this.nodeFilter = this._createNodesFilter();
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
    if (this.isTranslating) return { success: false, reason: 'already_translating' };

    if (this.currentUrl !== window.location.href) {
      this.isTranslated = false;
      this.translatedCount = 0;
      this.currentUrl = window.location.href;
    }

    this.isTranslating = true;
    this.isFirstBatch = true; // Reset for new translation session
    this.abortController = new AbortController();

    try {
      pageEventBus.emit('page-translation-start', { url: this.currentUrl });

      if (!this.domTranslator) {
        await this.initialize();
      }

      this.domTranslator.translate(document.documentElement);
      this.isTranslated = true;
      
      pageEventBus.emit('page-translation-complete', { url: this.currentUrl });

      return { success: true };
    } catch (error) {
      this.isTranslating = false;
      this.logger.error('Page translation failed to start', error);
      pageEventBus.emit('page-translation-error', { error });
      throw error;
    } finally {
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
      this.isTranslated = false;
      this.isTranslating = false;
      this.isFirstBatch = true; // Reset for next translation
      this.translatedCount = 0;
      this._nodeTrackingQueue.clear();
      const translatedElements = document.querySelectorAll('[data-page-translated]');
      translatedElements.forEach(el => {
        el.removeAttribute('dir');
        el.removeAttribute('data-page-translated');
        el.removeAttribute('data-translate-dir');
      });
      pageEventBus.emit('page-restore-complete', { url: this.currentUrl });
      return { success: true };
    } catch (error) {
      this.logger.error('Failed to restore page content', error);
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
      pageEventBus.emit('page-translation-cancelled');
    }
  }

  /**
   * Load settings from storage
   */
  async _loadSettings() {
    this.settings.lazyLoading = await getWholePageLazyLoadingAsync();
    this.settings.rootMargin = await getWholePageRootMarginAsync() || '300px';
    this.settings.autoTranslateOnDOMChanges = await getWholePageAutoTranslateOnDOMChangesAsync();
    const { CONFIG } = await import('@/shared/config/config.js');
    this.settings.excludedSelectors = CONFIG.WHOLE_PAGE_EXCLUDED_SELECTORS;
    this.settings.attributesToTranslate = CONFIG.WHOLE_PAGE_ATTRIBUTES_TO_TRANSLATE;
    this.settings.maxElements = CONFIG.WHOLE_PAGE_MAX_ELEMENTS;
    this.settings.chunkSize = CONFIG.WHOLE_PAGE_CHUNK_SIZE;
    this.settings.debounceDelay = CONFIG.WHOLE_PAGE_DEBOUNCE_DELAY;
    this.settings.maxConcurrentFlushes = CONFIG.WHOLE_PAGE_MAX_CONCURRENT_REQUESTS;
  }

  /**
   * Initialize domtranslator components
   */
  async _initializeDomTranslator() {
    try {
      if (this.settings.lazyLoading) {
        // Pass rootMargin to IntersectionScheduler from settings
        this.intersectionScheduler = new IntersectionScheduler({ rootMargin: this.settings.rootMargin });
      }

      // The translator callback receives (text, score)
      const nodesTranslator = new NodesTranslator(async (text, score) => {
        return await this._enqueueTranslation(text, score);
      });

      // Capture the node for each call and store it for our translator callback
      const originalTranslate = nodesTranslator.translate.bind(nodesTranslator);
      nodesTranslator.translate = (node, callback) => {
        const textContent = node.nodeValue || node.value || (node.nodeType === Node.ATTRIBUTE_NODE ? node.nodeValue : '');
        const normalized = this._normalizeText(textContent);
        if (normalized) {
          const queue = this._nodeTrackingQueue.get(normalized) || [];
          queue.push(node);
          this._nodeTrackingQueue.set(normalized, queue);
        }
        
        return originalTranslate(node, (text) => {
          if (typeof callback === 'function') callback(text, node);
        });
      };

      const originalUpdate = nodesTranslator.update.bind(nodesTranslator);
      nodesTranslator.update = (node, callback) => {
        const textContent = node.nodeValue || node.value || (node.nodeType === Node.ATTRIBUTE_NODE ? node.nodeValue : '');
        const normalized = this._normalizeText(textContent);
        if (normalized) {
          const queue = this._nodeTrackingQueue.get(normalized) || [];
          queue.push(node);
          this._nodeTrackingQueue.set(normalized, queue);
        }
        
        return originalUpdate(node, (text) => {
          if (typeof callback === 'function') callback(text, node);
        });
      };

      const config = { filter: this.nodeFilter };
      if (this.intersectionScheduler) config.scheduler = this.intersectionScheduler;
      this.domTranslator = new DOMTranslator(nodesTranslator, config);
      
      if (this.settings.autoTranslateOnDOMChanges) {
        this.persistentTranslator = new PersistentDOMTranslator(this.domTranslator);
      }
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
      ignoredSelectors: this.settings.excludedSelectors || ['script', 'style', 'noscript', 'iframe', 'code', 'pre', '[data-translate-ignore]'],
      attributesList: this.settings.attributesToTranslate || ['title', 'alt', 'placeholder', 'aria-label'],
    });
  }

  isCurrentlyTranslating() { return this.isTranslating; }
  isPageTranslated() { return this.isTranslated; }
  getStatus() {
    return {
      isActive: this.isActive,
      isTranslating: this.isTranslating,
      isTranslated: this.isTranslated,
      currentUrl: this.currentUrl,
      settings: this.settings,
    };
  }

  async cleanup() {
    this.cancelTranslation();
    if (this.batchTimer) clearTimeout(this.batchTimer);
    if (this.isTranslated) await this.restorePage();
    this.domTranslator = null;
    this.persistentTranslator = null;
    this.intersectionScheduler = null;
    this.queue = [];
    this._nodeTrackingQueue.clear();
    this.translatedCount = 0;
    super.cleanup();
  }
}

export const pageTranslationManager = new PageTranslationManager();
