# Plan: Logging System Implementation Guide

## Overview
This guide provides standardized patterns for implementing and improving logging throughout the Translate-It browser extension project. Following these guidelines ensures consistent, maintainable, and effective logging across all modules.

## Quick Reference: Log Level Usage

| Level | Use For | Examples |
|-------|---------|----------|
| **ERROR** | Critical failures that break functionality | API failures, initialization errors, uncaught exceptions |
| **WARN** | Expected issues that don't break functionality | Deprecations, fallback paths, recoverable errors |
| **INFO** | Important milestones and status changes | Component initialization, major operation completion |
| **DEBUG** | Detailed operational information | Step-by-step processing, individual feature activation |
| **INIT** | System initialization (always shown in dev) | Component setup, service startup |

## Component Categories

### Core Components
- **BACKGROUND**: Background service worker operations
- **CORE**: Core system infrastructure
- **CONTENT**: Content script operations (use sparingly)
- **MESSAGING**: Message passing system
- **UI**: User interface components
- **STORAGE**: Data persistence operations

### Feature Components
- **TRANSLATION**: Translation engine operations
- **TEXT_SELECTION**: Text selection and highlighting
- **NOTIFICATIONS**: User notification system
- **SHORTCUTS**: Keyboard shortcut handling
- **CAPTURE**: Screen/text capture functionality
- **EXCLUSION**: Domain/page exclusion rules

### Specialized Components
- **IFRAME**: Iframe-specific operations
- **CONTENT_APP**: Content application features
- **PROVIDERS**: Translation provider implementations
- **LEGACY**: Legacy code paths (WARN level)

## Implementation Patterns

### 1. Basic Logger Setup

```javascript
// Standard pattern for most components
import { getScopedLogger, LOG_COMPONENTS } from '@/shared/logging/logger.js'

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'MyComponent')

// In class constructor
constructor() {
  this.logger = getScopedLogger(LOG_COMPONENTS.UI, 'MyComponent')
}
```

### 2. Lazy Initialization for Utilities

```javascript
// For utility modules imported early (TDZ prevention)
let logger = null;
const getLogger = () => {
  if (!logger) {
    logger = getScopedLogger(LOG_COMPONENTS.TEXT, 'textDetection');
  }
  return logger;
};

// Usage
getLogger().debug('Processing text');
```

### 3. Component Initialization

```javascript
async initialize() {
  try {
    // Setup steps...
    this.logger.init('Component initialized', {
      handlers: this.handlers.length,
      features: this.enabledFeatures
    });
  } catch (error) {
    this.logger.error('Initialization failed', error);
    throw error;
  }
}
```

### 4. Operation Logging

```javascript
// Major operations
async performOperation() {
  this.logger.debug('Starting operation');

  try {
    const result = await this.doWork();
    this.logger.info('Operation completed', {
      duration: result.duration,
      itemsProcessed: result.count
    });
    return result;
  } catch (error) {
    this.logger.error('Operation failed', error);
    throw error;
  }
}
```

### 5. Batched Operations

```javascript
// Instead of individual logs
features.forEach(feature => {
  logger.debug(`Activated feature: ${feature.name}`); // ❌
});

// Use batched logging
const activatedFeatures = features.filter(f => f.activate());
logger.operation(`Features activated: ${activatedFeatures.length}/${features.length} [${activatedFeatures.map(f => f.name).join(', ')}]`);
```

### 6. Error Handling

```javascript
// Good: Include context
logger.error('Translation API failed', {
  provider: 'google',
  textLength: text.length,
  error: error.message,
  timestamp: Date.now()
});

// Avoid: Unstructured
logger.error('Failed to translate ' + text); // ❌
```

### 7. Performance Optimization

```javascript
// Expensive operations - use lazy evaluation
logger.debugLazy(() => [
  'Processed element:',
  {
    id: element.id,
    classes: Array.from(element.classList),
    computedStyles: getComputedStyle(element)
  }
]);

// Avoid: Always computed
logger.debug('Processed element:', getExpensiveData(element)); // ❌
```

## Specific Module Guidelines

### Content Scripts
- Use **CONTENT** component sparingly
- Prefer feature-specific components (TEXT_SELECTION, etc.)
- Batch DOM operations logging
- Use debug level for element processing

```javascript
// Good: Specific component
const logger = getScopedLogger(LOG_COMPONENTS.TEXT_SELECTION, 'HighlightManager');

// Avoid: Generic content
const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'Handler'); // ❌
```

### Feature Managers
- Use feature-specific components
- Log initialization at info level
- Use debug for feature activation details
- Batch similar operations

```javascript
// Good: Feature-specific
logger.init('Text selection manager ready');
logger.debug('Selection handler registered');
```

### Vue Components
- Use **UI** component with sub-component
- Log lifecycle events at debug level
- Use info for significant user actions

```javascript
// Vue component
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'TranslationBox');

onMounted(() => {
  logger.debug('Component mounted');
});

const handleTranslate = () => {
  logger.info('Translation requested');
};
```

### Utility Functions
- Always use lazy initialization
- Choose appropriate utility component
- Keep logging minimal

```javascript
// Utility pattern
let logger = null;
const getLogger = () => {
  if (!logger) {
    logger = getScopedLogger(LOG_COMPONENTS.TEXT, 'extraction');
  }
  return logger;
};
```

## Migration Checklist

When updating a module's logging:

1. **Replace console calls**
   - [ ] `console.log()` → `logger.debug()`
   - [ ] `console.error()` → `logger.error()`
   - [ ] `console.warn()` → `logger.warn()`

2. **Choose appropriate component**
   - [ ] Most specific category available
   - [ ] Avoid generic CONTENT when possible

3. **Adjust log levels**
   - [ ] Initialization → `init()` or `info()`
   - [ ] Milestones → `info()`
   - [ ] Details → `debug()`
   - [ ] Errors → `error()`

4. **Add structure**
   - [ ] Include relevant context objects
   - [ ] Use batched operations for repetition
   - [ ] Consider lazy evaluation for expensive ops

5. **Prevent duplicates**
   - [ ] Check for existing similar logs
   - [ ] Remove redundant success messages
   - [ ] Ensure single source of truth

## Common Anti-Patterns to Avoid

### 1. Overusing INFO Level
```javascript
// ❌ Too verbose for production
logger.info('Processing element');  // Use debug
logger.info('Handler registered');   // Use debug
logger.info('Setup complete');      // OK for milestones
```

### 2. Missing Context
```javascript
// ❌ No context
logger.error('Translation failed');

// ✅ With context
logger.error('Translation failed', {
  provider: options.provider,
  text: text.substring(0, 50),
  error: error.message
});
```

### 3. Duplicate Logs
```javascript
// ❌ Duplicated in multiple places
logger.info('Features loaded');  // In loader
logger.info('Features loaded');  // In manager

// ✅ Single source of truth
```

### 4. Inconsistent Formatting
```javascript
// ❌ Mixed formats
logger.debug('[Component] Processing...');
logger.debug('Component: Processing complete');

// ✅ Consistent
logger.debug('Processing...');
logger.debug('Processing complete');
```

## Integration with Error Management System

The project has a comprehensive error management system that should be used alongside logging. They serve different purposes:

- **Logging**: For operational visibility, debugging, and monitoring
- **Error Management**: For centralized error handling, UI feedback, and user notifications

### When to Use Each System

**Use Logging For:**
- Operational logging (initialization, milestones)
- Debug information and detailed tracking
- Performance monitoring
- Contextual error information (even when using ErrorHandler)

**Use Error Management System For:**
- Errors that might need UI feedback
- Extension context errors (handled silently)
- API configuration errors (missing keys, invalid settings)
- Translation failures requiring user notification
- Any error needing centralized handling

### Integration Pattern

```javascript
import { getScopedLogger, LOG_COMPONENTS } from '@/shared/logging/logger.js'
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js'

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'MyComponent')

async performOperation() {
  try {
    // ... operation code
    logger.info('Operation completed successfully');
  } catch (error) {
    // Use ErrorHandler for centralized error handling
    await ErrorHandler.getInstance().handle(error, {
      context: 'my-component-operation',
      showToast: true,  // Show user notification for critical errors
      isSilent: false   // Don't handle silently
    });

    // Also log for operational visibility
    logger.error('Operation failed', {
      error: error.message,
      stack: error.stack,
      timestamp: Date.now()
    });

    throw error;
  }
}
```

### Error Handling Strategies

| Error Type | ErrorHandler | Logging | Example |
|------------|--------------|---------|---------|
| Critical initialization | showToast: true, isSilent: false | logger.error() | Content script startup failure |
| Feature loading | showToast: false, isSilent: true | logger.error() | Vue app load failure |
 Extension context | N/A (handled by ExtensionContextManager) | logger.debug() | Extension reloaded |
| API configuration | showToast: true, isSilent: false | logger.warn() | Missing API key |
| Network errors | showToast: true, isSilent: false | logger.warn() | Translation failed |
| Debug info | N/A | logger.debug() | Processing details |

## Testing Logging

### Unit Tests
```javascript
// Reset logging system before each test
beforeEach(() => {
  __resetLoggingSystemForTests();
});

// Test log output
it('should log errors correctly', () => {
  const spy = vi.spyOn(console, 'error');
  const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'Test');

  logger.error('Test error');
  expect(spy).toHaveBeenCalledWith(expect.stringContaining('Test error'));
});
```

### Debug Commands
```javascript
// Runtime debugging in console
setLogLevel('global', 3);  // Enable all debug logs
enableGlobalDebug();        // Override all component levels
listLoggerLevels();         // View current configuration
```

## Performance Considerations

1. **Use lazy evaluation** for expensive debug operations
2. **Batch similar operations** to reduce log volume
3. **Choose appropriate levels** to minimize production noise
4. **Cache logger instances** - getScopedLogger does this automatically
5. **Avoid string concatenation** in debug logs that might not be shown

## Review Process

Before submitting logging changes:

1. [ ] Check log levels are appropriate
2. [ ] Verify component categorization
3. [ ] Look for duplicate messages
4. [ ] Ensure error context is included
5. [ ] Test in both development and production modes
6. [ ] Verify no console calls remain

## Resources

- [Logging System Documentation](./LOGGING_SYSTEM.md)
- [Component Constants](../src/shared/logging/logConstants.js)
- [Logger Implementation](../src/shared/logging/logger.js)

---

**Remember**: Good logging helps debug issues efficiently without creating noise. Be selective about what gets logged at each level.