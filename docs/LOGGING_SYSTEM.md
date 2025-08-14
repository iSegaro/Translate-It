# Logging System Guide

The extension uses a unified logging system for structured, environment-aware logging across all components.

## Quick Start

```javascript
import { getScopedLogger, LOG_COMPONENTS } from '@/utils/core/logger.js'

// Prefer cached scoped logger
const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'MyComponent')

// Use different log levels
logger.error('Something went wrong', error)
logger.warn('This is a warning')
logger.info('General information')
logger.debug('Debug details')
logger.init('Component initialized successfully')
```

## Log Levels

| Level | Value | Purpose | When to Use |
|-------|-------|---------|------------|
| `ERROR` | 0 | Critical errors | Exceptions, failures, breaking issues |
| `WARN` | 1 | Warnings | Deprecations, recoverable issues |
| `INFO` | 2 | General information | Important status updates, initialization |
| `DEBUG` | 3 | Detailed debugging | Development details, verbose information |

## Components

Available component categories:

```javascript
LOG_COMPONENTS.CORE        // Core system components
LOG_COMPONENTS.CONTENT     // Content script components  
LOG_COMPONENTS.MESSAGING   // Messaging system
LOG_COMPONENTS.TRANSLATION // Translation-related
LOG_COMPONENTS.UI          // User interface components
LOG_COMPONENTS.STORAGE     // Storage operations
```

## Environment Behavior

- **Development**: Shows all levels up to component's configured level
- **Production**: Only shows WARN and ERROR levels

## API Reference

### getScopedLogger(component, subComponent?)
Returns a cached logger instance for a component (and optional sub-scope). Repeat calls with identical args return the same object.

```javascript
const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'SelectElement')
```

### createLogger(component, subComponent?) (low-level)
Always creates a new instance. Reserved for internal or exceptional meta use-cases. Prefer getScopedLogger in normal code.

### Logger Methods

```javascript
logger.error(message, data?)   // Critical errors (always visible)
logger.warn(message, data?)    // Warnings
logger.info(message, data?)    // General information
logger.debug(message, data?)   // Debug information (development only)
logger.init(message, data?)    // Initialization logs (always shown in dev)
logger.operation(message, data?) // Important operations
```

### Level Management

```javascript
import { setLogLevel, getLogLevel, LOG_LEVELS } from '@/utils/core/logger.js'

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
import { getScopedLogger, LOG_COMPONENTS } from '@/utils/core/logger.js'

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
import { getScopedLogger, LOG_COMPONENTS } from '@/utils/core/logger.js'

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
import { getScopedLogger, LOG_COMPONENTS } from '@/utils/core/logger.js'

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

### 2. Log Level Selection
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

### 3. Structured Data
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

### 4. Initialization Logging
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

### Default Levels
```javascript
// Default levels are internal; inspect with listLoggerLevels() or adjust via setLogLevel().
```

### Runtime Configuration
```javascript
// Enable debug logging for specific component
setLogLevel(LOG_COMPONENTS.TRANSLATION, LOG_LEVELS.DEBUG)

// Set global log level
setLogLevel('global', LOG_LEVELS.INFO)
```

## Migration from console.log

### Common Patterns

| Old Pattern | New Pattern |
|-------------|-------------|
| `console.log('[Component] ✅ Success')` | `logger.init('Success')` or `logger.operation('Success')` |
| `console.log('[Component] Processing...')` | `logger.debug('Processing')` |
| `console.error('[Component] Error:', err)` | `logger.error('Error description', err)` |
| `console.warn('[Component] Warning')` | `logger.warn('Warning description')` |

### Migration Steps
1. Import getScopedLogger at top of file
2. Remove any local lazy singleton wrappers
3. Replace console.log with appropriate level
4. Add structured data where helpful
5. Use init() for initialization logs

## Troubleshooting

### No logs appearing
```javascript
// Check current level
console.log('Current level:', getLogLevel(LOG_COMPONENTS.CONTENT))

// Force enable debugging
setLogLevel(LOG_COMPONENTS.CONTENT, LOG_LEVELS.DEBUG)
```

### Too many logs in production
- Verify `NODE_ENV` is set to 'production'
- Check component levels are appropriate
- Use `debug()` for verbose logs instead of `info()`

### Debug Commands
For runtime debugging in browser console:

```javascript
// Enable all logging
setLogLevel('global', 3)

// Enable debug for specific component
setLogLevel('Content', 3)
```

## File Structure

```
src/utils/core/
├── logger.js          # Main logging system (getScopedLogger, createLogger)
├── logConstants.js    # LOG_LEVELS and LOG_COMPONENTS
```

**Key Files**:
- `src/utils/core/logger.js` - Main logging implementation (use getScopedLogger)
- `src/utils/core/logConstants.js` - Constants and types

## Summary

The logging system provides:
- **Environment-Aware**: Automatic development vs production detection
- **Component-Based**: Organized by categories with individual log levels
- **Structured Logging**: Support for objects and structured data
- **Performance-Optimized**: Level checking before message formatting
- **Easy Configuration**: Simple API for adjusting log levels

**Key Insight**: Use getScopedLogger universally; only reach for createLogger in meta tooling.

## Cache & Internals

- Keys: `Component` or `Component::SubComponent`.
- Cached instance re-used (memory efficiency & simple identity comparisons).
- Test helper: `__resetLoggingSystemForTests()` clears cache and restores defaults.
- Logger core only imports LOG_LEVELS to minimize potential circular or temporal dead zone issues; user code imports LOG_COMPONENTS from `logConstants.js`.
