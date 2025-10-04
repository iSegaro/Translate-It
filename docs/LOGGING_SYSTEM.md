# Logging System Guide

The extension uses a **unified, modern logging system** for structured, environment-aware logging across all components.

**✅ Migration Status:** **COMPLETED** (September 2025)
**🚀 API Status:** 100% Modern - Zero Legacy Code - TDZ Safe
**🔧 Build Status:** Chrome + Firefox Extensions Verified - All TDZ Issues Resolved

> **Note:** All legacy `getLogger()` and `logME()` patterns have been fully migrated to the modern `getScopedLogger()` API. This guide reflects the current production-ready system.

## Quick Start

```javascript
import { getScopedLogger, LOG_COMPONENTS } from '@/shared/logging/logger.js'

// This is the ONLY logging API you need - cached and optimized
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
// ✅ CORRECT - Use this everywhere
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'TranslationBox')

// ❌ REMOVED - These no longer exist
getLogger()                    // Fully removed
logME()                       // Fully removed
console.log('[Component]')    // Avoid - use logger instead
createLogger()                // Internal use only
```

## 🚨 Critical: Temporal Dead Zone (TDZ) Prevention

**✅ RESOLVED:** All TDZ issues have been fixed using lazy initialization pattern.

**For early-loaded modules** (like utilities imported at startup), use **lazy initialization** to prevent TDZ errors:

```javascript
// ✅ SAFE: Lazy initialization for early-loaded modules
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

let logger = null;
const getLogger = () => {
  if (!logger) {
    logger = getScopedLogger(LOG_COMPONENTS.TEXT, 'textDetection');
  }
  return logger;
};

// Use getLogger() instead of logger
getLogger().debug('This is safe from TDZ');
getLogger().error('Error occurred', error);
```

```javascript
// ❌ DANGEROUS: Immediate initialization (causes TDZ in early modules)
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TEXT, 'textDetection'); // TDZ Risk!
logger.debug('This may fail with "Cannot access before initialization"');
```

### When to Use Lazy Initialization

Use lazy initialization when:
- ✅ Module is imported early in application startup
- ✅ Module is a utility function used by many components
- ✅ Module is imported by main app files (`main.js`, `popup.js`, etc.)
- ✅ You see "Cannot access 'LOG_COMPONENTS' before initialization" errors

**Examples of modules requiring lazy initialization:**
- `src/utils/i18n/i18n.js` - Internationalization utilities
- `src/utils/text/textDetection.js` - Text processing utilities
- `src/utils/text/detection.js` - Text extraction utilities

### When Immediate Initialization is Safe

Use immediate initialization when:
- ✅ Component is loaded on-demand (not at startup)
- ✅ Component is a Vue component or service loaded later
- ✅ No early import dependencies exist

**Examples of modules safe for immediate initialization:**
- Vue components loaded on-demand
- Services initialized after app startup
- Modules imported by user interactions

## Log Levels

| Level | Value | Purpose | When to Use |
|-------|-------|---------|------------|
| `ERROR` | 0 | Critical errors | Exceptions, failures, breaking issues |
| `WARN` | 1 | Warnings | Deprecations, recoverable issues |
| `INFO` | 2 | General information | Important status updates, initialization |
| `DEBUG` | 3 | Detailed debugging | Development details, verbose information |

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

### getScopedLogger(component, subComponent?) ⭐ **Primary API**
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

### Level Management

```javascript
import { setLogLevel, getLogLevel, LOG_LEVELS } from '@/shared/logging/logger.js'

// Set component level
setLogLevel(LOG_COMPONENTS.CONTENT, LOG_LEVELS.DEBUG)

// Set global level
setLogLevel('global', LOG_LEVELS.WARN)

// Check current level
const level = getLogLevel(LOG_COMPONENTS.CONTENT)
```

## Usage Examples

### Vue Component
```javascript
// In Vue component
import { getScopedLogger, LOG_COMPONENTS } from '@/shared/logging/logger.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'TranslationBox')

const handleTranslation = async () => {
  try {
    logger.debug('Starting translation')
    const result = await translateText()
    logger.info('Translation successful', { length: result.length })
  } catch (error) {
    logger.error('Translation failed', error)
  }
}

onMounted(() => {
  logger.init('TranslationBox mounted')
})
```

### Background Script
```javascript
// In background script
import { getScopedLogger, LOG_COMPONENTS } from '@/shared/logging/logger.js'

class TranslationService {
  constructor() {
  this.logger = getScopedLogger(LOG_COMPONENTS.CORE, 'TranslationService')
  }

  async translateText(text, options) {
    this.logger.debug('Translation request', {
      length: text.length,
      provider: options.provider
    })

    try {
      const result = await this.callAPI(text, options)
      this.logger.info('Translation completed', {
        provider: options.provider,
        duration: result.duration
      })
      return result
    } catch (error) {
      this.logger.error('Translation API failed', {
        provider: options.provider,
        error: error.message
      })
      throw error
    }
  }
}
```

### Content Script
```javascript
// In content script
import { getScopedLogger, LOG_COMPONENTS } from '@/shared/logging/logger.js'

class SelectElementManager {
  constructor() {
  this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'SelectElement')
  }

  initialize() {
    try {
      this.setupEventListeners()
      this.logger.init('Select element manager initialized')
    } catch (error) {
      this.logger.error('Initialization failed', error)
    }
  }

  handleElementClick(element) {
    this.logger.debug('Element clicked', {
      tagName: element.tagName,
      id: element.id
    })

    this.logger.operation('Element processed successfully')
  }
}
```

## Best Practices

### 1. Component Naming
Use descriptive component and sub-component names:

```javascript
// Good
const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'SelectElement')
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'TranslationBox')

// Avoid
const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'Handler')
```

### 2. TDZ Prevention Strategy
**Always use lazy initialization for utility modules:**

```javascript
// ✅ Best Practice: Utility modules (textDetection.js, i18n.js, etc.)
let logger = null;
const getLogger = () => {
  if (!logger) {
    logger = getScopedLogger(LOG_COMPONENTS.TEXT, 'textDetection');
  }
  return logger;
};
```

### 3. Log Level Selection
Choose appropriate log levels:

```javascript
// ERROR: For actual errors
logger.error('API request failed', error)

// WARN: For deprecations or recoverable issues
logger.warn('Using deprecated method, please migrate')

// INFO: For important status updates
logger.info('Translation completed', { duration: '2.1s' })

// DEBUG: For development details
logger.debug('Processing DOM element', element)
```

### 4. Structured Data
Include relevant context in logs:

```javascript
// Good: Structured context
logger.error('Translation failed', {
  provider: 'google',
  text: text.substring(0, 50),
  language: 'en-fa',
  timestamp: Date.now()
})

// Avoid: Unstructured string
logger.error('Translation failed for ' + text + ' using ' + provider)
```

### 5. Performance Best Practices
Use lazy evaluation for expensive debug logs:

```javascript
// Good: Lazy evaluation (only computed if debug level enabled)
logger.debugLazy(() => ['Heavy computation result:', expensiveFunction()])

// Avoid: Always computed even if debug disabled
logger.debug('Heavy computation result:', expensiveFunction())
```

### 6. Initialization Logging
Use `init()` for component initialization:

```javascript
// Good: Clear initialization
logger.init('Component initialized', {
  handlers: this.handlers.length,
  features: this.enabledFeatures
})

// Avoid: Generic info
logger.info('Ready')
```

## Configuration

### Default Component Levels (Production Optimized)
```javascript
const componentLogLevels = {
  // Core layers (main background and content workflows)
  Background: LOG_LEVELS.INFO,  // Background service worker and handlers
  Core: LOG_LEVELS.INFO,        // Core system components
  Content: LOG_LEVELS.INFO,     // Windows Manager and content scripts

  // Applications and UI
  UI: LOG_LEVELS.INFO,          // UI composables and components
  Popup: LOG_LEVELS.INFO,       // Popup application
  Sidepanel: LOG_LEVELS.INFO,   // Sidepanel application
  Options: LOG_LEVELS.INFO,     // Options application
  ContentApp: LOG_LEVELS.INFO,  // Content application

  // Features (all set to INFO for production visibility)
  Translation: LOG_LEVELS.INFO,
  TTS: LOG_LEVELS.INFO,
  ScreenCapture: LOG_LEVELS.INFO,
  ElementSelection: LOG_LEVELS.INFO,
  TextSelection: LOG_LEVELS.INFO,
  TextActions: LOG_LEVELS.INFO,
  TextFieldInteraction: LOG_LEVELS.INFO,
  Notifications: LOG_LEVELS.INFO,
  IFrame: LOG_LEVELS.INFO,
  Shortcuts: LOG_LEVELS.INFO,
  Exclusion: LOG_LEVELS.INFO,
  Subtitle: LOG_LEVELS.INFO,
  History: LOG_LEVELS.INFO,
  Settings: LOG_LEVELS.INFO,
  Windows: LOG_LEVELS.INFO,

  // Shared systems
  Messaging: LOG_LEVELS.INFO,    // Important for debugging communication
  Storage: LOG_LEVELS.WARN,      // Reduce noise in storage operations
  Error: LOG_LEVELS.INFO,        // Error tracking is important
  Config: LOG_LEVELS.INFO,       // Configuration changes
  Memory: LOG_LEVELS.INFO,       // Memory management operations
  Proxy: LOG_LEVELS.INFO,      // Proxy system for restricted services

  // Utilities and tools
  Utils: LOG_LEVELS.INFO,       // General utilities
  Browser: LOG_LEVELS.INFO,     // Browser utilities
  Text: LOG_LEVELS.INFO,        // Text processing
  Framework: LOG_LEVELS.INFO,   // Framework compatibility
  Legacy: LOG_LEVELS.WARN,       // Legacy compatibility (reduced noise)

  // Providers (subset of Translation)
  Providers: LOG_LEVELS.INFO,   // Translation provider implementations

  // Legacy aliases
  Capture: LOG_LEVELS.INFO,     // Maps to ScreenCapture
}
```

### Runtime Configuration
```javascript
// Enable debug logging for specific component
setLogLevel(LOG_COMPONENTS.TRANSLATION, LOG_LEVELS.DEBUG)

// Set global log level
setLogLevel('global', LOG_LEVELS.INFO)

// Runtime debug override (bypass all component levels)
enableGlobalDebug()  // Enable all debug logs
disableGlobalDebug() // Restore component-specific levels
```

## Advanced Features

### Performance Optimizations

1. **Log Batching**: Production environment batches logs within 100ms windows to reduce console I/O
2. **Level Memoization**: Caches level checks to avoid repeated computations
3. **Lazy Evaluation**: Expensive operations only executed when log level is enabled
4. **Memory Management**: Cached logger instances with LRU eviction

### Runtime Filtering

```javascript
// Configure dynamic filtering
configureRuntimeFilter({
  enabled: true,
  minLevel: LOG_LEVELS.INFO,
  allowedComponents: ['Translation', 'Core'],
  allowedPatterns: [/error/i, /warning/i],
  blockedPatterns: [/debug.*test/i]
})
```

## Troubleshooting

### TDZ (Temporal Dead Zone) Errors

**✅ RESOLVED:** All TDZ issues have been fixed in utility modules.

**Previous Error:** `Cannot access 'LOG_COMPONENTS' before initialization`

**Root Cause:** Early-loaded utility modules trying to access LOG_COMPONENTS during module evaluation.

**Solution Applied:** Implemented lazy initialization pattern in affected modules:

```javascript
// Fixed in: i18n.js, textDetection.js, detection.js
let logger = null;
const getLogger = () => {
  if (!logger) {
    logger = getScopedLogger(LOG_COMPONENTS.TEXT, 'textDetection');
  }
  return logger;
};
```

**Status:** ✅ All utility modules now use lazy initialization and are TDZ-safe.

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

**Key Files:**
- `src/shared/logging/logger.js` - Main logging implementation (**always use getScopedLogger**)
- `src/shared/logging/logConstants.js` - Constants and component definitions

## Best Practices by Component Type

### Core Components (Background, Core, Content)
- Use `INFO` for important lifecycle events
- Use `DEBUG` for detailed operational flow
- Use `ERROR` for critical failures
- Example: Background service startup, content script initialization

### Feature Components (Translation, TTS, ScreenCapture, etc.)
- Use `INFO` for feature state changes
- Use `DEBUG` for feature-specific operations
- Use `WARN` for recoverable issues
- Example: Translation completed, TTS started, screen capture processed

### UI Components (UI, Popup, Sidepanel, Options)
- Use `INFO` for user interactions
- Use `DEBUG` for UI state changes
- Use `WARN` for UI-related issues
- Example: Button clicked, panel opened, settings saved

### Shared Systems (Messaging, Storage, Error, Config)
- Use `INFO` for system-level events
- Use `WARN` for non-critical system issues
- Use `ERROR` for system failures
- Example: Message sent, storage error, config updated

### Utility Components (Utils, Browser, Text, Framework)
- Use `DEBUG` for utility operations
- Use `WARN` for utility deprecations
- Generally reduce noise in utilities
- Example: Text processed, browser API called

## Summary

The logging system provides:
- **✅ Fully Migrated**: 100% modern API, zero legacy code
- **Environment-Aware**: Automatic development vs production detection
- **Component-Based**: Organized by categories with individual log levels
- **Structured Logging**: Support for objects and structured data
- **Performance-Optimized**: Level checking + lazy evaluation prevent unnecessary work
- **Memory Efficient**: Cached logger instances prevent object duplication
- **TDZ-Safe**: Lazy initialization prevents temporal dead zone errors in utility modules
- **Easy Configuration**: Simple API for adjusting log levels at runtime

**Key Insight**: Use `getScopedLogger()` universally - it's the only logging API you need. For early-loaded utility modules, use lazy initialization to prevent TDZ issues.

## Architecture Benefits

### 🚀 Performance Features
- **Lazy Evaluation**: `debugLazy()` and `infoLazy()` only execute when level is enabled
- **Level Gating**: Early return prevents expensive string formatting
- **Instance Caching**: Same logger object reused for identical component/subcomponent
- **Frozen Objects**: Logger instances are immutable to prevent accidental modification

### 🛡️ Reliability Features
- **TDZ Prevention**: Lazy initialization pattern prevents temporal dead zone errors in utility modules
- **Circular Dependency Safe**: Minimal imports prevent initialization order issues
- **Error Boundary**: Logger failures don't crash the application
- **Memory Leak Prevention**: Cached instances with proper cleanup

### 🧩 Developer Experience
- **Single API**: Only one way to create loggers (no confusion)
- **Autocomplete**: Full TypeScript-like intellisense for components
- **Consistent Formatting**: Automatic timestamps and component prefixes
- **Easy Debugging**: Runtime level adjustment without code changes

### 🔧 Maintenance Benefits
- **Zero Legacy Debt**: Clean migration completed September 2025
- **Build Verified**: Chrome + Firefox extensions build successfully with TDZ fixes
- **Test Ready**: Reset utilities for unit tests
- **Future Proof**: Ready for advanced features (rate limiting, remote logging, etc.)

## Cache & Internals

- **Cache Keys**: `Component` or `Component::SubComponent`
- **Global Storage**: `globalThis.__TRANSLATE_IT__.__LOGGER_CACHE` (TDZ-safe)
- **Memory Strategy**: Cached instance re-used (memory efficiency & identity comparisons)
- **Test Helper**: `__resetLoggingSystemForTests()` clears cache and restores defaults
- **Import Strategy**: Logger core only imports LOG_LEVELS to minimize circular dependencies

## Cross-World Communication for Console Debugging

### Problem: Manifest V3 Isolated Worlds
In Manifest V3 extensions, content scripts run in **isolated worlds** separate from the main page context. This creates challenges when trying to expose debugging interfaces that can be accessed from the browser's Console tab.

### Failed Approaches ❌

1. **Direct Window Property Assignment**
   ```javascript
   // ❌ DOESN'T WORK - Not accessible from Console
   window.__MyDebugInterface = debugObject;
   ```
   **Why it fails**: Console runs in main world, content script runs in isolated world.

2. **Script Tag Injection**
   ```javascript
   // ❌ DOESN'T WORK - CSP restrictions
   const script = document.createElement('script');
   script.textContent = `window.__MyDebugInterface = ${JSON.stringify(interface)};`;
   document.head.appendChild(script);
   ```
   **Why it fails**: Content Security Policy (CSP) blocks inline scripts.

3. **globalThis Assignment**
   ```javascript
   // ❌ DOESN'T WORK - Still isolated
   globalThis.__MyDebugInterface = debugObject;
   ```
   **Why it fails**: Still within isolated world context.

4. **document.documentElement.dataset**
   ```javascript
   // ❌ DOESN'T WORK - Limited data types
   document.documentElement.dataset.debugInterface = JSON.stringify(interface);
   ```
   **Why it fails**: Can only pass serialized data, not functions.

### Working Solution ✅: PostMessage Communication

The **only reliable solution** for Manifest V3 is using `window.postMessage()` for cross-world communication:

#### Implementation Pattern
```javascript
// In Content Script (Isolated World)
class MyManager {
  setupDebugInterface() {
    // Listen for commands from main world (Console)
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;

      const { type, ...params } = event.data;

      if (type === 'MY_DEBUG_COMMAND') {
        this.handleDebugCommand(params);

        // Send response back to main world
        window.postMessage({
          type: 'MY_DEBUG_RESPONSE',
          result: 'Command executed successfully'
        }, '*');
      }
    });

    // Display available commands in Console
    this.displayConsoleHelp();
  }

  displayConsoleHelp() {
    console.log('\n🚀 Debug Commands Available:');
    console.log('===============================================');
    console.log('window.postMessage({type:"MY_DEBUG_COMMAND",param:"value"},"*")');
    console.log('===============================================\n');
  }
}
```

#### Console Usage
```javascript
// Commands that work in Browser Console:
window.postMessage({type:'MY_DEBUG_COMMAND', param:'value'}, '*')

// Listen for responses:
window.addEventListener('message', (event) => {
  if (event.data.type === 'MY_DEBUG_RESPONSE') {
    console.log('Response:', event.data.result);
  }
});
```

### Best Practices for PostMessage Debugging

1. **Use Unique Message Types**
   ```javascript
   // Good: Namespace your messages
   window.postMessage({type:'TRANSLATE_IT_SET_MODE', mode:'simple'}, '*')

   // Avoid: Generic types
   window.postMessage({type:'SET_MODE', mode:'simple'}, '*')
   ```

2. **Provide Console Help**
   ```javascript
   const createConsoleHelpers = () => {
     console.log('\n🚀 MyExtension Debug Mode');
     console.log('===============================================');
     console.log('Available commands:');
     console.log('window.postMessage({type:"MY_COMMAND",value:"test"},'*')');
     console.log('===============================================\n');
   };
   ```

3. **Handle Responses Gracefully**
   ```javascript
   // Set up response listener
   window.addEventListener('message', (event) => {
     if (event.source !== window) return;
     if (event.data.type === 'MY_RESPONSE') {
       console.log('✅ Success:', event.data.result);
     }
   });
   ```

4. **Validate Message Structure**
   ```javascript
   window.addEventListener('message', (event) => {
     if (event.source !== window) return;

     const { type, ...params } = event.data;

     // Validate expected message types
     if (!type || !type.startsWith('MY_EXTENSION_')) return;

     this.handleCommand(type, params);
   });
   ```

### Security Considerations

1. **Always Check Event Source**
   ```javascript
   window.addEventListener('message', (event) => {
     if (event.source !== window) return; // IMPORTANT: Only accept same-window messages
     // ... handle message
   });
   ```

2. **Validate Message Types**
   ```javascript
   const ALLOWED_TYPES = [
     'MY_EXTENSION_COMMAND_1',
     'MY_EXTENSION_COMMAND_2'
   ];

   if (!ALLOWED_TYPES.includes(type)) return;
   ```

3. **Sanitize Parameters**
   ```javascript
   if (type === 'MY_COMMAND' && typeof params.value === 'string') {
     this.handleCommand(params.value);
   }
   ```

### Real-World Example: SelectElementManager

```javascript
// Content Script Implementation
setupPostMessageInterface() {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    const { type, mode } = event.data;

    if (type === 'TRANSLATE_IT_SET_MODE' && mode) {
      this.setMode(mode);
    } else if (type === 'TRANSLATE_IT_GET_MODE') {
      const currentMode = this.getMode();
      window.postMessage({
        type: 'TRANSLATE_IT_MODE_RESPONSE',
        mode: currentMode
      }, '*');
    }
  });

  // Display help in Console
  console.log('\n🚀 TranslateIt Select Manager - Debug Mode');
  console.log('===============================================');
  console.log('Commands:');
  console.log('window.postMessage({type:"TRANSLATE_IT_SET_MODE",mode:"smart"},'*')');
  console.log('window.postMessage({type:"TRANSLATE_IT_GET_MODE"},'*')');
  console.log('===============================================\n');
}
```

```javascript
// Console Usage
window.postMessage({type:'TRANSLATE_IT_SET_MODE',mode:'smart'},'*')
window.postMessage({type:'TRANSLATE_IT_GET_MODE'},'*')

// Listen for responses
window.addEventListener('message', (event) => {
  if (event.data.type === 'TRANSLATE_IT_MODE_RESPONSE') {
    console.log('Current mode:', event.data.mode);
  }
});
```

### Key Insights

1. **PostMessage is the ONLY reliable solution** for Manifest V3 cross-world communication
2. **Always provide Console help** showing available commands
3. **Use unique message types** to avoid conflicts with other extensions/scripts
4. **Validate all incoming messages** for security
5. **Handle responses** to provide feedback to Console users
6. **Keep it simple** - complex debug interfaces become maintenance burdens

This pattern enables powerful debugging capabilities while respecting Manifest V3 security constraints.

---

**📅 Last Updated:** September 27, 2025 - Updated with new architecture, component levels, and optimizations
**📊 Status:** ✅ Production Ready - 100% Modern Logging API with Full TDZ Safety