/**
 * Global Debug State Manager
 * Provides singleton pattern for shared debug state across all logger instances
 */

import { LOG_COMPONENTS } from './logConstants.js';

// Initialize component log levels from constants
const initialComponentLogLevels = Object.values(LOG_COMPONENTS).reduce((acc, component) => {
  acc[component] = 1; // Default to WARN
  return acc;
}, {});

/**
 * MANUAL OVERRIDES (Development Only)
 * You can manually override specific component log levels here.
 * Note: Values saved in storage (via Options page) will take precedence.
 * 
 * Example:
 * initialComponentLogLevels[LOG_COMPONENTS.TRANSLATION] = 3; // DEBUG
 * initialComponentLogLevels[LOG_COMPONENTS.CORE] = 2;        // INFO
 */

// Global state shared by all logger instances
const globalState = {
  // Global log level
  globalLogLevel: 1, // Default to WARN for a clean console experience

  // Runtime global debug override
  debugOverride: false,

  // Component-specific log levels
  // 0: ERROR, 1: WARN, 2: INFO, 3: DEBUG
  componentLogLevels: initialComponentLogLevels,

  // Shared LRU cache for all loggers
  sharedLogLevelCache: new Map(),

  // Performance tracking
  stats: {
    shouldLogCalls: 0,
    cacheHits: 0,
    cacheMisses: 0
  }
};

// Export singleton accessors
export function getGlobalDebugState() {
  return globalState;
}

export function setGlobalDebugOverride(value) {
  globalState.debugOverride = value;
  globalState.sharedLogLevelCache.clear();
}

export function getGlobalLogLevel() {
  return globalState.globalLogLevel;
}

export function setGlobalLogLevel(level) {
  globalState.globalLogLevel = level;
  globalState.sharedLogLevelCache.clear();
}

export function getComponentLogLevel(component) {
  return globalState.componentLogLevels[component] ?? globalState.globalLogLevel;
}

export function setComponentLogLevel(component, level) {
  globalState.componentLogLevels[component] = level;
  globalState.sharedLogLevelCache.clear();
}

// Cache management
export function getSharedLogLevelCache() {
  return globalState.sharedLogLevelCache;
}

export function clearSharedLogLevelCache() {
  globalState.sharedLogLevelCache.clear();
}

// Performance tracking
export function incrementShouldLogCalls() {
  globalState.stats.shouldLogCalls++;
}

export function incrementCacheHits() {
  globalState.stats.cacheHits++;
}

export function incrementCacheMisses() {
  globalState.stats.cacheMisses++;
}

export function getPerformanceStats() {
  return { ...globalState.stats };
}

export function resetPerformanceStats() {
  globalState.stats = {
    shouldLogCalls: 0,
    cacheHits: 0,
    cacheMisses: 0
  };
}
