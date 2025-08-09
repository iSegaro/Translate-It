// Centralized logging constants to avoid circular import / TDZ issues

export const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

export const LOG_COMPONENTS = {
  CORE: 'Core',
  CONTENT: 'Content',
  MESSAGING: 'Messaging',
  TRANSLATION: 'Translation',
  UI: 'UI',
  STORAGE: 'Storage',
};

export default {
  LOG_LEVELS,
  LOG_COMPONENTS,
};
