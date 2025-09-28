/**
 * Global Debug State Manager
 * Provides singleton pattern for shared debug state across all logger instances
 */

// Development environment detection - extension compatible
const isDevelopment = (() => {
  try {
    return typeof process !== 'undefined' && process.env && process.env.NODE_ENV === "development";
  } catch (e) {
    // Fallback for extension environments
    return false;
  }
})();

// Global state shared by all logger instances
const globalState = {
  // Global log level
  globalLogLevel: isDevelopment ? 3 : 1, // DEBUG : WARN

  // Runtime global debug override
  debugOverride: false,

  // Component-specific log levels (copied from logger.js)
  componentLogLevels: {
    Background: 2, Core: 2, Content: 2,
    UI: 2, Popup: 2, Sidepanel: 2, Options: 2,
    Translation: 2, TTS: 2, ScreenCapture: 2,
    ElementSelection: 3, TextSelection: 2, TextActions: 2,
    TextFieldInteraction: 2, Notifications: 2, IFrame: 3,
    Shortcuts: 2, Exclusion: 2, Subtitle: 2,
    History: 2, Settings: 2, Windows: 2,
    ContentApp: 3, Messaging: 2, Storage: 1,
    Error: 2, Config: 2, Memory: 2,
    Proxy: 2, Utils: 2, Browser: 2,
    Text: 2, I18n: 2, Framework: 2, Legacy: 1,
    Providers: 2, Capture: 2
  },

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
}

export function getGlobalLogLevel() {
  return globalState.globalLogLevel;
}

export function setGlobalLogLevel(level) {
  globalState.globalLogLevel = level;
}

export function getComponentLogLevel(component) {
  return globalState.componentLogLevels[component] ?? globalState.globalLogLevel;
}

export function setComponentLogLevel(component, level) {
  globalState.componentLogLevels[component] = level;
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