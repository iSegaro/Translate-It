// PageTranslationManager - Whole page translation using domtranslator library
// Provides recursive DOM translation with lazy loading and auto-translation on DOM changes

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { TranslationMode } from '@/shared/config/config.js';
import { getTranslationApiAsync, getTargetLanguageAsync, getWholePageLazyLoadingAsync, getWholePageAutoTranslateOnDOMChangesAsync, getWholePageRootMarginAsync, getWholePageExcludedSelectorsAsync, getWholePageAttributesToTranslateAsync } from '@/config.js';
import { AUTO_DETECT_VALUE } from '@/shared/config/constants.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import NotificationManager from '@/core/managers/core/NotificationManager.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
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
    this.translationMessageId = null; // Track session messageId
    
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
  }

  /**
   * Normalize text for consistent tracking and comparison
   */
  _normalizeText(text) {
    if (!text) return '';
    return text.trim().replace(/\s+/g, ' ');
  }

  /**
   * Check if a node is within the current viewport (with margin from settings)
   */
  _isInViewport(node) {
    const marginStr = this.settings.rootMargin || '300px';
    const marginValue = parseInt(marginStr, 10);
    return this._isInViewportWithMargin(node, marginValue);
  }

  /**
   * Check if a node is within the current viewport with custom margin
   * @param {Node} node - The node to check
   * @param {number} margin - Margin in pixels
   * @returns {boolean} True if node is in viewport with margin
   */
  _isInViewportWithMargin(node, margin) {
    if (!node) return false;

    // Use default margin if not provided
    const effectiveMargin = margin !== undefined ? margin : parseInt(this.settings.rootMargin || '300px', 10);

    try {
      const element = node.nodeType === Node.TEXT_NODE ? node.parentElement :
                     (node.nodeType === Node.ATTRIBUTE_NODE ? node.ownerElement : node);

      if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;

      if (element.offsetParent === null && element.tagName !== 'BODY' && !(element instanceof SVGElement)) {
        return false;
      }

      const rect = element.getBoundingClientRect();
      
      // Basic visibility check: must have some size
      if (rect.width === 0 || rect.height === 0) return false;

      // Check if element is hidden by CSS
      try {
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return false;
        }
      } catch { 
        /* ignore */
      }

      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

      // Check both vertical and horizontal axes with margin
      return (
        rect.bottom >= -effectiveMargin &&
        rect.top <= viewportHeight + effectiveMargin &&
        rect.right >= -effectiveMargin &&
        rect.left <= viewportWidth + effectiveMargin
      );
    } catch (_) {
      return false;
    }
  }

  /**
   * Prioritize visible items in the translation queue.
   * Elements that are currently in or near the viewport are moved to the front.
   * @returns {number} The number of visible items moved to the front.
   */
  _prioritizeQueue() {
    if (this.queue.length === 0) return 0;
    
    const visibleItems = [];
    const nonVisibleItems = [];
    
    // Parse numeric value from rootMargin (e.g., '300px' -> 300)
    const marginValue = parseInt(this.settings.rootMargin || '300', 10);

    for (const item of this.queue) {
      if (this._isInViewportWithMargin(item.node, marginValue)) {
        visibleItems.push(item);
      } else {
        nonVisibleItems.push(item);
      }
    }
    
    // Re-assemble queue with priority
    if (visibleItems.length > 0) {
      this.queue = [...visibleItems, ...nonVisibleItems];
    }
    
    return visibleItems.length;
  }

  /**
   * Determine if a text should be translated.
   * Filters out numbers, timers, and very short noisy strings.
   */
  _shouldTranslate(text) {
    if (!text) return false;
    const trimmed = text.trim();
    
    // Ignore purely numeric strings
    if (/^\d+$/.test(trimmed)) return false;
    
    // Ignore timers (e.g., 0:11, 1:20:05)
    if (/^(\d+:)+\d+$/.test(trimmed)) return false;
    
    // Ignore very short strings that are likely just icons or punctuation
    if (trimmed.length < 2 && !/[\u0600-\u06FF]/.test(trimmed)) return false;

    // Ignore strings that are just units or stats (e.g., "10k", "5.2M")
    if (/^\d+(\.\d+)?[kKM]$/.test(trimmed)) return false;

    return true;
  }

  /**
   * Enqueue a text for batch translation
   */
  async _enqueueTranslation(text, _score = 0) {
    if (!text || !text.trim() || !this.isTranslated) return text;
    
    // Filter out noise (timers, numbers, etc.)
    if (!this._shouldTranslate(text)) {
      return text;
    }

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
      if (this.queue.length >= this.settings.chunkSize * 2) {
        this._flushBatch();
      } else {
        if (this.batchTimer) clearTimeout(this.batchTimer);
        // Use longer debounce for regular updates to allow batching
        const debounceDelay = this.isFirstBatch ? 2000 : 1000;
        this.batchTimer = setTimeout(() => this._flushBatch(), debounceDelay);
      }
    });
  }

  /**
   * Get configuration for the current translation batch based on provider type.
   */
  async _getBatchConfig() {
    const providerRegistryId = await getTranslationApiAsync();
    const targetLanguage = await getTargetLanguageAsync();
    
    const { registryIdToName, isProviderType, ProviderTypes } = await import('@/features/translation/providers/ProviderConstants.js');
    const { CONFIG: globalConfig } = await import('@/shared/config/config.js');
    
    const providerName = registryIdToName(providerRegistryId);
    const isAI = isProviderType(providerName, ProviderTypes.AI);

    return {
      providerRegistryId,
      targetLanguage,
      chunkSize: this.settings.chunkSize,
      maxChars: isAI ? globalConfig.WHOLE_PAGE_AI_MAX_CHARS : globalConfig.WHOLE_PAGE_MAX_CHARS
    };
  }

  /**
   * Extract a batch of items from the queue based on character, size, and visibility limits.
   * @param {Object} config - Batch configuration
   * @param {number} maxToExtract - Maximum items allowed (for visibility-aware batching)
   */
  _extractBatch(config, maxToExtract = Infinity) {
    let itemsToProcess = 0;
    let currentChars = 0;

    for (const item of this.queue) {
      // If lazy loading is enabled, we only take items that are currently visible
      // (up to the limit found by prioritizeQueue)
      if (itemsToProcess >= maxToExtract) break;

      const itemLen = item.text.length;
      if (itemsToProcess >= config.chunkSize || 
          (currentChars + itemLen > config.maxChars && itemsToProcess > 0)) {
        break;
      }
      currentChars += itemLen;
      itemsToProcess++;
    }

    if (itemsToProcess === 0) return [];

    this.lastFlushTime = Date.now();
    return this.queue.splice(0, itemsToProcess);
  }

  /**
   * Apply translated texts to the original nodes and handle RTL if needed.
   */
  _applyBatchResults(batch, translatedTexts, targetLanguage) {
    batch.forEach((item, index) => {
      const translated = translatedTexts[index]?.text || translatedTexts[index] || item.text;
      
      if (item.node && RTL_LANGUAGES.has(targetLanguage)) {
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
  }

  /**
   * Handle errors during batch translation.
   */
  _handleBatchError(error, batch) {
    const errorType = matchErrorToType(error);
    const isQuotaError = [
      ErrorTypes.QUOTA_EXCEEDED, 
      ErrorTypes.DEEPL_QUOTA_EXCEEDED, 
      ErrorTypes.RATE_LIMIT_REACHED,
      ErrorTypes.INSUFFICIENT_BALANCE
    ].includes(errorType);
    
    this.logger.error('Batch translation failed:', { error, errorType, isQuotaError });
    
    if (isQuotaError) {
      this.logger.info(`Quota/Rate limit hit (${errorType}). Skipping this batch.`);
    } else {
      this.isTranslating = false;
      this.queue = []; 
      if (this.batchTimer) clearTimeout(this.batchTimer);
    }
    
    // Handle via central error system
    ErrorHandler.getInstance().handle(error, {
      type: isQuotaError ? errorType : ErrorTypes.PAGE_TRANSLATION_STOPPED,
      context: 'page-translation',
      showToast: true,
      duration: NOTIFICATION_TIME.ERROR
    });

    // Resolve all items to prevent hanging, even on error
    batch.forEach(item => {
      try { item.resolve(item.text); } catch (_) { /* ignore */ }
    });

    this._broadcastEvent(MessageActions.PAGE_TRANSLATE_ERROR, { 
      error: error instanceof Error ? error.message : String(error), 
      errorType,
      isFatal: !isQuotaError 
    });
  }

  /**
   * Flush the current translation queue
   */
  async _flushBatch() {
    if (!this.isTranslated) {
      this.queue = [];
      if (this.batchTimer) clearTimeout(this.batchTimer);
      return;
    }

    if (this.queue.length === 0) return;
    
    // Check concurrency limit
    if (this.activeFlushes >= (this.settings.maxConcurrentFlushes || 1)) {
      if (!this.batchTimer) this.batchTimer = setTimeout(() => this._flushBatch(), 500);
      return;
    }

    if (this.batchTimer) clearTimeout(this.batchTimer);
    
    // Prioritize visible items and get their count
    const visibleCount = this._prioritizeQueue();
    this.logger.debug(`Flush check - Queue: ${this.queue.length}, Visible: ${visibleCount}`);

    // If lazy loading is on and NO items are visible, don't flush yet
    if (this.settings.lazyLoading && visibleCount === 0) {
      this.isTranslating = this.queue.length > 0;
      return;
    }

    this.activeFlushes++;
    this.isTranslating = true; 
    let currentBatch = [];

    try {
      const config = await this._getBatchConfig();
      // Only extract what's visible if lazy loading is enabled
      const maxToExtract = this.settings.lazyLoading ? visibleCount : Infinity;
      currentBatch = this._extractBatch(config, maxToExtract);

      if (currentBatch.length === 0) {
        this.activeFlushes--;
        this.isTranslating = this.queue.length > 0;
        return;
      }

      this.isFirstBatch = false;
      this.logger.debug(`Flushing batch (${config.providerRegistryId}): ${currentBatch.length} texts. Queue: ${this.queue.length}`);

      const textsToTranslate = currentBatch.map(item => ({ text: item.text }));

      const result = await sendRegularMessage({
        action: MessageActions.PAGE_TRANSLATE_BATCH,
        messageId: this.translationMessageId, // Include session ID
        data: {
          text: JSON.stringify(textsToTranslate),
          provider: config.providerRegistryId,
          sourceLanguage: AUTO_DETECT_VALUE, 
          targetLanguage: config.targetLanguage,
          mode: TranslationMode.Page,
          options: { rawJsonPayload: true },
        },
        context: 'page-translation',
      }, { timeout: 60000 });

      if (!result?.success) throw new Error(result?.error || 'Batch translation failed');

      const translatedTexts = JSON.parse(result.translatedText);
      this._applyBatchResults(currentBatch, translatedTexts, config.targetLanguage);
      this._reportProgress();
    } catch (error) {
      this._handleBatchError(error, currentBatch);
    } finally {
      this.activeFlushes--;
      
      if (this.activeFlushes <= 0 && this.queue.length === 0) {
        this.isTranslating = false;
        this._reportProgress();
      }

      if (this.queue.length > 0) {
        this.isTranslating = true;
        if (this.batchTimer) clearTimeout(this.batchTimer);
        this.batchTimer = setTimeout(() => this._flushBatch(), 50);
      }
    }
  }

  /**
   * Broadcast translation event to other extension components
   * @param {string} action - Message action from MessageActions
   * @param {Object} data - Event data
   */
  async _broadcastEvent(action, data = {}) {
    try {
      // Always emit locally first
      pageEventBus.emit(action, data);

      // Then broadcast to other contexts (Sidepanel, Popup)
      // We don't wait for response as this is fire-and-forget
      sendRegularMessage({
        action,
        data,
        context: 'page-translation-broadcast'
      }).catch(err => {
        // Only log if not a "no receiver" error
        if (err.message && !err.message.includes('Could not establish connection')) {
          this.logger.debug('Broadcast failed (expected if no UI open):', err.message);
        }
      });
    } catch (_) {
      // Ignore broadcast errors
    }
  }

  /**
   * Report translation progress
   */
  _reportProgress() {
    this._broadcastEvent(MessageActions.PAGE_TRANSLATE_PROGRESS, {
      translated: this.translatedCount,
      progress: -1,
    });
  }

  /**
   * Activate the manager
   * Satisfies FeatureManager's expected interface
   * @returns {boolean} Success status
   */
  async activate() {
    if (this.isActive) return true;

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
      this.logger.init('PageTranslationManager activated successfully');
      return true;
    } catch (error) {
      this.logger.error('Error activating PageTranslationManager:', error);
      return false;
    }
  }

  /**
   * Deactivate the manager
   * Satisfies FeatureManager's expected interface
   */
  async deactivate() {
    if (!this.isActive) return;
    
    try {
      await this.cleanup();
      this.isActive = false;
      this.logger.info('PageTranslationManager deactivated successfully');
    } catch (error) {
      this.logger.error('Error deactivating PageTranslationManager:', error);
    }
  }

  /**
   * Check if the current frame/document is suitable for translation
   * Used to avoid translating small iframes, ads, or empty pages
   * @returns {boolean} True if suitable
   */
  _isSuitableForTranslation() {
    // Main frame is always suitable
    if (window === window.top) return true;

    try {
      // Heuristics for iframes:
      
      // 1. Size check: Tiny iframes are almost certainly ads or tracking pixels
      // Common ad sizes: 300x250, 728x90, 160x600. 
      // We skip anything smaller than 120px in both dimensions unless it's very wide/tall
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      if (width < 50 || height < 50) {
        this.logger.debug(`Skipping tiny iframe: ${width}x${height}`);
        return false;
      }
      
      if (width < 120 && height < 120) {
        this.logger.debug(`Skipping small square-ish iframe: ${width}x${height}`);
        return false;
      }

      // 2. Visibility check: Skip hidden iframes
      const style = window.getComputedStyle(document.documentElement);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }

      // 3. Content density check: Skip iframes with very little text
      // We check body innerText. This is usually cheap for small iframes.
      const text = document.body ? document.body.innerText.trim() : '';
      if (text.length < 20) {
        // Double check if there are any translatable attributes if text is short
        const hasTranslatableAttributes = !!document.querySelector('[title], [alt], [placeholder], [aria-label]');
        if (!hasTranslatableAttributes) {
          this.logger.debug(`Skipping iframe with low text density (${text.length} chars) and no translatable attributes`);
          return false;
        }
      }

      return true;
    } catch (e) {
      // In case of any error (security or DOM), fallback to size-based check
      return window.innerWidth > 150 && window.innerHeight > 150;
    }
  }

  /**
   * Translate the entire page
   */
  async translatePage(_options = {}) {
    if (this.isTranslating) return { success: false, reason: 'already_translating' };
    if (this.isTranslated) return { success: false, reason: 'already_translated' };

    // Check if this frame is suitable for translation (ads/tiny frames)
    if (!this._isSuitableForTranslation()) {
      return { success: false, reason: 'not_suitable_for_translation' };
    }

    if (this.currentUrl !== window.location.href) {
      this.isTranslated = false;
      this.translatedCount = 0;
      this.queue = [];
      this._nodeTrackingQueue.clear();
      this.currentUrl = window.location.href;
      this.logger.debug('URL changed, resetting translation state and clearing queue');
    }

    this.isTranslating = true;
    this.isFirstBatch = true; // Reset for new translation session
    this.abortController = new AbortController();
    this.translationMessageId = `page-translate-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    try {
      this._broadcastEvent(MessageActions.PAGE_TRANSLATE_START, { url: this.currentUrl, messageId: this.translationMessageId });

      // Force reload settings to pick up any changes since initialization
      await this._loadSettings();

      if (!this.domTranslator) {
        await this.activate();
      } else if (this.settings.autoTranslateOnDOMChanges && !this.persistentTranslator) {
        // If it was disabled during init but now enabled, create it
        this.persistentTranslator = new PersistentDOMTranslator(this.domTranslator);
      }

      try {
        // Handle infinite scroll / dynamic content
        if (this.persistentTranslator) {
          this.persistentTranslator.translate(document.documentElement);
        } else {
          // Fallback to one-time translation if persistent is not enabled
          this.domTranslator.translate(document.documentElement);
        }
      } catch (libError) {
        // Handle "already translated" error from library gracefully
        if (libError.message && libError.message.includes('already been translated')) {
          this.logger.info('Node already under translation, ignoring duplicate call');
        } else {
          throw libError;
        }
      }
      
      this.isTranslated = true;
      this.isTranslating = false; // Initial pass setup complete
      
      this._broadcastEvent(MessageActions.PAGE_TRANSLATE_COMPLETE, { url: this.currentUrl });

      return { success: true };
    } catch (error) {
      this.isTranslating = false;
      this.logger.error('Page translation failed to start', error);
      this._broadcastEvent(MessageActions.PAGE_TRANSLATE_ERROR, { error: error.message || String(error) });
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
    
    // Cleanup background AI session
    if (this.translationMessageId) {
      sendRegularMessage({
        action: MessageActions.CANCEL_SESSION,
        data: { sessionId: this.translationMessageId }
      }).catch(e => this.logger.debug('Failed to cleanup session (ignore if no session):', e.message));
      this.translationMessageId = null;
    }

    try {
      if (this.persistentTranslator) {
        try {
          this.persistentTranslator.restore(document.documentElement);
        } catch (_) {
          // Ignore "not under observe" errors
        }
      }

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
      this._broadcastEvent(MessageActions.PAGE_RESTORE_COMPLETE, { url: this.currentUrl });
      return { success: true };
    } catch (error) {
      this.logger.error('Failed to restore page content', error);
      this._broadcastEvent(MessageActions.PAGE_RESTORE_ERROR, { error: error.message || String(error) });
      throw error;
    }
  }

  /**
   * Cancel ongoing translation
   */
  cancelTranslation() {
    this.logger.info('Cancelling translation');
    
    // Cleanup background AI session
    if (this.translationMessageId) {
      sendRegularMessage({
        action: MessageActions.CANCEL_SESSION,
        data: { sessionId: this.translationMessageId }
      }).catch(e => this.logger.debug('Failed to cleanup session (ignore if no session):', e.message));
      this.translationMessageId = null;
    }

    if (this.persistentTranslator) {
      try {
        this.persistentTranslator.restore(document.documentElement);
      } catch (_) {
        // Ignore errors
      }
    }
    
    if (this.abortController) {
      this.abortController.abort();
      this.isTranslating = false;
      this._broadcastEvent(MessageActions.PAGE_TRANSLATE_CANCELLED);
    }
  }

  /**
   * Load settings from storage
   */
  async _loadSettings() {
    this.settings.lazyLoading = await getWholePageLazyLoadingAsync();
    this.settings.rootMargin = await getWholePageRootMarginAsync() || '300px';
    this.settings.autoTranslateOnDOMChanges = await getWholePageAutoTranslateOnDOMChangesAsync();
    this.settings.excludedSelectors = await getWholePageExcludedSelectorsAsync();
    this.settings.attributesToTranslate = await getWholePageAttributesToTranslateAsync();
    
    const { CONFIG } = await import('@/shared/config/config.js');
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
        try {
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
        } catch (err) {
          if (err.message && err.message.includes('already been translated')) {
            // Silently ignore - node is already being handled
            return;
          }
          throw err;
        }
      };

      const originalUpdate = nodesTranslator.update.bind(nodesTranslator);
      nodesTranslator.update = (node, callback) => {
        try {
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
        } catch (err) {
          if (err.message && err.message.includes('already been translated')) {
            // Silently ignore - node is already being handled
            return;
          }
          throw err;
        }
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
      ignoredSelectors: this.settings.excludedSelectors || ['script', 'style', 'noscript', 'code', 'pre', '[data-translate-ignore]'],
      attributesList: this.settings.attributesToTranslate || ['title', 'alt', 'placeholder', 'value', 'aria-label', 'aria-placeholder', 'aria-roledescription', 'data-label', 'data-title', 'data-placeholder'],
    });
  }

  isCurrentlyTranslating() { return this.isTranslating; }
  isPageTranslated() { return this.isTranslated; }
  getStatus() {
    return {
      isActive: this.isActive,
      isTranslating: this.isTranslating,
      isTranslated: this.isTranslated,
      translatedCount: this.translatedCount,
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
