/**
 * Global Debug State Manager
 * Provides singleton pattern for shared debug state across all logger instances
 */

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
    Background: 1,
    Content: 1,
    Core: 1,

    // UI
    UI: 1,
    Popup: 1,
    Options: 1,
    Sidepanel: 1,
    ContentApp: 1,
    
    // Features
    Windows: 1,
    ElementSelection: 1,
    TextFieldInteraction: 1,
    TextActions: 1,
    TextSelection: 1,
    Translation: 1,
    PageTranslation: 1,
    Shortcuts: 1,
    Exclusion: 1,
    Capture: 1,
    ScreenCapture: 1,
    Subtitle: 1,
    TTS: 1,
    Mobile: 1,
    DesktopFab: 1,

    // Services/Utilities
    Browser: 1,
    Config: 1,
    Error: 1,
    Framework: 1,
    I18n: 1,
    IFrame: 1,
    Memory: 1,
    Messaging: 1,
    Notifications: 1,
    Proxy: 1,
    Providers: 1,
    Text: 1,
    Utils: 1,
    
    // Data/Configuration
    History: 1,
    Legacy: 1,
    Settings: 1,
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
