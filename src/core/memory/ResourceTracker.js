/**
 * Memory Garbage Collector - Resource Tracker
 * Provides a convenient interface for tracking resources in classes
 */
import { getMemoryManager } from './MemoryManager.js';
import { getScopedLogger } from '../../shared/logging/logger.js';
import { LOG_COMPONENTS } from '../../shared/logging/logConstants.js';
import { isDevelopmentMode } from '../../shared/utils/environment.js';

const isDevelopment = isDevelopmentMode();

// Helper function to check if debugging features should be enabled
const shouldEnableDebugging = () => {
  // In production, only enable debugging if explicitly requested
  if (!isDevelopment) {
    return typeof globalThis !== 'undefined' && globalThis.__MEMORY_DEBUG__ === true;
  }
  // In development, always enable debugging
  return true;
};

class ResourceTracker {
  constructor(groupId) {
    this.groupId = groupId;
    this.memoryManager = getMemoryManager();
    this.logger = getScopedLogger(LOG_COMPONENTS.MEMORY, `ResourceTracker:${groupId}`);
    if (shouldEnableDebugging()) {
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
      if (shouldEnableDebugging()) {
        this.resources.delete(`timer_${timerId}`);
      }
    }, delay);

    if (shouldEnableDebugging()) {
      const resourceId = `timer_${timerId}`;
      this.resources.add(resourceId);
    }
    this.memoryManager.trackTimer(timerId, this.groupId);

    return timerId;
  }

  trackInterval(callback, delay) {
    const intervalId = setInterval(callback, delay);

    if (shouldEnableDebugging()) {
      const resourceId = `interval_${intervalId}`;
      this.resources.add(resourceId);
    }
    this.memoryManager.trackTimer(intervalId, this.groupId);

    return intervalId;
  }

  addEventListener(element, event, handler, options = null) {
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
      if (options) {
        element.addEventListener(event, handler, options);
      } else {
        element.addEventListener(event, handler);
      }
    }
    else if (shouldEnableDebugging()) {
      this.logger.warn('Unsupported event target type:', element);
    }

    // Let the memory manager handle the actual resource tracking
    this.memoryManager.trackEventListener(element, event, handler, this.groupId);

    if (shouldEnableDebugging()) {
      const resourceId = `event_${event}_${Date.now()}`;
      this.resources.add(resourceId);
    }
  }

  trackResource(resourceId, cleanupFn) {
    if (shouldEnableDebugging()) {
      this.resources.add(resourceId);
    }
    this.memoryManager.trackResource(resourceId, cleanupFn, this.groupId);
  }

  trackCache(cache, options = {}) {
    this.memoryManager.trackCache(cache, options, this.groupId);
    if (shouldEnableDebugging()) {
      const resourceId = `cache_${Date.now()}`;
      this.resources.add(resourceId);
    }
  }

  clearTimer(timerId) {
    clearTimeout(timerId);
    clearInterval(timerId);
    this.memoryManager.timers.delete(timerId);
    if (shouldEnableDebugging()) {
      this.resources.delete(`timer_${timerId}`);
      this.resources.delete(`interval_${timerId}`);
    }
  }

  cleanup() {
    this.memoryManager.cleanupGroup(this.groupId);
    if (shouldEnableDebugging()) {
      this.resources.clear();
    }
  }

  getStats() {
    if (shouldEnableDebugging()) {
      return {
        groupId: this.groupId,
        trackedResources: this.resources ? this.resources.size : 0,
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
