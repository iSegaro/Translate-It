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

    // Settings
    this.settings = {
      lazyLoading: true,
      autoTranslateOnDOMChanges: false,
      chunkSize: 20, 
      debounceDelay: 500,
      maxConcurrentFlushes: 3,
    };

    this.logger.debug('PageTranslationManager created');
  }

  /**
   * Check if a node is within the current viewport (with margin)
   */
  _isInViewport(node) {
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
      const margin = 200;
      
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
  async _enqueueTranslation(text, node) {
    if (!text || !text.trim()) return text;
    
    if (!this.isTranslating) {
      return text;
    }

    if (this.settings.lazyLoading && !this._isInViewport(node)) {
      return new Promise((resolve) => {
        const observer = new IntersectionObserver((entries) => {
          if (entries[0].isIntersecting) {
            observer.disconnect();
            resolve(this._doEnqueue(text, node));
          }
        }, { rootMargin: '200px' });
        
        const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : 
                       (node.nodeType === Node.ATTRIBUTE_NODE ? node.ownerElement : node);
        
        if (element && element.nodeType === Node.ELEMENT_NODE) {
          observer.observe(element);
        } else {
          resolve(this._doEnqueue(text, node));
        }
      });
    }

    return this._doEnqueue(text, node);
  }

  /**
   * Actual enqueueing logic
   */
  _doEnqueue(text, node) {
    return new Promise((resolve, reject) => {
      this.queue.push({ text: text.trim(), node, resolve, reject });

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
    if (!this.isTranslating) {
      this.queue = [];
      if (this.batchTimer) clearTimeout(this.batchTimer);
      return;
    }

    if (this.queue.length === 0) return;
    
    if (this.activeFlushes >= (this.settings.maxConcurrentFlushes || 3)) {
      return;
    }

    const now = Date.now();
    const timeSinceLastFlush = now - this.lastFlushTime;
    const minDelay = 1000;

    if (timeSinceLastFlush < minDelay) {
      if (this.batchTimer) clearTimeout(this.batchTimer);
      this.batchTimer = setTimeout(() => this._flushBatch(), minDelay - timeSinceLastFlush);
      return;
    }

    if (this.batchTimer) clearTimeout(this.batchTimer);

    this.lastFlushTime = Date.now();
    this.activeFlushes++;
    
    const currentBatch = this.queue.splice(0, this.settings.chunkSize);

    try {
      this.logger.debug(`Flushing batch of ${currentBatch.length} texts. Active: ${this.activeFlushes}. Remaining in queue: ${this.queue.length}`);

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
      this.logger.error('Page translation failed to start', error);
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
      this.isTranslated = false;
      this.translatedCount = 0;
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
        this.intersectionScheduler = new IntersectionScheduler();
      }
      const nodesTranslator = new NodesTranslator(async (text) => {
        return await this._enqueueTranslation(text, this._currentNode);
      });
      const originalTranslate = nodesTranslator.translate.bind(nodesTranslator);
      nodesTranslator.translate = (node, callback) => {
        this._currentNode = node;
        return originalTranslate(node, (text) => {
          if (typeof callback === 'function') callback(text, node);
        });
      };
      const originalUpdate = nodesTranslator.update.bind(nodesTranslator);
      nodesTranslator.update = (node, callback) => {
        this._currentNode = node;
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
    this.translatedCount = 0;
    super.cleanup();
  }
}

export const pageTranslationManager = new PageTranslationManager();
