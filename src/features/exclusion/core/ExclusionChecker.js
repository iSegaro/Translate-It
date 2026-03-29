import { settingsManager } from '@/shared/managers/SettingsManager.js';
import { utilsFactory } from '@/utils/UtilsFactory.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { deviceDetector } from '@/utils/browser/compatibility.js';
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js';

const logger = getScopedLogger(LOG_COMPONENTS.EXCLUSION, 'ExclusionChecker');

// Singleton instance for ExclusionChecker
let exclusionCheckerInstance = null;

export class ExclusionChecker {
  constructor() {
    // Enforce singleton pattern
    if (exclusionCheckerInstance) {
      // Singleton exists - logged at TRACE level for detailed debugging
      // logger.debug('ExclusionChecker singleton already exists, returning existing instance');
      return exclusionCheckerInstance;
    }

    this.currentUrl = window.location.href;
    this.settings = null;
    this.initialized = false;
    this.settingsListeners = [];
    this.listenersSetup = false;

    // Store singleton instance
    exclusionCheckerInstance = this;
    logger.init('ExclusionChecker initialized at:', this.currentUrl);
  }

  // Static method to get singleton instance
  static getInstance() {
    if (!exclusionCheckerInstance) {
      exclusionCheckerInstance = new ExclusionChecker();
    }
    return exclusionCheckerInstance;
  }

  // Method to reset singleton (for testing or cleanup)
  static resetInstance() {
    if (exclusionCheckerInstance) {
      exclusionCheckerInstance.cleanup();
      exclusionCheckerInstance = null;
    }
  }

  async initialize() {
    try {
      // Initializing for URL - logged at TRACE level for detailed debugging
      // logger.debug('Initializing ExclusionChecker for URL:', this.currentUrl);

      // Initialize settings from SettingsManager
      await settingsManager.initialize();

      // Setup settings change listeners (only once)
      if (!this.listenersSetup) {
        this.setupSettingsListeners();
        this.listenersSetup = true;
      }

      this.initialized = true;
      // ExclusionChecker initialized - logged at TRACE level for detailed debugging
      // logger.debug('ExclusionChecker initialized');

    } catch (error) {
      const handler = ErrorHandler.getInstance();
      handler.handle(error, {
        type: ErrorTypes.SERVICE,
        context: 'ExclusionChecker-initialize',
        showToast: false
      });

      this.initialized = true;
      logger.warn('ExclusionChecker initialized with fallback defaults due to error');
    }
  }

  async refreshSettings() {
    try {
      // Just refresh settings without full reinitialization
      await settingsManager.initialize();
      // Settings refreshed - logged at TRACE level for detailed debugging
      // logger.debug('ExclusionChecker settings refreshed');
    } catch (error) {
      logger.error('Error refreshing ExclusionChecker settings:', error);
    }
  }

  updateUrl(newUrl) {
    if (this.currentUrl !== newUrl) {
      // URL changed - logged at TRACE level for detailed debugging
      // logger.debug('URL changed from', this.currentUrl, 'to', newUrl);
      this.currentUrl = newUrl;
    }
  }

  /**
   * Setup settings change listeners for reactive updates
   */
  setupSettingsListeners() {
    try {
      // Note: EXTENSION_ENABLED listener is handled by FeatureManager
      // We don't need to duplicate it here as FeatureManager will trigger re-evaluation

      // Listen for feature-specific setting changes
      const featureSettings = [
        'TRANSLATE_WITH_SELECT_ELEMENT',
        'TRANSLATE_ON_TEXT_SELECTION',
        'TRANSLATE_ON_TEXT_FIELDS',
        'ENABLE_SHORTCUT_FOR_TEXT_FIELDS',
        'SHOW_DESKTOP_FAB'
      ];

      featureSettings.forEach(setting => {
        this.settingsListeners.push(
          settingsManager.onChange(setting, () => {
            // Setting changed - logged at TRACE level for detailed debugging
            // logger.debug(`${setting} changed, refreshing features:`, newValue);
            this.refreshFeaturesOnSettingsChange();
          }, 'exclusion-checker')
        );
      });

      // Listen for EXCLUDED_SITES changes
      this.settingsListeners.push(
        settingsManager.onChange('EXCLUDED_SITES', () => {
          // EXCLUDED_SITES changed - logged at TRACE level for detailed debugging
          // logger.debug('EXCLUDED_SITES changed, refreshing features:', newValue);
          this.refreshFeaturesOnSettingsChange();
        }, 'exclusion-checker')
      );

    } catch (error) {
      logger.error('Failed to setup settings listeners:', error);
    }
  }

  /**
   * Refresh features when settings change
   * Note: FeatureManager handles its own re-evaluation through its settings listener
   */
  refreshFeaturesOnSettingsChange() {
    // Just refresh internal settings cache - FeatureManager will handle re-evaluation
    // Settings changed - logged at TRACE level for detailed debugging
    // logger.debug('Settings changed, refreshing exclusion cache');
    // No need to trigger FeatureManager - it has its own debounced evaluation system
  }

  async isFeatureAllowed(featureName) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Global extension check
      const isExtensionEnabled = settingsManager.get('EXTENSION_ENABLED', true);
      if (!isExtensionEnabled) {
        logger.debug(`Feature ${featureName} blocked: extension disabled globally`);
        return false;
      }

      // Feature-specific setting check
      const featureEnabled = this.isFeatureEnabled(featureName);
      if (!featureEnabled) {
        logger.debug(`Feature ${featureName} blocked: feature setting disabled`);
        return false;
      }

      // URL exclusion check
      const urlExcluded = await this.isUrlExcludedForFeature(featureName);
      if (urlExcluded) {
        logger.debug(`Feature ${featureName} blocked: URL excluded`);
        return false;
      }

      logger.debug(`Feature ${featureName} allowed`);
      return true;

    } catch (error) {
      logger.error(`Error in isFeatureAllowed for ${featureName}:`, error);
      const handler = ErrorHandler.getInstance();
      handler.handle(error, {
        type: ErrorTypes.SERVICE,
        context: `ExclusionChecker-isFeatureAllowed-${featureName}`,
        showToast: false
      });

      // Default to blocked on error for safety
      return false;
    }
  }

  isFeatureEnabled(featureName) {
    // Core features that are always enabled
    if (featureName === 'contentMessageHandler') {
      return true;
    }

    const isFabEnabled = settingsManager.get('SHOW_DESKTOP_FAB', true);
    const isTextSelectionEnabled = settingsManager.get('TRANSLATE_ON_TEXT_SELECTION', true);
    
    // Check if we are in mobile mode (manually forced or auto-detected)
    const mobileMode = settingsManager.get('MOBILE_UI_MODE', MOBILE_CONSTANTS.UI_MODE.AUTO);
    const isMobileUI = mobileMode === MOBILE_CONSTANTS.UI_MODE.MOBILE || 
                      (mobileMode === MOBILE_CONSTANTS.UI_MODE.AUTO && deviceDetector.shouldEnableMobileUI());

    // Feature-specific activation logic
    switch (featureName) {
      case 'textSelection':
      case 'windowsManager':
        // These features are required if:
        // 1. Automatic translation is on
        // 2. OR the Desktop FAB is active
        // 3. OR we are in Mobile mode (where FAB is always active for interaction)
        return isTextSelectionEnabled || isFabEnabled || isMobileUI;

      case 'selectElement':
        return settingsManager.get('TRANSLATE_WITH_SELECT_ELEMENT', true);

      case 'textFieldIcon':
        return isTextSelectionEnabled;

      case 'shortcut':
        return settingsManager.get('ENABLE_SHORTCUT_FOR_TEXT_FIELDS', true);

      case 'pageTranslation':
        return settingsManager.get('WHOLE_PAGE_TRANSLATION_ENABLED', true);

      default:
        return false;
    }
  }

  async isUrlExcludedForFeature(featureName) {
    try {
      const { isUrlExcluded, isUrlExcluded_TEXT_FIELDS_ICON } = await utilsFactory.getUIUtils();

      // Get excluded sites list for all features
      const excludedSites = settingsManager.get('EXCLUDED_SITES', []);

      // Feature-specific exclusion logic
      if (featureName === 'textFieldIcon') {
        return isUrlExcluded_TEXT_FIELDS_ICON(this.currentUrl, excludedSites);
      }

      // General exclusion for other features
      return isUrlExcluded(this.currentUrl, excludedSites);

    } catch (error) {
      logger.error('Error checking URL exclusion:', error);
      // Default to excluded on error for safety
      return true;
    }
  }

  async getFeatureStatus() {
    if (!this.initialized) {
      return { initialized: false };
    }

    const features = ['contentMessageHandler', 'selectElement', 'textSelection', 'textFieldIcon', 'shortcut', 'windowsManager'];
    const isExtensionEnabled = settingsManager.get('EXTENSION_ENABLED', true);
    const status = {
      initialized: true,
      url: this.currentUrl,
      globalEnabled: isExtensionEnabled,
      features: {}
    };

    for (const feature of features) {
      const featureEnabled = this.isFeatureEnabled(feature);
      const urlExcluded = await this.isUrlExcludedForFeature(feature);
      status.features[feature] = {
        settingEnabled: featureEnabled,
        urlExcluded: urlExcluded,
        allowed: isExtensionEnabled && featureEnabled && !urlExcluded
      };
    }

    return status;
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    // Remove all settings listeners
    this.settingsListeners.forEach(unsubscribe => {
      if (unsubscribe) unsubscribe();
    });
    this.settingsListeners = [];
    this.listenersSetup = false;

    // Cleanup completed - logged at TRACE level for detailed debugging
    // logger.debug('ExclusionChecker cleaned up');
  }

  // Static method to check if feature should be considered for a URL
  static async shouldConsiderFeature(featureName, url) {
    // Quick pre-check without full initialization
    // Useful for avoiding unnecessary content script loading
    try {
      const { isUrlExcluded_TEXT_FIELDS_ICON } = await utilsFactory.getUIUtils();
      if (featureName === 'textFieldIcon') {
        return !isUrlExcluded_TEXT_FIELDS_ICON(url);
      }
    } catch (error) {
      logger.error('Error in shouldConsiderFeature:', error);
      return false; // On error, assume feature should not be considered
    }

    // For other features, we need settings so return true
    // and let the full check happen after initialization
    return true;
  }
}

export default ExclusionChecker;