/**
 * Unified Logging System for Translate-It Extension
 *
 * Features:
 * - Environment-aware logging (development vs production)
 * - Consistent log formatting
 * - Component-based log grouping
 * - Performance-conscious logging
 * - Easy to disable/enable per component
 */

import { LOG_LEVELS, LOG_COMPONENTS } from "./logConstants.js";

// Development environment detection
const isDevelopment = process.env.NODE_ENV === "development";

// Global log level - can be overridden per component
let globalLogLevel = isDevelopment ? 3 : 1; // DEBUG : WARN

// Component-specific log levels
const componentLogLevels = {
  // ERROR = 0
  // WARN = 1
  // INFO = 2
  // DEBUG = 3
  Background: LOG_LEVELS.INFO,    // عملیات مهم service worker
  Content: LOG_LEVELS.DEBUG,      // جزئیات DOM manipulation  
  Messaging: LOG_LEVELS.WARN,     // فقط مشکلات communication
  Providers: LOG_LEVELS.INFO,     // API calls و نتایج
  UI: LOG_LEVELS.WARN,           // فقط خطاهای UI
  Storage: LOG_LEVELS.INFO,       // عملیات persistence
  Capture: LOG_LEVELS.DEBUG,      // جزئیات image processing
  Error: LOG_LEVELS.ERROR,        // همیشه نمایش خطاها
};

/**
 * Format log message with timestamp and component info
 */
function formatMessage(component, level, message, data) {
  const timestamp = new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const prefix = `[${timestamp}] ${component}:`;

  if (data && typeof data === "object") {
    return [prefix, message, data];
  }
  return [prefix, message, data].filter(Boolean);
}

/**
 * Check if logging is enabled for this component and level
 */
function shouldLog(component, level) {
  const componentLevel = componentLogLevels[component] ?? globalLogLevel;
  return level <= componentLevel;
}

/**
 * Create a logger for a specific component
 */
export function createLogger(component, subComponent = null) {
  const loggerName = subComponent ? `${component}.${subComponent}` : component;

  return {
    error: (message, data) => {
      const ERROR_LEVEL = 0; // LOG_LEVELS.ERROR
      if (shouldLog(component, ERROR_LEVEL)) {
        const formatted = formatMessage(loggerName, ERROR_LEVEL, message, data);
        console.error(...formatted);
      }
    },

    warn: (message, data) => {
      const WARN_LEVEL = 1; // LOG_LEVELS.WARN
      if (shouldLog(component, WARN_LEVEL)) {
        const formatted = formatMessage(loggerName, WARN_LEVEL, message, data);
        console.warn(...formatted);
      }
    },

    info: (message, data) => {
      const INFO_LEVEL = 2; // LOG_LEVELS.INFO
      if (shouldLog(component, INFO_LEVEL)) {
        const formatted = formatMessage(loggerName, INFO_LEVEL, message, data);
        console.info(...formatted);
      }
    },

    debug: (message, data) => {
      const DEBUG_LEVEL = 3; // LOG_LEVELS.DEBUG
      if (shouldLog(component, DEBUG_LEVEL)) {
        const formatted = formatMessage(loggerName, DEBUG_LEVEL, message, data);
        console.log(...formatted);
      }
    },

    // Special method for initialization logs (always important)
    init: (message, data) => {
      const INFO_LEVEL = 2; // LOG_LEVELS.INFO
      if (isDevelopment || shouldLog(component, INFO_LEVEL)) {
        const formatted = formatMessage(
          loggerName,
          INFO_LEVEL,
          `✅ ${message}`,
          data
        );
        console.log(...formatted);
      }
    },

    // Special method for cleanup/important operations
    operation: (message, data) => {
      const INFO_LEVEL = 2; // LOG_LEVELS.INFO
      if (shouldLog(component, INFO_LEVEL)) {
        const formatted = formatMessage(loggerName, INFO_LEVEL, message, data);
        console.log(...formatted);
      }
    },
  };
}

/**
 * Update log level for a component or globally
 */
export function setLogLevel(component, level) {
  if (component === "global") {
    globalLogLevel = level;
  } else {
    componentLogLevels[component] = level;
  }
}

/**
 * Get current log level for a component
 */
export function getLogLevel(component) {
  return componentLogLevels[component] ?? globalLogLevel;
}

/**
 * Performance-aware logging for initialization sequences
 */
export function logInitSequence(component, steps) {
  const INFO_LEVEL = 2;
  if (!isDevelopment && !shouldLog(component, INFO_LEVEL)) {
    return;
  }

  const logger = createLogger(component);
  logger.info("Initialization sequence started");

  steps.forEach((step, index) => {
    logger.debug(`Step ${index + 1}: ${step}`);
  });
}

/**
 * Quick loggers for common components (created on-demand)
 */
export const quickLoggers = {
  getBackground: () => createLogger("Background"),
  getContent: () => createLogger("Content"),
  getMessaging: () => createLogger("Messaging"),
  getProviders: () => createLogger("Providers"),
  getUI: () => createLogger("UI"),
  getStorage: () => createLogger("Storage"),
  getCapture: () => createLogger("Capture"),
  getError: () => createLogger("Error"),
};
