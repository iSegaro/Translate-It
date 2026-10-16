import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

import { utilsFactory } from '@/utils/UtilsFactory.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { NOTIFICATION_TIME } from '@/shared/constants/ui.js';
import { useMobileStore } from '@/store/modules/mobile.js';
import NotificationManager from '@/core/managers/core/NotificationManager.js';
import { revertSelectElementTranslation } from '@/features/element-selection/core/DomTranslatorAdapter.js';
import { getActivePinia } from 'pinia';
import { state } from '@/shared/config/config.js';

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
      const reportRestoreFailure = (system) => ({ phase, error }) => {
        errors.push({
          system,
          error: `${phase}: ${error instanceof Error ? error.message : String(error)}`,
        });
      };

      // Attempt to revert Vue / SelectElementManager translations
      try {
        logger.info('Attempting Vue revert...');
        const vueRevertedCount = await this.revertVueTranslations(reportRestoreFailure('vue'));
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
        errors.push({ system: 'vue', error: String(error?.message ?? error) });
      }

      // Attempt to revert legacy translations
      try {
        logger.info('Attempting legacy revert...');
        const legacyRevertedCount = await this.revertLegacyTranslations(reportRestoreFailure('legacy'));
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
        errors.push({ system: 'legacy', error: String(error?.message ?? error) });
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
        if (totalRevertedCount > 0 && errors.length === 0) {
          try {
            const { getTranslationString } = await utilsFactory.getI18nUtils();
            const message = `${totalRevertedCount} ${(await getTranslationString("STATUS_Revert_Number")) || "(item(s) reverted)"}`;
            this.notificationManager.show(message, "revert", NOTIFICATION_TIME.REVERT);
            logger.info('Success notification sent');
          } catch (notificationError) {
            logger.warn('Failed to send revert notification:', notificationError);
          }
        } else if (totalRevertedCount === 0 && errors.length === 0) {
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
        success: totalRevertedCount > 0 || errors.length === 0,
        partial: totalRevertedCount > 0 && errors.length > 0,
        revertedCount: totalRevertedCount,
        system: finalSystem,
        errors: errors.length > 0 ? errors : undefined
      };
      if (!result.success) {
        result.error = errors.map(({ system, error }) => `${system}: ${error}`).join('; ');
      }

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
  async revertVueTranslations(onRestoreFailure) {
    // Cancel frame-local work before touching global restoration state. Keep
    // the captured owner so a replacement manager is not accidentally cancelled.
    const selectElementManager = await this.getSelectElementManager();
    const adapter = selectElementManager?.domTranslatorAdapter;
    const sessionId = adapter?.currentSessionId;
    const hasSessionId = sessionId !== undefined;
    if (adapter?.isCurrentlyTranslating?.() === true) {
      if (typeof adapter.cancelTranslation !== 'function') {
        throw new Error('Active Select Element translation cannot be cancelled before revert');
      }

      await adapter.cancelTranslation({ silent: true, awaitSettlement: true });
      if (adapter.isCurrentlyTranslating?.() === true) {
        throw new Error('Select Element translation remained active after cancellation');
      }

      const currentManager = await this.getSelectElementManager();
      if (
        currentManager !== selectElementManager ||
        currentManager?.domTranslatorAdapter !== adapter ||
        currentManager?.domTranslatorAdapter?.isCurrentlyTranslating?.() === true ||
        (hasSessionId && adapter.currentSessionId !== sessionId)
      ) {
        throw new Error('Select Element owner or session changed during cancellation; revert was not applied');
      }
    }

    // Revert Select Element history only after any active frame-local operation settles.
    const selectElementReverted = await revertSelectElementTranslation(null, { onRestoreFailure });

    if (selectElementReverted > 0) {
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

      return selectElementReverted;
    }

    // Fallback: Try to get SelectElementManager instance using the unified getter
    // which includes fallbacks to global window instances if FeatureManager is not available
    // A global zero-count result may have yielded to a newer frame-local operation.
    // Do not let the manager fallback cancel or consume that newer session.
    if (
      adapter &&
      (selectElementManager.domTranslatorAdapter !== adapter ||
        (hasSessionId && adapter.currentSessionId !== sessionId) ||
        adapter.isCurrentlyTranslating?.() === true)
    ) {
      logger.debug('Skipping SelectElementManager fallback because its adapter changed during global revert');
      return 0;
    }

    if (selectElementManager && typeof selectElementManager.revertTranslations === 'function') {
      const revertedCount = await selectElementManager.revertTranslations();
      logger.debug(`Reverted ${revertedCount} translations via SelectElementManager.`);
      return revertedCount;
    } else {
      logger.debug('SelectElementManager not available or revertTranslations method not found');
      return 0;
    }
  }

  /**
   * Revert legacy translations
   * @returns {Promise<number>} Number of reverted translations
   */
  async revertLegacyTranslations(onRestoreFailure) {
    try {
      const { ErrorHandler } = await import('@/shared/error-management/ErrorHandler.js');
      
      const context = {
        state,
        errorHandler: ErrorHandler.getInstance(),
        notifier: this.notificationManager,
        onRestoreFailure,
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
