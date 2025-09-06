// Centralized logging constants to avoid circular import / TDZ issues

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
  TTS: 'TTS',                     // src/features/tts/
  SCREEN_CAPTURE: 'ScreenCapture', // src/features/screen-capture/
  ELEMENT_SELECTION: 'ElementSelection', // src/features/element-selection/
  TEXT_ACTIONS: 'TextActions',    // src/features/text-actions/
  SUBTITLE: 'Subtitle',           // src/features/subtitle/
  HISTORY: 'History',             // src/features/history/
  SETTINGS: 'Settings',           // src/features/settings/
  WINDOWS: 'Windows',             // src/features/windows/

  // سیستم‌های مشترک
  MESSAGING: 'Messaging',         // src/shared/messaging/
  STORAGE: 'Storage',             // src/shared/storage/
  ERROR: 'Error',                 // src/shared/error-management/
  CONFIG: 'Config',               // src/shared/config/
  MEMORY: 'Memory',               // src/core/memory/

  // ابزارها و utilities
  UTILS: 'Utils',                 // src/utils/
  BROWSER: 'Browser',             // src/utils/browser/
  TEXT: 'Text',                   // src/utils/text/
  FRAMEWORK: 'Framework',         // src/utils/framework/

  // Providers (زیرمجموعه Translation)
  PROVIDERS: 'Providers',         // src/features/translation/providers/

  // Legacy aliases (برای backward compatibility)
  CAPTURE: 'ScreenCapture',       // Legacy alias for SCREEN_CAPTURE
};

export default {
  LOG_LEVELS,
  LOG_COMPONENTS,
};
