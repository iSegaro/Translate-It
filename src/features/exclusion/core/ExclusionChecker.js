import { storageManager } from '@/shared/storage/core/StorageCore.js';
import { isUrlExcluded, isUrlExcluded_TEXT_FIELDS_ICON } from '@/utils/ui/exclusion.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'ExclusionChecker');

export class ExclusionChecker {
  constructor() {
    this.currentUrl = window.location.href;
    this.settings = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      logger.debug('Initializing ExclusionChecker for URL:', this.currentUrl);
      
      this.settings = await storageManager.get([
        'EXTENSION_ENABLED',
        'TRANSLATE_WITH_SELECT_ELEMENT', 
        'TRANSLATE_ON_TEXT_SELECTION',
        'TRANSLATE_ON_TEXT_FIELDS',
        'ENABLE_SHORTCUT_FOR_TEXT_FIELDS',
        'EXCLUDED_SITES'
      ]);

      this.initialized = true;
      logger.debug('ExclusionChecker initialized with settings:', Object.keys(this.settings));
      
    } catch (error) {
      const handler = ErrorHandler.getInstance();
      handler.handle(error, { 
        type: ErrorTypes.SERVICE, 
        context: 'ExclusionChecker-initialize',
        showToast: false 
      });
      
      // Fallback to defaults if storage fails
      this.settings = {
        EXTENSION_ENABLED: true,
        TRANSLATE_WITH_SELECT_ELEMENT: true,
        TRANSLATE_ON_TEXT_SELECTION: true,
        TRANSLATE_ON_TEXT_FIELDS: false,
        ENABLE_SHORTCUT_FOR_TEXT_FIELDS: true,
        EXCLUDED_SITES: []
      };
      
      this.initialized = true;
      logger.warn('ExclusionChecker initialized with fallback defaults due to error');
    }
  }

  async refreshSettings() {
    await this.initialize();
  }

  updateUrl(newUrl) {
    if (this.currentUrl !== newUrl) {
      logger.debug('URL changed from', this.currentUrl, 'to', newUrl);
      this.currentUrl = newUrl;
    }
  }

  async isFeatureAllowed(featureName) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Global extension check
      if (!this.settings.EXTENSION_ENABLED) {
        logger.debug(`Feature ${featureName} blocked: extension disabled globally`);
        return false;
      }
      
      // Feature-specific setting check
      if (!this.isFeatureEnabled(featureName)) {
        logger.debug(`Feature ${featureName} blocked: feature setting disabled`);
        return false;
      }
      
      // URL exclusion check
      if (this.isUrlExcludedForFeature(featureName)) {
        logger.debug(`Feature ${featureName} blocked: URL excluded`);
        return false;
      }

      logger.debug(`Feature ${featureName} allowed`);
      return true;
      
    } catch (error) {
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
    const featureSettingsMap = {
      'selectElement': 'TRANSLATE_WITH_SELECT_ELEMENT',
      'textSelection': 'TRANSLATE_ON_TEXT_SELECTION', 
      'textFieldIcon': 'TRANSLATE_ON_TEXT_FIELDS',
      'shortcut': 'ENABLE_SHORTCUT_FOR_TEXT_FIELDS',
      'windowsManager': 'TRANSLATE_ON_TEXT_SELECTION'
    };
    
    const settingKey = featureSettingsMap[featureName];
    if (!settingKey) {
      logger.warn(`Unknown feature name: ${featureName}`);
      return false;
    }
    
    return this.settings[settingKey] ?? false;
  }

  isUrlExcludedForFeature(featureName) {
    try {
      // Feature-specific exclusion logic
      if (featureName === 'textFieldIcon') {
        return isUrlExcluded_TEXT_FIELDS_ICON(this.currentUrl);
      }
      
      // General exclusion for other features
      return isUrlExcluded(this.currentUrl, this.settings.EXCLUDED_SITES || []);
      
    } catch (error) {
      logger.error('Error checking URL exclusion:', error);
      // Default to excluded on error for safety
      return true;
    }
  }

  getFeatureStatus() {
    if (!this.initialized) {
      return { initialized: false };
    }

    const features = ['selectElement', 'textSelection', 'textFieldIcon', 'shortcut', 'windowsManager'];
    const status = {
      initialized: true,
      url: this.currentUrl,
      globalEnabled: this.settings.EXTENSION_ENABLED,
      features: {}
    };

    features.forEach(feature => {
      status.features[feature] = {
        settingEnabled: this.isFeatureEnabled(feature),
        urlExcluded: this.isUrlExcludedForFeature(feature),
        allowed: this.settings.EXTENSION_ENABLED && 
                this.isFeatureEnabled(feature) && 
                !this.isUrlExcludedForFeature(feature)
      };
    });

    return status;
  }

  // Static method to check if feature should be considered for a URL
  static shouldConsiderFeature(featureName, url) {
    // Quick pre-check without full initialization
    // Useful for avoiding unnecessary content script loading
    
    if (featureName === 'textFieldIcon') {
      return !isUrlExcluded_TEXT_FIELDS_ICON(url);
    }
    
    // For other features, we need settings so return true
    // and let the full check happen after initialization
    return true;
  }
}

export default ExclusionChecker;