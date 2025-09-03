# Memory Garbage Collector System

## Overview

The Memory Garbage Collector is a comprehensive system designed to prevent memory leaks in the Translate-It browser extension. It provides automatic resource tracking, smart caching, lifecycle management, and memory monitoring.

## Architecture

```
MemoryManager (Core)
├── ResourceTracker (Mixin for classes)
├── SmartCache (TTL-based cache)
├── GlobalCleanup (Lifecycle hooks)
└── MemoryMonitor (Usage monitoring)
```

## Core Components

### MemoryManager
Central coordinator that tracks all resources, timers, event listeners, and caches.

**Key Features:**
- Resource tracking with cleanup functions
- Group-based cleanup for batch operations
- Automatic timer and event listener management
- Memory usage statistics and leak detection

### ResourceTracker
Mixin class that provides convenient resource tracking methods for other classes.

**Usage:**
```javascript
class MyClass extends ResourceTracker {
  constructor() {
    super('my-group')
    // Now you can use tracking methods
  }
}
```

### SmartCache
Advanced cache with TTL, size limits, and automatic cleanup.

**Features:**
- Time-based expiration (TTL)
- Size-based eviction (LRU)
- Automatic cleanup intervals
- Memory usage tracking

## Integration Examples

### StorageCore Integration
```javascript
class StorageCore extends ResourceTracker {
  constructor() {
    super('storage-core')
    this.cache = new SmartCache({ maxSize: 200, defaultTTL: 60000 })

    // Use tracked event listener
    this.addEventListener(browser.storage.onChanged, 'change', this._changeListener)
  }

  destroy() {
    this.cache.destroy()
    super.destroy()
  }
}
```

### WindowsManager Integration
```javascript
class WindowsManager extends ResourceTracker {
  constructor() {
    super('windows-manager')
    this._setupEventHandlers()
  }

  _setupEventHandlers() {
    // Use tracked event listeners
    this.addEventListener(window, 'beforeunload', this.cleanup.bind(this))
  }

  destroy() {
    super.destroy()
    // Clean up DOM references
    this.displayElement = null
  }
}
```

## Initialization

The system is automatically initialized in both background and content scripts:

```javascript
// In background script
import { initializeGlobalCleanup } from '@/core/memory/GlobalCleanup.js'
import { startMemoryMonitoring } from '@/core/memory/MemoryMonitor.js'

initializeGlobalCleanup()
startMemoryMonitoring()
```

## Development Tools

When running in development mode (localhost), debug utilities are available in the console:

```javascript
// Get memory statistics
window.memoryManager.getStats()

// Generate detailed report
window.memoryManager.generateReport()

// Force garbage collection
window.memoryManager.performGC()

// Detect memory leaks
window.memoryManager.detectLeaks()

// Access monitor and cleanup instances
window.memoryManager.getMonitor()
window.memoryManager.getCleanup()
```

## Memory Thresholds

The system monitors memory usage with configurable thresholds:

- **Warning**: 50MB
- **Critical**: 100MB

When thresholds are exceeded, automatic cleanup is triggered.

## Best Practices

### For Class Authors
1. Extend `ResourceTracker` for automatic resource management
2. Use `SmartCache` instead of `Map` for caching
3. Call `super.destroy()` in your destroy methods
4. Use `this.addEventListener()` instead of direct DOM event listeners

### For Cache Usage
1. Set appropriate TTL values based on data freshness requirements
2. Configure maxSize based on expected usage patterns
3. Call `destroy()` when cache is no longer needed

### For Event Listeners
1. Use `this.addEventListener()` for automatic cleanup
2. Avoid anonymous functions in event listeners
3. Group related listeners by providing descriptive group IDs

## Performance Considerations

- Resource tracking has minimal performance overhead
- SmartCache cleanup runs every 5 minutes automatically
- Memory monitoring checks every 30 seconds
- Global cleanup hooks are lightweight and efficient

## Troubleshooting

### High Memory Usage
1. Check `window.memoryManager.getStats()` for active resources
2. Look for classes not calling `destroy()` properly
3. Verify event listeners are being cleaned up
4. Check cache sizes and TTL settings

### Memory Leaks
1. Use `window.memoryManager.detectLeaks()` to identify trends
2. Check for circular references in cached objects
3. Ensure all `destroy()` methods are called
4. Monitor group cleanup effectiveness

## API Reference

### MemoryManager
- `trackResource(id, cleanupFn, groupId)` - Track a resource
- `trackTimer(timerId, groupId)` - Track a timer
- `trackEventListener(element, event, handler, groupId)` - Track event listener
- `trackCache(cache, options, groupId)` - Track a cache
- `cleanupResource(id)` - Cleanup specific resource
- `cleanupGroup(groupId)` - Cleanup resource group
- `cleanupAll()` - Cleanup all resources
- `getMemoryStats()` - Get memory statistics
- `detectMemoryLeaks()` - Detect potential leaks
- `generateReport()` - Generate detailed report

### ResourceTracker
- `addEventListener(element, event, handler, options)` - Add tracked event listener
- `trackTimeout(callback, delay)` - Track setTimeout
- `trackInterval(callback, delay)` - Track setInterval
- `trackResource(id, cleanupFn)` - Track custom resource
- `trackCache(cache, options)` - Track cache instance
- `clearTimer(timerId)` - Clear tracked timer
- `cleanup()` - Cleanup all tracked resources
- `destroy()` - Destroy tracker

### SmartCache
- `set(key, value, ttl)` - Set with TTL
- `get(key)` - Get with expiry check
- `delete(key)` - Delete and cleanup metadata
- `clear()` - Clear all entries
- `getStats()` - Get cache statistics
- `destroy()` - Destroy cache

## Future Enhancements

- Browser-specific memory optimizations
- Advanced leak detection algorithms
- Performance profiling integration
- Memory usage analytics dashboard
