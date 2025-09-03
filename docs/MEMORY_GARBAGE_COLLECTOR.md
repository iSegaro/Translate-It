# Memory Garbage Collector System

## Overview

The **Memory Garbage Collector** is an advanced memory management system designed specifically for browser extensions to prevent memory leaks and ensure optimal performance. It provides comprehensive resource tracking, automatic cleanup, and support for multiple event system types including DOM EventTargets, Browser Extension APIs, and custom event systems.

## 🎯 Key Features

- **Multi-Event System Support**: Handles DOM, Browser APIs, and custom event systems
- **Automatic Resource Tracking**: Tracks timers, event listeners, caches, and custom resources
- **Smart Cleanup**: Environment-aware cleanup for service workers and content scripts
- **Memory Monitoring**: Real-time memory usage tracking and leak detection
- **TTL-Based Caching**: Intelligent cache management with automatic expiration
- **Group-Based Cleanup**: Batch cleanup of related resources

## 🏗️ Architecture

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

## 📁 File Structure

```
src/core/memory/
├── MemoryManager.js      # Core memory management system
├── ResourceTracker.js    # Resource tracking mixin for classes
├── SmartCache.js         # TTL-based cache with auto cleanup
├── GlobalCleanup.js      # Lifecycle cleanup hooks
├── MemoryMonitor.js      # Memory usage monitoring
└── index.js              # Module exports
```

## 🔧 Core Components

### MemoryManager

The central coordinator that manages all resources and provides cleanup functionality.

**Key Methods:**
- `trackResource(id, cleanupFn, groupId)` - Track custom resources
- `trackTimer(timerId, groupId)` - Track timers
- `trackEventListener(element, event, handler, groupId)` - Track event listeners
- `trackCache(cache, options, groupId)` - Track cache instances
- `cleanupGroup(groupId)` - Cleanup resources by group
- `getMemoryStats()` - Get memory usage statistics

### ResourceTracker

A mixin class that provides convenient methods for tracking resources in other classes.

**Key Methods:**
- `addEventListener(element, event, handler)` - Universal event listener tracking
- `trackTimeout(callback, delay)` - Track timeouts
- `trackInterval(callback, delay)` - Track intervals
- `trackResource(id, cleanupFn)` - Track custom resources
- `trackCache(cache, options)` - Track cache instances
- `cleanup()` - Cleanup all tracked resources

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

## 🎨 Event System Support

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

## 🚀 Usage Examples

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

    // Track timers
    this.trackTimeout(() => {
      console.log('Timeout executed')
    }, 5000)

    // Track custom resources
    this.trackResource('my-api-connection', () => {
      // Cleanup function
      this.disconnectAPI()
    })
  }

  destroy() {
    // Cleanup all tracked resources
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

## 🔄 Integration Points

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

class ActionbarIconManager extends ResourceTracker {
  constructor(storageManager) {
    super('actionbar-icon-manager')
    this.storage = storageManager
    this.init()
  }

  init() {
    // Listen to storage changes (custom event system)
    this.addEventListener(this.storage, 'change', this.updateIcon)
  }
}
```

## 📊 Memory Statistics

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

## ⚙️ Configuration

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

## 🔍 Debugging & Monitoring

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

## 🧪 Testing

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

## 🚨 Error Handling

The system includes comprehensive error handling:

- **Invalid Event Targets**: Warns about unsupported event target types
- **Cleanup Failures**: Logs errors but continues cleanup process
- **Memory Thresholds**: Alerts when memory usage exceeds limits
- **Resource Leaks**: Detects and reports potential memory leaks

## 📈 Performance Considerations

- **WeakMap Usage**: Memory-efficient storage for event listeners
- **Batch Cleanup**: Efficient group-based resource cleanup
- **Lazy Initialization**: Components initialized only when needed
- **Minimal Overhead**: Lightweight tracking with minimal performance impact

## 🔄 Lifecycle Management

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

## 🎯 Best Practices

1. **Always Extend ResourceTracker**: Use the mixin for automatic resource management
2. **Use Group IDs**: Organize resources by feature or component
3. **Cleanup on Destroy**: Always call cleanup() when components are destroyed
4. **Monitor Memory Usage**: Regularly check memory statistics
5. **Handle Custom Events**: Use the universal addEventListener for all event types

## 🔗 Related Systems

- **[Storage Manager](STORAGE_MANAGER.md)**: Integrated with Memory Garbage Collector
- **[Error Management](ERROR_MANAGEMENT_SYSTEM.md)**: Works with memory monitoring
- **[Logging System](LOGGING_SYSTEM.md)**: Logs memory events and statistics
- **[Windows Manager](WINDOWS_MANAGER_UI_HOST_INTEGRATION.md)**: Uses ResourceTracker for cleanup

## 📚 API Reference

### MemoryManager API
- `trackResource(id, cleanupFn, groupId?)`
- `trackTimer(timerId, groupId?)`
- `trackEventListener(element, event, handler, groupId?)`
- `trackCache(cache, options?, groupId?)`
- `cleanupGroup(groupId)`
- `getMemoryStats()`

### ResourceTracker API
- `addEventListener(element, event, handler)`
- `trackTimeout(callback, delay)`
- `trackInterval(callback, delay)`
- `trackResource(id, cleanupFn)`
- `trackCache(cache, options?)`
- `cleanup()`
- `getStats()`

### SmartCache API
- `set(key, value, ttl?)`
- `get(key)`
- `delete(key)`
- `clear()`
- `getStats()`

---

*For implementation details, see the source code in `src/core/memory/`*</content>
<parameter name="filePath">/home/amir/Works/Translate-It/Vue/docs/MEMORY_GARBAGE_COLLECTOR.md
