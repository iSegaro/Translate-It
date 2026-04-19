// Centralized logging constants for the extension

export const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

export const LOG_COMPONENTS = {
  // لایه‌های اصلی
  BACKGROUND: 'Background',       // src/core/background/
  CONTENT: 'Content',             // src/core/content-scripts/
  CORE: 'Core',                   // src/core/ (به جز background و content-scripts)

  // اپلیکیشن‌ها و UI
  UI: 'UI',                       // src/apps/ و src/components/
  POPUP: 'Popup',                 // src/apps/popup/
  SIDEPANEL: 'Sidepanel',         // src/apps/sidepanel/
  OPTIONS: 'Options',             // src/apps/options/

  // Features
  TRANSLATION: 'Translation',     // src/features/translation/
  PAGE_TRANSLATION: 'PageTranslation', // src/features/page-translation/
  TTS: 'TTS',                     // src/features/tts/
  SCREEN_CAPTURE: 'ScreenCapture', // src/features/screen-capture/
  ELEMENT_SELECTION: 'ElementSelection', // src/features/element-selection/
  TEXT_SELECTION: 'TextSelection', // src/features/text-selection/
  TEXT_ACTIONS: 'TextActions',    // src/features/text-actions/
  TEXT_FIELD_INTERACTION: 'TextFieldInteraction', // src/features/text-field-interaction/
  NOTIFICATIONS: 'Notifications', // src/features/notifications/
  IFRAME: 'IFrame',               // src/features/iframe-support/
  SHORTCUTS: 'Shortcuts',         // src/features/shortcuts/
  EXCLUSION: 'Exclusion',         // src/features/exclusion/
  SUBTITLE: 'Subtitle',           // src/features/subtitle/
  HISTORY: 'History',             // src/features/history/
  SETTINGS: 'Settings',           // src/features/settings/
  WINDOWS: 'Windows',             // src/features/windows/

  // Mobile
  MOBILE: 'Mobile',               // src/features/mobile/
  DESKTOP_FAB: 'DesktopFab',      // src/apps/content/components/desktop/

  // Content Applications
  CONTENT_APP: 'ContentApp',      // src/apps/content/
  
  // سیستم‌های مشترک
  PROXY: 'Proxy',                 // src/shared/proxy/
  MESSAGING: 'Messaging',         // src/shared/messaging/
  STORAGE: 'Storage',             // src/shared/storage/
  ERROR: 'Error',                 // src/shared/error-management/
  CONFIG: 'Config',               // src/shared/config/
  MEMORY: 'Memory',               // src/core/memory/

  // ابزارها و utilities
  UTILS: 'Utils',                 // src/utils/
  BROWSER: 'Browser',             // src/utils/browser/
  TEXT: 'Text',                   // src/utils/text/
  I18N: 'I18n',                   // src/utils/i18n/
  FRAMEWORK: 'Framework',         // src/utils/framework/
  LEGACY: 'Legacy',               // Legacy compatibility code

  // Providers (زیرمجموعه Translation)
  PROVIDERS: 'Providers',         // src/features/translation/providers/

  // Legacy aliases (برای backward compatibility)
  CAPTURE: 'ScreenCapture',       // Legacy alias for SCREEN_CAPTURE
};

export const LOG_CATEGORIES = {
  CORE: {
    label: 'Core System',
    components: [LOG_COMPONENTS.BACKGROUND, LOG_COMPONENTS.CONTENT, LOG_COMPONENTS.CORE]
  },
  UI: {
    label: 'User Interface',
    components: [LOG_COMPONENTS.UI, LOG_COMPONENTS.POPUP, LOG_COMPONENTS.OPTIONS, LOG_COMPONENTS.SIDEPANEL, LOG_COMPONENTS.CONTENT_APP]
  },
  FEATURES: {
    label: 'Features',
    components: [
      LOG_COMPONENTS.WINDOWS, LOG_COMPONENTS.ELEMENT_SELECTION, LOG_COMPONENTS.TEXT_FIELD_INTERACTION,
      LOG_COMPONENTS.TEXT_ACTIONS, LOG_COMPONENTS.TEXT_SELECTION, LOG_COMPONENTS.TRANSLATION,
      LOG_COMPONENTS.PAGE_TRANSLATION, LOG_COMPONENTS.SHORTCUTS, LOG_COMPONENTS.EXCLUSION,
      LOG_COMPONENTS.SCREEN_CAPTURE, LOG_COMPONENTS.SUBTITLE, LOG_COMPONENTS.TTS,
      LOG_COMPONENTS.MOBILE, LOG_COMPONENTS.DESKTOP_FAB
    ]
  },
  SERVICES: {
    label: 'Services & Utilities',
    components: [
      LOG_COMPONENTS.BROWSER, LOG_COMPONENTS.CONFIG, LOG_COMPONENTS.ERROR, LOG_COMPONENTS.FRAMEWORK,
      LOG_COMPONENTS.I18N, LOG_COMPONENTS.IFRAME, LOG_COMPONENTS.MEMORY, LOG_COMPONENTS.MESSAGING,
      LOG_COMPONENTS.NOTIFICATIONS, LOG_COMPONENTS.PROXY, LOG_COMPONENTS.PROVIDERS,
      LOG_COMPONENTS.TEXT, LOG_COMPONENTS.UTILS
    ]
  },
  DATA: {
    label: 'Data & Configuration',
    components: [LOG_COMPONENTS.HISTORY, LOG_COMPONENTS.LEGACY, LOG_COMPONENTS.SETTINGS, LOG_COMPONENTS.STORAGE]
  }
};

export default {
  LOG_LEVELS,
  LOG_COMPONENTS,
  LOG_CATEGORIES,
};
