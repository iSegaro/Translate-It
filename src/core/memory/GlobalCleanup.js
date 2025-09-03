/**
 * Memory Garbage Collector - Global Cleanup Hooks
 * Sets up global cleanup hooks for extension lifecycle events
 */
import { getMemoryManager } from './MemoryManager.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'GlobalCleanup')

class GlobalCleanup {
  constructor() {
    this.memoryManager = getMemoryManager()
    this.gcInterval = null
    this.isInitialized = false
  }

  /**
   * Initialize global cleanup hooks
   */
  initialize() {
    if (this.isInitialized) return

    this.setupHooks()
    this.isInitialized = true
    logger.init('Global cleanup hooks initialized')
  }

  /**
   * Setup all cleanup hooks
   */
  setupHooks() {
    // Check if we're in a window environment (content script) or service worker (background)
    const globalObject = typeof window !== 'undefined' ? window : self

    // Before unload cleanup (only available in window environments)
    if (typeof window !== 'undefined') {
      this.addEventListener(window, 'beforeunload', () => {
        logger.debug('Before unload cleanup triggered')
        this.memoryManager.cleanupAll()
      })
    } else {
      // In service worker, listen for service worker termination
      logger.debug('Service worker environment detected, skipping beforeunload listener')
    }

    // Extension context invalidation cleanup
    if (browser?.runtime?.onConnect) {
      const connectHandler = () => {
        // Check if context is still valid
        if (this.isContextInvalid()) {
          logger.debug('Extension context invalidated, cleaning up')
          this.memoryManager.cleanupAll()
        }
      }
      browser.runtime.onConnect.addListener(connectHandler)
      this.memoryManager.trackEventListener(browser.runtime.onConnect, 'connect', connectHandler, 'global-cleanup')
    }

    // Periodic garbage collection (every 5 minutes)
    this.gcInterval = setInterval(() => {
      logger.debug('Periodic garbage collection triggered')
      this.memoryManager.performGarbageCollection()
    }, 5 * 60 * 1000)

    // Track the GC interval
    this.memoryManager.trackTimer(this.gcInterval, 'global-cleanup')
  }

  /**
   * Add tracked event listener (handles both DOM and browser extension APIs)
   * @param {EventTarget|Object} target - Event target or browser API object
   * @param {string} event - Event type
   * @param {Function} handler - Event handler
   */
  addEventListener(target, event, handler) {
    // Handle browser extension APIs (they use addListener instead of addEventListener)
    if (target && typeof target.addListener === 'function' && typeof target.removeListener === 'function') {
      target.addListener(handler)
      this.memoryManager.trackEventListener(target, event, handler, 'global-cleanup')
    }
    // Handle DOM EventTargets
    else if (target && typeof target.addEventListener === 'function') {
      target.addEventListener(event, handler)
      this.memoryManager.trackEventListener(target, event, handler, 'global-cleanup')
    }
    else {
      logger.warn('Unsupported event target type:', target)
    }
  }

  /**
   * Check if extension context is still valid
   * @returns {boolean} True if context is invalid
   */
  isContextInvalid() {
    try {
      // Try to access extension API
      if (browser?.runtime?.getURL) {
        browser.runtime.getURL('')
        return false
      }
      return true
    } catch (error) {
      logger.debug('Extension context check failed:', error)
      return true
    }
  }

  /**
   * Force cleanup all resources
   */
  forceCleanup() {
    logger.debug('Force cleanup triggered')
    this.memoryManager.cleanupAll()
  }

  /**
   * Get cleanup statistics
   */
  getStats() {
    return {
      isInitialized: this.isInitialized,
      gcIntervalActive: this.gcInterval !== null,
      memoryStats: this.memoryManager.getMemoryStats()
    }
  }

  /**
   * Destroy global cleanup and clear all hooks
   */
  destroy() {
    if (this.gcInterval) {
      clearInterval(this.gcInterval)
      this.gcInterval = null
    }

    this.memoryManager.cleanupGroup('global-cleanup')
    this.isInitialized = false
    logger.debug('Global cleanup destroyed')
  }
}

// Singleton instance
let globalCleanupInstance = null

/**
 * Get the global cleanup instance
 */
export function getGlobalCleanup() {
  if (!globalCleanupInstance) {
    globalCleanupInstance = new GlobalCleanup()
  }
  return globalCleanupInstance
}

/**
 * Initialize global cleanup hooks
 */
export function initializeGlobalCleanup() {
  const cleanup = getGlobalCleanup()
  cleanup.initialize()
  return cleanup
}

export default GlobalCleanup
