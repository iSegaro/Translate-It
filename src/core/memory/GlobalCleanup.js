/**
 * Memory Garbage Collector - Global Cleanup Hooks
 * Sets up global cleanup hooks for extension lifecycle events
 */
import { getMemoryManager } from './MemoryManager.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { MEMORY_TIMING } from './constants.js'
import browser from 'webextension-polyfill'

const logger = getScopedLogger(LOG_COMPONENTS.MEMORY, 'GlobalCleanup')

class GlobalCleanup {
  constructor(options = {}) {
    this.memoryManager = getMemoryManager()
    this.gcInterval = null
    this.isInitialized = false
    this.useCentralGC = options.useCentralGC !== false

    // Only initialize individual GC if not using centralized system
    if (!this.useCentralGC) {
      this.initPeriodicGC()
    }
  }

  /**
   * Initialize periodic garbage collection (fallback when not using centralized)
   */
  initPeriodicGC() {
    if (this.gcInterval) return

    this.gcInterval = setInterval(() => {
      logger.debug('Periodic garbage collection triggered')
      this.memoryManager.performGarbageCollection()
    }, MEMORY_TIMING.GC_INTERVAL)

    // Track the GC interval
    this.memoryManager.trackTimer(this.gcInterval, 'global-cleanup')
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
    // const globalObject = typeof window !== 'undefined' ? window : self

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
          logger.debug('Extension context invalidated, cleaning up (skipping critical caches)')
          this.memoryManager.cleanupAll()
        }
      }
      browser.runtime.onConnect.addListener(connectHandler)
      this.memoryManager.trackEventListener(browser.runtime.onConnect, 'connect', connectHandler, 'global-cleanup')
    }

    // Use centralized timer for periodic garbage collection
    if (this.memoryManager && typeof this.memoryManager.initCentralTimer === 'function') {
      // Centralized timer is already initialized in MemoryManager constructor
      logger.debug('Using centralized timer for periodic garbage collection')
    } else {
      // Fallback to local timer if centralized system not available
      this.gcInterval = setInterval(() => {
        logger.debug('Periodic garbage collection triggered (fallback timer)')
        this.memoryManager.performGarbageCollection()
      }, MEMORY_TIMING.GC_INTERVAL)

      // Track the GC interval
      this.memoryManager.trackTimer(this.gcInterval, 'global-cleanup')
    }
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

    // Stop centralized GC if using it
    if (this.useCentralGC) {
      this.memoryManager.stopCentralTimer()
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
 * @param {Object} options - Configuration options
 */
export function getGlobalCleanup(options = {}) {
  if (!globalCleanupInstance) {
    const defaultOptions = {
      useCentralGC: true,
      ...options
    }
    globalCleanupInstance = new GlobalCleanup(defaultOptions)
  }
  return globalCleanupInstance
}

/**
 * Initialize global cleanup hooks
 * @param {Object} options - Configuration options
 */
export function initializeGlobalCleanup(options = {}) {
  const cleanup = getGlobalCleanup(options)
  cleanup.initialize()
  return cleanup
}

export default GlobalCleanup
