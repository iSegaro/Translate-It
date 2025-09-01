import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

import { getTranslationString } from '@/utils/i18n/i18n.js';
import { pageEventBus } from '@/core/PageEventBus.js';
const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'RevertHandler');
/**
 * Revert Handler - Modular revert functionality for content scripts
 * Handles both Vue and Legacy translation systems
 */

export class RevertHandler {
  constructor() {
    this.context = 'content-revert';
    this.isExecuting = false; // Prevent duplicate executions
  }

  /**
   * Execute revert operation
   * Detects and uses appropriate revert system
   * @returns {Promise<Object>} Revert result
   */
  async executeRevert() {
    // Prevent concurrent executions
    if (this.isExecuting) {
      logger.debug('[RevertHandler] Revert already in progress, skipping duplicate request');
      return { success: false, reason: 'already_executing' };
    }

    this.isExecuting = true;
    logger.debug('[RevertHandler] Starting unified revert process');
    
    try {
      let totalRevertedCount = 0;
      let systemsUsed = [];

      // Attempt to revert Vue / SelectElementManager translations
      try {
        const vueRevertedCount = await this.revertVueTranslations();
        if (vueRevertedCount > 0) {
          totalRevertedCount += vueRevertedCount;
          systemsUsed.push('vue');
        }
      } catch (error) {
        logger.error('[RevertHandler] Error during Vue revert portion:', error);
      }

      // Attempt to revert legacy translations
      try {
        const legacyRevertedCount = await this.revertLegacyTranslations();
        if (legacyRevertedCount > 0) {
          totalRevertedCount += legacyRevertedCount;
          systemsUsed.push('legacy');
        }
      } catch (error) {
        logger.error('[RevertHandler] Error during legacy revert portion:', error);
      }
      
      const finalSystem = systemsUsed.length > 0 ? systemsUsed.join(',') : 'none';
      logger.debug(`[RevertHandler] Revert completed: ${totalRevertedCount} items reverted using ${finalSystem} system(s)`);

      // Show a single, unified notification
      if (totalRevertedCount > 0) {
        const message = `${totalRevertedCount} ${(await getTranslationString("STATUS_Revert_Number")) || "(item(s) reverted)"}`;
        pageEventBus.emit('show-notification', { message, type: "revert" });
      } else {
        const message = (await getTranslationString("STATUS_REVERT_NOT_FOUND")) || "No translations to revert.";
        pageEventBus.emit('show-notification', { message, type: "warning" });
      }

      return { success: true, revertedCount: totalRevertedCount, system: finalSystem };
      
    } catch (error) {
      logger.error('[RevertHandler] Error in executeRevert:', error);
      return { success: false, error: error.message };
    } finally {
      // Reset execution flag
      this.isExecuting = false;
    }
  }

  /**
   * Revert Vue-based translations
   * @returns {Promise<number>} Number of reverted translations
   */
  async revertVueTranslations() {
    try {
      // Import the singleton directly to ensure the correct instance is used
      const { selectElementManager } = await import("@/features/element-selection/managers/SelectElementManager.js");
      const revertedCount = await selectElementManager.revertTranslations();
      logger.debug(`[RevertHandler] Reverted ${revertedCount} translations via SelectElementManager.`);
      return revertedCount;
    } catch (error) {
      logger.error('[RevertHandler] Error in Vue revert:', error);
      // Return 0 if this specific revert fails, so legacy can still try
      return 0;
    }
  }

  /**
   * Revert legacy translations
   * @returns {Promise<number>} Number of reverted translations
   */
  async revertLegacyTranslations() {
    try {
      const { revertTranslations } = await import("../../utils/text/extraction.js");
      const { state } = await import("../../config.js");
      
      // Get translation handler for context
      const translationHandler = await this.getTranslationHandler();
      
      const context = {
        state,
        errorHandler: translationHandler?.errorHandler,
        notifier: translationHandler?.notifier,
        // IconManager removed as it doesn't exist in the current architecture
      };
      
      return await revertTranslations(context);
    } catch (error) {
      logger.error('[RevertHandler] Error in legacy revert:', error);
      throw error;
    }
  }

  /**
   * Get SelectElementManager instance if available
   * @returns {Promise<Object|null>} SelectElementManager instance
   */
  async getSelectElementManager() {
    try {
      // Try to get from global window object first
      if (window.selectElementManagerInstance) {
        return window.selectElementManagerInstance;
      }
      
      // Fallback: try to find in existing instances
      return null;
    } catch (error) {
      logger.warn('[RevertHandler] Could not get SelectElementManager:', error);
      return null;
    }
  }

  /**
   * Get TranslationHandler instance if available
   * @returns {Promise<Object|null>} TranslationHandler instance
   */
  async getTranslationHandler() {
    try {
      // Try to get from global window object first
      if (window.translationHandlerInstance) {
        return window.translationHandlerInstance;
      }
      
      // Fallback: try to import and get instance
      const { getTranslationHandlerInstance } = await import("../../core/InstanceManager.js");
      return getTranslationHandlerInstance();
    } catch (error) {
      logger.warn('[RevertHandler] Could not get TranslationHandler:', error);
      return null;
    }
  }

  /**
   * Get handler information
   * @returns {Object} Handler info
   */
  getInfo() {
    return {
      context: this.context,
      type: 'RevertHandler',
      capabilities: ['vue-revert', 'legacy-revert']
    };
  }
}

// Singleton instance to prevent duplicate notifications
export const revertHandler = new RevertHandler();
