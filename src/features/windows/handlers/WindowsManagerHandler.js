import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { WindowsManager } from '@/features/windows/managers/WindowsManager.js';
import { TranslationHandler as WindowsTranslationHandler } from '@/features/windows/managers/translation/TranslationHandler.js';
import { ClickManager } from '@/features/windows/managers/interaction/ClickManager.js';
import { WindowsState } from '@/features/windows/managers/core/WindowsState.js';
import { CrossFrameManager } from '@/features/windows/managers/crossframe/CrossFrameManager.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';

const logger = getScopedLogger(LOG_COMPONENTS.WINDOWS, 'WindowsManagerHandler');

/**
 * Handler for managing WindowsManager lifecycle through FeatureManager
 * Controls when WindowsManager is instantiated based on feature activation
 */
export class WindowsManagerHandler extends ResourceTracker {
  constructor({ featureManager }) {
    super('windows-manager-handler');
    this.featureManager = featureManager;
    this.windowsManager = null;
    this.clickManager = null;
    this.crossFrameManager = null;
    this.state = null;
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
        logger.debug('In iframe context - creating ClickManager for cross-frame communication');

        // In iframe, we only need ClickManager for outside click detection
        this.state = new WindowsState();
        this.crossFrameManager = new CrossFrameManager();
        this.clickManager = new ClickManager(this.crossFrameManager, this.state);

        // Set up handlers for cross-frame communication
        this.clickManager.setHandlers({
          onOutsideClick: () => {
            // When click is detected in iframe, send message to parent
            this.crossFrameManager.messageRouter.broadcastOutsideClick({
              target: { tagName: 'DIV', className: '' }
            });
          },
          onIconClick: null
        });

        // Listen for activation message from parent
        window.addEventListener('message', (event) => {
          if (event.data?.type === 'translateit-activate-click-listeners') {
            logger.debug('Received click activation message from parent');
            // Activate click listener in iframe
            this.clickManager.addOutsideClickListener();
          }
        });

        // Store globally for iframe access
        if (!window.iframeClickManager) {
          window.iframeClickManager = this.clickManager;
        }

        this.isActive = true;
        logger.info('Iframe ClickManager activated successfully');
        return true;
      }


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
      // Check if we're in iframe mode
      if (window !== window.top && this.clickManager) {
        // Clean up iframe ClickManager
        this.clickManager.cleanup();
        this.clickManager = null;
        this.crossFrameManager = null;
        this.state = null;

        // Remove global reference
        if (window.iframeClickManager === this.clickManager) {
          delete window.iframeClickManager;
        }

        this.isActive = false;
        logger.info('Iframe ClickManager deactivated successfully');
        return true;
      }

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