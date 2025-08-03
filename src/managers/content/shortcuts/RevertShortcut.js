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
    // Only execute on ESC key
    if (event.key !== 'Escape' && event.code !== 'Escape') {
      return false;
    }

    // Check if there are any translated elements that need reverting
    const hasVueTranslations = document.querySelectorAll("span[data-translate-it-original-text]").length > 0;
    const hasLegacyTranslations = document.querySelectorAll("span[data-aiwc-original-text]").length > 0;
    
    if (!hasVueTranslations && !hasLegacyTranslations) {
      console.log('[RevertShortcut] No translations found to revert');
      return false;
    }

    console.log('[RevertShortcut] Found translations to revert via ESC');
    return true;
  }

  /**
   * Execute the shortcut
   * @param {KeyboardEvent} event - Keyboard event
   * @returns {Promise<Object>} Execution result
   */
  async execute(event) {
    console.log('[RevertShortcut] Executing ESC revert shortcut');
    
    try {
      // Import and use RevertHandler
      const { RevertHandler } = await import('../../../handlers/content/RevertHandler.js');
      const revertHandler = new RevertHandler();
      
      const result = await revertHandler.executeRevert();
      
      if (result.success) {
        console.log(`[RevertShortcut] ✅ Successfully reverted ${result.revertedCount} translations`);
      } else {
        console.error('[RevertShortcut] ❌ Revert failed:', result.error);
      }
      
      return result;
      
    } catch (error) {
      console.error('[RevertShortcut] Error executing revert shortcut:', error);
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