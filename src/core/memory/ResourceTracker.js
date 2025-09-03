/**
 * Memory Garbage Collector - Resource Tracker
 * Provides a convenient interface for tracking resources in classes
 */
import { getMemoryManager } from './MemoryManager.js';

const isDevelopment = import.meta.env.DEV;

class ResourceTracker {
  constructor(groupId) {
    this.groupId = groupId;
    this.memoryManager = getMemoryManager();
    if (isDevelopment) {
      this.resources = new Set();
    }
  }

  /**
   * Track a timeout
   * @param {Function} callback - Callback function
   * @param {number} delay - Delay in milliseconds
   * @returns {number} Timer ID
   */
  trackTimeout(callback, delay) {
    const timerId = setTimeout(() => {
      callback();
      if (isDevelopment) {
        this.resources.delete(`timer_${timerId}`);
      }
    }, delay);

    if (isDevelopment) {
      const resourceId = `timer_${timerId}`;
      this.resources.add(resourceId);
    }
    this.memoryManager.trackTimer(timerId, this.groupId);

    return timerId;
  }

  trackInterval(callback, delay) {
    const intervalId = setInterval(callback, delay);

    if (isDevelopment) {
      const resourceId = `interval_${intervalId}`;
      this.resources.add(resourceId);
    }
    this.memoryManager.trackTimer(intervalId, this.groupId);

    return intervalId;
  }

  addEventListener(element, event, handler) {
    // The core tracking is now handled by MemoryManager, which is already environment-aware.
    // This method just needs to call the appropriate function on the element.

    // Handle custom event systems (like StorageCore with on/off methods)
    if (element && typeof element.on === 'function' && typeof element.off === 'function') {
      element.on(event, handler);
    }
    // Handle browser extension APIs (they use addListener/removeListener)
    else if (element && typeof element.addListener === 'function' && typeof element.removeListener === 'function') {
      element.addListener(handler);
    }
    // Handle DOM EventTargets
    else if (element && typeof element.addEventListener === 'function') {
      element.addEventListener(event, handler);
    }
    else if (isDevelopment) {
      console.warn('Unsupported event target type:', element);
    }

    // Let the memory manager handle the actual resource tracking
    this.memoryManager.trackEventListener(element, event, handler, this.groupId);

    if (isDevelopment) {
      const resourceId = `event_${event}_${Date.now()}`;
      this.resources.add(resourceId);
    }
  }

  trackResource(resourceId, cleanupFn) {
    if (isDevelopment) {
      this.resources.add(resourceId);
    }
    this.memoryManager.trackResource(resourceId, cleanupFn, this.groupId);
  }

  trackCache(cache, options = {}) {
    this.memoryManager.trackCache(cache, options, this.groupId);
    if (isDevelopment) {
      const resourceId = `cache_${Date.now()}`;
      this.resources.add(resourceId);
    }
  }

  clearTimer(timerId) {
    clearTimeout(timerId);
    clearInterval(timerId);
    this.memoryManager.timers.delete(timerId);
    if (isDevelopment) {
      this.resources.delete(`timer_${timerId}`);
      this.resources.delete(`interval_${timerId}`);
    }
  }

  cleanup() {
    this.memoryManager.cleanupGroup(this.groupId);
    if (isDevelopment) {
      this.resources.clear();
    }
  }

  getStats() {
    if (isDevelopment) {
      return {
        groupId: this.groupId,
        trackedResources: this.resources.size,
        memoryManagerStats: this.memoryManager.getMemoryStats()
      };
    }
    return { groupId: this.groupId, trackedResources: 0 };
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
