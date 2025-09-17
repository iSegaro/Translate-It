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

import { LOG_LEVELS } from './logConstants.js';

// Development environment detection
const isDevelopment = process.env.NODE_ENV === "development";

// (Instrumentation removed after stabilization)

// Global log level - can be overridden per component
let globalLogLevel = isDevelopment ? 3 : 1; // DEBUG : WARN

// Runtime global debug override (when true, all debug logs are enabled regardless of per-component level)
let __runtimeDebugOverride = false;

export function enableGlobalDebug() { __runtimeDebugOverride = true; }
export function disableGlobalDebug() { __runtimeDebugOverride = false; }
export function isGlobalDebugEnabled() { return __runtimeDebugOverride; }

// Component-specific log levels (production defaults)
// ERROR = 0 | WARN = 1 | INFO = 2 | DEBUG = 3
// Keep noise low in UI & content paths while retaining Info for core/background workflows.
const componentLogLevels = {
  // لایه‌های اصلی (Core layers)
  Background: LOG_LEVELS.DEBUG,  // background handlers
  Core: LOG_LEVELS.DEBUG,        // core handlers
  Content: LOG_LEVELS.DEBUG,     // Windows Manager and content scripts

  // اپلیکیشن‌ها و UI (Apps and UI)
  UI: LOG_LEVELS.INFO,           // UI composables
  Popup: LOG_LEVELS.INFO,        // Popup app
  Sidepanel: LOG_LEVELS.INFO,    // Sidepanel app
  Options: LOG_LEVELS.INFO,      // Options app

  // Features
  Translation: LOG_LEVELS.INFO,
  TTS: LOG_LEVELS.INFO,          // TTS feature
  ScreenCapture: LOG_LEVELS.INFO, // Screen capture feature
  ElementSelection: LOG_LEVELS.INFO, // Element selection feature
  TextActions: LOG_LEVELS.INFO,  // Text actions feature
  Subtitle: LOG_LEVELS.INFO,     // Subtitle feature
  History: LOG_LEVELS.INFO,      // History feature
  Settings: LOG_LEVELS.INFO,     // Settings feature
  Windows: LOG_LEVELS.INFO,      // Windows feature

  // سیستم‌های مشترک (Shared systems)
  Messaging: LOG_LEVELS.DEBUG,
  Storage: LOG_LEVELS.WARN,
  Error: LOG_LEVELS.INFO,
  Config: LOG_LEVELS.INFO,       // Config system
  Memory: LOG_LEVELS.INFO,       // Memory management system
  Proxy: LOG_LEVELS.DEBUG,      // Memory management system

  // ابزارها و utilities (Tools and utilities)
  Utils: LOG_LEVELS.INFO,       // Utilities
  Browser: LOG_LEVELS.INFO,     // Browser utils
  Text: LOG_LEVELS.INFO,        // Text utils
  Framework: LOG_LEVELS.INFO,   // Framework utils

  // Providers (زیرمجموعه Translation)
  Providers: LOG_LEVELS.INFO,

  // Legacy aliases (برای backward compatibility)
  Capture: LOG_LEVELS.INFO,      // Legacy alias for SCREEN_CAPTURE
};

// Freeze the initial shape to avoid accidental structural mutation; values still updated via setter.
Object.seal(componentLogLevels);

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

  // TODO: احتمال داره که اینجا مشکل داشته باشه و نیازی به این شرط نباشه، بدون بررسی های دقیق این شرط رو بعدا اضافه کرده ام
  // TODO: اگه مشکل در لاگ ها وجود داشته باشه ، باید این شرط رو بررسی کرد
  // If data is an Error, log it directly to preserve stack trace
  if (data instanceof Error) {
    return [prefix, message, data];
  }

  if (data && typeof data === "object") {
    return [prefix, message, JSON.stringify(data, null, 2)];
  }
  return [prefix, message, data].filter(Boolean);
}

/**
 * Check if logging is enabled for this component and level
 */
function shouldLog(component, level) {
  const componentLevel = componentLogLevels[component] ?? globalLogLevel;
  // If debug override active, allow all levels up to DEBUG (3)
  if (__runtimeDebugOverride) return level <= LOG_LEVELS.DEBUG;
  return level <= componentLevel;
}

// Fast helper specifically for debug gating (avoid recomputing numbers in callers if needed)
export function shouldDebug(component) {
  const componentLevel = componentLogLevels[component] ?? globalLogLevel;
  return __runtimeDebugOverride || componentLevel >= LOG_LEVELS.DEBUG;
}

/**
 * Create a logger for a specific component
 */
export function createLogger(component, subComponent = null) {
  const loggerName = subComponent ? `${component}.${subComponent}` : component;

  const loggerApi = {
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

    // Check if debug logging is enabled for this logger
    isDebugEnabled: () => {
      const componentLevel = componentLogLevels[component] ?? globalLogLevel;
      return __runtimeDebugOverride || componentLevel >= LOG_LEVELS.DEBUG;
    },

    // Lazy debug: accept function returning (message, data?) tuple or array of args
    debugLazy: (factory) => {
      const DEBUG_LEVEL = 3;
      if (!shouldLog(component, DEBUG_LEVEL)) return;
      try {
        const produced = factory();
        if (!produced) return;
        if (Array.isArray(produced)) {
          const [message, data] = produced;
          const formatted = formatMessage(loggerName, DEBUG_LEVEL, message, data);
          console.log(...formatted);
        } else if (typeof produced === 'object' && produced.message) {
          const formatted = formatMessage(loggerName, DEBUG_LEVEL, produced.message, produced.data);
          console.log(...formatted);
        } else {
          const formatted = formatMessage(loggerName, DEBUG_LEVEL, produced, undefined);
          console.log(...formatted);
        }
      } catch {
        // Swallow to avoid breaking app due to logging
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
    // Lazy info similar to debugLazy
    infoLazy: (factory) => {
      const INFO_LEVEL = 2;
      if (!shouldLog(component, INFO_LEVEL)) return;
      try {
        const produced = factory();
        if (!produced) return;
        if (Array.isArray(produced)) {
          const [message, data] = produced;
          const formatted = formatMessage(loggerName, INFO_LEVEL, message, data);
          console.info(...formatted);
        } else if (typeof produced === 'object' && produced.message) {
          const formatted = formatMessage(loggerName, INFO_LEVEL, produced.message, produced.data);
          console.info(...formatted);
        } else {
          const formatted = formatMessage(loggerName, INFO_LEVEL, produced, undefined);
          console.info(...formatted);
        }
      } catch {
        // Ignore console logging errors
      }
    },
  };
  return Object.freeze(loggerApi);
}

// --- Legacy Compatibility Layer (to be removed after refactor) -----------------
// Some existing modules still call getLogger() or logger.debug(). Provide shims so we
// can migrate incrementally without breaking lint/build.
export function getLogger(component, subComponent) {
  return getScopedLogger(component, subComponent);
}
try {
  if (!globalThis.getLogger) globalThis.getLogger = getLogger;
  if (!globalThis.logME) globalThis.logME = (...a) => { if (isDevelopment) console.log('[logME]', ...a); };
} catch { /* ignore global assignment issues */ }

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
