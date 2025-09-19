import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

import { getTranslationString } from '@/utils/i18n/i18n.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'RevertHandler');
/**
 * Revert Handler - Modular revert functionality for content scripts
 * Handles both Vue and Legacy translation systems
 */

export class RevertHandler extends ResourceTracker {
  constructor() {
    super('revert-handler')
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
      // Get SelectElementManager instance through FeatureManager
      const selectElementManager = await this.getSelectElementManagerFromFeatureManager();

      if (selectElementManager && typeof selectElementManager.revertTranslations === 'function') {
        const revertedCount = await selectElementManager.revertTranslations();
        logger.debug(`[RevertHandler] Reverted ${revertedCount} translations via SelectElementManager.`);
        return revertedCount;
      } else {
        logger.debug('[RevertHandler] SelectElementManager not available or revertTranslations method not found');
        return 0;
      }
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
      // Get translation handler for context
      const translationHandler = await this.getTranslationHandler();
      const { state } = await import("../../config.js");

      const context = {
        state,
        errorHandler: translationHandler?.errorHandler,
        notifier: translationHandler?.notifier,
        // IconManager removed as it doesn't exist in the current architecture
      };

      // Try to use Element Selection revert system first, fallback to legacy
      try {
        const { revertTranslations } = await import("../../features/element-selection/utils/textExtraction.js");
        const elementSelectionResult = await revertTranslations(context);
        logger.debug('[RevertHandler] Used Element Selection revert system');
        return elementSelectionResult;
      } catch (elementError) {
        logger.debug('[RevertHandler] Element Selection revert not available, using legacy system');

        // Fallback to legacy system
        const { revertTranslations } = await import("../../utils/text/extraction.js");
        return await revertTranslations(context);
      }
    } catch (error) {
      logger.error('[RevertHandler] Error in legacy revert:', error);
      throw error;
    }
  }

  /**
   * Get SelectElementManager instance through FeatureManager
   * @returns {Promise<Object|null>} SelectElementManager instance
   */
  async getSelectElementManagerFromFeatureManager() {
    try {
      // Try to get FeatureManager from global window object
      if (window.featureManager && typeof window.featureManager.getFeatureHandler === 'function') {
        const selectElementManager = window.featureManager.getFeatureHandler('selectElement');
        if (selectElementManager) {
          logger.debug('[RevertHandler] Found SelectElementManager through FeatureManager');
          return selectElementManager;
        }
      }

      return null;
    } catch (error) {
      logger.warn('[RevertHandler] Could not get SelectElementManager from FeatureManager:', error);
      return null;
    }
  }

  /**
   * Get SelectElementManager instance if available (legacy method)
   * @returns {Promise<Object|null>} SelectElementManager instance
   */
  async getSelectElementManager() {
    try {
      // First try the new method through FeatureManager
      const manager = await this.getSelectElementManagerFromFeatureManager();
      if (manager) {
        return manager;
      }

      // Try to get from global window object
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

  cleanup() {
    this.isExecuting = false;
    
    // Use ResourceTracker cleanup for automatic resource management
    super.cleanup();
    
    logger.debug('RevertHandler cleanup completed');
  }
}

// Singleton instance to prevent duplicate notifications
export const revertHandler = new RevertHandler();
