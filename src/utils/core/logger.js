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

import { LOG_LEVELS } from "./logConstants.js";

// Development environment detection
const isDevelopment = process.env.NODE_ENV === "development";

// (Instrumentation removed after stabilization)

// Global log level - can be overridden per component
let globalLogLevel = isDevelopment ? 3 : 1; // DEBUG : WARN

// Component-specific log levels (production defaults)
// ERROR = 0 | WARN = 1 | INFO = 2 | DEBUG = 3
// Keep noise low in UI & content paths while retaining Info for core/background workflows.
const componentLogLevels = {
  Background: LOG_LEVELS.INFO,
  Core: LOG_LEVELS.INFO,
  Content: LOG_LEVELS.WARN,
  Translation: LOG_LEVELS.INFO,
  Messaging: LOG_LEVELS.WARN,
  Providers: LOG_LEVELS.INFO,
  UI: LOG_LEVELS.WARN,
  Storage: LOG_LEVELS.WARN,
  Capture: LOG_LEVELS.INFO,
  Error: LOG_LEVELS.INFO,
};

// Lazily-initialized cache stored on globalThis to avoid ANY module-level TDZ during circular evaluation.
// Using globalThis also guarantees a single cache across multiple bundled copies (if that ever occurs).
function __getLoggerCache() {
  const g = globalThis;
  if (!g.__TRANSLATE_IT__) {
    Object.defineProperty(g, '__TRANSLATE_IT__', { value: {}, configurable: true });
  }
  if (!g.__TRANSLATE_IT__.__LOGGER_CACHE || !(g.__TRANSLATE_IT__.__LOGGER_CACHE instanceof Map)) {
    g.__TRANSLATE_IT__.__LOGGER_CACHE = new Map();
  }
  return g.__TRANSLATE_IT__.__LOGGER_CACHE;
}
// (Devtools helper removed for production cleanliness)
const __initialComponentLevels = { ...componentLogLevels };

/**
 * Get (cached) scoped logger. Use this instead of ad-hoc singleton patterns.
 * @param {string} component One of LOG_COMPONENTS.* values
 * @param {string|null} subComponent Optional sub-scope (e.g. specific strategy or feature)
 */
export function getScopedLogger(component, subComponent = null) {
  // Pure implementation: always go through global cache accessor (fully lazy & TDZ-proof)
  const cache = __getLoggerCache();
  const key = subComponent ? `${component}::${subComponent}` : component;
  if (!cache.has(key)) cache.set(key, createLogger(component, subComponent));
  return cache.get(key);
}

// Introspection helper (mainly for debugging / devtools)
export function listLoggerLevels() {
  return { global: globalLogLevel, components: { ...componentLogLevels } };
}

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

/**
 * Test-only helper to reset logging system state (cache + levels).
 * Exposed with a double underscore prefix to discourage production use.
 */
export function __resetLoggingSystemForTests() {
  __getLoggerCache().clear(); // global cache
  // Reset component-specific levels to their original values
  Object.keys(componentLogLevels).forEach((k) => delete componentLogLevels[k]);
  Object.assign(componentLogLevels, { ...__initialComponentLevels });
  globalLogLevel = isDevelopment ? 3 : 1;
}
