/**
 * Revert Handler - Modular revert functionality for content scripts
 * Handles both Vue and Legacy translation systems
 */

export class RevertHandler {
  constructor() {
    this.context = 'content-revert';
  }

  /**
   * Execute revert operation
   * Detects and uses appropriate revert system
   * @returns {Promise<Object>} Revert result
   */
  async executeRevert() {
    console.log('[RevertHandler] Starting revert process');
    
    try {
      // Check which translation system is active and has translated elements
      const hasVueTranslations = document.querySelectorAll("span[data-translate-it-original-text]").length > 0;
      const hasLegacyTranslations = document.querySelectorAll("span[data-aiwc-original-text]").length > 0;
      
      let revertedCount = 0;
      let system = 'none';
      
      if (hasVueTranslations) {
        // Use Vue-based revert system
        console.log('[RevertHandler] Using Vue revert system');
        system = 'vue';
        revertedCount = await this.revertVueTranslations();
        
      } else if (hasLegacyTranslations) {
        // Use legacy revert system  
        console.log('[RevertHandler] Using legacy revert system');
        system = 'legacy';
        revertedCount = await this.revertLegacyTranslations();
      }
      
      console.log(`[RevertHandler] Revert completed: ${revertedCount} items reverted using ${system} system`);
      return { success: true, revertedCount, system };
      
    } catch (error) {
      console.error('[RevertHandler] Error in executeRevert:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Revert Vue-based translations
   * @returns {Promise<number>} Number of reverted translations
   */
  async revertVueTranslations() {
    let revertedCount = 0;
    
    try {
      const { revertAllTranslations } = await import("../../utils/text/detection.js");
      
      // Create context for revert
      const context = {
        translatedElements: new Set(document.querySelectorAll("span[data-translate-it-original-text]")),
        originalTexts: new Map()
      };
      
      revertedCount = revertAllTranslations(context);
      
      // Also check SelectElementManager for additional reverts
      const selectElementManager = await this.getSelectElementManager();
      if (selectElementManager && selectElementManager.translatedElements.size > 0) {
        const additionalReverts = await selectElementManager.revertTranslations();
        revertedCount += additionalReverts;
      }
      
      return revertedCount;
    } catch (error) {
      console.error('[RevertHandler] Error in Vue revert:', error);
      throw error;
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
        IconManager: translationHandler?.IconManager,
      };
      
      return await revertTranslations(context);
    } catch (error) {
      console.error('[RevertHandler] Error in legacy revert:', error);
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
      console.warn('[RevertHandler] Could not get SelectElementManager:', error);
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
      console.warn('[RevertHandler] Could not get TranslationHandler:', error);
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