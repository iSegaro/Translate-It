import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

import { utilsFactory } from '@/utils/UtilsFactory.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { NOTIFICATION_TIME } from '../../shared/config/constants.js';

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
    logger.info('[RevertHandler] 🔄 Starting unified revert process');

    try {
      let totalRevertedCount = 0;
      let systemsUsed = [];
      let errors = [];

      // Attempt to revert Vue / SelectElementManager translations
      try {
        logger.info('[RevertHandler] 🎯 Attempting Vue revert...');
        const vueRevertedCount = await this.revertVueTranslations();
        logger.info(`[RevertHandler] ✅ Vue revert result: ${vueRevertedCount} items reverted`);
        if (vueRevertedCount > 0) {
          totalRevertedCount += vueRevertedCount;
          systemsUsed.push('vue');
        }
      } catch (error) {
        logger.error('[RevertHandler] ❌ Error during Vue revert portion:', {
          error: error.message,
          stack: error.stack,
          errorType: error.name
        });
        errors.push({ system: 'vue', error: error.message });
      }

      // Attempt to revert legacy translations
      try {
        logger.info('[RevertHandler] 🎯 Attempting legacy revert...');
        const legacyRevertedCount = await this.revertLegacyTranslations();
        logger.info(`[RevertHandler] ✅ Legacy revert result: ${legacyRevertedCount} items reverted`);
        if (legacyRevertedCount > 0) {
          totalRevertedCount += legacyRevertedCount;
          systemsUsed.push('legacy');
        }
      } catch (error) {
        logger.error('[RevertHandler] ❌ Error during legacy revert portion:', {
          error: error.message,
          stack: error.stack,
          errorType: error.name
        });
        errors.push({ system: 'legacy', error: error.message });
      }

      const finalSystem = systemsUsed.length > 0 ? systemsUsed.join(',') : 'none';
      logger.info(`[RevertHandler] 🏁 Revert completed: ${totalRevertedCount} items reverted using ${finalSystem} system(s)`);

      if (errors.length > 0) {
        logger.warn('[RevertHandler] ⚠️ Revert completed with errors:', errors);
      }

      // Show a single, unified notification
      if (totalRevertedCount > 0) {
        const { getTranslationString } = await utilsFactory.getI18nUtils();
        const message = `${totalRevertedCount} ${(await getTranslationString("STATUS_Revert_Number")) || "(item(s) reverted)"}`;
        pageEventBus.emit('show-notification', { message, type: "revert", duration: NOTIFICATION_TIME.REVERT });
        logger.info('[RevertHandler] 📢 Success notification sent');
      } else {
        const { getTranslationString } = await utilsFactory.getI18nUtils();
        const message = (await getTranslationString("STATUS_REVERT_NOT_FOUND")) || "No translations to revert.";
        pageEventBus.emit('show-notification', { message, type: "warning", duration: NOTIFICATION_TIME.REVERT });
        logger.info('[RevertHandler] 📢 Warning notification sent - no translations found');
      }

      const result = {
        success: true,
        revertedCount: totalRevertedCount,
        system: finalSystem,
        errors: errors.length > 0 ? errors : undefined
      };

      logger.info('[RevertHandler] 🎉 Returning result:', result);
      return result;

    } catch (error) {
      logger.error('[RevertHandler] 💥 Critical error in executeRevert:', {
        error: error.message,
        stack: error.stack,
        errorType: error.name
      });
      return { success: false, error: error.message };
    } finally {
      // Reset execution flag
      this.isExecuting = false;
      logger.debug('[RevertHandler] 🔄 Execution flag reset');
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
      } catch {
        logger.debug('[RevertHandler] Element Selection revert not available, using legacy system');

        // Fallback to legacy system
        const { revertTranslations } = await import("@/shared/utils/text/extraction.js");
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
      logger.debug('[RevertHandler] Checking for window.featureManager...', {
        hasFeatureManager: !!window.featureManager,
        hasGetFeatureHandler: !!(window.featureManager && typeof window.featureManager.getFeatureHandler === 'function')
      });

      if (window.featureManager && typeof window.featureManager.getFeatureHandler === 'function') {
        const selectElementManager = window.featureManager.getFeatureHandler('selectElement');
        logger.debug('[RevertHandler] FeatureManager.getFeatureHandler result:', {
          hasSelectElementManager: !!selectElementManager,
          managerType: typeof selectElementManager
        });

        if (selectElementManager) {
          logger.debug('[RevertHandler] Found SelectElementManager through FeatureManager');
          return selectElementManager;
        } else {
          logger.debug('[RevertHandler] FeatureManager returned null for selectElement');
        }
      } else {
        logger.debug('[RevertHandler] FeatureManager not available or invalid');
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
