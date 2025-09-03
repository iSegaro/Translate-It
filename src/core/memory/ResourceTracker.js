/**
 * Memory Garbage Collector - Resource Tracker
 * Provides a convenient interface for tracking resources in classes
 */
import { getMemoryManager } from './MemoryManager.js'

class ResourceTracker {
  constructor(groupId) {
    this.groupId = groupId
    this.memoryManager = getMemoryManager()
    this.resources = new Set()
  }

  /**
   * Track a timeout
   * @param {Function} callback - Callback function
   * @param {number} delay - Delay in milliseconds
   * @returns {number} Timer ID
   */
  trackTimeout(callback, delay) {
    const timerId = setTimeout(() => {
      callback()
      this.resources.delete(`timer_${timerId}`)
    }, delay)

    const resourceId = `timer_${timerId}`
    this.resources.add(resourceId)
    this.memoryManager.trackTimer(timerId, this.groupId)

    return timerId
  }

  /**
   * Track an interval
   * @param {Function} callback - Callback function
   * @param {number} delay - Delay in milliseconds
   * @returns {number} Timer ID
   */
  trackInterval(callback, delay) {
    const intervalId = setInterval(callback, delay)

    const resourceId = `interval_${intervalId}`
    this.resources.add(resourceId)
    this.memoryManager.trackTimer(intervalId, this.groupId)

    return intervalId
  }

  /**
   * Add tracked event listener (handles DOM, browser APIs, and custom event systems)
   * @param {EventTarget|Object} element - Element, browser API, or custom event emitter
   * @param {string} event - Event type
   * @param {Function} handler - Event handler
   */
  addEventListener(element, event, handler) {
    // Handle custom event systems (like StorageCore with on/off methods)
    if (element && typeof element.on === 'function' && typeof element.off === 'function') {
      element.on(event, handler)
      this.memoryManager.trackEventListener(element, event, handler, this.groupId)
    }
    // Handle browser extension APIs (they use addListener/removeListener)
    else if (element && typeof element.addListener === 'function' && typeof element.removeListener === 'function') {
      element.addListener(handler)
      this.memoryManager.trackEventListener(element, event, handler, this.groupId)
    }
    // Handle DOM EventTargets
    else if (element && typeof element.addEventListener === 'function') {
      element.addEventListener(event, handler)
      this.memoryManager.trackEventListener(element, event, handler, this.groupId)
    }
    else {
      console.warn('Unsupported event target type:', element)
    }

    const resourceId = `event_${event}_${Date.now()}`
    this.resources.add(resourceId)
  }

  /**
   * Track a custom resource
   * @param {string} resourceId - Unique resource identifier
   * @param {Function} cleanupFn - Cleanup function
   */
  trackResource(resourceId, cleanupFn) {
    this.resources.add(resourceId)
    this.memoryManager.trackResource(resourceId, cleanupFn, this.groupId)
  }

  /**
   * Track a cache instance
   * @param {Object} cache - Cache instance
   * @param {Object} options - Cache options
   */
  trackCache(cache, options = {}) {
    this.memoryManager.trackCache(cache, options, this.groupId)
    const resourceId = `cache_${Date.now()}`
    this.resources.add(resourceId)
  }

  /**
   * Clear a specific timer
   * @param {number} timerId - Timer ID to clear
   */
  clearTimer(timerId) {
    clearTimeout(timerId)
    clearInterval(timerId)
    this.memoryManager.timers.delete(timerId)
    this.resources.delete(`timer_${timerId}`)
    this.resources.delete(`interval_${timerId}`)
  }

  /**
   * Cleanup all resources tracked by this instance
   */
  cleanup() {
    this.memoryManager.cleanupGroup(this.groupId)
    this.resources.clear()
  }

  /**
   * Get statistics for this tracker
   */
  getStats() {
    return {
      groupId: this.groupId,
      trackedResources: this.resources.size,
      memoryManagerStats: this.memoryManager.getMemoryStats()
    }
  }

  /**
   * Destroy this tracker and cleanup all resources
   */
  destroy() {
    this.cleanup()
    this.memoryManager = null
    this.resources = null
  }
}

export default ResourceTracker
