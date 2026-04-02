# Logging System Guide

The extension uses a **unified, modern logging system** for structured, environment-aware logging across all components.

**API Status:** 100% Modern - Zero Legacy Code - TDZ Proof Architecture
**Build Status:** Chrome + Firefox Extensions Verified - Clean Build

> **Note:** All legacy `getLogger()` and `logME()` patterns have been fully migrated to the modern `getScopedLogger()` API. The architecture has been refactored to break circular dependencies, making static initialization safe across the entire project.

## Quick Start

```javascript
import { getScopedLogger, LOG_COMPONENTS } from '@/shared/logging/logger.js'

// Standard static initialization - Safe everywhere due to broken circular dependencies
const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'MyComponent')

// Use different log levels
logger.error('Something went wrong', error)
logger.warn('This is a warning')
logger.info('General information')
logger.debug('Debug details')
logger.init('Component initialized successfully')

// Performance-optimized lazy evaluation for expensive operations
logger.debugLazy(() => ['Heavy computation result:', expensiveFunction()])
```

## ⚠️ Important: Single API Policy

**Only use `getScopedLogger()`** - all other logging patterns have been removed:

```javascript
// ✅ CORRECT - Use this everywhere (Static initialization is now the standard)
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'TranslationBox')

// ❌ REMOVED - These no longer exist
getLogger()                    // Fully removed
logME()                       // Fully removed
console.log('[Component]')    // Avoid - use logger instead
createLogger()                // Internal use only
```

## Architectural Stability & TDZ Safety

**RESOLVED:** The project architecture has been refactored to eliminate **Temporal Dead Zone (TDZ)** issues by breaking circular dependency chains between core modules (Storage, Config, Messaging, and Error Handling).

### Why Static Initialization is Now Safe
Previously, aggressive manual chunking and circular imports required a "Lazy Logger" pattern to prevent crashes. With the new architecture:
1.  **Broken Cycles**: Core services no longer have circular references back to the logging system.
2.  **Vite Optimization**: The build system now correctly orders modules, ensuring `logger.js` is always evaluated before its consumers.
3.  **Static standard**: You can (and should) initialize your logger at the top level of your file.

```javascript
// ✅ RECOMMENDED: Immediate top-level initialization
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

// This is now 100% safe from TDZ errors
const logger = getScopedLogger(LOG_COMPONENTS.TEXT, 'textDetection'); 
logger.debug('System initialized');
```

### When to use Async Loading (Performance only)
While TDZ is no longer a concern for logging, **Dynamic Imports** (`import()`) should still be used for **heavy feature modules** to maintain extension performance:
- ✅ **Translation Providers**: Gemini, OpenAI, etc. (loaded only when used)
- ✅ **Heavy Libraries**: `dompurify`, `marked` (loaded on demand)
- ✅ **Large UI Tabs**: Advanced settings or history panels

---

## Log Levels

| Level | Value | Purpose | When to Use (Strategy) |
|-------|-------|---------|------------|
| `ERROR` | 0 | Critical errors | Exceptions, failures, breaking issues (Visible in Production) |
| `WARN` | 1 | Warnings | Deprecations, recoverable issues, unexpected states (Visible in Production) |
| `INFO` | 2 | **User Journey** | Major user actions, process starts, and state changes (Visible in Production) |
| `DEBUG` | 3 | **Technical Flow** | High-frequency events, internal transitions, and granular details (Dev only) |

## Logging Strategy & Verbosity

To keep the browser console clean and useful, follow these principles:

1. **Action-Driven INFO**: Use `INFO` only for significant events that mark a milestone in the user's path (e.g., "Page translation started", "Panel opened").
2. **Granular DEBUG**: Use `DEBUG` for repetitive or low-level logic (e.g., "Drag coordinates updated", "Selection detected").
3. **Linear & Concise**: Keep log messages short and linear. Avoid multi-line objects unless absolutely necessary for debugging.
4. **Production Awareness**: Remember that `ERROR`, `WARN`, and `INFO` logs are visible to end-users in production. Ensure they provide value without exposing sensitive data or technical clutter.

## Components

### Core Layers
```javascript
LOG_COMPONENTS.BACKGROUND  // Background service worker (src/core/background/)
LOG_COMPONENTS.CONTENT     // Content script components (src/core/content-scripts/)
LOG_COMPONENTS.CORE        // Core system components (src/core/ except background & content)
```

### Applications & UI
```javascript
LOG_COMPONENTS.UI          // UI components and composables (src/apps/ & src/components/)
LOG_COMPONENTS.POPUP       // Popup application (src/apps/popup/)
LOG_COMPONENTS.SIDEPANEL   // Sidepanel application (src/apps/sidepanel/)
LOG_COMPONENTS.OPTIONS     // Options application (src/apps/options/)
LOG_COMPONENTS.CONTENT_APP // Content application (src/apps/content/)
```

### Feature Modules
```javascript
LOG_COMPONENTS.TRANSLATION          // Translation engine and services
LOG_COMPONENTS.PAGE_TRANSLATION     // Whole-page translation system
LOG_COMPONENTS.MOBILE               // Mobile support system (src/features/mobile/)
LOG_COMPONENTS.DESKTOP_FAB          // Desktop floating button (src/apps/content/components/desktop/)
LOG_COMPONENTS.TTS                  // Text-to-Speech system
LOG_COMPONENTS.SCREEN_CAPTURE        // Screen capture and OCR
LOG_COMPONENTS.ELEMENT_SELECTION     // Element selection functionality
LOG_COMPONENTS.TEXT_SELECTION       // Text selection handling
LOG_COMPONENTS.TEXT_ACTIONS         // Copy/paste/TTS operations
LOG_COMPONENTS.TEXT_FIELD_INTERACTION // Text field icon interactions
LOG_COMPONENTS.NOTIFICATIONS        // Notification system
LOG_COMPONENTS.IFRAME              // IFrame support
LOG_COMPONENTS.SHORTCUTS           // Keyboard shortcuts
LOG_COMPONENTS.EXCLUSION           // URL exclusion system
LOG_COMPONENTS.SUBTITLE            // Subtitle display
LOG_COMPONENTS.HISTORY             // Translation history
LOG_COMPONENTS.SETTINGS           // Settings management
LOG_COMPONENTS.WINDOWS             // Windows management
```

### Shared Systems
```javascript
LOG_COMPONENTS.PROXY      // Proxy system for geographically restricted services
LOG_COMPONENTS.MESSAGING  // Unified messaging system
LOG_COMPONENTS.STORAGE    // Storage management with caching
LOG_COMPONENTS.ERROR      // Error handling and management
LOG_COMPONENTS.CONFIG     // Configuration system
LOG_COMPONENTS.MEMORY     // Memory management and garbage collection
```

### Utilities & Tools
```javascript
LOG_COMPONENTS.UTILS      // General utilities
LOG_COMPONENTS.BROWSER    // Browser compatibility utilities
LOG_COMPONENTS.TEXT       // Text processing utilities
LOG_COMPONENTS.I18N       // Internationalization utilities (src/utils/i18n/)
LOG_COMPONENTS.FRAMEWORK  // Framework compatibility
LOG_COMPONENTS.LEGACY     // Legacy compatibility code
```

### Provider Systems
```javascript
LOG_COMPONENTS.PROVIDERS  // Translation provider implementations
LOG_COMPONENTS.CAPTURE    // Legacy alias for SCREEN_CAPTURE
```

## Environment Behavior

- **Development**: Shows all levels up to component's configured level
- **Production**: Only shows WARN and ERROR levels (optimized for performance)
- **Runtime Override**: Global debug can be enabled via `enableGlobalDebug()`

## API Reference

### getScopedLogger(component, subComponent?) **Primary API**
Returns a cached logger instance for a component (and optional sub-scope). **This is the only API you should use.** Repeat calls with identical args return the same object for memory efficiency.

```javascript
const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'SelectElement')
```

### ~~createLogger(component, subComponent?)~~ (internal use only)
Always creates a new instance. Reserved for internal or exceptional meta use-cases. **Use getScopedLogger instead.**

### Logger Methods

```javascript
logger.error(message, data?)     // Critical errors (always visible)
logger.warn(message, data?)      // Warnings
logger.info(message, data?)      // General information
logger.debug(message, data?)     // Debug information (development only)
logger.init(message, data?)      // Initialization logs (always shown in dev)
logger.operation(message, data?) // Important operations

// Performance-optimized methods
logger.debugLazy(() => [message, data])  // Lazy evaluation for expensive debug logs
logger.infoLazy(() => [message, data])   // Lazy evaluation for expensive info logs
```

## Troubleshooting

### No logs appearing
```javascript
// Check current level
console.log('Current level:', getLogLevel(LOG_COMPONENTS.CONTENT))

// Force enable debugging
setLogLevel(LOG_COMPONENTS.CONTENT, LOG_LEVELS.DEBUG)

// Enable global debug override (bypasses all component levels)
enableGlobalDebug()
```

### Too many logs in production
- Verify `NODE_ENV` is set to 'production'
- Check component levels are appropriate
- Use `debug()` for verbose logs instead of `info()`
- Use `debugLazy()` for expensive debug operations

### Debug Commands
For runtime debugging in browser console:

```javascript
// Enable all logging globally
setLogLevel('global', 3)

// Enable debug for specific component
setLogLevel(LOG_COMPONENTS.CONTENT, 3)

// Global debug override (most powerful)
enableGlobalDebug()  // Enable all debug logs regardless of component settings
disableGlobalDebug() // Restore component-specific settings

// Inspect current configuration
listLoggerLevels()
```

## File Structure

```
src/shared/logging/
├── logger.js          # Main logging system (getScopedLogger, performance optimized)
├── logConstants.js    # LOG_LEVELS and LOG_COMPONENTS definitions
```

## Summary

The logging system provides:
- **✅ Fully Refactored**: 100% modern API, zero legacy debt
- **Environment-Aware**: Automatic development vs production detection
- **Component-Based**: Organized by categories with individual log levels
- **Structured Logging**: Support for objects and structured data
- **Performance-Optimized**: Level checking + lazy evaluation prevent unnecessary work
- **Memory Efficient**: Cached logger instances prevent object duplication
- **TDZ-Safe Architecture**: Refactored module graph ensures stable initialization order

**Key Insight**: Use `getScopedLogger()` universally. Static initialization at the top level is the preferred and safe method.

---

**Last Updated:** April 2026 - Architecture refactored for TDZ safety and static initialization standard
**📊 Status:** ✅ Production Ready - 100% Modern Logging API with Clean Architecture
