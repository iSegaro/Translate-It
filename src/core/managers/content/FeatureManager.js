import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { ExclusionChecker } from '@/features/exclusion/core/ExclusionChecker.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'FeatureManager');

export class FeatureManager extends ResourceTracker {
  constructor() {
    super();
    this.activeFeatures = new Set();
    this.featureHandlers = new Map();
    this.exclusionChecker = new ExclusionChecker();
    this.initialized = false;
    this.settingsListener = null;
  }

  async initialize() {
    try {
      logger.init('Initializing FeatureManager');
      
      // Initialize exclusion checker
      await this.exclusionChecker.initialize();
      
      // Evaluate and register features
      await this.evaluateAndRegisterFeatures();
      
      // Setup settings change listener
      this.setupSettingsListener();
      
      // Setup URL change detection for SPAs
      this.setupUrlChangeDetection();
      
      this.initialized = true;
      logger.info('FeatureManager initialized successfully', {
        activeFeatures: Array.from(this.activeFeatures)
      });
      
    } catch (error) {
      const handler = ErrorHandler.getInstance();
      handler.handle(error, { 
        type: ErrorTypes.SERVICE, 
        context: 'FeatureManager-initialize',
        showToast: false 
      });
      throw error;
    }
  }

  async evaluateAndRegisterFeatures() {
    // Order matters: contentMessageHandler should be activated first
    // Note: selectElement is not included here - it's activated on-demand via ContentMessageHandler
    const features = ['contentMessageHandler', 'windowsManager', 'textSelection', 'textFieldIcon', 'shortcut'];
    
    logger.debug('Evaluating features for registration:', features);
    
    for (const feature of features) {
      if (await this.shouldActivateFeature(feature)) {
        await this.activateFeature(feature);
      }
    }
    
    logger.debug('Feature evaluation complete', {
      activeFeatures: Array.from(this.activeFeatures)
    });

    // Inject dependencies after all features are evaluated
    await this.injectDependencies();
  }

  async injectDependencies() {
    const contentMessageHandler = this.featureHandlers.get('contentMessageHandler');
    const shortcutHandler = this.featureHandlers.get('shortcut');

    // Note: SelectElementService is injected on-demand by ContentMessageHandler
    // No need to inject it here as it's not a managed feature

    // Inject TranslationHandler into ShortcutHandler
    if (shortcutHandler && contentMessageHandler) {
      try {
        const translationHandler = await contentMessageHandler.getTranslationHandler?.();
        if (translationHandler && typeof shortcutHandler.setTranslationHandler === 'function') {
          shortcutHandler.setTranslationHandler(translationHandler);
          logger.debug('Injected TranslationHandler into ShortcutHandler');
        } else {
          logger.warn('TranslationHandler not available for ShortcutHandler injection');
        }
      } catch (error) {
        logger.error('Error injecting TranslationHandler into ShortcutHandler:', error);
      }
    }
  }

  async shouldActivateFeature(featureName) {
    try {
      const allowed = await this.exclusionChecker.isFeatureAllowed(featureName);
      logger.debug(`Feature ${featureName} evaluation:`, allowed ? 'ALLOWED' : 'BLOCKED');
      return allowed;
    } catch (error) {
      logger.error(`Error evaluating feature ${featureName}:`, error);
      return false;
    }
  }

  async activateFeature(featureName) {
    if (this.activeFeatures.has(featureName)) {
      logger.debug(`Feature ${featureName} already active`);
      return;
    }

    try {
      logger.debug(`Activating feature: ${featureName}`);
      
      // Load and initialize feature handler
      const handler = await this.loadFeatureHandler(featureName);
      if (handler) {
        const success = await handler.activate();
        if (success !== false) { // Consider true or undefined as success
          this.featureHandlers.set(featureName, handler);
          this.activeFeatures.add(featureName);
          logger.info(`Feature ${featureName} activated successfully`);
        } else {
          logger.warn(`Feature ${featureName} activation returned false - not registering`);
        }
      }
      
    } catch (error) {
      logger.error(`Failed to activate feature ${featureName}:`, error);
      const handler = ErrorHandler.getInstance();
      handler.handle(error, { 
        type: ErrorTypes.SERVICE, 
        context: `FeatureManager-activateFeature-${featureName}`,
        showToast: false 
      });
    }
  }

  async deactivateFeature(featureName) {
    if (!this.activeFeatures.has(featureName)) {
      logger.debug(`Feature ${featureName} not active`);
      return;
    }

    try {
      logger.debug(`Deactivating feature: ${featureName}`);
      
      const handler = this.featureHandlers.get(featureName);
      if (handler && typeof handler.deactivate === 'function') {
        const success = await handler.deactivate();
        if (success === false) {
          logger.warn(`Feature ${featureName} deactivation returned false, but proceeding with cleanup`);
        }
      }
      
      this.featureHandlers.delete(featureName);
      this.activeFeatures.delete(featureName);
      
      logger.info(`Feature ${featureName} deactivated successfully`);
      
    } catch (error) {
      logger.error(`Failed to deactivate feature ${featureName}:`, error);
      const handler = ErrorHandler.getInstance();
      handler.handle(error, { 
        type: ErrorTypes.SERVICE, 
        context: `FeatureManager-deactivateFeature-${featureName}`,
        showToast: false 
      });
    }
  }

  async loadFeatureHandler(featureName) {
    try {
      let HandlerClass;
      
      switch (featureName) {
        case 'contentMessageHandler':
          const { ContentMessageHandler } = await import('@/handlers/content/ContentMessageHandler.js');
          HandlerClass = ContentMessageHandler;
          break;

        // selectElement is handled on-demand via ContentMessageHandler, not as a feature
        // case 'selectElement':
          
        case 'textSelection':
          const { TextSelectionHandler } = await import('@/features/text-selection/handlers/TextSelectionHandler.js');
          HandlerClass = TextSelectionHandler;
          break;
          
        case 'textFieldIcon':
          const { TextFieldIconHandler } = await import('@/features/text-field-interaction/handlers/TextFieldIconHandler.js');
          HandlerClass = TextFieldIconHandler;
          break;
          
        case 'shortcut':
          const { ShortcutHandler } = await import('@/features/shortcuts/handlers/ShortcutHandler.js');
          HandlerClass = ShortcutHandler;
          break;
          
        case 'windowsManager':
          const { WindowsManagerHandler } = await import('@/features/windows/handlers/WindowsManagerHandler.js');
          HandlerClass = WindowsManagerHandler;
          break;
          
        default:
          logger.error(`Unknown feature: ${featureName}`);
          return null;
      }
      
      return new HandlerClass({ featureManager: this });
      
    } catch (error) {
      logger.error(`Failed to load handler for feature ${featureName}:`, error);
      return null;
    }
  }

  setupSettingsListener() {
    try {
      const relevantSettings = [
        'EXTENSION_ENABLED',
        'TRANSLATE_WITH_SELECT_ELEMENT',
        'TRANSLATE_ON_TEXT_SELECTION', 
        'TRANSLATE_ON_TEXT_FIELDS',
        'ENABLE_SHORTCUT_FOR_TEXT_FIELDS',
        'EXCLUDED_SITES'
      ];
      
      this.settingsListener = async (data) => {
        if (relevantSettings.includes(data.key)) {
          logger.debug(`Settings change detected: ${data.key} = ${data.newValue}`);
          await this.handleSettingsChange(data.key, data.newValue);
        }
      };
      
      storageManager.on('change', this.settingsListener);
      logger.debug('Settings listener registered');
      
    } catch (error) {
      logger.error('Failed to setup settings listener:', error);
    }
  }

  async handleSettingsChange(key, newValue) {
    try {
      logger.debug(`Handling settings change: ${key} = ${newValue}`);
      
      // Refresh exclusion checker with new settings
      await this.exclusionChecker.refreshSettings();
      
      // Re-evaluate all features
      await this.reevaluateFeatures();
      
    } catch (error) {
      logger.error('Error handling settings change:', error);
    }
  }

  async reevaluateFeatures() {
    // Order matters: contentMessageHandler should be evaluated first
    // Note: selectElement is not included here - it's activated on-demand via ContentMessageHandler
    const features = ['contentMessageHandler', 'windowsManager', 'textSelection', 'textFieldIcon', 'shortcut'];
    
    logger.debug('Re-evaluating all features');
    
    for (const feature of features) {
      const shouldBeActive = await this.shouldActivateFeature(feature);
      const isCurrentlyActive = this.activeFeatures.has(feature);
      
      if (shouldBeActive && !isCurrentlyActive) {
        await this.activateFeature(feature);
      } else if (!shouldBeActive && isCurrentlyActive) {
        await this.deactivateFeature(feature);
      }
    }
    
    logger.debug('Feature re-evaluation complete', {
      activeFeatures: Array.from(this.activeFeatures)
    });
  }

  setupUrlChangeDetection() {
    try {
      let currentUrl = window.location.href;
      
      // Use MutationObserver for SPA detection
      const observer = new MutationObserver(() => {
        if (window.location.href !== currentUrl) {
          const oldUrl = currentUrl;
          currentUrl = window.location.href;
          this.handleUrlChange(oldUrl, currentUrl);
        }
      });
      
      observer.observe(document, { 
        subtree: true, 
        childList: true 
      });
      
      // Register observer for cleanup
      this.trackResource('url-change-listener', () => {
        observer.disconnect();
      });
      
      // Also listen to popstate for history navigation
      const popstateHandler = () => {
        if (window.location.href !== currentUrl) {
          const oldUrl = currentUrl;
          currentUrl = window.location.href;
          this.handleUrlChange(oldUrl, currentUrl);
        }
      };
      
      this.addEventListener(window, 'popstate', popstateHandler);
      
      logger.debug('URL change detection setup complete');
      
    } catch (error) {
      logger.error('Failed to setup URL change detection:', error);
    }
  }

  async handleUrlChange(oldUrl, newUrl) {
    logger.debug('URL changed:', { oldUrl, newUrl });
    
    try {
      // Update exclusion checker with new URL
      this.exclusionChecker.updateUrl(newUrl);
      
      // Re-evaluate features for new URL
      await this.reevaluateFeatures();
      
    } catch (error) {
      logger.error('Error handling URL change:', error);
    }
  }

  // Public API methods
  getActiveFeatures() {
    return Array.from(this.activeFeatures);
  }

  isFeatureActive(featureName) {
    return this.activeFeatures.has(featureName);
  }

  getFeatureHandler(featureName) {
    return this.featureHandlers.get(featureName);
  }

  async manualRefresh() {
    logger.debug('Manual refresh requested');
    await this.exclusionChecker.refreshSettings();
    await this.reevaluateFeatures();
  }

  getStatus() {
    return {
      initialized: this.initialized,
      activeFeatures: Array.from(this.activeFeatures),
      totalHandlers: this.featureHandlers.size,
      exclusionStatus: this.exclusionChecker.getFeatureStatus()
    };
  }

  // Override cleanup to handle settings listener
  cleanup() {
    try {
      if (this.settingsListener) {
        storageManager.off('change', this.settingsListener);
        this.settingsListener = null;
      }
      
      // Deactivate all features
      const activeFeatures = Array.from(this.activeFeatures);
      for (const feature of activeFeatures) {
        this.deactivateFeature(feature).catch(error => {
          logger.error(`Error deactivating feature ${feature} during cleanup:`, error);
        });
      }
      
      super.cleanup();
      logger.debug('FeatureManager cleanup completed');
      
    } catch (error) {
      logger.error('Error during FeatureManager cleanup:', error);
    }
  }
}

export default FeatureManager;