// src/core/managers/content/FeatureConfig.js

import { MOBILE_CONSTANTS } from '@/shared/constants/mobile.js';
import { deviceDetector } from '@/utils/browser/compatibility.js';

/**
 * Central configuration for all extension features.
 * Defines mapping between feature names and their governing settings.
 */
export const FEATURE_CONFIG = {
  contentMessageHandler: {
    alwaysEnabled: true,
  },
  
  textSelection: {
    settings: ['TRANSLATE_ON_TEXT_SELECTION', 'SHOW_DESKTOP_FAB', 'MOBILE_UI_MODE'],
    // Custom logic for enablement
    isEnabled: (get) => {
      const mobileMode = get('MOBILE_UI_MODE', MOBILE_CONSTANTS.UI_MODE.AUTO);
      const isMobileUI = mobileMode === MOBILE_CONSTANTS.UI_MODE.MOBILE || 
                        (mobileMode === MOBILE_CONSTANTS.UI_MODE.AUTO && deviceDetector.shouldEnableMobileUI());
      
      return get('TRANSLATE_ON_TEXT_SELECTION', true) || 
             get('SHOW_DESKTOP_FAB', true) || 
             isMobileUI;
    }
  },

  windowsManager: {
    // Shares the same logic as textSelection for now
    settings: ['TRANSLATE_ON_TEXT_SELECTION', 'SHOW_DESKTOP_FAB', 'MOBILE_UI_MODE'],
    isEnabled: (get) => {
      const mobileMode = get('MOBILE_UI_MODE', MOBILE_CONSTANTS.UI_MODE.AUTO);
      const isMobileUI = mobileMode === MOBILE_CONSTANTS.UI_MODE.MOBILE || 
                        (mobileMode === MOBILE_CONSTANTS.UI_MODE.AUTO && deviceDetector.shouldEnableMobileUI());
      
      return get('TRANSLATE_ON_TEXT_SELECTION', true) || 
             get('SHOW_DESKTOP_FAB', true) || 
             isMobileUI;
    }
  },

  selectElement: {
    settings: ['TRANSLATE_WITH_SELECT_ELEMENT'],
    settingKey: 'TRANSLATE_WITH_SELECT_ELEMENT'
  },

  textFieldIcon: {
    settings: ['TRANSLATE_ON_TEXT_SELECTION'],
    settingKey: 'TRANSLATE_ON_TEXT_SELECTION'
  },

  shortcut: {
    settings: ['ENABLE_SHORTCUT_FOR_TEXT_FIELDS'],
    settingKey: 'ENABLE_SHORTCUT_FOR_TEXT_FIELDS'
  },

  pageTranslation: {
    settings: ['WHOLE_PAGE_TRANSLATION_ENABLED', 'WHOLE_PAGE_AUTO_TRANSLATE_RULES'],
    settingKey: 'WHOLE_PAGE_TRANSLATION_ENABLED'
  },

  screenCapture: {
    settings: ['ENABLE_SCREEN_CAPTURE'],
    settingKey: 'ENABLE_SCREEN_CAPTURE'
  },

  mouseHover: {
    settings: ['MOUSE_HOVER_TRANSLATION_ENABLED'],
    settingKey: 'MOUSE_HOVER_TRANSLATION_ENABLED'
  }
};

/**
 * List of all valid feature names for easy iteration
 */
export const ALL_FEATURES = Object.keys(FEATURE_CONFIG);

/**
 * Extracts all unique setting keys that affect feature enablement
 */
export const RELEVANT_FEATURE_SETTINGS = Array.from(new Set(
  Object.values(FEATURE_CONFIG)
    .flatMap(cfg => cfg.settings || [])
    .concat(['EXTENSION_ENABLED', 'EXCLUDED_SITES'])
));
