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
    // Priority 1: If translation is in progress, cancel it first
    if (window.isTranslationInProgress) {
      logger.debug('[RevertShortcut] Translation in progress. Executing CANCEL action.');
      
      try {
        // Try multiple approaches to ensure cancellation works
        
        // Approach 1: Get active messageId for specific cancellation
        const activeMessageId = selectElementManager.getActiveMessageId();
        
        if (activeMessageId) {
          // Cancel specific translation with proper state management
          await selectElementManager.cancelSpecificTranslation(activeMessageId);
          logger.debug(`[RevertShortcut] Cancelled specific translation: ${activeMessageId}`);
        } else {
          // Approach 2: Fallback to cancel all translations via SelectElementManager
          logger.debug('[RevertShortcut] No specific messageId found, using cancel all approach');
          await selectElementManager.cancelInProgressTranslation();
          logger.debug('[RevertShortcut] Cancelled all translations via SelectElementManager');
          
          // Approach 3: Direct background cancellation as additional safety measure
          try {
            const { sendSmart } = await import('@/shared/messaging/core/SmartMessaging.js');
            const { MessageActions } = await import('@/shared/messaging/core/MessageActions.js');
            
            await sendSmart({
              action: MessageActions.CANCEL_TRANSLATION,
              data: { 
                cancelAll: true,
                reason: 'esc_key_pressed',
                context: 'revert-shortcut'
              }
            });
            logger.debug('[RevertShortcut] Sent direct cancel-all to background');
          } catch (directCancelError) {
            logger.debug('[RevertShortcut] Direct background cancellation failed:', directCancelError);
          }
        }
        
        // Note: resetCancelledTranslationState() in SelectElementManager already:
        // - Clears window.isTranslationInProgress
        // - Deactivates Select Element mode
        // - Disables highlighting
        
        return { success: true, action: 'cancelled' };
      } catch (error) {
        logger.error('[RevertShortcut] Error cancelling translation:', error);
        // Fallback: force clear state
        try {
          window.isTranslationInProgress = false;
          if (selectElementManager.resetCancelledTranslationState) {
            selectElementManager.resetCancelledTranslationState();
          }
          return { success: true, action: 'cancelled_fallback' };
        } catch (fallbackError) {
          return { success: false, action: 'cancellation_failed', error: error.message };
        }
      }
    }

    // Priority 2: If Select Element Mode is active (but no translation in progress), deactivate it
    // Use instance-agnostic approach - let background decide if deactivation is needed
    try {
      const { sendSmart } = await import('@/shared/messaging/core/SmartMessaging.js');
      const { MessageActions } = await import('@/shared/messaging/core/MessageActions.js');
      
      const result = await sendSmart({
        action: MessageActions.DEACTIVATE_SELECT_ELEMENT_MODE,
        data: { 
          active: false,
          reason: 'esc_key_pressed',
          context: 'revert-shortcut'
        }
      });
      
      // If background confirms deactivation occurred, return success
      if (result && result.success) {
        return { success: true, action: 'select_element_deactivated' };
      }
    } catch (error) {
      // Deactivation failed, continue to revert logic
    }

    // Priority 3: If no active processes, try to revert completed translations
    logger.debug('[RevertShortcut] No translation in progress. Executing REVERT action.');
    
    // Check if there are any translations to revert with enhanced detection
    let hasModernTranslations = false;
    let hasLegacyVueTranslations = false;
    let hasLegacyTranslations = false;
    
    try {
      // Check modern Vue translations in StateManager
      hasModernTranslations = selectElementManager.stateManager?.hasTranslatedElements?.() || false;
    } catch (error) {
      logger.debug('[RevertShortcut] Error checking modern translations:', error);
    }
    
    try {
      // Check legacy DOM-based translations  
      hasLegacyVueTranslations = document.querySelectorAll("span[data-translate-it-original-text]").length > 0;
      hasLegacyTranslations = document.querySelectorAll("span[data-aiwc-original-text]").length > 0;
    } catch (error) {
      logger.debug('[RevertShortcut] Error checking legacy translations:', error);
    }
    
    logger.debug('[RevertShortcut] Translation status check:', {
      hasModernTranslations,
      hasLegacyVueTranslations,
      hasLegacyTranslations
    });
    
    if (!hasModernTranslations && !hasLegacyVueTranslations && !hasLegacyTranslations) {
      logger.debug('[RevertShortcut] No translations found to revert');
      return { success: false, reason: 'no_translations_found' };
    }

    try {
      // Import and use singleton RevertHandler
      const { revertHandler } = await import('@/handlers/content/RevertHandler.js');
      
      if (!revertHandler) {
        logger.error('[RevertShortcut] RevertHandler not available');
        return {
          success: false,
          error: 'RevertHandler not available'
        };
      }
      
      const result = await revertHandler.executeRevert();
      
      if (result.success) {
        logger.debug(`[RevertShortcut] ✅ Successfully reverted ${result.revertedCount} translations`);
      } else {
        logger.error('[RevertShortcut] ❌ Revert failed:', result.error);
      }
      
      return result;
      
    } catch (error) {
      logger.error('[RevertShortcut] Error executing revert shortcut:', error);
      
      // Try fallback legacy revert methods
      try {
        logger.debug('[RevertShortcut] Attempting fallback revert methods');
        let revertedCount = 0;
        
        // Fallback 1: Modern Vue translations
        const modernElements = document.querySelectorAll("span[data-translate-it-original-text]");
        modernElements.forEach(element => {
          try {
            const originalText = element.getAttribute('data-translate-it-original-text');
            if (originalText) {
              element.textContent = originalText;
              element.removeAttribute('data-translate-it-original-text');
              revertedCount++;
            }
          } catch (elementError) {
            logger.debug('[RevertShortcut] Error reverting modern element:', elementError);
          }
        });
        
        // Fallback 2: Legacy translations
        const legacyElements = document.querySelectorAll("span[data-aiwc-original-text]");
        legacyElements.forEach(element => {
          try {
            const originalText = element.getAttribute('data-aiwc-original-text');
            if (originalText) {
              element.textContent = originalText;
              element.removeAttribute('data-aiwc-original-text');
              revertedCount++;
            }
          } catch (elementError) {
            logger.debug('[RevertShortcut] Error reverting legacy element:', elementError);
          }
        });
        
        if (revertedCount > 0) {
          logger.debug(`[RevertShortcut] ✅ Fallback revert successful: ${revertedCount} elements`);
          return {
            success: true,
            revertedCount,
            method: 'fallback'
          };
        } else {
          logger.debug('[RevertShortcut] No elements reverted by fallback methods');
          return {
            success: false,
            error: 'No elements could be reverted'
          };
        }
        
      } catch (fallbackError) {
        logger.error('[RevertShortcut] Fallback revert methods also failed:', fallbackError);
        return {
          success: false,
          error: error.message || 'Shortcut execution failed'
        };
      }
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