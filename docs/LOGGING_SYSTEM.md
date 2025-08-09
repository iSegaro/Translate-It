# Logging System Documentation

## Overview

The Translate-It extension uses a unified, environment-aware logging system designed to provide clean, structured, and maintainable logging across all components. This system replaces scattered `console.log` calls with a centralized, configurable logging solution.

## Table of Contents

1. [Features](#features)
2. [Quick Start](#quick-start)
3. [System Architecture](#system-architecture)
4. [Log Levels](#log-levels)
5. [Component Categories](#component-categories)
6. [API Reference](#api-reference)
7. [Usage Examples](#usage-examples)
8. [Best Practices](#best-practices)
9. [Configuration](#configuration)
10. [Migration Guide](#migration-guide)
11. [Troubleshooting](#troubleshooting)

## Features

- **Environment-Aware**: Automatic detection of development vs production
- **Component-Based**: Organized by component categories with individual log levels
- **Structured Logging**: Support for objects, arrays, and structured data
- **Timestamp Formatting**: Consistent timestamp format across all logs
- **Performance-Optimized**: Log level checking before message formatting
- **Cross-Browser Compatible**: Works in Chrome, Firefox, and content scripts
- **Easy Configuration**: Simple API for adjusting log levels per component

## Quick Start

### Basic Usage

```javascript
import { createLogger, LOG_COMPONENTS } from '@/utils/core/logger.js';

// Create a logger for your component
const logger = createLogger(LOG_COMPONENTS.CONTENT, 'MyComponent');

// Use different log levels
logger.error('Something went wrong', error);
logger.warn('This is a warning');
logger.info('General information');
logger.debug('Debug details');
logger.init('Component initialized successfully');
```

### Output Example

```
[19:15:28] Content.MyComponent: ✅ Component initialized successfully
[19:15:28] Content.MyComponent: This is a warning
[19:15:29] Content.MyComponent: Something went wrong { message: "Error details", code: 500 }
```

## System Architecture

The logging system consists of several key components:

```
src/utils/core/logger.js
├── LOG_LEVELS          # Error, Warn, Info, Debug levels
├── LOG_COMPONENTS      # Component categories (Core, Content, etc.)
├── createLogger()      # Main logger factory function
├── formatMessage()     # Message formatting with timestamps
└── shouldLog()         # Level-based filtering logic
```

### File Structure

```
src/
├── utils/core/logger.js           # Main logging system
├── components/                    # Vue components using logger
├── content-scripts/               # Content scripts with logger
├── background/                    # Background scripts with logger
└── managers/                      # Various managers with logger
```

## Log Levels

The system uses four log levels with numeric priorities:

| Level | Value | Purpose | When to Use |
|-------|-------|---------|------------|
| `ERROR` | 0 | Critical errors | Exceptions, failures, breaking issues |
| `WARN` | 1 | Warnings | Deprecations, recoverable issues |
| `INFO` | 2 | General information | Important status updates, initialization |
| `DEBUG` | 3 | Detailed debugging | Development details, verbose information |

### Special Log Methods

- `logger.init()`: For component initialization (always shown in development)
- `logger.operation()`: For important operations (INFO level)

## Component Categories

The system organizes logs by component categories:

| Component | Default Level | Purpose |
|-----------|---------------|---------|
| `CORE` | INFO | Core system components |
| `CONTENT` | INFO | Content script components |
| `MESSAGING` | WARN | Messaging system (reduced verbosity) |
| `TRANSLATION` | INFO | Translation-related components |
| `UI` | WARN | User interface components |
| `STORAGE` | WARN | Storage operations |

### Level Behavior

- **Development**: Shows all levels up to component's configured level
- **Production**: Only shows WARN and ERROR levels (configurable)

## API Reference

### Core Functions

#### `createLogger(component, subComponent?)`

Creates a logger instance for a specific component.

```javascript
const logger = createLogger(LOG_COMPONENTS.CONTENT, 'SelectElement');
```

**Parameters:**
- `component` (string): Main component category
- `subComponent` (string, optional): Sub-component name

**Returns:** Logger instance with all logging methods

#### `setLogLevel(component, level)`

Updates log level for a component or globally.

```javascript
import { setLogLevel, LOG_LEVELS, LOG_COMPONENTS } from '@/utils/core/logger.js';

// Set specific component level
setLogLevel(LOG_COMPONENTS.CONTENT, LOG_LEVELS.DEBUG);

// Set global level
setLogLevel('global', LOG_LEVELS.WARN);
```

#### `getLogLevel(component)`

Retrieves current log level for a component.

```javascript
const currentLevel = getLogLevel(LOG_COMPONENTS.CONTENT);
```

### Logger Instance Methods

#### `logger.error(message, data?)`

Logs error messages (always visible).

```javascript
logger.error('Translation failed', { provider: 'google', text: 'sample' });
```

#### `logger.warn(message, data?)`

Logs warning messages.

```javascript
logger.warn('Deprecated API used', { method: 'oldTranslate' });
```

#### `logger.info(message, data?)`

Logs informational messages.

```javascript
logger.info('Translation completed', { duration: '2.3s' });
```

#### `logger.debug(message, data?)`

Logs debug information (development only).

```javascript
logger.debug('Processing element', { tagName: 'div', id: 'content' });
```

#### `logger.init(message, data?)`

Special method for initialization logs.

```javascript
logger.init('Component initialized', { handlers: 5, shortcuts: 2 });
```

#### `logger.operation(message, data?)`

For important operational logs.

```javascript
logger.operation('Cache cleared', { items: 150 });
```

## Usage Examples

### Vue Component Integration

```javascript
// src/components/shared/TranslationBox.vue
<script setup>
import { createLogger, LOG_COMPONENTS } from '@/utils/core/logger.js';

// Create logger in setup
const logger = createLogger(LOG_COMPONENTS.UI, 'TranslationBox');

const handleTranslation = async () => {
  try {
    logger.debug('Starting translation');
    const result = await translateText();
    logger.info('Translation successful', { length: result.length });
  } catch (error) {
    logger.error('Translation failed', error);
  }
};

// Initialization
onMounted(() => {
  logger.init('TranslationBox mounted');
});
</script>
```

### Content Script Integration

```javascript
// src/content-scripts/select-element.js
import { createLogger, LOG_COMPONENTS } from '../utils/core/logger.js';

class SelectElementManager {
  constructor() {
    this.logger = createLogger(LOG_COMPONENTS.CONTENT, 'SelectElement');
  }
  
  initialize() {
    try {
      this.setupEventListeners();
      this.logger.init('Select element manager initialized');
    } catch (error) {
      this.logger.error('Initialization failed', error);
    }
  }
  
  handleElementClick(element) {
    this.logger.debug('Element clicked', { 
      tagName: element.tagName, 
      id: element.id 
    });
    
    // Process element
    this.logger.operation('Element processed successfully');
  }
}
```

### Background Script Integration

```javascript
// src/background/translation-service.js
import { createLogger, LOG_COMPONENTS } from '../utils/core/logger.js';

class TranslationService {
  constructor() {
    this.logger = createLogger(LOG_COMPONENTS.CORE, 'TranslationService');
  }
  
  async translateText(text, options) {
    this.logger.debug('Translation request', { 
      length: text.length, 
      provider: options.provider 
    });
    
    try {
      const result = await this.callAPI(text, options);
      this.logger.info('Translation completed', { 
        provider: options.provider,
        duration: result.duration 
      });
      return result;
    } catch (error) {
      this.logger.error('Translation API failed', {
        provider: options.provider,
        error: error.message
      });
      throw error;
    }
  }
}
```

### Error Handling Pattern

```javascript
// Recommended error handling with logger
const handleAsyncOperation = async () => {
  try {
    logger.debug('Starting operation');
    await riskyOperation();
    logger.operation('Operation completed successfully');
  } catch (error) {
    // Log error with context
    logger.error('Operation failed', {
      operation: 'riskyOperation',
      timestamp: Date.now(),
      stack: error.stack
    });
    
    // Handle error appropriately
    throw error; // or handle gracefully
  }
};
```

## Best Practices

### 1. Component Naming

Use descriptive component and sub-component names:

```javascript
// Good
const logger = createLogger(LOG_COMPONENTS.CONTENT, 'SelectElement');
const logger = createLogger(LOG_COMPONENTS.UI, 'TranslationBox');

// Avoid
const logger = createLogger(LOG_COMPONENTS.CORE, 'Handler');
```

### 2. Log Level Selection

Choose appropriate log levels:

```javascript
// ERROR: For actual errors
logger.error('API request failed', error);

// WARN: For deprecations or recoverable issues  
logger.warn('Using deprecated method, please migrate');

// INFO: For important status updates
logger.info('Translation completed', { duration: '2.1s' });

// DEBUG: For development details
logger.debug('Processing DOM element', element);
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
});

// Avoid: Unstructured string
logger.error('Translation failed for ' + text + ' using ' + provider);
```

### 4. Initialization Logging

Use `init()` for component initialization:

```javascript
// Good: Clear initialization
logger.init('Component initialized', { 
  handlers: this.handlers.length,
  features: this.enabledFeatures 
});

// Avoid: Generic info
logger.info('Ready');
```

### 5. Performance Considerations

For expensive logging operations:

```javascript
// Good: Check level before expensive operations
if (logger.shouldLog?.('debug')) {
  const expensiveData = generateLargeObject();
  logger.debug('Complex state', expensiveData);
}

// Or use functions for lazy evaluation
logger.debug('State', () => generateLargeObject());
```

## Configuration

### Environment-Based Configuration

The system automatically adjusts based on `NODE_ENV`:

```javascript
// Development: Shows all levels up to component's setting
// Production: Only WARN and ERROR levels
```

### Custom Configuration

Override default levels:

```javascript
import { setLogLevel, LOG_LEVELS, LOG_COMPONENTS } from '@/utils/core/logger.js';

// Enable debug logging for specific component
setLogLevel(LOG_COMPONENTS.TRANSLATION, LOG_LEVELS.DEBUG);

// Set global log level
setLogLevel('global', LOG_LEVELS.INFO);
```

### Component-Specific Levels

Default configuration in `logger.js`:

```javascript
const componentLogLevels = {
  'Core': LOG_LEVELS.INFO,
  'Content': LOG_LEVELS.INFO,     // Shows init, info, warn, error
  'Messaging': LOG_LEVELS.WARN,   // Only warn, error
  'Translation': LOG_LEVELS.INFO,
  'UI': LOG_LEVELS.WARN,          // Reduced verbosity for UI
  'Storage': LOG_LEVELS.WARN      // Only important storage events
};
```

## Migration Guide

### From Console.log

**Before:**
```javascript
console.log('[MyComponent] Initialized');
console.log('[MyComponent] Processing:', data);
console.error('[MyComponent] Failed:', error);
```

**After:**
```javascript
import { createLogger, LOG_COMPONENTS } from '@/utils/core/logger.js';

const logger = createLogger(LOG_COMPONENTS.CONTENT, 'MyComponent');

logger.init('Initialized');
logger.debug('Processing', data);
logger.error('Failed', error);
```

### Migration Checklist

1. **Import logger system** at top of file
2. **Create logger instance** in constructor or setup
3. **Replace console.log** with appropriate level
4. **Add structured data** where helpful
5. **Use init()** for initialization logs
6. **Remove duplicate logs** from repeated calls

### Common Patterns

| Old Pattern | New Pattern |
|-------------|-------------|
| `console.log('[Component] ✅ Success')` | `logger.init('Success')` or `logger.operation('Success')` |
| `console.log('[Component] Processing...')` | `logger.debug('Processing')` |
| `console.error('[Component] Error:', err)` | `logger.error('Error description', err)` |
| `console.warn('[Component] Warning')` | `logger.warn('Warning description')` |

## Troubleshooting

### Common Issues

#### 1. Logger not showing logs

**Symptoms:** No logs appear in console

**Solutions:**
- Check component log level: `getLogLevel(LOG_COMPONENTS.YOUR_COMPONENT)`
- Verify environment (production only shows WARN/ERROR)
- Ensure logger is properly imported

```javascript
// Debug logging level
console.log('Current level:', getLogLevel(LOG_COMPONENTS.CONTENT));

// Force enable debugging
setLogLevel(LOG_COMPONENTS.CONTENT, LOG_LEVELS.DEBUG);
```

#### 2. Too many logs in production

**Symptoms:** Console spam in production builds

**Solutions:**
- Check if `NODE_ENV` is properly set to 'production'
- Verify component levels are appropriate
- Use `debug()` for verbose logs instead of `info()`

#### 3. Import errors

**Symptoms:** `Cannot resolve logger.js` errors

**Solutions:**
- Verify import path: `@/utils/core/logger.js`
- Check if Vite alias `@` is configured
- Use relative imports if needed: `../utils/core/logger.js`

#### 4. Performance impact

**Symptoms:** Logging affecting performance

**Solutions:**
- Use lazy evaluation for expensive data
- Check log levels before complex operations
- Consider reducing log frequency for high-frequency events

```javascript
// Expensive logging - check level first
if (shouldLog(LOG_COMPONENTS.CONTENT, LOG_LEVELS.DEBUG)) {
  logger.debug('Expensive data', generateLargeObject());
}
```

### Debug Commands

For runtime debugging:

```javascript
// In browser console
window.loggerDebug = {
  setLevel: (component, level) => setLogLevel(component, level),
  getLevel: (component) => getLogLevel(component),
  enableAll: () => setLogLevel('global', 3)
};

// Usage
loggerDebug.enableAll(); // Enable all logging
loggerDebug.setLevel('Content', 3); // Enable debug for Content
```

## Advanced Usage

### Custom Log Formatting

For special formatting needs:

```javascript
const logger = createLogger(LOG_COMPONENTS.CONTENT, 'MyComponent');

// Custom formatting function
const logWithContext = (level, message, context) => {
  const contextStr = `[${context.user}@${context.session}]`;
  logger[level](`${contextStr} ${message}`, context.data);
};

logWithContext('info', 'User action', {
  user: 'john',
  session: 'abc123',
  data: { action: 'translate', text: 'hello' }
});
```

### Conditional Logging

```javascript
// Only log in development
const devLogger = {
  debug: (msg, data) => {
    if (process.env.NODE_ENV === 'development') {
      logger.debug(msg, data);
    }
  }
};
```

### Integration with Error Management System

```javascript
import { createLogger, LOG_COMPONENTS } from '@/utils/core/logger.js';
import { ErrorHandler } from '@/error-management/ErrorService.js';

class MyComponent {
  constructor() {
    this.logger = createLogger(LOG_COMPONENTS.CONTENT, 'MyComponent');
    this.errorHandler = ErrorHandler.getInstance();
  }
  
  async handleOperation() {
    try {
      this.logger.debug('Operation starting');
      await riskyOperation();
      this.logger.operation('Operation completed');
    } catch (error) {
      // Log first, then handle through error management
      this.logger.error('Operation failed', error);
      await this.errorHandler.handle(error, { 
        context: 'my-component-operation' 
      });
    }
  }
}
```

---

## Contributing

When adding new components or modifying logging:

1. **Follow naming conventions** for components and sub-components
2. **Use appropriate log levels** based on message importance
3. **Include structured data** for context
4. **Test in both development and production** environments
5. **Update this documentation** if adding new patterns or features

---

*This logging system is designed to grow with the project while maintaining clean, professional console output and excellent debugging capabilities.*