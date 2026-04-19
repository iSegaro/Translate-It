import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

import { utilsFactory } from '@/utils/UtilsFactory.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { NOTIFICATION_TIME } from '../../shared/config/constants.js';
import { useMobileStore } from '@/store/modules/mobile.js';
import NotificationManager from '@/core/managers/core/NotificationManager.js';
import { revertSelectElementTranslation } from '@/features/element-selection/core/DomTranslatorAdapter.js';
import { getActivePinia } from 'pinia';
import { state } from '@/shared/config/config.js';
import { getTranslationHandlerInstance } from "@/core/InstanceManager.js";

const logger = getScopedLogger(LOG_COMPONENTS.MESSAGING, 'RevertHandler');
/**
 * Revert Handler - Modular revert functionality for content scripts
 * Handles both Vue and Legacy translation systems
 */

export class RevertHandler extends ResourceTracker {
  constructor() {
    super('revert-handler')
    this.context = 'content-revert';
    this.isExecuting = false; // Prevent duplicate executions
    this.notificationManager = new NotificationManager();

    // Listen for revert requests from the PageEventBus (used by mobile dashboard and notifications)
    pageEventBus.on('revert-translations', () => {
      logger.info('Revert requested via PageEventBus');
      this.executeRevert().catch(err => {
        logger.error('Failed to execute revert from PageEventBus:', err);
      });
    });
  }

  /**
   * Execute revert operation
   * Detects and uses appropriate revert system
   * @returns {Promise<Object>} Revert result
   */
  async executeRevert() {
    // Prevent concurrent executions
    if (this.isExecuting) {
      logger.debug('Revert already in progress, skipping duplicate request');
      return { success: false, reason: 'already_executing' };
    }

    this.isExecuting = true;
    logger.info('Starting unified revert process');

    try {
      let totalRevertedCount = 0;
      let systemsUsed = [];
      let errors = [];

      // Attempt to revert Vue / SelectElementManager translations
      try {
        logger.info('Attempting Vue revert...');
        const vueRevertedCount = await this.revertVueTranslations();
        logger.info(`Vue revert result: ${vueRevertedCount} items reverted`);
        if (vueRevertedCount > 0) {
          totalRevertedCount += vueRevertedCount;
          systemsUsed.push('vue');
        }
      } catch (error) {
        logger.error('Error during Vue revert portion:', {
          error: error.message,
          stack: error.stack,
          errorType: error.name
        });
        errors.push({ system: 'vue', error: error.message });
      }

      // Attempt to revert legacy translations
      try {
        logger.info('Attempting legacy revert...');
        const legacyRevertedCount = await this.revertLegacyTranslations();
        logger.info(`Legacy revert result: ${legacyRevertedCount} items reverted`);
        if (legacyRevertedCount > 0) {
          totalRevertedCount += legacyRevertedCount;
          systemsUsed.push('legacy');
        }
      } catch (error) {
        logger.error('Error during legacy revert portion:', {
          error: error.message,
          stack: error.stack,
          errorType: error.name
        });
        errors.push({ system: 'legacy', error: error.message });
      }

      const finalSystem = systemsUsed.length > 0 ? systemsUsed.join(',') : 'none';
      logger.info(`Revert completed: ${totalRevertedCount} items reverted using ${finalSystem} system(s)`);

      if (errors.length > 0) {
        logger.warn('Revert completed with errors:', errors);
      }

      // Show a single, unified notification
      // CRITICAL: Only the top frame or cross-origin iframes should emit notifications
      // same-origin iframes share the event bus and UI with the top frame, so we avoid duplicate toasts
      const isTopFrame = window === window.top;
      const canAccessTop = (() => {
        try { return !!(window.top && window.top.location && window.top.location.href); }
        catch { return false; }
      })();
      const shouldEmitNotification = isTopFrame || !canAccessTop;

      if (shouldEmitNotification) {
        if (totalRevertedCount > 0) {
          const { getTranslationString } = await utilsFactory.getI18nUtils();
          const message = `${totalRevertedCount} ${(await getTranslationString("STATUS_Revert_Number")) || "(item(s) reverted)"}`;
          this.notificationManager.show(message, "revert", NOTIFICATION_TIME.REVERT);
          logger.info('Success notification sent');
        } else {
          // const { getTranslationString } = await utilsFactory.getI18nUtils();
          // const message = (await getTranslationString("STATUS_REVERT_NOT_FOUND")) || "No translations to revert.";
          // pageEventBus.emit('show-notification', { message, type: "warning", duration: NOTIFICATION_TIME.REVERT });
          // logger.info('Warning notification sent - no translations found');
          logger.info('No translations found to revert');
        }
      } else {
        logger.debug('Skipping notification emission in same-origin iframe (top frame will handle it)');
      }

      const result = {
        success: true,
        revertedCount: totalRevertedCount,
        system: finalSystem,
        errors: errors.length > 0 ? errors : undefined
      };

      logger.info('Returning result:', result);
      return result;

    } catch (error) {
      logger.error('Critical error in executeRevert:', {
        error: error.message,
        stack: error.stack,
        errorType: error.name
      });
      return { success: false, error: error.message };
    } finally {
      // Reset execution flag
      this.isExecuting = false;
      logger.debug('Execution flag reset');
    }
  }

  /**
   * Revert Vue-based translations
   * @returns {Promise<number>} Number of reverted translations
   */
  async revertVueTranslations() {
    try {
      // First, try to revert Select Element translation using global state
      // This works even when SelectElementManager is deactivated
      const selectElementReverted = await revertSelectElementTranslation();

      if (selectElementReverted) {
        logger.debug('Reverted Select Element translation via global state');
        
        // Update store to reset Revert badge - only if Pinia is active
        try {
          if (getActivePinia()) {
            const mobileStore = useMobileStore();
            mobileStore.setHasElementTranslations(false);
          }
        } catch {
          logger.debug('Pinia not available for store update during revert');
        }
        
        return 1;
      }

      // Fallback: Try to get SelectElementManager instance using the unified getter
      // which includes fallbacks to global window instances if FeatureManager is not available
      const selectElementManager = await this.getSelectElementManager();

      if (selectElementManager && typeof selectElementManager.revertTranslations === 'function') {
        const revertedCount = await selectElementManager.revertTranslations();
        logger.debug(`Reverted ${revertedCount} translations via SelectElementManager.`);
        return revertedCount;
      } else {
        logger.debug('SelectElementManager not available or revertTranslations method not found');
        return 0;
      }
    } catch (error) {
      logger.error('Error in Vue revert:', error);
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

      const context = {
        state,
        errorHandler: translationHandler?.errorHandler,
        notifier: translationHandler?.notifier,
        // IconManager removed as it doesn't exist in the current architecture
      };

      // Element Selection revert system is now handled by SelectElementManager
      // Skip the old import since textExtraction.js was removed in simplification
      logger.debug('Element Selection revert handled by SelectElementManager in vue revert');

      // Fallback to legacy system
      const { revertTranslations } = await import("@/shared/utils/text/extraction.js");
      return await revertTranslations(context);
    } catch (error) {
      logger.error('Error in legacy revert:', error);
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
      logger.debug('Checking for window.featureManager...', {
        hasFeatureManager: !!window.featureManager,
        hasGetFeatureHandler: !!(window.featureManager && typeof window.featureManager.getFeatureHandler === 'function')
      });

      if (window.featureManager && typeof window.featureManager.getFeatureHandler === 'function') {
        const selectElementManager = window.featureManager.getFeatureHandler('selectElement');
        logger.debug('FeatureManager.getFeatureHandler result:', {
          hasSelectElementManager: !!selectElementManager,
          managerType: typeof selectElementManager
        });

        if (selectElementManager) {
          logger.debug('Found SelectElementManager through FeatureManager');
          return selectElementManager;
        } else {
          logger.debug('FeatureManager returned null for selectElement');
        }
      } else {
        logger.debug('FeatureManager not available or invalid');
      }

      return null;
    } catch (error) {
      logger.warn('Could not get SelectElementManager from FeatureManager:', error);
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
      logger.warn('Could not get SelectElementManager:', error);
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
      
      // Fallback: use statically imported getter
      return getTranslationHandlerInstance();
    } catch (error) {
      logger.warn('Could not get TranslationHandler:', error);
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
