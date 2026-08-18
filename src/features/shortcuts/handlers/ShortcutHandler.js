import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { utilsFactory } from '@/utils/UtilsFactory.js';
import { shortcutManager } from '@/core/managers/content/shortcuts/ShortcutManager.js';

const Platform = {
  MAC: 'MAC',
  WINDOWS: 'WINDOWS',
  LINUX: 'LINUX',
  UNKNOWN: 'UNKNOWN'
};

// Global tracking for debugging multiple instances and singleton enforcement
if (!window.__shortcutHandlerInstances) {
  window.__shortcutHandlerInstances = new Set();
}

// Global flag to prevent instance creation when disabled
if (!window.__shortcutHandlerDisabled) {
  window.__shortcutHandlerDisabled = false;
}

// Singleton instance for proper instance management
let shortcutHandlerInstance = null;

const logger = getScopedLogger(LOG_COMPONENTS.SHORTCUTS, 'ShortcutHandler');

export class ShortcutHandler extends ResourceTracker {
  constructor(options = {}) {
    super('shortcut-handler');

    this.isActive = false;
    this.featureManager = options.featureManager;

    // Platform will be detected asynchronously in activate()
    this.platform = null;
    this.modifierKey = 'ctrlKey'; // Default value, will be updated in activate()

    // Track this instance for debugging
    window.__shortcutHandlerInstances.add(this);
  }

  // Static method to get or create singleton instance
  static getInstance(options = {}) {
    if (!shortcutHandlerInstance) {
      // Check global disable flag before creating instance
      if (window.__shortcutHandlerDisabled) {
        return null;
      }

      shortcutHandlerInstance = new ShortcutHandler(options);
      logger.info('ShortcutHandler singleton created');
    } else if (options.featureManager) {
      // Update options if provided
      shortcutHandlerInstance.featureManager = options.featureManager;
    }

    return shortcutHandlerInstance;
  }

  // Static method to destroy singleton instance
  static destroyInstance() {
    if (shortcutHandlerInstance) {
      if (shortcutHandlerInstance.isActive) {
        shortcutHandlerInstance.deactivate().catch(() => {
          // Error deactivating handled silently
        });
      }
      shortcutHandlerInstance = null;
      logger.info('ShortcutHandler singleton destroyed');
    }
  }

  async activate() {
    // Detect platform if not already done
    if (!this.platform) {
      try {
        const { detectPlatform } = await utilsFactory.getBrowserUtils();
        this.platform = detectPlatform();
        this.modifierKey = this.platform === Platform.MAC ? 'metaKey' : 'ctrlKey';
      } catch (error) {
        logger.error('Failed to detect platform:', error);
        // Keep default modifierKey if detection fails
        this.platform = Platform.UNKNOWN;
      }
    }

    // Check global disable flag - don't activate if disabled
    if (window.__shortcutHandlerDisabled) {
      return false;
    }

    if (this.isActive) {
      return true;
    }

    try {
      // Initialize ShortcutManager with dependencies
      await shortcutManager.initialize({
        featureManager: this.featureManager
      });

      this.isActive = true;
      logger.info('ShortcutHandler activated successfully');
      return true;
    } catch (error) {
      const handler = ErrorHandler.getInstance();
      handler.handle(error, {
        type: ErrorTypes.SERVICE,
        context: 'ShortcutHandler-activate',
        showToast: false
      });
      return false;
    }
  }

  async deactivate() {
    if (!this.isActive) {
      return true;
    }

    try {
      // Cleanup ShortcutManager
      if (shortcutManager.initialized) {
        shortcutManager.cleanup();
      }

      // ResourceTracker cleanup will handle all tracked resources
      this.cleanup();

      // Remove this instance from tracking
      window.__shortcutHandlerInstances.delete(this);

      this.isActive = false;
      logger.info('ShortcutHandler deactivated successfully');
      return true;
    } catch (error) {
      logger.error('Error deactivating ShortcutHandler:', error);
      // Continue with cleanup even if error occurs
      try {
        if (shortcutManager.initialized) {
          shortcutManager.cleanup();
        }

        this.cleanup();

        // Remove this instance from tracking
        window.__shortcutHandlerInstances.delete(this);

        this.isActive = false;
        return true;
      } catch (cleanupError) {
        logger.error('Critical: ShortcutHandler cleanup failed:', cleanupError);

        // Try to remove from tracking even on critical failure
        window.__shortcutHandlerInstances.delete(this);

        return false;
      }
    }
  }

  /**
   * Handle keyboard event by delegating to ShortcutManager
   * @param {KeyboardEvent} event - Keyboard event to handle
   */
  async handleKeyboardEvent(event) {
    if (this.isActive && shortcutManager.initialized) {
      return await shortcutManager.handleKeyboardEvent(event);
    }
    return false;
  }

  // Static method to deactivate ALL instances (used when feature should be globally disabled)
  static async deactivateAllInstances() {
    // Set global disable flag to prevent new instances
    window.__shortcutHandlerDisabled = true;

    // Destroy singleton instance first
    this.destroyInstance();

    // Then handle any legacy instances that might exist
    if (window.__shortcutHandlerInstances && window.__shortcutHandlerInstances.size > 0) {
      const instances = Array.from(window.__shortcutHandlerInstances);

      for (const instance of instances) {
        try {
          await instance.deactivate();
        } catch {
          // Failed silently
        }
      }

      // Force clear the global tracking set
      window.__shortcutHandlerInstances.clear();
    }

    return true;
  }

  // Static method to enable ShortcutHandler creation (called when feature is enabled)
  static enableGlobally() {
    window.__shortcutHandlerDisabled = false;
    logger.info('ShortcutHandler globally enabled');
  }

  getShortcutKey() {
    const modifier = this.modifierKey === 'metaKey' ? 'Cmd' : 'Ctrl';
    return `${modifier}+/`;
  }

  isShortcutSupported() {
    return this.platform !== Platform.UNKNOWN;
  }

  getStatus() {
    return {
      handlerActive: this.isActive,
      shortcutKey: this.getShortcutKey(),
      platform: this.platform,
      supported: this.isShortcutSupported(),
      shortcutManagerInitialized: shortcutManager.initialized
    };
  }
}

export default ShortcutHandler;
