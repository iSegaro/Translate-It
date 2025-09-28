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

// Lazy logger initialization to prevent TDZ issues
let logger = null;
const getLogger = () => {
  if (!logger) {
    logger = getScopedLogger(LOG_COMPONENTS.SHORTCUTS, 'ShortcutHandler');
  }
  return logger;
};

export class ShortcutHandler extends ResourceTracker {
  constructor(options = {}) {
    super('shortcut-handler');

    this.isActive = false;
    this.keydownHandler = null;
    this.translationHandler = null;
    this.featureManager = options.featureManager;

    // Platform will be detected asynchronously in activate()
    this.platform = null;
    this.modifierKey = 'ctrlKey'; // Default value, will be updated in activate()

    // Track this instance for debugging
    window.__shortcutHandlerInstances.add(this);
    // Instance created - logged at TRACE level for detailed debugging
    // getLogger().debug(`🔍 ShortcutHandler instance created. Total instances: ${window.__shortcutHandlerInstances.size}`);
  }

  // Static method to get or create singleton instance
  static getInstance(options = {}) {
    if (!shortcutHandlerInstance) {
      // Check global disable flag before creating instance
      if (window.__shortcutHandlerDisabled) {
        // Creation blocked - logged at TRACE level for detailed debugging
        // getLogger().debug('🚫 ShortcutHandler creation blocked - feature is globally disabled');
        return null;
      }

      shortcutHandlerInstance = new ShortcutHandler(options);
      getLogger().info('ShortcutHandler singleton created');
    } else {
      // Update options if provided
      if (options.featureManager) {
        shortcutHandlerInstance.featureManager = options.featureManager;
      }
      // Singleton reused - logged at TRACE level for detailed debugging
      // getLogger().debug('🔄 ShortcutHandler singleton instance reused');
    }

    return shortcutHandlerInstance;
  }

  // Static method to destroy singleton instance
  static destroyInstance() {
    if (shortcutHandlerInstance) {
      if (shortcutHandlerInstance.isActive) {
        shortcutHandlerInstance.deactivate().catch(error => {
          // Error deactivating - logged at TRACE level for detailed debugging
          // getLogger().error('Error deactivating singleton instance:', error);
        });
      }
      shortcutHandlerInstance = null;
      getLogger().info('ShortcutHandler singleton destroyed');
    }
  }

  async activate() {
    // Detect platform if not already done
    if (!this.platform) {
      try {
        const { detectPlatform } = await utilsFactory.getBrowserUtils();
        this.platform = detectPlatform();
        this.modifierKey = this.platform === Platform.MAC ? 'metaKey' : 'ctrlKey';
        // Platform detected - logged at TRACE level for detailed debugging
        // getLogger().debug(`Platform detected: ${this.platform}`);
      } catch (error) {
        getLogger().error('Failed to detect platform:', error);
        // Keep default modifierKey if detection fails
        this.platform = Platform.UNKNOWN;
      }
    }

    // Check global disable flag - don't activate if disabled
    if (window.__shortcutHandlerDisabled) {
      // Activation blocked - logged at TRACE level for detailed debugging
      // getLogger().debug('🚫 ShortcutHandler activation blocked - feature is globally disabled');
      return false;
    }

    if (this.isActive) {
      // Already active - logged at TRACE level for detailed debugging
      // getLogger().debug('ShortcutHandler already active');
      return true;
    }

    try {
      // Activating - logged at TRACE level for detailed debugging
      // getLogger().debug('Activating ShortcutHandler');

      // Initialize ShortcutManager with dependencies
      await shortcutManager.initialize({
        featureManager: this.featureManager
      });

      // Setup keyboard shortcut listeners (for Ctrl+/)
      this.setupShortcutListeners();

      this.isActive = true;
      getLogger().info('ShortcutHandler activated successfully');
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
      // Not active - logged at TRACE level for detailed debugging
      // getLogger().debug('ShortcutHandler not active');
      return true;
    }

    try {
      // Deactivating - logged at TRACE level for detailed debugging
      // getLogger().debug('Deactivating ShortcutHandler');

      // Manually remove event listeners to ensure they're properly cleaned up
      if (this.keydownHandler) {
        this.removeEventListener(document, 'keydown', this.keydownHandler, { capture: true });
        this.keydownHandler = null;
        // Event listener removed - logged at TRACE level for detailed debugging
        // getLogger().debug('Manually removed keydown event listener');
      }

      // Cleanup ShortcutManager
      if (shortcutManager.initialized) {
        shortcutManager.cleanup();
      }

      // ResourceTracker cleanup will handle all tracked resources
      this.cleanup();

      // Remove this instance from tracking
      window.__shortcutHandlerInstances.delete(this);
      // Instance removed - logged at TRACE level for detailed debugging
      // getLogger().debug(`🔍 ShortcutHandler instance removed. Remaining instances: ${window.__shortcutHandlerInstances.size}`);

      this.isActive = false;
      getLogger().info('ShortcutHandler deactivated successfully');
      return true;

    } catch (error) {
      getLogger().error('Error deactivating ShortcutHandler:', error);
      // Continue with cleanup even if error occurs
      try {
        if (shortcutManager.initialized) {
          shortcutManager.cleanup();
        }

        // Ensure event listeners are removed even on error
        if (this.keydownHandler) {
          this.removeEventListener(document, 'keydown', this.keydownHandler, { capture: true });
          this.keydownHandler = null;
        }

        this.cleanup();

        // Remove this instance from tracking
        window.__shortcutHandlerInstances.delete(this);
        // Instance removed (error path) - logged at TRACE level for detailed debugging
      // getLogger().debug(`🔍 ShortcutHandler instance removed (error path). Remaining instances: ${window.__shortcutHandlerInstances.size}`);

        this.isActive = false;
        return true;
      } catch (cleanupError) {
        getLogger().error('Critical: ShortcutHandler cleanup failed:', cleanupError);

        // Try to remove from tracking even on critical failure
        window.__shortcutHandlerInstances.delete(this);

        return false;
      }
    }
  }

  setupShortcutListeners() {
    try {
      // Ctrl+/ (or Cmd+/ on Mac) shortcut handler
      this.keydownHandler = (event) => {
        // Check global disable flag first
        if (window.__shortcutHandlerDisabled) {
          return;
        }

        if (!this.isActive) return;

        // Check for Ctrl+/ or Cmd+/ combination
        if (event[this.modifierKey] && event.key === '/') {
          // Check settings first before logging
          (async () => {
            const { settingsManager } = await import('@/shared/managers/SettingsManager.js');
            const isExtensionEnabled = settingsManager.get('EXTENSION_ENABLED', false);
            const isShortcutEnabled = settingsManager.get('ENABLE_SHORTCUT_FOR_TEXT_FIELDS', false);

            if (!isExtensionEnabled || !isShortcutEnabled) {
              return; // Silently ignore when disabled
            }

            getLogger().info('Translation shortcut triggered');

            // Prevent default behavior
            event.preventDefault();
            event.stopPropagation();

            // Handle the shortcut
            await this.handleTranslationShortcut(event);
          })();
        }
      };

      // Register the keydown listener
      this.addEventListener(document, 'keydown', this.keydownHandler, { capture: true });

      getLogger().info(`Shortcut listener setup: ${this.modifierKey} + /`);
      
    } catch (error) {
      getLogger().error('Failed to setup shortcut listeners:', error);
    }
  }

  async handleTranslationShortcut() {
    try {
      // Import settings dynamically to avoid circular dependencies
      const { settingsManager } = await import('@/shared/managers/SettingsManager.js');

      // Check settings before processing
      const isExtensionEnabled = settingsManager.get('EXTENSION_ENABLED', false);
      const isShortcutEnabled = settingsManager.get('ENABLE_SHORTCUT_FOR_TEXT_FIELDS', false);

      if (!isExtensionEnabled || !isShortcutEnabled) {
        // Shortcut is disabled due to settings
        return;
      }

      const activeElement = document.activeElement;

      // Check if active element is a text field
      if (this.isEditableElement(activeElement)) {
        // Shortcut triggered on text field - logged at TRACE level for detailed debugging
        // getLogger().debug('Shortcut triggered on text field:', activeElement.tagName);
        
        // Get text content
        const text = this.getElementText(activeElement);
        
        if (!text || text.trim().length === 0) {
          // No text found - logged at TRACE level for detailed debugging
          // getLogger().debug('No text found in active element for translation');
          return;
        }

        // Trigger translation for text field
        this.triggerTextFieldTranslation(activeElement, text);
        
      } else {
        // Check for selected text
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        
        if (selectedText) {
          getLogger().info(`Shortcut triggered with selection: ${selectedText.length} chars`);
          
          // Trigger translation for selected text
          this.triggerSelectionTranslation(selectedText, selection);
          
        } else {
          // No context found - logged at TRACE level for detailed debugging
          // getLogger().debug('No text field or selection found for shortcut');
          
          // Show a brief notification
          this.showShortcutHint();
        }
      }
      
    } catch (error) {
      getLogger().error('Error handling translation shortcut:', error);
      const handler = ErrorHandler.getInstance();
      handler.handle(error, {
        type: ErrorTypes.SERVICE,
        context: 'ShortcutHandler-handleShortcut',
        showToast: false
      });
    }
  }

  isEditableElement(element) {
    if (!element) return false;
    
    const tagName = element.tagName.toLowerCase();
    const type = element.type?.toLowerCase();
    
    // Check for input elements
    if (tagName === 'input') {
      const textTypes = ['text', 'email', 'password', 'search', 'url', 'tel'];
      return !type || textTypes.includes(type);
    }
    
    // Check for textarea
    if (tagName === 'textarea') return true;
    
    // Check for contenteditable elements
    if (element.contentEditable === 'true') return true;
    
    return false;
  }

  getElementText(element) {
    if (!element) return '';
    
    if (element.value !== undefined) {
      // Input or textarea
      return element.value;
    } else if (element.textContent !== undefined) {
      // Contenteditable
      return element.textContent;
    }
    
    return '';
  }

  triggerTextFieldTranslation(element, text) {
    try {
      // Import translation handler dynamically to avoid circular dependencies
      import('@/core/InstanceManager.js').then(({ getTranslationHandlerInstance }) => {
        const translationHandler = getTranslationHandlerInstance();
        if (translationHandler && typeof translationHandler.processTranslation_with_CtrlSlash === 'function') {
          translationHandler.processTranslation_with_CtrlSlash({
            text: text,
            target: element
          });
        } else {
          // Translation handler unavailable - logged at TRACE level for detailed debugging
          // getLogger().error('Translation handler not available or missing method');
        }
      }).catch(error => {
        // Failed to load translation handler - logged at TRACE level for detailed debugging
        // getLogger().error('Failed to load translation handler:', error);
      });
      
    } catch (error) {
      // Error triggering translation - logged at TRACE level for detailed debugging
      // getLogger().error('Error triggering text field translation:', error);
    }
  }

  triggerSelectionTranslation(selectedText, selection) {
    try {
      // Ensure WindowsManager is activated through FeatureManager
      if (this.featureManager) {
        // Activate WindowsManager if not already active
        if (!this.featureManager.activeFeatures.has('windowsManager')) {
          this.featureManager.activateFeature('windowsManager').then(() => {
            // Once activated, get the WindowsManager and show translation
            const windowsManagerHandler = this.featureManager.getFeatureHandler('windowsManager');
            if (windowsManagerHandler && windowsManagerHandler.getWindowsManager) {
              const windowsManager = windowsManagerHandler.getWindowsManager();

              // Calculate position for translation window
              const range = selection.getRangeAt(0);
              const rect = range.getBoundingClientRect();

              const position = {
                x: rect.left + (rect.width / 2),
                y: rect.bottom + 10
              };

              // Show translation window
              windowsManager.show(selectedText, position);
            }
          }).catch(error => {
            // Failed to activate WindowsManager - logged at TRACE level for detailed debugging
            // getLogger().error('Failed to activate WindowsManager:', error);
          });
        } else {
          // WindowsManager is already active
          const windowsManagerHandler = this.featureManager.getFeatureHandler('windowsManager');
          if (windowsManagerHandler && windowsManagerHandler.getWindowsManager) {
            const windowsManager = windowsManagerHandler.getWindowsManager();

            // Calculate position for translation window
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            const position = {
              x: rect.left + (rect.width / 2),
              y: rect.bottom + 10
            };

            // Show translation window
            windowsManager.show(selectedText, position);
          }
        }
      } else {
        // FeatureManager unavailable - logged at TRACE level for detailed debugging
        // getLogger().warn('FeatureManager not available');
      }

    } catch (error) {
      // Error triggering selection translation - logged at TRACE level for detailed debugging
      // getLogger().error('Error triggering selection translation:', error);
    }
  }

  showShortcutHint() {
    try {
      // Import page event bus to show notification
      import('@/core/PageEventBus.js').then(({ pageEventBus }) => {
        pageEventBus.emit('show-notification', {
          message: `Press ${this.modifierKey === 'metaKey' ? 'Cmd' : 'Ctrl'}+/ in a text field or with selected text to translate`,
          type: 'info',
          duration: 3000
        });
      }).catch(error => {
        // Could not show hint - logged at TRACE level for detailed debugging
        // getLogger().debug('Could not show shortcut hint:', error);
      });
      
    } catch (error) {
      // Error showing hint - logged at TRACE level for detailed debugging
      // getLogger().debug('Error showing shortcut hint:', error);
    }
  }

  // Public API methods
  getShortcutKey() {
    const modifier = this.modifierKey === 'metaKey' ? 'Cmd' : 'Ctrl';
    return `${modifier}+/`;
  }

  isShortcutSupported() {
    return this.platform !== Platform.UNKNOWN;
  }

  // Method to set translation handler after initialization
  setTranslationHandler(handler) {
    this.translationHandler = handler;
    // Translation handler set - logged at TRACE level for detailed debugging
    // getLogger().debug('Translation handler set for shortcuts');
  }

  // Static method to deactivate ALL instances (used when feature should be globally disabled)
  static async deactivateAllInstances() {
    // Set global disable flag to prevent new instances
    window.__shortcutHandlerDisabled = true;
    // Setting global disable flag - logged at TRACE level for detailed debugging
    // getLogger().debug('🚫 Setting global ShortcutHandler disable flag');

    // Destroy singleton instance first
    this.destroyInstance();

    // Then handle any legacy instances that might exist
    if (window.__shortcutHandlerInstances && window.__shortcutHandlerInstances.size > 0) {
      const instances = Array.from(window.__shortcutHandlerInstances);
      // Deactivating legacy instances - logged at TRACE level for detailed debugging
      // getLogger().debug(`🔍 Deactivating ${instances.length} legacy ShortcutHandler instances`);

      const results = [];
      for (const instance of instances) {
        try {
          const result = await instance.deactivate();
          results.push(result);
          // Legacy instance deactivated - logged at TRACE level for detailed debugging
          // getLogger().debug('✅ Legacy instance deactivated successfully');
        } catch (error) {
          // Failed to deactivate legacy instance - logged at TRACE level for detailed debugging
          // getLogger().error('❌ Failed to deactivate legacy instance:', error);
          results.push(false);
        }
      }

      // Force clear the global tracking set
      window.__shortcutHandlerInstances.clear();
      // Legacy instances cleaned up - logged at TRACE level for detailed debugging
      // getLogger().debug(`🔍 Legacy instances cleaned up. Success rate: ${results.filter(r => r).length}/${results.length}`);
    }

    return true;
  }

  // Static method to enable ShortcutHandler creation (called when feature is enabled)
  static enableGlobally() {
    window.__shortcutHandlerDisabled = false;
    getLogger().info('ShortcutHandler globally enabled');
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