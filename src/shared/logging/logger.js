/**
 * Unified Logging System for Translate-It Extension
 *
 * Features:
 * - Component-based log grouping
 * - Performance-conscious logging
 * - Easy to disable/enable per component
 * - TDZ-proof architecture
 */

import { LOG_LEVELS } from './logConstants.js';
import {
  getGlobalDebugState,
  getComponentLogLevel,
  getSharedLogLevelCache,
  incrementShouldLogCalls,
  incrementCacheHits,
  incrementCacheMisses,
  clearSharedLogLevelCache,
  getPerformanceStats,
  resetPerformanceStats
} from './GlobalDebugState.js';
import { safeConsole } from './SafeConsole.js';

// Cache size for LRU eviction
const MAX_CACHE_SIZE = 100;

// Logger cache stored on globalThis to avoid circular dependencies
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

// Clear log level cache on initialization to ensure fresh settings
clearSharedLogLevelCache();

/**
 * Helper function for lazy logging to reduce code duplication
 */
function createLazyLogMethod(component, loggerName, level, consoleMethod) {
  return (factory) => {
    if (!shouldLog(component, level)) return;
    try {
      const produced = factory();
      if (!produced) return;
      if (Array.isArray(produced)) {
        const [message, data] = produced;
        const formatted = formatMessage(loggerName, level, message, data);
        consoleMethod(...formatted);
      } else if (typeof produced === 'object' && produced.message) {
        const formatted = formatMessage(loggerName, level, produced.message, produced.data);
        consoleMethod(...formatted);
      } else {
        const formatted = formatMessage(loggerName, level, produced, undefined);
        consoleMethod(...formatted);
      }
    } catch {
      // Swallow to avoid breaking app due to logging
    }
  };
}

/**
 * Get (cached) scoped logger. Use this instead of ad-hoc singleton patterns.
 * @param {string} component One of LOG_COMPONENTS.* values
 * @param {string|null} subComponent Optional sub-scope (e.g. specific strategy or feature)
 */
export function getScopedLogger(component, subComponent = null) {
  const cache = __getLoggerCache();
  const key = subComponent ? `${component}::${subComponent}` : component;
  if (!cache.has(key)) cache.set(key, createLogger(component, subComponent));
  return cache.get(key);
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
  let msg = message;

  // Optimized: Only perform expensive string operations for ERROR (0) and WARN (1)
  if (level <= 1) {
    if (data && typeof data === 'object' && !(data instanceof Error)) {
      const summary = data.message || data.error || (data.status ? `Status ${data.status}` : '');
      if (summary && !String(msg).includes(String(summary))) {
        msg = `${msg} (${summary})`;
      }
    }

    if (msg.length > 600) {
      msg = msg.substring(0, 600) + '...';
    }
  }

  const fullMessage = `${prefix} ${msg}`;
  return data !== undefined ? [fullMessage, data] : [fullMessage];
}

/**
 * Check if logging is enabled for this component and level
 */
function shouldLog(component, level) {
  incrementShouldLogCalls();

  const cacheKey = `${component}:${level}`;
  const cache = getSharedLogLevelCache();

  if (cache.has(cacheKey)) {
    incrementCacheHits();
    return cache.get(cacheKey);
  }

  incrementCacheMisses();

  const componentLevel = getComponentLogLevel(component);
  
  // Logic: 
  // 1. If a component level is explicitly set to something other than the default, respect it.
  // 2. Otherwise, if debugOverride is active, allow everything up to DEBUG.
  // 3. Otherwise, use the standard filtering logic.
  const shouldLogValue = level <= componentLevel;

  // Cache the result
  cache.set(cacheKey, shouldLogValue);

  if (cache.size > MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }

  return shouldLogValue;
}

/**
 * Clear log level cache (call when log levels change)
 */
export function clearLogLevelCache() {
  clearSharedLogLevelCache();
}

// Fast helper specifically for debug gating
export function shouldDebug(component) {
  return shouldLog(component, LOG_LEVELS.DEBUG);
}

// Log batching system
const logBatch = [];
let batchTimeout = null;

function processLogBatch() {
  if (logBatch.length === 0) return;

  const groupedLogs = {};
  for (const log of logBatch) {
    const key = `${log.component}:${log.level}`;
    if (!groupedLogs[key]) groupedLogs[key] = [];
    groupedLogs[key].push(log);
  }

  for (const [key, logs] of Object.entries(groupedLogs)) {
    const [component, level] = key.split(':');
    const consoleMethod = getConsoleMethod(level);

    if (logs.length === 1) {
      const log = logs[0];
      const formatted = formatMessage(component, log.levelNum, log.message, log.data);
      consoleMethod(...formatted);
    } else {
      const formatted = formatMessage(
        component,
        logs[0].levelNum,
        `[BATCH ${logs.length}] ${logs[0].message}`,
        logs.length > 1 ? { details: logs.map(l => l.message) } : undefined
      );
      consoleMethod(...formatted);
    }
  }

  logBatch.length = 0;
  batchTimeout = null;
}

function getConsoleMethod(level) {
  switch (level) {
    case 0: case 'error': return safeConsole.error.bind(safeConsole);
    case 1: case 'warn': return safeConsole.warn.bind(safeConsole);
    case 2: case 'info': return safeConsole.info.bind(safeConsole);
    case 3: case 'debug': return safeConsole.debug.bind(safeConsole);
    default: return safeConsole.log.bind(safeConsole);
  }
}

export function flushLogBatch() {
  if (batchTimeout) {
    clearTimeout(batchTimeout);
    processLogBatch();
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushLogBatch);
}

/**
 * Create a logger for a specific component
 */
export function createLogger(component, subComponent = null) {
  const loggerName = subComponent ? `${component}.${subComponent}` : component;

  return Object.freeze({
    error: (message, data) => {
      const LEVEL = 0;
      if (shouldLog(component, LEVEL) && passesRuntimeFilter(loggerName, LEVEL, message)) {
        const formatted = formatMessage(loggerName, LEVEL, message, data);
        safeConsole.error(...formatted);
      }
    },

    warn: (message, data) => {
      const LEVEL = 1;
      if (shouldLog(component, LEVEL) && passesRuntimeFilter(loggerName, LEVEL, message)) {
        const formatted = formatMessage(loggerName, LEVEL, message, data);
        safeConsole.warn(...formatted);
      }
    },

    info: (message, data) => {
      const LEVEL = 2;
      if (shouldLog(component, LEVEL)) {
        if (passesRuntimeFilter(loggerName, LEVEL, message)) {
          const formatted = formatMessage(loggerName, LEVEL, message, data);
          safeConsole.info(...formatted);
        }
      }
    },

    debug: (message, data) => {
      const LEVEL = 3;
      if (shouldLog(component, LEVEL)) {
        if (passesRuntimeFilter(loggerName, LEVEL, message)) {
          const formatted = formatMessage(loggerName, LEVEL, message, data);
          safeConsole.log(...formatted);
        }
      }
    },

    isDebugEnabled: () => {
      const componentLevel = getComponentLogLevel(component);
      return getGlobalDebugState().debugOverride || componentLevel >= LOG_LEVELS.DEBUG;
    },

    debugLazy: createLazyLogMethod(component, loggerName, LOG_LEVELS.DEBUG, safeConsole.log.bind(safeConsole)),
    infoLazy: createLazyLogMethod(component, loggerName, LOG_LEVELS.INFO, safeConsole.info.bind(safeConsole)),
    warnLazy: createLazyLogMethod(component, loggerName, LOG_LEVELS.WARN, safeConsole.warn.bind(safeConsole)),

    init: (message, data) => {
      const LEVEL = 2;
      if (shouldLog(component, LEVEL)) {
        const formatted = formatMessage(loggerName, LEVEL, `✅ ${message}`, data);
        safeConsole.log(...formatted);
      }
    },

    operation: (message, data) => {
      const LEVEL = 2;
      if (shouldLog(component, LEVEL)) {
        const formatted = formatMessage(loggerName, LEVEL, message, data);
        safeConsole.log(...formatted);
      }
    }
  });
}

/**
 * Performance-aware logging for initialization sequences
 */
export function logInitSequence(component, steps) {
  const LEVEL = 2;
  if (!shouldLog(component, LEVEL)) return;

  const logger = createLogger(component);
  logger.info("Initialization sequence started");
  steps.forEach((step, index) => {
    logger.debug(`Step ${index + 1}: ${step}`);
  });
}

/**
 * Quick loggers
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
 * Runtime filtering logic
 */
const runtimeFilter = {
  enabled: false,
  allowedComponents: new Set(),
  minLevel: LOG_LEVELS.ERROR,
  allowedPatterns: [],
  blockedPatterns: []
};

export function configureRuntimeFilter(config = {}) {
  runtimeFilter.enabled = config.enabled ?? false;
  runtimeFilter.minLevel = config.minLevel ?? LOG_LEVELS.ERROR;
  runtimeFilter.allowedComponents = new Set(config.allowedComponents || []);
  runtimeFilter.allowedPatterns = config.allowedPatterns || [];
  runtimeFilter.blockedPatterns = config.blockedPatterns || [];
  clearLogLevelCache();
}

function passesRuntimeFilter(component, level, message) {
  if (!runtimeFilter.enabled) return true;
  if (level < runtimeFilter.minLevel) return false;
  if (runtimeFilter.allowedComponents.size > 0 && !runtimeFilter.allowedComponents.has(component)) return false;

  const messageStr = message.toString();
  for (const pattern of runtimeFilter.blockedPatterns) {
    if (pattern.test(messageStr)) return false;
  }

  if (runtimeFilter.allowedPatterns.length > 0) {
    for (const pattern of runtimeFilter.allowedPatterns) {
      if (pattern.test(messageStr)) return true;
    }
    return false;
  }
  return true;
}

export function setRuntimeFiltering(enabled) {
  runtimeFilter.enabled = enabled;
  clearLogLevelCache();
}

export function getRuntimeFilterConfig() {
  return {
    enabled: runtimeFilter.enabled,
    minLevel: runtimeFilter.minLevel,
    allowedComponents: Array.from(runtimeFilter.allowedComponents),
    allowedPatterns: runtimeFilter.allowedPatterns.map(p => p.source),
    blockedPatterns: runtimeFilter.blockedPatterns.map(p => p.source)
  };
}

export function __resetLoggingSystemForTests() {
  __getLoggerCache().clear();
  getSharedLogLevelCache().clear();
  resetPerformanceStats();
  configureRuntimeFilter({ enabled: false });
}

export function getLoggingPerformanceStats() {
  const globalStats = getPerformanceStats();
  const cache = getSharedLogLevelCache();
  return {
    ...globalStats,
    cacheSize: cache.size,
    cacheHitRate: globalStats.cacheHits / (globalStats.cacheHits + globalStats.cacheMisses) || 0
  };
}
