# Logging System Optimization Plan

## Overview

This document outlines the optimized migration plan to fix the critical performance issues in the logging system. After careful analysis, we discovered that TDZ issues have already been resolved, and the main problem is multiple global variables across 360 logger instances causing 500+ function calls per page load.

## Current State Analysis

### What's Already Working ✅
- TDZ issues resolved with lazy initialization patterns
- Global logger caching prevents duplicate instances
- Performance batching for production environment
- Comprehensive feature set (lazy logging, runtime filtering)

### Real Issues Found ❌
- **360 calls** to `getScopedLogger()` across 324 files
- Each logger instance has its own global variables:
  - `globalLogLevel` (line 20)
  - `__runtimeDebugOverride` (line 23)
  - `componentLogLevels` (lines 32-84)
  - `logLevelCache` (line 90)
- Missing `LOG_COMPONENTS.I18N` constant (6 i18n files affected)
- 500+ function calls per page load for log level checking

## Optimization Strategy

The solution focuses on **shared global state** instead of per-instance variables, dramatically reducing memory usage and function calls.

### Phase 1: Quick Fixes (5 minutes)

#### 1.1 Add Missing I18N Component
**File**: `src/shared/logging/logConstants.js`
```javascript
// Add to LOG_COMPONENTS object (around line 55)
I18N: 'I18n',  // For internationalization utilities
```

#### 1.2 Update I18N Files
Fix these 6 files to use correct component:
- `src/utils/i18n/LanguageDetector.js`
- `src/utils/i18n/LanguagePackLoader.js`
- `src/utils/i18n/LazyLanguageLoader.js`
- `src/utils/i18n/localization.js`
- `src/utils/i18n/InterfaceLanguageLoader.js`
- `src/utils/i18n/TranslationLanguageLoader.js`
- `src/utils/i18n/TtsLanguageLoader.js`

Change: `LOG_COMPONENTS.I18N` → `LOG_COMPONENTS.TEXT` or `LOG_COMPONENTS.UTILS`

### Phase 2: Global State Manager (30 minutes)

#### 2.1 Create GlobalDebugState.js
**File**: `src/shared/logging/GlobalDebugState.js`
```javascript
/**
 * Global Debug State Manager
 * Provides singleton pattern for shared debug state across all logger instances
 */

// Development environment detection
const isDevelopment = process.env.NODE_ENV === "development";

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
    Text: 2, Framework: 2, Legacy: 1,
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
```

#### 2.2 Refactor logger.js
**Key Changes**:
1. Remove global variables from each logger instance
2. Import from GlobalDebugState
3. Optimize shouldLog() function
4. Update exported functions

```javascript
// Remove these lines:
let globalLogLevel = isDevelopment ? 3 : 1;
let __runtimeDebugOverride = false;
const logLevelCache = new Map();

// Import from GlobalDebugState:
import {
  getGlobalDebugState,
  setGlobalDebugOverride,
  getGlobalLogLevel,
  getComponentLogLevel,
  getSharedLogLevelCache,
  incrementShouldLogCalls,
  incrementCacheHits,
  incrementCacheMisses
} from './GlobalDebugState.js';

// Update shouldLog function:
function shouldLog(component, level) {
  incrementShouldLogCalls();

  const cacheKey = `${component}:${level}`;
  const cache = getSharedLogLevelCache();

  if (cache.has(cacheKey)) {
    incrementCacheHits();
    return cache.get(cacheKey);
  }

  incrementCacheMisses();

  const globalState = getGlobalDebugState();
  const componentLevel = getComponentLogLevel(component);
  const shouldLogValue = globalState.debugOverride
    ? level <= LOG_LEVELS.DEBUG
    : level <= componentLevel;

  // Cache the result
  cache.set(cacheKey, shouldLogValue);

  // LRU eviction (simplified)
  if (cache.size > 100) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }

  return shouldLogValue;
}

// Update exported functions:
export function enableGlobalDebug() {
  setGlobalDebugOverride(true);
}

export function disableGlobalDebug() {
  setGlobalDebugOverride(false);
}

export function isGlobalDebugEnabled() {
  return getGlobalDebugState().debugOverride;
}

export function setLogLevel(component, level) {
  if (component === "global") {
    setGlobalLogLevel(level);
  } else {
    setComponentLogLevel(component, level);
  }
  clearSharedLogLevelCache();
}

export function getLogLevel(component) {
  return getComponentLogLevel(component);
}
```

### Phase 3: Memory Optimization (20 minutes)

#### 3.1 Reduce Cache Size
```javascript
// In GlobalDebugState.js, reduce from 200 to 100
const MAX_CACHE_SIZE = 100;  // Down from 200
```

#### 3.2 Add Performance Monitoring
```javascript
// In logger.js, add performance export
export function getLoggingPerformanceStats() {
  const globalStats = getPerformanceStats();
  const cache = getSharedLogLevelCache();

  return {
    ...globalStats,
    cacheSize: cache.size,
    cacheHitRate: globalStats.cacheHits / (globalStats.cacheHits + globalStats.cacheMisses) || 0
  };
}

// Reset utility for testing
export function __resetLoggingSystemForTests() {
  resetPerformanceStats();
  clearSharedLogLevelCache();
  __getLoggerCache().clear();
}
```

## Expected Results

### Performance Improvements:
- **Before**: 500+ function calls per page load
- **After**: <10 function calls per page load
- **Memory**: Single shared state instead of 360+ duplicates
- **Cache Hit Rate**: >80% with optimized LRU cache

### Architecture Benefits:
- ✅ Single source of truth for debug state
- ✅ No duplicate global variables
- ✅ Shared cache reduces memory footprint
- ✅ Performance monitoring capabilities
- ✅ Backward compatibility maintained

### Quality Improvements:
- ✅ Fix missing I18N component constant
- ✅ Resolve potential runtime errors
- ✅ Better maintainability
- ✅ Easier debugging and monitoring

## Implementation Checklist

### Phase 1: Quick Fixes
- [ ] Add I18N to logConstants.js
- [ ] Update 6 i18n files to use correct component
- [ ] Test basic functionality

### Phase 2: Global State Manager
- [ ] Create GlobalDebugState.js
- [ ] Refactor logger.js to use shared state
- [ ] Update shouldLog function
- [ ] Update exported functions
- [ ] Test basic functionality

### Phase 3: Memory Optimization
- [ ] Reduce cache size to 100
- [ ] Add performance monitoring
- [ ] Test performance improvements
- [ ] Verify memory usage reduction

## Testing Strategy

### Performance Tests
```javascript
// Test in browser console
const stats = await import('/src/shared/logging/logger.js').then(m => m.getLoggingPerformanceStats());
console.log('Logging Performance Stats:', stats);

// Should show:
// - shouldLogCalls < 10 per page load
// - cacheHitRate > 0.8
// - No exponential growth
```

### Functional Tests
- Verify all log levels work
- Test debug mode toggle
- Verify component-specific log levels
- Test I18N file fixes

### Memory Tests
- Check memory usage before/after
- Verify cache sharing works
- Test with multiple contexts

## Risk Mitigation

### Low Risk:
- Changes are isolated to logging system
- No impact on business logic
- Gradual migration possible

### Medium Risk:
- Performance critical code path
- Multiple files to update
- Global state management

### High Risk:
- None identified

## Rollback Plan

If issues arise during migration:
1. Revert logger.js to previous version
2. Keep GlobalDebugState.js (can be used later)
3. I18N fixes can remain (safe changes)
4. Document any performance regressions

## Success Criteria

1. **Performance**: <10 shouldLog calls per page load
2. **Memory**: Single shared state instance
3. **Functionality**: All logging features work as before
4. **No Errors**: I18N files work without runtime errors
5. **Compatibility**: No breaking changes to existing code

---

## Session Implementation Guide

This optimized plan is designed for implementation across multiple AI sessions:

### Session 1:
- Implement Phase 1 (Quick fixes)
- Implement Phase 2 (GlobalDebugState.js and logger.js refactor)
- Test basic functionality

### Session 2:
- Implement Phase 3 (Memory optimization)
- Performance testing and validation
- Final verification

---

*Created: 2025-09-27*
*Status: Ready for Implementation*
*Priority: Critical (Performance Issue)*