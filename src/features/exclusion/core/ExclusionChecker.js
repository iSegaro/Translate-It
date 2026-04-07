import { settingsManager } from '@/shared/managers/SettingsManager.js';
import { utilsFactory } from '@/utils/UtilsFactory.js';
import { checkUrlExclusionAsync } from '../utils/exclusion-utils.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { deviceDetector } from '@/utils/browser/compatibility.js';
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js';
import { pageEventBus } from '@/core/PageEventBus.js';

const logger = getScopedLogger(LOG_COMPONENTS.EXCLUSION, 'ExclusionChecker');

// Singleton instance for ExclusionChecker
let exclusionCheckerInstance = null;

export class ExclusionChecker {
  constructor() {
    // Enforce singleton pattern
    if (exclusionCheckerInstance) {
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
      // Initialize settings from SettingsManager
      await settingsManager.initialize();

      // Setup settings change listeners (only once)
      if (!this.listenersSetup) {
        this.setupSettingsListeners();
        this.listenersSetup = true;
      }

      this.initialized = true;
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
      await settingsManager.initialize();
    } catch (error) {
      logger.error('Error refreshing ExclusionChecker settings:', error);
    }
  }

  updateUrl(newUrl) {
    if (this.currentUrl !== newUrl) {
      this.currentUrl = newUrl;
    }
  }

  /**
   * Setup settings change listeners for reactive updates
   */
  setupSettingsListeners() {
    try {
      // Listen for feature-specific setting changes
      const featureSettings = [
        'TRANSLATE_WITH_SELECT_ELEMENT',
        'TRANSLATE_ON_TEXT_SELECTION',
        'TRANSLATE_ON_TEXT_FIELDS',
        'ENABLE_SHORTCUT_FOR_TEXT_FIELDS',
        'SHOW_DESKTOP_FAB',
        'EXTENSION_ENABLED',
        'WHOLE_PAGE_TRANSLATION_ENABLED'
      ];

      featureSettings.forEach(setting => {
        this.settingsListeners.push(
          settingsManager.onChange(setting, () => {
            this.refreshFeaturesOnSettingsChange();
          }, 'exclusion-checker')
        );
      });

      // Listen for EXCLUDED_SITES changes
      this.settingsListeners.push(
        settingsManager.onChange('EXCLUDED_SITES', () => {
          this.refreshFeaturesOnSettingsChange();
        }, 'exclusion-checker')
      );

    } catch (error) {
      logger.error('Failed to setup settings listeners:', error);
    }
  }

  /**
   * Refresh features when settings change
   * Emits event for UI components to react
   */
  refreshFeaturesOnSettingsChange() {
    // Notify system that feature status might have changed
    pageEventBus.emit('FEATURE_STATUS_CHANGED');
    logger.debug('Feature status change event emitted');
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
      const excludedSites = settingsManager.get('EXCLUDED_SITES', []);

      if (featureName === 'textFieldIcon') {
        return isUrlExcluded_TEXT_FIELDS_ICON(this.currentUrl, excludedSites);
      }

      return isUrlExcluded(this.currentUrl, excludedSites);
    } catch (error) {
      logger.error('Error checking URL exclusion:', error);
      return true;
    }
  }

  async getFeatureStatus() {
    if (!this.initialized) {
      await this.initialize();
    }

    const features = ['contentMessageHandler', 'selectElement', 'textSelection', 'textFieldIcon', 'shortcut', 'windowsManager', 'pageTranslation'];
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
    this.settingsListeners.forEach(unsubscribe => {
      if (unsubscribe) unsubscribe();
    });
    this.settingsListeners = [];
    this.listenersSetup = false;
  }

  // Static method to check if feature should be considered for a URL
  static async shouldConsiderFeature(featureName, url) {
    const isExcluded = await checkUrlExclusionAsync(url);
    if (isExcluded) return false;

    try {
      const { isUrlExcluded_TEXT_FIELDS_ICON } = await utilsFactory.getUIUtils();
      if (featureName === 'textFieldIcon') {
        return !isUrlExcluded_TEXT_FIELDS_ICON(url);
      }
    } catch (error) {
      logger.error('Error in shouldConsiderFeature:', error);
      return false;
    }

    return true;
  }
}

export default ExclusionChecker;