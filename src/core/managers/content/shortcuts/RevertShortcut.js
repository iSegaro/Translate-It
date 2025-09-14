import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
// Note: Direct access to SelectElementManager is no longer available
// We need to get it via FeatureManager or use alternative approaches

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'RevertShortcut');

/**
 * Get active SelectElementManager via FeatureManager
 * @returns {Object|null} Active SelectElementManager or null
 */
function getActiveSelectElementManager() {
  // FeatureManager should always be available and manage everything
  const featureManager = window.featureManager;

  if (!featureManager) {
    logger.error('FeatureManager not available - this should not happen');
    return null;
  }

  return featureManager.getFeatureHandler('selectElement') || null;
}

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
    // Priority 1: If translation is in progress, cancel it first
    if (window.isTranslationInProgress) {
      logger.debug('[RevertShortcut] Translation in progress. Executing CANCEL action.');

      try {
        // Cancel via SelectElementManager
        const selectElementManager = getActiveSelectElementManager();
        if (selectElementManager && selectElementManager.translationOrchestrator) {
          await selectElementManager.translationOrchestrator.cancelAllTranslations();
          logger.debug('[RevertShortcut] Cancelled translations via SelectElementManager');
        }

        // Also send cancellation to background
        try {
          const { sendMessage } = await import('@/shared/messaging/core/UnifiedMessaging.js');
          const { MessageActions } = await import('@/shared/messaging/core/MessageActions.js');

          await sendMessage({
            action: MessageActions.CANCEL_TRANSLATION,
            data: {
              cancelAll: true,
              reason: 'esc_key_pressed',
              context: 'revert-shortcut'
            }
          });
          logger.debug('[RevertShortcut] Sent cancellation to background');
        } catch (error) {
          logger.warn('[RevertShortcut] Failed to send cancellation to background:', error);
        }

        window.isTranslationInProgress = false;
        return { success: true, action: 'cancelled' };
      } catch (error) {
        logger.error('[RevertShortcut] Error cancelling translation:', error);
        window.isTranslationInProgress = false;
        return { success: false, action: 'cancellation_failed', error: error.message };
      }
    }

    // Priority 2: If no active processes, revert completed translations
    logger.debug('[RevertShortcut] No translation in progress. Executing REVERT action.');

    try {
      // Use RevertHandler - it handles everything including checking for translations
      const { revertHandler } = await import('@/handlers/content/RevertHandler.js');

      if (!revertHandler) {
        logger.error('[RevertShortcut] RevertHandler not available');
        return { success: false, error: 'RevertHandler not available' };
      }

      const result = await revertHandler.executeRevert();

      if (result.success) {
        logger.debug(`[RevertShortcut] ✅ Successfully reverted ${result.revertedCount} translations`);
      } else {
        logger.debug('[RevertShortcut] No translations found to revert');
      }

      return result;

    } catch (error) {
      logger.error('[RevertShortcut] Error executing revert shortcut:', error);
      return { success: false, error: error.message || 'Shortcut execution failed' };
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