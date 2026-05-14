# Logging System Guide

The extension uses a **unified, strictly filtered** logging system for structured, environment-aware logging across all components.

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

## Log Levels & Strategy

To maintain a clean console, logging follows a strict numerical hierarchy: `level <= componentLevel`.

| Level | Name | Responsibility (Strategy) | Visibility |
|-------|------|---------------------------|------------|
| `0` | **ERROR** | **Final Handlers & Critical Background.** `ErrorHandler`, fatal app crashes, or unexpected runtime errors. | Always |
| `1` | **WARN** | **Providers & Core.** Used for technical limits (429, 402, Network errors). | **Production Default** |
| `2` | **INFO** | **Milestones.** Processes starting/ending (e.g., "Translation started"). | Development/Debug |
| `3` | **DEBUG** | **Granular Traces.** High-frequency events (e.g., "Mouse moved", "Message sent"). | Development only |

---

## Strict Filtering Mandate

The system **strictly** enforces levels. The `DEBUG_MODE` setting or environment flags do **not** bypass component-specific filters. If a component is set to Level 1 (WARN), all INFO and DEBUG logs are silenced.

### Performance Optimization

For logs that involve expensive string concatenation or object serialization, use **Lazy Evaluation**:

```javascript
// ✅ CORRECT - Expensive logic only runs if level 3 (DEBUG) is enabled
logger.debugLazy(() => ['Complex State:', heavyObject.serialize()])

// ❌ INCORRECT - JSON.stringify runs even if log is hidden
logger.debug(`Complex State: ${JSON.stringify(heavyObject)}`)
```

## Configuration

### 1. Options Page (Recommended)
Manage log levels via the UI:
- **Location**: `Options Page` -> `Advance Tab` -> `Debug Mode`.
- **Features**: Toggle global Debug Mode and set granular levels for every component.
- **Sync**: Changes are broadcasted to all contexts (Background, Content, Sidepanel) in real-time via `DebugModeBridge`.

### 2. Default Values
To change default verbosity permanently:
1.  **Open**: `src/shared/logging/GlobalDebugState.js`
2.  **Edit**: `globalLogLevel` or the mapping logic in `initialComponentLogLevels`.

### 3. Adding Components
1.  **Open**: `src/shared/logging/logConstants.js`
2.  **Add**: A new key to the `LOG_COMPONENTS` object.
3.  **Result**: The system automatically registers the component and adds it to the Options Page UI.

## Summary

The logging system provides:
- **Numerical Filtering**: Simple, strict logic (`level <= componentLevel`).
- **Sync Architecture**: Real-time synchronization across all extension layers via `DebugModeBridge`.
- **Memory Efficient**: Singleton logger instances with internal caching.

**Last Updated:** May 2026
