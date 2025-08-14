// Centralized logging constants to avoid circular import / TDZ issues

export const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

export const LOG_COMPONENTS = {
  BACKGROUND: 'Background',
  CONTENT: 'Content', 
  MESSAGING: 'Messaging',
  PROVIDERS: 'Providers',
  UI: 'UI',
  STORAGE: 'Storage',
  CAPTURE: 'Capture',
  ERROR: 'Error',
};

export default {
  LOG_LEVELS,
  LOG_COMPONENTS,
};
