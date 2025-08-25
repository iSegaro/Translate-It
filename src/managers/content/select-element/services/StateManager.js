import { revertTranslations as revertTranslationsFromExtraction } from "../../../../utils/text/extraction.js";
import { getScopedLogger } from "../../../../utils/core/logger.js";
import { LOG_COMPONENTS } from "../../../../utils/core/logConstants.js";
import { pageEventBus } from '@/utils/core/PageEventBus.js';

export class StateManager {
  constructor() {
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'StateManager');
    this.originalTexts = new Map(); // This will be used by applyTranslationsToNodes
    this.translatedElements = new Map(); // Keep track of top-level translated elements
  }

  /**
   * Initialize the state manager
   */
  async initialize() {
    this.logger.debug('StateManager initialized');
  }

  /**
   * Get the context object required by extraction utilities.
   */
  getContext() {
    return {
      state: {
        originalTexts: this.originalTexts
      },
      // Mock other properties if needed by the utilities
      errorHandler: {
        handle: (error, meta) => this.logger.error("Error in extraction utility:", { error, meta })
      },
      notifier: {
        show: (message, type) => this.logger.info(`Notification: [${type}] ${message}`)
      },
      IconManager: {
        cleanup: () => {}
      }
    };
  }


  /**
   * Add a translated element to the state
   * @param {HTMLElement} element - The translated element
   * @param {Map} translations - Map of translations for revert functionality
   */
  addTranslatedElement(element, translations = new Map()) {
    const elementId = this._generateElementId(element);
    this.translatedElements.set(elementId, {
      element,
      timestamp: Date.now(),
      originalContent: element.innerHTML,
      translations: translations
    });
    this.logger.debug("Added translated element to state", { elementId, translationCount: translations.size });
  }

  /**
   * Generate unique ID for an element
   * @param {HTMLElement} element - The element to generate ID for
   * @returns {string} Unique element ID
   */
  _generateElementId(element) {
    return `element-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if there are any translated elements.
   * @returns {boolean} Whether there are translated elements.
   */
  hasTranslatedElements() {
    return this.translatedElements.size > 0;
  }

  /**
   * Revert translations by hiding overlay and restoring original content
   * @returns {number} Number of reverted translations
   */
  async revertTranslations() {
    let revertedCount = 0;
    
    for (const [elementId, translationData] of this.translatedElements) {
      try {
        // Hide translation overlay
        pageEventBus.emit('hide-translation', { element: translationData.element });
        revertedCount++;
      } catch (error) {
        this.logger.error("Failed to revert translation", { elementId, error });
      }
    }
    
    this.translatedElements.clear();
    this.logger.info(`Reverted ${revertedCount} translations`);
    return revertedCount;
  }

  /**
   * Cleanup resources.
   */
  async cleanup() {
    if (this.hasTranslatedElements()) {
      await this.revertTranslations();
    }
    this.originalTexts.clear();
    this.translatedElements.clear();
    this.logger.debug('StateManager cleanup completed');
  }

  /**
   * Get debugging information.
   * @returns {Object} Debug info.
   */
  getDebugInfo() {
    return {
      originalTextsCount: this.originalTexts.size,
      translatedElementsCount: this.translatedElements.size
    };
  }
}
