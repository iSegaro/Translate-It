# Memory Garbage Collector Implementation Plan

## هدف کلی
پیاده‌سازی یک سیستم Memory Garbage Collector برای جلوگیری از memory leaks در browser extension و بهبود performance.

## تحلیل وضعیت فعلی

### منابع احتمالی Memory Leak:

#### 1. Event Listeners بدون Cleanup
- **StorageCore.js**: `browser.storage.onChanged.addListener()` بدون removeListener
- **ActionbarIconManager.js**: `storageManager.on('change')` بدون cleanup
- **WindowsManager.js**: Multiple event handlers بدون proper disposal
- **ReliableMessaging.js**: Event listeners در messaging system

#### 2. Cache Systems بدون محدودیت
- **ActionbarIconManager.js**: `Map()` cache بدون TTL/size limit
- **StorageCore.js**: `Map()` cache بدون cleanup mechanism
- Multiple Map/WeakMap instances در components مختلف بدون memory management

#### 3. Timer Management Issues
- `setTimeout/setInterval` در messaging و animation systems
- Circuit breaker timers در ReliableMessaging
- Animation timers که ممکن است clear نشوند

#### 4. DOM References
- Element references که garbage collect نمی‌شوند
- Cross-frame communication references
- Translation window elements

## راه‌حل پیشنهادی: Memory Manager System

### Phase 1: Core Memory Manager

#### 1.1 ایجاد Memory Manager اصلی
```javascript
// File: src/core/memory/MemoryManager.js
class MemoryManager {
  constructor() {
    this.resources = new Map() // resourceId -> cleanup function
    this.groups = new Map() // groupId -> Set of resourceIds
    this.timers = new Set()
    this.eventListeners = new WeakMap()
    this.caches = new Set()
    this.stats = {
      totalResources: 0,
      cleanupCount: 0,
      memoryUsage: 0
    }
  }

  // Resource tracking
  trackResource(resource, cleanupFn, groupId = 'default')
  trackTimer(timerId, groupId = 'default')
  trackEventListener(element, event, handler, groupId = 'default')
  trackCache(cache, options = {}, groupId = 'default')

  // Cleanup methods
  cleanupResource(resourceId)
  cleanupGroup(groupId)
  cleanupAll()
  performGarbageCollection()

  // Monitoring
  getMemoryStats()
  detectMemoryLeaks()
  generateReport()
}
```

#### 1.2 Resource Tracker Mixin
```javascript
// File: src/core/memory/ResourceTracker.js
class ResourceTracker {
  constructor(groupId) {
    this.groupId = groupId
    this.memoryManager = getMemoryManager()
    this.resources = new Set()
  }

  trackTimer(callback, delay) {
    const timerId = setTimeout(callback, delay)
    this.memoryManager.trackTimer(timerId, this.groupId)
    return timerId
  }

  trackInterval(callback, delay) {
    const intervalId = setInterval(callback, delay)
    this.memoryManager.trackTimer(intervalId, this.groupId)
    return intervalId
  }

  addEventListener(element, event, handler, options) {
    element.addEventListener(event, handler, options)
    this.memoryManager.trackEventListener(element, event, handler, this.groupId)
  }

  cleanup() {
    this.memoryManager.cleanupGroup(this.groupId)
  }
}
```

### Phase 2: Smart Cache System

#### 2.1 Smart Cache با TTL و Size Limits
```javascript
// File: src/core/memory/SmartCache.js
class SmartCache extends Map {
  constructor(options = {}) {
    super()
    this.maxSize = options.maxSize || 100
    this.defaultTTL = options.defaultTTL || 30 * 60 * 1000 // 30 min
    this.accessTimes = new Map()
    this.expiryTimes = new Map()
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000) // 5 min
  }

  set(key, value, ttl = this.defaultTTL) {
    // Check size limit
    if (this.size >= this.maxSize && !this.has(key)) {
      this.evictLRU()
    }

    // Set value with TTL
    super.set(key, value)
    this.accessTimes.set(key, Date.now())
    this.expiryTimes.set(key, Date.now() + ttl)

    return this
  }

  get(key) {
    // Check expiry
    if (this.isExpired(key)) {
      this.delete(key)
      return undefined
    }

    // Update access time for LRU
    this.accessTimes.set(key, Date.now())
    return super.get(key)
  }

  isExpired(key)
  evictLRU()
  cleanup()
  getStats()
  destroy()
}
```

### Phase 3: Integration با Classes موجود

#### 3.1 بروزرسانی StorageCore
```javascript
// File: src/shared/storage/core/StorageCore.js - Updates
class StorageCore extends ResourceTracker {
  constructor() {
    super('storage-core')
    // Replace Map with SmartCache
    this.cache = new SmartCache({ maxSize: 200, defaultTTL: 60000 })
    // ... existing code
  }

  _setupChangeListener() {
    // Use trackEventListener instead of direct addListener
    this.addEventListener(browser.storage.onChanged, 'change', this._changeListener)
  }

  destroy() {
    // Cleanup all resources
    this.cleanup()
    this.cache.destroy()
  }
}
```

#### 3.2 بروزرسانی ActionbarIconManager  
```javascript
// File: src/utils/browser/ActionbarIconManager.js - Updates
class ActionbarIconManager extends ResourceTracker {
  constructor() {
    super('actionbar-icon-manager')
    // Replace Map with SmartCache
    this.iconCache = new SmartCache({ maxSize: 50, defaultTTL: 1800000 })
    // ... existing code
  }

  async initialize() {
    // Use tracked event listener
    this.addEventListener(storageManager, 'change', async (data) => {
      // ... existing logic
    })
  }

  destroy() {
    this.cleanup()
    this.iconCache.destroy()
  }
}
```

#### 3.3 بروزرسانی WindowsManager
```javascript  
// File: src/features/windows/managers/WindowsManager.js - Updates
class WindowsManager extends ResourceTracker {
  constructor(options = {}) {
    super('windows-manager')
    // ... existing code
  }

  _setupEventHandlers() {
    // Use tracked event listeners
    this.addEventListener(document, 'click', this.handleOutsideClick.bind(this))
    this.addEventListener(window, 'beforeunload', this.cleanup.bind(this))
  }

  destroy() {
    this.cleanup()
    // Clean up DOM references
    this.displayElement = null
    this.innerContainer = null
    this.icon = null
  }
}
```

### Phase 4: Lifecycle Hooks

#### 4.1 Global Cleanup Hooks
```javascript
// File: src/core/memory/GlobalCleanup.js
class GlobalCleanup {
  constructor() {
    this.memoryManager = getMemoryManager()
    this.setupHooks()
  }

  setupHooks() {
    // Before unload cleanup
    window.addEventListener('beforeunload', () => {
      this.memoryManager.cleanupAll()
    })

    // Extension context invalidation cleanup
    browser.runtime.onConnect.addListener(() => {
      // Check if context is still valid
      if (this.isContextInvalid()) {
        this.memoryManager.cleanupAll()
      }
    })

    // Periodic garbage collection (every 5 minutes)
    this.gcInterval = setInterval(() => {
      this.memoryManager.performGarbageCollection()
    }, 5 * 60 * 1000)
  }

  isContextInvalid() {
    try {
      browser.runtime.getURL('')
      return false
    } catch (error) {
      return true
    }
  }
}
```

### Phase 5: Memory Monitoring

#### 5.1 Memory Monitor
```javascript
// File: src/core/memory/MemoryMonitor.js
class MemoryMonitor {
  constructor() {
    this.memoryManager = getMemoryManager()
    this.measurements = []
    this.thresholds = {
      warning: 50 * 1024 * 1024, // 50MB
      critical: 100 * 1024 * 1024 // 100MB
    }
  }

  startMonitoring() {
    this.monitorInterval = setInterval(() => {
      this.measureMemory()
      this.checkThresholds()
      this.detectLeaks()
    }, 30 * 1000) // Every 30 seconds
  }

  measureMemory() {
    if (performance.memory) {
      const measurement = {
        timestamp: Date.now(),
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit
      }
      this.measurements.push(measurement)
      // Keep only last 100 measurements
      if (this.measurements.length > 100) {
        this.measurements.shift()
      }
      return measurement
    }
  }

  checkThresholds() {
    const current = this.getCurrentMemory()
    if (current > this.thresholds.critical) {
      this.handleCriticalMemory()
    } else if (current > this.thresholds.warning) {
      this.handleWarningMemory()
    }
  }

  detectLeaks() {
    // Analyze trend in memory usage
    if (this.measurements.length >= 10) {
      const recent = this.measurements.slice(-10)
      const increasing = recent.every((curr, i) => 
        i === 0 || curr.used > recent[i-1].used
      )
      if (increasing) {
        console.warn('Potential memory leak detected')
        this.memoryManager.performGarbageCollection()
      }
    }
  }

  generateReport()
  exportDiagnostics()
}
```

## Implementation Roadmap

### Week 1: Core Infrastructure
- [ ] ایجاد MemoryManager class
- [ ] ایجاد ResourceTracker mixin
- [ ] ایجاد SmartCache class
- [ ] Unit tests برای core components

### Week 2: Integration Phase 1
- [ ] Integration با StorageCore
- [ ] Integration با ActionbarIconManager
- [ ] Testing و validation
- [ ] Performance benchmarks

### Week 3: Integration Phase 2  
- [ ] Integration با WindowsManager
- [ ] Integration با messaging systems
- [ ] Integration با ReliableMessaging
- [ ] Cross-component testing

### Week 4: Monitoring و Finalization
- [ ] MemoryMonitor implementation
- [ ] GlobalCleanup hooks
- [ ] Performance optimization
- [ ] Documentation و guidelines

## Testing Strategy

### Unit Tests
- MemoryManager resource tracking
- SmartCache TTL و size limits
- ResourceTracker cleanup functionality

### Integration Tests
- End-to-end memory lifecycle
- Extension reload scenarios
- Cross-frame cleanup

### Performance Tests
- Memory usage before/after
- Cleanup timing benchmarks
- Large dataset handling

## Success Metrics

### Performance Metrics
- Memory usage reduction: Target 30-50%
- Cleanup time: < 100ms per group
- Cache hit rate: > 80%

### Reliability Metrics  
- Zero memory leaks in 24h stress test
- Successful cleanup در 100% of scenarios
- No performance degradation

## Monitoring و Maintenance

### Development Tools
```javascript
// Debug console commands
window.memoryManager.getStats()
window.memoryManager.generateReport()  
window.memoryManager.detectMemoryLeaks()
window.memoryManager.performGarbageCollection()
```

### Production Monitoring
- Memory usage telemetry
- Cleanup success rates
- Performance impact metrics

## Risk Mitigation

### Potential Issues
1. Performance overhead از tracking
2. Complex cleanup dependencies
3. Browser compatibility issues

### Mitigation Strategies
1. Lazy initialization و smart tracking
2. Dependency mapping و ordered cleanup
3. Feature detection و graceful degradation

---

## ادامه کار در جلسات بعدی

1. **Session 1**: Core MemoryManager + ResourceTracker
2. **Session 2**: SmartCache + basic integration
3. **Session 3**: StorageCore + ActionbarIconManager integration  
4. **Session 4**: WindowsManager + messaging integration
5. **Session 5**: Monitoring + testing + finalization

هر session باید focus روی یک phase خاص داشته باشد تا پیشرفت منظم و قابل track باشد.