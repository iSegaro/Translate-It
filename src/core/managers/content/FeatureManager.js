import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { ExclusionChecker } from '@/features/exclusion/core/ExclusionChecker.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
// ErrorHandler will be imported lazily when needed
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'FeatureManager');

// Singleton instance
let featureManagerInstance = null;

export class FeatureManager extends ResourceTracker {
  constructor() {
    // Enforce singleton pattern
    if (featureManagerInstance) {
      logger.debug('FeatureManager singleton already exists, returning existing instance');
      return featureManagerInstance;
    }

    super();
    this.activeFeatures = new Set();
    this.featureHandlers = new Map();
    this.exclusionChecker = ExclusionChecker.getInstance();
    this.initialized = false;
    this.settingsListener = null;
    this._evaluationInProgress = false;
    this._evaluationQueue = [];
    this._evaluationDebounceTimer = null;

    // Store singleton instance
    featureManagerInstance = this;
    logger.debug('FeatureManager singleton created');
  }

  // Static method to get singleton instance
  static getInstance() {
    if (!featureManagerInstance) {
      featureManagerInstance = new FeatureManager();
    }
    return featureManagerInstance;
  }

  // Method to reset singleton (for testing or cleanup)
  static resetInstance() {
    if (featureManagerInstance) {
      featureManagerInstance.cleanup();
      featureManagerInstance = null;
    }
    // Also reset other singletons
    ExclusionChecker.resetInstance();
    // Reset ContentMessageHandler singleton
    try {
      import('@/handlers/content/ContentMessageHandler.js').then((module) => {
        module.default.resetInstance();
      });
    } catch {
      // Import might not be available
    }

    // Reset WindowsManager singleton
    try {
      import('@/features/windows/managers/WindowsManager.js').then(({ WindowsManager }) => {
        WindowsManager.resetInstance();
      });
    } catch {
      // Import might not be available
    }
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
      // Try to get ErrorHandler for better error handling
      try {
        const { ErrorHandler } = await import('@/shared/error-management/ErrorHandler.js');
        const handler = ErrorHandler.getInstance();
        handler.handle(error, {
          type: ErrorTypes.SERVICE,
          context: 'FeatureManager-initialize',
          showToast: false
        });
      } catch (handlerError) {
        logger.error('Error initializing FeatureManager:', error);
      }
      throw error;
    }
  }

  async evaluateAndRegisterFeatures() {
    // Order matters: contentMessageHandler should be activated first
    // selectElement is managed directly by FeatureManager with its own Critical Protection
    const features = ['contentMessageHandler', 'selectElement', 'windowsManager', 'textSelection', 'textFieldIcon', 'shortcut'];
    
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
    const selectElementManager = this.featureHandlers.get('selectElement');
    const shortcutHandler = this.featureHandlers.get('shortcut');

    // Inject SelectElementManager into ContentMessageHandler for direct access
    if (contentMessageHandler && selectElementManager) {
      try {
        if (typeof contentMessageHandler.setSelectElementManager === 'function') {
          contentMessageHandler.setSelectElementManager(selectElementManager);
          logger.debug('Injected SelectElementManager into ContentMessageHandler');
        }
      } catch (error) {
        logger.error('Error injecting SelectElementManager into ContentMessageHandler:', error);
      }
    }

    // Inject TranslationHandler into ShortcutHandler if available
    if (shortcutHandler && contentMessageHandler) {
      try {
        const translationHandler = await contentMessageHandler.getTranslationHandler?.();
        if (translationHandler && typeof shortcutHandler.setTranslationHandler === 'function') {
          shortcutHandler.setTranslationHandler(translationHandler);
          logger.debug('Injected TranslationHandler into ShortcutHandler');
        }
      } catch {
        logger.debug('Could not inject TranslationHandler into ShortcutHandler - not needed for new implementation');
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

    // Check if handler already exists (protection against double creation)
    if (this.featureHandlers.has(featureName)) {
      logger.warn(`Feature ${featureName} handler already exists but not marked as active - cleaning up`);
      const existingHandler = this.featureHandlers.get(featureName);
      if (existingHandler && typeof existingHandler.deactivate === 'function') {
        await existingHandler.deactivate();
      }
      this.featureHandlers.delete(featureName);
    }

    try {
      logger.debug(`Activating feature: ${featureName}`);

      // Load and initialize feature handler
      let handler;
      if (featureName === 'textSelection') {
        // Use singleton pattern for SimpleTextSelectionHandler
        const { SimpleTextSelectionHandler } = await import('@/features/text-selection/handlers/SimpleTextSelectionHandler.js');
        handler = SimpleTextSelectionHandler.getInstance({ featureManager: this });
      } else if (featureName === 'contentMessageHandler') {
        // Use singleton pattern for ContentMessageHandler
        const { contentMessageHandler } = await import('@/handlers/content/ContentMessageHandler.js');
        handler = contentMessageHandler;
      } else {
        handler = await this.loadFeatureHandler(featureName);
      }

      if (handler) {
        const success = await handler.activate();
        if (success !== false) { // Consider true or undefined as success
          this.featureHandlers.set(featureName, handler);
          this.activeFeatures.add(featureName);

          // Special integration: Connect SelectElementManager to ContentMessageHandler
          if (featureName === 'selectElement') {
            try {
              const contentMessageHandler = this.featureHandlers.get('contentMessageHandler');
              if (contentMessageHandler && typeof contentMessageHandler.setSelectElementManager === 'function') {
                contentMessageHandler.setSelectElementManager(handler);
                logger.debug('SelectElementManager integrated with ContentMessageHandler');
              }
            } catch (integrationError) {
              logger.warn('Failed to integrate SelectElementManager with ContentMessageHandler:', integrationError);
            }
          } else if (featureName === 'contentMessageHandler') {
            // If ContentMessageHandler is activated after SelectElementManager, connect them
            try {
              const selectElementManager = this.featureHandlers.get('selectElement');
              if (selectElementManager && typeof handler.setSelectElementManager === 'function') {
                handler.setSelectElementManager(selectElementManager);
                logger.debug('ContentMessageHandler integrated with existing SelectElementManager');
              }
            } catch (integrationError) {
              logger.warn('Failed to integrate ContentMessageHandler with SelectElementManager:', integrationError);
            }
          }

          logger.info(`Feature ${featureName} activated successfully`);
        } else {
          logger.warn(`Feature ${featureName} activation returned false - not registering`);
        }
      }
      
    } catch (error) {
      logger.error(`Failed to activate feature ${featureName}:`, error);
      // Try to get ErrorHandler for better error handling
      try {
        const { ErrorHandler } = await import('@/shared/error-management/ErrorHandler.js');
        const handler = ErrorHandler.getInstance();
        handler.handle(error, {
          type: ErrorTypes.SERVICE,
          context: `FeatureManager-activateFeature-${featureName}`,
          showToast: false
        });
      } catch (handlerError) {
        // Fallback - error already logged
      }
    }
  }

  async deactivateFeature(featureName) {
    if (!this.activeFeatures.has(featureName)) {
      logger.debug(`Feature ${featureName} not active`);
      return;
    }

    try {
      logger.debug(`Deactivating feature: ${featureName}`);

      // Special handling for textFieldIcon feature to destroy singleton
      if (featureName === 'textFieldIcon') {
        try {
          const { TextFieldIconManager } = await import('@/features/text-field-interaction/managers/TextFieldIconManager.js');
          TextFieldIconManager.resetInstance();
          logger.debug('TextFieldIconManager singleton destroyed');
        } catch (importError) {
          logger.error('Failed to import TextFieldIconManager for singleton destruction:', importError);
          // Fall back to normal deactivation
        }
      }

      // Special handling for textSelection feature to destroy singleton
      if (featureName === 'textSelection') {
        try {
          const { SimpleTextSelectionHandler } = await import('@/features/text-selection/handlers/SimpleTextSelectionHandler.js');
          SimpleTextSelectionHandler.resetInstance();
          logger.debug('SimpleTextSelectionHandler singleton destroyed');
        } catch (importError) {
          logger.error('Failed to import SimpleTextSelectionHandler for singleton destruction:', importError);
          // Fall back to normal deactivation
        }
      }

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
      // Try to get ErrorHandler for better error handling
      try {
        const { ErrorHandler } = await import('@/shared/error-management/ErrorHandler.js');
        const handler = ErrorHandler.getInstance();
        handler.handle(error, {
          type: ErrorTypes.SERVICE,
          context: `FeatureManager-deactivateFeature-${featureName}`,
          showToast: false
        });
      } catch (handlerError) {
        // Fallback - error already logged
      }
    }
  }

  async loadFeatureHandler(featureName) {
    try {
      let HandlerClass;
      
      switch (featureName) {
        // Note: contentMessageHandler and textSelection are handled as special cases in activateFeature
        case 'selectElement': {
          const { SelectElementManager } = await import('@/features/element-selection/SelectElementManager.js');
          HandlerClass = SelectElementManager;
          break;
        }

  
        case 'textFieldIcon': {
          const { TextFieldHandler } = await import('@/features/text-field-interaction/handlers/TextFieldHandler.js');
          HandlerClass = TextFieldHandler;
          break;
        }

        case 'shortcut': {
          const { ShortcutHandler } = await import('@/features/shortcuts/handlers/ShortcutHandler.js');
          // Use singleton pattern for ShortcutHandler
          return ShortcutHandler.getInstance({ featureManager: this });
        }

        case 'windowsManager': {
          const { WindowsManagerHandler } = await import('@/features/windows/handlers/WindowsManagerHandler.js');
          HandlerClass = WindowsManagerHandler;
          break;
        }
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
        'ACTIVE_SELECTION_ICON_ON_TEXTFIELDS',
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
      await this.reevaluateFeatures(`settings-change:${key}`);
      
    } catch (error) {
      logger.error('Error handling settings change:', error);
    }
  }

  async reevaluateFeatures(reason = 'unknown') {
    return new Promise((resolve, reject) => {
      // Add to evaluation queue
      this._evaluationQueue.push({ reason, resolve, reject });

      // Clear existing debounce timer
      if (this._evaluationDebounceTimer) {
        clearTimeout(this._evaluationDebounceTimer);
      }

      // Debounce multiple rapid calls
      this._evaluationDebounceTimer = setTimeout(() => {
        this._processEvaluationQueue();
      }, 100); // 100ms debounce
    });
  }

  async _processEvaluationQueue() {
    // Prevent multiple concurrent evaluations
    if (this._evaluationInProgress) {
      logger.debug('Feature evaluation already in progress, queueing...');
      return;
    }

    if (this._evaluationQueue.length === 0) {
      return;
    }

    // Get all pending requests
    const requests = [...this._evaluationQueue];
    this._evaluationQueue = [];

    const reasons = requests.map(r => r.reason).join(', ');
    logger.debug(`Processing ${requests.length} queued feature evaluation requests (reasons: ${reasons})`);

    this._evaluationInProgress = true;

    try {
      // Order matters: contentMessageHandler should be evaluated first
      // selectElement is managed directly by FeatureManager with its own Critical Protection
      const features = ['contentMessageHandler', 'selectElement', 'windowsManager', 'textSelection', 'textFieldIcon', 'shortcut'];

      logger.debug('Re-evaluating all features');

      for (const feature of features) {
        const shouldBeActive = await this.shouldActivateFeature(feature);
        const isCurrentlyActive = this.activeFeatures.has(feature);

        logger.debug(`Feature ${feature}: shouldBeActive=${shouldBeActive}, isCurrentlyActive=${isCurrentlyActive}`);

        if (shouldBeActive && !isCurrentlyActive) {
          await this.activateFeature(feature);
        } else if (!shouldBeActive && isCurrentlyActive) {
          logger.debug(`About to deactivate feature: ${feature}`);
          await this.deactivateFeature(feature);
        }
      }

      logger.debug('Feature re-evaluation complete', {
        activeFeatures: Array.from(this.activeFeatures),
        processedRequests: requests.length
      });

      // Resolve all pending requests
      requests.forEach(request => request.resolve());

    } catch (error) {
      logger.error('Feature re-evaluation failed:', error);
      // Reject all pending requests
      requests.forEach(request => request.reject(error));
    } finally {
      this._evaluationInProgress = false;

      // Process any new requests that came in during evaluation
      if (this._evaluationQueue.length > 0) {
        setTimeout(() => this._processEvaluationQueue(), 50);
      }
    }
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
      await this.reevaluateFeatures('url-change');
      
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
    await this.reevaluateFeatures('manual-refresh');
  }

  getStatus() {
    return {
      initialized: this.initialized,
      activeFeatures: Array.from(this.activeFeatures),
      totalHandlers: this.featureHandlers.size,
      exclusionStatus: this.exclusionChecker.getFeatureStatus()
    };
  }


  // Smart cleanup during memory pressure - only deactivate non-critical features
  performSmartCleanup() {
    try {
      logger.debug('FeatureManager performing smart cleanup during memory pressure');

      // Define critical features that should NEVER be cleaned up during memory pressure
      const criticalFeatures = new Set([
        'selectElement',        // Active translation mode should persist
        'contentMessageHandler', // Core messaging must remain active
        'textSelection',        // Text selection should remain active
        'textFieldIcon',        // Text field icons should remain active for UX consistency
        'shortcut'              // Keyboard shortcuts should remain active for UX consistency
      ]);

      // Define optional features that can be cleaned up to free memory
      const optionalFeatures = new Set([
        // No optional features currently - all features are critical for UX
      ]);

      // Only deactivate optional features, preserve critical ones
      const activeFeatures = Array.from(this.activeFeatures);
      for (const feature of activeFeatures) {
        if (optionalFeatures.has(feature)) {
          logger.debug(`Smart cleanup: deactivating optional feature '${feature}'`);
          this.deactivateFeature(feature).catch(error => {
            logger.error(`Error deactivating optional feature ${feature} during smart cleanup:`, error);
          });
        } else if (criticalFeatures.has(feature)) {
          logger.debug(`Smart cleanup: preserving critical feature '${feature}'`);
        } else {
          logger.debug(`Smart cleanup: unknown feature '${feature}' - preserving by default`);
        }
      }

      logger.debug('FeatureManager smart cleanup completed');

    } catch (error) {
      logger.error('Error during FeatureManager smart cleanup:', error);
    }
  }

  // Override cleanup to handle settings listener (for full shutdown)
  cleanup() {
    try {
      // Clear debounce timer
      if (this._evaluationDebounceTimer) {
        clearTimeout(this._evaluationDebounceTimer);
        this._evaluationDebounceTimer = null;
      }

      // Clear evaluation queue
      this._evaluationQueue = [];

      if (this.settingsListener) {
        storageManager.off('change', this.settingsListener);
        this.settingsListener = null;
      }

      // Deactivate all features (full cleanup, not smart cleanup)
      const activeFeatures = Array.from(this.activeFeatures);
      for (const feature of activeFeatures) {
        this.deactivateFeature(feature).catch(error => {
          logger.error(`Error deactivating feature ${feature} during cleanup:`, error);
        });
      }

      super.cleanup();
      logger.debug('FeatureManager full cleanup completed');

    } catch (error) {
      logger.error('Error during FeatureManager cleanup:', error);
    }
  }
}

export default FeatureManager;