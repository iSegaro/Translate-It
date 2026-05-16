# Memory Garbage Collector System

## Overview

The **Memory Garbage Collector** is an advanced memory management system designed specifically for browser extensions to prevent memory leaks and ensure optimal performance. It provides comprehensive resource tracking, automatic cleanup, and support for multiple event system types including DOM EventTargets, Browser Extension APIs, and custom event systems.

## Table of Contents

- [Key Features](#key-features)
- [Architecture](#architecture)
- [File Structure](#file-structure)
- [Core Components](#core-components)
- [Event System Support](#event-system-support)
- [Usage Examples](#usage-examples)
- [Vue Composable (useResourceTracker)](#vue-composable-useresourcetracker)
- [Integration Points](#integration-points)
- [Memory Statistics](#memory-statistics)
- [Configuration](#configuration)
- [Debugging & Monitoring](#debugging--monitoring)
- [Testing](#testing)
- [Error Handling](#error-handling)
- [Performance Considerations](#performance-considerations)
- [Lifecycle Management](#lifecycle-management)
- [Best Practices](#best-practices)
- [Related Systems](#related-systems)
- [API Reference](#api-reference)

## Key Features

- **Multi-Event System Support**: Handles DOM, Browser APIs, and custom event systems
- **Automatic Resource Tracking**: Tracks timers, event listeners, caches, and custom resources
- **Critical Protection System**: Prevents cleanup of essential resources during garbage collection
- **Smart Cleanup**: Environment-aware cleanup for service workers and content scripts
- **Memory Monitoring**: Real-time memory usage tracking and leak detection
- **TTL-Based Caching**: Intelligent cache management with automatic expiration
- **Group-Based Cleanup**: Batch cleanup of related resources
- **Cross-Environment Compatibility**: Works in Browser, Node.js, and Service Workers

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                Memory Garbage Collector                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            ResourceTracker (Mixin)                 │   │
│  │  - addEventListener()                              │   │
│  │  - trackTimeout() / trackInterval()                │   │
│  │  - trackResource()                                 │   │
│  │  - trackCache()                                    │   │
│  │  - cleanup()                                       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────┬───────────────────────────────────────┘
                      │
           ┌──────────▼──────────┐
           │   MemoryManager     │
           │  ┌─────────────────┐│
           │  │   SmartCache    ││
           │  │  - TTL-based    ││
           │  │  - LRU eviction ││
           │  │  - Auto cleanup ││
           │  └─────────────────┘│
           │  ┌─────────────────┐│
           │  │ GlobalCleanup   ││
           │  │  - Lifecycle    ││
           │  │  - Environment  ││
           │  │  - Auto hooks   ││
           │  └─────────────────┘│
           │  ┌─────────────────┐│
           │  │ MemoryMonitor   ││
           │  │  - Usage stats  ││
           │  │  - Leak detect  ││
           │  │  - Thresholds   ││
           │  └─────────────────┘│
           └─────────────────────┘
```

## File Structure

```
src/core/memory/
├── MemoryManager.js      # Core memory management system
├── ResourceTracker.js    # Resource tracking mixin for classes
├── SmartCache.js         # TTL-based cache with auto cleanup
├── GlobalCleanup.js      # Lifecycle cleanup hooks
├── MemoryMonitor.js      # Memory usage monitoring
└── index.js              # Module exports
```

## Core Components

### MemoryManager

The central coordinator that manages all resources and provides cleanup functionality.

**Key Methods:**
- `trackResource(id, cleanupFn, groupId, options)` - Track custom resources with critical protection
- `trackTimer(timerId, groupId)` - Track timers
- `trackEventListener(element, event, handler, groupId, options)` - Track event listeners with critical protection
- `trackCache(cache, options, groupId)` - Track cache instances
- `cleanupGroup(groupId)` - Cleanup resources by group
- `clearGroupTimers(groupId)` - Clear only timers and intervals for a specific group
- `getMemoryStats()` - Get memory usage statistics

**Critical Protection:**
- Resources marked with `isCritical: true` are protected from garbage collection
- Essential event listeners (text selection, UI management) remain active
- Critical caches and resources survive memory cleanup cycles

### ResourceTracker

A mixin class that provides convenient methods for tracking resources in other classes.

**Key Methods:**
- `addEventListener(element, event, handler, options)` - Universal event listener tracking with critical support
- `trackTimeout(callback, delay)` - Track timeouts
- `trackInterval(callback, delay)` - Track intervals
- `setTimeout(callback, delay)` - Alias for `trackTimeout` (standard JS ergonomics)
- `setInterval(callback, delay)` - Alias for `trackInterval` (standard JS ergonomics)
- `clearAllTimers()` - Clear only active timeouts and intervals for this tracker
- `trackResource(id, cleanupFn, options)` - Track custom resources with critical protection
- `trackCache(cache, options)` - Track cache instances
- `cleanup()` - Cleanup all tracked resources (respects critical flags)

**Critical Resource Support:**
- `addEventListener(element, 'click', handler, { critical: true })` - Critical event listener
- `trackResource('manager', cleanup, { isCritical: true })` - Critical resource

### SmartCache

TTL-based cache with automatic cleanup and size management.

**Key Features:**
- Time-based expiration (TTL)
- Size-based eviction (LRU)
- Automatic cleanup
- Statistics tracking
- Memory-efficient storage

### GlobalCleanup

Environment-aware cleanup system for browser extension contexts.

**Key Features:**
- Service worker compatibility
- Content script lifecycle management
- Automatic cleanup hooks
- Cross-environment support

### MemoryMonitor

Memory usage monitoring and leak detection system.

**Key Features:**
- Real-time memory tracking
- Configurable thresholds
- Leak detection
- Performance statistics

## Event System Support

The Memory Garbage Collector supports three types of event systems:

### 1. DOM EventTargets
```javascript
// Standard DOM elements
this.addEventListener(window, 'resize', this.handleResize)
this.addEventListener(document, 'click', this.handleClick)
```

### 2. Browser Extension APIs
```javascript
// Browser APIs like chrome.tabs, chrome.storage
this.addEventListener(chrome.tabs, 'onUpdated', this.handleTabUpdate)
this.addEventListener(chrome.storage.onChanged, 'change', this.handleStorageChange)
```

### 3. Custom Event Systems
```javascript
// Custom objects with on/off methods (like StorageCore)
this.addEventListener(storageManager, 'change', this.handleStorageChange)
this.addEventListener(messagingSystem, 'message', this.handleMessage)
```

## Usage Examples

### Basic Class Integration

```javascript
import ResourceTracker from '@/core/memory/ResourceTracker.js'

class MyComponent extends ResourceTracker {
  constructor() {
    super('my-component')
    this.init()
  }

  init() {
    // Track DOM event listeners
    this.addEventListener(window, 'resize', this.handleResize.bind(this))

    // Track critical event listeners (protected from cleanup)
    this.addEventListener(document, 'mousedown', this.handleClick.bind(this), { critical: true })

    // Track timers
    this.trackTimeout(() => {
      console.log('Timeout executed')
    }, 5000)

    // Track custom resources
    this.trackResource('my-api-connection', () => {
      // Cleanup function
      this.disconnectAPI()
    })

    // Track critical resources (protected from cleanup)
    this.trackResource('essential-manager', () => {
      this.manager.cleanup()
      this.manager = null
    }, { isCritical: true })
  }

  destroy() {
    // Cleanup all tracked resources (respects critical flags)
    this.cleanup()
  }
}
```

### Cache Integration

```javascript
import { SmartCache } from '@/core/memory/SmartCache.js'

class DataManager extends ResourceTracker {
  constructor() {
    super('data-manager')
    this.cache = new SmartCache({
      ttl: 300000, // 5 minutes
      maxSize: 100
    })
    this.trackCache(this.cache)
  }

  async getData(key) {
    let data = this.cache.get(key)
    if (!data) {
      data = await this.fetchData(key)
      this.cache.set(key, data)
    }
    return data
  }
}
```

### Storage Integration

```javascript
class SettingsManager extends ResourceTracker {
  constructor(storageManager) {
    super('settings-manager')
    this.storage = storageManager

    // Listen to storage changes (custom event system)
    this.addEventListener(this.storage, 'change', this.handleSettingsChange.bind(this))
  }

  handleSettingsChange(changes) {
    console.log('Settings changed:', changes)
  }
}
```

## Integration Points

### StorageCore Integration
```javascript
// StorageCore.js
import ResourceTracker from '@/core/memory/ResourceTracker.js'

class StorageCore extends ResourceTracker {
  constructor() {
    super('storage-core')
    this.init()
  }

  init() {
    // Listen to browser storage changes
    this.addEventListener(chrome.storage.onChanged, 'change', this.handleStorageChange)
  }
}
```

### WindowsManager Integration
```javascript
// WindowsManager.js
import ResourceTracker from '@/core/memory/ResourceTracker.js'

class WindowsManager extends ResourceTracker {
  constructor() {
    super('windows-manager')
    this.init()
  }

  init() {
    // Track DOM event listeners
    this.addEventListener(window, 'message', this.handleMessage)
    this.addEventListener(document, 'visibilitychange', this.handleVisibility)
  }
}
```

### ActionbarIconManager Integration
```javascript
// ActionbarIconManager.js
import ResourceTracker from '@/core/memory/ResourceTracker.js'

class ActionbarIconManager {
  constructor(storageManager) {
    this.resourceTracker = new ResourceTracker('actionbar-icon-manager')
    this.storage = storageManager
    this.init()
  }

  init() {
    // Listen to storage changes (custom event system) via internal tracker
    this.resourceTracker.addEventListener(this.storage, 'change', this.updateIcon)
  }

  destroy() {
    this.resourceTracker.destroy()
  }
}
```

## Vue Composable (useResourceTracker)

The `useResourceTracker` is a Vue 3 Composition API composable that provides automatic memory management for Vue components. It eliminates the need for manual cleanup by integrating with Vue's lifecycle hooks.

### Key Features

- **Automatic Cleanup**: No manual cleanup required - uses `onBeforeUnmount`
- **Critical Protection Support**: Mark essential resources as critical
- **Vue Integration**: Native Vue 3 Composition API support
- **Zero Memory Leaks**: Prevents memory leaks in Vue components
- **Simple API**: Drop-in replacement for manual ResourceTracker usage
- **Performance Optimized**: Minimal overhead with centralized cleanup

### Installation & Usage

#### 1. Import the composable

```javascript
import { useResourceTracker } from '@/composables/core/useResourceTracker'
```

#### 2. Use in Vue component

```vue
<script setup>
import { useResourceTracker } from '@/composables/core/useResourceTracker'

// Automatic cleanup - no manual intervention needed!
const tracker = useResourceTracker('my-component')
</script>
```

#### 3. Track resources

```javascript
// Event listeners - automatically cleaned up
tracker.addEventListener(window, 'resize', () => {
  console.log('Window resized!')
})

// Timers - automatically cleaned up
tracker.trackTimeout(() => {
  console.log('Timer completed!')
}, 1000)

// Intervals - automatically cleaned up
tracker.trackInterval(() => {
  console.log('Interval tick!')
}, 1000)

// Custom resources - automatically cleaned up
tracker.trackResource('my-api-connection', () => {
  // Cleanup function
  disconnectAPI()
})
```

### Complete Example

```vue
<template>
  <div>
    <button @click="startTimer">Start Timer</button>
    <button @click="addListener">Add Listener</button>
    <p>Timer active: {{ timerActive }}</p>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useResourceTracker } from '@/composables/core/useResourceTracker'

const tracker = useResourceTracker('timer-demo')
const timerActive = ref(false)

const startTimer = () => {
  timerActive.value = true

  // Timer automatically cleaned up when component unmounts
  tracker.trackTimeout(() => {
    timerActive.value = false
    console.log('Timer completed!')
  }, 5000)
}

const addListener = () => {
  // Event listener automatically cleaned up
  tracker.addEventListener(window, 'resize', () => {
    console.log('Window resized!')
  })
}

// No manual cleanup needed!
// Everything is handled automatically by Vue's onBeforeUnmount
</script>
```

### API Reference

#### `useResourceTracker(groupId)`

Creates a new resource tracker instance with automatic cleanup.

**Parameters:**
- `groupId` (string): Unique identifier for grouping resources

**Returns:**
- `ResourceTracker`: Tracker instance for managing resources

#### ResourceTracker Methods

##### `addEventListener(element, event, handler, options?)`

Add event listener with automatic cleanup and optional critical protection.

```javascript
// Regular event listener
tracker.addEventListener(window, 'resize', handleResize)
tracker.addEventListener(document, 'click', handleClick)

// Critical event listener (protected from cleanup)
tracker.addEventListener(document, 'mousedown', handleMouseDown, { critical: true })
tracker.addEventListener(document, 'dblclick', handleDoubleClick, { capture: true, critical: true })
```

##### `trackTimeout(callback, delay)` / `setTimeout(callback, delay)`

Add timeout with automatic cleanup. `setTimeout` is an ergonomic alias.

```javascript
// Using alias (Recommended)
const timerId = tracker.setTimeout(() => {
  console.log('Done!')
}, 1000)

// Using standard method
tracker.trackTimeout(() => { /* ... */ }, 1000)
```

##### `trackInterval(callback, delay)` / `setInterval(callback, delay)`

Add interval with automatic cleanup. `setInterval` is an ergonomic alias.

```javascript
const intervalId = tracker.setInterval(() => {
  console.log('Tick!')
}, 1000)
```

##### `clearAllTimers()`

Clear all active timeouts and intervals associated with this tracker instance. Useful for resetting state without removing event listeners.

```javascript
// Clear all timers (e.g., when a tooltip is about to be reshown)
tracker.clearAllTimers()
```

##### `trackResource(id, cleanupFn, options?)`

Add custom resource with automatic cleanup and optional critical protection.

```javascript
// Regular resource
tracker.trackResource('api-connection', () => {
  // Cleanup logic
  disconnectAPI()
})

// Critical resource (protected from cleanup)
tracker.trackResource('essential-manager', () => {
  manager.cleanup()
}, { isCritical: true })
```

##### `trackCache(cache, options?)`

Add cache with automatic cleanup.

```javascript
const cache = new SmartCache({ maxSize: 100 })
tracker.trackCache(cache)
```

### Automatic Cleanup in Vue Components

The system provides a specialized composable for automatic resource tracking within Vue components.

```vue
<script setup>
import { useResourceTracker } from '@/composables/core/useResourceTracker'

const tracker = useResourceTracker('my-component')
// No manual cleanup needed! The tracker automatically cleans up when the component is unmounted.
</script>
```

### Important Notes

1. **Vue Components Only**: Use only in Vue components, not in regular classes
2. **Unique Group IDs**: Use unique IDs for each component
3. **Automatic Cleanup**: Never call manual cleanup
4. **Ergonomic Aliases**: Prefer `setTimeout` and `setInterval` for better readability
5. **Granular Cleanup**: Use `clearAllTimers()` for safe state resets

### Integration with Other Systems

- **ResourceTracker**: Base class for resource management
- **SmartCache**: Intelligent caching with TTL
- **MemoryManager**: Centralized memory management
- **MemoryMonitor**: Memory usage monitoring

---

## Memory Statistics

The system provides comprehensive memory statistics:

```javascript
const stats = memoryManager.getMemoryStats()
console.log(stats)
/*
{
  totalResources: 15,
  cleanupCount: 3,
  memoryUsage: 2048576, // bytes
  groups: {
    'default': 5,
    'ui-components': 8,
    'background': 2
  },
  cacheStats: {
    hits: 45,
    misses: 12,
    evictions: 3
  }
}
*/
```

## Configuration

### MemoryManager Configuration
```javascript
const memoryManager = new MemoryManager({
  enableMonitoring: true,
  monitoringInterval: 30000, // 30 seconds
  leakThreshold: 50 * 1024 * 1024, // 50MB
  cleanupInterval: 60000 // 1 minute
})
```

### SmartCache Configuration
```javascript
const cache = new SmartCache({
  ttl: 300000, // 5 minutes
  maxSize: 100,
  cleanupInterval: 60000, // 1 minute
  enableStats: true
})
```

## Debugging & Monitoring

### Enable Debug Logging
```javascript
// Enable debug mode
memoryManager.enableDebug()

// Monitor specific group
memoryManager.monitorGroup('ui-components')

// Get detailed stats
const detailedStats = memoryManager.getDetailedStats()
```

### Memory Leak Detection
```javascript
// Check for potential leaks
const leaks = memoryManager.detectLeaks()
if (leaks.length > 0) {
  console.warn('Potential memory leaks detected:', leaks)
}
```

## Testing

### Unit Tests
```javascript
// Test resource tracking
describe('ResourceTracker', () => {
  it('should track and cleanup event listeners', () => {
    const tracker = new ResourceTracker('test')
    const mockElement = { addEventListener: jest.fn(), removeEventListener: jest.fn() }

    tracker.addEventListener(mockElement, 'click', () => {})
    expect(mockElement.addEventListener).toHaveBeenCalled()

    tracker.cleanup()
    expect(mockElement.removeEventListener).toHaveBeenCalled()
  })

  it('should clear only timers with clearAllTimers', () => {
    const tracker = new ResourceTracker('test')
    tracker.setTimeout(() => {}, 1000)
    tracker.clearAllTimers()
    // Timers are cleared but tracker stays active
  })
})
```

### Integration Tests
```javascript
// Test with browser APIs
describe('Browser API Integration', () => {
  it('should handle browser extension APIs', () => {
    const tracker = new ResourceTracker('test')
    const mockAPI = {
      addListener: jest.fn(),
      removeListener: jest.fn()
    }

    tracker.addEventListener(mockAPI, 'update', () => {})
    expect(mockAPI.addListener).toHaveBeenCalled()
  })
})
```

## Error Handling

The system includes comprehensive error handling:

- **Invalid Event Targets**: Warns about unsupported event target types
- **Cleanup Failures**: Logs errors but continues cleanup process
- **Memory Thresholds**: Alerts when memory usage exceeds limits
- **Resource Leaks**: Detects and reports potential memory leaks

## Critical Protection System

### Overview

The Critical Protection System prevents essential resources from being cleaned up during garbage collection cycles, ensuring stable operation of core functionality.

### Features

- **Event Listener Protection**: Critical event listeners survive memory cleanup
- **Resource Protection**: Essential managers and components remain active
- **Cache Protection**: Important caches are preserved during cleanup
- **Backward Compatibility**: Existing code works without modification

### Usage Examples

#### Critical Event Listeners
```javascript
// Text selection handlers - must survive cleanup
this.addEventListener(document, 'mousedown', handler, { critical: true })
this.addEventListener(document, 'selectionchange', handler, { critical: true })
this.addEventListener(document, 'dblclick', handler, { capture: true, critical: true })
```

#### Critical Resources
```javascript
// Essential managers - must survive cleanup
this.trackResource('text-selection-manager', () => {
  if (this.textSelectionManager) {
    this.textSelectionManager.cleanup()
    this.textSelectionManager = null
  }
}, { isCritical: true })
```

#### Critical Caches
```javascript
// Important caches - must survive cleanup
this.trackCache(settingsCache, { isCritical: true })
this.trackCache(providerCache, { isCritical: true })
```

### When to Use Critical Protection

**Use for:**
- Essential UI event handlers (text selection, element highlighting)
- Core system managers (SelectElementManager, TextSelectionManager, WindowsManager)
- Essential UI services (ToastIntegration, ElementHighlighter)
- Configuration caches (settings, provider configs)
- Critical timers (polling, health checks)

**Don't use for:**
- FeatureManager itself (should allow cleanup of non-critical handlers)
- Optional features (TextFieldIconHandler, shortcut handlers)
- Temporary event listeners (modal interactions, tooltips)
- One-time operations (API calls, animations)
- Debug/development resources
- Non-essential features

### Implementation Details

Critical resources are tracked with metadata:
```javascript
// MemoryManager storage structure
const resourceInfo = {
  cleanupFn: () => { /* cleanup logic */ },
  isCritical: true  // Protected from cleanup
}
```

During cleanup, the system checks the `isCritical` flag:
```javascript
if (resourceInfo.isCritical) {
  logger.debug(`Skipping critical resource: ${resourceId}`)
  return // Skip cleanup
}
```

## Performance Considerations

- **WeakMap Usage**: Memory-efficient storage for event listeners
- **Batch Cleanup**: Efficient group-based resource cleanup
- **Lazy Initialization**: Components initialized only when needed
- **Minimal Overhead**: Lightweight tracking with minimal performance impact
- **Critical Protection**: Zero performance impact - simple flag checking

## Lifecycle Management

### Service Worker Context
```javascript
// GlobalCleanup automatically handles service worker lifecycle
import { GlobalCleanup } from '@/core/memory/GlobalCleanup.js'

// Initialize in background script
GlobalCleanup.init('service-worker')
```

### Content Script Context
```javascript
// Initialize in content script
GlobalCleanup.init('content-script')

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  GlobalCleanup.cleanup()
})
```

## Best Practices

1. **Always Extend ResourceTracker**: Use the mixin for automatic resource management
2. **Use Group IDs**: Organize resources by feature or component
3. **Cleanup on Destroy**: Always call cleanup() when components are destroyed
4. **Monitor Memory Usage**: Regularly check memory statistics
5. **Handle Custom Events**: Use the universal addEventListener for all event types
6. **Prefer Ergonomic Timer Methods**: Use `setTimeout` and `setInterval` for cleaner code

## Related Systems

- **[Storage Manager](STORAGE_MANAGER.md)**: Integrated with Memory Garbage Collector
- **[Error Management](ERROR_MANAGEMENT_SYSTEM.md)**: Works with memory monitoring
- **[Logging System](LOGGING_SYSTEM.md)**: Logs memory events and statistics
- **[Windows Manager](WINDOWS_MANAGER_UI_HOST_INTEGRATION.md)**: Uses ResourceTracker for cleanup

## API Reference

### MemoryManager API
- `trackResource(id, cleanupFn, groupId?, options?)` - Options: `{ isCritical: boolean }`
- `trackTimer(timerId, groupId?)`
- `trackEventListener(element, event, handler, groupId?, options?)` - Options: `{ isCritical: boolean }`
- `trackCache(cache, options?, groupId?)`
- `cleanupGroup(groupId)` - Respects critical protection
- `clearGroupTimers(groupId)` - Clear only timers/intervals in a group
- `cleanupResource(resourceId)` - Skips critical resources
- `getMemoryStats()`

### ResourceTracker API
- `addEventListener(element, event, handler, options?)` - Options: `{ critical: boolean, ...DOMOptions }`
- `trackTimeout(callback, delay)` / `setTimeout(callback, delay)`
- `trackInterval(callback, delay)` / `setInterval(callback, delay)`
- `clearAllTimers()` - Clear only active timeouts and intervals
- `trackResource(id, cleanupFn, options?)` - Options: `{ isCritical: boolean }`
- `trackCache(cache, options?)`
- `cleanup()` - Respects critical protection
- `getStats()`

### SmartCache API
- `set(key, value, ttl?)`
- `get(key)`
- `delete(key)`
- `clear()`
- `getStats()`

---

*For implementation details, see the source code in `src/core/memory/`*