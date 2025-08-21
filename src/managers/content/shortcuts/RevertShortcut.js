import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
import { selectElementManager } from '@/managers/content/select-element/SelectElementManager.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'RevertShortcut');
/**
 * Revert Shortcut - ESC key handler for reverting translations
 * Modular shortcut handler that integrates with RevertHandler
 */

export class RevertShortcut {
  constructor() {
    this.key = 'Escape';
    this.description = 'Revert all translations on the page';
  }

  /**
   * Check if shortcut should be executed
   * @param {KeyboardEvent} event - Keyboard event
   * @returns {Promise<boolean>} Whether to execute the shortcut
   */
  async shouldExecute(event) {
    // This shortcut should always be checked on Escape key press.
    // The decision to cancel or revert is handled in the execute method.
    return event.key === 'Escape' || event.code === 'Escape';
  }

  /**
   * Execute the shortcut
   * @param {KeyboardEvent} event - Keyboard event
   * @returns {Promise<Object>} Execution result
   */
  async execute() {
    // Decide whether to CANCEL an in-progress translation or REVERT a completed one.
    if (window.isTranslationInProgress) {
      logger.debug('[RevertShortcut] Translation in progress. Executing CANCEL action.');
      await selectElementManager.cancelInProgressTranslation();
      return { success: true, action: 'cancelled' };
    }

    logger.debug('[RevertShortcut] No translation in progress. Executing REVERT action.');
    
    // Check if there are any translations to revert.
    const hasVueTranslations = document.querySelectorAll("span[data-translate-it-original-text]").length > 0;
    const hasLegacyTranslations = document.querySelectorAll("span[data-aiwc-original-text]").length > 0;
    if (!hasVueTranslations && !hasLegacyTranslations) {
      logger.debug('[RevertShortcut] No translations found to revert');
      return { success: false, reason: 'no_translations_found' };
    }

    try {
      // Import and use RevertHandler
      const { RevertHandler } = await import('../../../handlers/content/RevertHandler.js');
      const revertHandler = new RevertHandler();
      
      const result = await revertHandler.executeRevert();
      
      if (result.success) {
        logger.debug(`[RevertShortcut] ✅ Successfully reverted ${result.revertedCount} translations`);
      } else {
        logger.error('[RevertShortcut] ❌ Revert failed:', result.error);
      }
      
      return result;
      
    } catch (error) {
      logger.error('[RevertShortcut] Error executing revert shortcut:', error);
      return {
        success: false,
        error: error.message || 'Shortcut execution failed'
      };
    }
  }

  /**
   * Get shortcut description
   * @returns {string} Description
   */
  getDescription() {
    return this.description;
  }

  /**
   * Get shortcut info
   * @returns {Object} Shortcut info
   */
  getInfo() {
    return {
      key: this.key,
      description: this.description,
      type: 'RevertShortcut',
      triggers: ['Escape key press with translations present']
    };
  }
}