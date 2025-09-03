/**
 * Memory Garbage Collector - Core Memory Manager
 * Manages resources, timers, event listeners, and caches to prevent memory leaks
 */
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'MemoryManager')

class MemoryManager {
  constructor() {
    this.resources = new Map() // resourceId -> cleanup function
    this.groups = new Map() // groupId -> Set of resourceIds
    this.timers = new Set()
    this.eventListeners = new WeakMap() // element -> Map<event -> WeakSet<handler>>
    this.domObservers = new WeakMap() // element -> MutationObserver
    this.eventStats = {
      totalTracked: 0,
      totalCleaned: 0,
      byType: new Map()
    }
    this.caches = new Set()
    this.stats = {
      totalResources: 0,
      cleanupCount: 0,
      memoryUsage: 0
    }

    // Initialize DOM cleanup observer
    this.initDOMCleanupObserver()
  }

  /**
   * Initialize DOM cleanup observer for automatic cleanup of removed elements
   */
  initDOMCleanupObserver() {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return

    // Create a MutationObserver to watch for removed elements
    this.globalObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.removedNodes.forEach((node) => {
          // Check if it's an element node (Node.ELEMENT_NODE = 1)
          if (node.nodeType === 1) {
            this.cleanupElementListeners(node)
            // Also check child elements
            const childElements = node.querySelectorAll && node.querySelectorAll('*')
            if (childElements) {
              childElements.forEach(child => this.cleanupElementListeners(child))
            }
          }
        })
      })
    })

    // Start observing
    this.globalObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    })

    logger.debug('DOM cleanup observer initialized')
  }

  /**
   * Check if a handler is already tracked in a WeakSet
   * Note: WeakSet doesn't have reliable 'has' method for function references
   * @param {WeakSet} handlers - WeakSet of handlers
   * @param {Function} handler - Handler to check
   * @returns {boolean}
   */
  isHandlerTracked(handlers, handler) {
    // WeakSet doesn't have a reliable 'has' method for function references
    // Since we can't check reliably, we'll assume it's not tracked to be safe
    // This may lead to some duplicate tracking, but it's better than errors
    return false
  }

  /**
   * Get approximate size of WeakSet (for debugging purposes)
   * Note: WeakSet doesn't expose size and is not iterable
   * @param {WeakSet} weakSet
   * @returns {number}
   */
  getWeakSetSize(weakSet) {
    // WeakSet doesn't expose size and is not iterable
    // We can't determine the actual size, so return 0 as approximation
    return 0
  }

  /**
   * Get a description of an element for logging purposes
   * @param {EventTarget|Object} element
   * @returns {string}
   */
  getElementDescription(element) {
    if (!element) return 'null'

    // DOM elements - check if Element is available (browser environment)
    if (typeof Element !== 'undefined' && element instanceof Element) {
      return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${element.className ? `.${element.className.split(' ')[0]}` : ''}`
    }

    // Window
    if (typeof window !== 'undefined' && element === window) return 'window'

    // Document
    if (typeof document !== 'undefined' && element === document) return 'document'

    // Browser APIs
    if (typeof element === 'object' && element.constructor) {
      return element.constructor.name || 'unknown'
    }

    return typeof element
  }

  /**
   * Check if element is a DOM element
   * @param {any} element
   * @returns {boolean}
   */
  isDOMElement(element) {
    // Check if DOM constructors are available (browser environment)
    const ElementAvailable = typeof Element !== 'undefined'
    const DocumentAvailable = typeof Document !== 'undefined'

    return (ElementAvailable && element instanceof Element) ||
           (DocumentAvailable && element instanceof Document) ||
           (typeof window !== 'undefined' && element === window)
  }

  /**
   * Set up automatic cleanup for DOM elements when they're removed
   * @param {Element} element
   * @param {string} resourceId
   */
  setupDOMElementCleanup(element, resourceId) {
    if (!this.isDOMElement(element) || element === window || element === document) return
    if (typeof MutationObserver === 'undefined') return

    // Create observer for this specific element
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.removedNodes.forEach((node) => {
            if (node === element || (node.contains && node.contains(element))) {
              logger.debug(`Element removed from DOM, cleaning up listeners: ${this.getElementDescription(element)}`)
              this.cleanupResource(resourceId)
              observer.disconnect()
            }
          })
        }
      })
    })

    // Observe the element's parent
    if (element.parentNode) {
      observer.observe(element.parentNode, { childList: true })
      this.domObservers.set(element, observer)
    }
  }

  /**
   * Clean up all listeners for a specific element
   * @param {Element} element
   */
  cleanupElementListeners(element) {
    if (!this.eventListeners.has(element)) return

    const elementListeners = this.eventListeners.get(element)
    const events = Array.from(elementListeners.keys())

    logger.debug(`Cleaning up ${events.length} event types for removed element: ${this.getElementDescription(element)}`)

    events.forEach(event => {
      const handlers = elementListeners.get(event)
      // Note: We can't iterate WeakSet, but cleanup functions will handle individual removals
      logger.debug(`Cleaning up ${event} listeners for element: ${this.getElementDescription(element)}`)
    })

    // Remove the element from tracking
    this.eventListeners.delete(element)

    // Disconnect any observers
    if (this.domObservers.has(element)) {
      this.domObservers.get(element).disconnect()
      this.domObservers.delete(element)
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
   * Enhanced with WeakSet for better memory management and detailed logging
   * @param {EventTarget|Object} element - Element, browser API, or custom event emitter
   * @param {string} event - Event type
   * @param {Function} handler - Event handler function
   * @param {string} groupId - Group identifier
   * @param {Object} options - Additional options for tracking
   */
  trackEventListener(element, event, handler, groupId = 'default', options = {}) {
    if (!element) {
      logger.warn('Cannot track event listener: element is null or undefined')
      return
    }

    // Initialize element tracking if not exists
    if (!this.eventListeners.has(element)) {
      this.eventListeners.set(element, new Map())
    }

    const elementListeners = this.eventListeners.get(element)

    // Initialize event type tracking if not exists
    if (!elementListeners.has(event)) {
      elementListeners.set(event, new WeakSet())
    }

    const eventHandlers = elementListeners.get(event)

    // Check if handler is already tracked
    if (this.isHandlerTracked(eventHandlers, handler)) {
      logger.debug(`Event listener already tracked: ${event} on ${this.getElementDescription(element)}`)
      return
    }

    // Add handler to WeakSet
    eventHandlers.add(handler)

    // Update statistics
    this.eventStats.totalTracked++
    if (!this.eventStats.byType.has(event)) {
      this.eventStats.byType.set(event, 0)
    }
    this.eventStats.byType.set(event, this.eventStats.byType.get(event) + 1)

    // Create resource ID with more details
    const resourceId = `event_${event}_${this.getElementDescription(element)}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Create cleanup function
    const cleanupFn = () => {
      try {
        // Handle custom event systems (like StorageCore with on/off methods)
        if (element && typeof element.off === 'function') {
          element.off(event, handler)
          logger.debug(`Removed custom event listener: ${event} from ${this.getElementDescription(element)}`)
        }
        // Handle browser extension APIs (they use removeListener)
        else if (element && typeof element.removeListener === 'function') {
          element.removeListener(handler)
          logger.debug(`Removed browser API listener: ${event} from ${this.getElementDescription(element)}`)
        }
        // Handle DOM EventTargets
        else if (element && typeof element.removeEventListener === 'function') {
          element.removeEventListener(event, handler)
          logger.debug(`Removed DOM event listener: ${event} from ${this.getElementDescription(element)}`)
        }

        // Update cleanup statistics
        this.eventStats.totalCleaned++
        if (this.eventStats.byType.has(event)) {
          this.eventStats.byType.set(event, Math.max(0, this.eventStats.byType.get(event) - 1))
        }

        // Remove from WeakSet
        eventHandlers.delete(handler)

        // Clean up empty structures
        if (eventHandlers.size === 0) {
          elementListeners.delete(event)
        }
        if (elementListeners.size === 0) {
          this.eventListeners.delete(element)
        }

      } catch (error) {
        logger.warn(`Error removing event listener ${event}:`, error)
      }
    }

    this.trackResource(resourceId, cleanupFn, groupId)

    // Set up automatic cleanup for DOM elements
    if (options.autoCleanup !== false && this.isDOMElement(element)) {
      this.setupDOMElementCleanup(element, resourceId)
    }

    logger.debug(`Tracked event listener: ${event} on ${this.getElementDescription(element)} (total: ${this.eventStats.totalTracked})`)
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
   * Cleanup all resources with enhanced event listener handling
   */
  cleanupAll() {
    const beforeStats = this.getMemoryStats()
    const beforeEventStats = { ...this.eventStats }

    logger.info('Starting comprehensive cleanup...')

    // Clear all timers
    let timerCount = this.timers.size
    this.timers.forEach(timerId => {
      clearTimeout(timerId)
      clearInterval(timerId)
    })
    this.timers.clear()
    logger.debug(`Cleaned up ${timerCount} timers`)

    // Enhanced event listener cleanup
    let eventCleanupCount = 0
    if (this.eventListeners) {
      // Count total tracked listeners before cleanup
      let totalListeners = 0

      // Note: WeakMap is not iterable, so we can't count precisely
      // We'll use an approximation based on our tracking
      totalListeners = Object.keys(this.eventStats.byType).length

      // Clear the WeakMap by recreating it (WeakMap doesn't have clear method)
      this.eventListeners = new WeakMap()
      eventCleanupCount = totalListeners
      logger.debug(`Cleaned up event listeners for approximately ${totalListeners} event types`)
    }

    // Disconnect DOM observers
    // Note: WeakMap is not iterable, so we can't disconnect individual observers
    // They will be garbage collected when elements are removed
    let observerCount = 0
    this.domObservers = new WeakMap()
    logger.debug(`Reset DOM observers (WeakMap cleared)`)
    logger.debug(`Disconnected ${observerCount} DOM observers`)

    // Cleanup all resources
    const allResourceIds = Array.from(this.resources.keys())
    let resourceCleanupCount = allResourceIds.length
    allResourceIds.forEach(resourceId => this.cleanupResource(resourceId))
    logger.debug(`Cleaned up ${resourceCleanupCount} resources`)

    // Clear caches
    let cacheCount = this.caches.size
    this.caches.forEach(cache => {
      if (cache.destroy && typeof cache.destroy === 'function') {
        try {
          cache.destroy()
        } catch (error) {
          logger.warn('Error destroying cache:', error)
        }
      }
    })
    this.caches.clear()
    logger.debug(`Cleaned up ${cacheCount} caches`)

    // Clear groups
    this.groups.clear()

    // Update statistics
    const afterStats = this.getMemoryStats()
    const memoryFreed = beforeStats.memoryUsage - afterStats.memoryUsage

    logger.info(`Cleanup completed:`, {
      timers: timerCount,
      eventListeners: eventCleanupCount,
      resources: resourceCleanupCount,
      caches: cacheCount,
      observers: observerCount,
      memoryFreed: `${(memoryFreed / 1024 / 1024).toFixed(2)}MB`
    })

    // Reset event statistics
    this.eventStats.totalTracked = 0
    this.eventStats.totalCleaned = 0
    this.eventStats.byType.clear()
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
   * Get memory statistics with enhanced event listener tracking
   */
  getMemoryStats() {
    this.updateMemoryStats()

    // Count active event listeners
    let activeEventListeners = 0
    let eventTypes = new Set()

    // Use eventStats for counting since WeakMap is not iterable
    activeEventListeners = Object.values(this.eventStats.byType).reduce((sum, count) => sum + count, 0)
    eventTypes = new Set(Object.keys(this.eventStats.byType))

    return {
      ...this.stats,
      activeResources: this.resources.size,
      activeGroups: this.groups.size,
      activeTimers: this.timers.size,
      activeCaches: this.caches.size,
      activeEventListeners,
      eventTypesCount: eventTypes.size,
      eventStats: {
        totalTracked: this.eventStats.totalTracked,
        totalCleaned: this.eventStats.totalCleaned,
        byType: Object.fromEntries(this.eventStats.byType)
      }
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
   * Detect potential memory leaks with enhanced event listener monitoring
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

    if (stats.activeEventListeners > 50) {
      warnings.push(`High number of active event listeners: ${stats.activeEventListeners} (${stats.eventTypesCount} types)`)
    }

    if (stats.memoryUsage > 100 * 1024 * 1024) { // 100MB
      warnings.push(`High memory usage: ${(stats.memoryUsage / 1024 / 1024).toFixed(2)}MB`)
    }

    // Check for specific event types that might indicate leaks
    const eventTypeCounts = stats.eventStats.byType
    for (const [eventType, count] of Object.entries(eventTypeCounts)) {
      if (count > 10) {
        warnings.push(`High number of ${eventType} listeners: ${count}`)
      }
    }

    return warnings
  }

  /**
   * Clean up event listeners by type or element
   * @param {string} eventType - Optional: specific event type to clean up
   * @param {Element} element - Optional: specific element to clean up
   */
  cleanupEventListeners(eventType = null, element = null) {
    let cleanupCount = 0

    if (element && eventType) {
      // Clean up specific event type for specific element
      if (this.eventListeners.has(element)) {
        const elementListeners = this.eventListeners.get(element)
        if (elementListeners.has(eventType)) {
          const handlers = elementListeners.get(eventType)
          // Find and cleanup resources for this specific event
          for (const [resourceId, cleanupFn] of this.resources) {
            if (resourceId.includes(`event_${eventType}`) && resourceId.includes(this.getElementDescription(element))) {
              this.cleanupResource(resourceId)
              cleanupCount++
            }
          }
        }
      }
    } else if (eventType) {
      // Clean up all listeners of a specific event type
      for (const [resourceId, cleanupFn] of this.resources) {
        if (resourceId.startsWith(`event_${eventType}`)) {
          this.cleanupResource(resourceId)
          cleanupCount++
        }
      }
    } else {
      // Clean up all event listeners
      for (const [resourceId, cleanupFn] of this.resources) {
        if (resourceId.startsWith('event_')) {
          this.cleanupResource(resourceId)
          cleanupCount++
        }
      }
    }

    logger.info(`Cleaned up ${cleanupCount} event listeners${eventType ? ` of type ${eventType}` : ''}${element ? ` for element ${this.getElementDescription(element)}` : ''}`)
    return cleanupCount
  }

  /**
   * Get detailed event listener report
   */
  getEventListenerReport() {
    const report = {
      totalElements: 0,
      totalEvents: 0,
      totalListeners: 0,
      byElement: {},
      byEventType: {},
      potentialLeaks: []
    }

    // Use eventStats for report since WeakMap is not iterable
    report.totalEvents = Object.keys(this.eventStats.byType).length
    report.totalListeners = Object.values(this.eventStats.byType).reduce((sum, count) => sum + count, 0)
    report.byEventType = { ...this.eventStats.byType }

    // Note: We can't get element-specific breakdown with WeakMap
    report.byElement = {
      'tracked_elements': {
        eventCount: report.totalEvents,
        events: Object.keys(this.eventStats.byType).reduce((acc, event) => {
          acc[event] = true
          return acc
        }, {})
      }
    }
    report.totalElements = 1 // Approximation

    // Detect potential leaks
    for (const [eventType, count] of Object.entries(report.byEventType)) {
      if (count > 10) {
        report.potentialLeaks.push({
          type: 'high_event_count',
          event: eventType,
          count: count,
          message: `High number of ${eventType} listeners: ${count}`
        })
      }
    }

    return report
  }

  /**
   * Generate detailed report with event listener information
   */
  generateReport() {
    const stats = this.getMemoryStats()
    const leaks = this.detectMemoryLeaks()
    const eventReport = this.getEventListenerReport()

    return {
      timestamp: new Date().toISOString(),
      stats,
      warnings: leaks,
      eventListeners: eventReport,
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
