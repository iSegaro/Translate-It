import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { selectElementManager } from '@/features/element-selection/managers/SelectElementManager.js';

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
    // Priority 1: If Select Element Mode is active, deactivate it first
    if (selectElementManager.isActive) {
      logger.debug('[RevertShortcut] Select Element Mode is active. Deactivating it.');
      await selectElementManager.deactivate();
      return { success: true, action: 'select_element_deactivated' };
    }

    // Priority 2: If translation is in progress, cancel it
    if (window.isTranslationInProgress) {
      logger.debug('[RevertShortcut] Translation in progress. Executing CANCEL action.');
      await selectElementManager.cancelInProgressTranslation();
      return { success: true, action: 'cancelled' };
    }

    // Priority 3: If no active processes, try to revert completed translations
    logger.debug('[RevertShortcut] No translation in progress. Executing REVERT action.');
    
    // Check if there are any translations to revert.
    // Check modern Vue translations in StateManager
    const hasModernTranslations = selectElementManager.stateManager.hasTranslatedElements();
    // Check legacy DOM-based translations  
    const hasLegacyVueTranslations = document.querySelectorAll("span[data-translate-it-original-text]").length > 0;
    const hasLegacyTranslations = document.querySelectorAll("span[data-aiwc-original-text]").length > 0;
    
    if (!hasModernTranslations && !hasLegacyVueTranslations && !hasLegacyTranslations) {
      logger.debug('[RevertShortcut] No translations found to revert');
      return { success: false, reason: 'no_translations_found' };
    }

    try {
      // Import and use singleton RevertHandler
      const { revertHandler } = await import('@/handlers/content/RevertHandler.js');
      
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