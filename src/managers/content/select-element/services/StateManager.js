import { revertTranslations as revertTranslationsFromExtraction } from "../../../../utils/text/extraction.js";
import { getScopedLogger } from "../../../../utils/core/logger.js";
import { LOG_COMPONENTS } from "../../../../utils/core/logConstants.js";

export class StateManager {
  constructor() {
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'StateManager');
    this.originalTexts = new Map(); // This will be used by applyTranslationsToNodes
    this.translatedElements = new Set(); // Keep track of top-level translated elements
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
   * Track a top-level element that has been translated.
   * @param {HTMLElement} element - The element containing translations.
   */
  addTranslatedElement(element) {
    this.translatedElements.add(element);
  }

  /**
   * Revert all translations made during this session.
   * This now delegates to the robust revert function from extraction.js.
   * @returns {Promise<number>} Number of elements reverted.
   */
  async revertTranslations() {
    this.logger.operation('Reverting all translations using extraction utility');
    const context = this.getContext();
    const revertedCount = await revertTranslationsFromExtraction(context);
    this.logger.info(`Reverted ${revertedCount} translation(s)`);
    this.translatedElements.clear(); // Clear the set of translated elements
    return revertedCount;
  }

  /**
   * Check if there are any translated elements.
   * @returns {boolean} Whether there are translated elements.
   */
  hasTranslatedElements() {
    return this.originalTexts.size > 0;
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
