/**
 * Memory Garbage Collector - Core Memory Manager
 * Manages resources, timers, event listeners, and caches to prevent memory leaks
 */
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

  /**
   * Track a resource with cleanup function
   * @param {string} resourceId - Unique identifier for the resource
   * @param {Function} cleanupFn - Function to cleanup the resource
   * @param {string} groupId - Group identifier for batch cleanup
   */
  trackResource(resourceId, cleanupFn, groupId = 'default') {
    if (this.resources.has(resourceId)) {
      console.warn(`Resource ${resourceId} already tracked`)
      return
    }

    this.resources.set(resourceId, cleanupFn)

    if (!this.groups.has(groupId)) {
      this.groups.set(groupId, new Set())
    }
    this.groups.get(groupId).add(resourceId)

    this.stats.totalResources++
  }

  /**
   * Track a timer
   * @param {number} timerId - Timer ID from setTimeout/setInterval
   * @param {string} groupId - Group identifier
   */
  trackTimer(timerId, groupId = 'default') {
    this.timers.add(timerId)

    if (!this.groups.has(groupId)) {
      this.groups.set(groupId, new Set())
    }
    this.groups.get(groupId).add(`timer_${timerId}`)
  }

  /**
   * Track an event listener (handles DOM, browser APIs, and custom event systems)
   * @param {EventTarget|Object} element - Element, browser API, or custom event emitter
   * @param {string} event - Event type
   * @param {Function} handler - Event handler function
   * @param {string} groupId - Group identifier
   */
  trackEventListener(element, event, handler, groupId = 'default') {
    if (!this.eventListeners.has(element)) {
      this.eventListeners.set(element, new Map())
    }

    const elementListeners = this.eventListeners.get(element)
    if (!elementListeners.has(event)) {
      elementListeners.set(event, new Set())
    }

    elementListeners.get(event).add(handler)

    const resourceId = `event_${event}_${Date.now()}`
    this.trackResource(resourceId, () => {
      // Handle custom event systems (like StorageCore with on/off methods)
      if (element && typeof element.off === 'function') {
        try {
          element.off(event, handler)
        } catch (error) {
          console.warn('Error removing custom event listener:', error)
        }
      }
      // Handle browser extension APIs (they use removeListener)
      else if (element && typeof element.removeListener === 'function') {
        try {
          element.removeListener(handler)
        } catch (error) {
          console.warn('Error removing browser API listener:', error)
        }
      }
      // Handle DOM EventTargets
      else if (element && typeof element.removeEventListener === 'function') {
        try {
          element.removeEventListener(event, handler)
        } catch (error) {
          console.warn('Error removing DOM event listener:', error)
        }
      }
    }, groupId)
  }

  /**
   * Track a cache instance
   * @param {Object} cache - Cache instance with destroy method
   * @param {Object} options - Cache options
   * @param {string} groupId - Group identifier
   */
  trackCache(cache, options = {}, groupId = 'default') {
    this.caches.add(cache)

    const resourceId = `cache_${Date.now()}`
    this.trackResource(resourceId, () => {
      if (cache.destroy && typeof cache.destroy === 'function') {
        cache.destroy()
      }
    }, groupId)
  }

  /**
   * Cleanup a specific resource
   * @param {string} resourceId - Resource identifier
   */
  cleanupResource(resourceId) {
    const cleanupFn = this.resources.get(resourceId)
    if (cleanupFn) {
      try {
        cleanupFn()
        this.resources.delete(resourceId)
        this.stats.cleanupCount++

        // Remove from groups
        for (const [groupId, resourceIds] of this.groups) {
          resourceIds.delete(resourceId)
          if (resourceIds.size === 0) {
            this.groups.delete(groupId)
          }
        }
      } catch (error) {
        console.error(`Error cleaning up resource ${resourceId}:`, error)
      }
    }
  }

  /**
   * Cleanup all resources in a group
   * @param {string} groupId - Group identifier
   */
  cleanupGroup(groupId) {
    const resourceIds = this.groups.get(groupId)
    if (resourceIds) {
      const idsToCleanup = Array.from(resourceIds)
      idsToCleanup.forEach(resourceId => {
        if (resourceId.startsWith('timer_')) {
          const timerId = parseInt(resourceId.replace('timer_', ''))
          clearTimeout(timerId)
          clearInterval(timerId)
          this.timers.delete(timerId)
        } else {
          this.cleanupResource(resourceId)
        }
      })
      this.groups.delete(groupId)
    }
  }

  /**
   * Cleanup all resources
   */
  cleanupAll() {
    // Clear all timers
    this.timers.forEach(timerId => {
      clearTimeout(timerId)
      clearInterval(timerId)
    })
    this.timers.clear()

    // Clear all event listeners
    if (this.eventListeners) {
      // Instead of reassigning, clear the existing WeakMap
      // Note: WeakMap doesn't have a clear() method, so we need to recreate it
      this.eventListeners = new WeakMap()
    }

    // Cleanup all resources
    const allResourceIds = Array.from(this.resources.keys())
    allResourceIds.forEach(resourceId => this.cleanupResource(resourceId))

    // Clear caches
    this.caches.forEach(cache => {
      if (cache.destroy && typeof cache.destroy === 'function') {
        try {
          cache.destroy()
        } catch (error) {
          console.warn('Error destroying cache:', error)
        }
      }
    })
    this.caches.clear()

    this.groups.clear()
  }

  /**
   * Perform garbage collection
   */
  performGarbageCollection() {
    // Force garbage collection if available (development only)
    if (window.gc && typeof window.gc === 'function') {
      window.gc()
    }

    // Cleanup expired resources
    this.cleanupAll()

    // Update memory stats
    this.updateMemoryStats()
  }

  /**
   * Get memory statistics
   */
  getMemoryStats() {
    this.updateMemoryStats()
    return {
      ...this.stats,
      activeResources: this.resources.size,
      activeGroups: this.groups.size,
      activeTimers: this.timers.size,
      activeCaches: this.caches.size
    }
  }

  /**
   * Update memory usage statistics
   */
  updateMemoryStats() {
    if (performance.memory) {
      this.stats.memoryUsage = performance.memory.usedJSHeapSize
    }
  }

  /**
   * Detect potential memory leaks
   */
  detectMemoryLeaks() {
    const stats = this.getMemoryStats()
    const warnings = []

    if (stats.activeResources > 100) {
      warnings.push(`High number of active resources: ${stats.activeResources}`)
    }

    if (stats.activeTimers > 20) {
      warnings.push(`High number of active timers: ${stats.activeTimers}`)
    }

    if (stats.memoryUsage > 100 * 1024 * 1024) { // 100MB
      warnings.push(`High memory usage: ${(stats.memoryUsage / 1024 / 1024).toFixed(2)}MB`)
    }

    return warnings
  }

  /**
   * Generate detailed report
   */
  generateReport() {
    const stats = this.getMemoryStats()
    const leaks = this.detectMemoryLeaks()

    return {
      timestamp: new Date().toISOString(),
      stats,
      warnings: leaks,
      resources: Array.from(this.resources.keys()),
      groups: Array.from(this.groups.keys()),
      timers: Array.from(this.timers),
      caches: this.caches.size
    }
  }
}

// Singleton instance
let memoryManagerInstance = null

/**
 * Get the global memory manager instance
 */
export function getMemoryManager() {
  if (!memoryManagerInstance) {
    memoryManagerInstance = new MemoryManager()
  }
  return memoryManagerInstance
}

export default MemoryManager
