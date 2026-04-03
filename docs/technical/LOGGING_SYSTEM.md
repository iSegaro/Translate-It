# Logging System Guide

The extension uses a **unified, strictly filtered** logging system for structured, environment-aware logging across all components.

**API Status:** 100% Modern - Zero Legacy Code - Layer-Aware Filtering
**Filter Status:** Level-based (0-3) - No environment bypasses

## Quick Start

```javascript
import { getScopedLogger, LOG_COMPONENTS } from '@/shared/logging/logger.js'

// Standard static initialization
const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'MyComponent')

// Usage
logger.error('Fatal failure', error) // Level 0
logger.warn('Recoverable issue')     // Level 1
logger.info('User milestone')        // Level 2
logger.debug('Technical trace')      // Level 3
```

## Log Levels & Strategy (The Golden Chain)

To maintain a clean console, logging follows a strict numerical hierarchy: `level <= componentLevel`.

| Level | Name | Responsibility (Strategy) | Visibility |
|-------|------|---------------------------|------------|
| `0` | **ERROR** | **Final Handlers only.** Only `ErrorHandler` or fatal app crashes. | Always |
| `1` | **WARN** | **Providers & Core.** Used for technical limits (429, 402, Network errors). | **Production Default** |
| `2` | **INFO** | **Milestones.** Processes starting/ending (e.g., "Translation started"). | Development/Debug |
| `3` | **DEBUG** | **Granular Traces.** High-frequency events (e.g., "Mouse moved", "Message sent"). | Development only |

---

## ⚠️ Important: Strict Filtering Mandate

The system **strictly** enforces levels. Unlike legacy systems, the `isDevelopment` flag does **not** bypass filters. If a component is set to Level 1 (WARN), all INFO and DEBUG logs are silenced, regardless of the environment.

### Why this matters
- **No Console Flooding**: High-frequency components (like Messaging or Memory) won't drown out important errors.
- **Predictable Output**: The developer has absolute control over verbosity via `componentLogLevels`.

---

## Performance Optimization

For logs that involve expensive string concatenation or object serialization, use **Lazy Evaluation**:

```javascript
// ✅ CORRECT - Expensive logic only runs if level 3 (DEBUG) is enabled
logger.debugLazy(() => ['Complex State:', heavyObject.serialize()])

// ❌ INCORRECT - JSON.stringify runs even if log is hidden
logger.debug(`Complex State: ${JSON.stringify(heavyObject)}`)
```

## Maintenance & Extension (How-to)

### How to change Log Levels permanently
To change the default verbosity of a component or the entire app:
1.  **Open**: `src/shared/logging/GlobalDebugState.js`
2.  **Edit**: `componentLogLevels` object for specific components, or `globalLogLevel` for the entire app.
    - `0`: Errors only
    - `1`: Warnings (Production Default)
    - `2`: Info (User Journeys)
    - `3`: Debug (Technical Traces)

### How to add a new Component
1.  **Open**: `src/shared/logging/logConstants.js`
2.  **Add**: A new key to the `LOG_COMPONENTS` object.
3.  **Register**: (Optional) Add a default level for it in `GlobalDebugState.js`.

---

## Debugging & Runtime Control

You can change log levels in real-time via the browser console:

```javascript
// 1. Inspect current levels
listLoggerLevels()

// 2. Set specific level for a component
setLogLevel(LOG_COMPONENTS.TRANSLATION, 3) // Enable Debug for translation

// 3. Set global level (Applies to all components)
setLogLevel('global', 1) // Quiet everything to Warn/Error

// 4. Force clear cache (if levels don't seem to update)
clearSharedLogLevelCache()
```

## Summary

The logging system provides:
- **Numerical Filtering**: Simple, strict logic (`level <= componentLevel`).
- **No Bypasses**: Environment flags cannot override explicit component settings.
- **Layer-Aware**: Different layers (Core vs UI) use different levels to avoid redundancy.
- **Memory Efficient**: Singleton logger instances per component/scope.

**Key Insight**: If you want to see your logs, ensure the level is set correctly in `GlobalDebugState.js` or via `setLogLevel()` in the console.

---

**Last Updated:** April 2026
