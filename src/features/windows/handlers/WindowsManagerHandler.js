import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { WindowsManager } from '@/features/windows/managers/WindowsManager.js';
import { TranslationHandler as WindowsTranslationHandler } from '@/features/windows/managers/translation/TranslationHandler.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { FeatureManager } from '@/core/managers/content/FeatureManager.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'WindowsManagerHandler');

/**
 * Handler for managing WindowsManager lifecycle through FeatureManager
 * Controls when WindowsManager is instantiated based on feature activation
 */
export class WindowsManagerHandler extends ResourceTracker {
  constructor({ featureManager }) {
    super('windows-manager-handler');
    this.featureManager = featureManager;
    this.windowsManager = null;
    this.isActive = false;

    logger.debug('WindowsManagerHandler initialized');
  }

  /**
   * Activate WindowsManager feature
   * Creates and initializes WindowsManager instance
   */
  async activate() {
    if (this.isActive) {
      logger.debug('WindowsManager already active, skipping activation');
      return true;
    }

    try {
      // Check if we're in an iframe - WindowsManager should only be created in main frame
      if (window !== window.top) {
        logger.debug('In iframe context - WindowsManager not needed, using cross-frame communication');
        this.isActive = true;
        return true;
      }

      // Use the global FeatureManager singleton
      const globalFeatureManager = FeatureManager.getInstance();

      // Create WindowsManager instance with its own TranslationHandler
      const translationHandler = new WindowsTranslationHandler();
      this.windowsManager = WindowsManager.getInstance({ translationHandler });
      
      // Store globally for compatibility with existing TextSelectionManager code
      if (!window.windowsManagerInstance) {
        window.windowsManagerInstance = this.windowsManager;
      }

      this.isActive = true;
      logger.info('WindowsManager activated successfully');
      return true;
      
    } catch (error) {
      logger.error('Failed to activate WindowsManager:', error);
      return false;
    }
  }

  /**
   * Deactivate WindowsManager feature
   * Cleans up WindowsManager instance and dismisses any open windows
   */
  async deactivate() {
    if (!this.isActive) {
      logger.debug('WindowsManager not active, skipping deactivation');
      return true;
    }

    try {
      // Dismiss any open windows before deactivation
      if (this.windowsManager) {
        await this.windowsManager.dismiss();
        
        // Clean up the instance
        WindowsManager.resetInstance();

        this.windowsManager = null;
      }

      // Remove global reference
      if (window.windowsManagerInstance === this.windowsManager) {
        delete window.windowsManagerInstance;
      }

      this.isActive = false;
      logger.info('WindowsManager deactivated successfully');
      return true;
      
    } catch (error) {
      logger.error('Failed to deactivate WindowsManager:', error);
      // Continue with deactivation even if cleanup failed
      this.isActive = false;
      this.windowsManager = null;
      return false;
    }
  }

  /**
   * Get the active WindowsManager instance
   * @returns {WindowsManager|null} WindowsManager instance or null if not active
   */
  getWindowsManager() {
    return this.windowsManager;
  }

  /**
   * Check if WindowsManager is currently active
   * @returns {boolean} Whether WindowsManager is active
   */
  getIsActive() {
    return this.isActive;
  }

  /**
   * Get handler status for debugging
   * @returns {Object} Current handler status
   */
  getStatus() {
    return {
      isActive: this.isActive,
      hasWindowsManager: !!this.windowsManager,
      isInIframe: window !== window.top,
      windowsVisible: this.windowsManager ? this.windowsManager.state.isVisible : false,
      iconMode: this.windowsManager ? this.windowsManager.state.isIconMode : false
    };
  }

  /**
   * Cleanup resources when handler is destroyed
   */
  cleanup() {
    if (this.isActive) {
      this.deactivate().catch(error => {
        logger.error('Error during cleanup deactivation:', error);
      });
    }
    
    // Call parent cleanup for ResourceTracker
    super.cleanup();
  }

  /**
   * Get handler description for debugging
   * @returns {string} Handler description
   */
  getDescription() {
    return 'Manages WindowsManager lifecycle for text selection translation windows';
  }
}