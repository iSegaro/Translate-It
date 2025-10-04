# Logging System Performance Issue

## Problem Summary

The logging system has a severe performance issue where it makes 500+ log checks per page load. This is caused by multiple logger instances each creating their own chrome storage listeners, leading to exponential function calls and poor performance.

## Root Cause Analysis

### The Architecture Problem

1. **Multiple Logger Instances**: Each script in the extension (content script, background script, popup, options) creates its own instance of the logger.

2. **TDZ and Lazy Loading Issues**: Due to circular dependencies and Temporal Dead Zone (TDZ) issues, the system uses lazy loading patterns that result in multiple instances.

3. **Storage Listeners Multiply**: Each logger instance creates its own `chrome.storage.onChanged` listener. When there are 5 scripts loaded, each with their own logger, and each logger listening to storage changes, any single storage change triggers 5 listener callbacks.

4. **Exponential Function Calls**: The `shouldLog` function is called for every log attempt. With multiple instances, this compounds rapidly.

### The Technical Flow

```
1. Content script loads → creates logger instance 1 → adds storage listener 1
2. Background script loads → creates logger instance 2 → adds storage listener 2
3. Popup loads → creates logger instance 3 → adds storage listener 3
4. Options page loads → creates logger instance 4 → adds storage listener 4
5. Sidepanel loads → creates logger instance 5 → adds storage listener 5

When DEBUG_MODE changes:
- Listener 1 fires → calls shouldLog() → logs "DEBUG_MODE changed"
- Listener 2 fires → calls shouldLog() → logs "DEBUG_MODE changed"
- Listener 3 fires → calls shouldLog() → logs "DEBUG_MODE changed"
- Listener 4 fires → calls shouldLog() → logs "DEBUG_MODE changed"
- Listener 5 fires → calls shouldLog() → logs "DEBUG_MODE changed"
```

Each of these logs then triggers another round of storage changes and listener callbacks!

### Current Implementation Issues

In `src/shared/logging/logger.js`:

```javascript
// This runs for EVERY logger instance created
if (typeof chrome !== 'undefined' && chrome.storage) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.DEBUG_MODE) {
      const newValue = changes.DEBUG_MODE.newValue;
      if (newValue === true) {
        __runtimeDebugOverride = true;
      } else if (newValue === false) {
        __runtimeDebugOverride = false;
      }
    }
  });
}
```

## Symptoms

1. **500+ function calls** per page load just for log checking
2. **Console spam** with duplicate "DEBUG_MODE changed" messages
3. **Poor page load performance** due to excessive synchronous operations
4. **High CPU usage** from repeated storage operations

## Why This Happened

1. **Historical Evolution**: The logging system evolved from a simple singleton to a complex system with component-based log levels
2. **Circular Dependencies**: Between config, storage, and logging systems forced lazy loading patterns
3. **DEBUG_MODE Integration**: When DEBUG_MODE setting was connected to the logging system, storage listeners were added without considering the multiple instance problem
4. **Global State**: The `__runtimeDebugOverride` variable should truly be global, but each instance manages its own listeners

## Potential Solutions

### 1. Singleton Pattern with True Global State

```javascript
// In a dedicated module that only loads once
let globalDebugOverride = false;
let listenersInitialized = false;

export function initializeGlobalDebugListener() {
  if (listenersInitialized) return;
  listenersInitialized = true;

  // Only ONE listener for the entire extension
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.DEBUG_MODE) {
      globalDebugOverride = changes.DEBUG_MODE.newValue === true;
    }
  });

  // Check initial state
  chrome.storage.local.get(['DEBUG_MODE']).then((result) => {
    globalDebugOverride = result.DEBUG_MODE === true;
  });
}

export function isGlobalDebugEnabled() {
  return globalDebugOverride;
}
```

### 2. Event Emitter Pattern

Instead of direct storage listeners in each logger instance, use a central event emitter:

```javascript
// Central event bus
const debugEmitter = new EventTarget();

// Single storage listener
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.DEBUG_MODE) {
    debugEmitter.dispatchEvent(new CustomEvent('debugModeChanged', {
      detail: { enabled: changes.DEBUG_MODE.newValue }
    }));
  }
});

// Loggers subscribe to events instead of listening to storage directly
```

### 3. Shared Worker Approach (For Manifest V3)

Use a shared worker to manage debug state centrally:

```javascript
// debug-worker.js
let globalDebugOverride = false;

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.DEBUG_MODE) {
    globalDebugOverride = changes.DEBUG_MODE.newValue === true;
  }
});

self.onmessage = (event) => {
  if (event.data.type === 'getDebugState') {
    self.postMessage({
      type: 'debugState',
      enabled: globalDebugOverride
    });
  }
};
```

### 4. Simplified Approach - Remove Storage Listeners

Remove the automatic storage listeners entirely and require explicit calls:

```javascript
// In settings store or config
const { enableGlobalDebug, disableGlobalDebug } = await import('./logger.js');

// When DEBUG_MODE changes
if (newValue === true) {
  enableGlobalDebug();
} else {
  disableGlobalDebug();
}
```

## Implementation Complexity

The challenge is that any solution must:
1. Work across all extension contexts (content scripts, background, popup, options)
2. Handle TDZ issues with circular dependencies
3. Not break existing functionality
4. Maintain backward compatibility
5. Work with the lazy loading patterns already in place

## Current State

The system currently has:
- DEBUG_MODE setting connected to logging via storage listeners
- Each logger instance creates its own storage listener
- Multiple instances due to separate contexts
- Performance issues from exponential function calls

## Recommendations for Future Implementation

1. **Short-term**: Remove storage listeners from logger.js and manage DEBUG_MODE changes explicitly in settings store only
2. **Medium-term**: Implement a true singleton pattern for debug state management
3. **Long-term**: Consider a messaging-based approach for cross-context state synchronization

## Files Affected

- `src/shared/logging/logger.js` - Main logger implementation
- `src/features/settings/stores/settings.js` - Settings store
- `src/shared/config/config.js` - Configuration system
- All scripts that import the logger (content scripts, background, popup, options, sidepanel)

## Temporary Solution (For Quick Debugging)

If you need to temporarily enable debug logging without implementing the full solution:

1. **Open Browser DevTools Console** in any extension context (background, popup, or content script)

2. **Manually Enable Debug Mode**:
   ```javascript
   // Access the logger module
   const loggerModule = await import(chrome.runtime.getURL('path/to/logger.js'));

   // Enable global debug
   loggerModule.enableGlobalDebug();

   // Or directly set the variable
   window.__TRANSLATE_IT__.__LOGGER_CACHE.get('Core')._debugEnabled = true;
   ```

3. **Alternative - Use the Settings Store**:
   ```javascript
   // In popup/options dev console
   const settingsStore = await import(chrome.runtime.getURL('path/to/settings.js'));
   await settingsStore.updateSettingAndPersist('DEBUG_MODE', true);
   ```

4. **Quick Console Method** (for immediate debugging):
   ```javascript
   // Force all logs to show
   console.log = console.debug = console.info = console.warn = console.error;
   ```

**Note**: These temporary methods will only work for the current session and will reset when the extension is reloaded.

## Testing Checklist

- Verify only one storage listener exists for DEBUG_MODE changes
- Check that debug mode toggle works across all contexts
- Ensure no duplicate log messages
- Measure performance impact (should be < 10 log checks per page load)
- Test with multiple contexts active simultaneously

---

*Document created: 2025-09-27*
*Context: This issue was discovered when connecting the DEBUG_MODE setting to the global logging system. The initial implementation worked functionally but caused severe performance issues due to the architectural problem of multiple logger instances.*