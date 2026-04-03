/**
 * Global Debug State Manager
 * Provides singleton pattern for shared debug state across all logger instances
 */

// Development environment detection - extension compatible
const isDevelopment = typeof __IS_DEVELOPMENT__ !== 'undefined' ? __IS_DEVELOPMENT__ :
  (() => {
    try {
      return typeof process !== 'undefined' && process.env && process.env.NODE_ENV === "development";
    } catch {
      // Fallback for extension environments
      return false;
    }
  })();

// Global state shared by all logger instances
const globalState = {
  // Global log level
  globalLogLevel: 1, // Default to WARN for a clean console experience

  // Runtime global debug override
  debugOverride: false,

  // Component-specific log levels
  // 0: ERROR, 1: WARN, 2: INFO, 3: DEBUG
  componentLogLevels: {
    // Core
    Background: 2,
    Content: 2,
    Core: 2,

    // UI
    UI: 2,
    Popup: 2,
    Options: 2,
    Sidepanel: 2,
    ContentApp: 2,
    
    // Features
    Windows: 2,
    ElementSelection: 2,
    TextFieldInteraction: 2,
    TextActions: 2,
    TextSelection: 2,
    Translation: 2,
    PageTranslation: 2,
    Shortcuts: 2,
    Exclusion: 2,
    Capture: 2,
    ScreenCapture: 2,
    Subtitle: 2,
    TTS: 2,
    Mobile: 2,
    DesktopFab: 2,

    // Services/Utilities
    Browser: 2,
    Config: 2,
    Error: 2,
    Framework: 2,
    I18n: 2,
    IFrame: 2,
    Memory: 1,
    Messaging: 2,
    Notifications: 2,
    Proxy: 2,
    Providers: 2,
    Text: 2,
    Utils: 2,
    
    // Data/Configuration
    History: 2,
    Legacy: 1,
    Settings: 2,
    Storage: 1,
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
